import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    analyzeClaudeResponse,
    analyzeGeminiResponse,
    analyzeNativeSearchResponse,
    parseCliArguments,
} from './native-search-metrics.mjs';

const SECRET_QUERY_20250305 = 'private benchmark query 20250305';
const SECRET_QUERY_20260318 = 'private benchmark query 20260318';
const SECRET_GEMINI_QUERY = 'private Gemini web query';
const SECRET_ANSWER = 'This answer body must never be emitted.';
const SECRET_URL = 'https://secret.example/private-result';
const SECRET_KEY = 'fixture-secret-never-emit';

const claude20250305 = {
    api_key: SECRET_KEY,
    request: {
        tools: [{
            type: 'web_search_20250305',
            name: 'web_search',
        }],
    },
    response: {
        model: 'claude-opus-test',
        stop_reason: 'end_turn',
        content: [
            {
                type: 'server_tool_use',
                id: 'srvtoolu_secret',
                name: 'web_search',
                input: { query: SECRET_QUERY_20250305 },
            },
            {
                type: 'web_search_tool_result',
                tool_use_id: 'srvtoolu_secret',
                content: [
                    {
                        type: 'web_search_result',
                        url: SECRET_URL,
                        title: 'Secret title',
                        encrypted_content: 'secret encrypted result',
                        page_age: 'today',
                    },
                    {
                        type: 'web_search_result',
                        url: SECRET_URL,
                        title: 'Duplicate URL',
                    },
                ],
            },
            {
                type: 'text',
                text: SECRET_ANSWER,
                citations: [{
                    type: 'web_search_result_location',
                    url: SECRET_URL,
                    title: 'Secret title',
                    cited_text: 'secret cited passage',
                    encrypted_index: 'secret encrypted index',
                }],
            },
        ],
        usage: {
            input_tokens: 364,
            output_tokens: 138,
            cache_creation_input_tokens: 16397,
            cache_read_input_tokens: 2249,
            server_tool_use: {
                web_search_requests: 1,
                web_fetch_requests: 0,
            },
        },
    },
};

const claude20260318Pause = {
    request: {
        tools: [{
            type: 'web_search_20260318',
            name: 'web_search',
            max_uses: 4,
        }],
    },
    response: {
        model: 'claude-opus-latest',
        stop_reason: 'pause_turn',
        content: [
            {
                type: 'server_tool_use',
                name: 'web_search',
                input: { query: SECRET_QUERY_20260318 },
            },
            {
                type: 'web_search_tool_result',
                content: {
                    type: 'web_search_result_error',
                    error_code: 'temporarily_unavailable',
                },
            },
        ],
        usage: {
            input_tokens: 41,
            output_tokens: 19,
            cache_creation: {
                ephemeral_5m_input_tokens: 7,
                ephemeral_1h_input_tokens: 11,
            },
            server_tool_use: {
                web_search_requests: 1,
                web_fetch_requests: 0,
            },
        },
    },
};

const geminiGrounded = {
    modelVersion: 'gemini-3.1-pro-test',
    candidates: [{
        content: {
            parts: [
                { thought: true, text: 'Secret thought body' },
                { text: SECRET_ANSWER },
            ],
        },
        finishReason: 'STOP',
        groundingMetadata: {
            webSearchQueries: [
                SECRET_GEMINI_QUERY,
                SECRET_GEMINI_QUERY,
            ],
            groundingChunks: [
                {
                    web: {
                        uri: SECRET_URL,
                        title: 'Secret source',
                    },
                },
                {
                    retrievedContext: {
                        uri: 'https://another.secret.example/context',
                        title: 'Secret context',
                    },
                },
            ],
            groundingSupports: [{
                segment: {
                    partIndex: 1,
                    startIndex: 0,
                    endIndex: 24,
                    text: 'Secret supported segment',
                },
                groundingChunkIndices: [0, 1, 99],
            }],
            searchEntryPoint: {
                renderedContent: '<div>Secret Google Search Suggestions</div>',
            },
        },
    }],
    usageMetadata: {
        promptTokenCount: 26,
        candidatesTokenCount: 43,
        totalTokenCount: 4963,
        cachedContentTokenCount: 5,
        thoughtsTokenCount: 4898,
        toolUsePromptTokenCount: 9,
        promptTokensDetails: [{
            modality: 'TEXT',
            tokenCount: 26,
        }],
    },
};

