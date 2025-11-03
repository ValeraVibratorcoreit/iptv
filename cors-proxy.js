const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 8080;

app.use('/proxy/**', createProxyMiddleware({
  router: (req) => {
    const targetUrl = req.originalUrl.substring('/proxy/'.length);
    console.log(`Routing to: ${targetUrl}`);
    return targetUrl;
  },
  changeOrigin: true,
  secure: false,
  onProxyReq: (proxyReq, req, res) => {
    const target = new URL(req.originalUrl.substring('/proxy/'.length));
    proxyReq.setHeader('Host', target.host);
    proxyReq.setHeader('Origin', target.origin);
    proxyReq.path = target.pathname + target.search;
    console.log(`Проксируем запрос: ${req.method} ${req.originalUrl} -> ${target.protocol}//${target.host}${proxyReq.path}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log('Adding CORS headers to proxy response.');
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'X-Requested-With, Content-Type, Authorization';
  },
  onError: (err, req, res) => {
    console.error('Ошибка прокси:', err);
    if (res && !res.headersSent) {
      res.status(500).send('Прокси-сервер не смог обработать запрос.');
    } else {
      console.error('Не удалось отправить ошибку клиенту, res отсутствует или заголовки уже отправлены.');
    }
  },
}));

app.get('/', (req, res) => {
  res.send('CORS Proxy Server is running!');
});

app.listen(PORT, () => {
  console.log(`CORS Proxy Server запущен на порту ${PORT}`);
  console.log(`Используйте /proxy для перенаправления запросов. Например: https://valeravibrator.space/proxy/ваш_целевой_url`);
});