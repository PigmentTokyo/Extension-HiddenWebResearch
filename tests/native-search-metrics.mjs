#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { extractGeminiGroundedAnswer } from '../gemini-grounding.js';

const SCHEMA_VERSION = 1;
const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const PROVIDERS = new Set(['auto', 'claude', 'gemini']);
const SAFE_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/u;
const CLAUDE_STOP_REASONS = new Set([
    'end_turn',
    'max_tokens',
    'model_context_window_exceeded',
    'pause_turn',
    'refusal',
    'stop_sequence',
    'tool_use',
]);
const GEMINI_FINISH_REASONS = new Set([
    'BLOCKLIST',
    'FINISH_REASON_UNSPECIFIED',
    'IMAGE_OTHER',
    'IMAGE_PROHIBITED_CONTENT',
    'IMAGE_RECITATION',
    'IMAGE_SAFETY',
    'LANGUAGE',
    'LENGTH',
    'MALFORMED_FUNCTION_CALL',
    'MAX_TOKENS',
    'OTHER',
    'PROHIBITED_CONTENT',
    'RECITATION',
    'SAFETY',
    'SPII',
    'STOP',
    'UNEXPECTED_TOOL_CALL',
]);

function codePointLength(value) {
    return [...String(value || '')].length;
}

function utf8Length(value) {
    return Buffer.byteLength(String(value || ''), 'utf8');
}

function fingerprint(value) {
    return createHash('sha256').update(String(value || ''), 'utf8').digest('hex').slice(0, 16);
}

function safeIdentifier(value) {
    const text = String(value || '');
    if (!text || !SAFE_IDENTIFIER.test(text)) return '';
    if (/^(?:sk-|key-|token-)/iu.test(text)) return '';
    return text;
}

function safeCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
}

function queryMetric(query, order) {
    const value = String(query || '');
    return {
        order,
        fingerprint: fingerprint(value),
        codePoints: codePointLength(value),
        utf8Bytes: utf8Length(value),
        whitespaceTerms: value.trim() ? value.trim().split(/\s+/u).length : 0,
    };
}

function collectQueries(input) {
    const candidates = [
        input?.query,
        input?.search_query,
        ...(Array.isArray(input?.queries) ? input.queries : []),
    ];
    return candidates.filter(value => typeof value === 'string' && value.trim());
}

function countKnownType(target, value, knownTypes) {
    const type = knownTypes.has(value) ? value : 'other';
    target[type] = (target[type] || 0) + 1;
}

function findEnvelope(raw, detector) {
    const candidates = [
        raw,
        raw?.response,
        raw?.data,
        raw?.result,
        raw?.body,
        raw?.rawResponse,
    ];
    return candidates.find(candidate => candidate && typeof candidate === 'object' && detector(candidate)) || raw;
}

function findClaudeEnvelope(raw) {
    return findEnvelope(raw, candidate => (
        Array.isArray(candidate?.content)
        || candidate?.stop_reason !== undefined
        || candidate?.usage?.server_tool_use !== undefined
    ));
}

function findGeminiEnvelope(raw) {
    return findEnvelope(raw, candidate => (
        Array.isArray(candidate?.candidates)
        || candidate?.groundingMetadata !== undefined
        || candidate?.usageMetadata !== undefined
        || candidate?.responseContent?.parts !== undefined
    ));
}

function requestEnvelope(raw) {
    const request = raw?.request ?? raw?.requestBody ?? raw?.input ?? null;
    return request && typeof request === 'object' ? request : raw;
}

function extractClaudeToolVersions(raw) {
    const request = requestEnvelope(raw);
    const tools = [
        ...(Array.isArray(request?.tools) ? request.tools : []),
        ...(request !== raw && Array.isArray(raw?.tools) ? raw.tools : []),
    ];
    return [...new Set(
        tools
            .map(tool => safeIdentifier(tool?.type))
            .filter(type => /^web_search_\d{8}$/u.test(type)),
    )];
}

