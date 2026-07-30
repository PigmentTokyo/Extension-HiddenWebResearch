import assert from 'node:assert/strict';
import {
    extractGeminiGroundedAnswer,
    utf8ByteOffsetToCodeUnitIndex,
} from '../gemini-grounding.js';

assert.equal(utf8ByteOffsetToCodeUnitIndex('A😀中B', 0), 0);
assert.equal(utf8ByteOffsetToCodeUnitIndex('A😀中B', 1), 1);
assert.equal(utf8ByteOffsetToCodeUnitIndex('A😀中B', 5), 3);
assert.equal(utf8ByteOffsetToCodeUnitIndex('A😀中B', 8), 4);
assert.equal(utf8ByteOffsetToCodeUnitIndex('A😀中B', 9), 5);

const answerText = '你好😀，最新版本是 1.18.0。';
const answerBytes = new TextEncoder().encode(answerText).length;
const stWrappedResponse = {
    choices: [{ message: { content: answerText } }],
    responseContent: {
        role: 'model',
        parts: [
            { thought: true, text: 'hidden reasoning' },
            { text: answerText },
        ],
    },
    finishReason: 'STOP',
    groundingMetadata: {
        webSearchQueries: ['SillyTavern latest release', 'SillyTavern latest release'],
        searchEntryPoint: {
            renderedContent: '<style>.chip{color:red}</style><div class="chip">Google Search</div>',
        },
        groundingChunks: [
            { web: { uri: 'https://example.com/release', title: 'Official release' } },
            { web: { uri: 'javascript:alert(1)', title: 'Invalid' } },
        ],
        groundingSupports: [
            {
                segment: {
                    partIndex: 1,
                    startIndex: 0,
                    endIndex: answerBytes,
                    text: answerText,
                },
                groundingChunkIndices: [0, 0, 1, 999],
            },
        ],
    },
    usageMetadata: {
        totalTokenCount: 69,
    },
};

const extracted = extractGeminiGroundedAnswer(stWrappedResponse);
assert.equal(extracted.text, answerText);
assert.equal(extracted.usedSearch, true);
assert.equal(extracted.truncated, false);
assert.deepEqual(extracted.queries, ['SillyTavern latest release']);
assert.equal(extracted.sources.length, 1);
assert.equal(extracted.sources[0].uri, 'https://example.com/release');
assert.match(extracted.attributedText, /\[1\]\(https:\/\/example\.com\/release "Official release"\)$/u);
assert.doesNotMatch(extracted.attributedText, /javascript:/u);
assert.match(extracted.searchEntryPoint, /Google Search/u);
assert.equal(extracted.usageMetadata.totalTokenCount, 69);

const directGoogleResponse = {
    candidates: [{
        content: {
            parts: [{ text: 'A grounded but truncated answer' }],
        },
        finishReason: 'MAX_TOKENS',
        groundingMetadata: {
            webSearchQueries: ['query'],
            searchEntryPoint: { renderedContent: '<div>Suggestions</div>' },
        },
    }],
};
const direct = extractGeminiGroundedAnswer(directGoogleResponse);
assert.equal(direct.usedSearch, true);
assert.equal(direct.truncated, true);
assert.equal(direct.finishReason, 'MAX_TOKENS');

const openAiOnlyResponse = {
    choices: [{
        message: { content: 'Plain OpenAI-compatible text without grounding metadata.' },
        finish_reason: 'stop',
    }],
};
const openAiOnly = extractGeminiGroundedAnswer(openAiOnlyResponse);
assert.equal(openAiOnly.text, 'Plain OpenAI-compatible text without grounding metadata.');
assert.equal(openAiOnly.usedSearch, false);
assert.equal(openAiOnly.searchEntryPoint, '');

const noTextResponse = {
    groundingMetadata: {
        webSearchQueries: ['query'],
        searchEntryPoint: { renderedContent: '<div>Suggestions</div>' },
    },
};
const noText = extractGeminiGroundedAnswer(noTextResponse);
assert.equal(noText.text, '');
assert.equal(noText.usedSearch, true);

console.log('Gemini grounding parser: all assertions passed');
