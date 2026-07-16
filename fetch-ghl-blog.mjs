#!/usr/bin/env node
// 從 GHL (iDealFlow.ai) Blog API 抓取文章，產生官網「補助專欄」的文章卡片與完整文章頁。
// 用法：
//   node fetch-ghl-blog.mjs                 # 只抓已發布 (PUBLISHED) 的文章
//   node fetch-ghl-blog.mjs --include-drafts # 連草稿一起抓（本機預覽測試用，勿部署）
// Token 讀取順序：環境變數 GHL_BLOG_TOKEN → ~/.ghl_blog_token

import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const LOCATION_ID = 'rROh0DkvDTbUH3GYRGcQ';
const BLOG_ID = 'XWT16HW0uLjXOeBXE6vG';
const API = 'https://services.leadconnectorhq.com';
const PAGE_PREFIX = 'ghl-post-';
// 對外正版網域（headless 架構：GHL 只當資料中心，SEO 正版在這個站）。
// 未來搬品牌網域時，只要改這一行，canonical / og / sitemap 全部跟著更新。
const SITE_URL = 'https://arther.zeabur.app';
const SITE_NAME = '亞瑟教練 Arthur Wu';
const LOGO_URL = `${SITE_URL}/assets/arthur.jpg`;
const INCLUDE_DRAFTS = process.argv.includes('--include-drafts');

function loadToken() {
  if (process.env.GHL_BLOG_TOKEN) return process.env.GHL_BLOG_TOKEN.trim();
  const f = join(homedir(), '.ghl_blog_token');
  if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  console.error('找不到 GHL token：請設定 GHL_BLOG_TOKEN 或建立 ~/.ghl_blog_token');
  process.exit(1);
}
const TOKEN = loadToken();

async function api(path) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Version: '2021-07-28',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`GHL API ${res.status}: ${await res.text()}`);
  return res.json();
}

const esc = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};

async function fetchPosts() {
  const statuses = INCLUDE_DRAFTS ? ['PUBLISHED', 'DRAFT'] : ['PUBLISHED'];
  const all = [];
  for (const status of statuses) {
    for (let offset = 0; ; offset += 50) {
      const d = await api(
        `/blogs/posts/all?locationId=${LOCATION_ID}&blogId=${BLOG_ID}&limit=50&offset=${offset}&status=${status}`
      );
      all.push(...(d.blogs ?? []));
      if ((d.blogs ?? []).length < 50) break;
    }
  }
  // 逐篇抓完整內容（含 rawHTML）
  const full = [];
  for (const p of all) {
    const d = await api(`/blogs/posts/${p._id}?locationId=${LOCATION_ID}`);
    full.push({ ...p, ...d.blogPost, categories: p.categories });
  }
  // 新的在前
  full.sort((a, b) => new Date(b.publishedAt || b.updatedAt) - new Date(a.publishedAt || a.updatedAt));
  return full;
}

const readMins = (p) => (p.readTimeInMinutes ? `・${Math.ceil(p.readTimeInMinutes)} 分鐘閱讀` : '');

// GHL 的 custom-code 區塊：真正內容以轉義 HTML 存在 data-content 屬性，
// 前台渲染時展開；這裡做同樣的事，並移除編輯器佔位元素。
const unescAttr = (s) =>
  s
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');

const cleanRawHTML = (html) =>
  (html || '').replace(
    /<div[^>]*data-code-embed-container[^>]*>\s*<div[^>]*data-code-embed-placeholder[^>]*>[^<]*<\/div>\s*<\/div>/g,
    (m) => {
      const content = m.match(/data-content="([^"]*)"/);
      return content ? unescAttr(content[1]) : '';
    }
  );

// 對外正版網址（headless：SEO 權重集中在這裡）
function canonicalUrl(p) {
  return `${SITE_URL}/${PAGE_PREFIX}${p.urlSlug}.html`;
}