function normalizeClaudeUsage(usage) {
    const serverToolUse = usage?.server_tool_use ?? {};
    const cacheCreation = usage?.cache_creation ?? {};
    return {
        inputTokens: safeCount(usage?.input_tokens),
        outputTokens: safeCount(usage?.output_tokens),
        cacheCreationInputTokens: safeCount(usage?.cache_creation_input_tokens),
        cacheReadInputTokens: safeCount(usage?.cache_read_input_tokens),
        cacheCreation: {
            ephemeral5mInputTokens: safeCount(cacheCreation?.ephemeral_5m_input_tokens),
            ephemeral1hInputTokens: safeCount(cacheCreation?.ephemeral_1h_input_tokens),
        },
        serverToolUse: {
            webSearchRequests: safeCount(serverToolUse?.web_search_requests),
            webFetchRequests: safeCount(serverToolUse?.web_fetch_requests),
        },
    };
}

function normalizeGeminiUsage(usage) {
    const normalizeDetails = details => (
        Array.isArray(details)
            ? details.map(detail => ({
                modality: safeIdentifier(detail?.modality) || 'other',
                tokenCount: safeCount(detail?.tokenCount),
            }))
            : []
    );
    return {
        promptTokenCount: safeCount(usage?.promptTokenCount),
        candidatesTokenCount: safeCount(usage?.candidatesTokenCount),
        totalTokenCount: safeCount(usage?.totalTokenCount),
        cachedContentTokenCount: safeCount(usage?.cachedContentTokenCount),
        thoughtsTokenCount: safeCount(usage?.thoughtsTokenCount),
        toolUsePromptTokenCount: safeCount(usage?.toolUsePromptTokenCount),
        promptTokensDetails: normalizeDetails(usage?.promptTokensDetails),
        candidatesTokensDetails: normalizeDetails(usage?.candidatesTokensDetails),
        cacheTokensDetails: normalizeDetails(usage?.cacheTokensDetails),
        toolUsePromptTokensDetails: normalizeDetails(usage?.toolUsePromptTokensDetails),
    };
}

function normalizeClaudeStopReason(value) {
    const reason = String(value || '').toLowerCase();
    return CLAUDE_STOP_REASONS.has(reason) ? reason : (reason ? 'other' : '');
}

function normalizeGeminiFinishReason(value) {
    const reason = String(value || '').toUpperCase();
    return GEMINI_FINISH_REASONS.has(reason) ? reason : (reason ? 'OTHER' : '');
}

/**
 * Extracts privacy-preserving metrics from a Claude Messages response.
 * Query text, answer text, URLs, titles, cited text, encrypted content and IDs
 * are never returned.
 *
 * @param {any} raw Raw response or {request, response} capture.
 * @returns {object} Structured metrics only.
 */
