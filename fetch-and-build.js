#!/usr/bin/env node
const { chromium } = require('playwright');
const https = require('https');
const fs = require('fs');

function escape(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function fetch(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch { rej(new Error('parse error')); } });
    }).on('error', rej);
  });
}

async function main() {
  console.log('🔍 Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Inject session cookies if available (X_SESS secret)
  const sess = process.env.X_SESS;
  if (sess) {
    try {
      const cookies = JSON.parse(Buffer.from(sess, 'base64').toString());
      await page.context().addCookies(cookies);
      console.log('✅ X session cookies loaded');
    } catch(e) { console.log('⚠️  Cookie parse failed, using anonymous'); }
  }

  // Scrape X
  try {
    await page.goto('https://x.com/home', { timeout: 15000 });
    await page.waitForTimeout(3000);
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(700);
    }
    var tweets = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-testid="tweet"]')).slice(0,10).map(t => {
        const a = t.querySelector('[data-testid="User-Name"]');
        const tm = t.querySelector('time');
        const raw = t.innerText;
        const text = raw.replace(a?.innerText||'','').replace(tm?.innerText||'','').trim();
        const parts = (a?.innerText||'').split('\n').filter(Boolean);
        return { author: parts[0]||'?', handle: '@'+(parts[1]||'').replace('@',''), time: tm?.dateTime||'', text: text.substring(0,300) };
      }).filter(x => x.text && x.text.length > 20);
    });
  } catch(e) { console.log('⚠️  X scrape error:', e.message); var tweets = []; }

  var trends = [];
  try {
    await page.goto('https://x.com/explore', { timeout: 10000 });
    await page.waitForTimeout(2000);
    trends = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-testid="trend"]')).slice(0,8).map(t => t.innerText.replace(/\n/g,' ').trim()).filter(Boolean);
    });
  } catch(e) { console.log('⚠️  Trends error:', e.message); }

  await browser.close();

  // Generate HTML
  const date = new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});
  const dateShort = new Date().toISOString().substring(0,10);

  const tweetHtml = tweets.map(t => `
    <div class="tweet-card">
      <div class="tweet-meta">
        <span class="tweet-author">${escape(t.author)}</span>
        <span class="tweet-handle">${escape(t.handle)}</span>
        <span class="tweet-time">${t.time ? new Date(t.time).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'}) : ''}</span>
      </div>
      <div class="tweet-text">${escape(t.text)}</div>
    </div>`).join('');

  const trendHtml = trends.map((t,i) => `<span class="trend-tag${i<2?' hot':''}">${escape(t)}</span>`).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>X Daily · 热点简报</title><style>
:root{--bg:#0d1117;--bg2:#161b22;--accent:#00ff9d;--accent-dim:rgba(0,255,157,.12);--text:#fff;--text2:#8b949e;--muted:#484f58;--border:#30363d;--r:12px}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;line-height:1.6;min-height:100vh}
header{position:sticky;top:0;z-index:100;background:rgba(13,17,23,.9);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);padding:0 24px}
.inner{max-width:900px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;height:60px}
.logo{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px}
.logo-icon{width:32px;height:32px;background:var(--accent);border-radius:8px;display:flex;align-items:center;justify-content:center}
.badge{background:var(--accent-dim);border:1px solid var(--accent);color:var(--accent);font-size:12px;padding:4px 10px;border-radius:20px;font-weight:600}
main{max-width:900px;margin:0 auto;padding:32px 24px 80px}
.date-label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.date-title{font-size:28px;font-weight:700;margin-bottom:28px}
.date-title span{color:var(--accent)}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:32px}
.stat{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:16px;text-align:center}
.stat-num{font-size:28px;font-weight:700;color:var(--accent)}
.stat-label{font-size:12px;color:var(--text2);margin-top:2px}
.sec{font-size:14px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px}
.sec::before{content:'';width:3px;height:14px;background:var(--accent);border-radius:2px}
.trends{margin-bottom:36px}
.trend-list{display:flex;flex-wrap:wrap;gap:8px}
.trend-tag{background:var(--bg2);border:1px solid var(--border);color:var(--text2);padding:6px 14px;border-radius:20px;font-size:13px;transition:all .2s}
.trend-tag:hover,.trend-tag.hot{border-color:var(--accent);color:var(--accent);background:var(--accent-dim)}
.tweets{display:flex;flex-direction:column;gap:12px}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:20px;transition:all .2s;position:relative;overflow:hidden}
.card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--accent);opacity:0;transition:opacity .2s}
.card:hover{border-color:var(--accent);transform:translateX(4px)}
.card:hover::before{opacity:1}
.card-meta{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.author{font-weight:600;font-size:14px}
.handle,.time{color:var(--muted);font-size:13px}
.time{margin-left:auto;font-size:12px}
.card-text{font-size:14px;color:var(--text2);line-height:1.7}
.insight{background:linear-gradient(135deg,rgba(0,255,157,.08),rgba(0,255,157,.02));border:1px solid rgba(0,255,157,.25);border-radius:var(--r);padding:24px;margin-top:36px}
.insight-title{font-size:13px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px}
.insight-text{font-size:14px;color:var(--text2);line-height:1.8}
.insight-text strong{color:var(--text)}
footer{text-align:center;padding:24px;color:var(--muted);font-size:12px;border-top:1px solid var(--border);margin-top:40px}
@media(max-width:600px){.stats{grid-template-columns:repeat(3,1fr);gap:8px}.stat-num{font-size:20px}.date-title{font-size:22px}.card{padding:16px}}
</style></head>
<body>
<header><div class="inner"><div class="logo"><div class="logo-icon">🦞</div><span>X Daily</span></div><div class="badge" id="updateTime">${date}</div></div></header>
<main>
<div style="margin-bottom:28px"><div class="date-label">每日热点简报</div><div class="date-title">${dateShort} <span>自动更新</span></div></div>
<div class="stats">
<div class="stat"><div class="stat-num">${tweets.length}</div><div class="stat-label">精选推文</div></div>
<div class="stat"><div class="stat-num">${trends.length}</div><div class="stat-label">热点话题</div></div>
<div class="stat"><div class="stat-num">—</div><div class="stat-label">AI 相关</div></div>
</div>
${trends.length ? `<div class="trends"><div class="sec">🔥 热门话题</div><div class="trend-list">${trendHtml}</div></div>` : ''}
<div><div class="sec">📋 For You 时间线精选</div><div class="tweets">
${tweetHtml || '<div style="color:var(--muted);padding:20px">暂无数据</div>'}
</div></div>
<div class="insight"><div class="insight-title">💡 今日洞察</div><div class="insight-text">抓取时间：${date}</div></div>
</main>
<footer>X Daily · 由 <strong style="color:var(--accent)">OpenClaw</strong> 驱动 · 数据来源：X (Twitter)</footer>
</body></html>`;

  fs.writeFileSync('index.html', html);
  console.log(`✅ Done: ${tweets.length} tweets, ${trends.length} trends`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
