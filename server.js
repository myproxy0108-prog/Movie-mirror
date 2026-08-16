const express = require('express');
const fetch = require('node-fetch');
const https = require('https');
const app = express();

// ==========================================
// 1. 設定：心臓部（Cloudflare Workers）
// ==========================================
const CF_WORKER_URLS = [
    "https://wolf-word.myproxy0108.workers.dev/",
    "https://wolf-word.nemu0001.workers.dev/"
];

function getWorkerForUser(ip) {
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
        hash = ip.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % CF_WORKER_URLS.length;
    return CF_WORKER_URLS[index];
}

// 通信安定化エージェント
const proxyAgent = new https.Agent({ 
    keepAlive: true, 
    maxSockets: 512, 
    timeout: 60000 
});

// ==========================================
// 3. メインプロキシ機能（http-proxy-middleware）
// ==========================================
// 注意: app.use('*') ではなく app.use('/') にすることでパスの破損(404)を防ぎます
app.use('/', createProxyMiddleware({
    // リクエストが来た人のIPを見て、担当のWorkerを決める
    router: (req) => {
        // Renderが取得したユーザーのIPアドレス
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        return getWorkerForUser(ip);
    },
    changeOrigin: true,
    ws: true, // WebSocket (ゲームのリアルタイム通信) を維持
    agent: proxyAgent,
    
    onProxyReq: (proxyReq, req, res) => {
        // Workerに「Renderのドメイン」を教えて、正しく書き換えさせる
        proxyReq.setHeader('X-Forwarded-Host', req.get('host'));
        proxyReq.setHeader('X-Forwarded-Proto', 'https');
        // Workerが勝手に圧縮して文字化けするのを防ぐ
        proxyReq.setHeader('Accept-Encoding', 'identity');
    },
    
    onProxyRes: (proxyRes, req, res) => {
        // 本家の余計なセキュリティ制限を外して、Render上で安全に表示させる
        delete proxyRes.headers['content-security-policy'];
        delete proxyRes.headers['x-frame-options'];
        proxyRes.headers['access-control-allow-origin'] = '*';
        
        // Content-Lengthを消すことで、「途中で表示が切れるバグ」を防ぐ
        delete proxyRes.headers['content-length'];
    },
    
    logLevel: 'error' // ログの出すぎを防ぐ
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Stable Cluster Proxy running on port ${PORT}`));
