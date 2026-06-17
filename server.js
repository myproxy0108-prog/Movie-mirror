const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();

const CF_WORKER_URL = "https://bloxd-io.myproxy0108.workers.dev";

app.use('*', createProxyMiddleware({
    target: CF_WORKER_URL,
    changeOrigin: true,
    ws: true, // これが重要！WebSocketを有効にする
    onProxyReq: (proxyReq, req, res) => {
        proxyReq.setHeader('X-Forwarded-Host', req.get('host'));
        proxyReq.setHeader('X-Forwarded-Proto', 'https');
    },
    logLevel: 'debug'
}));

app.listen(process.env.PORT || 3000);
