const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 8080;

// Прокси для обхода CORS
app.use('/proxy/**', createProxyMiddleware({
  router: (req) => {
    const targetUrl = req.originalUrl.substring('/proxy/'.length);
    console.log(`Routing to: ${targetUrl}`);
    return targetUrl;
  },
  changeOrigin: true,
  onProxyReq: (proxyReq, req, res) => {
    const target = new URL(req.originalUrl.substring('/proxy/'.length));
    proxyReq.setHeader('Host', target.host);
    proxyReq.setHeader('Origin', target.origin);
    // Удаляем префикс /proxy из пути запроса, так как router уже его учел
    proxyReq.path = target.pathname + target.search;
    console.log(`Проксируем запрос: ${req.method} ${req.originalUrl} -> ${target.protocol}//${target.host}${proxyReq.path}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log('Adding CORS headers to proxy response.');
    // Добавляем CORS заголовки к ответу прокси-сервера
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'X-Requested-With, Content-Type, Authorization';
  },
  onError: (err, req, res) => {
    console.error('Ошибка прокси:', err);
    res.status(500).send('Прокси-сервер не смог обработать запрос.');
  },
}));

// Базовый маршрут для проверки работы сервера
app.get('/', (req, res) => {
  res.send('CORS Proxy Server is running!');
});

app.listen(PORT, () => {
  console.log(`CORS Proxy Server запущен на порту ${PORT}`);
  console.log(`Используйте /proxy для перенаправления запросов. Например: http://localhost:${PORT}/proxy/ваш_целевой_url`);
});