// BlogPosting 結構化資料，讓 Google 認得作者/日期/圖片/發布者
function articleJsonLd(p) {
  const url = canonicalUrl(p);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: p.title,
    description: p.description,
    image: p.imageUrl || LOGO_URL,
    author: { '@type': 'Person', name: '亞瑟教練 Arthur Wu' },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: LOGO_URL },
    },
    datePublished: p.publishedAt || p.updatedAt || undefined,
    dateModified: p.updatedAt || p.publishedAt || undefined,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
  };
  // JSON-LD 直接內嵌，跳脫 < 避免提早結束 script
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function articlePage(p) {
  const cat = p.categories?.[0]?.label || '補助專欄';
  const date = fmtDate(p.publishedAt || p.updatedAt);
  const mins = readMins(p);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<meta charset="utf-8">
<title>${esc(p.title)}｜亞瑟教練</title>
<meta name="description" content="${esc(p.description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${canonicalUrl(p)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${canonicalUrl(p)}">
<meta property="og:image" content="${esc(p.imageUrl || LOGO_URL)}">
<meta property="article:published_time" content="${esc(p.publishedAt || p.updatedAt || '')}">
<meta property="article:modified_time" content="${esc(p.updatedAt || p.publishedAt || '')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${esc(p.imageUrl || LOGO_URL)}">
<script type="application/ld+json">${articleJsonLd(p)}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=Noto+Serif+TC:wght@600;700;900&display=swap" rel="stylesheet">
<style>
  body { margin: 0; background: #fff; font-family: 'Noto Sans TC', sans-serif; color: #1C2635; }
  a { color: #B8913D; text-decoration: none; }
  a:hover { color: #96742C; }
  .ghl-article { font-size: 17px; line-height: 2.1; color: #333D4B; }
  .ghl-article h1, .ghl-article h2 { font-family: 'Noto Serif TC', serif; font-weight: 900; color: #0B1D33; line-height: 1.5; margin: 48px 0 20px; }
  .ghl-article h1 { font-size: 32px; }
  .ghl-article h2 { font-size: 28px; }
  .ghl-article h3 { font-family: 'Noto Serif TC', serif; font-size: 22px; font-weight: 900; color: #0B1D33; margin: 40px 0 16px; }
  .ghl-article p { margin: 0 0 28px; }
  .ghl-article img { max-width: 100%; height: auto; border-radius: 12px; }
  .ghl-article ul, .ghl-article ol { margin: 0 0 28px; padding-left: 28px; }
  .ghl-article li { margin-bottom: 10px; }
  .ghl-article blockquote { border-left: 4px solid #C9A24B; margin: 0 0 28px; padding: 8px 0 8px 24px; color: #5C6675; background: #F8F6F1; border-radius: 0 8px 8px 0; }
  .ghl-article table { width: 100%; border-collapse: collapse; margin: 0 0 28px; font-size: 15px; }
  .ghl-article th, .ghl-article td { border: 1px solid #E7E1D4; padding: 10px 14px; text-align: left; }
  .ghl-article th { background: #F8F6F1; color: #0B1D33; }
  @media (max-width: 900px) {
    nav { flex-wrap: wrap !important; height: auto !important; padding: 12px 16px !important; row-gap: 8px !important; }
    nav > div { flex-wrap: wrap !important; gap: 8px 14px !important; font-size: 13px !important; }
    section, header, footer, article { padding-left: 20px !important; padding-right: 20px !important; }
    h1 { font-size: 32px !important; }
    h2 { font-size: 26px !important; }
    div[style*="grid-template-columns"], a[style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
    .rwd-col { flex-direction: column !important; align-items: center !important; text-align: center !important; }
  }
</style>
</helmet>

<nav style="position:sticky;top:0;z-index:50;background:#0B1D33;display:flex;align-items:center;justify-content:space-between;padding:0 48px;height:72px;box-shadow:0 2px 12px rgba(7,21,39,0.35)">
  <a href="index.html" style="display:flex;align-items:baseline;gap:10px;color:#fff">
    <span style="font-family:'Noto Serif TC',serif;font-size:22px;font-weight:900;color:#fff">亞瑟教練</span>
    <span style="font-size:12px;letter-spacing:0.18em;color:#C9A24B;font-weight:700">ARTHUR WU</span>
  </a>
  <div style="display:flex;align-items:center;gap:32px;font-size:15px;font-weight:500">
    <a href="index.html" style="color:#E8E4DB" style-hover="color:#C9A24B">首頁</a>
    <a href="about.html" style="color:#E8E4DB" style-hover="color:#C9A24B">關於教練</a>
    <a href="services.html" style="color:#E8E4DB" style-hover="color:#C9A24B">課程服務</a>
    <a href="testimonials.html" style="color:#E8E4DB" style-hover="color:#C9A24B">學員見證</a>
    <a href="blog.html" style="color:#C9A24B;border-bottom:2px solid #C9A24B;padding-bottom:2px">補助專欄</a>
    <a href="faq.html" style="color:#E8E4DB" style-hover="color:#C9A24B">常見問題</a>
    <a href="booking.html" style="color:#0B1D33;background:#fff;padding:10px 20px;border-radius:6px;font-weight:700" style-hover="background:#E8E4DB">預約諮詢</a>
    <a href="index.html#signup" style="color:#071527;background:#C9A24B;padding:10px 20px;border-radius:6px;font-weight:900" style-hover="background:#D9B45E">🔥 報名說明會</a>
  </div>
</nav>

<!-- ARTICLE HEADER -->
<header style="background:linear-gradient(160deg,#0B1D33 0%,#071527 70%);color:#fff;padding:88px 48px">
  <div style="max-width:760px;margin:0 auto">
    <a href="blog.html" style="font-size:14px;font-weight:700;color:#C9A24B">← 回補助專欄</a>
    <div style="font-size:14px;color:#7D8A9B;margin:24px 0 16px">${esc(cat)}・${date}${mins}</div>
    <h1 style="font-family:'Noto Serif TC',serif;font-size:44px;line-height:1.5;font-weight:900;margin:0">${esc(p.title)}</h1>
  </div>
</header>

${p.imageUrl ? `<!-- COVER -->
<section style="padding:56px 48px 0">
  <div style="max-width:760px;margin:0 auto">
    <img src="${esc(p.imageUrl)}" alt="${esc(p.imageAltText || p.title)}" style="width:100%;border-radius:16px;display:block">
  </div>
</section>` : ''}

<!-- ARTICLE BODY -->
<article class="ghl-article" style="padding:56px 48px 80px;max-width:760px;margin:0 auto">
${cleanRawHTML(p.rawHTML) || `<p>${esc(p.description)}</p>`}
</article>

<!-- AUTHOR BOX -->
<section style="padding:0 48px 80px">
  <div class="rwd-col" style="max-width:760px;margin:0 auto;background:#0B1D33;border-radius:16px;padding:40px;display:flex;gap:32px;align-items:center;color:#fff">
    <img src="assets/arthur.jpg" alt="亞瑟教練" style="width:96px;height:96px;object-fit:cover;object-position:top;border-radius:100px;flex-shrink:0">
    <div style="flex:1">
      <div style="font-family:'Noto Serif TC',serif;font-size:20px;font-weight:900;margin-bottom:8px">亞瑟教練 Arthur Wu</div>
      <p style="font-size:14px;line-height:1.8;color:#B9C2CE;margin:0 0 16px">政府補助申請實戰專家。親自取得 5 項指標性補助與投資案，輔導學員累計通過補助超過 1,000 萬。</p>
      <a href="index.html#signup" style="font-size:14px;font-weight:900;color:#C9A24B">報名免費說明會 →</a>
    </div>
  </div>
</section>

<!-- FOOTER -->
<footer style="background:#071527;color:#7D8A9B;padding:64px 48px 40px">
  <div style="max-width:1200px;margin:0 auto">
    <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:48px;padding-bottom:40px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div>
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:16px">
          <span style="font-family:'Noto Serif TC',serif;font-size:20px;font-weight:900;color:#fff">亞瑟教練</span>
          <span style="font-size:11px;letter-spacing:0.18em;color:#C9A24B;font-weight:700">ARTHUR WU</span>
        </div>
        <p style="font-size:14px;line-height:1.9;margin:0;max-width:360px">政府補助申請實戰專家・企業商業變現與數位轉型顧問。幫助創業者與中小企業，用政府的資源加速事業成長。</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;font-size:14px">
        <div style="color:#DCE2EA;font-weight:700;margin-bottom:4px">網站導覽</div>
        <a href="about.html" style="color:#7D8A9B" style-hover="color:#C9A24B">關於教練</a>
        <a href="services.html" style="color:#7D8A9B" style-hover="color:#C9A24B">課程服務</a>
        <a href="testimonials.html" style="color:#7D8A9B" style-hover="color:#C9A24B">學員見證</a>
        <a href="blog.html" style="color:#7D8A9B" style-hover="color:#C9A24B">補助專欄</a>
        <a href="faq.html" style="color:#7D8A9B" style-hover="color:#C9A24B">常見問題</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;font-size:14px">
        <div style="color:#DCE2EA;font-weight:700;margin-bottom:4px">開始行動</div>
        <a href="index.html#signup" style="color:#C9A24B;font-weight:700">🔥 報名免費說明會</a>
        <a href="booking.html" style="color:#7D8A9B" style-hover="color:#C9A24B">預約 1:1 諮詢</a>
      </div>
    </div>
    <p style="font-size:12px;line-height:1.9;margin:32px 0 0;color:#4E5B6B">【免責聲明】本文為教學示意內容。依法律規定，我們無法也不會保證您透過我們的課程、資訊或策略，能夠獲得特定金額的補助。© 2026 亞瑟教練 Arthur Wu</p>
  </div>
</footer>

</x-dc>
</body>
</html>
`;
}

const GRADIENTS = [
  'linear-gradient(135deg,#0B1D33,#1A3A5C)',
  'linear-gradient(135deg,#122B4A,#0B1D33)',
  'linear-gradient(135deg,#1A3A5C,#122B4A)',
  'linear-gradient(135deg,#0B1D33,#274A73)',
];

function card(p, i) {
  const href = `${PAGE_PREFIX}${p.urlSlug}.html`;
  const cat = p.categories?.[0]?.label || '補助專欄';
  const date = fmtDate(p.publishedAt || p.updatedAt);
  const mins = readMins(p);
  const cover = p.imageUrl
    ? `<div style="height:180px;background:url('${esc(p.imageUrl)}') center/cover no-repeat"></div>`
    : `<div style="height:180px;background:${GRADIENTS[i % GRADIENTS.length]};display:flex;align-items:center;justify-content:center">
        <span style="font-family:'Noto Serif TC',serif;font-size:28px;font-weight:900;color:#C9A24B">${esc(cat)}</span>
      </div>`;
  return `    <a href="${href}" style="background:#fff;border:1px solid #E7E1D4;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;color:#1C2635" style-hover="box-shadow:0 12px 32px rgba(11,29,51,0.12);color:#1C2635">
      ${cover}
      <div style="padding:32px;display:flex;flex-direction:column;gap:12px;flex:1">
        <div style="font-size:13px;color:#8A93A1">${date}・${esc(cat)}${mins}</div>
        <h3 style="font-size:20px;font-weight:900;line-height:1.6;margin:0;color:#0B1D33">${esc(p.title)}</h3>
        <p style="font-size:14px;line-height:1.8;color:#5C6675;margin:0;flex:1">${esc(p.description)}</p>
        <span style="font-size:14px;font-weight:900;color:#B8913D">閱讀全文 →</span>
      </div>
    </a>`;
}

async function main() {
  console.log(`抓取 GHL blog 文章（${INCLUDE_DRAFTS ? '含草稿' : '僅已發布'}）…`);
  const posts = await fetchPosts();
  console.log(`取得 ${posts.length} 篇文章`);

  // 清掉先前產生的文章頁，再重新產生
  for (const f of readdirSync(ROOT)) {
    if (f.startsWith(PAGE_PREFIX) && f.endsWith('.html')) unlinkSync(join(ROOT, f));
  }
  for (const p of posts) {
    const file = `${PAGE_PREFIX}${p.urlSlug}.html`;
    writeFileSync(join(ROOT, file), articlePage(p));
    console.log(`  ✓ ${file}（${p.status}）${p.title}`);
  }

  // 更新 blog.html 卡片區
  const blogFile = join(ROOT, 'blog.html');
  const html = readFileSync(blogFile, 'utf8');
  const cards = posts.map(card).join('\n');
  if (!/<!-- GHL_POSTS_START -->[\s\S]*?<!-- GHL_POSTS_END -->/.test(html)) {
    console.error('錯誤：blog.html 找不到 GHL_POSTS 標記，卡片未插入');
    process.exit(1);
  }
  const updated = html.replace(
    /<!-- GHL_POSTS_START -->[\s\S]*?<!-- GHL_POSTS_END -->/,
    `<!-- GHL_POSTS_START -->\n${cards}\n    <!-- GHL_POSTS_END -->`
  );
  writeFileSync(blogFile, updated);
  console.log(`✅ blog.html 已更新（${posts.length} 張文章卡片）`);

  // 產生 sitemap.xml（靜態主頁 + 每篇文章）與 robots.txt
  writeSitemap(posts);
}

function writeSitemap(posts) {
  const staticPages = [
    { loc: '/', pri: '1.0' },
    { loc: '/about.html', pri: '0.8' },
    { loc: '/services.html', pri: '0.8' },
    { loc: '/testimonials.html', pri: '0.7' },
    { loc: '/blog.html', pri: '0.9' },
    { loc: '/faq.html', pri: '0.6' },
    { loc: '/booking.html', pri: '0.6' },
  ];
  const today = new Date().toISOString().slice(0, 10);
  const urls = [];
  for (const s of staticPages) {
    urls.push(`  <url><loc>${SITE_URL}${s.loc}</loc><lastmod>${today}</lastmod><priority>${s.pri}</priority></url>`);
  }
  for (const p of posts) {
    const lastmod = (p.updatedAt || p.publishedAt || '').slice(0, 10) || today;
    urls.push(`  <url><loc>${canonicalUrl(p)}</loc><lastmod>${lastmod}</lastmod><priority>0.7</priority></url>`);
  }
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);

  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
  writeFileSync(join(ROOT, 'robots.txt'), robots);
  console.log(`✅ sitemap.xml（${staticPages.length + posts.length} 個網址）與 robots.txt 已產生`);
}

main().catch((e) => {
  console.error('❌ 抓取失敗：', e.message);
  process.exit(1);
});