export function analyzeClaudeResponse(raw) {
    const response = findClaudeEnvelope(raw);
    const content = Array.isArray(response?.content) ? response.content : [];
    const querySequence = [];
    const resultUrls = new Set();
    const citedUrls = new Set();
    const resultTypeCounts = {};
    const citationTypeCounts = {};
    const knownResultTypes = new Set([
        'web_fetch_result',
        'web_fetch_result_error',
        'web_search_result',
        'web_search_result_error',
    ]);
    const knownCitationTypes = new Set([
        'char_location',
        'content_block_location',
        'page_location',
        'web_fetch_result_location',
        'web_search_result_location',
    ]);
    let searchCalls = 0;
    let resultBlocks = 0;
    let searchResults = 0;
    let resultErrors = 0;
    let textBlocks = 0;
    let textCodePoints = 0;
    let textUtf8Bytes = 0;
    let thinkingBlocks = 0;
    let thinkingCodePoints = 0;
    let citations = 0;
    let citedTextCodePoints = 0;
    let encryptedCitationIndexes = 0;

    for (const block of content) {
        if (!block || typeof block !== 'object') continue;

        if (block.type === 'server_tool_use' && block.name === 'web_search') {
            searchCalls++;
            for (const query of collectQueries(block.input)) {
                querySequence.push(queryMetric(query, querySequence.length + 1));
            }
        }

        if (block.type === 'web_search_tool_result') {
            resultBlocks++;
            const results = Array.isArray(block.content) ? block.content : [block.content];
            for (const result of results) {
                if (!result || typeof result !== 'object') continue;
                countKnownType(resultTypeCounts, result.type, knownResultTypes);
                if (result.type === 'web_search_result' || typeof result.url === 'string') {
                    searchResults++;
                }
                if (String(result.type || '').endsWith('_error') || result.error_code) {
                    resultErrors++;
                }
                if (typeof result.url === 'string' && result.url) {
                    resultUrls.add(fingerprint(result.url));
                }
            }
        }

        if (block.type === 'text' && typeof block.text === 'string') {
            textBlocks++;
            textCodePoints += codePointLength(block.text);
            textUtf8Bytes += utf8Length(block.text);
            for (const citation of Array.isArray(block.citations) ? block.citations : []) {
                if (!citation || typeof citation !== 'object') continue;
                citations++;
                countKnownType(citationTypeCounts, citation.type, knownCitationTypes);
                citedTextCodePoints += codePointLength(citation.cited_text);
                const url = citation.url ?? citation.source;
                if (typeof url === 'string' && url) citedUrls.add(fingerprint(url));
                if (citation.encrypted_index) encryptedCitationIndexes++;
            }
        }

        if (block.type === 'thinking' || block.type === 'redacted_thinking') {
            thinkingBlocks++;
            thinkingCodePoints += codePointLength(block.thinking ?? block.data);
        }
    }

    const stopReason = normalizeClaudeStopReason(response?.stop_reason);
    return {
        schemaVersion: SCHEMA_VERSION,
        provider: 'claude',
        model: safeIdentifier(response?.model),
        toolVersions: extractClaudeToolVersions(raw),
        stopReason,
        paused: stopReason === 'pause_turn',
        search: {
            used: searchCalls > 0 || resultBlocks > 0,
            serverToolCalls: searchCalls,
            querySequence,
            resultBlocks,
            resultRecords: searchResults,
            resultErrors,
            resultTypeCounts,
            uniqueResultUrls: resultUrls.size,
            duplicateResultUrls: Math.max(0, searchResults - resultUrls.size),
        },
        citations: {
            total: citations,
            typeCounts: citationTypeCounts,
            uniqueReferencedUrls: citedUrls.size,
            citedTextCodePoints,
            encryptedIndexes: encryptedCitationIndexes,
        },
        contentMetrics: {
            textBlocks,
            textCodePoints,
            textUtf8Bytes,
            thinkingBlocks,
            thinkingCodePoints,
        },
        usage: normalizeClaudeUsage(response?.usage),
    };
}

function getGeminiGroundingMetadata(response) {
    return response?.groundingMetadata
        ?? response?.candidates?.[0]?.groundingMetadata
        ?? null;
}

function getGeminiParts(response) {
    const direct = response?.responseContent?.parts;
    if (Array.isArray(direct)) return direct;
    const candidate = response?.candidates?.[0]?.content?.parts;
    return Array.isArray(candidate) ? candidate : [];
}

/**
 * Extracts privacy-preserving metrics from a Gemini generateContent response.
 * Query text, answer text, URLs, titles and Search Suggestions HTML are never
 * returned.
 *
 * @param {any} raw Raw Google or SillyTavern-wrapped response.
 * @returns {object} Structured metrics only.
 */
