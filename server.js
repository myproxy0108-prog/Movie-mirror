const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const https = require('https');

const app = express();

// ==========================================
// 1. 設定：心臓部（Cloudflare Workers クラスター）
// ==========================================
const CF_WORKER_URLS = [
    "https://wolf-word.myproxy0108.workers.dev/",
    "https://wolf-word.nemu0001.workers.dev/"
];

// IPアドレスから担当Workerを一意に特定するハッシュ関数
function getWorkerForUser(ip) {
    // x-forwarded-for がカンマ区切りの場合は先頭のIPを抽出
    const cleanIp = (ip || '').split(',')[0].trim() || 'unknown';
    let hash = 0;
    for (let i = 0; i < cleanIp.length; i++) {
        hash = (hash << 5) - hash + cleanIp.charCodeAt(i);
        hash |= 0; // 32bit integer に変換
    }
    const index = Math.abs(hash) % CF_WORKER_URLS.length;
    return CF_WORKER_URLS[index];
}

// 通信安定化エージェント（HTTPS Socketの再利用）
const proxyAgent = new https.Agent({ 
    keepAlive: true, 
    maxSockets: 512, 
    timeout: 60000 
});

// ==========================================
// 2. ヘルスチェック（Render / PaaS モニタリング用）
// ==========================================
app.get('/healthz', (req, res) => res.status(200).send('OK'));

// ==========================================
// 3. メインプロキシ機能（http-proxy-middleware）
// ==========================================
const proxyMiddleware = createProxyMiddleware({
    // リクエストのIPアドレスを見て担当Workerを振り分ける
    router: (req) => {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        return getWorkerForUser(ip);
    },
    changeOrigin: true,
    ws: true, // WebSocket を有効化
    agent: proxyAgent,
    
    onProxyReq: (proxyReq, req, res) => {
        // Workerに「Renderのホスト名」を正しく伝える
        const host = req.get('host');
        if (host) proxyReq.setHeader('X-Forwarded-Host', host);
        proxyReq.setHeader('X-Forwarded-Proto', 'https');
        
        // 圧縮データによるエンコーディング不一致・文字化けを防止
        proxyReq.setHeader('Accept-Encoding', 'identity');
    },
    
    onProxyRes: (proxyRes, req, res) => {
        // セキュリティ制約を解除して表示を許可
        delete proxyRes.headers['content-security-policy'];
        delete proxyRes.headers['x-frame-options'];
        proxyRes.headers['access-control-allow-origin'] = '*';
        
        // 転送途切れバグ防止
        delete proxyRes.headers['content-length'];
        delete proxyRes.headers['content-encoding'];
    },
    
    logLevel: 'error'
});

app.use('/', proxyMiddleware);

// ==========================================
// 4. サーバー起動 ＆ WebSocket 接続バインド
// ==========================================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Stable Cluster Proxy running on port ${PORT}`);
});

// ★【最重要】HTTP Upgrade イベントをプロキシに接続して WebSocket を確立する★
server.on('upgrade', (req, socket, head) => {
    proxyMiddleware.upgrade(req, socket, head);
});
