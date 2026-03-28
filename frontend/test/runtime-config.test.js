const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveApiUrl, buildRuntimeConfig } = require('../runtime-config');

test('resolveApiUrl 在本地 8080 前端测试时应指向 8081 API', () => {
  assert.equal(resolveApiUrl({
    protocol: 'http:',
    hostname: 'localhost',
    port: '8080',
  }), 'http://localhost:8081/api');
});

test('resolveApiUrl 在 file 协议打开页面时应指向 8081 API', () => {
  assert.equal(resolveApiUrl({
    protocol: 'file:',
    hostname: '',
    port: '',
  }), 'http://localhost:8081/api');
});

test('resolveApiUrl 在生产同源部署时应保持相对 /api', () => {
  assert.equal(resolveApiUrl({
    protocol: 'https:',
    hostname: 'aixs.us.ci',
    port: '',
  }), '/api');
});

test('buildRuntimeConfig 应暴露统一的 apiUrl 字段', () => {
  assert.deepEqual(buildRuntimeConfig({
    protocol: 'http:',
    hostname: '127.0.0.1',
    port: '8080',
  }), {
    apiUrl: 'http://localhost:8081/api',
  });
});
