import assert from 'node:assert/strict';
import {
    createResearchResponseGuard,
    makeResearchPacketRetry,
    researchConnectionKey,
} from '../research-response-guard.js';

const endpoint = 'http://127.0.0.1:8001/api/backends/chat-completions/generate';
const tool = { type: 'function', function: { name: 'hwr_web_search', parameters: { type: 'object' } } };
const call = { id: 'hwr_test_1', type: 'function', function: { name: 'hwr_web_search', arguments: '{"query":"weather"}' } };
const template = {
    chat_completion_source: 'custom', model: 'gemini-3.8-flash', custom_url: 'https://example.test/v1',
    tools: [tool], tool_choice: 'none', stream: false,
    messages: [
        { role: 'user', content: 'What temperature was found?' },
        { role: 'assistant', content: '', tool_calls: [call] },
        { role: 'tool', tool_call_id: call.id, content: '{"temperature":20,"url":"https://example.test/weather"}' },
    ],
};
const json = payload => new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
const toolReply = () => json({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [call], content: '' } }] });
const answer = () => json({ choices: [{ finish_reason: 'stop', message: { content: '20 degrees' } }] });
const frame = payload => `data: ${JSON.stringify(payload)}\n\n`;
const textFrame = text => frame({ choices: [{ index: 0, delta: { content: text } }] });
const nameFrame = name => frame({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name } }] } }] });
const done = 'data: [DONE]\n\n';
function sse(text, chunkSize = text.length) {
    const bytes = new TextEncoder().encode(text);
    let offset = 0;
    return new Response(new ReadableStream({
        pull(controller) {
            if (offset >= bytes.length) return controller.close();
            controller.enqueue(bytes.slice(offset, offset += chunkSize));
        },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
}
function harness(respond) {
    const requests = [];
    const violations = [];
    let sequence = 0;
    const guard = createResearchResponseGuard({
        baseUrl: endpoint,
        makeId: () => `test-${++sequence}`,
        onViolation: value => violations.push(value),
        fetchImpl: async (url, init) => {
            const request = init?.body ? JSON.parse(init.body) : null;
            requests.push({ url, request, init });
            return respond(request, requests.length, init);
        },
    });
    const send = (request = structuredClone(template), options = {}) => {
        guard.register(request, options);
        return guard.fetch(endpoint, { method: 'POST', body: JSON.stringify(request), signal: options.signal });
    };
    return { guard, requests, violations, send };
}

// Pure conversion retains evidence, other tools, and the caller's objects.
{
    const original = structuredClone(template);
    original.tools.push({ type: 'function', function: { name: 'calculator' } });
    original.messages[1].tool_calls.push({ id: 'other', type: 'function', function: { name: 'calculator', arguments: '{}' } });
    original.messages.push({ role: 'tool', tool_call_id: 'other', content: '42' });
    const snapshot = JSON.stringify(original);
    const retry = makeResearchPacketRetry(original);
    assert.equal(JSON.stringify(original), snapshot);
    assert.deepEqual(retry.tools.map(item => item.function.name), ['calculator']);
    assert.equal(retry.tool_choice, 'none');
    assert.equal(retry.messages[1].tool_calls[0].id, 'other');
    assert.equal(retry.messages[2].tool_call_id, 'other');
    assert.match(retry.messages.at(-1).content, /temperature.*20/u);
    assert.match(retry.messages.at(-1).content, /https:\/\/example.test\/weather/u);
    assert.doesNotMatch(JSON.stringify(retry), /hwr_web_search/u);
}
assert.equal(researchConnectionKey({ ...template, custom_url: 'https://user:secret@example.test/v1?token=private' }), researchConnectionKey(template));
assert.notEqual(researchConnectionKey({ ...template, model: 'another-model' }), researchConnectionKey(template));
assert.equal(researchConnectionKey({ ...template, reverse_proxy: 'https://unused-proxy.test' }), researchConnectionKey(template));
assert.equal(researchConnectionKey({ ...template, chat_completion_source: 'openrouter', custom_url: 'https://unused.test' }), researchConnectionKey({ ...template, chat_completion_source: 'openrouter' }));

// Unregistered/unrelated requests retain their options and response behavior.
{
    const h = harness(answer);
    const init = { method: 'POST', body: JSON.stringify({ tools: [tool], tool_choice: 'auto' }) };
    await h.guard.fetch(endpoint, init);
    assert.equal(h.requests[0].init, init);
    assert.equal(h.requests[0].request.tool_choice, 'auto');
    assert.equal(h.violations.length, 0);
}
// A later request listener may overwrite none; enforce it at dispatch.
{
    const h = harness(answer);
    const request = structuredClone(template);
    h.guard.register(request);
    request.tool_choice = 'auto';
    const response = await h.guard.fetch(endpoint, { method: 'POST', body: JSON.stringify(request) });
    assert.equal(h.requests[0].request.tool_choice, 'none');
    assert.equal('__hwr_response_guard' in h.requests[0].request, false);
    assert.equal((await response.json()).choices[0].message.content, '20 degrees');
    assert.equal(h.guard.hasFailed(template), false);
}
// A deliberately noncompliant upstream gets exactly one evidence-preserving retry.
{
    const h = harness((request, count) => count === 1 ? toolReply() : answer());
    const response = await h.send();
    assert.equal((await response.json()).choices[0].message.content, '20 degrees');
    assert.equal(h.requests.length, 2);
    assert.doesNotMatch(JSON.stringify(h.requests[1].request), /hwr_web_search|__hwr_response_guard/u);
    assert.match(JSON.stringify(h.requests[1].request.messages), /temperature/u);
    assert.equal(h.guard.hasFailed(template), true);
    assert.equal(h.guard.hasFailed({ ...template, model: 'another-model' }), false);
    assert.deepEqual(h.violations, [{ retrying: true, reason: 'unexpected_search_call' }]);
}
{
    const h = harness(toolReply);
    await assert.rejects(h.send(), /请重新生成/u);
    assert.equal(h.requests.length, 2, 'Never retry indefinitely');
}
// Other tools remain owned by their own extensions.
{
    const h = harness(() => json({ choices: [{ message: { tool_calls: [{ function: { name: 'calculator' } }] } }] }));
    const response = await h.send();
    assert.equal((await response.json()).choices[0].message.tool_calls[0].function.name, 'calculator');
    assert.equal(h.requests.length, 1);
    assert.equal(h.violations.length, 0);
}
// HTTP failures are not mistaken for unsupported tools or automatically retried.
{
    const h = harness(() => new Response('unavailable', { status: 503 }));
    assert.equal((await h.send()).status, 503);
    assert.equal(h.requests.length, 1);
    assert.equal(h.guard.hasFailed(template), false);
}

// The normal text stream is readable before the upstream stream ends.
{
    let upstream;
    const h = harness(() => new Response(new ReadableStream({ start(controller) { upstream = controller; } }), { headers: { 'Content-Type': 'text/event-stream' } }));
    const response = await h.send({ ...structuredClone(template), stream: true });
    const reader = response.body.getReader();
    upstream.enqueue(new TextEncoder().encode(textFrame('First token')));
    const first = await reader.read();
    assert.match(new TextDecoder().decode(first.value), /First token/u);
    upstream.close();
    assert.equal((await reader.read()).done, true);
}
// Fragmented SSE chunks AND fragmented function names cannot leak to ToolManager.
{
    const h = harness((request, count) => count === 1
        ? sse(frame({ choices: [{ delta: { role: 'assistant' } }] }) + nameFrame('hwr_') + nameFrame('web_search') + done, 3)
        : sse(textFrame('20 degrees') + done, 4));
    const response = await h.send({ ...structuredClone(template), stream: true });
    const body = await response.text();
    assert.match(body, /20 degrees/u);
    assert.doesNotMatch(body, /hwr_|tool_calls/u);
    assert.equal(h.requests.length, 2);
    assert.equal(h.guard.hasFailed(template), true);
}
// Some compatible proxies label an SSE body as plain text.
{
    const h = harness((request, count) => count === 1
        ? new Response(nameFrame('hwr_web_search') + done, { headers: { 'Content-Type': 'text/plain' } })
        : sse(textFrame('Recovered despite mislabeled SSE') + done));
    const response = await h.send({ ...structuredClone(template), stream: true });
    assert.match(await response.text(), /Recovered despite mislabeled SSE/u);
    assert.equal(h.requests.length, 2);
}
// A partial answer or reasoning must not be concatenated with a second answer.
for (const partial of [textFrame('Partial answer'), frame({ choices: [{ delta: { reasoning_content: 'Reasoning already displayed' } }] })]) {
    const h = harness(() => sse(partial + nameFrame('hwr_web_search') + done, 7));
    const response = await h.send({ ...structuredClone(template), stream: true });
    const reader = response.body.getReader();
    let output = '';
    await assert.rejects(async () => {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            output += new TextDecoder().decode(chunk.value);
        }
    }, /请重新生成/u);
    assert.doesNotMatch(output, /hwr_web_search/u);
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.violations, [{ retrying: false, reason: 'unexpected_search_call' }]);
}
{
    const h = harness(() => sse(nameFrame('hwr_web_search') + done));
    const response = await h.send({ ...structuredClone(template), stream: true });
    await assert.rejects(response.text(), /请重新生成/u);
    assert.equal(h.requests.length, 2);
}
// Native Claude and Gemini response shapes are also recognized.
for (const payload of [
    { content: [{ type: 'tool_use', name: 'hwr_web_search', input: {} }] },
    { candidates: [{ content: { parts: [{ functionCall: { name: 'hwr_web_search', args: {} } }] } }] },
]) {
    const h = harness((request, count) => count === 1 ? json(payload) : answer());
    assert.equal((await (await h.send()).json()).choices[0].message.content, '20 degrees');
    assert.equal(h.requests.length, 2);
}
{
    const h = harness((request, count) => count === 1
        ? sse(frame({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: 'hwr_web_search' } }) + done)
        : sse(textFrame('recovered') + done));
    assert.match(await (await h.send({ ...structuredClone(template), stream: true })).text(), /recovered/u);
}
// Prompt mode may contain old HWR history, but must not disable unrelated tools.
{
    const h = harness(answer);
    await h.send({ ...structuredClone(template), tool_choice: 'auto' }, { enforceNone: false });
    assert.equal(h.requests[0].request.tool_choice, 'auto');
}
// Cancel/stale chat requests cannot retry or spend another generation request.
{
    const h = harness(answer);
    await assert.rejects(h.send(structuredClone(template), { isCurrent: () => false }), { name: 'AbortError' });
    assert.equal(h.requests.length, 0);
}
{
    const h = harness(answer);
    const request = structuredClone(template);
    h.guard.register(request);
    h.guard.clear();
    await assert.rejects(h.guard.fetch(endpoint, { method: 'POST', body: JSON.stringify(request) }), { name: 'AbortError' });
    assert.equal(h.requests.length, 0);
}
{
    const controller = new AbortController();
    const h = harness((request, count, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
    }));
    const promise = h.send(structuredClone(template), { signal: controller.signal });
    controller.abort();
    await assert.rejects(promise, { name: 'AbortError' });
    assert.equal(h.requests.length, 1);
    assert.equal(h.violations.length, 0);
}
{
    let cancelled = false;
    const h = harness(() => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'text/event-stream' } }));
    const response = await h.send({ ...structuredClone(template), stream: true });
    const reader = response.body.getReader();
    const reading = reader.read();
    h.guard.clear();
    await assert.rejects(reading, { name: 'AbortError' });
    assert.equal(cancelled, true);
    assert.equal(h.requests.length, 1);
}
// Literal tool names in prose and unrelated streaming tools pass through.
for (const body of [textFrame('The hwr_web_search name is mentioned in this explanation.') + done, nameFrame('calculator') + done]) {
    const h = harness(() => sse(body, 5));
    assert.equal(await (await h.send({ ...structuredClone(template), stream: true })).text(), body);
    assert.equal(h.requests.length, 1);
    assert.equal(h.violations.length, 0);
}
// Do not claim another origin's request, even if it copied our internal tag.
{
    const h = harness(toolReply);
    const request = structuredClone(template);
    h.guard.register(request);
    const init = { method: 'POST', body: JSON.stringify(request) };
    const response = await h.guard.fetch('https://another.test/api/backends/chat-completions/generate', init);
    assert.equal(h.requests[0].init, init);
    assert.equal((await response.json()).choices[0].message.tool_calls[0].function.name, 'hwr_web_search');
    assert.equal(h.violations.length, 0);
}
// Plain HTTP LAN browsers may lack crypto.randomUUID.
{
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    try {
        Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
        const guard = createResearchResponseGuard({ baseUrl: endpoint, fetchImpl: async () => answer() });
        const request = structuredClone(template);
        guard.register(request);
        const response = await guard.fetch(endpoint, { method: 'POST', body: JSON.stringify(request) });
        assert.equal((await response.json()).choices[0].message.content, '20 degrees');
    } finally {
        if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
        else delete globalThis.crypto;
    }
}
console.log('Research response guard: dispatch, retry, streaming, isolation, evidence retention and cancellation passed');
