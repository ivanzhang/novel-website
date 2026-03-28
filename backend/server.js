const { loadBackendEnv } = require('./load-env');
const { createApp } = require('./app');

loadBackendEnv();

const app = createApp();
const PORT = process.env.PORT || 8081;

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
