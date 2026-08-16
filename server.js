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
let workerIndex = 0;
const getWorker = () => CF_WORKER_URLS[workerIndex++ % CF_WORKER_URLS.length];

// 通信安定化エージェント
const proxyAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 600,
    timeout: 60000
});

app.use(express.raw({ type: '*/*', limit: '50mb' }));

// ==========================================
// 2. iPad / Safari & 寿司打 WebGL 起動コード
// ==========================================
const INJECT_CODE = `
<style>
  /* Canvasおよびゲームコンテナの絶対表示 */
  #gameContainer, canvas { 
    display: block !important; 
    visibility: visible !important; 
    opacity: 1 !important; 
    touch-action: manipulation !important; 
  }
  body { background: #000 !important; color: #fff !important; }
</style>
<script>
  (function() {
    // 1. iPad / Safari 用 WebAudio・WebGL一時停止解除（タップ時に自動起動）
    const unlockAudio = function() {
      if (window.AudioContext || window.webkitAudioContext) {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
      }
    };
    document.addEventListener('touchstart', unlockAudio, { passive: true });
    document.addEventListener('click', unlockAudio, { passive: true });

    // 2. タッチスクロール警告の防止
    window.addEventListener('touchmove', function(e) {}, { passive: true });
  })();
</script>
`;

// ==========================================
// 3. メインプロキシロジック (Render → Cloudflare Workers)
// ==========================================
app.all('*', async (req, res) => {
    if (req.url === '/favicon.ico') return res.status(204).end();

    const selectedWorker = getWorker();
    const targetUrl = selectedWorker + req.url;

    // ヘッダー整理
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    headers['X-Forwarded-Host'] = req.get('host');
    headers['X-Forwarded-Proto'] = 'https';

    try {
        const response = await fetch(targetUrl, {
            method: req.method,
            headers: headers,
            agent: proxyAgent,
            compress: true, // ★Gzipを安全に自動解凍させて文字化けを完全防止★
            redirect: 'follow',
            body: (req.method !== 'GET' && req.method !== 'HEAD') ? req.body : undefined
        });

        // レスポンスヘッダーの設定（解凍済みを渡すため content-encoding は削除）
        response.headers.forEach((v, k) => {
            const key = k.toLowerCase();
            if (!['content-encoding', 'transfer-encoding', 'content-length', 'content-security-policy', 'x-frame-options'].includes(key)) {
                res.set(k, v);
            }
        });

        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "*");
        res.set("Access-Control-Expose-Headers", "*");

        const contentType = response.headers.get("content-type") || "";

        // --- MIME タイプの精密補正 ---
        if (req.url.includes('.framework')) {
            res.set('Content-Type', 'application/javascript; charset=utf-8');
        } else if (req.url.includes('.wasm') || req.url.endsWith('.wasm')) {
            res.set('Content-Type', 'application/wasm');
        } else if (req.url.includes('.data') || req.url.endsWith('.unityweb')) {
            res.set('Content-Type', 'application/octet-stream');
        } else if (req.url.endsWith('.json')) {
            res.set('Content-Type', 'application/json; charset=utf-8');
        } else if (req.url.endsWith('.js')) {
            res.set('Content-Type', 'application/javascript; charset=utf-8');
        } else if (req.url.endsWith('.css')) {
            res.set('Content-Type', 'text/css; charset=utf-8');
        }

        // --- HTMLの場合：Safari補正コード注入 ＆ UTF-8で文字化け防止 ---
        if (contentType.includes("text/html") || req.url === '/' || req.url.includes('play.html')) {
            let text = await response.text();

            if (text.includes('<head>')) {
                text = text.replace('<head>', '<head>' + INJECT_CODE);
            } else {
                text = INJECT_CODE + text;
            }

            res.set("Content-Type", "text/html; charset=utf-8");
            return res.status(response.status).send(text);
        }

        // --- JS / JSON / CSS などのテキストデータ ---
        if (contentType.includes("javascript") || contentType.includes("json") || contentType.includes("text")) {
            let text = await response.text();
            return res.status(response.status).send(text);
        }

        // --- ゲームアセット・バイナリデータの場合：Bufferで安全転送 ---
        if (req.url.includes('_p_') || /\.(wasm|data|unityweb)$/i.test(req.url)) {
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
        }

        const buffer = await response.buffer();
        return res.status(response.status).send(buffer);

    } catch (error) {
        console.error('Fatal Error:', error.message);
        if (!res.headersSent) res.status(502).send("Sushida Render Proxy Error");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`--- SUSHIDA RENDER ENGINE ONLINE ---`));
