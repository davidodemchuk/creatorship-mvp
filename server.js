import express from 'express';
import cors from 'cors';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

const VIDEO_DIR = path.join(__dirname, 'videos');
const DATA_DIR = path.join(__dirname, 'data');

// ═══ CONFIG ═══
// Set TUNNEL_URL env var when running with cloudflared
const TUNNEL_URL = process.env.TUNNEL_URL || 'http://localhost:3001';
const TT_CLIENT_KEY = 'sbawac1agovodah2p9';
const TT_CLIENT_SECRET = 'EdFAfJUJtKHXDLPgenNkHlt788y1dHZX';
const REDIRECT_URI = TUNNEL_URL + '/auth/tiktok/callback';

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function saveJson(f, d) { fs.writeFileSync(f, JSON.stringify(d, null, 2)); }
function loadJson(f) { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; }

let ttTokens = null;
try { const s = loadJson(path.join(DATA_DIR, 'tt_tokens.json')); if (s) ttTokens = s; } catch (e) {}

function getConnectedCreators() {
  const raw = loadJson(path.join(DATA_DIR, 'tt_tokens.json'));
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(c => c && (c.display_name || c.open_id));
  if (raw.creators && Array.isArray(raw.creators)) return raw.creators.filter(c => c && (c.display_name || c.open_id));
  if (raw.display_name || raw.open_id) return [raw];
  return [];
}

function isCreatorConnected(video, connectedCreators) {
  if (!connectedCreators || connectedCreators.length === 0) return false;
  const norm = (s) => (s || '').toLowerCase().trim();
  const creatorNorm = norm(video.creator);
  const handleNorm = norm((video.handle || '').replace(/^@/, ''));
  return connectedCreators.some(c => {
    const dn = norm(c.display_name || '');
    return dn && (creatorNorm === dn || handleNorm === dn);
  });
}

// ═══ HTTP HELPERS ═══
function apiFetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const o = { hostname: u.hostname, path: u.pathname + u.search, method: opts.method || 'GET', headers: { ...opts.headers } };
    if (opts.body) { o.headers['Content-Length'] = Buffer.byteLength(opts.body); if (!o.headers['Content-Type']) o.headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
    const req = mod.request(o, res => { let data = ''; res.on('data', c => data += c); res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(data.slice(0, 300))); } }); });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) { file.close(); fs.unlinkSync(dest); downloadFile(res.headers.location, dest).then(resolve).catch(reject); return; }
      res.pipe(file); file.on('finish', () => { file.close(); resolve(dest); });
    }).on('error', err => { fs.unlink(dest, () => {}); reject(err); });
  });
}

