import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    ENABLE_SERVER_DEPENDENT_FEATURES,
    getEnabledResearchBackends,
    isResearchBackendEnabled,
    normalizeResearchBackend,
    resolveResearchBackendSelection,
    SERVER_DEPENDENT_RESEARCH_BACKENDS,
    STOCK_RESEARCH_BACKENDS,
} from '../feature-policy.js';
import {
    hasExplicitNoSearchIntent,
    hasExplicitSearchIntent,
} from '../research-gate.js';

assert.equal(ENABLE_SERVER_DEPENDENT_FEATURES, false);
for (const request of ['不要联网搜索，只根据我提供的内容回答', 'Do not search the web; use only provided context']) {
    assert.equal(hasExplicitNoSearchIntent(request), true);
    assert.equal(hasExplicitSearchIntent(request), false);
}
assert.deepEqual(STOCK_RESEARCH_BACKENDS, ['searxng', 'serpapi']);
assert.deepEqual(
    SERVER_DEPENDENT_RESEARCH_BACKENDS,
    ['anysearch', 'claude_profile', 'gemini_profile'],
);
assert.deepEqual(getEnabledResearchBackends(), ['searxng', 'serpapi']);

for (const backend of STOCK_RESEARCH_BACKENDS) {
    assert.equal(isResearchBackendEnabled(backend), true);
    assert.equal(normalizeResearchBackend(backend), backend);
    assert.deepEqual(resolveResearchBackendSelection(backend, true), {
        requestedBackend: backend,
        researchBackend: backend,
        enabled: true,
        paused: false,
    });
}
for (const backend of [...SERVER_DEPENDENT_RESEARCH_BACKENDS, 'unknown', '', null]) {
    assert.equal(normalizeResearchBackend(backend), 'searxng');
}
for (const backend of SERVER_DEPENDENT_RESEARCH_BACKENDS) {
    assert.equal(isResearchBackendEnabled(backend), false);
    assert.deepEqual(resolveResearchBackendSelection(backend, true), {
        requestedBackend: backend,
        researchBackend: 'searxng',
        enabled: false,
        paused: true,
    });
}
assert.deepEqual(resolveResearchBackendSelection('unknown', true), {
    requestedBackend: 'unknown',
    researchBackend: 'searxng',
    enabled: true,
    paused: false,
});

const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const settingsHtml = await readFile(new URL('../settings.html', import.meta.url), 'utf8');
const visibleSettingsHtml = settingsHtml.replace(/<!--[\s\S]*?-->/gu, '');

assert.equal(manifest.version, '1.7.1');
assert.match(indexSource, /schemaVersion:\s*7/u);
assert.match(indexSource, /body:\s*JSON\.stringify\(\{ query \}\)/u);
assert.match(indexSource, /if \(!isResearchBackendEnabled\(settings\.researchBackend\)/u);
const structuredStart = indexSource.indexOf('async function runStructuredSearchResearch');
const hardOptOutGuard = indexSource.indexOf('hasExplicitNoSearchIntent(userText)', structuredStart);
const plannerStart = indexSource.indexOf('const adapter = detectAdapter()', structuredStart);
assert.ok(structuredStart >= 0);
assert.ok(hardOptOutGuard > structuredStart);
assert.ok(plannerStart > hardOptOutGuard);

assert.match(visibleSettingsHtml, /<option value="searxng">/u);
assert.match(visibleSettingsHtml, /<option value="serpapi">/u);
for (const backend of SERVER_DEPENDENT_RESEARCH_BACKENDS) {
    assert.doesNotMatch(visibleSettingsHtml, new RegExp(`<option value="${backend}">`, 'u'));
}

for (const id of [
    'hwr_anysearch_settings',
    'hwr_claude_profile_settings',
    'hwr_gemini_profile_settings',
    'hwr_claude_direct_key',
    'hwr_gemini_direct_key',
    'hwr_serpapi_language',
    'hwr_serpapi_country',
]) {
    assert.doesNotMatch(visibleSettingsHtml, new RegExp(`id="${id}"`, 'u'));
}

assert.match(visibleSettingsHtml, /id="hwr_searxng_settings"/u);
assert.match(visibleSettingsHtml, /id="hwr_serpapi_settings"/u);
assert.doesNotMatch(visibleSettingsHtml, /URL \+ Key/u);

console.log('Stock-only feature policy: all assertions passed');