export function analyzeGeminiResponse(raw) {
    const response = findGeminiEnvelope(raw);
    const extracted = extractGeminiGroundedAnswer(response);
    const metadata = getGeminiGroundingMetadata(response);
    const queries = Array.isArray(metadata?.webSearchQueries) ? metadata.webSearchQueries : [];
    const chunks = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];
    const supports = Array.isArray(metadata?.groundingSupports) ? metadata.groundingSupports : [];
    const parts = getGeminiParts(response);
    const chunkTypeCounts = {
        web: 0,
        retrievedContext: 0,
        other: 0,
    };
    const chunkUrls = new Set();
    let supportChunkReferences = 0;
    let uniqueSupportedChunks = new Set();
    let invalidChunkReferences = 0;
    let supportedSegmentUtf8Bytes = 0;
    let supportedSegments = 0;
    let textParts = 0;
    let textCodePoints = 0;
    let textUtf8Bytes = 0;
    let thoughtParts = 0;

    for (const chunk of chunks) {
        if (chunk?.web) {
            chunkTypeCounts.web++;
            if (typeof chunk.web.uri === 'string' && chunk.web.uri) {
                chunkUrls.add(fingerprint(chunk.web.uri));
            }
        } else if (chunk?.retrievedContext) {
            chunkTypeCounts.retrievedContext++;
        } else {
            chunkTypeCounts.other++;
        }
    }

    for (const support of supports) {
        const indices = Array.isArray(support?.groundingChunkIndices)
            ? support.groundingChunkIndices
            : [];
        supportChunkReferences += indices.length;
        for (const rawIndex of indices) {
            const index = Number(rawIndex);
            if (Number.isInteger(index) && index >= 0 && index < chunks.length) {
                uniqueSupportedChunks.add(index);
            } else {
                invalidChunkReferences++;
            }
        }
        const startIndex = Number(support?.segment?.startIndex);
        const endIndex = Number(support?.segment?.endIndex);
        if (Number.isFinite(endIndex) && endIndex >= 0) {
            supportedSegments++;
            supportedSegmentUtf8Bytes += Math.max(
                0,
                endIndex - (Number.isFinite(startIndex) && startIndex >= 0 ? startIndex : 0),
            );
        }
    }

    for (const part of parts) {
        if (!part || typeof part !== 'object') continue;
        if (part.thought) thoughtParts++;
        if (typeof part.text === 'string' && !part.thought) {
            textParts++;
            textCodePoints += codePointLength(part.text);
            textUtf8Bytes += utf8Length(part.text);
        }
    }

    const finishReason = normalizeGeminiFinishReason(extracted.finishReason);
    const entryPoint = String(metadata?.searchEntryPoint?.renderedContent || '');
    const usage = response?.usageMetadata ?? extracted.usageMetadata;
    return {
        schemaVersion: SCHEMA_VERSION,
        provider: 'gemini',
        model: safeIdentifier(response?.modelVersion ?? response?.model),
        finishReason,
        truncated: finishReason === 'MAX_TOKENS' || finishReason === 'LENGTH',
        search: {
            used: extracted.usedSearch,
            querySequence: queries
                .filter(query => typeof query === 'string' && query.trim())
                .map((query, index) => queryMetric(query, index + 1)),
            queryCount: queries.length,
            chunkCount: chunks.length,
            chunkTypeCounts,
            uniqueChunkUrls: chunkUrls.size,
            supportCount: supports.length,
            supportChunkReferences,
            uniqueSupportedChunks: uniqueSupportedChunks.size,
            invalidChunkReferences,
            supportedSegments,
            supportedSegmentUtf8Bytes,
            searchEntryPointPresent: Boolean(entryPoint),
            searchEntryPointCodePoints: codePointLength(entryPoint),
        },
        contentMetrics: {
            candidateCount: Array.isArray(response?.candidates) ? response.candidates.length : 0,
            partCount: parts.length,
            textParts,
            thoughtParts,
            textCodePoints,
            textUtf8Bytes,
        },
        usage: normalizeGeminiUsage(usage),
    };
}

