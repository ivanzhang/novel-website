(function initNovelRuntimeConfig(globalScope) {
  function isLocalhost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1';
  }

  function resolveApiUrl(locationLike) {
    const locationValue = locationLike || {};
    const protocol = String(locationValue.protocol || '');
    const hostname = String(locationValue.hostname || '');
    const port = String(locationValue.port || '');

    // 本地测试统一约定：前端固定跑在 8080，后端 API 固定跑在 8081。
    if (protocol === 'file:' || (isLocalhost(hostname) && port === '8080')) {
      return 'http://localhost:8081/api';
    }

    // 生产或同源调试场景继续走相对路径，交给反向代理或后端静态服务处理。
    return '/api';
  }

  function buildRuntimeConfig(locationLike) {
    return {
      apiUrl: resolveApiUrl(locationLike),
    };
  }

  const runtimeConfig = buildRuntimeConfig(globalScope.location);
  globalScope.NOVEL_APP_CONFIG = runtimeConfig;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildRuntimeConfig,
      resolveApiUrl,
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

/*
用法示例：

<script src="runtime-config.js"></script>
<script>
  const API_URL = window.NOVEL_APP_CONFIG.apiUrl;
  fetch(`${API_URL}/health`);
</script>
*/
