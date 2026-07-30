import http from 'node:http';

const port = Number.parseInt(process.env.HWR_MOCK_PORT || '18991', 10);
const expectedKey = 'hwr-local-test-key-do-not-use';

function sendJson(response, status, value) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(value));
}

async function readJson(request) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
        return sendJson(response, 200, { ok: true });
    }

    try {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const body = await readJson(request);

        if (request.method === 'GET' && url.pathname === '/claude/v1/models') {
            const validKey = request.headers['x-api-key'] === expectedKey
                || request.headers.authorization === `Bearer ${expectedKey}`;
            if (!validKey) {
                return sendJson(response, 401, { error: { message: 'Mock Claude model-list authentication failed' } });
            }
            return sendJson(response, 200, {
                data: [
                    { id: 'claude-hwr-mock', display_name: 'Claude HWR Mock' },
                    { id: 'claude-opus-5', display_name: 'Claude Opus 5' },
                ],
                has_more: false,
                first_id: 'claude-hwr-mock',
                last_id: 'claude-opus-5',
            });
        }

        if (request.method === 'POST' && url.pathname === '/claude/v1/messages') {
            const validKey = request.headers['x-api-key'] === expectedKey;
            const hasSearchTool = Array.isArray(body.tools) && body.tools.some(tool => tool?.name === 'web_search');
            if (!validKey || !hasSearchTool) {
                return sendJson(response, 401, { error: { message: 'Mock Claude authentication or search tool check failed' } });
            }
            return sendJson(response, 200, {
                id: 'msg_hwr_mock',
                type: 'message',
                role: 'assistant',
                model: body.model || 'claude-hwr-mock',
                stop_reason: 'end_turn',
                stop_sequence: null,
                content: [
                    {
                        type: 'server_tool_use',
                        id: 'srvtoolu_hwr_mock',
                        name: 'web_search',
                        input: { query: 'SillyTavern official GitHub repository' },
                    },
                    {
                        type: 'web_search_tool_result',
                        tool_use_id: 'srvtoolu_hwr_mock',
                        content: [{
                            type: 'web_search_result',
                            url: 'https://github.com/SillyTavern/SillyTavern',
                            title: 'SillyTavern/SillyTavern',
                            page_age: '2026-07-30',
                        }],
                    },
                    {
                        type: 'text',
                        text: 'The official repository is SillyTavern/SillyTavern.',
                        citations: [{
                            type: 'web_search_result_location',
                            url: 'https://github.com/SillyTavern/SillyTavern',
                            title: 'SillyTavern/SillyTavern',
                            cited_text: 'LTS release branch',
                        }],
                    },
                ],
                usage: {
                    input_tokens: 20,
                    output_tokens: 30,
                    server_tool_use: { web_search_requests: 1 },
                },
            });
        }

        if (request.method === 'GET' && url.pathname === '/gemini/v1beta/models') {
            const validKey = url.searchParams.get('key') === expectedKey
                || request.headers['x-goog-api-key'] === expectedKey;
            if (!validKey) {
                return sendJson(response, 401, { error: { message: 'Mock Gemini model-list authentication failed' } });
            }
            return sendJson(response, 200, {
                models: [
                    {
                        name: 'models/gemini-hwr-mock',
                        displayName: 'Gemini HWR Mock',
                        supportedGenerationMethods: ['generateContent'],
                    },
                    {
                        name: 'models/gemini-3.1-pro-preview',
                        displayName: 'Gemini 3.1 Pro Preview',
                        supportedGenerationMethods: ['generateContent'],
                    },
                    {
                        name: 'models/text-embedding-mock',
                        supportedGenerationMethods: ['embedContent'],
                    },
                ],
            });
        }

        if (
            request.method === 'POST'
            && /^\/gemini\/v1beta\/models\/[^/]+:generateContent$/.test(url.pathname)
        ) {
            const validKey = url.searchParams.get('key') === expectedKey;
            const hasSearchTool = Array.isArray(body.tools) && body.tools.some(tool => tool?.google_search);
            if (!validKey || !hasSearchTool) {
                return sendJson(response, 401, { error: { message: 'Mock Gemini authentication or search tool check failed' } });
            }
            const text = 'The official repository is SillyTavern/SillyTavern.';
            return sendJson(response, 200, {
                candidates: [{
                    content: { role: 'model', parts: [{ text }] },
                    finishReason: 'STOP',
                    groundingMetadata: {
                        webSearchQueries: ['SillyTavern official GitHub repository'],
                        searchEntryPoint: {
                            renderedContent: '<div class="mock-search-suggestion">Mock Google Search suggestion</div>',
                        },
                        groundingChunks: [{
                            web: {
                                uri: 'https://github.com/SillyTavern/SillyTavern',
                                title: 'SillyTavern/SillyTavern',
                            },
                        }],
                        groundingSupports: [{
                            segment: { startIndex: 0, endIndex: text.length },
                            groundingChunkIndices: [0],
                            confidenceScores: [1],
                        }],
                    },
                }],
                usageMetadata: {
                    promptTokenCount: 20,
                    candidatesTokenCount: 30,
                    totalTokenCount: 50,
                },
                modelVersion: body.model || 'gemini-hwr-mock',
                responseId: 'gemini_hwr_mock',
            });
        }

        return sendJson(response, 404, { error: { message: 'Mock route not found' } });
    } catch {
        return sendJson(response, 400, { error: { message: 'Mock request was invalid' } });
    }
});

server.listen(port, '127.0.0.1', () => {
    console.log(`HWR native-search mock listening on http://127.0.0.1:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
}