function detectProvider(raw) {
    const claude = findClaudeEnvelope(raw);
    const claudeContent = Array.isArray(claude?.content) ? claude.content : [];
    if (
        claudeContent.some(block => (
            block?.type === 'server_tool_use'
            || block?.type === 'web_search_tool_result'
        ))
        || claude?.usage?.server_tool_use !== undefined
    ) {
        return 'claude';
    }

    const gemini = findGeminiEnvelope(raw);
    if (
        getGeminiGroundingMetadata(gemini)
        || gemini?.usageMetadata !== undefined
        || Array.isArray(gemini?.candidates)
    ) {
        return 'gemini';
    }

    throw new Error('UNRECOGNIZED_PROVIDER');
}

/**
 * Analyzes a native-search response without exposing response content.
 *
 * @param {any} raw Raw response.
 * @param {'auto'|'claude'|'gemini'} provider Provider override.
 * @returns {object} Structured metrics only.
 */
export function analyzeNativeSearchResponse(raw, provider = 'auto') {
    if (!PROVIDERS.has(provider)) throw new Error('INVALID_PROVIDER');
    const resolved = provider === 'auto' ? detectProvider(raw) : provider;
    return resolved === 'claude'
        ? analyzeClaudeResponse(raw)
        : analyzeGeminiResponse(raw);
}

function recordsFromDocument(document) {
    if (Array.isArray(document)) return document;
    if (Array.isArray(document?.responses)) return document.responses;
    if (Array.isArray(document?.cases)) {
        return document.cases.map(item => item?.response ?? item);
    }
    return [document];
}

export function parseCliArguments(argv) {
    const args = [...argv];
    let input = '';
    let provider = 'auto';
    let compact = false;

    while (args.length) {
        const argument = args.shift();
        if (argument === '--input') {
            input = String(args.shift() || '');
        } else if (argument === '--provider') {
            provider = String(args.shift() || '');
        } else if (argument === '--compact') {
            compact = true;
        } else if (argument === '--help' || argument === '-h') {
            return { help: true, input: '', provider: 'auto', compact: false };
        } else if (!argument.startsWith('-') && !input) {
            input = argument;
        } else {
            throw new Error('INVALID_ARGUMENTS');
        }
    }

    if (!input) throw new Error('INPUT_REQUIRED');
    if (!PROVIDERS.has(provider)) throw new Error('INVALID_PROVIDER');
    return { help: false, input, provider, compact };
}

function safetyEnvelope(analyses) {
    return {
        schemaVersion: SCHEMA_VERSION,
        safety: {
            offlineOnly: true,
            credentialsRead: false,
            rawContentEmitted: false,
            queryTextEmitted: false,
            urlsEmitted: false,
        },
        analyses,
    };
}

function safeError(code) {
    return {
        schemaVersion: SCHEMA_VERSION,
        error: {
            code: safeIdentifier(code) || 'ANALYSIS_FAILED',
        },
    };
}

async function runCli() {
    try {
        const options = parseCliArguments(process.argv.slice(2));
        if (options.help) {
            process.stdout.write([
                'Offline native-search metrics',
                'Usage: node tests/native-search-metrics.mjs --input <sanitized-response.json>',
                '       [--provider auto|claude|gemini] [--compact]',
                'This tool has no network mode and never reads API-key environment variables.',
                '',
            ].join('\n'));
            return;
        }

        const inputStat = await stat(options.input);
        if (!inputStat.isFile()) throw new Error('INPUT_NOT_FILE');
        if (inputStat.size > MAX_INPUT_BYTES) throw new Error('INPUT_TOO_LARGE');
        const document = JSON.parse(await readFile(options.input, 'utf8'));
        const analyses = recordsFromDocument(document)
            .map(record => analyzeNativeSearchResponse(record, options.provider));
        const output = safetyEnvelope(analyses);
        process.stdout.write(`${JSON.stringify(output, null, options.compact ? 0 : 2)}\n`);
    } catch (error) {
        const code = error instanceof SyntaxError
            ? 'INVALID_JSON'
            : String(error?.message || 'ANALYSIS_FAILED');
        process.stderr.write(`${JSON.stringify(safeError(code))}\n`);
        process.exitCode = 1;
    }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
    await runCli();
}

