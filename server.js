const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();

const CF_WORKER_URL = "https://proxy-api.myproxy0108.workers.dev";

// 1. 検索・URL入力画面 (トップページ)
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Search Portal</title>
        <style>
            body { background: #121212; color: white; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            h1 { font-size: 2.5rem; margin-bottom: 20px; color: #00d4ff; }
            .search-box { background: #1e1e1e; padding: 30px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); width: 90%; max-width: 500px; text-align: center; }
            input { width: 100%; padding: 12px; border-radius: 5px; border: 1px solid #333; background: #111; color: white; font-size: 16px; box-sizing: border-box; }
            button { margin-top: 15px; width: 100%; padding: 12px; border: none; border-radius: 5px; background: #00d4ff; color: black; font-weight: bold; cursor: pointer; font-size: 16px; }
            button:hover { background: #0099cc; }
            p { font-size: 12px; color: #777; margin-top: 15px; }
        </style>
    </head>
    <body>
        <h1>Portal</h1>
        <div class="search-box">
            <input type="text" id="urlInput" placeholder="https://example.com または 検索ワード" onkeydown="if(event.key==='Enter') goTo()">
            <button onclick="goTo()">サイトを開く</button>
            <p>※すべての通信はこのドメイン経由で保護されます</p>
        </div>
        <script>
            function goTo() {
                let val = document.getElementById('urlInput').value.trim();
                if (!val) return;
                if (!val.startsWith('http')) {
                    // URLでなければGoogle検索へ飛ばすプロキシ
                    val = "https://www.google.com/search?q=" + encodeURIComponent(val);
                }
                // プロキシパス /_p_/ を付けて移動
                window.location.href = "/_p_/" + val;
            }
        </script>
    </body>
    </html>
    `);
});

// 2. プロキシ中継設定 (WebSocket対応)
app.use('/_p_', createProxyMiddleware({
    target: CF_WORKER_URL,
    changeOrigin: true,
    ws: true,
    pathRewrite: (path) => path.replace('/_p_/', '/'), // Worker側には /URL の形で見せる
    onProxyReq: (proxyReq, req) => {
        proxyReq.setHeader('X-Forwarded-Host', req.get('host'));
        proxyReq.setHeader('X-Forwarded-Proto', 'https');
    },
    onProxyRes: (proxyRes) => {
        delete proxyRes.headers['content-security-policy'];
        delete proxyRes.headers['x-frame-options'];
    }
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Portal running on port ${PORT}`));
