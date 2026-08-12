import assert from 'node:assert/strict';

import { normalizeSearxngBaseUrl } from '../searxng-url.js';

assert.equal(normalizeSearxngBaseUrl(''), '');
assert.equal(normalizeSearxngBaseUrl(' 127.0.0.1:8080 '), 'http://127.0.0.1:8080');
assert.equal(normalizeSearxngBaseUrl('localhost:8888'), 'http://localhost:8888');
assert.equal(normalizeSearxngBaseUrl('[::1]:8080'), 'http://[::1]:8080');
assert.equal(normalizeSearxngBaseUrl('http://127.0.0.1:8080/'), 'http://127.0.0.1:8080');
assert.equal(normalizeSearxngBaseUrl('https://search.example.test'), 'https://search.example.test');
assert.equal(
    normalizeSearxngBaseUrl('http://127.0.0.1:8080/search?q=DeepSeek&format=json#results'),
    'http://127.0.0.1:8080',
);
assert.equal(
    normalizeSearxngBaseUrl('localhost:8888/search?q=Claude'),
    'http://localhost:8888',
);

for (const [value, message] of [
    ['search.example.test:8080', /缺少 http:\/\/ 或 https:\/\//u],
    ['ftp://127.0.0.1:8080', /只允许 http:\/\/ 或 https:\/\//u],
    ['http://user:pass@127.0.0.1:8080', /不能内嵌用户名或密码/u],
    ['http://127.0.0.1:8080/searxng', /站点根地址/u],
    ['http://127.0.0.1:8080/?q=test', /不能包含查询参数/u],
    ['http://127.0.0.1:8080/#settings', /不能包含查询参数/u],
    ['http://127.0.0.1:99999', /格式无效/u],
    ['', /不能为空/u],
]) {
    assert.throws(
        () => normalizeSearxngBaseUrl(value, { allowBlank: false }),
        message,
        value,
    );
}

console.log('SearXNG Base URL normalization: all assertions passed');
