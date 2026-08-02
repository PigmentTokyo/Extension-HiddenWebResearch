import http from 'node:http';

const DEFAULT_PORT = 18081;
const EXPECTED_KEY = 'hwr-local-test-key';
const MAX_BODY_BYTES = 1024 * 1024;

function parsePort(value) {
    const parsed = Number.parseInt(String(value || DEFAULT_PORT), 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error(`HWR_MOCK_PORT must be an integer from 1 to 65535 (received ${String(value)})`);
    }
    return parsed;
}

const port = parsePort(process.env.HWR_MOCK_PORT);

function createMetrics() {
    return {
        requests: {
            total: 0,
            models: 0,
            chatCompletions: 0,
            authFailures: 0,
            invalidRequests: 0,
            notFound: 0,
        },
        resets: 0,
        lastChatRequest: null,
    };
}

let metrics = createMetrics();

function sendJson(response, status, value) {
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
    });
    response.end(JSON.stringify(value));
}

async function readJson(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
            throw new Error('request body is too large');
        }
        chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function getSanitizedChatMetadata(body) {
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    return {
        model: typeof body?.model === 'string' ? body.model.slice(0, 256) : '',
        messageCount: messages.length,
        maxTokens: Number.isFinite(body?.max_tokens) ? body.max_tokens : null,
        stream: body?.stream === true,
        hasResponseFormat: Boolean(body?.response_format),
    };
}

function wantsConnectionTestResponse(body) {
    return Array.isArray(body?.messages) && body.messages.some(message =>
        typeof message?.content === 'string' && message.content.includes('{"status":"ok"}'),
    );
}

const server = http.createServer(async (request, response) => {
    let url;
    try {
        url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
    } catch {
        metrics.requests.invalidRequests += 1;
        return sendJson(response, 400, { error: { message: 'Mock request URL was invalid' } });
    }

    if (request.method === 'GET' && url.pathname === '/__hwr_metrics') {
        return sendJson(response, 200, metrics);
    }

    if (request.method === 'POST' && url.pathname === '/__hwr_reset') {
        const resetCount = metrics.resets + 1;
        metrics = createMetrics();
        metrics.resets = resetCount;
        return sendJson(response, 200, { ok: true, resets: metrics.resets });
    }

    metrics.requests.total += 1;

    if (request.method === 'GET' && url.pathname === '/v1/models') {
        metrics.requests.models += 1;
        return sendJson(response, 200, {
            object: 'list',
            data: [
                {
                    id: 'hwr-planner-mock',
                    object: 'model',
                    created: 0,
                    owned_by: 'hwr-local',
                },
                {
                    id: 'hwr-planner-mock-alt',
                    object: 'model',
                    created: 0,
                    owned_by: 'hwr-local',
                },
            ],
        });
    }

    if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
        metrics.requests.chatCompletions += 1;
        if (request.headers.authorization !== `Bearer ${EXPECTED_KEY}`) {
            metrics.requests.authFailures += 1;
            return sendJson(response, 401, { error: { message: 'Mock planner authentication failed' } });
        }

        let body;
        try {
            body = await readJson(request);
        } catch {
            metrics.requests.invalidRequests += 1;
            return sendJson(response, 400, { error: { message: 'Mock planner request JSON was invalid' } });
        }

        metrics.lastChatRequest = getSanitizedChatMetadata(body);
        const content = wantsConnectionTestResponse(body)
            ? '{"status":"ok"}'
            : '{"action":"DONE","queries":[],"unresolved":[]}';
        const model = metrics.lastChatRequest.model || 'hwr-planner-mock';
        return sendJson(response, 200, {
            id: 'chatcmpl-hwr-local-test',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content,
                },
                finish_reason: 'stop',
            }],
            usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
            },
        });
    }

    metrics.requests.notFound += 1;
    return sendJson(response, 404, { error: { message: 'Mock planner route not found' } });
});

server.listen(port, '127.0.0.1', () => {
    console.log(`HWR OpenAI planner mock ready at http://127.0.0.1:${port}/v1`);
});

let shuttingDown = false;
function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(() => process.exit(0));
}

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, shutdown);
}