const claudeMetrics = analyzeClaudeResponse(claude20250305);
assert.equal(claudeMetrics.provider, 'claude');
assert.deepEqual(claudeMetrics.toolVersions, ['web_search_20250305']);
assert.equal(claudeMetrics.stopReason, 'end_turn');
assert.equal(claudeMetrics.paused, false);
assert.equal(claudeMetrics.search.serverToolCalls, 1);
assert.equal(claudeMetrics.search.querySequence.length, 1);
assert.equal(claudeMetrics.search.querySequence[0].order, 1);
assert.equal(claudeMetrics.search.resultRecords, 2);
assert.equal(claudeMetrics.search.uniqueResultUrls, 1);
assert.equal(claudeMetrics.search.duplicateResultUrls, 1);
assert.equal(claudeMetrics.citations.total, 1);
assert.equal(claudeMetrics.citations.encryptedIndexes, 1);
assert.equal(claudeMetrics.usage.serverToolUse.webSearchRequests, 1);
assert.equal(claudeMetrics.usage.cacheCreationInputTokens, 16397);

const pauseMetrics = analyzeClaudeResponse(claude20260318Pause);
assert.deepEqual(pauseMetrics.toolVersions, ['web_search_20260318']);
assert.equal(pauseMetrics.stopReason, 'pause_turn');
assert.equal(pauseMetrics.paused, true);
assert.equal(pauseMetrics.search.serverToolCalls, 1);
assert.equal(pauseMetrics.search.resultErrors, 1);
assert.equal(pauseMetrics.usage.cacheCreation.ephemeral5mInputTokens, 7);
assert.equal(pauseMetrics.usage.cacheCreation.ephemeral1hInputTokens, 11);
assert.equal(pauseMetrics.usage.serverToolUse.webSearchRequests, 1);

const geminiMetrics = analyzeGeminiResponse(geminiGrounded);
assert.equal(geminiMetrics.provider, 'gemini');
assert.equal(geminiMetrics.model, 'gemini-3.1-pro-test');
assert.equal(geminiMetrics.finishReason, 'STOP');
assert.equal(geminiMetrics.truncated, false);
assert.equal(geminiMetrics.search.queryCount, 2);
assert.equal(geminiMetrics.search.querySequence.length, 2);
assert.equal(
    geminiMetrics.search.querySequence[0].fingerprint,
    geminiMetrics.search.querySequence[1].fingerprint,
);
assert.equal(geminiMetrics.search.chunkCount, 2);
assert.equal(geminiMetrics.search.chunkTypeCounts.web, 1);
assert.equal(geminiMetrics.search.chunkTypeCounts.retrievedContext, 1);
assert.equal(geminiMetrics.search.supportCount, 1);
assert.equal(geminiMetrics.search.supportChunkReferences, 3);
assert.equal(geminiMetrics.search.uniqueSupportedChunks, 2);
assert.equal(geminiMetrics.search.invalidChunkReferences, 1);
assert.equal(geminiMetrics.search.searchEntryPointPresent, true);
assert.equal(geminiMetrics.contentMetrics.thoughtParts, 1);
assert.equal(geminiMetrics.usage.totalTokenCount, 4963);
assert.equal(geminiMetrics.usage.thoughtsTokenCount, 4898);

assert.equal(analyzeNativeSearchResponse(claude20250305).provider, 'claude');
assert.equal(analyzeNativeSearchResponse(geminiGrounded).provider, 'gemini');
assert.deepEqual(
    parseCliArguments(['--input', 'response.json', '--provider', 'gemini', '--compact']),
    {
        help: false,
        input: 'response.json',
        provider: 'gemini',
        compact: true,
    },
);

const serializedMetrics = JSON.stringify([
    claudeMetrics,
    pauseMetrics,
    geminiMetrics,
]);
for (const secret of [
    SECRET_QUERY_20250305,
    SECRET_QUERY_20260318,
    SECRET_GEMINI_QUERY,
    SECRET_ANSWER,
    SECRET_URL,
    SECRET_KEY,
    'Secret thought body',
    'Secret Google Search Suggestions',
]) {
    assert.equal(serializedMetrics.includes(secret), false);
}

const scriptSource = await readFile(new URL('./native-search-metrics.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(scriptSource, /\bfetch\s*\(/u);
assert.doesNotMatch(scriptSource, /node:https?/u);
assert.doesNotMatch(scriptSource, /process\.env/u);

console.log('Native search metrics: all assertions passed');