function metaPost(endpoint, params) {
  return new Promise((resolve, reject) => {
    const body = Object.entries(params).filter(([k, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v)}`).join('&');
    const o = { hostname: 'graph.facebook.com', path: '/v22.0/' + endpoint, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } };
    const req = https.request(o, res => { let data = ''; res.on('data', c => data += c); res.on('end', () => { try { const j = JSON.parse(data); if (j.error) reject(new Error(j.error.message)); else resolve(j); } catch (e) { reject(new Error(data.slice(0, 300))); } }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

function metaUploadVideo(localPath, title, token, adAccount) {
  return new Promise((resolve, reject) => {
    const videoData = fs.readFileSync(localPath);
    const boundary = '----CSB' + Date.now();
    const parts = [];
    parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n' + token + '\r\n'));
    parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="title"\r\n\r\n' + title + '\r\n'));
    parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="source"; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\n'));
    parts.push(videoData);
    parts.push(Buffer.from('\r\n--' + boundary + '--\r\n'));
    const body = Buffer.concat(parts);
    const o = { hostname: 'graph-video.facebook.com', path: '/v22.0/' + adAccount + '/advideos', method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length } };
    const req = https.request(o, res => { let data = ''; res.on('data', c => data += c); res.on('end', () => { try { const j = JSON.parse(data); if (j.error) reject(new Error(j.error.message)); else resolve(j); } catch (e) { reject(new Error(data.slice(0, 300))); } }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

function aiScore(v) { return Math.round(Math.min(Math.min((v.est_gmv || 0) / 200, 30) + Math.min((v.conv || 0) * 800, 25) + (v.hook || 50) * 0.35 + Math.min((v.views || 0) / 50000, 10), 100)); }

// ═══════════════════════════════════════════════════════════
// TIKTOK VERIFICATION FILE
// ═══════════════════════════════════════════════════════════
app.get('/auth/tiktok/callback/tiktokkMo4lcclKQtMA9J4mUi9oZCD9XrdJh5U.txt', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send('tiktok-developers-site-verification=kMo4lcclKQtMA9J4mUi9oZCD9XrdJh5U');
});

app.get('/tiktokPSdeF4BIxA7MFQOnvTIjUBTX89Ey4nnG.txt', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send('tiktok-developers-site-verification=PSdeF4BIxA7MFQOnvTIjUBTX89Ey4nnG');
});

// ═══════════════════════════════════════════════════════════
// TIKTOK CREATOR OAUTH
// ═══════════════════════════════════════════════════════════
app.get('/auth/tiktok', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const scopes = 'user.info.basic';
  const url = 'https://www.tiktok.com/v2/auth/authorize/?client_key=' + TT_CLIENT_KEY + '&scope=' + encodeURIComponent(scopes) + '&response_type=code&redirect_uri=' + encodeURIComponent(REDIRECT_URI) + '&state=' + state;
  console.log('Auth redirect:', url);
  res.redirect(url);
});

app.get('/auth/tiktok/callback', (req, res) => {
  const { code, error: err, error_description } = req.query;
  if (err) return res.send('<h1>' + err + '</h1><p>' + (error_description || '') + '</p><a href="http://localhost:5173">Back</a>');
  if (!code) return res.send('<h1>No code</h1><pre>' + JSON.stringify(req.query) + '</pre>');

  const body = new URLSearchParams({ client_key: TT_CLIENT_KEY, client_secret: TT_CLIENT_SECRET, code: code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI }).toString();

  const opts = { hostname: 'open.tiktokapis.com', path: '/v2/oauth/token/', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-cache' } };
  const tokenReq = https.request(opts, tokenRes => {
    let data = '';
    tokenRes.on('data', c => data += c);
    tokenRes.on('end', () => {
      try {
        const t = JSON.parse(data);
        console.log('Token response:', JSON.stringify(t).slice(0, 300));
        if (t.access_token) {
          ttTokens = { access_token: t.access_token, refresh_token: t.refresh_token, open_id: t.open_id, scope: t.scope, connected_at: new Date().toISOString() };
          // Fetch profile
          apiFetch('https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url,follower_count,video_count', { headers: { 'Authorization': 'Bearer ' + t.access_token } })
            .then(p => { if (p.data && p.data.user) { ttTokens.display_name = p.data.user.display_name; ttTokens.avatar_url = p.data.user.avatar_url; ttTokens.follower_count = p.data.user.follower_count; ttTokens.video_count = p.data.user.video_count; } })
            .catch(() => {})
            .finally(() => { ensureDir(DATA_DIR); saveJson(path.join(DATA_DIR, 'tt_tokens.json'), ttTokens); console.log('Connected:', ttTokens.display_name || ttTokens.open_id); res.redirect('http://localhost:5173/?connected=true'); });
        } else {
          res.send('<h1>Token Error</h1><pre>' + JSON.stringify(t, null, 2) + '</pre><a href="http://localhost:5173">Back</a>');
        }
      } catch (e) { res.send('<h1>Error</h1><pre>' + data + '</pre>'); }
    });
  });
  tokenReq.on('error', e => res.send('<h1>Error</h1><pre>' + e.message + '</pre>'));
  tokenReq.write(body);
  tokenReq.end();
});

app.get('/api/tiktok/status', (req, res) => {
  if (ttTokens) res.json({ connected: true, display_name: ttTokens.display_name || '', open_id: ttTokens.open_id, follower_count: ttTokens.follower_count || 0, video_count: ttTokens.video_count || 0 });
  else res.json({ connected: false });
});

app.get('/api/tiktok/videos', async (req, res) => {
  if (!ttTokens) return res.status(401).json({ error: 'Not connected' });
  try {
    const r = await apiFetch('https://open.tiktokapis.com/v2/video/list/?fields=id,title,cover_image_url,share_url,view_count,like_count,comment_count,share_count,create_time,duration', { method: 'POST', headers: { 'Authorization': 'Bearer ' + ttTokens.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ max_count: 20 }) });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/creators', (req, res) => {
  const creators = getConnectedCreators().map(c => ({
    display_name: c.display_name || c.open_id || 'Unknown',
    open_id: c.open_id,
    avatar_url: c.avatar_url,
    follower_count: c.follower_count,
    video_count: c.video_count,
    connected_at: c.connected_at,
  }));
  res.json(creators);
});

function creatorNameMatches(a, b) {
  if (!a || !b) return false;
  const norm = (s) => (s || '').toLowerCase().trim().replace(/\s+/g, '');
  const n1 = norm(a), n2 = norm(b);
  return n1 === n2 || n1.replace(/_/g, '') === n2.replace(/_/g, '');
}

// ═══════════════════════════════════════════════════════════
// CREATOR PORTAL — Deals & Earnings
// ═══════════════════════════════════════════════════════════
app.get('/api/creator/deals', (req, res) => {
  const connected = getConnectedCreators();
  const creator = connected[0]?.display_name || connected[0]?.open_id;
  if (!creator) return res.json({ deals: [], available: 0, accepted: 0, lifetime: 0 });

  const registry = (() => { try { return loadJson(path.join(DATA_DIR, 'campaign_registry.json')) || {}; } catch (_) { return {}; } })();
  const deals = [];
  for (const [campId, meta] of Object.entries(registry)) {
    if (!creatorNameMatches(meta.creator, creator)) continue;
    deals.push({
      id: campId,
      brand: meta.brand || meta.productTitle?.split(' ')[0] || 'Brand',
      product: meta.productTitle || 'Product',
      commission: (meta.commission ?? 10) + '%',
      price: '$' + (meta.productPrice ?? 39.99).toFixed(2),
      perSale: '$' + ((meta.productPrice ?? 39.99) * ((meta.commission ?? 10) / 100)).toFixed(2),
      productPrice: meta.productPrice ?? 39.99,
      productTitle: meta.productTitle,
      launchedAt: meta.launchedAt,
      status: 'active',
      isDemo: false,
    });
  }
  // Demo deal for Sarah_BreatheBetter
  if (creatorNameMatches('Sarah_BreatheBetter', creator)) {
    deals.unshift({
      id: 'demo_sarah_breathebetter',
      brand: 'Intake Breathing',
      product: 'Nasal Strip Starter Kit',
      commission: '10%',
      price: '$39.99',
      perSale: '$4.00',
      productPrice: 39.99,
      productTitle: 'Nasal Strip Starter Kit',
      launchedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
      status: 'active',
      isDemo: true,
    });
  }
  const accepted = deals.length;
  res.json({ deals, available: 0, accepted, lifetime: accepted });
});

app.get('/api/creator/earnings', (req, res) => {
  const connected = getConnectedCreators();
  const creator = connected[0]?.display_name || connected[0]?.open_id;
  if (!creator) return res.json({ totalEarned: 0, thisMonth: 0, nextPayout: 0, payouts: [] });

  const earningsPath = path.join(DATA_DIR, 'creator_earnings.json');
  let byCreator = {};
  try { if (fs.existsSync(earningsPath)) byCreator = loadJson(earningsPath); } catch (_) {}

  const creatorKey = Object.keys(byCreator).find(k => creatorNameMatches(k, creator)) || creator;
  let data = byCreator[creatorKey] || { totalEarned: 0, thisMonth: 0, payouts: [] };

  if (creatorNameMatches('Sarah_BreatheBetter', creator)) {
    const demoPayout = 8553.36;
    const now = new Date();
    const thisMonth = now.getMonth();
    data = {
      totalEarned: demoPayout,
      thisMonth: demoPayout,
      nextPayout: 8553.36,
      payouts: [
        { date: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10), amount: 3200.12, campaignId: 'demo_sarah_breathebetter', product: 'Nasal Strip Starter Kit' },
        { date: new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10), amount: 5353.24, campaignId: 'demo_sarah_breathebetter', product: 'Nasal Strip Starter Kit' },
      ],
    };
  }
  const nextPayout = data.nextPayout ?? (data.payouts?.length ? data.payouts[0].amount : 0);
  res.json({
    totalEarned: data.totalEarned ?? 0,
    thisMonth: data.thisMonth ?? 0,
    nextPayout,
    payouts: data.payouts || [],
  });
});

app.post('/api/tiktok/disconnect', (req, res) => {
  ttTokens = null;
  const f = path.join(DATA_DIR, 'tt_tokens.json');
  if (fs.existsSync(f)) fs.unlinkSync(f);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// STORE PRODUCTS
// ═══════════════════════════════════════════════════════════
app.post('/api/store', async (req, res) => {
  const { scrapeKey, storeUrl } = req.body;
  if (!scrapeKey || !storeUrl) return res.status(400).json({ error: 'scrapeKey and storeUrl required' });
  try {
    // Normalize store URL: strip query params — ScrapeCreators often fails with tracking params
    const cleanUrl = (storeUrl || '').split('?')[0].replace(/\/+$/, '');
    const data = await apiFetch('https://api.scrapecreators.com/v1/tiktok/shop/products?url=' + encodeURIComponent(cleanUrl) + '&region=US', { headers: { 'x-api-key': scrapeKey, 'Content-Type': 'application/json' } });
    if (data.error) return res.status(400).json({ error: data.error });
    const si = data.shopInfo || data;
    const shop = {
      name: si.shop_name || si.creator_name || 'Unknown Store',
      soldCount: si.sold_count || si.global_sold_count || 0,
      formatSold: si.format_sold_count || si.format_global_sold_count || '',
      productCount: si.on_sell_product_count || 0,
      rating: si.shop_rating || 0,
      reviewCount: si.review_count || 0,
      followers: si.followers_count || 0,
      formatFollowers: si.format_followers_count || '',
      videoCount: si.video_count || si.format_video_count || 0,
      desc: si.desc || si.shop_slogan || '',
      logo: si.shop_logo?.url_list?.[0] || '',
    };
    const products = (data.products || []).map(p => {
      const imgUrl = p.image?.url_list?.[0] || p.image?.url || '';
      return {
        id: p.product_id || p.id,
        title: p.title || 'Product',
        image: imgUrl,
        price: p.product_price_info?.sale_price_decimal || p.product_price_info?.origin_price_decimal || '0',
        originalPrice: p.product_price_info?.origin_price_decimal || '',
        currency: p.product_price_info?.currency_symbol || '$',
        discount: p.product_price_info?.discount_format || '',
        saving: p.product_price_info?.reduce_price_format || '',
        sold: p.sold_info?.sold_count || 0,
        rating: p.rate_info?.score || 0,
        reviews: p.rate_info?.review_count || '0',
        url: p.seo_url?.canonical_url || ('https://www.tiktok.com/shop/product/' + (p.product_id || p.id)),
      };
    });

    // Fetch video counts per product in parallel
    const enriched = await Promise.all(products.map(async (p) => {
      try {
        const pd = await apiFetch('https://api.scrapecreators.com/v1/tiktok/product?url=' + encodeURIComponent(p.url) + '&get_related_videos=true&region=US', { headers: { 'x-api-key': scrapeKey } });
        p.videos = (pd.related_videos || []).length;
      } catch (_) { p.videos = 0; }
      return p;
    }));
    res.json({ shop, products: enriched });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// SCRAPE + SCAN
// ═══════════════════════════════════════════════════════════
app.post('/api/scan', async (req, res) => {
  const { scrapeKey, productUrl, commission = 10, gmvFloor = 200, productPrice = 39.99 } = req.body;
  if (!scrapeKey || !productUrl) return res.status(400).json({ error: 'scrapeKey and productUrl required' });
  try {
    const data = await apiFetch('https://api.scrapecreators.com/v1/tiktok/product?url=' + encodeURIComponent(productUrl) + '&get_related_videos=true&region=US', { headers: { 'x-api-key': scrapeKey, 'Content-Type': 'application/json' } });

    // Extract videos with affiliate status
    const videos = (data.related_videos || []).map((r, i) => {
      const views = parseInt(r.play_count) || 0, likes = parseInt(r.like_count) || 0, shares = parseInt(r.share_count) || 0, comments = parseInt(r.comment_count) || 0;
      const eng = views > 0 ? (likes + shares + comments) / views : 0, convEst = 0.02 + (eng * 2), orders = Math.round(views * convEst / 100), gmv = Math.round(orders * productPrice), hook = Math.min(Math.round(eng * 800 + 40), 100);
      const name = r.author_name || 'Creator ' + (i + 1);
      const handle = r.author_url ? '@' + r.author_url.split('/').pop() : '@creator' + (i + 1);
      const v = {
        id: 'v' + i, creator: name, handle, url: r.url || '', content_url: r.content_url || '',
        cover: r.cover_image_url || '', avatar: r.author_avatar_url || '',
        caption: r.title || r.desc || '', views, likes, shares, comments,
        duration: r.duration || 0, est_gmv: gmv, orders, conv: convEst, hook,
        engagement_rate: +(eng * 100).toFixed(2),
        isAffiliate: !!r.bc_ad_label_text,
        affiliateLabel: r.bc_ad_label_text || '',
      };
      v.ai_score = aiScore(v);
      const rb = 2 + (v.ai_score / 100) * 4.5;
      v.predicted_roas = [+rb.toFixed(1), +(rb + 1.4).toFixed(1)];
      return v;
    });

    const connectedCreators = getConnectedCreators();
    videos.forEach(v => { v.connected = isCreatorConnected(v, connectedCreators); });

    // Extract rich product data
    const pb = data.product_base || {};
    const sel = data.seller || {};
    const detailInfo = (i) => { const arr = sel.seller_detail_infos || []; const f = arr.find(x => x.key === i); return f || {}; };
    const perf = sel.shop_performance || {};
    const review = data.product_detail_review || {};
    const skus = (data.skus || []).map(s => ({
      id: s.sku_id, name: (s.sku_sale_props || []).map(p => p.prop_value).join(' / '),
      stock: s.stock || 0, price: s.price?.real_price?.price_val || '',
    }));
    const totalStock = skus.reduce((s, k) => s + k.stock, 0);

    const product = {
      id: data.product_id,
      title: pb.title || sel.name || 'Product',
      seller: sel.name || 'Unknown',
      sellerAvatar: sel.avatar?.url_list?.[0] || '',
      sellerLocation: sel.seller_location || '',
      sellerRating: sel.rating_value || sel.rating || 0,
      sellerPerformance: perf.shop_performance_value || 0,
      sellerPerformanceLabel: perf.shop_performance_content || '',
      sellerMetrics: (perf.detailed_metrics || []).map(m => ({ desc: m.description, value: m.value })),
      followers: detailInfo('followers_num').count || 0,
      followersStr: detailInfo('followers_num').count_show_content || '0',
      responseRate: detailInfo('response_rate').count || 0,
      deliveryRate: detailInfo('delivery_rate').count || 0,
      totalSold: pb.sold_count || detailInfo('sales_num').count || 0,
      totalSoldStr: detailInfo('sales_num').count_show_content || '0',
      category: pb.category_name || '',
      price: '$' + productPrice,
      priceRange: pb.price?.real_price || '',
      minPrice: pb.price?.min_sku_price || '',
      maxPrice: pb.price?.max_sku_price || '',
      currency: pb.price?.currency_symbol || '$',
      images: (pb.images || []).slice(0, 5).map(img => img.url_list?.[0] || img.thumb_url_list?.[0] || ''),
      reviewCount: review.review_count || 0,
      reviewCountStr: review.review_count_str || '0',
      reviewRating: review.product_rating || 0,
      topReviews: (review.review_items || []).slice(0, 3).map(r => ({
        rating: r.review?.rating || 0,
        text: r.review?.display_text || '',
        date: r.review?.review_timestamp_fmt || '',
        user: r.review_user?.name || '',
        image: r.review?.media?.[0]?.image?.thumb_url_list?.[0] || '',
        sku: r.sku_specification || '',
      })),
      skus,
      totalStock,
      shipping: data.logistic ? {
        free: data.logistic.free_shipping || false,
        leadTime: data.logistic.lead_time || '',
        deliveryDays: `${data.logistic.delivery_min_days || 0}-${data.logistic.delivery_max_days || 0}`,
      } : null,
      variants: (data.sale_props || []).map(p => ({
        name: p.prop_name,
        options: (p.sale_prop_values || []).map(v => v.prop_value),
      })),
    };

    const scan = {
      time: new Date().toISOString(), productUrl, commission, gmvFloor, product,
      qualified: videos.filter(v => v.est_gmv >= gmvFloor).sort((a, b) => b.ai_score - a.ai_score),
      filtered: videos.filter(v => v.est_gmv < gmvFloor),
      total: videos.length,
    };
    ensureDir(DATA_DIR);
    saveJson(path.join(DATA_DIR, 'latest_scan.json'), scan);
    res.json(scan);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// DEEP SCAN — keyword search with pagination to find ALL videos
// ═══════════════════════════════════════════════════════════
app.get('/api/deep-scan', async (req, res) => {
  const { scrapeKey, productId, searchQuery, maxPages = 50, productPrice = 39.99 } = req.query;
  if (!scrapeKey || !searchQuery) return res.status(400).json({ error: 'scrapeKey and searchQuery required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (obj) => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (_) {} };

  const seen = new Map();
  const price = parseFloat(productPrice) || 39.99;
  let totalCredits = 0;
  let page = 0;
  let cursor = 0;
  let hasMore = true;

  send({ type: 'start', searchQuery, productId, maxPages: +maxPages });

  try {
    while (page < +maxPages && hasMore) {
      const url = 'https://api.scrapecreators.com/v1/tiktok/search/keyword?query=' + encodeURIComponent(searchQuery) + (cursor ? '&cursor=' + cursor : '');
      const data = await apiFetch(url, { headers: { 'x-api-key': scrapeKey } });
      totalCredits++;

      const items = data.search_item_list || [];
      if (items.length === 0) { hasMore = false; break; }

      let newThisPage = 0;
      for (const item of items) {
        const aw = item.aweme_info || item;
        const vid = aw.aweme_id || aw.id;
        if (!vid || seen.has(vid)) continue;

        const shopUrl = item.shop_product_url || aw.shop_product_url || '';
        const extractId = (u) => { if (!u) return ''; const m = u.match(/\/(?:pdp|product)\/(\d+)/i); return m ? m[1] : ''; };
        const shopId = extractId(shopUrl);
        const matchesProduct = productId && (shopUrl.includes(productId) || shopId === String(productId));
        const hasShopLink = !!shopUrl;

        const stats = aw.statistics || {};
        const author = aw.author || {};
        const views = parseInt(stats.play_count) || 0;
        const likes = parseInt(stats.digg_count) || 0;
        const shares = parseInt(stats.share_count) || 0;
        const comments = parseInt(stats.comment_count) || 0;
        const eng = views > 0 ? (likes + shares + comments) / views : 0;
        const convEst = 0.02 + (eng * 2);
        const orders = Math.round(views * convEst / 100);
        const gmv = Math.round(orders * price);
        const hook = Math.min(Math.round(eng * 800 + 40), 100);

        const v = {
          id: vid,
          creator: author.nickname || 'Creator',
          handle: author.unique_id ? '@' + author.unique_id : '',
          avatar: author.avatar_thumb?.url_list?.[0] || '',
          url: item.url || ('https://www.tiktok.com/@' + (author.unique_id || author.uid) + '/video/' + vid),
          content_url: aw.video?.play_addr?.url_list?.[0] || '',
          cover: aw.video?.cover?.url_list?.[0] || aw.video?.origin_cover?.url_list?.[0] || '',
          caption: aw.desc || '',
          views, likes, shares, comments,
          duration: aw.duration || 0,
          est_gmv: gmv, orders, conv: convEst, hook,
          engagement_rate: +(eng * 100).toFixed(2),
          isAffiliate: hasShopLink,
          matchesProduct,
          shopProductUrl: shopUrl,
          source: 'search',
        };
        v.ai_score = aiScore(v);
        const rb = 2 + (v.ai_score / 100) * 4.5;
        v.predicted_roas = [+rb.toFixed(1), +(rb + 1.4).toFixed(1)];
        const conn = getConnectedCreators();
        v.connected = isCreatorConnected(v, conn);
        seen.set(vid, v);
        newThisPage++;
      }

      cursor = data.cursor || 0;
      page++;
      if (!cursor) hasMore = false;

      const confirmed = [...seen.values()].filter(v => v.matchesProduct).length;
      send({
        type: 'progress', page, totalFound: seen.size, confirmed,
        newThisPage, credits: totalCredits, hasMore,
      });
    }

    const allVideos = [...seen.values()];
    const confirmed = allVideos.filter(v => v.matchesProduct);
    const broader = allVideos.filter(v => !v.matchesProduct);

    const deepScan = {
      time: new Date().toISOString(), searchQuery, productId,
      confirmed: confirmed.sort((a, b) => b.views - a.views),
      broader: broader.sort((a, b) => b.views - a.views),
      totalFound: allVideos.length, confirmedCount: confirmed.length,
      pages: page, credits: totalCredits,
    };
    ensureDir(DATA_DIR);
    saveJson(path.join(DATA_DIR, 'latest_deep_scan.json'), deepScan);

    send({ type: 'complete', ...deepScan });
  } catch (e) {
    send({ type: 'error', error: e.message, partial: [...seen.values()], credits: totalCredits });
  }
  res.end();
});

// ═══════════════════════════════════════════════════════════
// DOWNLOAD + META LAUNCH
// ═══════════════════════════════════════════════════════════
app.post('/api/download', async (req, res) => {
  const { videoId, scrapeKey } = req.body;
  const scan = loadJson(path.join(DATA_DIR, 'latest_scan.json'));
  const deep = loadJson(path.join(DATA_DIR, 'latest_deep_scan.json'));
  const allVideos = [
    ...(scan?.qualified || []), ...(scan?.filtered || []),
    ...(deep?.confirmed || []), ...(deep?.broader || []),
  ];
  if (allVideos.length === 0) return res.status(400).json({ error: 'No scan data — run a scan first' });
  const video = allVideos.find(v => v.id === videoId);
  if (!video) return res.status(404).json({ error: 'Video not found in scan results' });
  if (!video.content_url) return res.status(400).json({ error: 'No video CDN URL available for this creator' });
  ensureDir(VIDEO_DIR);
  const fn = 'video_' + video.id + '_' + video.creator.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30) + '.mp4';
  const fp = path.join(VIDEO_DIR, fn);
  try {
    await downloadFile(video.content_url, fp);
    res.setHeader('Content-Disposition', 'attachment; filename="' + fn + '"');
    res.setHeader('Content-Type', 'video/mp4');
    const stream = fs.createReadStream(fp);
    stream.pipe(res);
  } catch (e) { res.status(500).json({ error: 'Download failed: ' + e.message }); }
});

app.post('/api/launch', async (req, res) => {
  const { videoId, metaToken, adAccount, pageId, dailyBudget = 50 } = req.body;
  if (!metaToken || !adAccount) return res.status(400).json({ error: 'metaToken and adAccount required' });
  const scan = loadJson(path.join(DATA_DIR, 'latest_scan.json'));
  const deep = loadJson(path.join(DATA_DIR, 'latest_deep_scan.json'));
  const allVideos = [
    ...(scan?.qualified || []), ...(scan?.filtered || []),
    ...(deep?.confirmed || []), ...(deep?.broader || []),
  ];
  if (allVideos.length === 0) return res.status(400).json({ error: 'No scan data — run a scan first' });
  const video = allVideos.find(v => v.id === videoId);
  if (!video) return res.status(404).json({ error: 'Video not found in scan results' });
  const steps = [], ids = {};
  try {
    // Download
    ensureDir(VIDEO_DIR);
    const fn = 'video_' + video.id + '_' + video.creator.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30) + '.mp4';
    const fp = path.join(VIDEO_DIR, fn);
    if (!fs.existsSync(fp)) { if (!video.content_url) throw new Error('No CDN'); await downloadFile(video.content_url, fp); }
    steps.push({ step: 'download', status: 'ok' });
    // Upload
    const up = await metaUploadVideo(fp, '[CS] ' + video.creator, metaToken, adAccount);
    ids.video = up.id || up.video_id; steps.push({ step: 'upload', status: 'ok', id: ids.video });
    // Campaign
    const camp = await metaPost(adAccount + '/campaigns', { name: '[Creatorship] ' + video.creator, objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', special_ad_categories: '[]', is_adset_budget_sharing_enabled: 'false', access_token: metaToken });
    ids.campaign = camp.id; steps.push({ step: 'campaign', status: 'ok', id: ids.campaign });
    // Ad Set
    const tgt = { geo_locations: { countries: ['US'] }, age_min: 18, age_max: 65 };
    const aset = await metaPost(adAccount + '/adsets', { name: '[CS] ' + video.creator, campaign_id: ids.campaign, daily_budget: dailyBudget * 100, billing_event: 'IMPRESSIONS', optimization_goal: 'LINK_CLICKS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', status: 'PAUSED', targeting: JSON.stringify(tgt), access_token: metaToken });
    ids.adset = aset.id; steps.push({ step: 'adset', status: 'ok', id: ids.adset });
    // Creative + Ad
    if (pageId) {
      try {
        const hook = (video.caption || video.creator).split(/[.!?\n]/)[0].slice(0, 80);
        const spec = { page_id: pageId, video_data: { video_id: ids.video, message: hook + '. ' + video.orders + '+ ordered.', image_url: 'https://img.freepik.com/free-photo/abstract-surface-textures-white-concrete-stone-wall_1258-14525.jpg', call_to_action: { type: 'LEARN_MORE', value: { link: scan.productUrl || 'https://example.com' } } } };
        const cr = await metaPost(adAccount + '/adcreatives', { name: '[CS] ' + video.creator, object_story_spec: JSON.stringify(spec), access_token: metaToken });
        ids.creative = cr.id; steps.push({ step: 'creative', status: 'ok', id: ids.creative });
        const ad = await metaPost(adAccount + '/ads', { name: '[CS] ' + video.creator + ' Ad', adset_id: ids.adset, creative: JSON.stringify({ creative_id: ids.creative }), status: 'PAUSED', access_token: metaToken });
        ids.ad = ad.id; steps.push({ step: 'ad', status: 'ok', id: ids.ad });
      } catch (e) { steps.push({ step: 'creative', status: 'error', error: e.message }); }
    }
    ensureDir(DATA_DIR);
    const registryPath = path.join(DATA_DIR, 'campaign_registry.json');
    let registry = {};
    try { if (fs.existsSync(registryPath)) registry = loadJson(registryPath); } catch (_) {}
    registry[ids.campaign] = {
      creator: video.creator,
      commission: scan.commission || 10,
      productPrice: scan.product?.minPrice ? parseFloat(scan.product.minPrice) : (scan.product?.price ? parseFloat(String(scan.product.price).replace(/[^0-9.]/g, '')) : 39.99),
      productTitle: scan.product?.title || 'Product',
      brand: scan.product?.seller || '',
      launchedAt: new Date().toISOString(),
    };
    saveJson(registryPath, registry);
    res.json({ success: true, video, ids, steps, dailyBudget, commission: scan.commission });
  } catch (e) { res.json({ success: false, error: e.message, ids, steps }); }
});

app.get('/api/status', (req, res) => {
  const s = loadJson(path.join(DATA_DIR, 'latest_scan.json'));
  res.json(s ? { hasScan: true, ...s } : { hasScan: false });
});

app.get('/api/campaigns/demo', (req, res) => {
  const demoPurchases = 214, demoPrice = 39.99, demoRevenue = demoPurchases * demoPrice, demoSpend = 1847.32;
  const demoCamp = {
    id: 'demo_sarah_breathebetter',
    name: '[Creatorship] Sarah_BreatheBetter',
    status: 'ACTIVE',
    created_time: new Date(Date.now() - 14 * 86400000).toISOString(),
    isDemo: true,
    insights: { spend: demoSpend, impressions: 312000, reach: 189200, frequency: 1.65, clicks: 8700, ctr: 2.80, cpc: 0.21, cpm: 5.91, actions: [{ action_type: 'view_content', value: '3500' }, { action_type: 'add_to_cart', value: '892' }, { action_type: 'purchase', value: String(demoPurchases) }], purchase_roas: [{ value: String((demoRevenue / demoSpend).toFixed(2)) }], quality_ranking: 'above average 35 percentile', engagement_rate_ranking: 'above average 20 percentile', conversion_rate_ranking: 'average' },
    daily: Array.from({ length: 30 }, (_, i) => ({ date_start: new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10), spend: +(40 + Math.sin(i / 4) * 35 + Math.random() * 40).toFixed(2) })),
    adsets: [{ daily_budget: 10000, targeting: { geo_locations: { countries: ['US'] }, age_min: 18, age_max: 45 }, optimization_goal: 'LINK_CLICKS', bid_strategy: 'LOWEST_COST' }], ads: [],
    payoutMeta: { creator: 'Sarah_BreatheBetter', creatorCommission: 10, productPrice: demoPrice, isDemo: true },
    payouts: { revenue: demoRevenue, purchases: demoPurchases, creatorPayout: demoRevenue * 0.10, creatorshipFee: demoRevenue * 0.04, csFeePct: 4 },
  };
  res.json({ campaigns: [demoCamp] });
});

// ═══════════════════════════════════════════════════════════
// META CAMPAIGN INSIGHTS
// ═══════════════════════════════════════════════════════════
app.get('/api/campaigns', async (req, res) => {
  const { metaToken, adAccount } = req.query;
  if (!metaToken || !adAccount) return res.status(400).json({ error: 'metaToken and adAccount required' });
  try {
    const fields = 'id,name,status,daily_budget,lifetime_budget,objective,created_time,updated_time,start_time,stop_time';
    const filtering = encodeURIComponent(JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: 'Creatorship' }]));
    const url = `https://graph.facebook.com/v22.0/${adAccount}/campaigns?fields=${fields}&filtering=${filtering}&limit=50&access_token=${metaToken}`;
    const campaigns = await apiFetch(url);
    if (campaigns.error) return res.status(400).json({ error: campaigns.error.message });

    const registry = (() => { try { return loadJson(path.join(DATA_DIR, 'campaign_registry.json')) || {}; } catch (_) { return {}; } })();
    const results = [];
    for (const c of (campaigns.data || [])) {
      let insights = null;
      try {
        const insightFields = 'spend,impressions,reach,frequency,clicks,unique_clicks,cpc,cpm,ctr,cpp,actions,cost_per_action_type,purchase_roas,video_avg_time_watched_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,quality_ranking,engagement_rate_ranking,conversion_rate_ranking';
        const iUrl = `https://graph.facebook.com/v22.0/${c.id}/insights?fields=${insightFields}&date_preset=maximum&access_token=${metaToken}`;
        const iData = await apiFetch(iUrl);
        if (iData.data && iData.data[0]) insights = iData.data[0];
      } catch (e) {}

      let daily = [];
      try {
        const dUrl = `https://graph.facebook.com/v22.0/${c.id}/insights?fields=spend,impressions,reach,clicks,actions,purchase_roas&time_increment=1&date_preset=last_30d&access_token=${metaToken}`;
        const dData = await apiFetch(dUrl);
        daily = dData.data || [];
      } catch (e) {}

      let adsets = [];
      try {
        const asUrl = `https://graph.facebook.com/v22.0/${c.id}/adsets?fields=id,name,status,daily_budget,lifetime_budget,bid_strategy,optimization_goal,billing_event,targeting,start_time,end_time&limit=10&access_token=${metaToken}`;
        const asData = await apiFetch(asUrl);
        adsets = asData.data || [];
      } catch (e) {}

      let ads = [];
      try {
        const adUrl = `https://graph.facebook.com/v22.0/${c.id}/ads?fields=id,name,status,creative{thumbnail_url,effective_object_story_id,body,title,image_url,video_id}&limit=20&access_token=${metaToken}`;
        const adData = await apiFetch(adUrl);
        ads = adData.data || [];
      } catch (e) {}

      const meta = registry[c.id] || {};
      const creatorCommission = meta.commission ?? 10;
      const productPrice = meta.productPrice ?? 39.99;
      const purchases = (insights?.actions || []).find(a => a.action_type === 'purchase')?.value ? +(insights.actions.find(a => a.action_type === 'purchase').value) : 0;
      const revenue = purchases * productPrice;
      const creatorPayout = revenue * (creatorCommission / 100);
      const csFeePct = 4;
      const creatorshipFee = revenue * (csFeePct / 100);
      results.push({
        ...c, insights, daily, adsets, ads,
        payoutMeta: { creator: meta.creator || c.name.replace(/^\[Creatorship\]\s*/, ''), creatorCommission, productPrice, productTitle: meta.productTitle },
        payouts: { revenue, purchases, creatorPayout, creatorshipFee, csFeePct },
      });
    }

    // Demo campaign: Sarah_BreatheBetter (matches screenshot — 214 purchases, $1847 spend)
    const demoPurchases = 214;
    const demoPrice = 39.99;
    const demoRevenue = demoPurchases * demoPrice;
    const demoSpend = 1847.32;
    const demoReach = 189200;
    const demoClicks = 8700;
    const demoImpr = 312000;
    const demoCreatorPayout = demoRevenue * 0.10;
    const demoCsFee = demoRevenue * 0.04;
    const demoCamp = {
      id: 'demo_sarah_breathebetter',
      name: '[Creatorship] Sarah_BreatheBetter',
      status: 'ACTIVE',
      created_time: new Date(Date.now() - 14 * 86400000).toISOString(),
      isDemo: true,
      insights: {
        spend: demoSpend,
        impressions: demoImpr,
        reach: demoReach,
        frequency: 1.65,
        clicks: demoClicks,
        ctr: 2.80,
        cpc: 0.21,
        cpm: 5.91,
        actions: [
          { action_type: 'view_content', value: '3500' },
          { action_type: 'add_to_cart', value: '892' },
          { action_type: 'purchase', value: String(demoPurchases) },
        ],
        purchase_roas: [{ value: String((demoRevenue / demoSpend).toFixed(2)) }],
        quality_ranking: 'above average 35 percentile',
        engagement_rate_ranking: 'above average 20 percentile',
        conversion_rate_ranking: 'average',
        video_p25_watched_actions: [{ action_type: 'video_view', value: '187400' }],
        video_p50_watched_actions: [{ action_type: 'video_view', value: '124800' }],
        video_p75_watched_actions: [{ action_type: 'video_view', value: '78200' }],
        video_p100_watched_actions: [{ action_type: 'video_view', value: '41600' }],
      },
      daily: Array.from({ length: 30 }, (_, i) => ({
        date_start: new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10),
        spend: +(40 + Math.sin(i / 4) * 35 + Math.random() * 40).toFixed(2),
      })),
      adsets: [{ daily_budget: 10000, targeting: { geo_locations: { countries: ['US'] }, age_min: 18, age_max: 45 }, optimization_goal: 'LINK_CLICKS', bid_strategy: 'LOWEST_COST' }],
      ads: [],
      payoutMeta: { creator: 'Sarah_BreatheBetter', creatorCommission: 10, productPrice: demoPrice, productTitle: 'Nasal Strip Starter Kit', isDemo: true },
      payouts: { revenue: demoRevenue, purchases: demoPurchases, creatorPayout: demoCreatorPayout, creatorshipFee: demoCsFee, csFeePct: 4 },
    };
    results.unshift(demoCamp);

    // Persist creator earnings for Creator Portal
    try {
      const earningsPath = path.join(DATA_DIR, 'creator_earnings.json');
      let byCreator = {};
      try { if (fs.existsSync(earningsPath)) byCreator = loadJson(earningsPath); } catch (_) {}
      const now = new Date();
      for (const c of results) {
        const creatorName = (c.payoutMeta?.creator || c.name.replace(/^\[Creatorship\]\s*/, '')).trim();
        if (!creatorName) continue;
        const payout = c.payouts?.creatorPayout ?? 0;
        const entry = { date: (c.created_time || '').slice(0, 10), amount: payout, campaignId: c.id, product: c.payoutMeta?.productTitle || 'Product' };
        if (!byCreator[creatorName]) byCreator[creatorName] = { payouts: [] };
        const payouts = (byCreator[creatorName].payouts || []).filter(p => p.campaignId !== c.id);
        payouts.unshift(entry);
        byCreator[creatorName].payouts = payouts;
      }
      for (const [name, data] of Object.entries(byCreator)) {
        const payouts = data.payouts || [];
        data.totalEarned = payouts.reduce((s, p) => s + (p.amount || 0), 0);
        data.thisMonth = payouts.filter(p => {
          const d = new Date(p.date);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).reduce((s, p) => s + (p.amount || 0), 0);
      }
      saveJson(earningsPath, byCreator);
    } catch (_) {}

    res.json({ campaigns: results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/campaigns/toggle', async (req, res) => {
  const { metaToken, campaignId, newStatus } = req.body;
  if (!metaToken || !campaignId) return res.status(400).json({ error: 'metaToken and campaignId required' });
  try {
    const result = await metaPost(campaignId, { status: newStatus || 'ACTIVE', access_token: metaToken });
    res.json({ success: true, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/campaigns/budget', async (req, res) => {
  const { metaToken, adsetId, dailyBudget } = req.body;
  if (!metaToken || !adsetId) return res.status(400).json({ error: 'metaToken and adsetId required' });
  try {
    const result = await metaPost(adsetId, { daily_budget: Math.round(dailyBudget * 100), access_token: metaToken });
    res.json({ success: true, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// TERMS & PRIVACY
// ═══════════════════════════════════════════════════════════
app.get('/terms', (req, res) => {
  res.send('<html><body style="font-family:sans-serif;max-width:600px;margin:60px auto;padding:0 20px"><h1>Creatorship Terms of Service</h1><p>By connecting your TikTok account you grant Creatorship read-only access to your public profile and video list for the purpose of brand licensing. We never post on your behalf.</p></body></html>');
});

app.get('/privacy', (req, res) => {
  res.send('<html><body style="font-family:sans-serif;max-width:600px;margin:60px auto;padding:0 20px"><h1>Creatorship Privacy Policy</h1><p>We collect your TikTok display name, follower count, and public video data. We never post on your behalf. Data is used solely to match your content with brand advertising opportunities. We do not sell your data.</p></body></html>');
});

// ═══ START ═══
app.listen(3001, () => {
  console.log('');
  console.log('  Creatorship API: http://localhost:3001');
  console.log('  Tunnel URL:      ' + TUNNEL_URL);
  console.log('  Redirect URI:    ' + REDIRECT_URI);
  console.log('  Verify file:     ' + TUNNEL_URL + '/auth/tiktok/callback/tiktokkMo4lcclKQtMA9J4mUi9oZCD9XrdJh5U.txt');
  console.log('');
});
