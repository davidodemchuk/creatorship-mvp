import express from 'express';
import cors from 'cors';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/node';
import { buildCreatorVerifyEmail, buildBrandVerifyEmail } from './email-templates.js';
import multer from 'multer';

// ═══ SENTRY ERROR TRACKING ═══
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
  });
  console.log('[sentry] ✅ Initialized');
} else {
  console.log('[sentry] ⚠️  SENTRY_DSN not set — error tracking disabled');
}
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const TIKTOK_DL_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Referer': 'https://www.tiktok.com/',
  'Accept': '*/*',
};
const JWT_EXPIRES_IN = '7d';

// ═══ CAi VERSION ═══
const CAI_VERSION = 'v3.4';

// ═══ CAi VIDEO QUALIFICATION PARAMETERS ═══
// These thresholds determine which TikTok videos are worth running as Meta ads.
// CAi's advantage: the cost of testing a video is ~13 seconds of compute.
// A human team would spend hours per video (find → contact → license → download → reformat → upload → configure).
// So CAi's threshold is deliberately LOW — test everything that shows any signal.
const CAI_QUALIFIERS = {
  // ── MINIMUM THRESHOLDS (video must pass ALL of these to enter pipeline) ──
  minViews: 500,              // Skip videos with <500 views (not enough data to judge)
  minDurationSec: 8,          // Skip clips under 8s (too short for Meta ads)
  maxDurationSec: 180,        // Skip videos over 3min (Meta sweet spot is 15-60s)
  minCreatedWithinDays: 365,  // Skip videos older than 1 year (stale content)

  // ── SIGNAL-BASED SCORING (CAi scores each video 0-100) ──
  // Videos that pass minimum thresholds get scored on these signals.
  // Any video scoring 30+ enters the pipeline. This is deliberately low
  // because CAi's cost-per-test is near zero.
  qualifyScore: 30,

  signals: {
    // Sales data (strongest signal — if it sold on TikTok, it'll convert on Meta)
    hasSales: 35,              // +35 points if video has ANY sales attributed
    salesPerKViews: {          // Points per sale per 1K views
      threshold: 0.5,          // 0.5 sales per 1K views = decent
      points: 25,              // +25 if above threshold
    },

    // Engagement signals
    engagementRate: {          // (likes + comments + shares) / views
      threshold: 0.03,         // 3% engagement = strong
      points: 15,
    },
    shareRate: {               // shares / views (shares = strongest organic signal)
      threshold: 0.005,        // 0.5% share rate = viral potential
      points: 10,
    },

    // View-through / watch time
    avgWatchTimePct: {         // % of video watched on average
      threshold: 0.40,         // 40% average watch = strong hook
      points: 15,
    },

    // Creator signals
    creatorFollowers: {        // Bigger creator = more social proof in ad
      threshold: 10000,
      points: 5,
    },
    creatorIsVerified: 5,      // Verified badge = trust signal

    // Content quality (from CAi AI analysis)
    productClearlyVisible: 15, // CAi detected product in first 3 seconds
    hasStrongHook: 15,         // CAi detected a hook pattern (question, shock, demo)
    goodAudioQuality: 5,       // Works with AND without sound
    verticalFormat: 5,         // 9:16 = Meta Reels ready
  },

  // ── FAST-TRACK RULES (auto-qualify regardless of score) ──
  // These videos skip scoring and go straight into the pipeline
  fastTrack: {
    minSales: 2,               // 2+ sales = auto-qualify (proven converter)
    minViews: 100000,          // 100K+ views = proven hook
    minShares: 500,            // 500+ shares = proven viral
  },

  // ── PRIORITY TIERS (for ordering within the pipeline) ──
  tiers: {
    platinum: { minScore: 80, label: 'Top Performer', color: '#9b6dff' },
    gold:     { minScore: 60, label: 'Strong Signal',  color: '#ffb400' },
    silver:   { minScore: 40, label: 'Worth Testing',  color: '#4da6ff' },
    bronze:   { minScore: 30, label: 'Low-Cost Test',  color: 'var(--cs-t4)' },
  },
};

// ═══ CAi ESTIMATION ENGINE — Category-aware CPA/ROAS benchmarks ═══
const CAI_BENCHMARKS = {
  categories: {
    'health_wellness': { cpaRange: [25, 55], roasRange: [1.2, 2.2], ctrRange: [0.8, 1.8], cpcRange: [1.20, 3.50], convRateRange: [1.5, 4.0], avgAov: 35, notes: 'Highly competitive. Subscription models have higher CPA but strong LTV.' },
    'beauty_skincare': { cpaRange: [20, 45], roasRange: [1.5, 3.0], ctrRange: [1.0, 2.2], cpcRange: [0.80, 2.50], convRateRange: [2.0, 5.0], avgAov: 45, notes: 'Visual products perform well on Meta. UGC/creator content is king.' },
    'supplements_nutrition': { cpaRange: [30, 65], roasRange: [1.0, 2.0], ctrRange: [0.7, 1.5], cpcRange: [1.50, 4.00], convRateRange: [1.0, 3.0], avgAov: 40, notes: 'High CPA due to trust barrier. Subscription LTV makes it work.' },
    'fitness_sports': { cpaRange: [20, 50], roasRange: [1.3, 2.5], ctrRange: [0.9, 2.0], cpcRange: [1.00, 3.00], convRateRange: [1.5, 4.0], avgAov: 50, notes: 'Demo/before-after content converts. Seasonal spikes Q1 and pre-summer.' },
    'fashion_apparel': { cpaRange: [15, 40], roasRange: [1.8, 3.5], ctrRange: [1.2, 2.5], cpcRange: [0.60, 2.00], convRateRange: [2.0, 5.5], avgAov: 55, notes: 'Strong visual category. TikTok-to-Meta creative transfer works well.' },
    'home_kitchen': { cpaRange: [18, 45], roasRange: [1.5, 3.0], ctrRange: [1.0, 2.0], cpcRange: [0.80, 2.50], convRateRange: [1.5, 4.0], avgAov: 40, notes: 'Problem-solution products with demos perform best.' },
    'pet': { cpaRange: [15, 35], roasRange: [2.0, 3.5], ctrRange: [1.2, 2.5], cpcRange: [0.60, 1.80], convRateRange: [2.5, 5.5], avgAov: 35, notes: 'Emotional content performs well. Strong repeat purchase behavior.' },
    'tech_gadgets': { cpaRange: [25, 60], roasRange: [1.5, 3.0], ctrRange: [0.8, 1.8], cpcRange: [1.00, 3.50], convRateRange: [1.0, 3.5], avgAov: 60, notes: 'Demo/unboxing content from TikTok transfers well. Higher AOV helps ROAS.' },
    'default': { cpaRange: [20, 50], roasRange: [1.3, 2.5], ctrRange: [0.9, 2.0], cpcRange: [0.80, 3.00], convRateRange: [1.5, 4.0], avgAov: 40, notes: 'General DTC e-commerce benchmarks.' },
  },
  modelMultipliers: {
    'subscription': { cpaMultiplier: 1.3, roasMultiplier: 0.7, ltvMultiplier: 3.5, note: 'Higher CPA justified by 3-6 month retention. Show LTV ROAS alongside first-purchase.' },
    'one_time': { cpaMultiplier: 1.0, roasMultiplier: 1.0, ltvMultiplier: 1.2, note: 'Standard single-purchase economics.' },
    'bundle': { cpaMultiplier: 0.9, roasMultiplier: 1.2, ltvMultiplier: 1.5, note: 'Higher AOV from bundles improves ROAS.' },
    'default': { cpaMultiplier: 1.0, roasMultiplier: 1.0, ltvMultiplier: 1.5 },
  },
  priceAdjustment(aov) {
    if (aov < 15) return { cpaAdj: 1.2, roasAdj: 0.6, warning: 'Low AOV — first-purchase ROAS will be low. LTV is critical.' };
    if (aov < 30) return { cpaAdj: 1.1, roasAdj: 0.8, warning: 'Moderate AOV — achievable with strong creative.' };
    if (aov < 60) return { cpaAdj: 1.0, roasAdj: 1.0, warning: null };
    if (aov < 100) return { cpaAdj: 0.9, roasAdj: 1.1, warning: null };
    return { cpaAdj: 0.8, roasAdj: 1.2, warning: null };
  },
  contentQualityMultiplier(videos) {
    if (!videos || videos.length === 0) return { adj: 1.0, confidence: 'low' };
    const totalViews = videos.reduce((s, v) => s + (v.views || 0), 0);
    const avgViews = totalViews / videos.length;
    const totalLikes = videos.reduce((s, v) => s + (v.likes || v.diggCount || 0), 0);
    const engRate = totalViews > 0 ? totalLikes / totalViews : 0;
    if (avgViews > 1000000 && engRate > 0.05) return { adj: 0.75, confidence: 'high' };
    if (avgViews > 500000 && engRate > 0.03) return { adj: 0.85, confidence: 'high' };
    if (avgViews > 100000) return { adj: 0.9, confidence: 'medium' };
    if (avgViews > 10000) return { adj: 1.0, confidence: 'medium' };
    return { adj: 1.1, confidence: 'low' };
  },
};

function calculateContentScore(videos, brand) {
  if (!videos || videos.length === 0) return { score: 0, breakdown: {} };
  const totalViews = videos.reduce((s, v) => s + (v.views || 0), 0);
  const totalLikes = videos.reduce((s, v) => s + (v.likes || v.diggCount || 0), 0);
  const totalShares = videos.reduce((s, v) => s + (v.shares || v.shareCount || 0), 0);
  const totalComments = videos.reduce((s, v) => s + (v.comments || v.commentCount || 0), 0);
  const avgViews = totalViews / videos.length;
  const engRate = totalViews > 0 ? (totalLikes + totalComments + totalShares) / totalViews : 0;
  let score = 0;
  const breakdown = {};
  if (videos.length >= 20) { score += 20; breakdown.volume = '20/20 — ' + videos.length + ' videos (excellent creative pool)'; }
  else if (videos.length >= 10) { score += 15; breakdown.volume = '15/20 — ' + videos.length + ' videos (good creative pool)'; }
  else if (videos.length >= 5) { score += 10; breakdown.volume = '10/20 — ' + videos.length + ' videos (minimum viable)'; }
  else { score += 5; breakdown.volume = '5/20 — ' + videos.length + ' videos (limited — need more content)'; }
  if (totalViews >= 50000000) { score += 20; breakdown.reach = '20/20 — ' + (totalViews / 1e6).toFixed(0) + 'M total views (massive proven reach)'; }
  else if (totalViews >= 10000000) { score += 16; breakdown.reach = '16/20 — ' + (totalViews / 1e6).toFixed(0) + 'M views (strong reach)'; }
  else if (totalViews >= 1000000) { score += 12; breakdown.reach = '12/20 — ' + (totalViews / 1e6).toFixed(1) + 'M views (solid reach)'; }
  else if (totalViews >= 100000) { score += 8; breakdown.reach = '8/20 — ' + (totalViews / 1000).toFixed(0) + 'K views (moderate)'; }
  else { score += 4; breakdown.reach = '4/20 — ' + totalViews.toLocaleString() + ' views (limited reach data)'; }
  if (engRate >= 0.08) { score += 20; breakdown.engagement = '20/20 — ' + (engRate * 100).toFixed(1) + '% engagement (exceptional)'; }
  else if (engRate >= 0.05) { score += 16; breakdown.engagement = '16/20 — ' + (engRate * 100).toFixed(1) + '% engagement (strong)'; }
  else if (engRate >= 0.03) { score += 12; breakdown.engagement = '12/20 — ' + (engRate * 100).toFixed(1) + '% engagement (good)'; }
  else if (engRate >= 0.01) { score += 8; breakdown.engagement = '8/20 — ' + (engRate * 100).toFixed(1) + '% engagement (average)'; }
  else { score += 4; breakdown.engagement = '4/20 — ' + (engRate * 100).toFixed(2) + '% engagement (low)'; }
  const shareRate = totalViews > 0 ? totalShares / totalViews : 0;
  if (shareRate >= 0.01) { score += 15; breakdown.shareability = '15/15 — ' + (shareRate * 100).toFixed(2) + '% share rate (viral potential)'; }
  else if (shareRate >= 0.005) { score += 12; breakdown.shareability = '12/15 — strong share rate'; }
  else if (shareRate >= 0.002) { score += 8; breakdown.shareability = '8/15 — moderate sharing'; }
  else { score += 4; breakdown.shareability = '4/15 — low sharing'; }
  const viewStdDev = Math.sqrt(videos.reduce((s, v) => s + Math.pow((v.views || 0) - avgViews, 2), 0) / videos.length);
  const cv = avgViews > 0 ? viewStdDev / avgViews : 0;
  if (cv < 1.0) { score += 10; breakdown.consistency = '10/10 — views spread evenly (reliable content)'; }
  else if (cv < 2.0) { score += 7; breakdown.consistency = '7/10 — some variance (a few standouts)'; }
  else { score += 4; breakdown.consistency = '4/10 — highly concentrated (one viral hit)'; }
  const now = Date.now();
  const recentVideos = videos.filter(v => {
    const created = v.createTime ? v.createTime * 1000 : (v.createdAt ? new Date(v.createdAt).getTime() : 0);
    return created > 0 && (now - created) < 90 * 86400000;
  });
  const recencyPct = videos.length > 0 ? recentVideos.length / videos.length : 0;
  if (recencyPct >= 0.5) { score += 15; breakdown.recency = '15/15 — ' + Math.round(recencyPct * 100) + '% of content is recent (last 90 days)'; }
  else if (recencyPct >= 0.25) { score += 10; breakdown.recency = '10/15 — some recent content'; }
  else { score += 5; breakdown.recency = '5/15 — mostly older content'; }
  return { score: Math.min(score, 100), breakdown };
}

function generateEstimates(brand, videos, category) {
  const cat = CAI_BENCHMARKS.categories[category] || CAI_BENCHMARKS.categories['default'];
  const price = parseFloat(brand.enrichedShop?.avgPrice || brand.price || cat.avgAov) || cat.avgAov;
  let model = 'one_time';
  const desc = JSON.stringify(brand.enrichedShop || {}).toLowerCase();
  if (desc.includes('subscribe') || desc.includes('subscription') || desc.includes('refill') || desc.includes('auto-ship') || desc.includes('monthly')) model = 'subscription';
  if (desc.includes('bundle') || desc.includes('pack of') || desc.includes('set of')) model = 'bundle';
  const modelMult = CAI_BENCHMARKS.modelMultipliers[model] || CAI_BENCHMARKS.modelMultipliers['default'];
  const priceAdj = CAI_BENCHMARKS.priceAdjustment(price);
  const contentAdj = CAI_BENCHMARKS.contentQualityMultiplier(videos);
  const baseCpaLow = cat.cpaRange[0], baseCpaHigh = cat.cpaRange[1];
  const cpaLow = Math.round(baseCpaLow * modelMult.cpaMultiplier * priceAdj.cpaAdj * contentAdj.adj);
  const cpaHigh = Math.round(baseCpaHigh * modelMult.cpaMultiplier * priceAdj.cpaAdj * contentAdj.adj);
  const cpaMid = Math.round((cpaLow + cpaHigh) / 2);
  const baseRoasLow = cat.roasRange[0], baseRoasHigh = cat.roasRange[1];
  const roasLow = Math.round(baseRoasLow * modelMult.roasMultiplier * priceAdj.roasAdj * 10) / 10;
  const roasHigh = Math.round(baseRoasHigh * modelMult.roasMultiplier * priceAdj.roasAdj * 10) / 10;
  const roasMid = Math.round(((roasLow + roasHigh) / 2) * 10) / 10;
  const ltvRoasLow = Math.round(roasLow * modelMult.ltvMultiplier * 10) / 10;
  const ltvRoasHigh = Math.round(roasHigh * modelMult.ltvMultiplier * 10) / 10;
  return {
    category, businessModel: model, aov: price,
    cpa: { low: cpaLow, mid: cpaMid, high: cpaHigh, unit: 'USD' },
    firstPurchaseRoas: { low: roasLow, mid: roasMid, high: roasHigh },
    ltvRoas: { low: ltvRoasLow, high: ltvRoasHigh, months: model === 'subscription' ? '6-month' : '12-month' },
    confidence: contentAdj.confidence, warnings: [priceAdj.warning, modelMult.note].filter(Boolean),
    methodology: 'Based on ' + category.replace(/_/g, ' ') + ' benchmarks, $' + price + ' AOV, ' + model + ' model, adjusted for content quality (' + contentAdj.confidence + ' confidence). First-purchase metrics shown — LTV metrics account for repeat purchases.',
  };
}

// ═══ CAi VIDEO SCORER ═══
function scoreVideo(video, salesData = null) {
  const q = CAI_QUALIFIERS;
  const s = q.signals;
  const views = video.views || video.playCount || 0;
  const likes = video.likes || video.diggCount || 0;
  const comments = video.comments || video.commentCount || 0;
  const shares = video.shares || video.shareCount || 0;
  const duration = video.duration || video.videoDuration || 0;
  const sales = salesData?.sales || video.sales || 0;
  const createdAt = video.createTime ? new Date(video.createTime * 1000) : new Date(video.createdAt || Date.now());

  // Minimum thresholds — must pass ALL
  if (views < q.minViews) return { qualified: false, reason: 'Too few views (' + views + ')' };
  if (duration > 0 && duration < q.minDurationSec) return { qualified: false, reason: 'Too short (' + duration + 's)' };
  if (duration > q.maxDurationSec) return { qualified: false, reason: 'Too long (' + duration + 's)' };
  if ((Date.now() - createdAt.getTime()) > q.minCreatedWithinDays * 86400000) return { qualified: false, reason: 'Too old' };

  // Fast-track rules
  if (sales >= q.fastTrack.minSales) return { qualified: true, score: 95, tier: 'platinum', reason: sales + ' sales — proven converter', fastTracked: true };
  if (views >= q.fastTrack.minViews) return { qualified: true, score: 85, tier: 'gold', reason: (views / 1000).toFixed(0) + 'K views — proven hook', fastTracked: true };
  if (shares >= q.fastTrack.minShares) return { qualified: true, score: 80, tier: 'gold', reason: shares + ' shares — viral signal', fastTracked: true };

  // Score-based qualification
  let score = 0;
  const reasons = [];

  if (sales > 0) { score += s.hasSales; reasons.push(sales + ' sale' + (sales > 1 ? 's' : '')); }
  if (views > 0 && (sales / (views / 1000)) >= s.salesPerKViews.threshold) { score += s.salesPerKViews.points; reasons.push('Strong sales/view ratio'); }

  const engRate = views > 0 ? (likes + comments + shares) / views : 0;
  if (engRate >= s.engagementRate.threshold) { score += s.engagementRate.points; reasons.push(Math.round(engRate * 100) + '% engagement'); }

  const shareRate = views > 0 ? shares / views : 0;
  if (shareRate >= s.shareRate.threshold) { score += s.shareRate.points; reasons.push('High share rate'); }

  // Determine tier
  let tier = 'disqualified';
  for (const [t, cfg] of Object.entries(q.tiers)) {
    if (score >= cfg.minScore) { tier = t; break; }
  }

  return {
    qualified: score >= q.qualifyScore,
    score,
    tier,
    reasons,
    metrics: { views, likes, comments, shares, sales, engRate: Math.round(engRate * 1000) / 10, duration },
  };
}

// HTML escape helper — prevents XSS in email templates
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;
if (supabase) {
  supabase.from('brands').select('id').limit(1).then(({ error }) => {
    if (error) console.error('[supabase] ⚠️  Connection failed:', error.message);
    else console.log('[supabase] ✅ Connected');
  });
} else {
  console.error('[supabase] Supabase not configured (SUPABASE_URL or SUPABASE_SERVICE_KEY missing)');
}

// ═══ Campaign Registry — Supabase-backed ═══
async function loadCampaignRegistry() {
  if (!supabase) return {};
  const { data, error } = await supabase.from('campaign_registry').select('*');
  if (error) { console.error('[registry] Load error:', error.message); return {}; }
  const reg = {};
  for (const row of (data || [])) {
    reg[row.campaign_id] = {
      brandId: row.brand_id,
      creator: row.creator_handle,
      creatorId: row.creator_id,
      commission: row.commission != null ? row.commission : 10,
      commissionHistory: row.commission_history || [],
      campaignName: row.campaign_name,
      campaignType: row.campaign_type,
      metaAdAccount: row.meta_ad_account,
      createdAt: row.created_at,
    };
  }
  return reg;
}

async function saveCampaignRegistryEntry(campaignId, meta) {
  if (!supabase) return;
  const { error } = await supabase.from('campaign_registry').upsert({
    campaign_id: campaignId,
    brand_id: meta.brandId,
    creator_handle: meta.creator || meta.creatorHandle || null,
    creator_id: meta.creatorId || null,
    commission: meta.commission != null ? meta.commission : 10,
    commission_history: meta.commissionHistory || [],
    campaign_name: meta.campaignName || null,
    campaign_type: meta.campaignType || 'always-on',
    meta_ad_account: meta.metaAdAccount || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'campaign_id' });
  if (error) console.error('[registry] Save error:', error.message);
}

async function deleteCampaignRegistryEntry(campaignId) {
  if (!supabase) return;
  const { error } = await supabase.from('campaign_registry').delete().eq('campaign_id', campaignId);
  if (error) console.error('[registry] Delete error:', error.message);
}

async function loadPayoutRuns() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('payout_runs').select('*').order('created_at', { ascending: false });
  if (error) { console.error('[payouts] Load error:', error.message); return []; }
  return data || [];
}

async function savePayoutRun(run) {
  if (!supabase) return;
  const { error } = await supabase.from('payout_runs').insert({
    id: run.id || 'payout_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    period_key: run.periodKey,
    creator_handle: run.creatorHandle || run.creator || 'unknown',
    creator_stripe_account: run.stripeAccountId || null,
    brand_id: run.brandId || null,
    campaign_id: run.campaignId || null,
    ad_spend: run.adSpend || 0,
    commission_rate: run.commissionRate || 10,
    earnings: run.earnings || 0,
    payout_amount: run.payoutAmount || 0,
    stripe_transfer_id: run.stripeTransferId || null,
    status: run.status || 'pending',
    error_message: run.errorMessage || null,
  });
  if (error) console.error('[payouts] Save error:', error.message);
}

async function auditLog(brandId, eventType, details = {}) {
  if (!supabase || !brandId) return;
  try {
    await supabase.from('billing_audit_log').insert({
      brand_id: brandId,
      event_type: eventType,
      details: details,
      created_at: new Date().toISOString(),
    });
  } catch (e) { console.error('[audit] Log error:', e.message); }
}

// Supabase table schema note: team_members table must exist. Run in Supabase SQL:
// CREATE TABLE IF NOT EXISTS team_members (id text primary key, brand_id text, email text, data jsonb, updated_at timestamptz);

// ═══ EMAIL (Resend HTTP API — Railway blocks SMTP ports) ═══
async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_KEY;
  if (!apiKey) { console.error('[email] RESEND_KEY not set'); return false; }
  const fromEmail = process.env.FROM_EMAIL || 'noreply@creatorship.app';
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: `Creatorship <${fromEmail}>`,
        to: [to],
        subject,
        html,
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      console.log('[email] Sent to', to, ':', subject, '- id:', data.id);
      logEmail(to, subject, true, data.id);
      return true;
    }
    const text = await resp.text();
    console.error('[email] Failed:', resp.status, text);
    logEmail(to, subject, false, null);
    return false;
  } catch (err) {
    console.error('[email] Failed to send to', to, ':', err.message);
    logEmail(to, subject, false, null);
    return false;
  }
}

const EMAIL_PROVIDER = process.env.RESEND_KEY ? 'Resend' : 'SMTP';
console.log('[email] provider:', EMAIL_PROVIDER);

function emailBase({ title, preheader, accentColor, accentGradient, headerEmoji, bodyHtml, ctaText, ctaUrl, footerNote }) {
  const accent = accentColor || '#25F4EE';
  const gradient = accentGradient || 'linear-gradient(135deg, #FE2C55 0%, #ff6b35 50%, #25F4EE 100%)';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title || 'Creatorship'}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:'Helvetica Neue',Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#f4f4f7;">${preheader}</div>` : ''}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

        <!-- Top accent bar -->
        <tr><td style="background:${gradient};height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Logo -->
        <tr><td style="padding:32px 40px 20px;text-align:center;border-bottom:1px solid #f0f0f0;">
          <div style="display:inline-block;">
            <svg xmlns="http://www.w3.org/2000/svg" width="180" height="36" viewBox="0 0 180 36">
              <defs>
                <linearGradient id="cg" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" style="stop-color:#EE1D52"/>
                  <stop offset="100%" style="stop-color:#25F4EE"/>
                </linearGradient>
              </defs>
              <text x="0" y="28" font-family="Arial Black,Arial,sans-serif" font-size="30" font-weight="900" font-style="italic" fill="url(#cg)">Creator</text>
              <text x="108" y="28" font-family="Arial Black,Arial,sans-serif" font-size="30" font-weight="800" font-style="italic" fill="#0553B8">ship</text>
            </svg>
          </div>
          <div style="color:#9ca3af;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:3px;font-style:normal;">TikTok Creators × Meta Ads</div>
        </td></tr>

        <!-- Emoji hero (optional) -->
        ${headerEmoji ? `<tr><td style="padding:32px 40px 0;text-align:center;font-size:48px;line-height:1;">${headerEmoji}</td></tr>` : ''}

        <!-- Title -->
        <tr><td style="padding:${headerEmoji ? '16px' : '32px'} 40px 8px;text-align:center;">
          <h1 style="margin:0;color:#111111;font-size:24px;font-weight:700;line-height:1.25;">${title}</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:16px 40px 28px;color:#374151;font-size:15px;line-height:1.7;">
          ${bodyHtml}
        </td></tr>

        <!-- CTA button (optional) -->
        ${ctaText && ctaUrl ? `
        <tr><td style="padding:0 40px 36px;text-align:center;">
          <a href="${ctaUrl}" style="display:inline-block;background:${gradient};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:0.2px;">${ctaText} →</a>
        </td></tr>` : ''}

        <!-- Footer -->
        <tr><td style="padding:24px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
          ${footerNote ? `<p style="color:#6b7280;font-size:12px;margin:0 0 8px;">${footerNote}</p>` : ''}
          <p style="color:#9ca3af;font-size:11px;margin:0;">© 2026 Creatorship, LLC · Greenville, SC · <a href="https://www.creatorship.app" style="color:${accent};text-decoration:none;">creatorship.app</a></p>
        </td></tr>

        <!-- Bottom accent bar -->
        <tr><td style="background:${gradient};height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Backwards-compatible wrapper for older call sites
function brandEmailTemplate(title, bodyHtml, ctaText, ctaUrl) {
  return emailBase({
    title,
    bodyHtml,
    ctaText,
    ctaUrl,
    footerNote: "If you didn't request this, you can safely ignore this email."
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.set('trust proxy', 1);
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://www.creatorship.app', 'https://creatorship.app']
    : true,
  credentials: true,
}));
// === SECURITY HEADERS ===
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use((req, res, next) => {
  if (req.originalUrl === '/api/stripe/webhook') {
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many signups. Please try again in 15 minutes.' },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please slow down.' },
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many messages. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: 'Too many reset requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ═══ JWT AUTH ═══
// ── Role-based access control ──
const ROLE_HIERARCHY = { owner: 4, admin: 3, editor: 2, viewer: 1 };

function hasPermission(userRole, requiredRole) {
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[requiredRole] || 99);
}

// Middleware: require minimum role for an endpoint
function requireRole(minRole) {
  return (req, res, next) => {
    const role = req.brandAuth?.role || 'owner'; // owner is implicit
    if (!hasPermission(role, minRole)) {
      return res.status(403).json({ error: 'Insufficient permissions', requiredRole: minRole, yourRole: role });
    }
    next();
  };
}

function signBrandToken(brand, role) {
  return jwt.sign(
    { brandId: brand.id, email: (brand.email || '').toLowerCase(), role: role || 'owner' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Middleware: verifies JWT and sets req.brandAuth = { brandId, email }
function authBrand(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.brandAuth = { brandId: payload.brandId, email: payload.email, role: payload.role || 'owner' };
    // SECURITY: Force-override any client-supplied brandId with JWT-authenticated value
    if (req.body && typeof req.body === 'object') req.body.brandId = payload.brandId;
    if (req.query && typeof req.query === 'object') req.query.brandId = payload.brandId;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Session expired — please log in again', code: 'TOKEN_EXPIRED' });
    return res.status(401).json({ error: 'Invalid session — please log in again', code: 'INVALID_TOKEN' });
  }
}

// ═══ META TOKEN VALIDATOR — checks expiry before use ═══
function getValidMetaToken(brand) {
  const token = brand?.metaToken;
  if (!token) throw new Error('Meta not connected — connect your Meta account in Settings');
  const expiresAt = brand.metaTokenExpiresAt ? new Date(brand.metaTokenExpiresAt).getTime() : 0;
  if (expiresAt > 0 && expiresAt <= Date.now()) {
    throw new Error('Your Meta connection has expired. Please reconnect Meta in Account settings.');
  }
  if (expiresAt > 0 && expiresAt - Date.now() < 3 * 24 * 60 * 60 * 1000) {
    console.warn('[meta-token] Token for brand ' + (brand.id || '?') + ' expires in less than 3 days — brand should reconnect soon');
  }
  return token;
}

// ═══ WATERMARK-SAFE VIDEO URL ═══
// Prefer explicit nwm + play_addr (streaming, typically no baked TikTok watermark).
// download_addr is often the watermarked file — use only as last resort.
async function getCleanVideoUrl(video, scrapeKey) {
  // Priority 1: Explicit no-watermark URL from cached data
  const nwmCached = video.nwm_video_url || video.video_url_no_watermark || video.nwm_url;
  if (nwmCached && !isUrlExpired(nwmCached)) {
    console.log('[watermark-safe] Using cached nwm_url for video', video.id);
    return { url: nwmCached, source: 'cached_nwm' };
  }

  // Priority 2: play_addr from cached data (streaming URL, no baked watermark)
  const playUrl = video.playUrl || video.play ||
    video.video?.play_addr?.url_list?.[0] ||
    video.play_addr?.url_list?.[0];
  if (playUrl && !playUrl.includes('download_addr') && !isUrlExpired(playUrl)) {
    console.log('[watermark-safe] Using cached play_addr for video', video.id);
    return { url: playUrl, source: 'cached_play_addr' };
  }

  // Priority 3: Re-fetch from ScrapeCreators to get fresh URLs
  if (scrapeKey && video.id) {
    try {
      const freshResp = await fetch(`https://api.scrapecreators.com/v2/tiktok/video?video_id=${video.id}`, {
        headers: { 'x-api-key': scrapeKey },
      });
      if (freshResp.ok) {
        const freshData = await freshResp.json();
        const detail = freshData.aweme_detail || freshData;

        // Try nwm URLs first
        const nwmUrl = detail.nwm_video_url || detail.video_url_no_watermark || detail.nwm_url ||
          freshData.nwm_video_url || freshData.video_url_no_watermark || freshData.nwm_url;
        if (nwmUrl) {
          console.log('[watermark-safe] Fresh nwm_url for video', video.id);
          return { url: nwmUrl, source: 'fresh_nwm' };
        }

        // Try play_addr (streaming, no watermark)
        const freshPlay = detail.video?.play_addr?.url_list?.[0] ||
          freshData.video?.play_addr?.url_list?.[0] ||
          detail.play || freshData.play;
        if (freshPlay) {
          console.log('[watermark-safe] Fresh play_addr for video', video.id);
          return { url: freshPlay, source: 'fresh_play_addr' };
        }

        // download_addr is WATERMARKED — only use as absolute last resort with warning
        const dlUrl = detail.video?.download_addr?.url_list?.[0] ||
          freshData.video?.download_addr?.url_list?.[0] ||
          freshData.downloadUrl || freshData.download_url;
        if (dlUrl) {
          console.log('[watermark-safe] WARNING: Using download_addr (may have watermark) for video', video.id);
          return { url: dlUrl, source: 'fresh_download_addr_WATERMARKED' };
        }
      }
    } catch (e) {
      console.log('[watermark-safe] Re-fetch failed for video', video.id, e.message);
    }
  }

  // No clean URL found
  console.log('[watermark-safe] REJECTED video', video.id, '- no watermark-free URL available');
  return { url: null, source: 'rejected_no_clean_url' };
}

// Check if a TikTok CDN URL is likely expired (URLs contain timestamp params)
function isUrlExpired(url) {
  if (!url) return true;
  try {
    const urlObj = new URL(url);
    const expires = urlObj.searchParams.get('x-expires');
    if (expires) {
      const expiryTime = parseInt(expires) * 1000;
      return Date.now() > expiryTime;
    }
    return false;
  } catch (_) {
    return false;
  }
}

// ═══ META CAMPAIGN SYNC — verify Creatorship data against actual Meta state ═══
async function syncCampaignWithMeta(brand) {
  const cai = brand.cai;
  if (!cai || !cai.campaign?.id) return { synced: false, reason: 'No campaign data' };

  let token;
  try { token = getValidMetaToken(brand); }
  catch (e) { return { synced: false, reason: 'Meta token invalid: ' + e.message }; }

  let changed = false;
  const log = [];

  const campaignId = cai.campaign.id || cai.campaign.metaCampaignId;
  if (campaignId) {
    try {
      const campData = await apiFetch('https://graph.facebook.com/v22.0/' + campaignId + '?fields=id,name,status,effective_status&access_token=' + token);
      if (campData && campData.error) throw new Error(campData.error.message || campData.error.code || 'Meta API error');
      if (campData.effective_status === 'DELETED' || campData.effective_status === 'ARCHIVED') {
        log.push('Campaign ' + campaignId + ' is ' + campData.effective_status + ' on Meta — clearing local data');
        cai.campaign = {};
        cai.creatives = [];
        cai.processingStatus = 'cleared';
        cai.isActive = false;
        cai.campaignDeletedAt = new Date().toISOString();
        // DO NOT clear: deepDive, monthlyBudget, roasTarget, activatedAt — these represent completed setup
        changed = true;
      } else {
        const metaStatus = campData.effective_status?.toLowerCase() || 'unknown';
        if (cai.campaign.status !== metaStatus) {
          log.push('Campaign status: local=' + (cai.campaign.status || '?') + ' meta=' + metaStatus);
          cai.campaign.metaStatus = metaStatus;
        }
      }
    } catch (e) {
      if (e.message?.includes('does not exist') || e.message?.includes('Unsupported get request') || e.message?.includes('100')) {
        log.push('Campaign ' + campaignId + ' no longer exists on Meta — clearing local data');
        cai.campaign = {};
        cai.creatives = [];
        cai.processingStatus = 'cleared';
        cai.isActive = false;
        cai.campaignDeletedAt = new Date().toISOString();
        changed = true;
      } else {
        log.push('Campaign check error: ' + e.message);
      }
    }
  }

  if (!changed && cai.creatives && cai.creatives.length > 0) {
    const adIds = cai.creatives.map(c => c.adId).filter(Boolean);
    if (adIds.length > 0) {
      try {
        const idsParam = adIds.slice(0, 50).join(',');
        const adsData = await apiFetch('https://graph.facebook.com/v22.0/?ids=' + idsParam + '&fields=id,effective_status&access_token=' + token);
        if (adsData && adsData.error) throw new Error(adsData.error.message || 'Meta API error');
        for (const creative of cai.creatives) {
          if (!creative.adId) continue;
          const metaAd = adsData[creative.adId];
          if (!metaAd || metaAd.error) {
            log.push('Ad ' + creative.adId + ' no longer exists on Meta — marking deleted');
            creative.status = 'deleted';
            creative.deletedFromMeta = true;
            changed = true;
          } else {
            const metaStatus = metaAd.effective_status?.toLowerCase() || 'unknown';
            if (creative.status !== metaStatus && metaStatus !== 'unknown') {
              log.push('Ad ' + creative.adId + ': local=' + creative.status + ' meta=' + metaStatus);
              creative.status = metaStatus;
              changed = true;
            }
          }
        }
        const before = cai.creatives.length;
        cai.creatives = cai.creatives.filter(c => c.status !== 'deleted' && c.status !== 'archived');
        if (cai.creatives.length < before) {
          log.push('Removed ' + (before - cai.creatives.length) + ' deleted/archived ads from local data');
          changed = true;
        }
      } catch (e) {
        log.push('Ads batch check error: ' + e.message);
      }
    }
  }

  // Also reconcile against ALL ads currently in the CAi ad set (including orphaned ads not tracked locally)
  if (!changed && cai.campaign?.adsetId) {
    try {
      const adsetAds = await apiFetch('https://graph.facebook.com/v22.0/' + cai.campaign.adsetId + '/ads?fields=id,status,effective_status&limit=200&access_token=' + token);
      const metaAds = adsetAds?.data || [];
      const activeMetaAds = metaAds.filter(a => {
        const st = (a.effective_status || a.status || '').toUpperCase();
        return st !== 'ARCHIVED' && st !== 'DELETED';
      });
      const localByAdId = new Map((cai.creatives || []).map(c => [String(c.adId || ''), c]));
      let addedOrphans = 0;
      for (const ad of activeMetaAds) {
        const adId = String(ad.id || '');
        if (!adId || localByAdId.has(adId)) continue;
        cai.creatives.push({
          videoId: null,
          adId,
          creativeId: null,
          metaVideoId: null,
          creator: 'meta-orphan',
          hookScore: 0,
          hookReason: 'Recovered from Meta sync',
          tier: 'test',
          dailyBudget: 0,
          primaryText: '',
          headline: ad.name || '[CAi] Recovered Ad',
          status: (ad.effective_status || ad.status || 'active').toLowerCase(),
          addedAt: new Date().toISOString(),
          daysActive: 0,
          lastMetrics: {},
          recoveredFromMeta: true,
        });
        addedOrphans++;
      }
      if (addedOrphans > 0) {
        log.push('Recovered ' + addedOrphans + ' orphaned active ads from Meta ad set');
        changed = true;
      }
    } catch (e) {
      log.push('Ad set reconciliation error: ' + e.message);
    }
  }

  if (changed) {
    cai.isActive = (cai.creatives || []).some(c => c.status === 'active') && cai.processingStatus === 'complete';
    cai.lastMetaSync = new Date().toISOString();
    cai.lastMetaSyncLog = log;
    brand.cai = cai;
    await saveBrand(brand);
    console.log('[meta-sync] Brand ' + brand.id + ': ' + log.join(' | '));
  }

  return { synced: true, changed, log, campaignExists: !!(cai.campaign?.id) };
}

// ═══ AUDIT LOG (destructive / critical actions) ═══
async function auditLogAction(action, brandId, details = {}) {
  try {
    if (!supabase) return;
    await supabase.from('audit_log').insert({
      action,
      brand_id: brandId || null,
      details: details,
      ip: null,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[audit] Failed to log:', action, brandId, e.message);
  }
}

// Apply authBrand to all /api/brand/* routes EXCEPT public ones
const BRAND_PUBLIC_ROUTES = ['/api/brand/login', '/api/brand/signup', '/api/brand/enrich', '/api/brand/team/invite-info', '/api/brand/team/accept'];
app.use('/api/brand', (req, res, next) => {
  const fullPath = '/api/brand' + (req.path === '/' ? '' : req.path);
  if (BRAND_PUBLIC_ROUTES.some(r => fullPath.startsWith(r))) return next();
  authBrand(req, res, next);
});

const VIDEO_DIR = path.join(__dirname, 'videos');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SCANS_DIR = path.join(DATA_DIR, 'scans');

// ═══ CONFIG ═══
// TUNNEL_URL: base URL when using ngrok/cloudflared (e.g. https://xxx.ngrok.io)
// TIKTOK_REDIRECT_URI: override - must match EXACTLY what's in TikTok Developer Portal > Login Kit
// TikTok requires HTTPS for web (localhost may fail). Use ngrok: ngrok http 3001
const TUNNEL_URL = process.env.TUNNEL_URL || 'http://localhost:3001';
const REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || (TUNNEL_URL + '/auth/tiktok/callback');
const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const META_REDIRECT_URI = (process.env.FRONTEND_URL || TUNNEL_URL) + '/auth/meta/callback';
const TT_CLIENT_KEY = process.env.TT_CLIENT_KEY || '';
const TT_CLIENT_SECRET = process.env.TT_CLIENT_SECRET || '';

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function saveJson(f, d) { fs.writeFileSync(f, JSON.stringify(d, null, 2)); }
function loadJson(f) { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; }

// ═══ ACTIVITY LOG ═══
const ACTIVITY_LOG_FILE = path.join(DATA_DIR, 'activity_log.json');
const EMAIL_LOG_FILE = path.join(DATA_DIR, 'email_log.json');

function logActivity(type, data = {}) {
  try {
    let log = [];
    try { log = loadJson(ACTIVITY_LOG_FILE) || []; } catch (_) {}
    log.unshift({ type, ...data, at: new Date().toISOString() });
    if (log.length > 500) log = log.slice(0, 500); // Keep last 500
    saveJson(ACTIVITY_LOG_FILE, log);
  } catch (e) { console.error('[activity] Log failed:', e.message); }
}

function logEmail(to, subject, success, resendId) {
  try {
    let log = [];
    try { log = loadJson(EMAIL_LOG_FILE) || []; } catch (_) {}
    log.unshift({ to, subject, success, resendId: resendId || null, at: new Date().toISOString() });
    if (log.length > 300) log = log.slice(0, 300);
    saveJson(EMAIL_LOG_FILE, log);
  } catch (e) { console.error('[email-log] Failed:', e.message); }
}

ensureDir(DATA_DIR);
ensureDir(SCANS_DIR);

// ═══ SUPABASE DATA LAYER ═══
async function loadBrands() {
  if (!supabase) { console.error('Supabase not configured'); return []; }
  const { data, error } = await supabase.from('brands').select('data');
  if (error) { console.error('[supabase] loadBrands error:', error.message); return []; }
  return (data || []).map(r => r.data).filter(Boolean);
}
async function saveBrands(brands) {
  if (!supabase) { console.error('Supabase not configured'); return; }
  for (const brand of brands) {
    if (!brand.id) continue;
    const { error } = await supabase.from('brands').upsert({ id: brand.id, email: (brand.email || '').toLowerCase(), data: brand, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) console.error('[supabase] saveBrands error:', brand.id, error.message);
  }
}
async function saveBrand(brand) {
  try {
    if (!supabase) { console.error('Supabase not configured'); return; }
    if (!brand?.id) return;
    const { error } = await supabase.from('brands').upsert({ id: brand.id, email: (brand.email || '').toLowerCase(), data: brand, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) {
      console.error('[saveBrand] FAILED for brand ' + (brand?.id || '?') + ':', error.message);
      return { error: error.message };
    }
  } catch (err) {
    console.error('[saveBrand] FAILED for brand ' + (brand?.id || '?') + ':', err.message);
    return { error: err.message };
  }
}

// ═══ DERIVE tikTokStorePageUrl — never trust frontend to set this ═══
function deriveTikTokStorePageUrl(brand) {
  // Already set and looks correct
  if (brand.tikTokStorePageUrl && brand.tikTokStorePageUrl.includes('@')) {
    // Validate it matches the brand (not another brand's handle)
    const handle = brand.tikTokStorePageUrl.match(/@([^/?]+)/)?.[1]?.toLowerCase() || '';
    const storeName = (brand.storeName || brand.brandName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    // If the handle has NO resemblance to the brand name, it's probably contaminated
    if (handle && storeName && !handle.includes(storeName.substring(0, 4)) && !storeName.includes(handle.substring(0, 4))) {
      console.log('[data-isolation] WARNING: tikTokStorePageUrl ' + handle + ' does not match storeName ' + storeName + ' — likely contaminated');
      // Don't auto-fix — just log the warning. The enrichment should set the correct one.
    }
  }
  // Derive from tikTokShopUrl if missing
  if (!brand.tikTokStorePageUrl) {
    const shopHandle = brand.tikTokShopUrl?.match(/\/shop\/store\/([^/]+)/)?.[1];
    if (shopHandle) {
      brand.tikTokStorePageUrl = 'https://www.tiktok.com/@' + shopHandle.replace(/-/g, '');
      console.log('[data-isolation] Derived tikTokStorePageUrl from shop URL: ' + brand.tikTokStorePageUrl);
    } else {
      const storeName = (brand.storeName || brand.brandName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (storeName) {
        brand.tikTokStorePageUrl = 'https://www.tiktok.com/@' + storeName;
        console.log('[data-isolation] Derived tikTokStorePageUrl from storeName: ' + brand.tikTokStorePageUrl);
      }
    }
  }
  return brand.tikTokStorePageUrl;
}

// ═══ TARGETED BRAND QUERIES (avoid loading all brands) ═══
async function getBrandById(id) {
  if (!supabase || !id) return null;
  const { data, error } = await supabase.from('brands').select('data').eq('id', String(id)).single();
  if (error || !data) return null;
  return data.data;
}
async function getBrandByEmail(email) {
  if (!supabase || !email) return null;
  const { data, error } = await supabase.from('brands').select('data').eq('email', email.toLowerCase()).single();
  if (error || !data) return null;
  return data.data;
}
async function getBrand(brandId, email) {
  if (brandId) return getBrandById(brandId);
  if (email) return getBrandByEmail(email);
  return null;
}
async function deleteBrandById(id) {
  if (!supabase || !id) return;
  await supabase.from('brands').delete().eq('id', String(id));
}
async function getBrandByResetToken(token) {
  if (!token) return null;
  if (supabase) {
    try {
      const { data, error } = await supabase.from('brands').select('data').filter('data->>resetToken', 'eq', token).limit(1).maybeSingle();
      if (!error && data?.data) return data.data;
    } catch (_) {}
    const brands = await loadBrands();
    return brands.find(b => b.resetToken === token && Number(b.resetTokenExpiry || 0) > Date.now()) || null;
  }
  return null;
}
async function getBrandByEmailToken(token) {
  if (!token) return null;
  if (supabase) {
    try {
      const { data, error } = await supabase.from('brands').select('data').filter('data->>emailToken', 'eq', token).limit(1).maybeSingle();
      if (!error && data?.data) return data.data;
    } catch (_) {}
    const brands = await loadBrands();
    return brands.find(b => b.emailToken === token) || null;
  }
  return null;
}
async function loadCreators() {
  if (!supabase) { console.error('Supabase not configured'); return []; }
  const { data, error } = await supabase.from('creators').select('data');
  if (error) { console.error('[supabase] loadCreators error:', error.message); return []; }
  return (data || []).map(r => r.data).filter(Boolean);
}
async function saveCreators(creators) {
  if (!supabase) { console.error('Supabase not configured'); return; }
  for (const creator of creators) {
    if (!creator.id) continue;
    const { error } = await supabase.from('creators').upsert({ id: creator.id, email: (creator.email || '').toLowerCase(), data: creator, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) console.error('[supabase] saveCreators error:', creator.id, error.message);
  }
}
async function saveCreator(creator) {
  if (!supabase) { console.error('Supabase not configured'); return; }
  if (!creator?.id) return;
  const { error } = await supabase.from('creators').upsert({ id: creator.id, email: (creator.email || '').toLowerCase(), data: creator, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) console.error('[supabase] saveCreator error:', creator.id, error.message);
}
async function loadTeam() {
  if (!supabase) { console.error('Supabase not configured'); return []; }
  const { data, error } = await supabase.from('team_members').select('data');
  if (error) { console.error('[supabase] loadTeam error:', error.message); return []; }
  return (data || []).map(r => r.data).filter(Boolean);
}
async function saveTeam(team) {
  if (!supabase) { console.error('Supabase not configured'); return; }
  for (const member of team) {
    if (!member.id) continue;
    const { error } = await supabase.from('team_members').upsert({ id: member.id, brand_id: member.brandId, email: (member.email || '').toLowerCase(), data: member, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) console.error('[supabase] saveTeam error:', member.id, error.message);
  }
}

// ═══ WATCHLIST & ALERTS (cron scan) ═══
const WATCHLIST_FILE = path.join(DATA_DIR, 'watchlist.json');
const ALERTS_FILE = path.join(DATA_DIR, 'alerts.json');

function loadWatchlist() {
  try { const d = loadJson(WATCHLIST_FILE); return Array.isArray(d) ? d : []; } catch (_) { return []; }
}
function saveWatchlist(entries) {
  ensureDir(DATA_DIR);
  saveJson(WATCHLIST_FILE, entries);
}

function loadAlerts() {
  try { const d = loadJson(ALERTS_FILE); return Array.isArray(d) ? d : []; } catch (_) { return []; }
}
function saveAlerts(alerts) {
  ensureDir(DATA_DIR);
  saveJson(ALERTS_FILE, alerts);
}

// ═══ CRON: auto-scan for high performers ═══
const CRON_INTERVAL_MS = 86400000;
const CRON_INITIAL_DELAY_MS = 30000;

async function fetchProductVideos(productUrl, scrapeKey) {
  const data = await apiFetch(
    'https://api.scrapecreators.com/v1/tiktok/product?url=' + encodeURIComponent(productUrl) + '&get_related_videos=true&region=US',
    { headers: { 'x-api-key': scrapeKey, 'Content-Type': 'application/json' } }
  );
  return (data.related_videos || []).map((r, i) => {
    const views = parseInt(r.play_count) || 0, likes = parseInt(r.like_count) || 0, shares = parseInt(r.share_count) || 0, comments = parseInt(r.comment_count) || 0;
    const name = r.author_name || 'Creator ' + (i + 1);
    const handle = r.author_url ? '@' + r.author_url.split('/').pop() : '@creator' + (i + 1);
    const follower_count = parseInt(r.author_followers) || parseInt(r.follower_count) || 1;
    const eng = views > 0 ? (likes + shares + comments) / views : 0;
    const v = { id: 'v' + i, creator: name, handle, url: r.url || '', views, likes, shares, comments, follower_count, engagement_rate: +(eng * 100).toFixed(2) };
    v.cai_score = caiScore(v);
    return v;
  });
}

async function cronScan() {
  const scrapeKey = process.env.SCRAPE_KEY || process.env.SCRAPECREATORS_API_KEY;
  if (!scrapeKey) { return; }
  const watchlist = loadWatchlist();
  if (watchlist.length === 0) { return; }
  const brands = await loadBrands();
  const alerts = loadAlerts();
  const existingKeys = new Set(alerts.map(a => `${a.brandId}:${(a.creatorHandle || '').toLowerCase()}`));
  let newAlerts = 0;
  const now = new Date().toISOString();

  for (const entry of watchlist) {
    try {
      const videos = await fetchProductVideos(entry.productUrl, scrapeKey);
      const brand = brands.find(b => b.id === entry.brandId);
      const storeName = (brand?.storeName || brand?.brandName || 'your store').replace(/^@/, '');
      const minV = Math.max(0, parseInt(entry.minViews, 10) || 25000);
      const minCai = Math.max(0, parseInt(entry.minCaiScore, 10) || 55);

      for (const v of videos) {
        if ((v.views || 0) < minV || (v.cai_score || 0) < minCai) continue;
        const handleNorm = ((v.handle || '').replace(/^@/, '') || (v.creator || '')).toLowerCase();
        const key = `${entry.brandId}:${handleNorm}`;
        if (existingKeys.has(key)) continue;

        const alert = {
          id: 'a' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
          brandId: entry.brandId,
          creatorHandle: v.handle || v.creator || 'Unknown',
          videoUrl: v.url || '',
          cai_score: v.cai_score || 0,
          views: v.views || 0,
          engagementRate: v.engagement_rate || 0,
          detectedAt: now,
          dismissed: false,
        };
        alerts.push(alert);
        existingKeys.add(key);
        newAlerts++;

        if (brand?.email) {
          const fN = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n));
          sendEmail(
            brand.email,
            `🔥 New high-performer detected for ${storeName}`,
            emailBase({
              title: `🔥 High-performer detected for ${storeName}`,
              preheader: 'One of your creators is outperforming — take action.',
              headerEmoji: '🔥',
              accentColor: '#f59e0b',
              accentGradient: 'linear-gradient(135deg,#f59e0b,#ef4444)',
              bodyHtml: `<p>One of your Creatorship creators is outperforming benchmarks for <strong>${escapeHtml(storeName)}</strong>.</p><p><strong>Creator:</strong> ${escapeHtml(alert.creatorHandle)}</p><p><strong>Views:</strong> ${fN(alert.views)} · <strong>CAi Score:</strong> ${alert.cai_score} · <strong>Engagement:</strong> ${alert.engagementRate}%</p>${alert.videoUrl ? `<p><a href="${alert.videoUrl}" style="color:#0099ff;">View video →</a></p>` : ''}<p>Consider increasing their content budget or launching their top video as a Meta ad.</p>`,
              ctaText: 'View Performance',
              ctaUrl: 'https://www.creatorship.app/brand'
            })
          );
        }
      }
      entry.lastRun = now;
    } catch (e) {
      console.error('[cron-scan] Error for', entry.productUrl, ':', e.message);
    }
  }
  if (newAlerts > 0) saveAlerts(alerts);
  saveWatchlist(watchlist);
}

setInterval(cronScan, CRON_INTERVAL_MS);
setTimeout(cronScan, CRON_INITIAL_DELAY_MS);
console.log('  Cron: Auto-scan every 24h (first run in 30s)');

// ═══ CAi INTELLIGENCE CRONS ═══

const CAI_POLL_INTERVAL = 4 * 60 * 60 * 1000;
async function caiAutoPoll() {
  try {
    const brands = await loadBrands();
    const active = brands.filter(b => b.cai?.campaign?.id && b.metaToken);
    if (active.length === 0) return;
    console.log('[cai-cron-poll] Polling ' + active.length + ' brands...');
    for (const brand of active) {
      try {
        await caiPollPerformance(brand);
      } catch (e) { console.error('[cai-cron-poll] Error for', brand.brandName || brand.id, ':', e.message); }
    }
    console.log('[cai-cron-poll] Done — polled ' + active.length + ' brands');
  } catch (e) { console.error('[cai-cron-poll] Fatal:', e.message); }
}
setInterval(caiAutoPoll, CAI_POLL_INTERVAL);
setTimeout(caiAutoPoll, 60000);
console.log('  CAi: Auto-poll every 4h (first run in 60s)');

const CAI_DIGEST_CHECK_INTERVAL = 60 * 60 * 1000;
let lastDigestSent = null;
async function caiDigestCheck() {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const hourUTC = now.getUTCHours();
  const today = now.toISOString().split('T')[0];
  if (dayOfWeek === 0 && hourUTC >= 13 && hourUTC <= 14 && lastDigestSent !== today) {
    console.log('[cai-cron-digest] Sending weekly digests...');
    lastDigestSent = today;
    try {
      const brands = await loadBrands();
      const eligible = brands.filter(b => b.cai?.campaign?.id && b.email);
      for (const brand of eligible) {
        try {
          const perf = brand.cai?.performance || {};
          const week = perf.week || {};
          const creatives = brand.cai?.creatives || [];
          const activity = brand.cai?.activityLog || [];
          const activeCount = creatives.filter(c => c.status === 'active').length;
          const pausedCount = creatives.filter(c => c.status === 'paused').length;
          const fatiguedCount = creatives.filter(c => c.status === 'fatigued').length;
          const recentActivity = activity.slice(-5);
          const activityHtml = recentActivity.length > 0
            ? recentActivity.map(a => {
                if (a.type === 'auto_pause') return '<p style="color:#ef4444;font-size:13px;margin:4px 0;">⏸ Auto-paused @' + (a.creator || '') + ' — ' + (a.reason || '') + '</p>';
                if (a.type === 'auto_scale') return '<p style="color:#34d399;font-size:13px;margin:4px 0;">📈 Auto-scaled budget $' + (a.from||0) + ' → $' + (a.to||0) + '</p>';
                if (a.type === 'fatigue_flag') return '<p style="color:#ffb400;font-size:13px;margin:4px 0;">⚠️ Fatigue detected: @' + (a.creator || '') + '</p>';
                if (a.type === 'new_content') return '<p style="color:#9b6dff;font-size:13px;margin:4px 0;">🆕 New content found from @' + (a.creator || '') + '</p>';
                if (a.type === 'campaign_live') return '<p style="color:#34d399;font-size:13px;margin:4px 0;">🚀 ' + (a.msg || '') + '</p>';
                return a.msg ? '<p style="color:#6b7280;font-size:13px;margin:4px 0;">' + a.msg + '</p>' : '';
              }).join('')
            : '<p style="color:#6b7280;font-size:13px;">No actions this week.</p>';

          const recs = generateCampaignRecommendations(brand);
          const recsHtml = recs.length > 0
            ? '<div style="margin-top:16px;padding:16px;background:rgba(155,109,255,0.05);border:1px solid rgba(155,109,255,0.15);border-radius:10px;"><p style="color:#9b6dff;font-weight:700;font-size:12px;margin:0 0 8px;">💡 CAi RECOMMENDATIONS</p>' + recs.slice(0, 3).map(r => '<p style="color:#e0e4ed;font-size:13px;margin:4px 0;">' + r.emoji + ' ' + r.text + '</p>').join('') + '</div>'
            : '';

          await sendEmail(brand.email, 'CAi Weekly: $' + (week.spend || 0).toFixed(0) + ' spent · ' + (week.roas || 0).toFixed(1) + 'x ROAS',
            emailBase({
              title: (brand.brandName || brand.storeName || 'Brand') + ' — CAi Weekly Digest',
              preheader: '$' + (week.revenue || 0).toFixed(0) + ' revenue this week',
              headerEmoji: '🧠', accentColor: '#9b6dff', accentGradient: 'linear-gradient(135deg,#9b6dff,#0668E1)',
              bodyHtml: '<div style="background:#111827;border-radius:12px;padding:20px;margin-bottom:16px;"><p style="color:#9b6dff;font-weight:700;font-size:12px;margin:0 0 12px;">THIS WEEK</p><div style="display:flex;gap:24px;"><div><p style="color:#e0e4ed;font-size:22px;font-weight:800;margin:0;">$' + (week.spend||0).toFixed(0) + '</p><p style="color:#6b7280;font-size:11px;margin:2px 0;">spent</p></div><div><p style="color:#34d399;font-size:22px;font-weight:800;margin:0;">$' + (week.revenue||0).toFixed(0) + '</p><p style="color:#6b7280;font-size:11px;margin:2px 0;">revenue</p></div><div><p style="color:#9b6dff;font-size:22px;font-weight:800;margin:0;">' + (week.roas||0).toFixed(1) + 'x</p><p style="color:#6b7280;font-size:11px;margin:2px 0;">ROAS</p></div></div></div><p style="color:#8b95a8;font-size:13px;">' + activeCount + ' active · ' + pausedCount + ' paused' + (fatiguedCount > 0 ? ' · ' + fatiguedCount + ' fatigued' : '') + ' · ' + creatives.length + ' total</p>' + activityHtml + recsHtml,
              ctaText: 'View Dashboard', ctaUrl: 'https://www.creatorship.app/brand#ai-plans',
            })
          );
          console.log('[cai-cron-digest] Sent to', brand.email);
        } catch (e) { console.error('[cai-cron-digest] Error for', brand.email, ':', e.message); }
      }
    } catch (e) { console.error('[cai-cron-digest] Fatal:', e.message); }
  }
}
setInterval(caiDigestCheck, CAI_DIGEST_CHECK_INTERVAL);
console.log('  CAi: Weekly digest check hourly (sends Sunday ~9am EST)');

const CAI_REFRESH_INTERVAL = 24 * 60 * 60 * 1000;
async function caiAutoRefreshContent() {
  try {
    const brands = await loadBrands();
    const eligible = brands.filter(b => b.cai?.campaign?.id && b.tikTokStorePageUrl);
    if (eligible.length === 0) return;
    const scrapeKey = process.env.SCRAPE_KEY;
    if (!scrapeKey) return;
    console.log('[cai-cron-refresh] Checking ' + eligible.length + ' brands for new content...');

    for (const brand of eligible) {
      try {
        const handle = brand.tikTokStorePageUrl?.match(/@([^/?]+)/)?.[1];
        if (!handle) continue;
        const resp = await fetch('https://api.scrapecreators.com/v1/tiktok/profile/videos?handle=' + encodeURIComponent(handle) + '&limit=30', { headers: { 'x-api-key': scrapeKey } });
        if (!resp.ok) continue;
        const data = await resp.json();
        const rawVideos = data.aweme_list || data.data || data.videos || data.posts || [];
        const cachedIds = new Set((brand.tiktokVideosCache || []).map(v => String(v.id || v.aweme_id)));
        const newVideos = rawVideos.filter(v => !cachedIds.has(String(v.aweme_id || v.id)));

        if (newVideos.length > 0) {
          console.log('[cai-cron-refresh] Found ' + newVideos.length + ' new videos for ' + (brand.brandName || brand.storeName));
          const normalized = rawVideos.map(v => ({
            id: String(v.aweme_id || v.id),
            desc: (v.desc || '').slice(0, 200),
            views: v.statistics?.play_count || v.stats?.playCount || 0,
            likes: v.statistics?.digg_count || v.stats?.diggCount || 0,
            shares: v.statistics?.share_count || v.stats?.shareCount || 0,
            comments: v.statistics?.comment_count || v.stats?.commentCount || 0,
            cover: v.video?.cover?.url_list?.[0] || v.video?.origin_cover?.url_list?.[0] || '',
            coverHd: v.video?.origin_cover?.url_list?.[0] || '',
            authorHandle: v.author?.unique_id || handle,
            downloadUrl: (v.video?.download_addr?.url_list || [])[0] || '',
            playUrl: (v.video?.play_addr?.url_list || [])[0] || '',
            createTime: v.create_time || 0,
          })).sort((a, b) => (b.views || 0) - (a.views || 0));
          brand.tiktokVideosCache = normalized;
          brand.tiktokVideosCacheUpdatedAt = new Date().toISOString();

          if (brand.cai?.activityLog) {
            for (const nv of newVideos.slice(0, 3)) {
              const views = nv.statistics?.play_count || 0;
              brand.cai.activityLog.push({
                type: 'new_content',
                ts: new Date().toISOString(),
                msg: 'New video detected: ' + (nv.desc || '').slice(0, 40) + (views > 0 ? ' (' + (views >= 1e6 ? (views/1e6).toFixed(1) + 'M' : Math.round(views/1e3) + 'K') + ' views)' : ''),
                creator: nv.author?.unique_id || handle,
                videoId: String(nv.aweme_id || nv.id),
              });
            }
          }
          await saveBrand(brand);
        }
      } catch (e) { console.error('[cai-cron-refresh] Error for', brand.brandName, ':', e.message); }
    }
    console.log('[cai-cron-refresh] Done');
  } catch (e) { console.error('[cai-cron-refresh] Fatal:', e.message); }
}
setInterval(caiAutoRefreshContent, CAI_REFRESH_INTERVAL);
setTimeout(caiAutoRefreshContent, 120000);
console.log('  CAi: Content refresh every 24h (first run in 2min)');

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
      if (res.statusCode !== 200) { file.close(); fs.unlink(dest, () => {}); reject(new Error('Download failed: HTTP ' + res.statusCode + ' from ' + url.slice(0, 80))); return; }
      const ct = (res.headers['content-type'] || '').toLowerCase();
      if (ct.includes('text/html') || ct.includes('application/json')) { file.close(); fs.unlink(dest, () => {}); reject(new Error('Download returned ' + ct + ' instead of video — CDN URL likely expired')); return; }
      res.pipe(file); file.on('finish', () => { file.close(); const size = fs.statSync(dest).size; if (size < 10000) { fs.unlink(dest, () => {}); reject(new Error('Downloaded file too small (' + size + ' bytes) — likely not a valid video')); } else { resolve(dest); } });
    }).on('error', err => { fs.unlink(dest, () => {}); reject(err); });
  });
}

function metaPost(endpoint, params, _retryCount = 0) {
  return new Promise((resolve, reject) => {
    const body = Object.entries(params).filter(([k, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v)}`).join('&');
    const o = { hostname: 'graph.facebook.com', path: '/v22.0/' + endpoint, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } };
    const req = https.request(o, res => { let data = ''; res.on('data', c => data += c); res.on('end', () => { try { const j = JSON.parse(data); if (j.error) {
      const e = j.error;
      const msg = (e.message || 'Unknown') + (e.error_user_title ? ' — ' + e.error_user_title : '') + (e.error_user_msg ? ': ' + e.error_user_msg : '') + ' [code:' + (e.code || '?') + ' sub:' + (e.error_subcode || '?') + ']';

      // ═══ SELF-HEALING: Auto-fix known Meta API errors ═══
      if (_retryCount < 2) {
        const errLower = (e.message || '').toLowerCase();
        const fixed = { ...params };
        let shouldRetry = false;
        let fixDesc = '';

        // Fix 1: Bid strategy conflict — remove bid_strategy, Meta defaults to lowest cost
        if (errLower.includes('bid') && (errLower.includes('strategy') || errLower.includes('amount'))) {
          delete fixed.bid_strategy;
          delete fixed.bid_amount;
          shouldRetry = true;
          fixDesc = 'Removed bid_strategy (CBO handles bidding at campaign level)';
        }
        // Fix 2: optimization_goal VALUE requires ROAS bid — switch to OFFSITE_CONVERSIONS
        if (errLower.includes('value') && errLower.includes('optimization')) {
          fixed.optimization_goal = 'OFFSITE_CONVERSIONS';
          shouldRetry = true;
          fixDesc = 'Changed VALUE → OFFSITE_CONVERSIONS';
        }
        // Fix 3: daily_budget too low — Meta requires minimum $1/day (100 cents)
        if (errLower.includes('daily_budget') && errLower.includes('minimum')) {
          if (fixed.daily_budget && parseInt(fixed.daily_budget) < 100) {
            fixed.daily_budget = 500; // $5/day minimum
            shouldRetry = true;
            fixDesc = 'Increased daily_budget to minimum $5/day';
          }
        }
        // Fix 4: promoted_object required — add pixel if available
        if (errLower.includes('promoted_object') && errLower.includes('required')) {
          // Can't auto-fix without pixel, but try with LINK_CLICKS instead
          fixed.optimization_goal = 'LINK_CLICKS';
          delete fixed.promoted_object;
          shouldRetry = true;
          fixDesc = 'Switched to LINK_CLICKS (no pixel available)';
        }

        if (shouldRetry) {
          console.log('[meta-self-heal] ' + fixDesc + ' — retrying ' + endpoint);
          return metaPost(endpoint, fixed, _retryCount + 1).then(resolve).catch(reject);
        }
      }

      console.error('[meta] API error on', endpoint, ':', msg);
      reject(new Error(msg));
    } else resolve(j); } catch (e) { reject(new Error(data.slice(0, 300))); } }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

function metaUploadVideo(videoDataOrPath, title, token, adAccount) {
  return new Promise((resolve, reject) => {
    const videoData = Buffer.isBuffer(videoDataOrPath) ? videoDataOrPath : fs.readFileSync(videoDataOrPath);
    console.log('[meta-upload] Starting upload: ' + (videoData.length / 1e6).toFixed(1) + 'MB to ' + adAccount + '/advideos title="' + title + '"');
    if (videoData.length < 10000) { reject(new Error('Video data too small (' + videoData.length + ' bytes) — not a valid video')); return; }
    const boundary = '----CSB' + Date.now();
    const parts = [];
    parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n' + token + '\r\n'));
    parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="title"\r\n\r\n' + title + '\r\n'));
    parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="source"; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\n'));
    parts.push(videoData);
    parts.push(Buffer.from('\r\n--' + boundary + '--\r\n'));
    const body = Buffer.concat(parts);
    const o = { hostname: 'graph-video.facebook.com', path: '/v22.0/' + adAccount + '/advideos', method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length } };
    const req = https.request(o, res => { let data = ''; res.on('data', c => data += c); res.on('end', () => { console.log('[meta-upload] Response status=' + res.statusCode + ' body=' + data.slice(0, 300)); try { const j = JSON.parse(data); if (j.error) reject(new Error(j.error.message)); else resolve(j); } catch (e) { reject(new Error('Non-JSON response: ' + data.slice(0, 300))); } }); });
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Meta video upload timed out after 120s')); });
    req.on('error', reject); req.write(body); req.end();
  });
}

// Poll Meta until video is processed and ready for use in creatives
async function metaWaitForVideo(videoId, token, maxWaitMs = 60000) {
  const start = Date.now();
  const pollInterval = 3000;
  while (Date.now() - start < maxWaitMs) {
    try {
      const url = 'https://graph.facebook.com/v22.0/' + videoId + '?fields=status&access_token=' + encodeURIComponent(token);
      const r = await fetch(url);
      const d = await r.json();
      const status = d?.status?.video_status || d?.status?.processing_phase;
      console.log('[meta] Video', videoId, 'status:', status || JSON.stringify(d?.status || 'unknown'));
      if (status === 'ready' || status === 'available') return true;
      if (status === 'error' || status === 'failed') throw new Error('Meta video processing failed for ' + videoId);
    } catch (e) { if (e.message.includes('failed')) throw e; }
    await new Promise(r => setTimeout(r, pollInterval));
  }
  console.warn('[meta] Video', videoId, 'still processing after', maxWaitMs/1000, 's — proceeding anyway');
  return false;
}

function caiScore(v) {
  const views = v.views || 0;
  const likes = v.likes || 0;
  const shares = v.shares || 0;
  const comments = v.comments || 0;
  const followers = v.follower_count || 1;

  const engRate = views > 0 ? (likes + comments + shares) / views : 0;
  const virality = Math.min(views / Math.max(followers, 1000), 5);
  const shareRate = views > 0 ? shares / views : 0;
  const hookScore = Math.min(views / 10000, 20);

  const score =
    Math.min(engRate * 1000, 35) +
    Math.min(virality * 8, 25) +
    Math.min(shareRate * 2000, 25) +
    Math.min(hookScore, 15);

  return Math.round(Math.min(score, 100));
}

// ═══════════════════════════════════════════════════════════
// TIKTOK VERIFICATION FILE
// ═══════════════════════════════════════════════════════════
app.get('/auth/tiktok/callback/tiktokkMo4lcclKQtMA9J4mUi9oZCD9XrdJh5U.txt', async (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send('tiktok-developers-site-verification=kMo4lcclKQtMA9J4mUi9oZCD9XrdJh5U');
});

app.get('/tiktokPSdeF4BIxA7MFQOnvTIjUBTX89Ey4nnG.txt', async (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send('tiktok-developers-site-verification=PSdeF4BIxA7MFQOnvTIjUBTX89Ey4nnG');
});

// ═══════════════════════════════════════════════════════════
// TIKTOK CREATOR OAUTH
// ═══════════════════════════════════════════════════════════
app.get('/auth/tiktok', async (req, res) => {
  const creatorId = req.query.creatorId || null;
  const state = Buffer.from(JSON.stringify({ creatorId, rnd: crypto.randomBytes(8).toString('hex') })).toString('base64url');
  const scopes = 'user.info.basic';
  const url = 'https://www.tiktok.com/v2/auth/authorize/?client_key=' + TT_CLIENT_KEY + '&scope=' + encodeURIComponent(scopes) + '&response_type=code&redirect_uri=' + encodeURIComponent(REDIRECT_URI) + '&state=' + encodeURIComponent(state);
  res.redirect(url);
});

app.get('/auth/tiktok/callback', async (req, res) => {
  const { code, state: stateRaw, error: err, error_description } = req.query;
  if (err) return res.send('<h1>' + err + '</h1><p>' + (error_description || '') + '</p><a href="' + (process.env.FRONTEND_URL || 'http://localhost:5173') + '">Back</a>');
  if (!code) return res.send('<h1>No code</h1><pre>' + JSON.stringify(req.query) + '</pre>');
  let creatorId = null;
  try { if (stateRaw) creatorId = JSON.parse(Buffer.from(stateRaw, 'base64url').toString()).creatorId; } catch (_) {}

  const body = new URLSearchParams({ client_key: TT_CLIENT_KEY, client_secret: TT_CLIENT_SECRET, code: code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI }).toString();

  const opts = { hostname: 'open.tiktokapis.com', path: '/v2/oauth/token/', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-cache' } };
  const tokenReq = https.request(opts, async (tokenRes) => {
    let data = '';
    tokenRes.on('data', c => data += c);
    tokenRes.on('end', async () => {
      try {
        const t = JSON.parse(data);
        if (t.access_token) {
          const accessToken = t.access_token;
          const refreshToken = t.refresh_token || '';
          const profileUrl = 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,avatar_url,avatar_url_100,username,follower_count,video_count';
          const profileData = await new Promise((resolve, reject) => {
            const u = new URL(profileUrl);
            const req = https.request({
              hostname: u.hostname,
              path: u.pathname + u.search,
              method: 'GET',
              headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
              }
            }, (res) => {
              let body = '';
              res.on('data', d => body += d);
              res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(e); }
              });
            });
            req.on('error', reject);
            req.end();
          });
          const user = profileData?.data?.user || {};
          const realHandle = (user.username || user.display_name || '').trim().replace(/^@/, '') || t.open_id;
          const tiktokAvatar = user.avatar_url_100 || user.avatar_url || '';
          const tiktokFollowers = parseInt(user.follower_count) || 0;
          const tiktokVideos = parseInt(user.video_count) || 0;

          ttTokens = { access_token: accessToken, refresh_token: refreshToken, open_id: t.open_id, scope: t.scope, connected_at: new Date().toISOString(), display_name: user.display_name, username: user.username, avatar_url: tiktokAvatar, follower_count: tiktokFollowers, video_count: tiktokVideos };
          ensureDir(DATA_DIR);
          saveJson(path.join(DATA_DIR, 'tt_tokens.json'), ttTokens);

          if (creatorId) {
            // Existing flow: logged-in creator connecting TikTok to their account
            const creators = await loadCreators();
            const creator = creators.find(c => c.id === creatorId);
            if (creator) {
              creator.tiktokConnected = true;
              creator.tiktokOpenId = t.open_id;
              creator.tiktokHandle = user.display_name || user.username || realHandle || '';
              creator.tiktokFollowers = tiktokFollowers;
              creator.tiktokVideos = tiktokVideos;
              creator.tiktokAvatar = user.avatar_url_100 || user.avatar_url || tiktokAvatar || null;
              creator.tiktokConnectedAt = new Date().toISOString();
              creator.tiktokAccessToken = accessToken;
              creator.tiktokRefreshToken = refreshToken;
              await saveCreators(creators);
              checkAndTriggerOutreach(creator);
            }
            const front = process.env.FRONTEND_URL || 'http://localhost:5173';
            return res.redirect(front + '/creator#home');
          } else {
            // New flow: "Continue with TikTok" from signup/login page — find or auto-create creator by openId
            const creators = await loadCreators();
            let creator = creators.find(c => c.tiktokOpenId === t.open_id);

            if (!creator) {
              creator = {
                id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
                displayName: user.display_name || user.username || realHandle || '',
                tiktokHandle: user.display_name || user.username || realHandle || '',
                tiktokOpenId: t.open_id,
                tiktokConnected: true,
                tiktokFollowers: tiktokFollowers,
                tiktokVideos: tiktokVideos,
                tiktokAvatar: user.avatar_url_100 || user.avatar_url || tiktokAvatar || null,
                email: null,
                stripeAccountId: null,
                createdAt: new Date().toISOString(),
                outreachCompleted: false,
              };
              creators.push(creator);
              await saveCreators(creators);
            }

            try {
              if (res.cookie) res.cookie('creatorship_creator_id', creator.id, { httpOnly: true, sameSite: 'none', secure: process.env.NODE_ENV === 'production' });
            } catch (_) {}

            const front = process.env.FRONTEND_URL || 'http://localhost:5173';
            return res.redirect(front + '/creator#home');
          }
        } else {
          res.send('<h1>Token Error</h1><pre>' + JSON.stringify(t, null, 2) + '</pre><a href="' + (process.env.FRONTEND_URL || 'http://localhost:5173') + '">Back</a>');
        }
      } catch (e) { res.send('<h1>Error</h1><pre>' + data + '</pre>'); }
    });
  });
  tokenReq.on('error', e => res.send('<h1>Error</h1><pre>' + e.message + '</pre>'));
  tokenReq.write(body);
  tokenReq.end();
});

app.get('/api/tiktok/status', async (req, res) => {
  if (ttTokens) res.json({ connected: true, display_name: ttTokens.display_name || '', open_id: ttTokens.open_id, follower_count: ttTokens.follower_count || 0, video_count: ttTokens.video_count || 0, agreedToTerms: !!ttTokens.agreedToTerms });
  else res.json({ connected: false });
});

app.get('/api/creator/tiktok-status', async (req, res) => {
  const creatorId = req.query.creatorId || req.headers['x-creator-id'];
  if (!creatorId) return res.status(400).json({ error: 'missing creatorId' });
  const creators = await loadCreators();
  const creator = creators.find(c => c.id === creatorId);
  if (!creator) return res.status(404).json({ error: 'not found' });
  const isConnected = !!(creator.tiktokConnected || creator.tiktokHandle || creator.tiktokOpenId);
  res.json({
    connected: isConnected,
    handle: creator.tiktokHandle || '',
    avatarUrl: creator.tiktokAvatar || '',
    followers: creator.tiktokFollowers || 0,
    videos: creator.tiktokVideos || 0,
    connectedAt: creator.tiktokConnectedAt || null
  });
  if (isConnected && !creator.tiktokAvatar && creator.displayName) {
    const port = process.env.PORT || 3001;
    const base = process.env.TUNNEL_URL || 'http://127.0.0.1:' + port;
    fetch(base + '/api/creator/enrich-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creatorId: creator.id })
    }).catch(() => {});
  }
});

app.get('/api/tiktok/videos', async (req, res) => {
  if (!ttTokens) return res.status(401).json({ error: 'Not connected' });
  try {
    const r = await apiFetch('https://open.tiktokapis.com/v2/video/list/?fields=id,title,cover_image_url,share_url,view_count,like_count,comment_count,share_count,create_time,duration', { method: 'POST', headers: { 'Authorization': 'Bearer ' + ttTokens.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ max_count: 20 }) });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/creators', async (req, res) => {
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
// CREATOR PORTAL — Deals & Earnings (auth by Bearer creatorId)
// ═══════════════════════════════════════════════════════════
async function getCreatorFromAuth(req) {
  const auth = req.headers.authorization || '';
  const token = (auth.match(/^\s*Bearer\s+(.+)$/i) || [])[1] || req.cookies?.creatorship_creator_id || req.query.creatorId;
  if (!token) return null;
  const creators = await loadCreators();
  return creators.find(c => c.id === token) || null;
}

async function getCreatorById(creatorId, creatorToken) {
  if (!creatorId || !creatorToken) return null;
  const creators = await loadCreators();
  return creators.find(c => c.id === creatorId) || null;
}

app.get('/api/creator/me', async (req, res) => {
  const creator = await getCreatorFromAuth(req);
  if (!creator) return res.status(401).json({ error: 'Unauthorized' });
  res.json({
    id: creator.id,
    email: creator.email,
    displayName: creator.displayName || '',
    tiktokHandle: creator.tiktokHandle || '',
    tiktokAvatar: creator.tiktokAvatar || '',
    tiktokFollowers: creator.tiktokFollowers ?? 0,
    tiktokVideos: creator.tiktokVideos ?? 0,
    tiktokConnected: !!creator.tiktokConnected,
    minCommission: creator.minCommission ?? 10,
    createdAt: creator.createdAt || '',
    agreedToTerms: !!creator.agreedToTerms,
    agreedAt: creator.agreedAt || null,
    emailVerified: creator.emailVerified !== false,
  });
});

app.get('/api/creator/deals', async (req, res) => {
  const creator = await getCreatorFromAuth(req);
  if (!creator) return res.status(401).json({ error: 'Unauthorized', deals: [] });

  const registry = await loadCampaignRegistry();
  const brands = await loadBrands();
  const earningsPath = path.join(DATA_DIR, 'creator_earnings.json');
  let byCreator = {};
  try { if (fs.existsSync(earningsPath)) byCreator = loadJson(earningsPath); } catch (_) {}
  const creatorLabel = creator.tiktokHandle || creator.displayName || creator.email || '';
  const creatorKey = Object.keys(byCreator).find(k => creatorNameMatches(k, creatorLabel)) || creatorLabel;

  const deals = [];
  for (const [campId, meta] of Object.entries(registry)) {
    if (!creatorNameMatches(meta.creator, creatorLabel) && !creatorNameMatches(meta.creator, creator.tiktokHandle)) continue;
    const brand = brands.find(b => b.id === meta.brandId);
    const payouts = (byCreator[creatorKey]?.payouts || []).filter(p => p.campaignId === campId);
    const earnings = payouts.reduce((s, p) => s + (p.amount || 0), 0);
    deals.push({
      id: campId,
      brandName: meta.brand || brand?.brandName || brand?.storeName || 'Brand',
      brandLogo: brand?.enrichedShop?.shopLogo || '',
      productName: meta.productTitle || 'Product',
      commissionRate: meta.commission ?? 10,
      status: (meta.status || 'active').toLowerCase(),
      createdAt: meta.launchedAt || meta.createdAt || new Date().toISOString(),
      earnings,
      brand: meta.brand || brand?.brandName || 'Brand',
      product: meta.productTitle || 'Product',
      commission: (meta.commission ?? 10) + '%',
      price: '$' + (meta.productPrice ?? 39.99).toFixed(2),
      perSale: '$' + ((meta.productPrice ?? 39.99) * ((meta.commission ?? 10) / 100)).toFixed(2),
      launchedAt: meta.launchedAt,
    });
  }
  const pending = deals.filter(d => (d.status || '').toLowerCase() === 'pending').length;
  const active = deals.filter(d => (d.status || '').toLowerCase() === 'active').length;
  res.json({
    deals,
    available: pending,
    accepted: active,
    lifetime: deals.length,
  });
});

app.get('/api/creator/earnings', async (req, res) => {
  const creator = await getCreatorFromAuth(req);
  if (!creator) return res.status(401).json({ error: 'Unauthorized', totalEarned: 0, pendingPayout: 0, lastPayout: null, weeklyEarnings: [], deals: [] });

  const creatorLabel = creator.tiktokHandle || creator.displayName || creator.email || '';
  const earningsPath = path.join(DATA_DIR, 'creator_earnings.json');
  let byCreator = {};
  try { if (fs.existsSync(earningsPath)) byCreator = loadJson(earningsPath); } catch (_) {}
  const creatorKey = Object.keys(byCreator).find(k => creatorNameMatches(k, creatorLabel)) || creatorLabel;
  let data = byCreator[creatorKey] || { totalEarned: 0, payouts: [], earnings: [] };

  const payouts = data.payouts || [];
  const earningsList = data.earnings || payouts.map(p => ({ date: p.date, brand: (p.product || '').split(' ')[0] || 'Brand', video: p.product || 'Campaign', amount: p.amount || 0, status: 'Paid' }));
  const totalEarned = data.totalEarned ?? payouts.reduce((s, p) => s + (p.amount || 0), 0);
  const pendingPayout = data.availableBalance ?? data.pendingPayout ?? 0;
  const lastPayout = payouts.length ? { amount: payouts[0].amount || 0, date: payouts[0].date } : null;

  const weekMs = 7 * 86400000;
  const now = Date.now();
  const weeklyEarnings = [];
  for (let i = 0; i < 8; i++) {
    const weekEnd = new Date(now - i * weekMs);
    const weekStart = new Date(weekEnd.getTime() - weekMs);
    const weekKey = weekStart.toISOString().slice(0, 10) + '_to_' + weekEnd.toISOString().slice(0, 10);
    const amount = payouts.filter(p => p.date && p.date >= weekStart.toISOString().slice(0, 10) && p.date <= weekEnd.toISOString().slice(0, 10)).reduce((s, p) => s + (p.amount || 0), 0);
    weeklyEarnings.push({ week: weekKey, amount });
  }
  weeklyEarnings.reverse();

  const registry = await loadCampaignRegistry();
  const brands = await loadBrands();
  const deals = [];
  for (const [campId, meta] of Object.entries(registry)) {
    if (!creatorNameMatches(meta.creator, creatorLabel)) continue;
    const brand = brands.find(b => b.id === meta.brandId);
    const dealPayouts = payouts.filter(p => p.campaignId === campId);
    const earnings = dealPayouts.reduce((s, p) => s + (p.amount || 0), 0);
    deals.push({
      id: campId,
      brandName: meta.brand || brand?.brandName || 'Brand',
      brandLogo: '',
      productName: meta.productTitle || 'Product',
      commissionRate: meta.commission ?? 10,
      status: (meta.status || 'active').toLowerCase(),
      createdAt: meta.launchedAt || new Date().toISOString(),
      earnings,
    });
  }

  res.json({
    totalEarned,
    pendingPayout,
    lastPayout,
    weeklyEarnings,
    deals,
    availableBalance: pendingPayout,
    nextPayout: lastPayout?.amount ?? 0,
    payouts,
    earnings: earningsList,
  });
});

app.post('/api/tiktok/disconnect', async (req, res) => {
  const creatorId = req.body?.creatorId;
  if (creatorId) {
    const creators = await loadCreators();
    const idx = creators.findIndex(c => c.id === creatorId);
    if (idx !== -1) {
      delete creators[idx].tiktokConnected;
      delete creators[idx].tiktokAccessToken;
      delete creators[idx].tiktokRefreshToken;
      delete creators[idx].tiktokConnectedAt;
      await saveCreators(creators);
    }
  }
  ttTokens = null;
  const f = path.join(DATA_DIR, 'tt_tokens.json');
  if (fs.existsSync(f)) fs.unlinkSync(f);
  res.json({ ok: true });
});

app.post('/api/creator/agree-terms', async (req, res) => {
  if (!ttTokens) return res.status(401).json({ error: 'Not connected' });
  ttTokens.agreedToTerms = true;
  ttTokens.agreedAt = new Date().toISOString();
  saveJson(path.join(DATA_DIR, 'tt_tokens.json'), ttTokens);
  res.json({ success: true });
});

app.get('/api/creator/payout-settings', async (req, res) => {
  const connected = getConnectedCreators();
  const creator = connected[0]?.display_name || connected[0]?.open_id;
  if (!creator) return res.json({ method: null, payoutEmail: '', payoutPhone: '' });
  const creators = await loadCreators();
  const rec = creators.find(c => creatorNameMatches(c.display_name || c.open_id, creator));
  res.json({ method: rec?.payoutMethod || null, payoutEmail: rec?.payoutEmail || '', payoutPhone: rec?.payoutPhone || '' });
});

app.post('/api/creator/payout-settings', async (req, res) => {
  const connected = getConnectedCreators();
  const creator = connected[0]?.display_name || connected[0]?.open_id;
  if (!creator) return res.status(401).json({ error: 'Not connected' });
  const { method, payoutEmail, payoutPhone } = req.body;
  let creators = await loadCreators();
  let rec = creators.find(c => creatorNameMatches(c.display_name || c.open_id, creator));
  if (!rec) {
    rec = { display_name: creator, open_id: connected[0]?.open_id };
    creators.push(rec);
  }
  if (method !== undefined) rec.payoutMethod = method;
  if (payoutEmail !== undefined) rec.payoutEmail = payoutEmail || '';
  if (payoutPhone !== undefined) rec.payoutPhone = payoutPhone || '';
  await saveCreators(creators);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════
// STRIPE CONNECT — creator payouts
// ═══════════════════════════════════════════════════════════
app.post('/api/creator/stripe-connect', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe is not configured' });
  const connected = getConnectedCreators();
  const creator = connected[0]?.display_name || connected[0]?.open_id;
  if (!creator) return res.status(401).json({ error: 'Not connected' });
  const { email } = req.body || {};
  try {
    let creators = await loadCreators();
    let rec = creators.find(c => creatorNameMatches(c.display_name || c.open_id, creator));
    if (!rec) {
      rec = { display_name: creator, open_id: connected[0]?.open_id };
      creators.push(rec);
    }

    if (rec.stripeAccountId) {
      try {
        await stripe.accounts.retrieve(rec.stripeAccountId);
      } catch (e) {
        rec.stripeAccountId = null;
        await saveCreators(creators);
      }
    }

    if (!rec.stripeAccountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: email || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: { creator_id: String(creator) },
      });
      rec.stripeAccountId = account.id;
      await saveCreators(creators);
    }

    const front = process.env.FRONTEND_URL || 'http://localhost:5173';
    const accountLink = await stripe.accountLinks.create({
      account: rec.stripeAccountId,
      refresh_url: front + '/creator?stripe=refresh',
      return_url: front + '/creator?stripe=complete',
      type: 'account_onboarding',
    });
    res.json({ url: accountLink.url });
  } catch (err) {
    console.error('Stripe Connect error:', err);
    res.status(500).json({ error: err.message || 'Stripe error' });
  }
});

app.get('/api/creator/stripe-status', async (req, res) => {
  if (!stripe) return res.json({ connected: false });
  const connected = getConnectedCreators();
  const creator = connected[0]?.display_name || connected[0]?.open_id;
  if (!creator) return res.json({ connected: false });
  let creators = [];
  try { creators = loadJson(CREATORS_FILE) || []; } catch (_) {}
  const rec = creators.find(c => creatorNameMatches(c.display_name || c.open_id, creator));
  if (!rec?.stripeAccountId) return res.json({ connected: false });
  try {
    const account = await stripe.accounts.retrieve(rec.stripeAccountId);
    res.json({
      connected: true,
      payoutsEnabled: !!account.payouts_enabled,
      detailsSubmitted: !!account.details_submitted,
      accountId: account.id,
    });
  } catch (err) {
    res.json({ connected: false, error: err.message });
  }
});

app.get('/api/creator/stripe-dashboard', async (req, res) => {
  if (!stripe) return res.status(503).send('Stripe not configured');
  const connected = getConnectedCreators();
  const creator = connected[0]?.display_name || connected[0]?.open_id;
  if (!creator) return res.redirect((process.env.FRONTEND_URL || 'http://localhost:5173') + '/creator');
  let creators = [];
  try { creators = loadJson(CREATORS_FILE) || []; } catch (_) {}
  const rec = creators.find(c => creatorNameMatches(c.display_name || c.open_id, creator));
  if (!rec?.stripeAccountId) return res.redirect((process.env.FRONTEND_URL || 'http://localhost:5173') + '/creator');
  try {
    const loginLink = await stripe.accounts.createLoginLink(rec.stripeAccountId);
    res.redirect(loginLink.url);
  } catch (err) {
    console.error('Stripe login link error:', err);
    res.redirect((process.env.FRONTEND_URL || 'http://localhost:5173') + '/creator?stripe=refresh');
  }
});

app.post('/api/creator/payout', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe is not configured' });
  const { creatorId, amount, description } = req.body || {};
  if (!creatorId || amount == null) return res.status(400).json({ error: 'creatorId and amount (cents) required' });
  const amountCents = Math.round(Number(amount));
  if (amountCents < 1) return res.status(400).json({ error: 'amount must be positive' });
  let creators = [];
  try { creators = loadJson(CREATORS_FILE) || []; } catch (_) {}
  const creator = creators.find(c => (c.open_id && c.open_id === creatorId) || (c.display_name && creatorNameMatches(c.display_name, creatorId)) || c.id === creatorId);
  if (!creator?.stripeAccountId) return res.status(400).json({ error: 'Creator has no Stripe account' });
  try {
    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: 'usd',
      destination: creator.stripeAccountId,
      description: description || 'Creatorship creator payout',
    });
    const earningsFile = path.join(DATA_DIR, 'earnings.json');
    let earnings = [];
    try { earnings = loadJson(earningsFile) || []; } catch (_) {}
    earnings.push({
      creatorId,
      amount: amountCents / 100,
      stripeTransferId: transfer.id,
      description: description || 'Creatorship creator payout',
      status: 'paid',
      date: new Date().toISOString(),
    });
    saveJson(earningsFile, earnings);
    res.json({ success: true, transferId: transfer.id });
  } catch (err) {
    console.error('Payout error:', err);
    res.status(500).json({ error: err.message || 'Payout failed' });
  }
});

// ═══════════════════════════════════════════════════════════
// BRAND AUTH — signup / login
// ═══════════════════════════════════════════════════════════

app.post('/api/brand/signup', signupLimiter, async (req, res) => {
  const body = req.body;
  const { brandName, storeName, email, password } = body;
  const displayName = (brandName || storeName || '').trim();
  if (!displayName || !email || !password) return res.status(400).json({ error: 'Missing required fields (store/brand name, email, password)' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (!/[A-Z]/.test(password)) return res.status(400).json({ error: 'Password must contain at least one uppercase letter.' });
  if (!/[0-9]/.test(password)) return res.status(400).json({ error: 'Password must contain at least one number.' });
  const existingBrand = await getBrandByEmail((email || '').toLowerCase());
  if (existingBrand) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  const hashed = await bcrypt.hash(password, SALT_ROUNDS);
  const emailToken = crypto.randomBytes(32).toString('hex');
  const brand = {
    id: Date.now().toString(),
    brandName: displayName,
    storeName: (body.storeName || body.enrichedShop?.shopName || storeName || displayName || '').toString().replace(/^@/, ''),
    email: (email || '').toLowerCase(),
    password: hashed,
    emailVerified: false,
    outreachAuthorized: false,
    outreachAuthorizedAt: null,
    emailToken,
    createdAt: new Date().toISOString(),
    shopLogo: body.enrichedShop?.shopLogo || null,
    shopName: body.enrichedShop?.shopName || null,
    tikTokShopUrl: body.tikTokShopUrl || body.enrichedShop?.tikTokShopUrl || null,
    followerCount: body.enrichedShop?.followerCount || null,
    totalItemsSold: body.enrichedShop?.totalItemsSold || null,
    totalProducts: body.enrichedShop?.totalProducts || null,
    rating: body.enrichedShop?.rating || null,
    enrichedShop: body.enrichedShop || null,
    tikTokStorePageUrl: body.enrichedShop?.tikTokStorePageUrl || (body.enrichedShop?.handle ? 'https://www.tiktok.com/@' + body.enrichedShop.handle : null),
  };
  await saveBrand(brand);
  const verifyUrl = `https://www.creatorship.app/api/auth/verify-email?token=${emailToken}`;
  const sessionBrand = brandResponse(brand);
  res.status(200).json({ success: true, brand: { ...sessionBrand, showVerifyBanner: true }, token: signBrandToken(brand, 'owner') });
  // fire-and-forget verification email
  sendEmail(
    brand.email,
    "Welcome to Creatorship — confirm your brand account 🚀",
    emailBase({
      title: 'Confirm your brand account',
      preheader: 'Your creator pipeline awaits.',
      headerEmoji: '🚀',
      accentColor: '#0099ff',
      accentGradient: 'linear-gradient(135deg,#0668E1,#0099ff,#25F4EE)',
      bodyHtml: `<p style="text-align:center;color:#374151;">Hi <strong>${escapeHtml(brand.brandName || 'Brand')}</strong>, welcome aboard.</p><p style="text-align:center;color:#6b7280;">Confirm your email to access your brand dashboard and start matching with TikTok creators who convert.</p>`,
      ctaText: 'Confirm Email',
      ctaUrl: verifyUrl,
      footerNote: "This link expires in 24 hours. Didn't sign up? Ignore this."
    })
  )
    .then(ok => {
      if (!ok) console.error('[email] FAILED to send to:', brand.email);
    })
    .catch(err => console.error('[email] FAILED to send to:', brand.email, err.message, err));
});

app.post('/api/auth/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const targetEmail = email.toLowerCase();
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenExpiry = Date.now() + 3600000;
  let found = false;

  const brand = await getBrandByEmail(targetEmail);
  if (brand) {
    brand.resetToken = resetToken;
    brand.resetTokenExpiry = resetTokenExpiry;
    await saveBrand(brand);
    found = true;
  }

  const creators = await loadCreators();
  const cIdx = creators.findIndex(c => (c.email || '').toLowerCase() === targetEmail);
  if (cIdx !== -1) {
    creators[cIdx].resetToken = resetToken;
    creators[cIdx].resetTokenExpiry = resetTokenExpiry;
    await saveCreators(creators);
    found = true;
  }

  if (found) {
    const resetUrl = `https://www.creatorship.app/reset-password?token=${resetToken}`;
    sendEmail(
      email,
      'Reset your Creatorship password',
      emailBase({
        title: 'Reset your password',
        preheader: 'Your reset link is inside.',
        headerEmoji: '🔐',
        bodyHtml: `<p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p><p style="color:#6b7280;font-size:13px;">If you didn't request a password reset, you can safely ignore this email — your account is secure.</p>`,
        ctaText: 'Reset Password',
        ctaUrl: resetUrl,
        footerNote: 'This link expires in 1 hour.'
      })
    ).catch(err => console.error('[reset] Email failed:', err.message));
  }
  return res.status(200).json({ message: 'sent' });
});

app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });
  if (String(newPassword).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const brand = await getBrandByResetToken(token);
  if (brand && Number(brand.resetTokenExpiry || 0) > Date.now()) {
    brand.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    delete brand.resetToken;
    delete brand.resetTokenExpiry;
    await saveBrand(brand);
    return res.status(200).json({ message: 'Password updated. You can now log in.' });
  }

  const creators = await loadCreators();
  const cIdx = creators.findIndex(c => c.resetToken === token && Number(c.resetTokenExpiry || 0) > now);
  if (cIdx !== -1) {
    creators[cIdx].password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    delete creators[cIdx].resetToken;
    delete creators[cIdx].resetTokenExpiry;
    await saveCreators(creators);
    return res.status(200).json({ message: 'Password updated. You can now log in.' });
  }
  return res.status(400).json({ error: 'Reset link is invalid or expired.' });
});

app.get('/api/auth/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/?error=invalid-token');

  const brand = await getBrandByEmailToken(token);
  if (brand) {
    brand.emailVerified = true;
    delete brand.emailToken;
    await saveBrand(brand);
    return res.redirect('/brand?email_verified=true#optimize');
  }

  const creators = await loadCreators();
  const cIdx = creators.findIndex(c => c.emailToken === token);
  if (cIdx !== -1) {
    creators[cIdx].emailVerified = true;
    delete creators[cIdx].emailToken;
    await saveCreators(creators);
    checkAndTriggerOutreach(creators[cIdx]);
    return res.redirect('/brand?email_verified=true#optimize');
  }
  return res.redirect('/?error=invalid-token');
});

app.post('/api/auth/resend-verification', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });
  const targetEmail = String(email).toLowerCase();

  const brand = await getBrandByEmail(targetEmail);
  if (brand) {
    const emailToken = crypto.randomBytes(32).toString('hex');
    brand.emailToken = emailToken;
    brand.emailVerified = false;
    await saveBrand(brand);
    const verifyUrl = `https://www.creatorship.app/api/auth/verify-email?token=${emailToken}`;
    sendEmail(
      targetEmail,
      "Welcome to Creatorship — confirm your brand account 🚀",
      emailBase({
        title: 'Confirm your brand account',
        preheader: 'Your creator pipeline awaits.',
        headerEmoji: '🚀',
        accentColor: '#0099ff',
        accentGradient: 'linear-gradient(135deg,#0668E1,#0099ff,#25F4EE)',
        bodyHtml: `<p style="text-align:center;color:#374151;">Hi <strong>${escapeHtml(brand.brandName || 'Brand')}</strong>, welcome aboard.</p><p style="text-align:center;color:#6b7280;">Confirm your email to access your brand dashboard and start matching with TikTok creators who convert.</p>`,
        ctaText: 'Confirm Email',
        ctaUrl: verifyUrl,
        footerNote: "This link expires in 24 hours. Didn't sign up? Ignore this."
      })
    ).catch(err => console.error('[verify] resend brand failed:', err.message));
    return res.status(200).json({ message: 'sent' });
  }

  const creators = await loadCreators();
  const cIdx = creators.findIndex(c => (c.email || '').toLowerCase() === targetEmail);
  if (cIdx !== -1) {
    const emailToken = crypto.randomBytes(32).toString('hex');
    creators[cIdx].emailToken = emailToken;
    creators[cIdx].emailVerified = false;
    await saveCreators(creators);
    const verifyUrl = `https://www.creatorship.app/api/auth/verify-email?token=${emailToken}`;
    sendEmail(
      targetEmail,
      "You're in — confirm your Creatorship account 🎬",
      emailBase({
        title: 'Confirm your email',
        preheader: "One click and you're in.",
        headerEmoji: '🎬',
        accentColor: '#FE2C55',
        accentGradient: 'linear-gradient(135deg,#FE2C55,#ff6b35,#25F4EE)',
        bodyHtml: `<p style="text-align:center;color:#374151;">Hi <strong>${escapeHtml(creators[cIdx].displayName || 'Creator')}</strong>, you're almost in.</p><p style="text-align:center;color:#6b7280;">Confirm your email to unlock your creator dashboard — where your TikTok content turns into real brand deals and ad revenue.</p>`,
        ctaText: 'Confirm Email',
        ctaUrl: verifyUrl,
        footerNote: "This link expires in 24 hours. Didn't sign up? Ignore this."
      })
    ).catch(err => console.error('[verify] resend creator failed:', err.message));
    return res.status(200).json({ message: 'sent' });
  }

  return res.status(200).json({ message: 'sent' });
});

app.post('/api/brand/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
  const invalidAuth = { error: 'Invalid email or password.' };
  const brands = await loadBrands();
  const brand = brands.find(b => (b.email || '').toLowerCase() === (email || '').toLowerCase());
  if (brand) {
    if (brand.banned) return res.status(403).json({ error: 'Your account has been suspended. Contact support@creatorship.app.' });
    const match = brand.password ? await bcrypt.compare(password, brand.password) : false;
    if (match) {
      return res.json({ success: true, brand: brandResponse(brand), token: signBrandToken(brand, 'owner') });
    }
    // Check team members before returning generic auth error.
    const team = await loadTeam();
    const teamMember = team.find(t => t.email.toLowerCase() === (email || '').toLowerCase() && t.status === 'active');
    if (teamMember && teamMember.password) {
      const teamMatch = await bcrypt.compare(password, teamMember.password);
      if (teamMatch) {
        const ownerBrand = brands.find(b => b.id === teamMember.brandId);
        if (ownerBrand) {
          const { password: _, ...safe } = ownerBrand;
          return res.json({ success: true, brand: { ...brandResponse(ownerBrand), teamMemberEmail: teamMember.email, teamRole: teamMember.role }, token: signBrandToken(ownerBrand, teamMember.role) });
        }
      }
    }
    return res.status(401).json(invalidAuth);
  }
  // No brand found — check team members
  const team = await loadTeam();
  const teamMember = team.find(t => t.email.toLowerCase() === (email || '').toLowerCase() && t.status === 'active');
  if (teamMember && teamMember.password) {
    const teamMatch = await bcrypt.compare(password, teamMember.password);
    if (teamMatch) {
      const ownerBrand = brands.find(b => b.id === teamMember.brandId);
      if (ownerBrand) {
        const { password: _, ...safe } = ownerBrand;
        return res.json({ success: true, brand: { ...brandResponse(ownerBrand), teamMemberEmail: teamMember.email, teamRole: teamMember.role }, token: signBrandToken(ownerBrand, teamMember.role) });
      }
    }
  }
  return res.status(401).json(invalidAuth);
});

app.get('/api/brand/me', async (req, res) => {
  const brand = await getBrand(req.brandAuth?.brandId, req.query.email);
  if (!brand) return res.json({ error: 'Not found' });
  // Auto-recover adAccount if token exists but account missing
  if (brand.metaToken && !brand.adAccount) {
    try {
      const acctData = await apiFetch('https://graph.facebook.com/v22.0/me/adaccounts?fields=id,name,account_status&access_token=' + brand.metaToken);
      const active = (acctData.data || []).filter(a => a.account_status === 1 || a.account_status === 3);
      if (active.length > 0) {
        brand.adAccount = active[0].id;
        brand.metaAdAccounts = active.map(a => ({ id: a.id, name: a.name || a.id }));
        await saveBrand(brand);
        console.log('[brand/me] Auto-recovered adAccount:', brand.adAccount);
      }
    } catch (_) {}
  }
  res.json(brandResponse(brand));
});

app.put('/api/brand/me', authBrand, requireRole('admin'), async (req, res) => {
  const brandId = req.brandAuth?.brandId;
  if (!brandId) return res.status(401).json({ error: 'Not authenticated' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  if (req.body.pageId !== undefined && (req.body.pageId || '').toString().trim()) {
    const pid = (req.body.pageId || '').toString().trim();
    brand.pageId = pid;
    brand.metaPageId = pid;
  }
  if (req.body.pageName !== undefined) brand.pageName = req.body.pageName || '';
  await saveBrand(brand);
  res.json({ success: true, brand: brandResponse(brand) });
});

app.post('/api/brand/settings', requireRole('admin'), async (req, res) => {
  const { email, metaToken, adAccount, pageId, pageName, brandName, storeName, storeUrl, tikTokShopUrl, tikTokStorePageUrl } = req.body;
  const brand = await getBrand(req.brandAuth?.brandId, email);
  if (!brand) return res.json({ error: 'Brand not found' });
  if (metaToken !== undefined && metaToken !== '') brand.metaToken = metaToken;
  if (adAccount !== undefined && adAccount !== '') brand.adAccount = adAccount;
  if (req.body.pageId !== undefined && req.body.pageId !== '') { brand.pageId = req.body.pageId; brand.metaPageId = req.body.pageId; }
  if (req.body.pageName !== undefined) brand.pageName = req.body.pageName;
  if (brandName !== undefined) brand.brandName = brandName;
  if (storeName !== undefined) brand.storeName = (storeName || '').toString().replace(/^@/, '');
  if (storeUrl !== undefined) brand.storeUrl = storeUrl;
  if (tikTokShopUrl !== undefined) brand.tikTokShopUrl = tikTokShopUrl;
  // tikTokStorePageUrl is now server-derived — don't accept from frontend
  // if (tikTokStorePageUrl !== undefined) brand.tikTokStorePageUrl = tikTokStorePageUrl;
  if (req.body.defaultCommission !== undefined) brand.defaultCommission = Math.max(1, Math.min(80, Number(req.body.defaultCommission) || 10));
  await saveBrand(brand);
  res.json({ success: true, brand: brandResponse(brand) });
});

// ═══ Team member management ═══
app.post('/api/brand/team/invite', requireRole('admin'), async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  const { email, role } = req.body;
  if (!brandId || !email) return res.status(400).json({ error: 'brandId and email required' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });

  const team = await loadTeam();
  if (team.some(t => t.email.toLowerCase() === email.toLowerCase() && t.brandId === brandId)) {
    return res.status(400).json({ error: 'This email is already on the team' });
  }

  const inviteToken = crypto.randomBytes(16).toString('hex');
  const member = {
    id: 'tm_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
    brandId,
    email: email.toLowerCase(),
    role: role || 'viewer',
    status: 'invited',
    inviteToken,
    invitedAt: new Date().toISOString(),
    invitedBy: brand.email,
  };
  team.push(member);
  await saveTeam(team);

  const frontendUrl = process.env.FRONTEND_URL || process.env.TUNNEL_URL || 'http://localhost:3001';
  const inviteUrl = frontendUrl + '/brand?invite=' + inviteToken;
  sendEmail(
    email,
    'You\'ve been invited to ' + (brand.brandName || 'a brand') + ' on Creatorship',
    emailBase({
      title: `You've been invited to ${escapeHtml(brand.brandName || 'a brand')}`,
      preheader: "You've been invited to join a brand on Creatorship.",
      headerEmoji: '🤝',
      bodyHtml: `<p>You've been invited to join <strong>${escapeHtml(brand.brandName || 'a brand')}</strong> on Creatorship as a <strong>${role || 'viewer'}</strong>.</p><p>Click below to accept your invitation and set up your account.</p>`,
      ctaText: 'Accept Invitation',
      ctaUrl: inviteUrl,
      footerNote: "If you weren't expecting this invitation, ignore this email."
    })
  );

  res.json({ success: true, memberId: member.id });
});

app.get('/api/brand/team/invite-info', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token required' });
  const team = await loadTeam();
  const member = team.find(t => t.inviteToken === token && t.status === 'invited');
  if (!member) return res.status(404).json({ error: 'Invalid or expired invite link. Ask the brand owner to resend your invitation.' });
  const brands = await loadBrands();
  const brand = brands.find(b => b.id === member.brandId);
  res.json({ valid: true, email: member.email, role: member.role, brandName: brand?.brandName || brand?.storeName || 'your brand', invitedBy: member.invitedBy });
});

app.post('/api/brand/team/accept', async (req, res) => {
  const { inviteToken, password } = req.body;
  if (!inviteToken) return res.status(400).json({ error: 'Invite token required' });

  const team = await loadTeam();
  const idx = team.findIndex(t => t.inviteToken === inviteToken && t.status === 'invited');
  if (idx === -1) return res.status(400).json({ error: 'Invalid or expired invitation' });

  const member = team[idx];
  const hashed = password ? await bcrypt.hash(password, 10) : null;
  team[idx] = { ...member, status: 'active', password: hashed, acceptedAt: new Date().toISOString(), inviteToken: undefined };
  await saveTeam(team);

  res.json({ success: true, brandId: member.brandId, email: member.email, role: member.role });
});

app.get('/api/brand/team', async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.query.brandId;
  if (!brandId) return res.json({ members: [] });
  const team = await loadTeam();
  const members = team.filter(t => t.brandId === brandId).map(t => ({
    id: t.id, email: t.email, role: t.role, status: t.status,
    invitedAt: t.invitedAt, acceptedAt: t.acceptedAt,
  }));
  res.json({ members });
});

app.delete('/api/brand/team/:memberId', requireRole('admin'), async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.query.brandId;
  const { memberId } = req.params;
  const team = await loadTeam();
  const idx = team.findIndex(t => t.id === memberId && t.brandId === brandId);
  if (idx === -1) return res.status(404).json({ error: 'Member not found' });
  team.splice(idx, 1);
  await saveTeam(team);
  res.json({ success: true });
});

// Update a team member role (admin only)
app.put('/api/brand/team/:memberId/role', requireRole('admin'), async (req, res) => {
  const brandId = req.brandAuth?.brandId;
  const { memberId } = req.params;
  const { role } = req.body || {};

  if (!brandId) return res.status(401).json({ error: 'Authentication required' });
  if (!role || !['viewer', 'editor', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Must be viewer, editor, or admin.' });
  }

  const team = await loadTeam();
  const member = team.find(t => t.id === memberId && t.brandId === brandId);
  if (!member) return res.status(404).json({ error: 'Team member not found' });

  // Owner role is not represented in the team table; keep this guard for safety.
  if (member.role === 'owner') {
    return res.status(403).json({ error: 'Cannot change the owner role' });
  }

  // Only owner can promote to admin
  if (role === 'admin' && req.brandAuth?.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can promote members to admin' });
  }

  member.role = role;
  await saveTeam(team);

  res.json({ success: true, member: { id: member.id, email: member.email, role: member.role } });
});

// Helper: find brand by id or email (fallback)
function findBrandIdx(brands, brandId, email) {
  let idx = -1;
  if (brandId) idx = brands.findIndex(b => b.id === brandId);
  if (idx === -1 && email) idx = brands.findIndex(b => (b.email || '').toLowerCase() === (email || '').toLowerCase());
  return idx;
}
function brandResponse(b) {
  return {
    id: b.id,
    brandName: b.brandName || '',
    storeName: b.storeName || '',
    storeUrl: b.storeUrl || '',
    shopLogo: b.shopLogo || b.enrichedShop?.shopLogo || null,
    tikTokShopUrl: b.tikTokShopUrl || '',
    tikTokStorePageUrl: b.tikTokStorePageUrl || '',
    email: b.email,
    emailVerified: b.emailVerified !== false, // default true when missing
    hasMetaToken: !!(b.metaToken),
    metaTokenExpiresAt: b.metaTokenExpiresAt || null,
    adAccount: b.adAccount || '',
    metaPixelId: b.metaPixelId || null,
    pageId: b.metaPageId || b.pageId || '',
    pageName: b.pageName || b.metaPageName || '',
    metaPageId: b.metaPageId || b.pageId || '',
    metaPageName: b.metaPageName || '',
    billingEnabled: !!b.billingEnabled,
    billingCardLast4: b.billingCardLast4 || '',
    billingCardBrand: b.billingCardBrand || '',
    billingCardExpMonth: b.billingCardExpMonth || null,
    billingCardExpYear: b.billingCardExpYear || null,
    billingPaymentFailed: !!b.billingPaymentFailed,
    launchCount: b.launchCount || 0,
    freeLaunchesUsed: b.freeLaunchesUsed || 0,
    freeLaunchLimit: 3,
    defaultCommission: b.defaultCommission || 10,
    websiteUrl: b.websiteUrl || '',
    instagramHandle: b.instagramHandle || '',
    brandDescription: b.brandDescription || '',
    metaTokenType: b.metaTokenType || 'manual',
    metaUserName: b.metaUserName || '',
    metaAdAccounts: b.metaAdAccounts || [],
    metaPages: b.metaPages || [],
    outreachAuthorized: b.outreachAuthorized || false,
    outreachAuthorizedAt: b.outreachAuthorizedAt || null,
  };
}

// Dedicated save endpoints — accept brandId or email for lookup
app.post('/api/brand/update-meta', requireRole('admin'), async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  const { email, adAccount, pageId, accessToken } = req.body;
  const brand = await getBrand(brandId, email);
  if (!brand) return res.json({ error: 'Brand not found' });
  // Explicit disconnect: clearMeta flag wipes all Meta credentials
  if (req.body.clearMeta) {
    brand.metaToken = ''; brand.adAccount = ''; brand.pageId = ''; brand.metaPageId = '';
    brand.metaPageName = ''; brand.metaPageAccessToken = ''; brand.metaUserId = '';
    brand.metaUserName = ''; brand.metaAdAccounts = []; brand.metaPages = [];
    brand.metaTokenType = ''; brand.metaTokenExpiresAt = null;
    await saveBrand(brand);
    logActivity('meta_disconnect', { brandId: brand.id, email: brand.email });
    return res.json({ success: true, brand: brandResponse(brand) });
  }
  // Normal update: only set non-empty values
  if (adAccount && adAccount.trim()) brand.adAccount = adAccount.trim();
  if (pageId && (pageId || '').trim()) { const v = (pageId || '').trim(); brand.pageId = v; brand.metaPageId = v; }
  if (accessToken && (accessToken || '').trim()) brand.metaToken = (accessToken || '').trim();
  await saveBrand(brand);
  res.json({ success: true, brand: brandResponse(brand) });
});

app.post('/api/brand/update-tiktok', requireRole('admin'), async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  const { email, storeUrl } = req.body;
  const brand = await getBrand(brandId, email);
  if (!brand) return res.json({ error: 'Brand not found' });
  const url = (storeUrl || '').trim();
  brand.storeUrl = url;
  let storeName = '';
  const storeMatch = url.match(/\/shop\/store\/([^/?]+)/);
  const atMatch = url.match(/\/shop\/@([^/?]+)/);
  if (storeMatch) storeName = storeMatch[1];
  else if (atMatch) storeName = atMatch[1];
  else if (url && !url.includes('tiktok.com')) storeName = url.replace(/^@/, '');
  brand.storeName = storeName;
  await saveBrand(brand);
  res.json({ success: true, brand: brandResponse(brand) });
});

app.post('/api/brand/update-profile', requireRole('admin'), async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  const { email, brandName, storeName } = req.body;
  const brand = await getBrand(brandId, email);
  if (!brand) return res.json({ error: 'Brand not found' });
  if (brandName !== undefined) brand.brandName = (brandName || '').trim();
  if (req.body.defaultCommission !== undefined) brand.defaultCommission = Math.max(1, Math.min(80, Number(req.body.defaultCommission) || 10));
  if (storeName !== undefined) brand.storeName = (storeName || '').toString().replace(/^@/, '').trim();
  if (req.body.tikTokShopUrl !== undefined) brand.tikTokShopUrl = req.body.tikTokShopUrl;
  // tikTokStorePageUrl is now server-derived — don't accept from frontend
  // if (req.body.tikTokStorePageUrl !== undefined) brand.tikTokStorePageUrl = req.body.tikTokStorePageUrl;
  if (req.body.websiteUrl !== undefined) brand.websiteUrl = (req.body.websiteUrl || '').trim() || null;
  if (req.body.instagramHandle !== undefined) brand.instagramHandle = (req.body.instagramHandle || '').trim().replace(/^@/, '') || null;
  if (req.body.brandDescription !== undefined) brand.brandDescription = (req.body.brandDescription || '').trim() || null;
  await saveBrand(brand);
  res.json({ success: true, brand: brandResponse(brand) });
});

app.delete('/api/brand/account', requireRole('owner'), async (req, res) => {
  // Use JWT brandId — never trust email from body for deletion
  const brandId = req.brandAuth?.brandId;
  const { password } = req.body;
  if (!brandId) return res.status(401).json({ error: 'Authentication required' });
  if (!password) return res.status(400).json({ error: 'Password required to delete account' });
  try {
    const brand = await getBrandById(brandId);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });
    // Verify password before allowing deletion
    const valid = await bcrypt.compare(password, brand.passwordHash || brand.password || '');
    if (!valid) return res.status(401).json({ error: 'Incorrect password — account deletion requires your current password' });
    const email = brand.email;
    {
      const metaToken = brand.metaToken || brand.meta_token;
      const adAccount = brand.adAccount || brand.ad_account;
      const cai = brand.cai || {};
      const allCampaigns = getCaiCampaigns ? getCaiCampaigns(brand) : [];
      const creatives = cai.creatives || [];

      // Collect all Meta entity IDs to delete
      const campaignIds = new Set();
      const adsetIds = new Set();
      const adIds = new Set();

      // From cai.campaign
      if (cai.campaign?.id) campaignIds.add(cai.campaign.id);
      if (cai.campaign?.adsetId) adsetIds.add(cai.campaign.adsetId);

      // From all campaigns
      for (const camp of allCampaigns) {
        if (camp.metaCampaignId) campaignIds.add(camp.metaCampaignId);
        if (camp.metaAdsetId) adsetIds.add(camp.metaAdsetId);
        for (const cr of (camp.creatives || [])) {
          if (cr.adId) adIds.add(cr.adId);
        }
      }

      // From creatives
      for (const cr of creatives) {
        if (cr.adId) adIds.add(cr.adId);
      }

      if (metaToken && (campaignIds.size > 0 || adIds.size > 0)) {
        console.log('[brand-delete] Cleaning up Meta ads for ' + email + ': ' + adIds.size + ' ads, ' + adsetIds.size + ' adsets, ' + campaignIds.size + ' campaigns');

        // Delete ads first (bottom up: ads → adsets → campaigns)
        for (const adId of adIds) {
          try {
            await metaPost(adId, { status: 'DELETED', access_token: metaToken });
            console.log('[brand-delete] Deleted ad ' + adId);
          } catch (e) { console.error('[brand-delete] Failed to delete ad ' + adId + ':', e.message); }
        }

        // Delete adsets
        for (const adsetId of adsetIds) {
          try {
            await metaPost(adsetId, { status: 'DELETED', access_token: metaToken });
            console.log('[brand-delete] Deleted adset ' + adsetId);
          } catch (e) { console.error('[brand-delete] Failed to delete adset ' + adsetId + ':', e.message); }
        }

        // Delete campaigns
        for (const campaignId of campaignIds) {
          try {
            await metaPost(campaignId, { status: 'DELETED', access_token: metaToken });
            console.log('[brand-delete] Deleted campaign ' + campaignId);
          } catch (e) { console.error('[brand-delete] Failed to delete campaign ' + campaignId + ':', e.message); }
        }

        console.log('[brand-delete] Meta cleanup complete for ' + email);
      } else {
        console.log('[brand-delete] No Meta ads to clean up for ' + email + ' (token: ' + (metaToken ? 'yes' : 'no') + ', campaigns: ' + campaignIds.size + ')');
      }

      // Also clean up related Supabase tables
      try {
        await supabase.from('content_licenses').delete().eq('brand_id', brand.id);
        await supabase.from('messages').delete().eq('brand_id', brand.id);
        await supabase.from('campaign_registry').delete().eq('brand_id', brand.id);
        await supabase.from('billing').delete().eq('brand_id', brand.id);
        await supabase.from('billing_audit_log').delete().eq('brand_id', brand.id);
        await supabase.from('team_members').delete().eq('brand_id', brand.id);
        await supabase.from('creator_earnings').delete().eq('brand_id', brand.id);
      } catch (cleanupErr) {
        console.error('[brand-delete] Related table cleanup error:', cleanupErr.message);
      }
    }

    // Now delete the brand record itself (by id, not email)
    const { error } = await supabase.from('brands').delete().eq('id', brandId);
    if (error) return res.json({ error: error.message || 'Failed to delete brand' });

    console.log('[brand-delete] Brand account deleted: ' + email);
    await auditLogAction('account_deleted', brandId, { email });
    res.json({ success: true });
  } catch (e) {
    console.error('[brand-delete] Error:', e.message);
    res.json({ error: e.message || 'Failed to delete account' });
  }
});

app.post('/api/brand/update-email', async (req, res) => {
  const { brandId, newEmail, currentPassword } = req.body;
  if (!brandId || !newEmail || !currentPassword) return res.status(400).json({ error: 'All fields required' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  const valid = await bcrypt.compare(currentPassword, brand.passwordHash || brand.password || '');
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
  const existing = await getBrandByEmail(newEmail);
  if (existing && existing.id !== brandId) return res.status(400).json({ error: 'Email already in use' });
  const oldEmail = brand.email;
  brand.email = newEmail.toLowerCase();
  await supabase.from('brands').update({ email: newEmail.toLowerCase(), data: brand }).eq('id', brandId);
  await auditLogAction('email_changed', brandId, { oldEmail, newEmail: newEmail.toLowerCase() });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════
// STRIPE BILLING — Payment collection, spend tracking, invoicing
// ═══════════════════════════════════════════════════════════
async function loadBillingRecords(brandId) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('billing').select('data').eq('brand_id', brandId);
  if (error) return [];
  return (data || []).map(r => r.data).filter(Boolean);
}
async function saveBillingRecords(brandId, records) {
  if (!supabase) return;
  for (const record of records) {
    const id = record.id || ('billing_' + Date.now() + '_' + Math.random().toString(36).slice(2));
    record.id = id;
    const { error } = await supabase.from('billing').upsert({ id, brand_id: brandId, data: record }, { onConflict: 'id' });
    if (error) console.error('[supabase] saveBillingRecords error:', id, error.message);
  }
}

// Create Stripe Checkout Session — setup mode (saves payment method, no charge)
app.post('/api/billing/setup-checkout', authBrand, requireRole('admin'), async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY.' });
  const { brandId, email } = req.body;
  const brand = await getBrand(brandId || req.brandAuth?.brandId, email);
  if (!brand) return res.json({ error: 'Brand not found' });
  if (brand.stripeCustomerId) {
    try {
      await stripe.customers.retrieve(brand.stripeCustomerId);
    } catch (e) {
      brand.stripeCustomerId = null;
      await saveBrand(brand);
    }
  }
  try {
    let customerId = brand.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: brand.email,
        name: brand.brandName || brand.storeName || brand.email,
        metadata: { creatorship_brand_id: brand.id, platform: 'creatorship' }
      });
      customerId = customer.id;
      brand.stripeCustomerId = customerId;
      await saveBrand(brand);
    }
    const frontendUrl = process.env.FRONTEND_URL || process.env.TUNNEL_URL || 'http://localhost:3001';
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'setup',
      payment_method_types: ['card'],
      success_url: frontendUrl + '/brand?billing=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: frontendUrl + '/brand?billing=cancelled',
      metadata: { creatorship_brand_id: brand.id, purpose: 'billing_setup' }
    });
    res.json({ success: true, checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[billing] Setup checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Stripe Webhook — handles payment events
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(503).send('Stripe not configured');
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    if (webhookSecret && sig && req.body) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      const payload = Buffer.isBuffer(req.body) ? req.body.toString() : req.body;
      event = typeof payload === 'string' ? JSON.parse(payload) : payload;
    }
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return res.status(400).send('Webhook Error: ' + err.message);
  }
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.mode === 'setup' && session.metadata?.purpose === 'billing_setup') {
        const brandId = session.metadata.creatorship_brand_id;
        const customerId = session.customer;
        const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent);
        const paymentMethodId = setupIntent.payment_method;
        await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
        const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
        const card = pm.card || {};
        const brands_deprecated = null; // webhook refactored to use getBrandById
        const brand = await getBrandById(brandId);
        if (brand) {
          // Skip if billing was already enabled (prevents duplicate emails on webhook retries)
          if (brand.billingEnabled && brand.billingCardLast4 === (card.last4 || '')) {
            return res.json({ received: true });
          }
          brand.stripeCustomerId = customerId;
          brand.stripePaymentMethodId = paymentMethodId;
          brand.billingEnabled = true;
          brand.billingCardLast4 = card.last4 || '';
          brand.billingCardBrand = card.brand || '';
          brand.billingCardExpMonth = card.exp_month;
          brand.billingCardExpYear = card.exp_year;
          brand.billingSetupAt = new Date().toISOString();
          await saveBrand(brand);
          // Send billing confirmation email
          sendEmail(
            brand.email,
            'Payment Method Added',
            emailBase({
              title: 'Payment method connected ✓',
              preheader: "You're all set to launch campaigns.",
              headerEmoji: '💳',
              accentColor: '#10b981',
              accentGradient: 'linear-gradient(135deg,#10b981,#059669)',
              bodyHtml: `<p>Your card ending in <strong>${card.last4}</strong> has been successfully connected to your Creatorship account.</p><p style="color:#6b7280;">You're now ready to launch creator campaigns. Questions? Reply to this email.</p>`,
              ctaText: 'Go to Dashboard',
              ctaUrl: 'https://www.creatorship.app/brand'
            })
          ).catch(() => {});
        }
      }
    } else if (event.type === 'invoice.payment_failed') {
      // ═══ PAYMENT FAILURE CASCADE ═══
      const invoice = event.data.object;
      const customerId = invoice.customer;
      const brands = await loadBrands();
      const brand = brands.find(b => b.stripeCustomerId === customerId);
      if (brand) {
        const failCount = (brand.paymentFailCount || 0) + 1;
        brand.paymentFailCount = failCount;
        brand.lastPaymentFail = new Date().toISOString();

        console.log('[billing] Payment failed for ' + brand.email + ' (fail #' + failCount + ')');
        await auditLog(brand.id, 'payment_failed', { failCount, invoiceId: invoice.id });

        // Update billing record if we have metadata
        const brandId = invoice.metadata?.creatorship_brand_id || brand.id;
        const records = await loadBillingRecords(brandId);
        const existing = records.find(r => r.stripeInvoiceId === invoice.id);
        if (existing) { existing.status = 'failed'; existing.failedAt = new Date().toISOString(); await saveBillingRecords(brandId, records); }

        // Send warning email
        if (process.env.RESEND_KEY) {
          const failHtml = '<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">' +
            '<h2 style="color:#ef4444">Payment Failed</h2>' +
            '<p>Your payment method on file was declined for your Creatorship platform fee.</p>' +
            (failCount >= 2 ? '<p style="color:#ef4444;font-weight:bold">Your campaigns will be automatically paused in 24 hours if payment is not updated.</p>' : '<p>Please update your payment method to keep your campaigns running.</p>') +
            '<p><a href="' + (process.env.FRONTEND_URL || 'https://creatorship.app') + '/brand#account" style="background:#9b6dff;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Update Payment Method</a></p>' +
            '<p style="color:#999;font-size:12px">Invoice: $' + ((invoice.amount_due || 0) / 100).toFixed(2) + '</p>' +
            '</div>';
          sendEmail(brand.email, failCount === 1 ? 'Payment failed — action required' : 'URGENT: Payment still failing — campaigns will be paused', failHtml).catch(e => console.error('[billing] Failed to send payment fail email:', e.message));
        }

        // After 2 failures (roughly 7 days with Stripe retry): pause all campaigns
        if (failCount >= 2) {
          console.log('[billing] SUSPENDING campaigns for ' + brand.email + ' — payment failed ' + failCount + ' times');
          await auditLog(brand.id, 'campaigns_suspended', { reason: 'billing_payment_failed_' + failCount });
          brand.billingSuspended = true;
          brand.billingSuspendedAt = new Date().toISOString();
          brand.billingSuspendReason = 'payment_failed_' + failCount + 'x';

          // Pause Meta campaigns (single CAi campaign if present)
          if (brand.cai?.campaign?.id && brand.metaToken) {
            try {
              await fetch('https://graph.facebook.com/v22.0/' + brand.cai.campaign.id + '?status=PAUSED&access_token=' + brand.metaToken, { method: 'POST' });
              console.log('[billing] Paused Meta campaign ' + brand.cai.campaign.id + ' for ' + brand.email);
            } catch (e) { console.error('[billing] Failed to pause campaign:', e.message); }
          }
          if (brand.cai) brand.cai.isActive = false;
        }

        await saveBrand(brand);
      }

    } else if (event.type === 'charge.dispute.created') {
      // ═══ DISPUTE HANDLER — immediate campaign pause ═══
      const dispute = event.data.object;
      const charge = dispute.charge;
      console.log('[billing] DISPUTE CREATED — charge: ' + charge + ', reason: ' + dispute.reason + ', amount: $' + ((dispute.amount || 0) / 100).toFixed(2));

      let disputeBrand = null;
      if (dispute.customer) {
        const brands = await loadBrands();
        disputeBrand = brands.find(b => b.stripeCustomerId === dispute.customer);
      }

      if (disputeBrand) {
        console.log('[billing] Dispute from brand: ' + disputeBrand.email + ' — PAUSING ALL CAMPAIGNS');
        await auditLog(disputeBrand.id, 'dispute_created', { disputeId: dispute.id, amount: dispute.amount, reason: dispute.reason });
        disputeBrand.hasDispute = true;
        disputeBrand.disputeAt = new Date().toISOString();
        disputeBrand.disputeAmount = (dispute.amount || 0) / 100;
        disputeBrand.disputeReason = dispute.reason;
        disputeBrand.disputeId = dispute.id;
        disputeBrand.billingSuspended = true;
        disputeBrand.billingSuspendedAt = new Date().toISOString();
        disputeBrand.billingSuspendReason = 'dispute_' + dispute.reason;

        if (disputeBrand.cai?.campaign?.id && disputeBrand.metaToken) {
          try {
            await fetch('https://graph.facebook.com/v22.0/' + disputeBrand.cai.campaign.id + '?status=PAUSED&access_token=' + disputeBrand.metaToken, { method: 'POST' });
          } catch (e) { console.error('[billing] Failed to pause disputed brand campaign:', e.message); }
        }
        if (disputeBrand.cai) disputeBrand.cai.isActive = false;

        await saveBrand(disputeBrand);

        if (process.env.RESEND_KEY) {
          const alertHtml = '<div style="font-family:sans-serif"><h2 style="color:#ef4444">Stripe Dispute Alert</h2><p>Brand: ' + disputeBrand.email + '</p><p>Amount: $' + ((dispute.amount || 0) / 100).toFixed(2) + '</p><p>Reason: ' + dispute.reason + '</p><p>All campaigns have been paused automatically.</p></div>';
          sendEmail(process.env.ADMIN_EMAIL || 'admin@creatorship.app', '🚨 STRIPE DISPUTE — ' + disputeBrand.email + ' — $' + ((dispute.amount || 0) / 100).toFixed(2), alertHtml).catch(e => console.error('[billing] Failed to send dispute alert:', e.message));
        }
      }

    } else if (event.type === 'charge.dispute.closed') {
      // ═══ DISPUTE RESOLVED ═══
      const dispute = event.data.object;
      console.log('[billing] Dispute closed — status: ' + dispute.status + ', won: ' + (dispute.status === 'won'));

      if (dispute.customer) {
        const brands = await loadBrands();
        const brand = brands.find(b => b.stripeCustomerId === dispute.customer);
        if (brand) {
          brand.disputeResolved = true;
          brand.disputeResolvedAt = new Date().toISOString();
          brand.disputeOutcome = dispute.status;

          if (dispute.status === 'lost') {
            brand.isBadActor = true;
            brand.badActorReason = 'lost_dispute_' + dispute.id;
            console.log('[billing] BRAND FLAGGED AS BAD ACTOR: ' + brand.email);
          }
          await saveBrand(brand);
        }
      }

    } else if (event.type === 'invoice.paid') {
      // ═══ SUCCESSFUL PAYMENT — clear failure state + update billing record ═══
      const invoice = event.data.object;
      const brandId = invoice.metadata?.creatorship_brand_id;
      if (brandId) {
        const records = await loadBillingRecords(brandId);
        const existing = records.find(r => r.stripeInvoiceId === invoice.id);
        if (existing) { existing.status = 'paid'; existing.paidAt = new Date().toISOString(); }
        await saveBillingRecords(brandId, records);
      }
      if (invoice.customer) {
        const brands = await loadBrands();
        const brand = brands.find(b => b.stripeCustomerId === invoice.customer);
        if (brand && brand.paymentFailCount > 0) {
          console.log('[billing] Payment succeeded for ' + brand.email + ' — clearing failure state');
          brand.paymentFailCount = 0;
          brand.lastPaymentFail = null;
          if (brand.billingSuspended && brand.billingSuspendReason?.startsWith('payment_failed')) {
            brand.billingSuspended = false;
            brand.billingSuspendedAt = null;
            brand.billingSuspendReason = null;
          }
          await saveBrand(brand);
        }
      }
    }
  } catch (err) { console.error('[webhook] Processing error:', err.message); }
  res.json({ received: true });
});

// Get billing status (requires auth — prevents unauthenticated billing scans)
app.get('/api/billing/status', authBrand, requireRole('admin'), async (req, res) => {
  const brand = await getBrandById(req.brandAuth.brandId);
  if (!brand) return res.json({ error: 'Brand not found' });
  const records = loadBillingRecords(brand.id);
  const registry = await loadCampaignRegistry();
  const brandCampaigns = Object.entries(registry).filter(([_, meta]) => meta.brandId === brand.id);
  let currentPeriodSpend = 0;
  if (brand.metaToken && brand.adAccount && brandCampaigns.length > 0) {
    for (const [campaignId] of brandCampaigns) {
      try {
        const url = 'https://graph.facebook.com/v22.0/' + campaignId + '/insights?fields=spend&date_preset=this_month&access_token=' + brand.metaToken;
        const data = await apiFetch(url);
        if (data.data && data.data[0] && data.data[0].spend) currentPeriodSpend += parseFloat(data.data[0].spend);
      } catch (e) {}
    }
  }
  res.json({
    success: true,
    billingEnabled: !!brand.billingEnabled,
    paymentMethod: brand.billingEnabled ? { last4: brand.billingCardLast4 || '', brand: brand.billingCardBrand || '', expMonth: brand.billingCardExpMonth, expYear: brand.billingCardExpYear } : null,
    paymentFailed: !!brand.billingPaymentFailed,
    currentPeriod: { totalAdSpend: Math.round(currentPeriodSpend * 100) / 100, platformFee: Math.round(currentPeriodSpend * 0.04 * 100) / 100, feePct: 4, campaignCount: brandCampaigns.length },
    history: records.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 12),
    setupAt: brand.billingSetupAt || null,
  });
});

// Calculate and charge for a billing period
app.post('/api/billing/charge-period', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe is not configured' });
  const { brandId, email, periodStart, periodEnd } = req.body;
  const brand = await getBrand(brandId, email);
  if (!brand) return res.json({ error: 'Brand not found' });
  if (!brand.billingEnabled || !brand.stripeCustomerId) return res.json({ error: 'Billing not set up' });
  const now = new Date();
  const pStart = periodStart ? new Date(periodStart) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const pEnd = periodEnd ? new Date(periodEnd) : new Date(now.getFullYear(), now.getMonth(), 0);
  const registry = await loadCampaignRegistry();
  const brandCampaigns = Object.entries(registry).filter(([_, meta]) => meta.brandId === brand.id);
  if (!brandCampaigns.length) return res.json({ error: 'No campaigns found' });
  if (!brand.metaToken || !brand.adAccount) return res.json({ error: 'Meta credentials required' });
  const campaignSpend = [];
  let totalSpend = 0;
  for (const [campaignId, meta] of brandCampaigns) {
    try {
      const since = pStart.toISOString().slice(0, 10);
      const until = pEnd.toISOString().slice(0, 10);
      const url = 'https://graph.facebook.com/v22.0/' + campaignId + '/insights?fields=spend,impressions,clicks&time_range={"since":"' + since + '","until":"' + until + '"}&access_token=' + brand.metaToken;
      const data = await apiFetch(url);
      const spend = data.data && data.data[0] && data.data[0].spend ? parseFloat(data.data[0].spend) : 0;
      campaignSpend.push({ campaignId, creator: meta.creator || 'Unknown', spend: Math.round(spend * 100) / 100 });
      totalSpend += spend;
    } catch (e) { campaignSpend.push({ campaignId, creator: meta.creator || 'Unknown', spend: 0, error: e.message }); }
  }
  if (totalSpend <= 0) return res.json({ success: true, message: 'No spend — nothing to charge', totalSpend: 0, fee: 0 });
  const feePct = 4;
  const feeAmount = Math.round(totalSpend * (feePct / 100) * 100) / 100;
  const feeAmountCents = Math.round(feeAmount * 100);
  if (feeAmountCents < 50) return res.json({ success: true, message: 'Fee below $0.50 minimum, deferred to next period', totalSpend: Math.round(totalSpend * 100) / 100, fee: feeAmount, deferred: true });
  const existingRecords = await loadBillingRecords(brand.id);
  const periodKey = pStart.toISOString().slice(0, 7);
  if (existingRecords.find(r => r.periodKey === periodKey && r.status === 'paid')) return res.json({ error: 'Already charged for ' + periodKey });
  try {
    const invoice = await stripe.invoices.create({ customer: brand.stripeCustomerId, collection_method: 'charge_automatically', auto_advance: true, metadata: { creatorship_brand_id: brand.id, period_start: pStart.toISOString(), period_end: pEnd.toISOString(), total_ad_spend: String(Math.round(totalSpend * 100) / 100), fee_pct: String(feePct) }, description: 'Creatorship platform fee — ' + periodKey });
    for (const cs of campaignSpend) {
      if (cs.spend > 0) {
        const campFeeCents = Math.round(cs.spend * (feePct / 100) * 100);
        if (campFeeCents > 0) await stripe.invoiceItems.create({ customer: brand.stripeCustomerId, invoice: invoice.id, amount: campFeeCents, currency: 'usd', description: feePct + '% platform fee — ' + cs.creator + ' ($' + cs.spend.toFixed(2) + ' ad spend)' });
      }
    }
    const finalizedInv = await stripe.invoices.finalizeInvoice(invoice.id);
    existingRecords.push({ id: 'bill_' + Date.now(), stripeInvoiceId: invoice.id, stripeInvoiceUrl: finalizedInv.hosted_invoice_url, periodKey, periodStart: pStart.toISOString(), periodEnd: pEnd.toISOString(), totalAdSpend: Math.round(totalSpend * 100) / 100, feePct, feeAmount, campaignBreakdown: campaignSpend.filter(c => c.spend > 0), status: finalizedInv.status === 'paid' ? 'paid' : 'pending', createdAt: new Date().toISOString() });
    await saveBillingRecords(brand.id, existingRecords);
    res.json({ success: true, invoice: { id: invoice.id, url: finalizedInv.hosted_invoice_url, status: finalizedInv.status, amount: feeAmount } });
  } catch (err) { console.error('[billing] Error:', err.message); res.status(500).json({ error: err.message }); }
});

// Billing history
app.get('/api/billing/history', async (req, res) => {
  const { brandId, email } = req.query;
  const brand = await getBrand(brandId, email);
  if (!brand) return res.json({ error: 'Brand not found' });
  const records = await loadBillingRecords(brand.id);
  let stripeInvoices = [];
  if (stripe && brand.stripeCustomerId) {
    try { const inv = await stripe.invoices.list({ customer: brand.stripeCustomerId, limit: 24 }); stripeInvoices = inv.data.map(i => ({ id: i.id, status: i.status, amount: i.amount_paid / 100, created: new Date(i.created * 1000).toISOString(), url: i.hosted_invoice_url, pdf: i.invoice_pdf })); } catch (e) {}
  }
  res.json({ records: records.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')), stripeInvoices });
});

// Remove payment method
app.post('/api/billing/remove-payment', authBrand, requireRole('admin'), async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  const email = req.body.email || req.brandAuth?.email;
  const brand = await getBrand(brandId, email);
  if (!brand) return res.json({ error: 'Brand not found' });
  if (stripe && brand.stripePaymentMethodId) { try { await stripe.paymentMethods.detach(brand.stripePaymentMethodId); } catch (e) {} }
  brand.billingEnabled = false;
  brand.stripePaymentMethodId = null;
  brand.billingCardLast4 = '';
  brand.billingCardBrand = '';
  brand.billingPaymentFailed = false;
  await saveBrand(brand);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════
// AUTO-BILLING — Monthly billing run for all brands
// ═══════════════════════════════════════════════════════════

// Internal endpoint to run billing for all active brands
// Can be triggered by: Railway cron, external scheduler, or manual call
// Protected by a simple secret to prevent unauthorized access
app.post('/api/billing/run', async (req, res) => {
  const secret = req.headers['x-billing-secret'] || req.body.secret;
  if (secret !== (process.env.BILLING_SECRET || 'creatorship-billing-2026')) return res.status(403).json({ error: 'Unauthorized' });

  const brands = (await loadBrands()).filter(b => b.billingEnabled && b.stripeCustomerId);
  if (brands.length === 0) return res.json({ message: 'No brands with billing enabled', processed: 0 });

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const periodKey = periodStart.toISOString().slice(0, 7);

  const results = [];
  const registry = await loadCampaignRegistry();

  for (const brand of brands) {
    // Verify Meta token is still valid before billing
    if (brand.metaToken) {
      try {
        const tokenCheck = await fetch('https://graph.facebook.com/v22.0/me?access_token=' + brand.metaToken);
        const tokenData = await tokenCheck.json();
        if (tokenData.error) {
          results.push({ brandId: brand.id, email: brand.email, status: 'token_invalid', error: 'Meta token expired — cannot verify spend' });
          brand.metaTokenInvalid = true;
          brand.metaTokenInvalidAt = new Date().toISOString();
          await saveBrand(brand);
          await auditLog(brand.id, 'meta_token_invalid', {});
          continue;
        }
      } catch (e) {
        results.push({ brandId: brand.id, email: brand.email, status: 'token_check_error', error: e.message });
        continue;
      }
    }

    // Skip suspended brands
    if (brand.billingSuspended) {
      results.push({ brandId: brand.id, email: brand.email, status: 'suspended', reason: brand.billingSuspendReason });
      continue;
    }

    // Skip if already billed for this period
    const existingRecords = (() => {
      const file = path.join(DATA_DIR, 'billing', 'brand_' + brand.id + '.json');
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return []; }
    })();
    if (existingRecords.find(r => r.periodKey === periodKey && r.status === 'paid')) {
      results.push({ brandId: brand.id, email: brand.email, status: 'already_billed', periodKey });
      continue;
    }

    // Get campaigns for this brand
    const brandCampaigns = Object.entries(registry).filter(([_, meta]) => meta.brandId === brand.id);
    if (brandCampaigns.length === 0) {
      results.push({ brandId: brand.id, email: brand.email, status: 'no_campaigns' });
      continue;
    }

    if (!brand.metaToken || !brand.adAccount) {
      results.push({ brandId: brand.id, email: brand.email, status: 'no_meta_credentials' });
      continue;
    }

    // Pull spend from Meta
    let totalSpend = 0;
    const campaignSpend = [];
    const since = periodStart.toISOString().slice(0, 10);
    const until = periodEnd.toISOString().slice(0, 10);

    for (const [campaignId, meta] of brandCampaigns) {
      try {
        const url = 'https://graph.facebook.com/v22.0/' + campaignId + '/insights?fields=spend,impressions,clicks&time_range={"since":"' + since + '","until":"' + until + '"}&access_token=' + brand.metaToken;
        const data = await apiFetch(url);
        const spend = data.data && data.data[0] && data.data[0].spend ? parseFloat(data.data[0].spend) : 0;
        campaignSpend.push({ campaignId, creator: meta.creator || 'Unknown', spend: Math.round(spend * 100) / 100 });
        totalSpend += spend;
      } catch (e) {
        campaignSpend.push({ campaignId, creator: meta.creator || 'Unknown', spend: 0, error: e.message });
      }
    }

    if (totalSpend <= 0) {
      results.push({ brandId: brand.id, email: brand.email, status: 'no_spend', totalSpend: 0 });
      continue;
    }

    const feePct = 4;
    const feeAmount = Math.round(totalSpend * (feePct / 100) * 100) / 100;
    const feeAmountCents = Math.round(feeAmount * 100);

    if (feeAmountCents < 50) {
      results.push({ brandId: brand.id, email: brand.email, status: 'below_minimum', totalSpend: Math.round(totalSpend * 100) / 100, fee: feeAmount });
      continue;
    }

    // Create Stripe invoice
    try {
      const invoice = await stripe.invoices.create({
        customer: brand.stripeCustomerId,
        collection_method: 'charge_automatically',
        auto_advance: true,
        metadata: { creatorship_brand_id: brand.id, period_start: periodStart.toISOString(), period_end: periodEnd.toISOString(), total_ad_spend: String(Math.round(totalSpend * 100) / 100), fee_pct: String(feePct) },
        description: 'Creatorship platform fee — ' + periodKey
      });

      for (const cs of campaignSpend) {
        if (cs.spend > 0) {
          const campFeeCents = Math.round(cs.spend * (feePct / 100) * 100);
          if (campFeeCents > 0) {
            await stripe.invoiceItems.create({
              customer: brand.stripeCustomerId,
              invoice: invoice.id,
              amount: campFeeCents,
              currency: 'usd',
              description: feePct + '% platform fee — ' + cs.creator + ' ($' + cs.spend.toFixed(2) + ' ad spend)'
            });
          }
        }
      }

      const finalizedInv = await stripe.invoices.finalizeInvoice(invoice.id);

      // Save billing record
      const record = {
        id: 'bill_' + Date.now(),
        stripeInvoiceId: invoice.id,
        stripeInvoiceUrl: finalizedInv.hosted_invoice_url,
        periodKey,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        totalAdSpend: Math.round(totalSpend * 100) / 100,
        feePct,
        feeAmount,
        campaignBreakdown: campaignSpend.filter(c => c.spend > 0),
        status: finalizedInv.status === 'paid' ? 'paid' : 'pending',
        createdAt: new Date().toISOString()
      };
      existingRecords.push(record);
      const billingFile = path.join(DATA_DIR, 'billing', 'brand_' + brand.id + '.json');
      ensureDir(path.join(DATA_DIR, 'billing'));
      fs.writeFileSync(billingFile, JSON.stringify(existingRecords, null, 2));

      await auditLog(brand.id, 'invoice_created', { invoiceId: invoice.id, amount: feeAmount, adSpend: Math.round(totalSpend * 100) / 100, feePct });
      results.push({ brandId: brand.id, email: brand.email, status: 'invoiced', invoiceId: invoice.id, totalSpend: Math.round(totalSpend * 100) / 100, fee: feeAmount });
      // Send invoice email
      sendEmail(
        brand.email,
        'Creatorship Invoice — ' + periodKey,
        emailBase({
          title: `Invoice — ${periodKey}`,
          preheader: 'Your Creatorship invoice is ready.',
          headerEmoji: '🧾',
          bodyHtml: `<p>Your invoice for <strong>${periodKey}</strong> is ready.</p><p>Amount: <strong>$${feeAmount.toFixed(2)}</strong></p>`,
          ctaText: undefined,
          ctaUrl: undefined
        })
      ).catch(() => {});
    } catch (err) {
      results.push({ brandId: brand.id, email: brand.email, status: 'error', error: err.message });
      console.error('[auto-billing] Error for brand', brand.id, ':', err.message);
    }
  }

  res.json({ success: true, period: periodKey, processed: results.length, results });
});

// ═══ META AD ACCOUNT AUDIT — scan existing campaigns before CAi activation ═══
app.post('/api/brand/meta-audit', authBrand, async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  if (!brand.metaToken || !brand.adAccount) return res.status(400).json({ error: 'Meta not connected' });

  const metaToken = brand.metaToken;
  const adAccount = brand.adAccount;

  try {
    // 1. Pull ALL campaigns (not just [CAi] ones)
    const allCampsResp = await apiFetch(
      'https://graph.facebook.com/v22.0/' + adAccount + '/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,created_time,updated_time&limit=100&access_token=' + metaToken
    );
    const allCampaigns = (allCampsResp.data || []);

    // 2. Categorize campaigns
    const caiCampaigns = allCampaigns.filter(c => (c.name || '').includes('[CAi]') || (c.name || '').includes('[C]'));
    const brandCampaigns = allCampaigns.filter(c => !((c.name || '').includes('[CAi]') || (c.name || '').includes('[C]')));
    const activeBrandCampaigns = brandCampaigns.filter(c => c.status === 'ACTIVE');
    const pausedBrandCampaigns = brandCampaigns.filter(c => c.status === 'PAUSED');

    // 3. Pull ads from active brand campaigns to detect video overlap
    const brandAds = [];
    let totalBrandSpend = 0;
    for (const camp of activeBrandCampaigns.slice(0, 10)) {
      try {
        // Get ads in this campaign
        const adsResp = await apiFetch(
          'https://graph.facebook.com/v22.0/' + camp.id + '/ads?fields=id,name,status,creative{id,effective_object_story_id,video_id,image_url,thumbnail_url,title,body}&limit=50&access_token=' + metaToken
        );
        const ads = (adsResp.data || []);

        // Get campaign spend
        const insightsResp = await apiFetch(
          'https://graph.facebook.com/v22.0/' + camp.id + '/insights?fields=spend,impressions,clicks,actions&date_preset=last_30d&access_token=' + metaToken
        );
        const insights = (insightsResp.data || [])[0] || {};
        const spend = parseFloat(insights.spend || 0);
        totalBrandSpend += spend;

        for (const ad of ads) {
          const creative = ad.creative || {};
          brandAds.push({
            adId: ad.id,
            adName: ad.name,
            adStatus: ad.status,
            campaignId: camp.id,
            campaignName: camp.name,
            videoId: creative.video_id || null,
            imageUrl: creative.image_url || creative.thumbnail_url || null,
            title: creative.title || '',
            body: creative.body || '',
          });
        }
      } catch (e) {
        console.error('[meta-audit] Error scanning campaign ' + camp.id + ':', e.message);
      }
    }

    // 4. Cross-reference with TikTok video library
    // Brand's video IDs that are already running as Meta ads
    const existingVideoIds = new Set(brandAds.filter(a => a.videoId).map(a => a.videoId));

    // Brand's TikTok videos
    const ttVids = brand.tiktokVideosCache || [];

    // Check if any TikTok videos might already be running
    // Note: exact ID match won't work (Meta video IDs ≠ TikTok IDs)
    // But we can flag that the brand HAS existing video ads
    const hasExistingVideoAds = brandAds.filter(a => a.videoId).length > 0;

    // 5. Build recommendations
    const recommendations = [];

    if (activeBrandCampaigns.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        type: 'existing_campaigns',
        title: 'You have ' + activeBrandCampaigns.length + ' active campaign' + (activeBrandCampaigns.length !== 1 ? 's' : '') + ' running',
        detail: 'Total 30-day spend: $' + totalBrandSpend.toFixed(2) + '. CAi will create separate campaigns — your existing ads will keep running alongside CAi. To avoid bidding against yourself, consider pausing campaigns that use the same videos CAi will test.',
        action: 'review',
      });
    }

    if (hasExistingVideoAds) {
      recommendations.push({
        priority: 'MEDIUM',
        type: 'video_overlap_risk',
        title: brandAds.filter(a => a.videoId).length + ' video ad' + (brandAds.filter(a => a.videoId).length !== 1 ? 's' : '') + ' already running',
        detail: 'If any of these use the same TikTok videos CAi will test, you\'ll have duplicate ads competing for the same audience. This increases your CPM and wastes budget.',
        action: 'review',
      });
    }

    if (totalBrandSpend > 0 && activeBrandCampaigns.length > 3) {
      recommendations.push({
        priority: 'MEDIUM',
        type: 'consolidation',
        title: 'Consider consolidating into CAi',
        detail: 'You have ' + activeBrandCampaigns.length + ' separate campaigns. Meta\'s CBO works best when all creatives are in fewer campaigns so the algorithm can optimize across them. Consider gradually moving ads into CAi\'s campaign structure.',
        action: 'info',
      });
    }

    if (activeBrandCampaigns.length === 0) {
      recommendations.push({
        priority: 'LOW',
        type: 'clean_slate',
        title: 'Clean ad account — perfect for CAi',
        detail: 'No active campaigns detected. CAi will have full control of your ad budget with no overlap risk.',
        action: 'none',
      });
    }

    // 6. Save audit result to brand
    brand.metaAudit = {
      completedAt: new Date().toISOString(),
      totalCampaigns: allCampaigns.length,
      activeBrandCampaigns: activeBrandCampaigns.length,
      pausedBrandCampaigns: pausedBrandCampaigns.length,
      caiCampaigns: caiCampaigns.length,
      totalBrandAds: brandAds.length,
      videoAds: brandAds.filter(a => a.videoId).length,
      totalBrand30dSpend: Math.round(totalBrandSpend * 100) / 100,
      recommendations: recommendations,
    };
    await saveBrand(brand);

    res.json({
      audit: {
        totalCampaigns: allCampaigns.length,
        activeBrand: activeBrandCampaigns.map(c => ({
          id: c.id,
          name: c.name,
          status: c.status,
          objective: c.objective,
          dailyBudget: c.daily_budget ? (parseInt(c.daily_budget) / 100) : null,
          lifetimeBudget: c.lifetime_budget ? (parseInt(c.lifetime_budget) / 100) : null,
          adsCount: brandAds.filter(a => a.campaignId === c.id).length,
          videoAds: brandAds.filter(a => a.campaignId === c.id && a.videoId).length,
        })),
        pausedBrand: pausedBrandCampaigns.length,
        caiCampaigns: caiCampaigns.length,
        totalBrandAds: brandAds.length,
        totalBrand30dSpend: Math.round(totalBrandSpend * 100) / 100,
        hasExistingVideoAds,
        recommendations,
      },
    });

  } catch (err) {
    console.error('[meta-audit] Error:', err.message);
    res.status(500).json({ error: 'Failed to audit Meta account: ' + err.message });
  }
});

// ═══ Meta Token Health Check ═══
app.post('/api/billing/verify-meta-access', async (req, res) => {
  const brands = await loadBrands();
  const activeBrands = brands.filter(b => b.cai?.isActive || b.billingEnabled);
  const results = [];

  for (const brand of activeBrands) {
    const result = { brandId: brand.id, email: brand.email, status: 'unknown' };

    if (!brand.metaToken) {
      result.status = 'no_token';
      result.action = 'Brand has no Meta token — cannot verify spend or bill';
    } else {
      try {
        const r = await fetch('https://graph.facebook.com/v22.0/me?fields=id,name&access_token=' + brand.metaToken);
        const d = await r.json();
        if (d.error) {
          result.status = 'token_invalid';
          result.error = d.error.message;
          result.action = 'Token expired or revoked — cannot bill this brand';

          brand.metaTokenInvalid = true;
          brand.metaTokenInvalidAt = new Date().toISOString();
          await saveBrand(brand);
          await auditLog(brand.id, 'meta_token_invalid', {});

          if (process.env.RESEND_KEY) {
            const metaHtml = '<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px"><h2>Meta Connection Lost</h2><p>Your Meta ad account connection has expired. Your campaigns are still running but we can\'t monitor performance or optimize your ads.</p><p><a href="' + (process.env.FRONTEND_URL || 'https://creatorship.app') + '/brand#account" style="background:#0668E1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Reconnect Meta</a></p></div>';
            sendEmail(brand.email, 'Action required: Reconnect your Meta account', metaHtml).catch(() => {});
          }
        } else {
          result.status = 'valid';
          result.metaUserId = d.id;
          if (brand.metaTokenInvalid) {
            brand.metaTokenInvalid = false;
            brand.metaTokenInvalidAt = null;
            await saveBrand(brand);
          }
        }
      } catch (e) {
        result.status = 'error';
        result.error = e.message;
      }
    }
    results.push(result);
  }

  res.json({
    checked: results.length,
    valid: results.filter(r => r.status === 'valid').length,
    invalid: results.filter(r => r.status === 'token_invalid').length,
    noToken: results.filter(r => r.status === 'no_token').length,
    results,
  });
});

// Health check for billing system
app.get('/api/billing/health', async (req, res) => {
  const brands = await loadBrands();
  const billingBrands = brands.filter(b => b.billingEnabled);
  const registry = await loadCampaignRegistry();
  res.json({
    stripeConfigured: !!stripe,
    webhookSecretConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
    totalBrands: brands.length,
    billingEnabledBrands: billingBrands.length,
    totalCampaigns: Object.keys(registry).length,
    billingDir: fs.existsSync(path.join(DATA_DIR, 'billing')),
  });
});

app.get('/api/brand/campaigns', async (req, res) => {
  const brandId = req.brandAuth?.brandId;
  if (!brandId) return res.json({ campaigns: [], error: 'Not authenticated' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.json({ campaigns: [], error: 'Brand not found' });
  const metaToken = brand.metaToken;
  let adAccount = brand.adAccount || process.env.META_AD_ACCOUNT;
  if (metaToken && !adAccount) {
    try {
      const acctData = await apiFetch('https://graph.facebook.com/v22.0/me/adaccounts?fields=id,name,account_status&access_token=' + metaToken);
      const active = (acctData.data || []).filter(a => a.account_status === 1 || a.account_status === 3);
      if (active.length > 0) {
        adAccount = active[0].id;
        brand.adAccount = adAccount;
        brand.metaAdAccounts = (acctData.data || []).filter(a => a.account_status === 1).map(a => ({ id: a.id, name: a.name || a.id }));
        await saveBrand(brand);
        console.log('[campaigns] Auto-recovered adAccount:', adAccount);
      }
    } catch (e) { console.error('[campaigns] Auto-recover failed:', e.message); }
  }
  if (!metaToken || !adAccount) {
    // No Meta API connected — return any locally registered campaigns, or empty list
    const registry = await loadCampaignRegistry();
    const local = Object.values(registry).filter(c => c.brandId === brandId);
    return res.json({ campaigns: local });
  }
  try {
    // Fetch ALL Creatorship campaigns from this ad account (match by name prefix, not just registry)
    const fields = 'id,name,status,daily_budget,lifetime_budget,objective,created_time';
    const filtering = encodeURIComponent(JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: '[C' }]));
    const apiUrl = `https://graph.facebook.com/v22.0/${adAccount}/campaigns?fields=${fields}&filtering=${filtering}&limit=100&access_token=${metaToken}`;
    const campaigns = await apiFetch(apiUrl);
    if (campaigns.error) return res.json({ campaigns: [], error: campaigns.error?.message || 'Meta API error' });
    const registry = await loadCampaignRegistry();
    const metaData = campaigns.data || [];
    const metaIds = new Set(metaData.map(c => c.id));
    const registryForBrand = Object.entries(registry).filter(([, m]) => m.brandId === brandId);
    const registryIds = new Set(registryForBrand.map(([id]) => id));
    const _bfIdx = {};
    let _needsSave = false;
    // Show ALL Creatorship campaigns from Meta (not just registry matches)
    const mergedMeta = metaData
      .map(c => {
        const reg = registry[c.id] || {};
        const merged = { ...c, ...reg };
        // Backfill videoCover from cached videos if not set
        if (!merged.videoCover && brand.tiktokVideosCache && brand.tiktokVideosCache.length > 0) {
          const handle = (merged.creatorHandle || merged.creator || '').toLowerCase().replace(/^@/, '').replace(/\s+/g, '');
          const vId = merged.videoId || '';
          let matchVid = vId ? brand.tiktokVideosCache.find(v => String(v.id) === String(vId)) : null;
          if (!matchVid && handle) {
            const handleVids = brand.tiktokVideosCache.filter(v => (v.authorHandle || '').toLowerCase().replace(/^@/, '').replace(/\s+/g, '') === handle && v.cover);
            if (handleVids.length > 0) {
              if (!_bfIdx[handle]) _bfIdx[handle] = 0;
              matchVid = handleVids[_bfIdx[handle] % handleVids.length];
              _bfIdx[handle]++;
            }
          }
          if (matchVid && matchVid.cover) {
            merged.videoCover = matchVid.cover;
            if (registry[c.id]) { registry[c.id].videoCover = matchVid.cover; _needsSave = true; }
          }
        }
        return merged;
      });
    // videoCover not stored in Supabase campaign_registry schema; backfill only in-memory for this response
    const localOnly = registryForBrand
      .filter(([id]) => !metaIds.has(id))
      .map(([id, meta]) => ({ ...meta, id, status: 'ERROR', metaSyncError: true }));
    res.json({ campaigns: [...mergedMeta, ...localOnly] });
  } catch (e) {
    res.json({ campaigns: [], error: e.message || 'Failed to fetch campaigns' });
  }
});

app.get('/api/brand/campaign-insights', async (req, res) => {
  const brandId = req.brandAuth?.brandId;
  const { days } = req.query;
  const numDays = Math.min(parseInt(days) || 30, 90);
  if (!brandId) return res.json({ error: 'Not authenticated', insights: [] });
  const brand = await getBrandById(brandId);
  if (!brand) return res.json({ error: 'Brand not found', insights: [] });
  const metaToken = brand.metaToken;
  const adAccount = brand.adAccount;
  if (!metaToken || !adAccount) return res.json({ insights: [], message: 'Connect Meta Ads to see insights' });

  try {
    const since = new Date(Date.now() - numDays * 86400000).toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);
    const fields = 'spend,impressions,clicks,actions,cost_per_action_type';
    const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
    const filtering = encodeURIComponent(JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: 'Creatorship' }]));
    const url = `https://graph.facebook.com/v22.0/${adAccount}/insights?fields=${fields}&time_range=${timeRange}&time_increment=1&filtering=${filtering}&limit=90&access_token=${metaToken}`;
    const data = await apiFetch(url);
    if (data.error) return res.json({ insights: [], error: data.error.message });
    const insights = (data.data || []).map(d => ({
      date: d.date_start,
      spend: parseFloat(d.spend || 0),
      impressions: parseInt(d.impressions || 0),
      clicks: parseInt(d.clicks || 0),
      purchases: (d.actions || []).find(a => a.action_type === 'purchase')?.value || 0,
      cpc: d.clicks > 0 ? (parseFloat(d.spend || 0) / parseInt(d.clicks || 1)).toFixed(2) : 0,
    }));
    res.json({ insights });
  } catch (e) {
    console.error('[insights]', e.message);
    res.json({ insights: [], error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// CREATORS — signup / login
// ═══════════════════════════════════════════════════════════

async function migratePlaintextPasswords() {
  let migrated = 0;
  const isBcryptHash = (v) => typeof v === 'string' && (v.startsWith('$2b$') || v.startsWith('$2a$') || v.startsWith('$2y$'));

  const brands = await loadBrands();
  let brandsChanged = false;
  for (const b of brands) {
    if (b && b.password && !isBcryptHash(b.password)) {
      b.password = await bcrypt.hash(String(b.password), SALT_ROUNDS);
      brandsChanged = true;
      migrated++;
    }
    if (b && b.emailVerified === undefined) {
      b.emailVerified = true;
      brandsChanged = true;
    }
  }
  if (brandsChanged) await await saveBrands(brands);

  const creators = await loadCreators();
  let creatorsChanged = false;
  for (const c of creators) {
    if (c && c.password && !isBcryptHash(c.password)) {
      c.password = await bcrypt.hash(String(c.password), SALT_ROUNDS);
      creatorsChanged = true;
      migrated++;
    }
    if (c && c.emailVerified === undefined) {
      c.emailVerified = true;
      creatorsChanged = true;
    }
  }
  if (creatorsChanged) await await saveCreators(creators);

  console.log(`[auth] migrated ${migrated} passwords to bcrypt`);
}

migratePlaintextPasswords().catch(e => console.error('[auth] migration failed:', e.message));

app.post('/api/creators/signup', signupLimiter, async (req, res) => {
  const { email, password, displayName, tiktokHandle } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const creators = await loadCreators();
  if (creators.some(c => (c.email || '').toLowerCase() === (email || '').toLowerCase())) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  const normalizedHandle = (tiktokHandle || '').trim().replace(/^@/, '').toLowerCase();
  if (normalizedHandle && creators.some(c => ((c.tiktokHandle || '').trim().replace(/^@/, '').toLowerCase()) === normalizedHandle)) {
    return res.status(409).json({ error: 'This TikTok handle is already registered.' });
  }
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const emailToken = crypto.randomBytes(32).toString('hex');
  const id = 'c' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
  const creator = {
    id,
    email: email.toLowerCase(),
    password: hash,
    displayName: (displayName || '').trim() || null,
    tiktokHandle: normalizedHandle || null,
    emailVerified: false,
    emailToken,
    createdAt: new Date().toISOString(),
  };
  creators.push(creator);
  await saveCreators(creators);
  const verifyUrl = `https://www.creatorship.app/api/auth/verify-email?token=${emailToken}`;
  res.status(200).json({
    id: creator.id,
    email: creator.email,
    displayName: creator.displayName || null,
    tiktokHandle: creator.tiktokHandle || null,
    emailVerified: false,
    showVerifyBanner: true,
  });
  // fire-and-forget verification email
  sendEmail(
    creator.email,
    "You're in — confirm your Creatorship account 🎬",
    emailBase({
      title: 'Confirm your email',
      preheader: "One click and you're in.",
      headerEmoji: '🎬',
      accentColor: '#FE2C55',
      accentGradient: 'linear-gradient(135deg,#FE2C55,#ff6b35,#25F4EE)',
      bodyHtml: `<p style="text-align:center;color:#374151;">Hi <strong>${escapeHtml(creator.displayName || 'Creator')}</strong>, you're almost in.</p><p style="text-align:center;color:#6b7280;">Confirm your email to unlock your creator dashboard — where your TikTok content turns into real brand deals and ad revenue.</p>`,
      ctaText: 'Confirm Email',
      ctaUrl: verifyUrl,
      footerNote: "This link expires in 24 hours. Didn't sign up? Ignore this."
    })
  )
    .then(ok => {
      if (!ok) console.error('[email] FAILED to send to:', creator.email);
    })
    .catch(err => console.error('[email] FAILED to send to:', creator.email, err.message, err));
});

app.post('/api/creators/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const creators = await loadCreators();
  const creator = creators.find(c => (c.email || '').toLowerCase() === (email || '').toLowerCase());
  if (!creator) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  if (creator.banned) return res.status(403).json({ error: 'Your account has been suspended. Contact support@creatorship.app.' });
  const valid = creator.password ? await bcrypt.compare(password, creator.password) : false;
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  res.json({
    id: creator.id,
    email: creator.email,
    displayName: creator.displayName || null,
    tiktokHandle: creator.tiktokHandle || null,
    emailVerified: creator.emailVerified !== false, // default true if missing
    needsTermsAcceptance: !creator.termsAccepted && !creator.termsAcceptedAt,
  });
});

app.patch('/api/creator/terms-accept', async (req, res) => {
  const { email, termsAcceptedAt } = req.body || {};
  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'email required' });
  const creators = await loadCreators();
  const idx = creators.findIndex(c => (c.email || '').toLowerCase() === String(email).toLowerCase().trim());
  if (idx === -1) return res.status(404).json({ error: 'Creator not found' });
  creators[idx].termsAccepted = true;
  creators[idx].termsAcceptedAt = termsAcceptedAt || new Date().toISOString();
  await saveCreators(creators);
  checkAndTriggerOutreach(creators[idx]);
  res.json({ ok: true });
});

app.get('/api/creator/public/:handle', async (req, res) => {
  const handle = (req.params.handle || '').replace(/^@/, '').toLowerCase();
  if (!handle) return res.status(400).json({ error: 'Handle required' });
  const creators = await loadCreators();
  const creator = creators.find(c => (c.tiktokHandle || '').toLowerCase() === handle || (c.displayName || '').toLowerCase() === handle);
  if (!creator) return res.status(404).json({ error: 'Creator not found' });

  // Return only public data — never expose email, password, or tokens
  const registry = await loadCampaignRegistry();
  const creatorCampaigns = Object.values(registry).filter(c => {
    const name = (c.creator || c.creatorHandle || c.name || '').toLowerCase();
    return name.includes(handle);
  });

  res.json({
    displayName: creator.displayName || creator.tiktokHandle || handle,
    tiktokHandle: creator.tiktokHandle || handle,
    followers: creator.tiktokFollowers ?? creator.followers ?? 0,
    videos: creator.tiktokVideos ?? creator.videos ?? 0,
    joinedAt: creator.createdAt,
    totalDeals: creatorCampaigns.length,
    activeCampaigns: creatorCampaigns.filter(c => c.status === 'ACTIVE' || c.status === 'active').length,
    verified: !!creator.agreedToTerms,
    stripeConnected: !!creator.stripeAccountId,
  });
});

// ═══════════════════════════════════════════════════════════
// ═══ CREATOR SETTINGS ═══
app.get('/api/creator/profile', async (req, res) => {
  const { creatorId } = req.query;
  if (!creatorId) return res.status(400).json({ error: 'creatorId required' });
  const creators = await loadCreators();
  const creator = creators.find(c => c.id === creatorId);
  if (!creator) return res.status(404).json({ error: 'Creator not found' });
  res.json({
    id: creator.id,
    email: creator.email,
    displayName: creator.displayName || '',
    tiktokHandle: creator.tiktokHandle || '',
    tiktokAvatar: creator.tiktokAvatar || '',
    tiktokFollowers: creator.tiktokFollowers ?? 0,
    tiktokVideos: creator.tiktokVideos ?? 0,
    tiktokConnected: !!creator.tiktokConnected,
    minCommission: creator.minCommission ?? 10,
    createdAt: creator.createdAt || '',
    agreedToTerms: !!creator.agreedToTerms,
    agreedAt: creator.agreedAt || null,
  });
});

app.post('/api/creator/update-profile', async (req, res) => {
  const { creatorId, displayName, tiktokHandle, minCommission, tiktokAvatar, tiktokFollowers, tiktokVideos, enrichedProfile } = req.body;
  if (!creatorId) return res.status(400).json({ error: 'creatorId required' });
  const creators = await loadCreators();
  const idx = creators.findIndex(c => c.id === creatorId);
  if (idx === -1) return res.status(404).json({ error: 'Creator not found' });
  if (displayName !== undefined) creators[idx].displayName = displayName.trim() || null;
  if (tiktokHandle !== undefined) creators[idx].tiktokHandle = (tiktokHandle || '').trim().replace(/^@/, '') || null;
  if (minCommission !== undefined) creators[idx].minCommission = Math.max(1, Math.min(50, Number(minCommission) || 10));
  if (tiktokAvatar) creators[idx].tiktokAvatar = tiktokAvatar;
  if (tiktokFollowers !== undefined) creators[idx].tiktokFollowers = tiktokFollowers;
  if (tiktokVideos !== undefined) creators[idx].tiktokVideos = tiktokVideos;
  if (enrichedProfile) creators[idx].enrichedProfile = enrichedProfile;
  await saveCreators(creators);
  res.json({ success: true, creator: { id: creators[idx].id, email: creators[idx].email, displayName: creators[idx].displayName, tiktokHandle: creators[idx].tiktokHandle, minCommission: creators[idx].minCommission } });
});

app.post('/api/creator/change-password', async (req, res) => {
  const { creatorId, currentPassword, newPassword } = req.body;
  if (!creatorId) return res.status(400).json({ error: 'creatorId required' });
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  const creators = await loadCreators();
  const idx = creators.findIndex(c => c.id === creatorId);
  if (idx === -1) return res.status(404).json({ error: 'Creator not found' });
  const match = await bcrypt.compare(currentPassword, creators[idx].password);
  if (!match) return res.status(401).json({ error: 'Current password is incorrect' });
  creators[idx].password = await bcrypt.hash(newPassword, 10);
  await saveCreators(creators);
  res.json({ success: true });
});

app.post('/api/creator/support', async (req, res) => {
  try {
    const creatorId = req.headers['x-creator-id'];
    const creatorToken = req.headers['x-creator-token'];
    if (!creatorId || !creatorToken) return res.status(401).json({ error: 'Unauthorized' });
    const creator = await getCreatorById(creatorId, creatorToken);
    if (!creator) return res.status(401).json({ error: 'Unauthorized' });

    const { subject, message } = req.body;
    if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required' });

    const apiKey = process.env.RESEND_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Email not configured' });

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Creatorship <support@creatorship.app>',
        to: ['david@creatorship.app'],
        reply_to: creator.email || undefined,
        subject: `[Creator Support] ${subject}`,
        html: `
          <p><strong>From:</strong> ${creator.displayName || creator.email || 'unknown'} (${creator.tiktokHandle || '—'})</p>
          <p><strong>Creator ID:</strong> ${creator.id}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <hr/>
          <p>${String(message).replace(/\n/g, '<br/>')}</p>
        `
      })
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('[creator/support] Resend error:', resp.status, text);
      return res.status(500).json({ error: 'Failed to send message' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Support email error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.delete('/api/creator/account', async (req, res) => {
  const { creatorId } = req.body;
  if (!creatorId) return res.status(400).json({ error: 'creatorId required' });
  const creators = await loadCreators();
  const idx = creators.findIndex(c => c.id === creatorId);
  if (idx === -1) return res.status(404).json({ error: 'Creator not found' });
  const email = creators[idx].email;
  creators.splice(idx, 1);
  await saveCreators(creators);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════
// MESSAGING + CREATOR INVITES
// ═══════════════════════════════════════════════════════════
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const INVITES_FILE = path.join(DATA_DIR, 'invites.json');

function loadMessages() {
  try { return loadJson(MESSAGES_FILE) || []; } catch (_) { return []; }
}
function saveMessages(arr) {
  ensureDir(DATA_DIR);
  saveJson(MESSAGES_FILE, arr);
}

function loadInvites() {
  try { return loadJson(INVITES_FILE) || []; } catch (_) { return []; }
}
function saveInvites(arr) {
  ensureDir(DATA_DIR);
  saveJson(INVITES_FILE, arr);
}

function normHandle(h) {
  return (h || '').trim().replace(/^@/, '').toLowerCase();
}

app.post('/api/messages/send', async (req, res) => {
  let { fromType, fromId, toType, toId, body, creatorHandle } = req.body;
  if (!fromType || !fromId || !toType || !body) {
    return res.status(400).json({ error: 'fromType, fromId, toType, body required' });
  }
  const ch = normHandle(creatorHandle || '');
  if (!ch) return res.status(400).json({ error: 'creatorHandle required for thread' });
  if (toType === 'creator' && !toId) {
    const creators = await loadCreators();
    const creator = creators.find(c => normHandle(c.tiktokHandle) === ch || creatorNameMatches(c.tiktokHandle || '', ch));
    if (creator) toId = creator.id;
    if (!toId) return res.status(400).json({ error: 'Creator not found — they may need to sign up first' });
  } else if (toType === 'brand' && !toId) return res.status(400).json({ error: 'toId required' });
  const brandId = fromType === 'brand' ? fromId : toId;
  const threadId = brandId + '_' + ch;
  const id = 'msg_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
  const msg = {
    id,
    threadId,
    fromType,
    fromId,
    toType,
    toId,
    body: (body || '').trim().slice(0, 5000),
    createdAt: new Date().toISOString(),
    read: false,
  };
  const messages = loadMessages();
  messages.push(msg);
  saveMessages(messages);

  let recipientEmail = null;
  if (toType === 'creator') {
    const creators = await loadCreators();
    const creator = creators.find(c => c.id === toId);
    if (creator?.email) recipientEmail = creator.email;
  } else if (toType === 'brand') {
    const brands = await loadBrands();
    const brand = brands.find(b => b.id === toId);
    if (brand?.email) recipientEmail = brand.email;
  }
  if (recipientEmail) {
    const appUrl = process.env.FRONTEND_URL || 'https://www.creatorship.app';
    const inboxUrl = toType === 'creator' ? appUrl + '/creator' : appUrl + '/brand';
    const fromLabel = fromType === 'brand' ? 'A brand' : 'A creator';
    sendEmail(
      recipientEmail,
      'New message on Creatorship',
      emailBase({
        title: 'New message on Creatorship',
        preheader: 'Someone sent you a message.',
        headerEmoji: '💬',
        bodyHtml: `<p>${fromLabel} sent you a new message.</p><p style="background:#f3f4f6;padding:12px;border-radius:8px;white-space:pre-wrap;">${msg.body.slice(0, 500)}</p>`,
        ctaText: 'View Message',
        ctaUrl: inboxUrl
      })
    ).catch(() => {});
  }
  res.json({ success: true, message: msg });
});

app.get('/api/messages/thread', async (req, res) => {
  const { brandId, creatorHandle, requesterType, requesterId } = req.query;
  if (!brandId || !creatorHandle) return res.status(400).json({ error: 'brandId and creatorHandle required' });
  const ch = normHandle(creatorHandle);
  const threadId = brandId + '_' + ch;
  const messages = loadMessages().filter(m => m.threadId === threadId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (requesterType && requesterId) {
    let changed = false;
    const updated = messages.map(m => {
      if (m.toType === requesterType && m.toId === requesterId && !m.read) {
        changed = true;
        return { ...m, read: true };
      }
      return m;
    });
    if (changed) {
      const all = loadMessages();
      for (const m of all) {
        if (m.threadId === threadId && m.toType === requesterType && m.toId === requesterId) m.read = true;
      }
      saveMessages(all);
    }
  }
  res.json(messages);
});

app.get('/api/messages/inbox', async (req, res) => {
  const { userId, userType } = req.query;
  if (!userId || !userType) return res.status(400).json({ error: 'userId and userType required' });
  const messages = loadMessages();
  let threadIds = [];
  if (userType === 'brand') {
    threadIds = [...new Set(messages.filter(m => m.fromId === userId || m.toId === userId).map(m => m.threadId))];
  } else {
    const creators = await loadCreators();
    const creator = creators.find(c => c.id === userId);
    const handle = normHandle(creator?.tiktokHandle || '');
    if (!handle) return res.json([]);
    threadIds = [...new Set(messages.filter(m => m.threadId && m.threadId.endsWith('_' + handle)).map(m => m.threadId))];
  }
  const creators = await loadCreators();
  const brands = await loadBrands();
  const threads = threadIds.map(tid => {
    const threadMsgs = messages.filter(m => m.threadId === tid).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const last = threadMsgs[0];
    const unread = threadMsgs.filter(m => !m.read && m.toType === userType && m.toId === userId).length;
    const idx = tid.indexOf('_');
    const bId = idx >= 0 ? tid.slice(0, idx) : tid;
    const cHandle = idx >= 0 ? tid.slice(idx + 1) : '';
    const creator = creators.find(c => normHandle(c.tiktokHandle) === cHandle || creatorNameMatches(c.tiktokHandle || '', cHandle));
    const brand = brands.find(b => b.id === bId);
    const brandName = brand?.brandName || brand?.storeName || 'Brand';
    return { threadId: tid, brandId: bId, brandName, creatorHandle: cHandle, creatorId: creator?.id || null, lastMessage: last, unread };
  });
  threads.sort((a, b) => new Date((b.lastMessage?.createdAt || 0)) - new Date((a.lastMessage?.createdAt || 0)));
  res.json(threads);
});

app.post('/api/invites/create', async (req, res) => {
  const { brandId, creatorHandle } = req.body;
  if (!brandId || !creatorHandle) return res.status(400).json({ error: 'brandId and creatorHandle required' });
  const ch = normHandle(creatorHandle);
  const creators = await loadCreators();
  const creator = creators.find(c => normHandle(c.tiktokHandle) === ch || creatorNameMatches(c.tiktokHandle || '', ch) || creatorNameMatches(c.displayName || '', ch));
  if (creator) return res.json({ exists: true, creatorId: creator.id });
  const brands = await loadBrands();
  const brand = brands.find(b => b.id === brandId);
  const brandName = brand?.brandName || brand?.storeName || 'A brand';
  const token = crypto.randomBytes(4).toString('hex');
  const invite = { token, brandId, brandName, creatorHandle: ch, createdAt: new Date().toISOString(), claimed: false };
  const invites = loadInvites();
  invites.push(invite);
  saveInvites(invites);
  const baseUrl = process.env.FRONTEND_URL || 'https://creatorship.app';
  res.json({ token, inviteUrl: baseUrl + '/creator?invite=' + token });
});

// Brand UI: invite creator by handle (tracks invites in invites.json)
app.post('/api/brand/invite-creator', async (req, res) => {
  const { brandId, creatorHandle } = req.body;
  if (!brandId || !creatorHandle) return res.json({ error: 'brandId and creatorHandle required' });

  const brands = await loadBrands();
  const brand = brands.find(b => b.id === brandId);
  if (!brand) return res.json({ error: 'Brand not found' });

  // Load or create invites registry
  const invitesPath = path.join(DATA_DIR, 'invites.json');
  let invites = [];
  try { invites = loadJson(invitesPath) || []; } catch (_) { invites = []; }

  // Generate a unique invite code for this creator+brand combo
  const existing = invites.find(i => i.brandId === brandId && i.creatorHandle.toLowerCase() === creatorHandle.toLowerCase());
  let inviteCode;
  if (existing) {
    inviteCode = existing.inviteCode;
    existing.lastInvitedAt = new Date().toISOString();
    existing.inviteCount = (existing.inviteCount || 1) + 1;
  } else {
    inviteCode = Math.random().toString(36).substring(2, 10);
    invites.push({
      brandId,
      brandName: brand.brandName || brand.storeName || '',
      creatorHandle: creatorHandle.toLowerCase(),
      inviteCode,
      invitedAt: new Date().toISOString(),
      lastInvitedAt: new Date().toISOString(),
      inviteCount: 1,
      status: 'pending' // pending, accepted, declined
    });
  }
  saveJson(invitesPath, invites);

  // Build the invite link
  const inviteLink = 'https://www.creatorship.app/creator?invite=' + inviteCode;

  // Build the personalized message
  const storeName = brand.storeName || brand.brandName || 'our brand';
  const commission = brand.defaultCommission || 10;
  const message = `Hey @${creatorHandle}! 👋 Your TikTok content for ${storeName} is amazing 🔥 We'd love to turn your best video into a paid Meta ad and pay you ${commission}% commission on every sale it generates. Takes 30 seconds to join: ${inviteLink}`;

  res.json({
    success: true,
    inviteCode,
    inviteLink,
    message,
    tiktokProfileUrl: 'https://www.tiktok.com/@' + creatorHandle.replace('@', ''),
    creatorHandle
  });
});

// Get invite statuses for a brand's creators
app.get('/api/brand/invites', async (req, res) => {
  const { brandId } = req.query;
  if (!brandId) return res.json({ invites: [] });
  const invitesPath = path.join(DATA_DIR, 'invites.json');
  let invites = [];
  try { invites = loadJson(invitesPath) || []; } catch (_) { invites = []; }
  const brandInvites = invites.filter(i => i.brandId === brandId);
  res.json({ invites: brandInvites });
});

app.post('/api/brand/invites/clear', async (req, res) => {
  const { brandId } = req.body;
  if (!brandId) return res.json({ error: 'brandId required' });
  const invitesPath = path.join(DATA_DIR, 'invites.json');
  let invites = [];
  try { invites = loadJson(invitesPath) || []; } catch (_) { invites = []; }
  const remaining = invites.filter(i => i.brandId !== brandId);
  saveJson(invitesPath, remaining);
      logActivity('creator_invite', { brandId: req.body.brandId, tiktokHandle: req.body.tiktokHandle, email: req.body.email });
    res.json({ success: true, cleared: invites.length - remaining.length });
});

app.get('/api/brand/uploads', async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.query.brandId;
  if (!brandId) return res.status(400).json({ error: 'brandId required' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  res.json({ uploads: brand.uploads || [] });
});

// ═══ FILE UPLOAD — drag-and-drop video upload ═══
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(DATA_DIR, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, 'vid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6) + ext);
  }
});
const uploadMiddleware = multer({ storage: uploadStorage, limits: { fileSize: 500 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  const allowed = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'];
  if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp4|mov|webm|avi|mkv)$/i)) cb(null, true);
  else cb(new Error('Only video files are allowed (MP4, MOV, WebM)'));
}}).single('video');

app.post('/api/brand/upload-file', requireRole('editor'), (req, res) => {
  uploadMiddleware(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const brandId = req.brandAuth?.brandId || req.body.brandId;
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!brandId || !token) return res.status(401).json({ error: 'Auth required' });

    let decoded;
    try { decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET || 'dev-secret'); } catch (_) { return res.status(401).json({ error: 'Invalid token' }); }

    const brand = await getBrandById(brandId);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const videoUrl = '/uploads/' + req.file.filename;
    const title = req.body.title || req.file.originalname?.replace(/\.[^.]+$/, '') || 'Uploaded Video';
    const creatorHandle = req.body.creatorHandle || '';

    if (!brand.uploads) brand.uploads = [];
    const upload = {
      id: 'up_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      videoUrl,
      title,
      creatorHandle,
      thumbnailUrl: null,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      createdAt: new Date().toISOString(),
    };
    brand.uploads.push(upload);
    await saveBrand(brand);

    console.log('[upload-file] Brand ' + brandId + ' uploaded ' + req.file.originalname + ' (' + Math.round(req.file.size / 1024 / 1024) + 'MB)');
    res.json({ success: true, uploadId: upload.id, videoUrl, title });
  });
});

app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));

app.post('/api/brand/upload-video', express.json({ limit: '50mb' }), requireRole('editor'), async (req, res) => {
  try {
    const brandId = req.brandAuth?.brandId || req.body?.brandId;
    if (!brandId) return res.status(400).json({ error: 'brandId required' });
    const brand = await getBrandById(brandId);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const contentType = req.headers['content-type'] || '';
    let videoUrl = '';
    let videoTitle = '';
    let creatorHandle = '';
    let uploadType = 'url';
    let originalName = '';
    let fileSize = 0;

    if (contentType.includes('multipart/form-data')) {
      // File upload — parse manually (basic multipart for small files)
      // For MVP, redirect to URL mode with a message
      return res.status(400).json({ error: 'File upload coming soon. For now, paste a TikTok video URL.' });
    } else {
      // JSON body or form-urlencoded
      const body = req.body || {};
      videoUrl = (body.videoUrl || '').trim();
      videoTitle = (body.videoTitle || '').trim();
      creatorHandle = (body.creatorHandle || '').trim().replace(/^@/, '');
      if (!videoUrl) return res.status(400).json({ error: 'videoUrl required' });
    }

    const upload = {
      id: 'up_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
      title: videoTitle || 'Untitled Video',
      videoUrl,
      type: uploadType,
      creatorHandle: creatorHandle || null,
      originalName: originalName || null,
      size: fileSize || null,
      certifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      status: 'ready',
    };

    brand.uploads = brand.uploads || [];
    brand.uploads.unshift(upload);
    await saveBrand(brand);

    res.json({ success: true, upload });
  } catch (e) {
    console.error('[upload] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/brand/upload/:uploadId', requireRole('editor'), async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body?.brandId;
  if (!brandId) return res.status(400).json({ error: 'brandId required' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  brand.uploads = (brand.uploads || []).filter(u => u.id !== req.params.uploadId);
  await saveBrand(brand);
  res.json({ success: true });
});

// Fetch brand's own TikTok videos via ScrapeCreators — cached in brand record
app.get('/api/brand/tiktok-videos', async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.query.brandId;
  if (!brandId) return res.status(400).json({ error: 'brandId required' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });

  // Extract TikTok handle
  let handle = '';
  const pageUrl = brand.tikTokStorePageUrl || '';
  if (pageUrl) { const m = pageUrl.match(/@([^/?]+)/); if (m) handle = m[1]; }
  if (!handle && brand.storeName) handle = brand.storeName.toLowerCase().replace(/\s+/g, '');
  if (!handle) return res.json({ videos: [], error: 'No TikTok handle found. Connect your TikTok Shop first.' });

  // Check cache — return cached if less than 1 hour old and same format version
  const CACHE_VERSION = 3; // Bump to invalidate after handle discovery fix
  const forceRefresh = req.query.refresh === 'true';
  if (!forceRefresh && brand.tiktokVideosCache && brand.tiktokVideosCachedAt && brand.tiktokVideosCacheVersion === CACHE_VERSION) {
    const age = Date.now() - new Date(brand.tiktokVideosCachedAt).getTime();
    if (age < 60 * 60 * 1000) {
      return res.json({ videos: brand.tiktokVideosCache, handle, total: brand.tiktokVideosCache.length, cached: true });
    }
  }

  const scrapeKey = process.env.SCRAPE_KEY;
  if (!scrapeKey) return res.json({ videos: [], error: 'API key not configured' });

  try {
    // Build handle variations — same logic as deep-dive and cai-activate
    const baseHandle = handle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const storeWords = (brand.storeName || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/);
    const firstWord = storeWords[0] || '';
    const handleVariations = [
      baseHandle,
      firstWord !== baseHandle ? firstWord : null,
      baseHandle + 'official',
      firstWord && firstWord !== baseHandle ? firstWord + 'official' : null,
      baseHandle + 'shop',
      baseHandle + 'us',
    ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

    let rawVideos = [];
    let foundHandle = handle;
    for (const tryHandle of handleVariations) {
      try {
        console.log('[tiktok-videos] Trying handle:', tryHandle);
        const videosRes = await fetch(
          `https://api.scrapecreators.com/v1/tiktok/profile/videos?handle=${encodeURIComponent(tryHandle)}&limit=30`,
          { headers: { 'x-api-key': scrapeKey } }
        );
        if (!videosRes.ok) continue;
        const videosData = await videosRes.json();
        const found = videosData.aweme_list || videosData.data || videosData.videos || videosData.posts || [];
        if (found.length > 0) {
          rawVideos = found;
          foundHandle = tryHandle;
          console.log('[tiktok-videos] Found', found.length, 'videos for handle:', tryHandle);
          break;
        }
      } catch (e) { console.log('[tiktok-videos] Error trying handle', tryHandle, e.message); }
    }
    handle = foundHandle;
    if (rawVideos.length === 0) {
      console.log('[tiktok-videos] No videos found for any handle variation:', handleVariations.join(', '));
      return res.json({ videos: [], handle, total: 0, cached: false, triedHandles: handleVariations });
    }

    const videos = rawVideos.map(v => {
      // Cover images — prefer JPEG-compatible URLs (later entries in url_list tend to be JPEG)
      const pickJpeg = (list) => {
        if (!list || !list.length) return '';
        // Prefer URLs containing 'jpeg' or 'jpg', or the last URL in the list (usually JPEG)
        const jpegUrl = list.find(u => /jpe?g/i.test(u) || /\.jpg/i.test(u));
        if (jpegUrl) return jpegUrl;
        // Last URL is usually the most compatible format
        return list[list.length - 1] || list[0] || '';
      };
      const coverList = v.video?.cover?.url_list || [];
      const dynamicCoverList = v.video?.dynamic_cover?.url_list || [];
      const originCoverList = v.video?.origin_cover?.url_list || [];
      const cover = pickJpeg(coverList) || pickJpeg(dynamicCoverList) || pickJpeg(originCoverList) || v.cover_url || v.thumbnail || '';
      const coverHd = pickJpeg(originCoverList) || pickJpeg(coverList) || cover;

      // Video URLs
      const playUrls = v.video?.play_addr?.url_list || [];
      const downloadUrls = v.video?.download_addr?.url_list || [];
      const playUrl = playUrls[0] || downloadUrls[0] || v.play_url || '';
      const downloadUrl = downloadUrls[0] || '';

      // Video metadata
      const desc = v.desc || v.title || v.caption || '';
      const stats = v.statistics || v.stats || {};

      // Music info
      const music = v.music || {};

      // Hashtags from text_extra
      const hashtags = (v.text_extra || []).filter(t => t.hashtag_name).map(t => t.hashtag_name);

      // Author info (should be the brand itself but good to capture)
      const author = v.author || {};

      return {
        id: v.aweme_id || v.id || v.video_id || '',
        desc: desc.slice(0, 300),
        cover,
        coverHd,
        playUrl,
        downloadUrl,
        // Video specs
        duration: v.video?.duration || v.duration || 0,
        width: v.video?.width || 0,
        height: v.video?.height || 0,
        ratio: v.video?.ratio || '',
        format: v.video?.format || '',
        // Timestamps
        createTime: v.create_time || 0,
        // Engagement stats
        views: stats.play_count || stats.views || v.play_count || 0,
        likes: stats.digg_count || stats.likes || v.digg_count || 0,
        comments: stats.comment_count || stats.comments || v.comment_count || 0,
        shares: stats.share_count || stats.shares || v.share_count || 0,
        saves: stats.collect_count || stats.favorites || 0,
        downloads: stats.download_count || 0,
        // Engagement rate
        engagementRate: (stats.play_count || v.play_count || 0) > 0 
          ? Math.round(((stats.digg_count || 0) + (stats.comment_count || 0) + (stats.share_count || 0)) / (stats.play_count || v.play_count || 1) * 10000) / 100 
          : 0,
        // Music
        musicTitle: music.title || '',
        musicAuthor: music.author || '',
        musicOriginal: !!music.is_original,
        // Hashtags
        hashtags,
        // Shopping
        isShoppable: !!(v.shop_product_url || v.commerce_info?.product_items?.length || v.is_commerce_commodity),
        shopProductUrl: v.shop_product_url || v.commerce_info?.product_items?.[0]?.product_id || null,
        // Author (for verification)
        authorHandle: author.unique_id || handle,
        authorName: author.nickname || '',
        authorAvatar: author.avatar_thumb?.url_list?.[0] || '',
        // TikTok URL
        tiktokUrl: 'https://www.tiktok.com/@' + handle + '/video/' + (v.aweme_id || v.id || ''),
      };
    }).filter(v => v.id);

    // Cache to brand record
    brand.tiktokVideosCache = videos;
    brand.tiktokVideosCachedAt = new Date().toISOString();
    brand.tiktokVideosCacheVersion = CACHE_VERSION;
    await saveBrand(brand);

    res.json({ videos, handle, total: videos.length, cached: false });
  } catch (e) {
    console.error('[brand-tiktok-videos] Error:', e.message);
    // Return stale cache if available
    if (brand.tiktokVideosCache) {
      return res.json({ videos: brand.tiktokVideosCache, handle, total: brand.tiktokVideosCache.length, cached: true, stale: true });
    }
    res.json({ videos: [], error: e.message });
  }
});

// Creator's own TikTok videos — reuses same ScrapeCreators logic as brand endpoint
app.get('/api/creator/tiktok-videos', async (req, res) => {
  const handle = (req.query.handle || '').trim().replace(/^@/, '');
  if (!handle) return res.json({ videos: [], error: 'handle required' });
  const scrapeKey = process.env.SCRAPE_KEY;
  if (!scrapeKey) return res.json({ videos: [], error: 'API key not configured' });
  try {
    const pickJpeg = (list) => {
      if (!list || !list.length) return '';
      const jpegUrl = list.find(u => /jpe?g/i.test(u) || /\.jpg/i.test(u));
      if (jpegUrl) return jpegUrl;
      return list[list.length - 1] || list[0] || '';
    };
    const videosRes = await fetch(
      `https://api.scrapecreators.com/v1/tiktok/profile/videos?handle=${encodeURIComponent(handle)}&limit=30`,
      { headers: { 'x-api-key': scrapeKey } }
    );
    if (!videosRes.ok) return res.json({ videos: [], error: 'Failed to fetch videos' });
    const videosData = await videosRes.json();
    const rawVideos = videosData.aweme_list || videosData.data || videosData.videos || videosData.posts || [];
    const videos = rawVideos.map(v => {
      const coverList = v.video?.cover?.url_list || [];
      const dynamicCoverList = v.video?.dynamic_cover?.url_list || [];
      const originCoverList = v.video?.origin_cover?.url_list || [];
      const cover = pickJpeg(coverList) || pickJpeg(dynamicCoverList) || pickJpeg(originCoverList) || v.cover_url || v.thumbnail || '';
      const playUrls = v.video?.play_addr?.url_list || [];
      const downloadUrls = v.video?.download_addr?.url_list || [];
      const desc = v.desc || v.title || v.caption || '';
      const stats = v.statistics || v.stats || {};
      const hashtags = (v.text_extra || []).filter(t => t.hashtag_name).map(t => t.hashtag_name);
      return {
        id: v.aweme_id || v.id || v.video_id || '',
        desc: desc.slice(0, 300),
        cover,
        coverHd: pickJpeg(originCoverList) || cover,
        playUrl: playUrls[0] || downloadUrls[0] || v.play_url || '',
        downloadUrl: downloadUrls[0] || '',
        duration: v.video?.duration || v.duration || 0,
        width: v.video?.width || 0,
        height: v.video?.height || 0,
        createTime: v.create_time || 0,
        views: stats.play_count || stats.views || v.play_count || 0,
        likes: stats.digg_count || stats.likes || v.digg_count || 0,
        comments: stats.comment_count || stats.comments || v.comment_count || 0,
        shares: stats.share_count || stats.shares || v.share_count || 0,
        saves: stats.collect_count || stats.favorites || 0,
        engagementRate: (stats.play_count || v.play_count || 0) > 0
          ? Math.round(((stats.digg_count || 0) + (stats.comment_count || 0) + (stats.share_count || 0)) / (stats.play_count || v.play_count || 1) * 10000) / 100
          : 0,
        hashtags,
        isShoppable: !!(v.shop_product_url || v.commerce_info?.product_items?.length || v.is_commerce_commodity),
        tiktokUrl: 'https://www.tiktok.com/@' + handle + '/video/' + (v.aweme_id || v.id || ''),
      };
    }).filter(v => v.id);
    res.json({ videos, handle, total: videos.length });
  } catch (e) {
    res.json({ videos: [], error: e.message });
  }
});

// Proxy TikTok CDN content (images + video downloads)
app.get('/api/proxy-image', async (req, res) => {
  const url = req.query.url;
  const download = req.query.download === 'true';
  if (!url || (!url.includes('tiktokcdn') && !url.includes('tiktok') && !url.includes('byteoversea'))) {
    return res.status(400).send('Invalid URL');
  }
  try {
    const imgRes = await fetch(url, {
      headers: { 'Referer': 'https://www.tiktok.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'image/webp,image/jpeg,image/png,*/*' },
      redirect: 'follow',
    });
    if (!imgRes.ok) return res.status(imgRes.status).send('Upstream error');
    let contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    // Force JPEG content type for HEIC (browsers can't render HEIC)
    if (contentType.includes('heic') || contentType.includes('heif')) {
      contentType = 'image/jpeg';
    }
    if (download) {
      res.set('Content-Type', 'video/mp4');
      res.set('Content-Disposition', 'attachment; filename="tiktok-video.mp4"');
    } else {
      res.set('Content-Type', contentType);
    }
    res.set('Cache-Control', download ? 'no-cache' : 'public, max-age=3600');
    const buffer = await imgRes.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).send('Proxy error: ' + e.message);
  }
});

app.get('/api/invites/:token', async (req, res) => {
  const { token } = req.params;
  const invites = loadInvites();
  const invite = invites.find(i => i.token === token);
  if (!invite) return res.json({ brandId: null, brandName: null, creatorHandle: null, valid: false });
  const age = Date.now() - new Date(invite.createdAt).getTime();
  const valid = !invite.claimed && age < 30 * 24 * 60 * 60 * 1000;
  res.json({ brandId: invite.brandId, brandName: invite.brandName, creatorHandle: invite.creatorHandle, valid });
});

app.post('/api/invites/claim', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });
  const invites = loadInvites();
  const idx = invites.findIndex(i => i.token === token);
  if (idx === -1) return res.json({ success: false });
  invites[idx].claimed = true;
  saveInvites(invites);
  res.json({ success: true });
});

// Creator messages: list threads (same shape as inbox for creator)
app.get('/api/creator/messages', async (req, res) => {
  const creatorId = req.query.creatorId;
  if (!creatorId) return res.status(400).json({ error: 'creatorId required' });
  const messages = loadMessages();
  const creators = await loadCreators();
  const creator = creators.find(c => c.id === creatorId);
  const handle = normHandle(creator?.tiktokHandle || '');
  if (!handle) return res.json([]);
  const threadIds = [...new Set(messages.filter(m => m.threadId && m.threadId.endsWith('_' + handle)).map(m => m.threadId))];
  const brands = await loadBrands();
  const threads = threadIds.map(tid => {
    const threadMsgs = messages.filter(m => m.threadId === tid).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const last = threadMsgs[0];
    const unread = threadMsgs.filter(m => !m.read && m.toType === 'creator' && m.toId === creatorId).length;
    const idx = tid.indexOf('_');
    const bId = idx >= 0 ? tid.slice(0, idx) : tid;
    const cHandle = idx >= 0 ? tid.slice(idx + 1) : '';
    const brand = brands.find(b => b.id === bId);
    const brandName = brand?.brandName || brand?.storeName || 'Brand';
    return { threadId: tid, brandId: bId, brandName, creatorHandle: cHandle, lastMessage: last, unread };
  });
  threads.sort((a, b) => new Date((b.lastMessage?.createdAt || 0)) - new Date((a.lastMessage?.createdAt || 0)));
  res.json(threads);
});

// Creator reply in a thread (threadId = brandId_creatorHandle)
app.post('/api/creator/messages/:threadId/reply', async (req, res) => {
  const { threadId } = req.params;
  const { message, creatorId } = req.body || {};
  if (!threadId || !message || !creatorId) return res.status(400).json({ error: 'threadId, message, and creatorId required' });
  const ch = normHandle((threadId.split('_')[1] || '').trim());
  if (!ch) return res.status(400).json({ error: 'Invalid threadId' });
  const brandId = threadId.split('_')[0];
  const id = 'msg_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
  const msg = {
    id,
    threadId,
    fromType: 'creator',
    fromId: creatorId,
    toType: 'brand',
    toId: brandId,
    body: String(message).trim().slice(0, 5000),
    createdAt: new Date().toISOString(),
    read: false,
  };
  const messages = loadMessages();
  messages.push(msg);
  saveMessages(messages);
  const brands = await loadBrands();
  const brand = brands.find(b => b.id === brandId);
  if (brand?.email) {
    const appUrl = process.env.FRONTEND_URL || 'https://www.creatorship.app';
    sendEmail(brand.email, 'New message on Creatorship', emailBase({
      title: 'New message on Creatorship',
      preheader: 'A creator sent you a message.',
      headerEmoji: '💬',
      bodyHtml: `<p>A creator sent you a new message.</p><p style="background:#f3f4f6;padding:12px;border-radius:8px;white-space:pre-wrap;">${msg.body.slice(0, 500)}</p>`,
      ctaText: 'View Message',
      ctaUrl: appUrl + '/brand'
    })).catch(() => {});
  }
  res.json({ success: true, message: msg });
});

app.get('/api/creators/handles', async (req, res) => {
  const creators = await loadCreators();
  const handles = creators.map(c => normHandle(c.tiktokHandle)).filter(Boolean);
  res.json({ handles });
});

// ═══ ADMIN ═══════════════════════════════════════════════
const ADMIN_TOKEN = process.env.ADMIN_PASSWORD
  ? crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD + '_cship_admin').digest('hex').slice(0, 32)
  : 'dev_admin_token_' + Date.now();

function checkAdmin(req, res, next) {
  if (req.headers['x-admin-token'] === ADMIN_TOKEN) return next();
  if (req.headers['x-admin-password'] === process.env.ADMIN_PASSWORD) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid password' });
  res.json({ success: true, token: ADMIN_TOKEN });
});

app.get('/api/admin/stats', checkAdmin, async (req, res) => {
  try {
    const brands = await loadBrands();
    const creators = await loadCreators();
    const registry = await loadCampaignRegistry();
    const msgs = (() => { try { return loadJson(path.join(DATA_DIR, 'messages.json')) || []; } catch (_) { return []; } })();
    const alerts = (() => { try { return loadJson(path.join(DATA_DIR, 'alerts.json')) || []; } catch (_) { return []; } })();
    res.json({
      brands: { total: brands.length, list: brands.map(b => {
        const campaignCount = Object.values(registry).filter(c => c.brandId === b.id).length;
        return { id: b.id, brandName: b.brandName, email: b.email, createdAt: b.createdAt, storeName: b.storeName, banned: !!b.banned, billingEnabled: !!b.billingEnabled, hasMetaToken: !!b.metaToken, hasTikTok: !!(b.storeName || b.storeUrl || b.tikTokStorePageUrl), adAccount: b.adAccount || '', pageId: b.pageId || '', pageName: b.pageName || '', campaignCount, launchCount: b.launchCount || 0, lastActive: b.lastActive || b.createdAt, emailVerified: !!b.emailVerified, metaTokenExpiresAt: b.metaTokenExpiresAt || null, freeLaunchesUsed: b.freeLaunchesUsed || 0, freeLaunchLimit: b.freeLaunchLimit || 3 };
      })},
      creators: { total: creators.length, list: creators.map(c => ({ id: c.id, email: c.email, tiktokHandle: c.tiktokHandle, displayName: c.displayName, createdAt: c.createdAt, tiktokConnected: !!(c.tiktokConnected || c.tiktokHandle || c.tiktokOpenId), banned: !!c.banned, dealCount: c.dealCount || 0, emailVerified: !!c.emailVerified, termsAccepted: !!(c.termsAccepted || c.termsAcceptedAt), stripeConnected: !!c.stripeAccountId, tiktokFollowers: c.tiktokFollowers || 0, tiktokVideos: c.tiktokVideos || 0 })) },
      campaigns: { total: Object.keys(registry).length },
      messages: { total: msgs.length },
      alerts: { total: alerts.length, pending: alerts.filter(a => !a.dismissed).length }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin detail endpoints — return full brand/creator record (minus password)
app.get('/api/admin/brand/:id', checkAdmin, async (req, res) => {
  const brand = await getBrandById(req.params.id);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  const safe = { ...brand };
  delete safe.password;
  res.json({ brand: safe });
});

app.get('/api/admin/creator/:id', checkAdmin, async (req, res) => {
  const creators = await loadCreators();
  const creator = creators.find(c => c.id === req.params.id);
  if (!creator) return res.status(404).json({ error: 'Creator not found' });
  const safe = { ...creator };
  delete safe.password;
  res.json({ creator: safe });
});

// ═══ ADMIN P&L (Profit & Loss) — Editable Live Sheet ═══
const PNL_COSTS_FILE = path.join(DATA_DIR, 'pnl_costs.json');
const PNL_EXPENSES_FILE = path.join(DATA_DIR, 'pnl_expenses.json');

function loadPnlCosts() {
  try { const d = loadJson(PNL_COSTS_FILE); if (d && d.recurring) return d; } catch (_) {}
  // Default costs — will be saved on first edit
  return {
    recurring: [
      { id: 'r1', name: 'Railway', amount: 20, category: 'hosting', active: true },
      { id: 'r2', name: 'ScrapeCreators', amount: 50, category: 'apis', active: true },
      { id: 'r3', name: 'Google Workspace', amount: 7, category: 'email', active: true },
      { id: 'r4', name: 'Cursor', amount: 60, category: 'dev', active: true },
      { id: 'r5', name: 'Claude (Anthropic)', amount: 200, category: 'dev', active: true },
    ],
    oneTime: [
      { id: 'o1', name: 'GoDaddy Domain', amount: 20, date: '2026-03-01', category: 'legal' },
      { id: 'o2', name: 'SC LLC Filing', amount: 110, date: '2026-03-09', category: 'legal' },
      { id: 'o3', name: 'USPTO Trademark', amount: 350, date: '2026-03-10', category: 'legal' },
    ],
  };
}

app.get('/api/admin/pnl', checkAdmin, async (req, res) => {
  try {
    const brands = await loadBrands();
    let allBilling = [];
    for (const b of brands) {
      const records = await loadBillingRecords(b.id);
      records.forEach(r => { r._brandName = b.brandName; r._brandId = b.id; });
      allBilling = allBilling.concat(records);
    }
    let manualExpenses = [];
    try { manualExpenses = loadJson(PNL_EXPENSES_FILE) || []; } catch (_) {}
    const costs = loadPnlCosts();
    const activeRecurring = costs.recurring.filter(c => c.active !== false);
    const monthlyRecurring = activeRecurring.reduce((s, c) => s + (c.amount || 0), 0);

    const months = {};
    const now = new Date();
    for (let m = 2; m <= now.getMonth(); m++) {
      const key = '2026-' + String(m + 1).padStart(2, '0');
      if (!months[key]) months[key] = { revenue: 0, adSpendManaged: 0, billingRecords: [], expenses: [] };
    }
    const currentKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    if (!months[currentKey]) months[currentKey] = { revenue: 0, adSpendManaged: 0, billingRecords: [], expenses: [] };

    allBilling.forEach(r => {
      if (!r.createdAt && !r.paidAt) return;
      const d = new Date(r.paidAt || r.createdAt);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (!months[key]) months[key] = { revenue: 0, adSpendManaged: 0, billingRecords: [], expenses: [] };
      const amount = parseFloat(r.amount || r.platformFee || 0);
      const adSpend = parseFloat(r.adSpend || r.metaAdSpend || 0);
      months[key].revenue += amount;
      months[key].adSpendManaged += adSpend;
      months[key].billingRecords.push({ brand: r._brandName, amount, adSpend, status: r.status || 'pending', date: r.paidAt || r.createdAt });
    });

    manualExpenses.forEach(e => {
      const d = new Date(e.date);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (!months[key]) months[key] = { revenue: 0, adSpendManaged: 0, billingRecords: [], expenses: [] };
      months[key].expenses.push(e);
    });

    costs.oneTime.forEach(c => {
      const d = new Date(c.date);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (months[key]) months[key].expenses.push({ ...c, type: 'one-time' });
    });

    const monthlyData = Object.entries(months).sort((a, b) => b[0].localeCompare(a[0])).map(([month, data]) => {
      const extraExpenses = data.expenses.reduce((s, e) => s + (e.amount || 0), 0);
      const totalExpenses = monthlyRecurring + extraExpenses;
      const netProfit = data.revenue - totalExpenses;
      return { month, revenue: data.revenue, adSpendManaged: data.adSpendManaged, monthlyRecurring, extraExpenses, totalExpenses, netProfit, margin: data.revenue > 0 ? Math.round((netProfit / data.revenue) * 100) : 0, billingRecords: data.billingRecords, manualExpenses: data.expenses, brandCount: new Set(data.billingRecords.map(r => r.brand)).size };
    });

    const allTimeRevenue = monthlyData.reduce((s, m) => s + m.revenue, 0);
    const allTimeExpenses = monthlyData.reduce((s, m) => s + m.totalExpenses, 0);

    res.json({
      months: monthlyData,
      summary: { allTimeRevenue, allTimeExpenses, allTimeProfit: allTimeRevenue - allTimeExpenses, monthlyRecurring, currentMRR: monthlyData[0]?.revenue || 0, totalBrandsEverBilled: new Set(allBilling.map(r => r._brandId)).size },
      costs,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Save editable costs (recurring + one-time)
app.post('/api/admin/pnl/costs', checkAdmin, async (req, res) => {
  try {
    const { recurring, oneTime } = req.body;
    const costs = loadPnlCosts();
    if (recurring) costs.recurring = recurring;
    if (oneTime) costs.oneTime = oneTime;
    saveJson(PNL_COSTS_FILE, costs);
    res.json({ success: true, costs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Add/delete manual expense
app.post('/api/admin/pnl/expense', checkAdmin, async (req, res) => {
  try {
    const { action, expense, id } = req.body;
    let expenses = [];
    try { expenses = loadJson(PNL_EXPENSES_FILE) || []; } catch (_) {}
    if (action === 'add' && expense) {
      expense.id = 'exp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      expense.createdAt = new Date().toISOString();
      expenses.push(expense);
    } else if (action === 'delete' && id) {
      expenses = expenses.filter(e => e.id !== id);
    }
    saveJson(PNL_EXPENSES_FILE, expenses);
    res.json({ success: true, expenses });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ ADMIN ROADMAP CHECKLIST ═══
const ROADMAP_FILE = path.join(DATA_DIR, 'roadmap_checklist.json');

app.get('/api/admin/roadmap', checkAdmin, async (req, res) => {
  try {
    const data = loadJson(ROADMAP_FILE) || {};
    res.json({ checklist: data });
  } catch (e) { res.json({ checklist: {} }); }
});

app.post('/api/admin/roadmap', checkAdmin, async (req, res) => {
  try {
    const { checklist } = req.body;
    if (checklist) saveJson(ROADMAP_FILE, checklist);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/env-check', checkAdmin, async (req, res) => {
  const checks = {};
  // Environment variables
  const envVars = {
    'SUPABASE_URL': { required: true, category: 'database' },
    'SUPABASE_SERVICE_KEY': { required: true, category: 'database' },
    'SUPABASE_JWT_SECRET': { required: true, category: 'auth' },
    'RESEND_KEY': { required: true, category: 'email' },
    'SCRAPE_KEY': { required: true, category: 'apis' },
    'META_APP_ID': { required: true, category: 'meta' },
    'META_APP_SECRET': { required: true, category: 'meta' },
    'TT_CLIENT_KEY': { required: true, category: 'tiktok' },
    'TT_CLIENT_SECRET': { required: true, category: 'tiktok' },
    'STRIPE_SECRET_KEY': { required: true, category: 'payments' },
    'STRIPE_WEBHOOK_SECRET': { required: true, category: 'payments' },
    'ADMIN_PASSWORD': { required: true, category: 'auth' },
    'FRONTEND_URL': { required: true, category: 'hosting' },
    'DATA_DIR': { required: true, category: 'hosting' },
    'NODE_ENV': { required: false, category: 'hosting' },
    'SENTRY_DSN': { required: false, category: 'monitoring' },
    'ANTHROPIC_API_KEY': { required: true, category: 'ai' },
  };
  const envStatus = {};
  for (const [k, v] of Object.entries(envVars)) {
    envStatus[k] = { set: !!process.env[k], required: v.required, category: v.category };
  }
  checks.env = envStatus;

  // Service connectivity checks — REAL verification, not just "is key set"
  const services = {};

  // Supabase — real DB query
  try { const { data, error } = await supabase.from('brands').select('id').limit(1); services.supabase = { status: error ? 'error' : 'ok', message: error ? error.message : 'Connected', mode: 'live' }; } catch (e) { services.supabase = { status: 'error', message: e.message }; }

  // Stripe — check key type AND verify with real API call
  try {
    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
      services.stripe = { status: 'error', message: 'Not configured' };
    } else {
      const isLive = process.env.STRIPE_SECRET_KEY.startsWith('sk_live');
      // Actually call Stripe to verify key works
      try {
        await stripe.balance.retrieve();
        services.stripe = { status: isLive ? 'ok' : 'warning', message: isLive ? 'Live — processing real payments' : 'TEST MODE — no real payments', mode: isLive ? 'live' : 'test' };
      } catch (stripeErr) {
        services.stripe = { status: 'error', message: 'Key invalid: ' + (stripeErr.message || '').slice(0, 80), mode: isLive ? 'live' : 'test' };
      }
    }
  } catch (e) { services.stripe = { status: 'error', message: e.message }; }

  // Resend — verify key with real API call (list domains)
  if (process.env.RESEND_KEY) {
    try {
      const resendResp = await fetch('https://api.resend.com/domains', { headers: { Authorization: 'Bearer ' + process.env.RESEND_KEY } });
      if (resendResp.ok) {
        const domains = await resendResp.json();
        const verified = (domains.data || []).filter(d => d.status === 'verified');
        const pending = (domains.data || []).filter(d => d.status !== 'verified');
        services.resend = { status: verified.length > 0 ? 'ok' : 'warning', message: verified.length > 0 ? verified.map(d => d.name).join(', ') + ' verified' : (pending.length > 0 ? pending[0].name + ' pending verification' : 'No domains configured'), mode: verified.length > 0 ? 'live' : 'unverified' };
      } else {
        services.resend = { status: 'error', message: 'API key invalid (HTTP ' + resendResp.status + ')', mode: 'error' };
      }
    } catch (e) { services.resend = { status: 'error', message: 'Failed to verify: ' + e.message }; }
  } else { services.resend = { status: 'error', message: 'RESEND_KEY not set' }; }

  // ScrapeCreators — verify key with a lightweight test call
  if (process.env.SCRAPE_KEY) {
    try {
      const scResp = await fetch('https://api.scrapecreators.com/v1/tiktok/profile?handle=tiktok', { headers: { 'x-api-key': process.env.SCRAPE_KEY } });
      if (scResp.ok) {
        services.scrapeCreators = { status: 'ok', message: 'API key verified', mode: 'live' };
      } else if (scResp.status === 401 || scResp.status === 403) {
        services.scrapeCreators = { status: 'error', message: 'API key invalid or expired', mode: 'error' };
      } else {
        services.scrapeCreators = { status: 'warning', message: 'API returned HTTP ' + scResp.status, mode: 'unknown' };
      }
    } catch (e) { services.scrapeCreators = { status: 'warning', message: 'Could not verify: ' + e.message }; }
  } else { services.scrapeCreators = { status: 'error', message: 'SCRAPE_KEY not set' }; }

  // Meta API — verify app credentials with Graph API
  if (process.env.META_APP_ID && process.env.META_APP_SECRET) {
    try {
      const appToken = process.env.META_APP_ID + '|' + process.env.META_APP_SECRET;
      const metaResp = await fetch('https://graph.facebook.com/v22.0/' + process.env.META_APP_ID + '?fields=name,status,development_stage&access_token=' + encodeURIComponent(appToken));
      if (metaResp.ok) {
        const appData = await metaResp.json();
        const stage = appData.development_stage || 'unknown';
        const isLive = stage === 'live';
        services.metaApi = { status: isLive ? 'ok' : 'warning', message: (appData.name || 'App') + ' — ' + stage, mode: stage };
      } else {
        const errData = await metaResp.json().catch(() => ({}));
        services.metaApi = { status: 'error', message: 'App credentials invalid: ' + (errData.error?.message || 'HTTP ' + metaResp.status).slice(0, 80), mode: 'error' };
      }
    } catch (e) { services.metaApi = { status: 'error', message: 'Failed to verify: ' + e.message }; }
  } else { services.metaApi = { status: 'error', message: 'META_APP_ID or META_APP_SECRET not set' }; }

  // TikTok API — verify credentials
  // NOTE: Login Kit apps can't use client_credentials grant, so we test what we can
  if (process.env.TT_CLIENT_KEY && process.env.TT_CLIENT_SECRET) {
    try {
      const ttResp = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'client_key=' + encodeURIComponent(process.env.TT_CLIENT_KEY) + '&client_secret=' + encodeURIComponent(process.env.TT_CLIENT_SECRET) + '&grant_type=client_credentials'
      });
      const ttData = await ttResp.json().catch(() => ({}));
      if (ttData.access_token) {
        services.tiktokApi = { status: 'ok', message: 'Credentials valid — production', mode: 'live' };
      } else if (ttData.error === 'invalid_client') {
        // invalid_client can mean: bad credentials OR Login Kit app (doesn't support client_credentials)
        // Check if any creators have successfully connected via TikTok OAuth — if so, credentials work
        const creators = await loadCreators();
        const hasOAuthCreators = creators.some(c => c.tiktokConnected || c.tiktokOpenId);
        if (hasOAuthCreators) {
          services.tiktokApi = { status: 'warning', message: 'Login Kit — sandbox (creator OAuth works, pending production)', mode: 'sandbox' };
        } else {
          services.tiktokApi = { status: 'warning', message: 'Login Kit — sandbox (pending production approval)', mode: 'sandbox' };
        }
      } else {
        services.tiktokApi = { status: 'warning', message: 'SANDBOX — ' + (ttData.error_description || ttData.error || 'pending production'), mode: 'sandbox' };
      }
    } catch (e) { services.tiktokApi = { status: 'error', message: 'Failed to verify: ' + e.message }; }
  } else { services.tiktokApi = { status: 'error', message: 'TT_CLIENT_KEY or TT_CLIENT_SECRET not set' }; }

  // Railway volume — real filesystem check
  const dataDir = process.env.DATA_DIR || '/data';
  if (fs.existsSync(dataDir)) {
    try { const testFile = path.join(dataDir, '.health_check'); fs.writeFileSync(testFile, 'ok'); fs.unlinkSync(testFile); services.volume = { status: 'ok', message: 'Volume mounted + writable at ' + dataDir, mode: 'live' }; }
    catch (e) { services.volume = { status: 'warning', message: 'Volume mounted but NOT writable: ' + e.message, mode: 'readonly' }; }
  } else { services.volume = { status: 'error', message: 'Volume NOT mounted at ' + dataDir }; }

  // Sentry
  services.sentry = { status: process.env.SENTRY_DSN ? 'ok' : 'warning', message: process.env.SENTRY_DSN ? 'DSN configured' : 'Not configured (optional)', mode: process.env.SENTRY_DSN ? 'live' : 'off' };

  // Anthropic API — verify key with a lightweight models list call
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const antResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
      });
      if (antResp.ok) {
        services.anthropic = { status: 'ok', message: 'CAi engine connected', mode: 'live' };
      } else {
        const errData = await antResp.json().catch(() => ({}));
        const errMsg = errData.error?.message || '';
        if (errMsg.includes('credit balance')) {
          services.anthropic = { status: 'warning', message: 'Key valid but no credits — add billing', mode: 'no_credits' };
        } else if (antResp.status === 401) {
          services.anthropic = { status: 'error', message: 'API key invalid', mode: 'error' };
        } else {
          services.anthropic = { status: 'warning', message: 'HTTP ' + antResp.status + ': ' + (errMsg || 'unknown').slice(0, 80), mode: 'error' };
        }
      }
    } catch (e) { services.anthropic = { status: 'error', message: 'Failed to verify: ' + e.message }; }
  } else { services.anthropic = { status: 'error', message: 'ANTHROPIC_API_KEY not set' }; }

  checks.services = services;

  // Data stats
  try {
    const brands = await loadBrands();
    const creators = await loadCreators();
    const brandsWithMeta = brands.filter(b => !!b.metaToken).length;
    const brandsWithBilling = brands.filter(b => !!b.billingEnabled).length;
    const brandsWithTikTok = brands.filter(b => !!(b.storeName || b.storeUrl)).length;
    checks.data = { brands: brands.length, creators: creators.length, brandsWithMeta, brandsWithBilling, brandsWithTikTok };
  } catch (e) { checks.data = { error: e.message }; }

  // Memory & uptime
  const mem = process.memoryUsage();
  checks.system = { uptimeSeconds: Math.round(process.uptime()), heapUsedMB: Math.round(mem.heapUsed / 1048576), rssMB: Math.round(mem.rss / 1048576), nodeVersion: process.version };

  // CAi endpoints (for admin health / command center)
  checks.caiEndpoints = { notifyBuildComplete: 'POST /api/cai/notify-build-complete' };

  res.json(checks);
});

// ═══ ADMIN: ACTIVITY LOG ═══
app.get('/api/admin/activity', checkAdmin, async (req, res) => {
  try {
    const log = loadJson(ACTIVITY_LOG_FILE) || [];
    res.json({ activities: log.slice(0, 200) });
  } catch (e) { res.json({ activities: [] }); }
});

// ═══ ADMIN: EMAIL LOG ═══
app.get('/api/admin/emails', checkAdmin, async (req, res) => {
  try {
    const log = loadJson(EMAIL_LOG_FILE) || [];
    res.json({ emails: log.slice(0, 200) });
  } catch (e) { res.json({ emails: [] }); }
});

// ═══ ADMIN: CAMPAIGN MONITOR (all brands) ═══
app.get('/api/admin/campaigns', checkAdmin, async (req, res) => {
  try {
    const registry = await loadCampaignRegistry();
    const brands = await loadBrands();
    const campaigns = Object.entries(registry).map(([id, meta]) => {
      const brand = brands.find(b => b.id === meta.brandId);
      return { id, ...meta, brandName: brand?.brandName || meta.brandName || '—', brandEmail: brand?.email || '', hasMetaToken: !!brand?.metaToken };
    });
    campaigns.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ campaigns, total: campaigns.length });
  } catch (e) { res.json({ campaigns: [], error: e.message }); }
});

// ═══ ADMIN: ALERTS ═══
app.get('/api/admin/alerts', checkAdmin, async (req, res) => {
  try {
    const brands = await loadBrands();
    const creators = await loadCreators();
    const alerts = [];
    const now = Date.now();

    // Stripe mode
    if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_live')) {
      alerts.push({ level: 'warning', type: 'stripe_test_mode', message: 'Stripe is in TEST mode. No real payments are being processed.', action: 'Switch to live keys in Railway env vars', link: 'https://dashboard.stripe.com/apikeys' });
    }

    // Meta tokens expiring within 7 days
    brands.forEach(b => {
      if (b.metaToken && b.metaTokenExpiresAt) {
        const expires = new Date(b.metaTokenExpiresAt).getTime();
        const daysLeft = Math.floor((expires - now) / 86400000);
        if (daysLeft <= 7 && daysLeft > 0) {
          alerts.push({ level: 'warning', type: 'meta_token_expiring', message: b.brandName + ' Meta token expires in ' + daysLeft + ' day' + (daysLeft !== 1 ? 's' : ''), brandId: b.id, action: 'Brand needs to re-authorize Meta' });
        } else if (daysLeft <= 0) {
          alerts.push({ level: 'critical', type: 'meta_token_expired', message: b.brandName + ' Meta token EXPIRED', brandId: b.id, action: 'Brand must re-connect Meta Ads immediately' });
        }
      }
    });

    // Billing failures
    brands.filter(b => b.billingPaymentFailed).forEach(b => {
      alerts.push({ level: 'critical', type: 'billing_failed', message: b.brandName + ' payment failed', brandId: b.id, action: 'Check Stripe dashboard' });
    });

    // Missing critical env vars
    ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'RESEND_KEY', 'STRIPE_SECRET_KEY', 'META_APP_ID', 'META_APP_SECRET', 'ANTHROPIC_API_KEY'].forEach(k => {
      if (!process.env[k]) alerts.push({ level: 'critical', type: 'env_missing', message: k + ' is not set', action: 'Add to Railway env vars' });
    });

    // Brands without Meta connected
    const noMeta = brands.filter(b => !b.metaToken && b.email);
    if (noMeta.length > 0) {
      alerts.push({ level: 'info', type: 'brands_no_meta', message: noMeta.length + ' brand' + (noMeta.length > 1 ? 's' : '') + ' without Meta Ads connected', brands: noMeta.map(b => b.brandName || b.email) });
    }

    // GitHub repo is public (reminder)
    alerts.push({ level: 'warning', type: 'repo_public', message: 'GitHub repo may still be public with old credentials in history', action: 'Make private', link: 'https://github.com/davidodemchuk/creatorship-mvp/settings' });

    alerts.sort((a, b) => { const order = { critical: 0, warning: 1, info: 2 }; return (order[a.level] ?? 3) - (order[b.level] ?? 3); });
    res.json({ alerts, counts: { critical: alerts.filter(a => a.level === 'critical').length, warning: alerts.filter(a => a.level === 'warning').length, info: alerts.filter(a => a.level === 'info').length } });
  } catch (e) { res.json({ alerts: [], error: e.message }); }
});

// ═══ ADMIN: QUICK ACTIONS ═══
app.post('/api/admin/quick-action', checkAdmin, async (req, res) => {
  const { action, brandId, email: actionEmail } = req.body;
  try {
    if (action === 'test-email') {
      const target = actionEmail || 'test@creatorship.app';
      const ok = await sendEmail(target, 'Creatorship Test Email', '<h1>Test Email</h1><p>This is a test email from Creatorship admin.</p>');
      logActivity('admin_test_email', { to: target, success: ok });
      return res.json({ success: ok, message: ok ? 'Test email sent to ' + target : 'Email send failed' });
    }
    if (action === 'refresh-meta' && brandId) {
      const brand = await getBrandById(brandId);
      if (!brand?.metaToken) return res.json({ error: 'Brand has no Meta token' });
      const acctData = await apiFetch('https://graph.facebook.com/v22.0/me/adaccounts?fields=id,name,account_status&access_token=' + brand.metaToken);
      const active = (acctData.data || []).filter(a => a.account_status === 1 || a.account_status === 3);
      if (active.length > 0) {
        brand.adAccount = active[0].id;
        brand.metaAdAccounts = active.map(a => ({ id: a.id, name: a.name || a.id }));
        await saveBrand(brand);
        logActivity('admin_refresh_meta', { brandId, adAccount: brand.adAccount });
      }
      return res.json({ success: true, adAccount: brand.adAccount, accounts: active.length });
    }
    if (action === 'scan-brand' && brandId) {
      const brand = await getBrandById(brandId);
      if (!brand?.storeName) return res.json({ error: 'Brand has no store name' });
      logActivity('admin_scan_brand', { brandId, storeName: brand.storeName });
      return res.json({ success: true, message: 'Scan triggered for ' + brand.storeName });
    }
    res.json({ error: 'Unknown action' });
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/admin/trigger-cron', checkAdmin, async (req, res) => {
  try {
    if (typeof cronScan === 'function') await cronScan();
    res.json({ success: true, message: 'Cron scan triggered' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// CONTACT FORM
// ═══════════════════════════════════════════════════════════
app.post('/api/contact', contactLimiter, async (req, res) => {
  const { name, email, subject, message, source, creatorId, brandId } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'name, email, and message required' });
  const entry = { id: 'contact_' + Date.now(), name, email, subject: subject || 'general', message, source: source || null, creatorId: creatorId || null, brandId: brandId || null, createdAt: new Date().toISOString() };
  if (supabase) await supabase.from('contact_messages').insert({ id: entry.id, data: entry });
  res.json({ success: true });
  // Notify admin of new contact message
  sendEmail(
    'admin@creatorship.app',
    'New Contact: ' + (subject || 'General') + ' from ' + name,
    emailBase({
      title: 'New Contact Form Submission',
      preheader: 'A new contact form message was submitted.',
      headerEmoji: '📨',
      bodyHtml: `<p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p><p><strong>Subject:</strong> ${escapeHtml(subject || 'General Inquiry')}</p><p><strong>Message:</strong></p><p style="background:#f3f4f6;padding:16px;border-radius:8px;white-space:pre-wrap;">${escapeHtml(message)}</p><p>Reply directly to <a href="mailto:${encodeURIComponent(email)}" style="color:#0099ff;">${escapeHtml(email)}</a></p>`
    })
  ).catch(() => {});
});

// ═══════════════════════════════════════════════════════════
// META OAUTH — One-click Facebook/Meta Ads connection
// ═══════════════════════════════════════════════════════════
app.get('/auth/meta', async (req, res) => {
  if (!META_APP_ID) return res.status(503).send('Meta App not configured');
  const brandEmail = (req.query.email || '').trim();
  const csrfToken = crypto.randomBytes(16).toString('hex');
  if (!global._csrfTokens) global._csrfTokens = new Map();
  // Clean up old tokens (5 min TTL)
  const now = Date.now();
  for (const [k, v] of global._csrfTokens.entries()) {
    if (now - (v?.created || 0) > 5 * 60 * 1000) global._csrfTokens.delete(k);
  }
  global._csrfTokens.set(csrfToken, { email: brandEmail, created: now });
  const state = Buffer.from(JSON.stringify({ email: brandEmail, csrf: csrfToken })).toString('base64');
  const scopes = 'ads_management,ads_read,pages_show_list,pages_read_engagement';
  const url = 'https://www.facebook.com/v22.0/dialog/oauth?' +
    'client_id=' + META_APP_ID +
    '&redirect_uri=' + encodeURIComponent(META_REDIRECT_URI) +
    '&scope=' + encodeURIComponent(scopes) +
    '&state=' + encodeURIComponent(state) +
    '&response_type=code';
  res.redirect(url);
});

app.get('/auth/meta/callback', async (req, res) => {
  const { code, error, error_description, state } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || TUNNEL_URL || 'http://localhost:3001';

  if (error) {
    console.error('[meta-oauth] Error:', error, error_description);
    return res.redirect(frontendUrl + '/brand?meta_error=' + encodeURIComponent(error_description || error));
  }
  if (!code) return res.redirect(frontendUrl + '/brand?meta_error=no_code');
  if (!state) return res.redirect(frontendUrl + '/brand?meta_error=invalid_state');

  let brandEmail = '';
  try {
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const storedToken = global._csrfTokens?.get(stateData.csrf);
    if (!storedToken) {
      console.error('[meta-oauth] Invalid CSRF token');
      return res.redirect(frontendUrl + '/brand?meta_error=invalid_state');
    }
    global._csrfTokens.delete(stateData.csrf); // One-time use
    brandEmail = stateData.email || storedToken.email || '';
  } catch (_) {
    return res.redirect(frontendUrl + '/brand?meta_error=invalid_state');
  }

  try {
    // Exchange code for access token
    const tokenUrl = 'https://graph.facebook.com/v22.0/oauth/access_token?' +
      'client_id=' + META_APP_ID +
      '&redirect_uri=' + encodeURIComponent(META_REDIRECT_URI) +
      '&client_secret=' + META_APP_SECRET +
      '&code=' + code;
    const tokenData = await apiFetch(tokenUrl);

    if (!tokenData.access_token) {
      console.error('[meta-oauth] No access token:', JSON.stringify(tokenData));
      return res.redirect(frontendUrl + '/brand?meta_error=token_failed');
    }

    // Exchange for long-lived token (60 days instead of 1 hour)
    let longToken = tokenData.access_token;
    let expiresIn = 5184000; // default 60 days
    try {
      const longUrl = 'https://graph.facebook.com/v22.0/oauth/access_token?' +
        'grant_type=fb_exchange_token' +
        '&client_id=' + META_APP_ID +
        '&client_secret=' + META_APP_SECRET +
        '&fb_exchange_token=' + tokenData.access_token;
      const longData = await apiFetch(longUrl);
      if (longData.access_token) {
        longToken = longData.access_token;
        expiresIn = longData.expires_in || expiresIn;
      }
    } catch (e) {}

    // Get user info, ad accounts, and pages
    const meData = await apiFetch('https://graph.facebook.com/v22.0/me?fields=id,name&access_token=' + longToken);
    const adAccountsData = await apiFetch('https://graph.facebook.com/v22.0/me/adaccounts?fields=id,name,account_id,account_status,currency,business_name&access_token=' + longToken);
    const adAccounts = (adAccountsData.data || []).filter(a => a.account_status === 1 || a.account_status === 3 || a.account_status === 9);
    // Fetch pages immediately after we have the token so metaPages is always saved
    let pages = [];
    try {
      const pagesRes = await fetch('https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,picture.type(square)&access_token=' + encodeURIComponent(longToken));
      const pagesData = await pagesRes.json();
      pages = Array.isArray(pagesData.data) ? pagesData.data : [];
    } catch (err) {
      console.error('[meta-oauth] Pages fetch error:', err.message);
    }

    // Fetch the brand's Meta Pixel
    let pixelId = null;
    try {
      const pixelResp = await fetch('https://graph.facebook.com/v22.0/' + (adAccounts[0]?.id || '') + '/adspixels?fields=id,name,is_unavailable&access_token=' + longToken);
      const pixelData = await pixelResp.json();
      const pixels = (pixelData.data || []).filter(p => !p.is_unavailable);
      if (pixels.length > 0) {
        pixelId = pixels[0].id;
        console.log('[meta-oauth] Found pixel:', pixelId, '(' + pixels[0].name + ')');
      } else {
        console.log('[meta-oauth] No pixel found for ad account', adAccounts[0]?.id);
      }
    } catch (pixErr) {
      console.error('[meta-oauth] Pixel fetch error:', pixErr.message);
    }

    // Save to brand record (targeted — no loadBrands/saveBrands race)
    if (brandEmail) {
      const brand = await getBrandByEmail(brandEmail);
      if (brand) {
        brand.metaToken = longToken;
        brand.metaTokenType = 'oauth';
        brand.metaTokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
        brand.metaUserId = meData.id;
        brand.metaUserName = meData.name;
        if (!brand.adAccount && adAccounts.length > 0) {
          brand.adAccount = adAccounts[0].id;
        }
        brand.metaPages = pages.map(p => ({ id: p.id, name: p.name, picture: p.picture }));
        if (pages.length >= 1) {
          brand.pageId = pages[0].id;
          brand.metaPageId = pages[0].id;
          brand.metaPageName = pages[0].name;
          brand.metaPageAccessToken = pages[0].access_token;
        }
        brand.metaAdAccounts = adAccounts.map(a => ({ id: a.id, name: a.name || a.business_name || a.account_id, accountId: a.account_id }));
        if (pixelId) {
          brand.metaPixelId = pixelId;
        }
        await saveBrand(brand);
        if (brand?.id) await auditLogAction('meta_connected', brand.id, { adAccounts: adAccounts.length, pages: (pages || []).length });
      }
    }

    logActivity('meta_connect', { email: brandEmail, adAccounts: adAccounts.length, pages: pages.length });
    res.redirect(frontendUrl + '/brand?meta_connected=true&ad_accounts=' + adAccounts.length + '&pages=' + (pages || []).length + '#dashboard');
  } catch (e) {
    console.error('[meta-oauth] Error:', e.message);
    res.redirect(frontendUrl + '/brand?meta_error=' + encodeURIComponent(e.message));
  }
});

app.get('/api/brand/meta-accounts', async (req, res) => {
  const { email, brandId } = req.query;
  const b = await getBrand(brandId || req.brandAuth?.brandId, email);
  if (!b) return res.json({ error: 'Brand not found' });
  res.json({
    connected: !!b.metaToken,
    tokenType: b.metaTokenType || 'manual',
    userName: b.metaUserName || '',
    adAccounts: b.metaAdAccounts || [],
    pages: b.metaPages || [],
    selectedAdAccount: b.adAccount || '',
    selectedPageId: b.metaPageId || b.pageId || '',
  });
});

app.post('/api/brand/select-meta-account', requireRole('admin'), async (req, res) => {
  const { email, brandId, adAccount, pageId } = req.body;
  const brand = await getBrand(brandId || req.brandAuth?.brandId, email);
  if (!brand) return res.json({ error: 'Brand not found' });
  if (adAccount !== undefined && adAccount !== '') brand.adAccount = adAccount;
  if (pageId !== undefined && pageId !== '') { brand.pageId = pageId; brand.metaPageId = pageId; }
  if (req.body.pageName) { brand.pageName = req.body.pageName; brand.metaPageName = req.body.pageName; }
  await saveBrand(brand);
  res.json({ success: true, brand: brandResponse(brand) });
});

// Fetch Meta pages and ad accounts for a user access token
app.get('/api/meta-pages', authBrand, async (req, res) => {
  try {
    const accessToken = String(req.query.accessToken || '').trim();
    const brandId = String(req.query.brandId || '').trim();
    const email = String(req.query.email || '').trim();

    let tokenToUse = accessToken;
    if (!tokenToUse && (brandId || email)) {
      const brand = await getBrand(brandId, email);
      if (brand && brand.metaToken) {
        tokenToUse = String(brand.metaToken).trim();
      }
    }
    if (!tokenToUse) return res.status(400).json({ error: 'accessToken, brandId, or email required' });

    const fetchMeta = async (token) => {
      const [pagesRes, adAccountsRes] = await Promise.all([
        fetch('https://graph.facebook.com/v18.0/me/accounts?fields=id,name,category,access_token,picture.type(square)&access_token=' + encodeURIComponent(token)),
        fetch('https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_id&access_token=' + encodeURIComponent(token)),
      ]);
      const pagesData = await pagesRes.json().catch(() => ({}));
      const adAccountsData = await adAccountsRes.json().catch(() => ({}));
      return { pagesData, adAccountsData };
    };

    let result = await fetchMeta(tokenToUse);
    let { pagesData, adAccountsData } = result;
    if ((pagesData.error || adAccountsData.error) && (brandId || email) && tokenToUse === accessToken) {
      const brands = await loadBrands();
      const idx = brandId
        ? brands.findIndex(b => b.id === brandId)
        : brands.findIndex(b => (b.email || '').toLowerCase() === email.toLowerCase());
      if (idx !== -1 && brands[idx].metaToken) {
        const storedToken = String(brands[idx].metaToken).trim();
        result = await fetchMeta(storedToken);
        pagesData = result.pagesData;
        adAccountsData = result.adAccountsData;
      }
    }

    const pages = Array.isArray(pagesData.data)
      ? pagesData.data.map(p => ({
          pageId: p.id,
          pageName: p.name,
          avatarUrl: p.picture?.data?.url || null,
        }))
      : [];

    const adAccounts = Array.isArray(adAccountsData.data)
      ? adAccountsData.data.map(a => ({
          id: a.id,
          name: a.name,
          account_id: a.account_id || a.id,
        }))
      : [];

    if (pagesData.error) return res.status(400).json({ error: pagesData.error.message || 'Meta API error', pages: [], adAccounts: [] });
    
    // Save pages to brand record so they persist
    if (pages.length > 0 && (brandId || email)) {
      try {
        const brand = await getBrand(brandId, email);
        if (brand) {
          brand.metaPages = pages.map(p => ({ id: p.pageId, name: p.pageName, picture: p.avatarUrl }));
          // Auto-select first page if none selected
          if (!brand.pageId && !brand.metaPageId && pages.length > 0) {
            brand.pageId = pages[0].pageId;
            brand.metaPageId = pages[0].pageId;
            brand.metaPageName = pages[0].pageName;
            console.log('[meta-pages] Auto-selected page:', pages[0].pageName, pages[0].pageId);
          }
          await saveBrand(brand);
        }
      } catch (saveErr) { console.log('[meta-pages] Save error:', saveErr.message); }
    }
    
    return res.json({ pages, adAccounts });
  } catch (e) {
    console.error('[meta-pages] Error:', e);
    return res.status(500).json({ error: 'Failed to fetch pages from Meta' });
  }
});

// ═══ META HEALTH CHECK — verify everything needed before activation ═══
app.get('/api/meta-health-check', authBrand, async (req, res) => {
    const brandId = req.brandAuth?.brandId || req.query.brandId;
    if (!brandId) return res.status(400).json({ error: 'brandId required' });
    const brand = await getBrandById(brandId);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const token = brand.metaToken;
    if (!token) return res.json({ ok: false, issues: [{ type: 'no_token', severity: 'critical', title: 'Meta not connected', message: 'Connect your Meta account to get started.', action: 'connect_meta' }] });

    const issues = [];
    const checks = { token: false, adAccount: false, page: false, payment: false, accountStatus: false };

    // 1. Verify token is still valid
    try {
      const me = await apiFetch('https://graph.facebook.com/v22.0/me?fields=id,name&access_token=' + token);
      if (me.id) {
        checks.token = true;
      } else {
        issues.push({ type: 'token_invalid', severity: 'critical', title: 'Meta connection expired', message: 'Your Meta access token is no longer valid. Please reconnect your Meta account.', action: 'reconnect_meta' });
      }
    } catch (e) {
      issues.push({ type: 'token_invalid', severity: 'critical', title: 'Meta connection expired', message: 'Could not verify your Meta connection: ' + e.message, action: 'reconnect_meta' });
    }

    if (!checks.token) return res.json({ ok: false, checks, issues });

    // 2. Verify token permissions/scopes
    try {
      const perms = await apiFetch('https://graph.facebook.com/v22.0/me/permissions?access_token=' + token);
      const granted = (perms.data || []).filter(p => p.status === 'granted').map(p => p.permission);
      const required = ['ads_management', 'ads_read', 'pages_read_engagement'];
      const missing = required.filter(r => !granted.includes(r));
      if (missing.length > 0) {
        issues.push({ type: 'missing_permissions', severity: 'critical', title: 'Missing Meta permissions', message: 'Creatorship needs these permissions to manage your ads: ' + missing.join(', ') + '. Please reconnect Meta and approve all permissions.', action: 'reconnect_meta', details: { granted, missing } });
      }
    } catch (e) {
      issues.push({ type: 'permissions_check_failed', severity: 'warning', title: 'Could not verify permissions', message: 'Permission check failed: ' + e.message });
    }

    // 3. Check ad account exists and status
    const adAccount = brand.adAccount;
    if (!adAccount) {
      issues.push({ type: 'no_ad_account', severity: 'critical', title: 'No ad account selected', message: 'Select an ad account to run ads from.', action: 'select_ad_account' });
    } else {
      try {
        const acctData = await apiFetch('https://graph.facebook.com/v22.0/' + adAccount + '?fields=id,name,account_status,disable_reason,currency,funding_source_details,amount_spent&access_token=' + token);
        checks.adAccount = true;

        // account_status: 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_REVIEW, 9=IN_GRACE_PERIOD, 100=PENDING_CLOSURE, 101=CLOSED, 201=ANY_ACTIVE, 202=ANY_CLOSED
        const statusMap = { 1: 'Active', 2: 'Disabled', 3: 'Unsettled', 7: 'Pending Review', 9: 'Grace Period', 100: 'Pending Closure', 101: 'Closed' };
        const status = acctData.account_status;
        if (status !== 1 && status !== 201) {
          checks.accountStatus = false;
          issues.push({ type: 'account_not_active', severity: 'critical', title: 'Ad account is ' + (statusMap[status] || 'not active'), message: 'Your Meta ad account (' + adAccount + ') has status: ' + (statusMap[status] || 'Unknown (' + status + ')') + '. Meta won\'t deliver ads from this account. ' + (status === 2 ? 'Check Meta Business Suite for the disable reason and resolve it.' : status === 3 ? 'You have an outstanding balance. Pay it in Meta Business Suite.' : 'Contact Meta support to resolve this.'), action: 'open_meta_business', actionUrl: 'https://business.facebook.com/billing_hub/payment_activity?asset_id=' + (adAccount || '').replace('act_', '') });
        } else {
          checks.accountStatus = true;
        }

        // 4. Check payment method
        const noFunding = !acctData.funding_source_details && (acctData.amount_spent == null || acctData.amount_spent === 0 || acctData.amount_spent === '0');
        if (noFunding) {
          try {
            const paymentData = await apiFetch('https://graph.facebook.com/v22.0/' + adAccount + '?fields=funding_source,funding_source_details,balance&access_token=' + token);
            if (!paymentData.funding_source && !paymentData.funding_source_details) {
              issues.push({ type: 'no_payment_method', severity: 'critical', title: 'No payment method on ad account', message: 'Your Meta ad account has no payment method. Meta cannot spend your budget without one. Add a credit card or PayPal in Meta Business Suite → Billing.', action: 'open_meta_billing', actionUrl: 'https://business.facebook.com/billing_hub/payment_settings?asset_id=' + (adAccount || '').replace('act_', '') });
            } else {
              checks.payment = true;
            }
          } catch (e) {
            issues.push({ type: 'payment_check_warning', severity: 'warning', title: 'Could not verify payment method', message: 'We couldn\'t confirm a payment method on your ad account. Make sure you have a credit card or PayPal set up in Meta Business Suite → Billing before activating.' });
          }
        } else {
          checks.payment = true;
        }
      } catch (e) {
        issues.push({ type: 'ad_account_error', severity: 'critical', title: 'Cannot access ad account', message: 'Could not read your ad account (' + adAccount + '): ' + e.message + '. It may have been removed or you may not have permission.', action: 'select_ad_account' });
      }
    }

    // 5. Check page
    const pageId = brand.pageId;
    if (!pageId) {
      issues.push({ type: 'no_page', severity: 'critical', title: 'No Facebook Page selected', message: 'Select a Facebook Page for your ads to run from.', action: 'select_page' });
    } else {
      try {
        const pageData = await apiFetch('https://graph.facebook.com/v22.0/' + pageId + '?fields=id,name,is_published&access_token=' + token);
        if (pageData.id) {
          checks.page = true;
          if (pageData.is_published === false) {
            issues.push({ type: 'page_unpublished', severity: 'warning', title: 'Facebook Page is unpublished', message: 'Your page "' + (pageData.name || pageId) + '" is not published. Meta may restrict ad delivery from unpublished pages.' });
          }
        }
      } catch (e) {
        issues.push({ type: 'page_error', severity: 'critical', title: 'Cannot access Facebook Page', message: 'Could not verify Facebook Page (' + pageId + '): ' + e.message, action: 'select_page' });
      }
    }

    // 6. Check pixel
    if (adAccount) {
      try {
        const pixResp = await apiFetch('https://graph.facebook.com/v22.0/' + adAccount + '/adspixels?fields=id,name,is_unavailable&access_token=' + token);
        const pixels = (pixResp.data || []).filter(p => !p.is_unavailable);
        if (pixels.length === 0) {
          issues.push({ type: 'no_pixel', severity: 'warning', title: 'No Meta Pixel found', message: 'Your ad account has no tracking pixel. Without a pixel, CAi will run TRAFFIC campaigns instead of SALES campaigns. For best results, set up a Meta Pixel on your website.', action: 'open_meta_pixel', actionUrl: 'https://business.facebook.com/events_manager2/list/pixel/' + (adAccount || '').replace('act_', '') });
        } else if (!brand.metaPixelId) {
          brand.metaPixelId = pixels[0].id;
          await saveBrand(brand);
          console.log('[meta-health] Auto-saved pixel ' + pixels[0].id + ' for brand ' + brandId);
        }
      } catch (e) {
        console.log('[meta-health] Pixel check error:', e.message);
      }
    }

    const hasCritical = issues.some(i => i.severity === 'critical');
    console.log('[meta-health] Brand ' + brandId + ': ' + (hasCritical ? 'ISSUES FOUND' : 'ALL CLEAR') + ' — ' + JSON.stringify(checks));

    res.json({ ok: !hasCritical, checks, issues });
  });

// ═══════════════════════════════════════════════════════════
// STORE PRODUCTS
// ═══════════════════════════════════════════════════════════
function extractStoreIdFromShopResponse(data) {
  const si = data.shopInfo || data;
  const itemList = data.products || data.item_list || [];
  const first = itemList[0];
  const fromFirst = first?.seller_info || first;
  return si.seller_id ?? si.shop_id ?? si.store_id ?? si.sellerId ?? si.shopId ?? si.storeId
    ?? fromFirst?.seller_id ?? fromFirst?.shop_id ?? fromFirst?.store_id ?? first?.author_shop_id
    ?? (data.author && (data.author.shop_id || data.author.shopId)) ?? null;
}
function slugifyStoreName(s) {
  return (s || '').toString().toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'store';
}

app.post('/api/store', async (req, res) => {
  const scrapeKey = SCRAPE_API_KEY();
  if (!scrapeKey) return res.status(503).json({ error: 'Scan service not configured' });
  const { storeUrl, brandId } = req.body;
  if (!storeUrl) return res.status(400).json({ error: 'storeUrl required' });
  const parseResponse = (data) => {
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
    return { shop, products };
  };
  try {
    // Normalize store URL: strip query params, convert @handle to /shop/store/ format
    let cleanUrl = (storeUrl || '').split('?')[0].replace(/\/+$/, '');
    // ScrapeCreators requires /shop/store/HANDLE format — convert various @handle URL formats
    if (cleanUrl.includes('/shop/@')) {
      const h = cleanUrl.match(/\/shop\/@([^/]+)/);
      if (h) cleanUrl = 'https://www.tiktok.com/shop/store/' + h[1];
    }
    // Handle shop.tiktok.com/@handle format (no /shop/ in path)
    if (cleanUrl.match(/shop\.tiktok\.com\/@/)) {
      const h = cleanUrl.match(/@([^/?/]+)/);
      if (h) cleanUrl = 'https://www.tiktok.com/shop/store/' + h[1];
    }
    // Extract handle early so attachTikTokShopUrl can use it as fallback
    const storeMatch = cleanUrl.match(/\/shop\/store\/([^/]+)/);
    const atMatch = cleanUrl.match(/\/shop\/@([^/]+)/) || cleanUrl.match(/@([^/?/]+)/);
    const handle = (storeMatch ? storeMatch[1] : atMatch ? atMatch[1] : cleanUrl.split('/').pop()).replace(/^@/, '');
    const data = await apiFetch('https://api.scrapecreators.com/v1/tiktok/shop/products?url=' + encodeURIComponent(cleanUrl) + '&region=US', { headers: { 'x-api-key': scrapeKey, 'Content-Type': 'application/json' } });
    const attachTikTokShopUrl = (result, raw) => {
      const storeId = extractStoreIdFromShopResponse(raw);
      const si = raw?.shopInfo || raw;
      let storeName = si?.shop_name || si?.creator_name || result?.shop?.name || '';
      // If API returned a generic/unknown name, prefer the handle from the URL we sent
      if (!storeName || storeName === 'Unknown Store' || storeName === 'unknown') {
        const handleFromUrl = (handle || '').replace(/-/g, ' ');
        storeName = handleFromUrl || storeName;
      }
      if (storeId && storeName) {
        result.tikTokShopUrl = 'https://www.tiktok.com/shop/store/' + slugifyStoreName(storeName) + '/' + String(storeId);
      }
      return result;
    };
    if (!data.error) {
      // Paginate to get all products
      let storeCursor = data.has_more ? data.cursor : undefined;
      let storePageCount = 1;
      while (storeCursor && storePageCount < 5) {
        try {
          const nextStoreUrl = 'https://api.scrapecreators.com/v1/tiktok/shop/products?url=' + encodeURIComponent(cleanUrl) + '&region=US&cursor=' + encodeURIComponent(storeCursor);
          const nextStoreResp = await apiFetch(nextStoreUrl, { headers: { 'x-api-key': scrapeKey, 'Content-Type': 'application/json' } });
          if (nextStoreResp.error || !Array.isArray(nextStoreResp.products)) break;
          data.products = (data.products || []).concat(nextStoreResp.products);
          storeCursor = nextStoreResp.has_more ? nextStoreResp.cursor : undefined;
          storePageCount++;
        } catch (e) { break; }
      }
      const result = parseResponse(data);
      attachTikTokShopUrl(result, data);
      if (!result.shop.logo && data.products?.length > 0) {
        for (const p of data.products) {
          const pLogo = p.seller_info?.shop_logo?.url_list?.[0];
          if (pLogo) { result.shop.logo = pLogo; break; }
        }
      }
      if (result.products.length > 0) {
        if (brandId && result.tikTokShopUrl) {
          const storeBrand = await getBrandById(brandId);
          if (storeBrand) { storeBrand.tikTokShopUrl = result.tikTokShopUrl; await saveBrand(storeBrand); }
        }
        return res.json(result);
      }
    }

    // Second attempt: retry with /shop/store/HANDLE format (handle already extracted above)
    // ScrapeCreators requires: https://www.tiktok.com/shop/store/HANDLE
    if (handle) {
      const storeFormatUrl = 'https://www.tiktok.com/shop/store/' + handle;
      const data2 = await apiFetch('https://api.scrapecreators.com/v1/tiktok/shop/products?url=' + encodeURIComponent(storeFormatUrl) + '&region=US', { headers: { 'x-api-key': scrapeKey, 'Content-Type': 'application/json' } });
      if (!data2.error) {
        let storeCursor2 = data2.has_more ? data2.cursor : undefined;
        let storePageCount2 = 1;
        while (storeCursor2 && storePageCount2 < 5) {
          try {
            const nextStoreUrl2 = 'https://api.scrapecreators.com/v1/tiktok/shop/products?url=' + encodeURIComponent(storeFormatUrl) + '&region=US&cursor=' + encodeURIComponent(storeCursor2);
            const nextStoreResp2 = await apiFetch(nextStoreUrl2, { headers: { 'x-api-key': scrapeKey, 'Content-Type': 'application/json' } });
            if (nextStoreResp2.error || !Array.isArray(nextStoreResp2.products)) break;
            data2.products = (data2.products || []).concat(nextStoreResp2.products);
            storeCursor2 = nextStoreResp2.has_more ? nextStoreResp2.cursor : undefined;
            storePageCount2++;
          } catch (e) { break; }
        }
        const result2 = parseResponse(data2);
        attachTikTokShopUrl(result2, data2);
        if (!result2.shop.logo && data2.products?.length > 0) {
          for (const p of data2.products) {
            const pLogo = p.seller_info?.shop_logo?.url_list?.[0];
            if (pLogo) { result2.shop.logo = pLogo; break; }
          }
        }
        if (result2.products.length > 0) {
          if (brandId && result2.tikTokShopUrl) {
            const storeBrand2 = await getBrandById(brandId);
            if (storeBrand2) { storeBrand2.tikTokShopUrl = result2.tikTokShopUrl; await saveBrand(storeBrand2); }
          }
          return res.json(result2);
        }
      }
    }

    // Both attempts returned 0 products — try search endpoint to resolve store ID
    // ScrapeCreators /shop/search returns seller_info with store ID even when /shop/products returns empty
    if (handle) {
      try {
        const searchResp = await apiFetch('https://api.scrapecreators.com/v1/tiktok/shop/search?query=' + encodeURIComponent(handle.replace(/-/g, ' ')) + '&region=US', { headers: { 'x-api-key': scrapeKey, 'Content-Type': 'application/json' } });
        const searchProducts = Array.isArray(searchResp?.products) ? searchResp.products : [];
        const first = searchProducts[0];
        const sellerInfo = first?.seller_info || {};
        const storeId = sellerInfo.seller_id || sellerInfo.shop_id || sellerInfo.store_id || extractStoreIdFromShopResponse(searchResp);
        if (storeId) {
          const shopName = sellerInfo.shop_name || handle;
          const fullUrl = 'https://www.tiktok.com/shop/store/' + slugifyStoreName(shopName) + '/' + String(storeId);
          const data3 = await apiFetch('https://api.scrapecreators.com/v1/tiktok/shop/products?url=' + encodeURIComponent(fullUrl) + '&region=US', { headers: { 'x-api-key': scrapeKey, 'Content-Type': 'application/json' } });
          if (!data3.error) {
            let storeCursor3 = data3.has_more ? data3.cursor : undefined;
            let storePageCount3 = 1;
            while (storeCursor3 && storePageCount3 < 5) {
              try {
                const nextStoreUrl3 = 'https://api.scrapecreators.com/v1/tiktok/shop/products?url=' + encodeURIComponent(fullUrl) + '&region=US&cursor=' + encodeURIComponent(storeCursor3);
                const nextStoreResp3 = await apiFetch(nextStoreUrl3, { headers: { 'x-api-key': scrapeKey, 'Content-Type': 'application/json' } });
                if (nextStoreResp3.error || !Array.isArray(nextStoreResp3.products)) break;
                data3.products = (data3.products || []).concat(nextStoreResp3.products);
                storeCursor3 = nextStoreResp3.has_more ? nextStoreResp3.cursor : undefined;
                storePageCount3++;
              } catch (e) { break; }
            }
            const result3 = parseResponse(data3);
            result3.tikTokShopUrl = fullUrl;
            if (!result3.shop.logo && data3.products?.length > 0) {
              for (const p of data3.products) {
                const pLogo = p.seller_info?.shop_logo?.url_list?.[0];
                if (pLogo) { result3.shop.logo = pLogo; break; }
              }
            }
            if (result3.products.length > 0) {
              if (brandId) {
                const brand = await getBrandById(brandId);
                if (brand) { brand.tikTokShopUrl = fullUrl; await saveBrand(brand); }
              }
              return res.json(result3);
            }
          }
        }
      } catch (_) {}
    }

    // All attempts returned 0 products — return whatever we got
    const fallback = data.error ? { shop: {}, products: [] } : parseResponse(data);
    attachTikTokShopUrl(fallback, data);
    if (!fallback.shop.logo && data.products?.length > 0) {
      for (const p of data.products) {
        const pLogo = p.seller_info?.shop_logo?.url_list?.[0];
        if (pLogo) { fallback.shop.logo = pLogo; break; }
      }
    }
    res.json(fallback);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Fetch TikTok shop and extract real store URL from ScrapeCreators response (alias for store/enrich flow)
app.get('/api/fetch-tiktok-shop', async (req, res) => {
  try {
    const brandName = String(req.query.brandName || '').trim();
    const storeUrl = String(req.query.storeUrl || req.query.url || '').trim();
    const brandId = req.brandAuth?.brandId || req.query.brandId;
    const apiKey = process.env.SCRAPECREATORS_API_KEY || process.env.SCRAPE_KEY;
    if (!apiKey) return res.status(502).json({ error: 'ScrapeCreators API key not configured' });
    let data;
    if (storeUrl) {
      const cleanUrl = storeUrl.split('?')[0].replace(/\/+$/, '');
      const resp = await fetch('https://api.scrapecreators.com/v1/tiktok/shop/products?url=' + encodeURIComponent(cleanUrl) + '&region=US', { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' } });
      data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.success === false) return res.status(404).json({ error: data?.message || 'Could not fetch shop' });
    } else if (brandName) {
      const resp = await fetch('https://api.scrapecreators.com/v1/tiktok/shop/search?query=' + encodeURIComponent(brandName) + '&region=US', { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' } });
      data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.success === false) return res.status(404).json({ error: data?.message || 'Could not search shop' });
      const products = Array.isArray(data?.products) ? data.products : [];
      const first = products[0];
      const sellerInfo = first?.seller_info || {};
      const storeName = sellerInfo.shop_name || brandName || '';
      const storeId = extractStoreIdFromShopResponse(data) ?? sellerInfo.seller_id ?? sellerInfo.shop_id ?? sellerInfo.store_id;
      const tikTokShopUrl = storeId && storeName ? 'https://www.tiktok.com/shop/store/' + slugifyStoreName(storeName) + '/' + String(storeId) : '';
      if (brandId && tikTokShopUrl) {
        const brand = await getBrandById(brandId);
        if (brand) { brand.tikTokShopUrl = tikTokShopUrl; await saveBrand(brand); }
      }
      return res.json({ tikTokShopUrl: tikTokShopUrl || undefined, storeName, storeId: storeId || undefined });
    } else {
      return res.status(400).json({ error: 'brandName or storeUrl required' });
    }
    const si = data.shopInfo || data;
    const storeName = si.shop_name || si.creator_name || '';
    const storeId = extractStoreIdFromShopResponse(data);
    const tikTokShopUrl = storeId && storeName ? 'https://www.tiktok.com/shop/store/' + slugifyStoreName(storeName) + '/' + String(storeId) : '';
    if (brandId && tikTokShopUrl) {
      const brand = await getBrandById(brandId);
      if (brand) { brand.tikTokShopUrl = tikTokShopUrl; await saveBrand(brand); }
    }
    return res.json({ tikTokShopUrl: tikTokShopUrl || undefined, storeName, storeId: storeId || undefined });
  } catch (e) {
    console.error('[fetch-tiktok-shop] Error:', e);
    return res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// STORE PRODUCTS — cached product loading for Creator Discovery
// ═══════════════════════════════════════════════════════════
app.post('/api/store/products', async (req, res) => {
  const { storeUrl, brandId } = req.body;
  if (!storeUrl) return res.json({ error: 'storeUrl required' });

  // Check for cached products
  const cacheFile = path.join(DATA_DIR, 'store_products_' + (brandId || 'default') + '.json');
  try {
    if (fs.existsSync(cacheFile)) {
      const cached = loadJson(cacheFile);
      if (cached && cached.products && cached.products.length > 0) {
        const age = Date.now() - (cached.fetchedAt || 0);
        if (age < 24 * 60 * 60 * 1000) {
          return res.json({ products: cached.products, fromCache: true, storeName: cached.storeName, shop: cached.shop });
        }
      }
    }
  } catch (_) {}

  // Use the existing /api/store logic via apiFetch
  const cleanUrl = (storeUrl || '').split('?')[0].replace(/\/+$/, '');
  const scrapeKey = SCRAPE_API_KEY();
  if (!scrapeKey) return res.status(503).json({ error: 'Scan service not configured' });
  try {
    const data = await apiFetch('https://api.scrapecreators.com/v1/tiktok/shop/products?url=' + encodeURIComponent(cleanUrl) + '&region=US', { headers: { 'x-api-key': scrapeKey, 'Content-Type': 'application/json' } });
    if (data.error) return res.json({ error: data.error, products: [] });
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
      logo: si.shop_logo?.url_list?.[0] || '',
    };
    const products = (data.products || []).map(p => {
      const imgUrl = p.image?.url_list?.[0] || p.image?.url || '';
      return {
        id: p.product_id || p.id,
        title: p.title || 'Product',
        image: imgUrl,
        price: p.product_price_info?.sale_price_decimal || p.product_price_info?.origin_price_decimal || '0',
        currency: p.product_price_info?.currency_symbol || '$',
        sold: p.sold_info?.sold_count || 0,
        soldStr: p.sold_info?.format_sold_count || String(p.sold_info?.sold_count || 0),
        rating: p.rate_info?.score || 0,
        reviewCount: p.rate_info?.review_count || '0',
        url: p.seo_url?.canonical_url || ('https://www.tiktok.com/shop/product/' + (p.product_id || p.id)),
      };
    });

    // Cache results
    const cacheData = { products, shop, storeName: shop.name, fetchedAt: Date.now() };
    ensureDir(DATA_DIR);
    saveJson(cacheFile, cacheData);

    res.json({ products, shop, storeName: shop.name });
  } catch (e) {
    console.error('[store/products] Error:', e.message);
    res.json({ error: 'Could not load store products: ' + e.message, products: [] });
  }
});

// ═══════════════════════════════════════════════════════════
// SCRAPE + SCAN
// ═══════════════════════════════════════════════════════════
const SCRAPE_API_KEY = () => process.env.SCRAPE_KEY || process.env.SCRAPECREATORS_API_KEY || process.env.SCRAPE_CREATORS_KEY || '';

function mapRawToVideo(r, creatorMeta = {}, vidId) {
  const aw = r.aweme_info || r;
  const stats = aw.statistics || r;
  const author = aw.author || r;
  const views = parseInt(stats.play_count || r.play_count) || 0;
  const likes = parseInt(stats.digg_count || r.like_count || stats.like_count) || 0;
  const shares = parseInt(stats.share_count || r.share_count) || 0;
  const comments = parseInt(stats.comment_count || r.comment_count) || 0;
  const name = author.nickname || r.author_name || creatorMeta.name || 'Creator';
  const handleRaw = author.unique_id || (r.author_url ? r.author_url.split('/').pop() : '') || creatorMeta.handle || '';
  const handle = handleRaw ? '@' + handleRaw.replace(/^@/, '') : '@creator';
  const follower_count = parseInt(author.follower_count || r.author_followers || r.follower_count) || creatorMeta.followers || 1;
  const eng = views > 0 ? (likes + shares + comments) / views : 0;
  const v = {
    id: vidId || (aw.aweme_id || r.aweme_id || r.id || r.video_id || 'v' + Math.random().toString(36).slice(2, 11)),
    creator: name,
    handle,
    url: r.url || (aw.aweme_id ? 'https://www.tiktok.com/@' + (author.unique_id || 'user') + '/video/' + aw.aweme_id : '') || '',
    content_url: aw.video?.download_addr?.url_list?.[0] || r.content_url || '',
    cover: aw.video?.cover?.url_list?.[0] || r.cover_image_url || '',
    avatar: author.avatar_thumb?.url_list?.[0] || r.author_avatar_url || '',
    caption: aw.desc || r.title || r.desc || '',
    views,
    likes,
    shares,
    comments,
    follower_count,
    duration: aw.duration || r.duration || 0,
    engagement_rate: +(eng * 100).toFixed(2),
    isAffiliate: !!r.bc_ad_label_text,
    affiliateLabel: r.bc_ad_label_text || '',
  };
  v.cai_score = caiScore(v);
  const rb = 2 + (v.cai_score / 100) * 4.5;
  v.predicted_roas = [+rb.toFixed(1), +(rb + 1.4).toFixed(1)];
  return v;
}

app.post('/api/scan', async (req, res) => {
  const apiKey = SCRAPE_API_KEY();
  if (!apiKey) return res.status(503).json({ error: 'Scan service not configured' });
  const { productUrl, commission = 10, productPrice = 39.99, brandId, minViews = 10000 } = req.body;
  if (!productUrl) return res.status(400).json({ error: 'productUrl required' });
  try {
    // CHANGE 1 — Product endpoint with get_related_videos
    const data = await apiFetch(
      'https://api.scrapecreators.com/v1/tiktok/product?url=' + encodeURIComponent(productUrl) + '&get_related_videos=true&region=US',
      { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' } }
    );

    const relatedVideos = data.related_videos || [];
    const seenIds = new Set();
    const videoList = [];

    // Map product's related videos
    relatedVideos.forEach((r, i) => {
      const vid = r.aweme_id || r.id || r.video_id || 'pr' + i;
      if (seenIds.has(vid)) return;
      seenIds.add(vid);
      videoList.push(mapRawToVideo(r, {}, vid));
    });

    // Extract unique creator handles (without @)
    const handleSet = new Set();
    relatedVideos.forEach(r => {
      const author = r.aweme_info?.author || r;
      const h = (author.unique_id || (r.author_url ? r.author_url.split('/').pop() : '')).replace(/^@/, '');
      if (h && !handleSet.has(h)) handleSet.add(h);
    });
    const handles = [...handleSet];

    // CHANGE 2 & 3 — Fetch creator profile videos in parallel, 5 at a time
    const CONCURRENCY = 5;
    for (let i = 0; i < handles.length; i += CONCURRENCY) {
      const chunk = handles.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(handle =>
          apiFetch(
            'https://api.scrapecreators.com/v2/tiktok/user/posts?handle=' + encodeURIComponent(handle) + '&amount=100',
            { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' } }
          )
        )
      );
      results.forEach((result, idx) => {
        if (result.status !== 'fulfilled') {
          console.warn('[scan] Profile fetch failed for @' + chunk[idx] + ':', result.reason?.message || result.reason);
          return;
        }
        const payload = result.value;
        const items = payload.items || payload.videos || payload.posts || payload.data || (Array.isArray(payload) ? payload : []);
        const creatorMeta = { handle: chunk[idx], name: payload.nickname || payload.author_name || chunk[idx], followers: parseInt(payload.follower_count || payload.followers) || 1 };
        items.forEach((item, j) => {
          const vid = item.aweme_id || item.id || item.video_id || 'up_' + chunk[idx] + '_' + j;
          if (seenIds.has(vid)) return;
          seenIds.add(vid);
          videoList.push(mapRawToVideo(item, creatorMeta, vid));
        });
      });
    }

    const videos = videoList;

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

    const minV = Math.max(0, parseInt(minViews, 10) || 10000);
    const qualified = videos.filter(v => (v.views || 0) >= minV && (v.cai_score ?? 0) >= 40).sort((a, b) => (b.cai_score ?? 0) - (a.cai_score ?? 0));
    const filtered = videos.filter(v => (v.views || 0) < minV || (v.cai_score ?? 0) < 40);
    const uniqueCreators = new Set(videos.map(v => (v.handle || v.creator || '').toLowerCase().replace(/^@/, ''))).size;
    const scan = {
      time: new Date().toISOString(),
      productUrl,
      commission,
      product,
      minViews: minV,
      qualified,
      filtered,
      total: videos.length,
      totalFound: videos.length,
      note: `Scanned ${videos.length} total videos from ${uniqueCreators} creators`,
      brandId: brandId || null,
    };
    ensureDir(DATA_DIR);
    if (brandId) {
      ensureDir(SCANS_DIR);
      saveJson(path.join(SCANS_DIR, brandId + '.json'), scan);
    }
    saveJson(path.join(DATA_DIR, 'latest_scan.json'), scan);
    res.json(scan);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Fetch brand TikTok page (creator/brand account) by brandName
app.get('/api/fetch-tiktok-brand-page', async (req, res) => {
  try {
    const brandName = String(req.query.brandName || '').trim();
    if (!brandName) return res.status(400).json({ error: 'brandName required' });

    const apiKey = process.env.SCRAPECREATORS_API_KEY;
    if (!apiKey) return res.status(502).json({ error: 'ScrapeCreators API key not configured' });

    // Step 1: search TikTok content by brand name to find a likely author
    const searchUrl = 'https://api.scrapecreators.com/v1/tiktok/search/keyword?query=' + encodeURIComponent(brandName);
    const searchResp = await fetch(searchUrl, { method: 'GET', headers: { 'x-api-key': apiKey, 'content-type': 'application/json' } });
    const searchData = await searchResp.json().catch(() => ({}));
    if (!searchResp.ok) return res.status(404).json({ error: 'Profile not found' });

    const items = searchData.search_item_list || searchData.items || searchData.data || [];
    if (!Array.isArray(items) || items.length === 0) return res.status(404).json({ error: 'Profile not found' });

    const target = brandName.toLowerCase();
    let bestHandle = '';
    for (const item of items) {
      const aw = item.aweme_info || item;
      const author = aw.author || {};
      const uniqueId = (author.unique_id || '').toLowerCase();
      const nickname = (author.nickname || '').toLowerCase();
      if ((uniqueId && target.includes(uniqueId)) || (nickname && target.includes(nickname)) || (uniqueId && uniqueId.includes(target)) || (nickname && nickname.includes(target))) {
        bestHandle = (author.unique_id || author.sec_uid || author.nickname || '').replace(/^@/, '');
        break;
      }
    }
    if (!bestHandle) return res.status(404).json({ error: 'Profile not found' });
    const handle = bestHandle;

    // Step 2: fetch profile details for that handle
    const profileUrl = 'https://api.scrapecreators.com/v1/tiktok/profile?handle=' + encodeURIComponent(handle);
    const profileResp = await fetch(profileUrl, { method: 'GET', headers: { 'x-api-key': apiKey, 'content-type': 'application/json' } });
    const profileData = await profileResp.json().catch(() => ({}));
    if (!profileResp.ok || profileData.success === false || !profileData.user) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const user = profileData.user || {};
    const stats = profileData.stats || {};
    const resolvedHandle = user.unique_id || user.handle || user.username || handle;
    const displayName = user.nickname || resolvedHandle || brandName;
    const avatarUrl = user.avatarThumb || user.avatarMedium || '';
    const followerCount = stats.followerCount ?? stats.follower_count ?? stats.followers ?? 0;
    const videoCount = stats.videoCount ?? stats.video_count ?? stats.videos ?? 0;
    const bio = user.signature || '';

    return res.json({
      handle: resolvedHandle,
      avatarUrl,
      displayName,
      followerCount: Number(followerCount) || 0,
      videoCount: Number(videoCount) || 0,
      bio,
    });
  } catch (e) {
    console.error('[fetch-tiktok-brand-page] Error:', e);
    return res.status(500).json({ error: 'Profile not found' });
  }
});

// ═══════════════════════════════════════════════════════════
// DEEP SCAN — keyword search with pagination to find ALL videos
// ═══════════════════════════════════════════════════════════
app.get('/api/deep-scan', async (req, res) => {
  const scrapeKey = SCRAPE_API_KEY();
  if (!scrapeKey) return res.status(503).json({ error: 'Scan service not configured' });
  const { productId, searchQuery, maxPages = 50, brandId } = req.query;
  if (!searchQuery) return res.status(400).json({ error: 'searchQuery required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (obj) => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (_) {} };

  const seen = new Map();
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
        const follower_count = parseInt(author.follower_count) || parseInt(author.followers) || 1;

        const v = {
          id: vid,
          creator: author.nickname || 'Creator',
          handle: author.unique_id ? '@' + author.unique_id : '',
          avatar: author.avatar_thumb?.url_list?.[0] || '',
          url: item.url || ('https://www.tiktok.com/@' + (author.unique_id || author.uid) + '/video/' + vid),
          content_url: aw.video?.download_addr?.url_list?.[0] || '',
          cover: aw.video?.cover?.url_list?.[0] || aw.video?.origin_cover?.url_list?.[0] || '',
          caption: aw.desc || '',
          views, likes, shares, comments, follower_count,
          duration: aw.duration || 0,
          engagement_rate: +(eng * 100).toFixed(2),
          isAffiliate: hasShopLink,
          matchesProduct,
          shopProductUrl: shopUrl,
          source: 'search',
        };
        v.cai_score = caiScore(v);
        const rb = 2 + (v.cai_score / 100) * 4.5;
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
      time: new Date().toISOString(), searchQuery, productId, brandId: brandId || null,
      confirmed: confirmed.sort((a, b) => (b.cai_score || 0) - (a.cai_score || 0)),
      broader: broader.sort((a, b) => (b.cai_score || 0) - (a.cai_score || 0)),
      totalFound: allVideos.length, confirmedCount: confirmed.length,
      pages: page, credits: totalCredits,
    };
    ensureDir(DATA_DIR);
    if (brandId) {
      ensureDir(SCANS_DIR);
      saveJson(path.join(SCANS_DIR, brandId + '_deep.json'), deepScan);
    }
    saveJson(path.join(DATA_DIR, 'latest_deep_scan.json'), deepScan);

    send({ type: 'complete', ...deepScan });
  } catch (e) {
    send({ type: 'error', error: e.message, partial: [...seen.values()], credits: totalCredits });
  }
  res.end();
});

// ═══════════════════════════════════════════════════════════
// WATCHLIST & ALERTS (cron high-performer detection)
// ═══════════════════════════════════════════════════════════
app.post('/api/watchlist/add', async (req, res) => {
  const { brandId, productUrl, minViews = 25000, minCaiScore = 55 } = req.body;
  if (!brandId || !productUrl) return res.status(400).json({ error: 'brandId and productUrl required' });
  const entries = loadWatchlist();
  entries.push({ brandId, productUrl, minViews, minCaiScore, createdAt: new Date().toISOString(), lastRun: null });
  saveWatchlist(entries);
  res.json({ success: true });
});

app.get('/api/watchlist/:brandId', async (req, res) => {
  const { brandId } = req.params;
  const entries = loadWatchlist().filter(e => e.brandId === brandId);
  res.json({ entries });
});

app.delete('/api/watchlist/:brandId', async (req, res) => {
  const { brandId } = req.params;
  const entries = loadWatchlist().filter(e => e.brandId !== brandId);
  saveWatchlist(entries);
  res.json({ success: true });
});

app.get('/api/alerts/:brandId', async (req, res) => {
  const { brandId } = req.params;
  const alerts = loadAlerts()
    .filter(a => a.brandId === brandId && !a.dismissed)
    .sort((a, b) => (b.cai_score || 0) - (a.cai_score || 0));
  res.json({ alerts });
});

app.post('/api/alerts/dismiss', async (req, res) => {
  const { alertId } = req.body;
  if (!alertId) return res.status(400).json({ error: 'alertId required' });
  const alerts = loadAlerts();
  const a = alerts.find(x => x.id === alertId);
  if (!a) return res.status(404).json({ error: 'Alert not found' });
  a.dismissed = true;
  saveAlerts(alerts);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════
// DOWNLOAD + META LAUNCH
// ═══════════════════════════════════════════════════════════
function getScanForBrand(brandId) {
  if (brandId) {
    const f = path.join(SCANS_DIR, brandId + '.json');
    if (fs.existsSync(f)) return loadJson(f);
    return null;
  }
  return loadJson(path.join(DATA_DIR, 'latest_scan.json'));
}

function getDeepScanForBrand(brandId) {
  if (brandId) {
    const f = path.join(SCANS_DIR, brandId + '_deep.json');
    if (fs.existsSync(f)) return loadJson(f);
    return null;
  }
  return loadJson(path.join(DATA_DIR, 'latest_deep_scan.json'));
}

app.post('/api/download', async (req, res) => {
  const scrapeKey = SCRAPE_API_KEY();
  if (!scrapeKey) return res.status(503).json({ error: 'Scan service not configured' });
  const { videoId, brandId } = req.body;
  const scan = getScanForBrand(brandId);
  const deep = getDeepScanForBrand(brandId);
  const allVideos = [
    ...(scan?.qualified || []), ...(scan?.filtered || []),
    ...(deep?.confirmed || []), ...(deep?.broader || []),
  ];
  if (allVideos.length === 0 && !brandId) return res.status(400).json({ error: 'No scan data — run a scan first' });
  let video = allVideos.find(v => v.id === videoId || String(v.id) === String(videoId));
  if (!video && brandId) {
    const brandForCache = await getBrandById(brandId);
    const cached = brandForCache?.tiktokVideosCache || [];
    const cachedVid = cached.find(v => v.id === videoId || String(v.id) === String(videoId));
    if (cachedVid) {
      video = { id: cachedVid.id, content_url: cachedVid.downloadUrl || '', creator: cachedVid.authorHandle || 'creator' };
    }
  }
  if (!video) return res.status(404).json({ error: 'Video not found' });
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

// ═══════════════════════════════════════════════════════════
// AI CAMPAIGN PLAN ENGINE (CAi — Stage 2)
// ═══════════════════════════════════════════════════════════
const AI_PLANS_DIR = path.join(DATA_DIR, 'ai_plans');
ensureDir(AI_PLANS_DIR);

function loadAiPlan(brandId) { try { return loadJson(path.join(AI_PLANS_DIR, brandId + '.json')); } catch (_) { return null; } }
function saveAiPlan(brandId, plan) { ensureDir(AI_PLANS_DIR); saveJson(path.join(AI_PLANS_DIR, brandId + '.json'), plan); }

// Generate a campaign plan using Claude
// CAi: Generate ad copy for a specific video
// CAi: Build a complete campaign for a specific video
app.post('/api/ai/build-campaign', authBrand, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI not configured' });
  const { brandId, videoData, productTitle, productPrice } = req.body;
  if (!brandId) return res.status(400).json({ error: 'brandId required' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });

  const vid = videoData || {};
  const brandName = brand.brandName || brand.storeName || '';
  const price = productPrice || brand.avgProductPrice || 0;
  const brief = brand.caiBrief || '';
  const engRate = vid.views > 0 ? (((vid.likes||0)+(vid.shares||0))/(vid.views)*100).toFixed(2) : '0';

  const prompt = `You are CAi, a DTC Meta Ads strategist. Build this campaign.

${CAI_KNOWLEDGE}

BRAND: ${brandName}
PRODUCT: ${productTitle || brandName} ${price ? '($' + price + ')' : ''}
WEBSITE: ${brand.websiteUrl || brand.storeUrl || ''}
VIDEO CAPTION: ${(vid.desc || vid.caption || '').slice(0, 400)}
VIEWS: ${vid.views || 0} | LIKES: ${vid.likes || 0} | SHARES: ${vid.shares || 0} | ENGAGEMENT: ${engRate}%
CREATOR: @${vid.authorHandle || vid.creator || 'creator'}
${brief ? 'CAMPAIGN BRIEF: ' + brief : ''}

Return ONLY valid JSON:
{
  "primaryText": "2-3 sentences. Hook first. Social proof + benefit + CTA. Max 200 chars.",
  "headline": "Under 40 chars. Punchy, benefit-driven. No emojis.",
  "description": "Supporting the headline. Under 80 chars.",
  "cta": "SHOP_NOW or LEARN_MORE or BUY_NOW or GET_OFFER",
  "objective": "SALES or TRAFFIC or AWARENESS",
  "dailyBudget": number between 20-200 based on video performance,
  "duration": "7 or 14 or 30",
  "ageMin": number 18-35,
  "ageMax": number 45-65,
  "gender": "all or male or female",
  "audienceType": "broad or interest",
  "interests": "comma-separated if interest-based, empty string if broad",
  "reasoning": "1 sentence MAX. Describe what the viewer sees in the first 2-3 seconds of the video (the hook) and why it works as an ad. Be specific about the product being shown, not generic marketing terms. Example: 'Opens with nose visibly expanding — instant proof the device works, grabs attention in first 2 seconds.'",
  "confidenceScore": number 50-99
}

Base budget on video performance: 37M views hero = $80-150/day, 1M+ proven = $30-60/day, under 500K test = $20-40/day.
Write copy like a DTC brand that converts. Reference the video naturally. No hashtags. Keep reasoning about the HOOK and CONTENT of the video, not engagement metrics.`;

  try {
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!aiResp.ok) return res.json({ error: 'AI error' });
    const data = await aiResp.json();
    const text = (data.content || []).map(b => b.text || '').join('');
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const campaign = JSON.parse(cleaned);
    // Ensure copy fields are never empty — fallback to smart defaults
    const brandName = brand.brandName || brand.storeName || 'our product';
    if (!campaign.primaryText) campaign.primaryText = `This ${brandName} video has ${(vid.views||0).toLocaleString()} views for a reason. Try it for yourself.`;
    if (!campaign.headline) campaign.headline = `Get ${brandName} — Free Shipping`;
    if (!campaign.description) campaign.description = `Shop ${brandName} now`;
    if (!campaign.confidenceScore) campaign.confidenceScore = 70;
    if (!campaign.reasoning) campaign.reasoning = 'Strong hook in the first 2 seconds.';
    res.json({ success: true, campaign });
  } catch (e) {
    console.error('[ai-build-campaign]', e.message);
    res.json({ error: e.message });
  }
});

/*══════════════════════════════════════════════════════
  CAi 2.0 — ALWAYS-ON CAMPAIGN SYSTEM
  Inspired by: TikTok GMV Max (3 inputs, AI handles everything)
  + Meta Advantage+ (CBO, broad targeting, 22% higher ROAS)
  + Claude intelligence (hook analysis, DTC copy, creative scoring)
  
  Data model on brand record:
  brand.cai = {
    isActive: boolean,           // CAi is running
    monthlyBudget: number,       // Total monthly ad spend
    roasTarget: number,          // Target ROAS (e.g. 3.0)
    activatedAt: string,         // When brand activated CAi
    campaign: {
      id: string,                // Meta campaign ID (CBO enabled)
      adsetId: string,           // Meta ad set ID (Advantage+ broad)
      objective: string,         // OUTCOME_SALES
      createdAt: string,
    },
    creatives: [{                // Every video in the system
      videoId: string,           // Source video ID
      adId: string,              // Meta ad ID (null if not yet launched)
      creator: string,
      hookScore: number,         // CAi hook analysis (0-100)
      status: 'queued'|'active'|'paused'|'fatigued'|'rejected',
      addedAt: string,
      lastMetrics: { spend, roas, cpa, ctr, impressions },
      daysActive: number,
    }],
    performance: {               // Aggregated daily
      totalSpend: number,
      totalRevenue: number,
      avgRoas: number,
      avgCpa: number,
      bestAd: { videoId, roas },
      worstAd: { videoId, roas },
      lastUpdated: string,
    },
  }
══════════════════════════════════════════════════════*/

// DTC MEDIA BUYING KNOWLEDGE — baked in from Meta Q2 2025 data, agency benchmarks, GMV Max learnings
const CAI_KNOWLEDGE = `META ADS BEST PRACTICES (2025-2026 data):
- 70-80% of ad performance comes from CREATIVE QUALITY, not targeting or budget (Meta/Billo 2025)
- Advantage+ Sales Campaigns with broad targeting outperform manual by 22% (Meta Q2 2025 earnings)
- Always use Advantage Campaign Budget (CBO) — Meta distributes to best-performing ads automatically
- Always broad targeting: all ages 18-65, all genders, US — Meta's algorithm finds buyers better than humans
- Creative fatigue hits at ~21 days or frequency >3 — must refresh
- Learning phase needs 50+ conversions per ad set, minimum 7 days — never edit during learning
- Scale winners by 20% every 3 days, never more than 30% at once
- New ads CAN be added without resetting learning phase (Meta 2025 change)
- Max 150 ads per campaign, 50 per ad set
- DTC health/wellness benchmarks: 2.5-4x ROAS, $8-15 CPA typical
- Hook in first 2 seconds = everything. That's what stops the scroll.
- Budget rule: weekly spend should be 50x target CPA for reliable learning

TIKTOK GMV MAX PRINCIPLES (applied to Meta):
- Creative volume is THE most critical factor — more videos = better algorithm performance
- Set ROI target and trust the algorithm — don't micro-manage
- Unified content pool: all videos (brand, creator, uploaded) feed the same campaign
- Auto-scale winners, auto-pause losers — system should self-optimize
- Always-on > campaign bursts — continuous optimization beats start/stop
- The algorithm is data-hungry: feed it diverse hooks, formats, and angles`;

// ═══ CAi DEEP DIVE — Personalized brand analysis that builds trust ═══
// This is the "sell" — before asking for money, prove we know their business
app.post('/api/cai/deep-dive', authBrand, requireRole('editor'), async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  if (!brandId) return res.status(400).json({ error: 'brandId required' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI not configured' });

  // Gather ALL content — auto-fetch if cache empty (try multiple handle variations)
  let tiktokVideos = brand.tiktokVideosCache || [];
  if (tiktokVideos.length === 0) {
    deriveTikTokStorePageUrl(brand);
    const brandNameForHandle = (brand.brandName || brand.storeName || '').toLowerCase();
    const storeHandle = brand.tikTokStorePageUrl?.match(/@([^/?]+)/)?.[1] || '';
    const shopHandle = brand.tikTokShopUrl?.match(/\/shop\/store\/([^/]+)/)?.[1]?.replace(/-/g, '') || '';
    const shortName = brandNameForHandle.replace(/[^a-z0-9]/g, '');
    const firstName = brandNameForHandle.split(/\s+/)[0].replace(/[^a-z0-9]/g, '') || shortName;
    const handleVariations = [
      storeHandle,
      shopHandle,
      shortName,
      firstName,
      shortName + 'official',
      firstName + 'official',
    ].filter((h, i, a) => h && h.length > 1 && a.indexOf(h) === i);

    const sk = process.env.SCRAPE_KEY;
    if (sk) {
      for (const tryHandle of handleVariations) {
        try {
          console.log('[deep-dive] Trying handle @' + tryHandle + ' for ' + (brand.brandName || brand.storeName));
          const ttResp = await fetch('https://api.scrapecreators.com/v2/tiktok/user/videos?username=' + tryHandle + '&count=30', { headers: { 'x-api-key': sk } });
          if (ttResp.ok) {
            const ttData = await ttResp.json();
            const videos = ttData.videos || ttData.aweme_list || ttData.data || [];
            if (videos.length > 0) {
              console.log('[deep-dive] Found ' + videos.length + ' videos for @' + tryHandle);
              if (tryHandle !== storeHandle) {
                brand.tikTokStorePageUrl = 'https://www.tiktok.com/@' + tryHandle;
                console.log('[deep-dive] Updated tikTokStorePageUrl to @' + tryHandle);
              }
              tiktokVideos = videos.map(v => {
                const st = v.statistics || v.stats || {};
                const dl = v.video?.download_addr?.url_list || [];
                const pl = v.video?.play_addr?.url_list || [];
                return {
                  id: v.aweme_id || v.id,
                  desc: v.desc || '',
                  views: st.play_count || st.playCount || 0,
                  likes: st.digg_count || st.diggCount || 0,
                  shares: st.share_count || st.shareCount || 0,
                  comments: st.comment_count || st.commentCount || 0,
                  cover: v.video?.cover?.url_list?.[0] || v.video?.origin_cover?.url_list?.[0] || '',
                  downloadUrl: dl[0] || '',
                  playUrl: pl[0] || '',
                  authorHandle: v.author?.unique_id || tryHandle,
                  createTime: v.create_time || 0,
                  _source: 'brand',
                  video: v.video,
                };
              });
              brand.tiktokVideosCache = tiktokVideos;
              brand.tiktokVideosCachedAt = new Date().toISOString();
              brand.tiktokVideosCacheVersion = 2;
              await saveBrand(brand);
              break;
            } else {
              console.log('[deep-dive] @' + tryHandle + ' returned 0 videos');
            }
          } else {
            console.log('[deep-dive] @' + tryHandle + ' returned status ' + ttResp.status);
          }
        } catch (e) {
          console.log('[deep-dive] @' + tryHandle + ' error: ' + e.message);
        }
      }
      if (tiktokVideos.length === 0) {
        console.log('[deep-dive] No videos found for any handle variation: ' + handleVariations.join(', '));
      }
    }
  }
  const uploadedVideos = (brand.uploads || []).filter(u => u.videoUrl);

  // Build brand handles set early so we can filter affiliate videos
  const sk = process.env.SCRAPECREATORS_API_KEY || process.env.SCRAPE_KEY;
  const handleForBrand = brand.tikTokStorePageUrl?.match(/@([^/?]+)/)?.[1] || (brand.brandName || brand.storeName || '').toLowerCase().replace(/\s+/g, '');
  const normalizeHandleEarly = s => (s || '').toLowerCase().replace(/^@/, '').replace(/[\s_\-.]/g, '');
  const brandHandlesForCreator = new Set([
    normalizeHandleEarly(handleForBrand),
    normalizeHandleEarly(brand.storeName),
    normalizeHandleEarly(brand.brandName),
    normalizeHandleEarly(brand.enrichedShop?.shopName),
  ].filter(Boolean));

  // --- Fetch CREATOR videos via product affiliate videos ---
  let affiliateCreatorVideos = [];
  if (sk && brand.enrichedShop?.products?.length > 0) {
    try {
      const topProds = (brand.enrichedShop.products || []).slice(0, 3).filter(p => p.url || p.seo_url?.canonical_url);
      const productResults = await Promise.all(topProds.map(async (prod) => {
        const prodUrl = prod.url || prod.seo_url?.canonical_url;
        try {
          const pvResp = await fetch('https://api.scrapecreators.com/v1/tiktok/product?url=' + encodeURIComponent(prodUrl) + '&get_related_videos=true&region=US', {
            headers: { 'x-api-key': sk }
          });
          if (pvResp.ok) return pvResp.json();
        } catch (pvErr) { console.error('[cai-deep-dive] Product video fetch error:', pvErr.message); }
        return null;
      }));
      for (const pvData of productResults) {
        if (!pvData) continue;
        const relatedVids = pvData.related_videos || pvData.videos || [];
        for (const rv of relatedVids) {
          const rvAuthor = rv.author?.unique_id || rv.author?.uniqueId || '';
          const normRvAuthor = normalizeHandleEarly(rvAuthor);
          if (brandHandlesForCreator.has(normRvAuthor)) continue;
          const rvId = rv.aweme_id || rv.id || '';
          if (!rvId || affiliateCreatorVideos.some(v => v.id === rvId)) continue;
          const rvStats = rv.statistics || rv.stats || {};
          affiliateCreatorVideos.push({
            id: rvId,
            desc: (rv.desc || '').slice(0, 300),
            cover: rv.video?.cover?.url_list?.[0] || rv.video?.origin_cover?.url_list?.[0] || '',
            playUrl: rv.video?.play_addr?.url_list?.[0] || '',
            downloadUrl: rv.video?.download_addr?.url_list?.[0] || '',
            views: rvStats.play_count || rv.play_count || 0,
            likes: rvStats.digg_count || rv.digg_count || 0,
            shares: rvStats.share_count || rv.share_count || 0,
            comments: rvStats.comment_count || 0,
            authorHandle: rvAuthor,
            _source: 'creator_affiliate'
          });
        }
      }
      console.log('[cai-deep-dive] Found ' + affiliateCreatorVideos.length + ' affiliate creator videos');
    } catch (e) { console.error('[cai-deep-dive] Affiliate video fetch failed:', e.message); }
  }

  const allVideos = [
    ...tiktokVideos.map(v => ({
      id: v.id, desc: (v.desc || '').slice(0, 200), views: v.views || 0, likes: v.likes || 0,
      shares: v.shares || 0, comments: v.comments || 0, authorHandle: v.authorHandle || '',
      duration: v.duration || 0, _source: 'tiktok',
    })),
    ...affiliateCreatorVideos.map(v => ({
      id: v.id, desc: (v.desc || '').slice(0, 200), views: v.views || 0, likes: v.likes || 0,
      shares: v.shares || 0, comments: v.comments || 0, authorHandle: v.authorHandle || '',
      duration: 0, _source: 'creator_affiliate',
    })),
    ...uploadedVideos.map(u => ({
      id: u.id, desc: (u.title || '').slice(0, 200), views: 0, likes: 0,
      shares: 0, comments: 0, authorHandle: u.creatorHandle || '', _source: 'upload',
    })),
  ];

  // Compute brand context
  const brandName = brand.brandName || brand.storeName || '';
  const handle = brand.tikTokStorePageUrl?.match(/@([^/?]+)/)?.[1] || brandName.toLowerCase().replace(/\s+/g, '');
  const website = brand.websiteUrl || brand.storeUrl || '';
  const price = brand.avgProductPrice || 0;
  const totalViews = tiktokVideos.reduce((s, v) => s + (v.views || 0), 0);
  const totalLikes = tiktokVideos.reduce((s, v) => s + (v.likes || 0), 0);
  const totalShares = tiktokVideos.reduce((s, v) => s + (v.shares || 0), 0);
  const avgEngRate = totalViews > 0 ? ((totalLikes / totalViews) * 100).toFixed(2) : 0;
  const topVideo = tiktokVideos.sort((a, b) => (b.views || 0) - (a.views || 0))[0];

  // Split owned vs creator content (normalize handles: display names vs @handles)
  const normalizeHandle = s => (s || '').toLowerCase().replace(/^@/, '').replace(/[\s_\-.]/g, '');
  const brandHandles = new Set([
    normalizeHandle(handle),
    normalizeHandle(brand.storeName),
    normalizeHandle(brand.brandName),
    normalizeHandle(brand.enrichedShop?.shopName),
  ].filter(Boolean));
  const ownedVideos = allVideos.filter(v => {
    const h = normalizeHandle(v.authorHandle);
    return !h || brandHandles.has(h) || v._source === 'upload';
  });
  const creatorVideos = allVideos.filter(v => {
    const h = normalizeHandle(v.authorHandle);
    return h && !brandHandles.has(h) && v._source !== 'upload';
  });

  const videoSummaries = allVideos.sort((a, b) => b.views - a.views).slice(0, 12);

  // ═══ Calculate data-driven estimates ═══
  const shopData = brand.enrichedShop || {};
  const avgPrice = parseFloat(shopData.avgPrice || shopData.products?.[0]?.price || '30') || 30;
  let detectedCategory = 'default';
  const shopText = (JSON.stringify(shopData) + ' ' + (brand.brandDescription || '') + ' ' + (brand.brandName || '')).toLowerCase();
  if (shopText.match(/breath|nasal|sinus|allergy|health|wellness|medical/)) detectedCategory = 'health_wellness';
  else if (shopText.match(/skin|beauty|serum|moistur|makeup|cosmetic/)) detectedCategory = 'beauty_skincare';
  else if (shopText.match(/supplement|vitamin|protein|nutrition|probiotic/)) detectedCategory = 'supplements_nutrition';
  else if (shopText.match(/fitness|gym|sport|workout|exercise|athletic/)) detectedCategory = 'fitness_sports';
  else if (shopText.match(/fashion|apparel|clothing|dress|shirt|wear/)) detectedCategory = 'fashion_apparel';
  else if (shopText.match(/home|kitchen|house|decor|furniture|clean/)) detectedCategory = 'home_kitchen';
  else if (shopText.match(/pet|dog|cat|animal/)) detectedCategory = 'pet';
  else if (shopText.match(/tech|gadget|electronic|device|phone|computer/)) detectedCategory = 'tech_gadgets';
  const contentScoreData = calculateContentScore(allVideos, brand);
  const estimates = generateEstimates(brand, allVideos, detectedCategory);

  // If no videos found, include enriched shop product data so Claude still has something to analyze
  const shopProducts = brand.enrichedShop?.products || brand.shopProductsCache || [];
  const shopProductSummary = shopProducts.length > 0
    ? 'SHOP PRODUCTS (' + shopProducts.length + '): ' + JSON.stringify(shopProducts.slice(0, 10).map(p => ({ title: p.title, price: p.price, sold: p.sold || p.formatSold || 0, rating: p.rating })))
    : '';

  const prompt = `You are CAi, Creatorship's AI. Write directly TO the brand owner like a founder who just reviewed their data. Be specific — reference actual videos, view counts, content styles. Short punchy sentences. No corporate speak. Use "you/your".

CRITICAL RULES:
- DO NOT claim "zero paid amplification" or "no paid ads" — you don't know their ad spend history.
- DO NOT say "top 5" or "pick the best 5" — the strategy is to test ALL content (50-500 videos). Meta's algorithm finds winners you'd never predict.
- DO focus on: their TikTok content is PROVEN to convert, and Meta Ads lets them amplify that to a massive new audience.
- DO mention that Creatorship handles the entire pipeline: creator outreach, content licensing, video formatting, campaign setup, and optimization.
- USE the pre-calculated contentScore, estimatedCpa, and estimatedRoas provided below. Do NOT override them with your own guesses. These are data-driven based on real industry benchmarks.
- The estimatedRoas is FIRST-PURCHASE ROAS, not LTV. For subscription brands, the ltvRoas shows the 6-month picture.
- If this is a subscription product, explain that CPA looks high relative to AOV but LTV makes it profitable.
- If VIDEOS count is 0, focus the analysis on the product catalog and creator acquisition strategy. Don't pretend there are videos — explain that the brand needs to either create content or license creator content through Creatorship.
- Even with 0 brand-owned videos, there may be creators already making content about this product on TikTok. Recommend the creator outreach path.

${CAI_KNOWLEDGE}

BRAND: ${brandName} | @${handle} | $${price}
VIDEOS: ${allVideos.length} (${ownedVideos.length} owned, ${creatorVideos.length} creator) | ${totalViews.toLocaleString()} views | ${totalShares.toLocaleString()} shares
${shopProductSummary ? shopProductSummary + '\n' : ''}
${brand.enrichedShop ? 'SHOP: ' + (brand.enrichedShop.shopRating || '?') + ' rating · ' + (brand.enrichedShop.soldCount || '?') + ' sold' : ''}
CATEGORY: ${detectedCategory.replace(/_/g, ' ')} | AVG PRICE: $${avgPrice} | MODEL: ${estimates.businessModel}
CONTENT SCORE (calculated): ${contentScoreData.score}/100 — ${JSON.stringify(contentScoreData.breakdown)}
ESTIMATES (calculated): CPA $${estimates.cpa.low}-${estimates.cpa.high} | First-purchase ROAS ${estimates.firstPurchaseRoas.low}-${estimates.firstPurchaseRoas.high}x | LTV ROAS ${estimates.ltvRoas.low}-${estimates.ltvRoas.high}x (${estimates.ltvRoas.months})
METHODOLOGY: ${estimates.methodology}
${brand.caiBrief ? 'NOTES: ' + brand.caiBrief : ''}
OWNED (${ownedVideos.length} videos): ${JSON.stringify(ownedVideos.sort((a, b) => b.views - a.views).slice(0, 15).map(v => ({ id: v.id, desc: (v.desc || '').slice(0, 150), views: v.views, likes: v.likes, shares: v.shares, authorHandle: v.authorHandle })))}
${creatorVideos.length > 0 ? 'CREATOR (' + creatorVideos.length + ' videos): ' + JSON.stringify(creatorVideos.sort((a, b) => b.views - a.views).slice(0, 10).map(v => ({ id: v.id, desc: (v.desc || '').slice(0, 150), views: v.views, likes: v.likes, shares: v.shares, authorHandle: v.authorHandle }))) : 'NO CREATOR CONTENT FOUND YET. Creatorship will handle creator outreach and licensing.'}

Return ONLY valid JSON. Keep ALL text fields to 1-2 sentences. Be specific to THIS brand.
{
  "verdict": "3-4 sentences TO the brand. Start with their name. What you see, why Meta NOW, why Creatorship makes it easy.",
  "contentScore": ${contentScoreData.score},
  "contentScoreBreakdown": ${JSON.stringify(contentScoreData.breakdown)},
  "estimatedCpa": ${estimates.cpa.mid},
  "estimatedCpaRange": { "low": ${estimates.cpa.low}, "high": ${estimates.cpa.high} },
  "estimatedRoas": ${estimates.firstPurchaseRoas.mid},
  "estimatedRoasRange": { "low": ${estimates.firstPurchaseRoas.low}, "high": ${estimates.firstPurchaseRoas.high} },
  "contentScoreReasoning": "1-2 sentences. Why this brand scored at the contentScore above — cite specific numbers: video count, total views, engagement rate, share rate, recency",
  "estimatedRoasReasoning": "1-2 sentences. Why ROAS is estimated at estimatedRoas — cite AOV, product price, content quality signals, comparable DTC benchmarks",
  "estimatedCpaReasoning": "1-2 sentences. Why CPA is estimated at estimatedCpa — cite product price point, funnel assumptions, content engagement signals",
  "tiktokReachReasoning": "1-2 sentences. Why this reach number matters — cite total views, growth trajectory, viral hits",
  "ltvRoas": { "low": ${estimates.ltvRoas.low}, "high": ${estimates.ltvRoas.high}, "period": "${estimates.ltvRoas.months}" },
  "businessModel": "${estimates.businessModel}",
  "category": "${detectedCategory}",
  "estimateMethodology": "${(estimates.methodology || '').replace(/"/g, '\\\\"')}",
  "totalViews": ${totalViews},
  "brandIntelligence": {
    "productInsight": "2 sentences. What is this product and why does it sell on camera?",
    "marketPosition": "1 sentence. Position vs competition.",
    "dataPulled": ["4-5 specific numbers"],
    "buyerProfile": "1 sentence. Who buys and why."
  },
  "adStrategy": {
    "headline": "1 sentence. What CAi will do with their content on Meta.",
    "approach": "2 sentences. Campaign strategy for THIS product.",
    "vsGmvMax": "1 sentence. Same videos that convert on TikTok will convert on Meta.",
    "expectedTimeline": "1 sentence. Week 1-2 learning, Month 1 results.",
    "projectedResults": {"dailyBudget":number,"monthlySales":number,"monthlyRevenue":number,"roas":number}
  },
  "ownedContentAnalysis": [{"videoId":"match IDs above","headline":"5-8 words","whyItWorks":"1 sentence","adPotential":"high|medium|low","recommendation":"Run as hero|Test $20/day|Retargeting","metrics":"key stat"}],
  ${creatorVideos.length > 0 ? '"creatorContentAnalysis": [{"videoId":"str","creatorHandle":"str","headline":"5-8 words","whyItWorks":"1 sentence","adPotential":"high|medium|low","recommendation":"License|Reach out"}],' : '"creatorContentAnalysis": [],'}
  "creatorAcquisition": {
    "currentState": "1 sentence. Creator vs brand video count.",
    "creatorship_value": "2 sentences. We reach out, get licensing, run as Meta ads. You do nothing.",
    "top_targets": ["2-3 specific creator types for this product"],
    "revenue_unlock": "1 sentence. What 5-10 more creator videos does to ROAS."
  },
  "topPicks": [{"videoId":"str","tier":"hero|proven|test","hookDescription":"10 words","whyShort":"1 sentence","dailyBudget":number,"estimatedCpa":number,"estimatedRoas":number,"adCopy":{"primaryText":"max 200 chars, hook-first","headline":"under 40 chars"}}],
  "totalDailyBudget": number,
  "monthlyBudget": number,
  "recommendedMode": "auto|manual",
  "modeReason": "1 sentence."
}
Include your top 15 videos in topPicks, ranked by ad potential. hero = strongest hook for Meta ads. proven = solid content. test = worth trying at $20/day. Focus on the videos most likely to convert — quality over quantity.`;

  try {
    // Send headers immediately so Railway doesn't timeout waiting for first byte
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 6000, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(90000), // 90s timeout
    });
    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error('[cai-deep-dive] API error:', aiResp.status, errText.slice(0, 300));
      return res.end(JSON.stringify({ error: 'AI returned status ' + aiResp.status + '. Try again.' }));
    }
    const data = await aiResp.json();
    const text = (data.content || []).map(b => b.text || '').join('');
    if (!text || text.length < 50) {
      console.error('[cai-deep-dive] Empty/short response:', text.slice(0, 100));
      return res.end(JSON.stringify({ error: 'AI returned empty response. Try again.' }));
    }
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let analysis;
    try { analysis = JSON.parse(cleaned); } catch (pe) {
      // Try to extract JSON from response if there's text before/after
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { analysis = JSON.parse(jsonMatch[0]); } catch (_) {}
      }
      if (!analysis) {
        console.error('[cai-deep-dive] Parse error:', pe.message, cleaned.slice(0, 300));
        return res.end(JSON.stringify({ error: 'AI response was not valid JSON. Try again.' }));
      }
    }

    // Merge in our pre-calculated estimates so frontend always has them
    Object.assign(analysis, {
      contentScore: contentScoreData.score,
      contentScoreBreakdown: contentScoreData.breakdown,
      estimatedCpa: estimates.cpa.mid,
      estimatedCpaRange: { low: estimates.cpa.low, high: estimates.cpa.high },
      estimatedRoas: estimates.firstPurchaseRoas.mid,
      estimatedRoasRange: { low: estimates.firstPurchaseRoas.low, high: estimates.firstPurchaseRoas.high },
      ltvRoas: estimates.ltvRoas,
      businessModel: estimates.businessModel,
      category: detectedCategory,
      estimateMethodology: estimates.methodology,
      contentScoreReasoning: analysis.contentScoreReasoning || null,
      estimatedRoasReasoning: analysis.estimatedRoasReasoning || null,
      estimatedCpaReasoning: analysis.estimatedCpaReasoning || null,
      tiktokReachReasoning: analysis.tiktokReachReasoning || null,
    });

    // Save analysis to brand
    brand.caiDeepDive = {
      analysis,
      generatedAt: new Date().toISOString(),
      videosAnalyzed: allVideos.length,
      version: CAI_VERSION,
    };
    await saveBrand(brand);

    res.end(JSON.stringify({
      success: true,
      analysis,
      meta: {
        videosAnalyzed: allVideos.length,
        totalViews,
        avgEngRate,
        generatedAt: brand.caiDeepDive.generatedAt,
        version: CAI_VERSION,
        knowledgeSources: ['Meta Q2 2025 Earnings', 'Billo Creative Research 2025', 'TikTok GMV Max', 'DTC agency benchmarks ($30M+/yr)'],
      },
    }));
  } catch (e) {
    const isTimeout = e.name === 'AbortError' || e.name === 'TimeoutError' || e.message?.includes('timeout');
    console.error('[cai-deep-dive]', isTimeout ? 'TIMEOUT' : e.message);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: isTimeout ? 'Analysis took too long. Try again — it usually works on second attempt.' : (e.message || 'Unknown error — check server logs') }));
  }
});

// ═══ MIGRATION HELPER: Normalize old single-campaign format to multi-campaign ═══
function getCaiCampaigns(brand) {
  const cai = brand?.cai;
  if (!cai) return [];
  if (cai.version === 2 && Array.isArray(cai.campaigns)) return cai.campaigns;
  if (cai.campaign?.id) {
    return [{
      localId: 'cai_legacy_' + cai.campaign.id,
      metaCampaignId: cai.campaign.id,
      metaAdsetId: cai.campaign.adsetId,
      type: 'always-on',
      name: '[CAi] ' + (brand.brandName || 'Brand') + ' — Always On',
      status: cai.isActive ? 'active' : 'paused',
      budget: { type: 'monthly', amount: cai.monthlyBudget || 0 },
      roasTarget: cai.roasTarget || 3,
      creatives: cai.creatives || [],
      activityLog: cai.activityLog || [],
      debugLog: cai.debugLog || [],
      generationId: cai.generationId || null,
      createdAt: cai.campaign.createdAt || cai.activatedAt || new Date().toISOString(),
      activatedAt: cai.activatedAt || null,
      startDate: null, endDate: null, promoDetails: null,
    }];
  }
  return [];
}

function getPrimaryCampaign(brand) {
  const camps = getCaiCampaigns(brand);
  return camps.find(c => c.type === 'always-on') || camps[0] || null;
}

function getCampaignByLocalId(brand, localId) {
  return getCaiCampaigns(brand).find(c => c.localId === localId) || null;
}

function saveCaiCampaigns(brand, campaigns) {
  if (!brand.cai) brand.cai = {};
  brand.cai.version = 2;
  brand.cai.campaigns = campaigns;
  const primary = campaigns.find(c => c.type === 'always-on') || campaigns[0];
  if (primary) {
    brand.cai.isActive = primary.status === 'active';
    brand.cai.campaign = { id: primary.metaCampaignId, adsetId: primary.metaAdsetId, createdAt: primary.createdAt, objective: 'OUTCOME_SALES' };
    brand.cai.creatives = primary.creatives;
    brand.cai.monthlyBudget = primary.budget?.amount || 0;
    brand.cai.roasTarget = primary.roasTarget || 3;
    brand.cai.activatedAt = primary.activatedAt;
    brand.cai.activityLog = primary.activityLog;
    brand.cai.debugLog = primary.debugLog;
    brand.cai.generationId = primary.generationId;
    brand.cai.processingStatus = primary.processingStatus;
    brand.cai.processingProgress = primary.processingProgress;
  }
}

// Activate CAi — brand sets budget + ROAS target, CAi builds everything
app.post('/api/cai/activate', authBrand, requireRole('editor'), async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  if (!brandId) return res.status(400).json({ error: 'brandId required' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  if (brand.billingSuspended) return res.status(403).json({ error: 'Billing suspended — update your payment method at Account → Billing to reactivate', suspended: true, reason: brand.billingSuspendReason });
  if (brand.isBadActor) return res.status(403).json({ error: 'Account suspended — contact support@creatorship.app', suspended: true });
  // Billing gate: after 3 free launches, require Stripe
  const launchCount = brand.launchCount || 0;
  const hasStripe = !!(brand.stripeCustomerId || brand.billingEnabled);
  if (launchCount >= 3 && !hasStripe) return res.status(403).json({ error: 'Connect billing to continue. You have used all 3 free launches.', needsBilling: true });

  const monthlyBudget = Math.max(Number(req.body.monthlyBudget) || 300, 30);
  const roasTarget = Math.max(Number(req.body.roasTarget) || 3.0, 1.0);
  console.log('[cai-activate] Budget: $' + monthlyBudget + '/mo ($' + Math.round(monthlyBudget/30) + '/day), ROAS target: ' + roasTarget + 'x, brandId: ' + brandId);
  let metaToken;
  try { metaToken = getValidMetaToken(brand); }
  catch (tokenErr) { return res.status(400).json({ error: tokenErr.message, metaExpired: true }); }
  const adAccount = brand.adAccount;
  const pageId = brand.pageId;

  // ═══ ADJUST ONLY — update budget without re-creating campaign ═══
  if (req.body.adjustOnly && brand.cai?.campaign?.id) {
    const dailyBudget = Math.round(monthlyBudget / 30);
    try {
      await metaPost(brand.cai.campaign.id, { daily_budget: dailyBudget * 100, access_token: metaToken });
      brand.cai.monthlyBudget = monthlyBudget;
      brand.cai.roasTarget = roasTarget;
      brand.cai.dailyBudget = dailyBudget;
      await saveBrand(brand);
      console.log('[cai-adjust] Budget updated to $' + monthlyBudget + '/mo for brand ' + brandId);
      return res.json({ ok: true, monthlyBudget, dailyBudget, roasTarget });
    } catch (err) {
      console.error('[cai-adjust] Failed:', err.message);
      return res.status(500).json({ error: 'Failed to update Meta budget: ' + err.message });
    }
  }

  if (!metaToken || !adAccount) return res.status(400).json({ error: 'Connect Meta Ads in Settings first' });
  if (!pageId) return res.status(400).json({ error: 'Select a Meta Page in Settings first' });

  // ═══ RECONNECTION: Check if Meta already has a [CAi] campaign for this brand ═══
  let campaignId = brand.cai?.campaign?.id || brand.cai?.campaign?.metaCampaignId || null;
  let adsetId = brand.cai?.campaign?.adsetId || null;
  let reusingCampaign = false;
  if (!campaignId) {
    try {
      const filtering = encodeURIComponent(JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: '[CAi]' }]));
      const existingCamps = await apiFetch(`https://graph.facebook.com/v22.0/${adAccount}/campaigns?fields=id,name,status&filtering=${filtering}&limit=10&access_token=${metaToken}`);
      const found = (existingCamps.data || []).find(c => c.status === 'ACTIVE' || c.status === 'PAUSED');
      if (found) {
        campaignId = found.id;
        try {
          const asResp = await apiFetch(`https://graph.facebook.com/v22.0/${found.id}/adsets?fields=id,name,status&limit=1&access_token=${metaToken}`);
          adsetId = asResp.data?.[0]?.id || null;
        } catch (_) {}
        console.log('[cai-activate] Reconnecting to existing campaign:', campaignId, 'adset:', adsetId);
      }
    } catch (e) { console.error('[cai-activate] Reconnection check failed:', e.message); }
  }
  if (campaignId) {
    try {
      const existing = await apiFetch('https://graph.facebook.com/v22.0/' + campaignId + '?fields=id,status,effective_status&access_token=' + metaToken);
      if (existing && !existing.error && existing.effective_status !== 'DELETED') {
        console.log('[cai-activate] Reusing existing campaign ' + campaignId + ' (status: ' + existing.effective_status + ')');
        reusingCampaign = true;
        if (existing.effective_status !== 'PAUSED') {
          await metaPost(campaignId, { status: 'PAUSED', access_token: metaToken });
        }
      } else {
        console.log('[cai-activate] Existing campaign ' + campaignId + ' is deleted/invalid — will create new');
        campaignId = null;
        adsetId = null;
      }
    } catch (e) {
      console.log('[cai-activate] Could not verify campaign ' + campaignId + ': ' + e.message + ' — will create new');
      campaignId = null;
      adsetId = null;
    }
  }

  const dailyBudget = Math.round(monthlyBudget / 30);
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Gather ALL content — TikTok videos + uploads (auto-fetch if cache empty; try multiple handle variations)
  let ttVids = brand.tiktokVideosCache || [];
  if (ttVids.length === 0) {
    deriveTikTokStorePageUrl(brand);
    const brandNameForHandle = (brand.brandName || brand.storeName || '').toLowerCase();
    const storeHandle = brand.tikTokStorePageUrl?.match(/@([^/?]+)/)?.[1] || '';
    const shopHandle = brand.tikTokShopUrl?.match(/\/shop\/store\/([^/]+)/)?.[1]?.replace(/-/g, '') || '';
    const shortName = brandNameForHandle.replace(/[^a-z0-9]/g, '');
    const firstName = brandNameForHandle.split(/\s+/)[0].replace(/[^a-z0-9]/g, '') || shortName;
    const handleVariations = [
      storeHandle,
      shopHandle,
      shortName,
      firstName,
      shortName + 'official',
      firstName + 'official',
    ].filter((h, i, a) => h && h.length > 1 && a.indexOf(h) === i);

    const sk = process.env.SCRAPE_KEY;
    if (sk) {
      for (const tryHandle of handleVariations) {
        try {
          console.log('[cai-activate] Trying handle @' + tryHandle + ' for ' + (brand.brandName || brand.storeName));
          const ttResp = await fetch('https://api.scrapecreators.com/v2/tiktok/user/videos?username=' + tryHandle + '&count=30', { headers: { 'x-api-key': sk } });
          if (ttResp.ok) {
            const ttData = await ttResp.json();
            const videos = ttData.videos || ttData.aweme_list || ttData.data || [];
            if (videos.length > 0) {
              console.log('[cai-activate] Found ' + videos.length + ' videos for @' + tryHandle);
              if (tryHandle !== storeHandle) {
                brand.tikTokStorePageUrl = 'https://www.tiktok.com/@' + tryHandle;
                console.log('[cai-activate] Updated tikTokStorePageUrl to @' + tryHandle);
              }
              ttVids = videos.map(v => {
                const st = v.statistics || v.stats || {};
                const dl = v.video?.download_addr?.url_list || [];
                const pl = v.video?.play_addr?.url_list || [];
                return {
                  id: v.aweme_id || v.id,
                  desc: (v.desc || '').slice(0, 300),
                  views: st.play_count || st.playCount || 0,
                  likes: st.digg_count || st.diggCount || 0,
                  shares: st.share_count || st.shareCount || 0,
                  comments: st.comment_count || st.commentCount || 0,
                  cover: v.video?.cover?.url_list?.[0] || v.video?.origin_cover?.url_list?.[0] || '',
                  downloadUrl: dl[0] || '',
                  playUrl: pl[0] || '',
                  authorHandle: v.author?.unique_id || tryHandle,
                  createTime: v.create_time || 0,
                };
              });
              brand.tiktokVideosCache = ttVids;
              brand.tiktokVideosCachedAt = new Date().toISOString();
              brand.tiktokVideosCacheVersion = 2;
              await saveBrand(brand);
              break;
            } else {
              console.log('[cai-activate] @' + tryHandle + ' returned 0 videos');
            }
          } else {
            console.log('[cai-activate] @' + tryHandle + ' returned status ' + ttResp.status);
          }
        } catch (e) {
          console.log('[cai-activate] @' + tryHandle + ' error: ' + e.message);
        }
      }
      if (ttVids.length === 0) {
        console.log('[cai-activate] No videos found for any handle variation: ' + handleVariations.join(', '));
      }
    }
  }
  const allVideos = [
    ...ttVids.map(v => ({ ...v, _source: 'tiktok' })),
    ...(brand.uploads || []).filter(u => u.videoUrl).map(u => ({
      id: u.id, desc: u.title || '', views: 0, likes: 0, shares: 0,
      authorHandle: u.creatorHandle || '', cover: '', downloadUrl: u.videoUrl,
      _source: 'upload',
    })),
  ];

  if (allVideos.length === 0) return res.status(400).json({ error: 'No videos found. Load your TikTok content first.' });

  // CAi analyzes and picks the best videos
  let topPicks = [];
  if (apiKey && allVideos.length > 0) {
    const videoSummaries = allVideos.sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 20).map(v => ({
      id: v.id, desc: (v.desc || '').slice(0, 150), views: v.views || 0, likes: v.likes || 0,
      shares: v.shares || 0, authorHandle: v.authorHandle || '', source: v._source || 'tiktok',
    }));

    const pickPrompt = `You are CAi. A brand is activating always-on Meta advertising. Rank ALL ${allVideos.length} videos for Meta ad testing. Every video gets loaded — Meta's CBO algorithm decides winners, not us. TikTok views do NOT predict Meta ad performance (different algorithm, different audience, different intent). A "flop" on TikTok might be a top Meta converter.

For each video, assign:
- tier: "hero" (strong hook + high engagement), "proven" (solid metrics), or "test" (lower stats but worth testing — diverse angle, different audience segment, unique hook)
- hookDescription: 10-word description of the opening hook
- whyShort: 1 sentence on why this could work as a Meta ad
- dailyBudget: suggested starting daily budget ($5-50 based on tier)
- estimatedRoas and estimatedCpa: rough projections

CRITICAL: Include EVERY video. Do not narrow down. Meta needs volume (20-500 creatives) to optimize. The brand's job is to feed the algorithm options, not guess winners.

Videos:
${allVideos.map((v, i) => i + 1 + '. ID:' + v.id + ' views:' + (v.views||0) + ' likes:' + (v.likes||0) + ' shares:' + (v.shares||0) + ' desc:' + (v.desc||'').slice(0, 60)).join('\n')}
`;

    const pickPromptJson = `
${CAI_KNOWLEDGE}

BRAND: ${brand.brandName || brand.storeName || ''}
PRODUCT PRICE: $${brand.avgProductPrice || 30}
MONTHLY BUDGET: $${monthlyBudget}/mo ($${dailyBudget}/day)
ROAS TARGET: ${roasTarget}x
${brand.caiBrief ? 'BRAND BRIEF: ' + brand.caiBrief : ''}

Return ONLY valid JSON array. Include ALL ${allVideos.length} videos. Every video gets a tier and analysis.
[{
  "videoId": "string",
  "dailyBudget": number,
  "primaryText": "string",
  "headline": "string",
  "hookReason": "string",
  "hookScore": number 50-99,
  "tier": "hero|proven|test"
}]`;

    try {
      const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 8000, messages: [{ role: 'user', content: pickPrompt + '\n\n' + pickPromptJson }] }),
      });
      if (aiResp.ok) {
        const data = await aiResp.json();
        const text = (data.content || []).map(b => b.text || '').join('');
        const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        topPicks = JSON.parse(cleaned);
        if (!Array.isArray(topPicks)) topPicks = [];
      }
    } catch (e) { console.error('[cai-activate] AI pick error:', e.message); }
  }

  // Fallback: if AI failed, use ALL videos (volume-first)
  if (topPicks.length === 0) {
    topPicks = allVideos.sort((a, b) => (b.views || 0) - (a.views || 0)).map((v, i) => ({
      videoId: v.id,
      dailyBudget: i === 0 ? Math.round(dailyBudget * 0.4) : Math.round(dailyBudget * 0.3),
      primaryText: (v.desc || '').slice(0, 200) || 'Check this out',
      headline: (brand.brandName || 'Shop Now') + ' — Free Shipping',
      hookReason: 'High view count indicates strong hook',
      hookScore: 70,
      tier: i === 0 ? 'hero' : 'proven',
    }));
  }

  const steps = [];
  const ids = {};
  // Track self-healing events (metaPost logs to console, we'll capture context in steps)
  const originalConsoleLog = console.log;
  const healEvents = [];
  console.log = function(...args) {
    const msg = args.join(' ');
    if (msg.includes('[meta-self-heal]')) healEvents.push(msg.replace('[meta-self-heal] ', ''));
    originalConsoleLog.apply(console, args);
  };

  try {
    // Auto-fetch pixel if we don't have one
    let hasPixel = !!brand.metaPixelId;
    if (!hasPixel && adAccount) {
      try {
        const pixResp = await fetch('https://graph.facebook.com/v22.0/' + adAccount + '/adspixels?fields=id,name,is_unavailable&access_token=' + metaToken);
        const pixData = await pixResp.json();
        const pixels = (pixData.data || []).filter(p => !p.is_unavailable);
        if (pixels.length > 0) {
          brand.metaPixelId = pixels[0].id;
          hasPixel = true;
          await saveBrand(brand);
          console.log('[cai-activate] Auto-fetched pixel:', brand.metaPixelId);
          steps.push({ step: 'pixel_fetch', status: 'ok', pixelId: brand.metaPixelId });
        } else {
          console.log('[cai-activate] No pixel found — will use TRAFFIC objective');
          steps.push({ step: 'pixel_fetch', status: 'no_pixel', note: 'Falling back to TRAFFIC objective' });
        }
      } catch (pixErr) {
        console.log('[cai-activate] Pixel fetch failed:', pixErr.message);
      }
    }
    const campaignObjective = hasPixel ? 'OUTCOME_SALES' : 'OUTCOME_TRAFFIC';

    // Reuse existing campaign or create new one
    const campName = '[CAi] ' + (brand.brandName || brand.storeName || 'Brand') + ' — Always On';
    if (reusingCampaign && campaignId) {
      ids.campaign = campaignId;
      try { await metaPost(campaignId, { status: 'PAUSED', daily_budget: dailyBudget * 100, access_token: metaToken }); } catch (_) {}
      steps.push({ step: 'campaign', status: 'reconnected', id: ids.campaign, name: campName });
      console.log('[cai-activate] Reusing existing campaign:', ids.campaign);
    } else {
      const camp = await metaPost(adAccount + '/campaigns', {
        name: campName,
        objective: campaignObjective,
        status: 'PAUSED',
        special_ad_categories: [],
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        is_campaign_budget_optimization_on: true,
        daily_budget: dailyBudget * 100,
        access_token: metaToken,
      });
      ids.campaign = camp.id;
      steps.push({ step: 'campaign', status: 'ok', id: ids.campaign, name: campName });
      console.log('[cai-activate] Campaign created with objective:', campaignObjective, 'pixel:', hasPixel ? brand.metaPixelId : 'none');
    }

    // Reuse existing adset or create new one
    if (adsetId) {
      ids.adset = adsetId;
      steps.push({ step: 'adset', status: 'reconnected', id: ids.adset });
      console.log('[cai-activate] Reusing existing adset:', ids.adset);
    } else {
      const adsetParams = {
        name: '[CAi] Broad — Advantage+',
        campaign_id: ids.campaign,
        billing_event: 'IMPRESSIONS',
        optimization_goal: hasPixel ? 'OFFSITE_CONVERSIONS' : 'LINK_CLICKS',
        status: 'ACTIVE',
        targeting: JSON.stringify({
          geo_locations: { countries: ['US'] },
          age_min: 18,
          age_max: 65,
          targeting_automation: { advantage_audience: 1 },
        }),
        access_token: metaToken,
      };
      if (hasPixel) {
        adsetParams.promoted_object = JSON.stringify({ pixel_id: brand.metaPixelId, custom_event_type: 'PURCHASE' });
      }
      const aset = await metaPost(adAccount + '/adsets', adsetParams);
      ids.adset = aset.id;
      steps.push({ step: 'adset', status: 'ok', id: ids.adset });
    }

    // ═══ ARCHIVE OLD ADS — prevent duplicates across activations ═══
    if (brand.cai?.creatives && brand.cai.creatives.length > 0) {
      const oldAdIds = brand.cai.creatives.map(c => c.adId).filter(Boolean);
      if (oldAdIds.length > 0) {
        console.log('[cai-activate] Archiving ' + oldAdIds.length + ' old ads before creating new batch');
        for (const oldAdId of oldAdIds) {
          try {
            await metaPost(oldAdId, { status: 'ARCHIVED', access_token: metaToken });
          } catch (e) {
            console.log('[cai-activate] Could not archive ad ' + oldAdId + ': ' + e.message);
          }
        }
      }
    }
    // Also archive any orphaned ads in the ad set that Creatorship lost track of
    if (ids.adset) {
      try {
        const existingAds = await apiFetch('https://graph.facebook.com/v22.0/' + ids.adset + '/ads?fields=id,name,status&limit=100&access_token=' + metaToken);
        if (existingAds?.data?.length > 0) {
          const activeOldAds = existingAds.data.filter(ad => ad.status !== 'ARCHIVED' && ad.status !== 'DELETED');
          if (activeOldAds.length > 0) {
            console.log('[cai-activate] Found ' + activeOldAds.length + ' orphaned ads in ad set — archiving');
            for (const ad of activeOldAds) {
              try {
                await metaPost(ad.id, { status: 'ARCHIVED', access_token: metaToken });
              } catch (e) {
                console.log('[cai-activate] Could not archive orphan ad ' + ad.id + ': ' + e.message);
              }
            }
          }
        }
      } catch (e) {
        console.log('[cai-activate] Could not check for orphaned ads: ' + e.message);
      }
    }
    if (brand.cai) brand.cai.creatives = [];

    // Add each video as an ad — ASYNC (background, after response)
    const creatives = [];
    const websiteUrl = brand.websiteUrl || brand.storeUrl || '';
    const storeDomain = (brand.storeName || 'creatorship').toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
    const adLinkUrl = brand.websiteUrl || brand.storeUrl || brand.tikTokShopUrl || ('https://' + storeDomain);

    // ═══ PHASE 1: Save campaign shell + respond immediately ═══
    const generationId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    brand.cai = {
      isActive: true,
      generationId,
      monthlyBudget,
      roasTarget,
      activatedAt: new Date().toISOString(),
      campaign: {
        id: ids.campaign,
        adsetId: ids.adset,
        objective: campaignObjective,
        createdAt: new Date().toISOString(),
      },
      creatives: [],
      processingStatus: 'processing',
      processingProgress: { total: topPicks.length, done: 0, errors: 0 },
      performance: { totalSpend: 0, totalRevenue: 0, avgRoas: 0, avgCpa: 0, bestAd: null, worstAd: null, lastUpdated: null },
      activityLog: [{ type: 'activated', ts: new Date().toISOString(), msg: 'Campaign created, processing ' + topPicks.length + ' videos...' }],
    };
    brand.caiMonthlyBudget = monthlyBudget;
    brand.caiMinRoas = roasTarget;
    brand.launchCount = (brand.launchCount || 0) + 1;
    await saveBrand(brand);

    await auditLogAction('campaign_activated', brandId, { monthlyBudget, roasTarget, videosCount: topPicks.length });
    // Respond to client immediately — don't make them wait for video processing
    res.json({
      success: true,
      campaign: ids.campaign,
      adset: ids.adset,
      adsCreated: 0,
      totalPicked: topPicks.length,
      dailyBudget,
      roasTarget,
      processing: true,
      steps: healEvents.length > 0 ? [{ step: 'self_heal', fixes: healEvents }, ...steps] : steps,
    });
    console.log = originalConsoleLog;

    // ═══ PHASE 2: Process videos in background ═══
    (async () => {
      const debugLog = [];
      const dbg = (msg) => { debugLog.push({ t: Date.now(), m: msg }); console.log('[cai-activate-bg] ' + msg); };
      
      dbg('Starting for ' + topPicks.length + ' picks. Handle: ' + (brand.tikTokStorePageUrl || 'none'));
      dbg('topPicks IDs: ' + topPicks.map(p => p.videoId).join(', '));
      dbg('allVideos count: ' + allVideos.length + ', IDs: ' + allVideos.map(v => v.id).join(', '));
      
      let freshVideosMap = {};
      const handle = brand.tikTokStorePageUrl?.match(/@([^/?]+)/)?.[1] || brand.tikTokStorePageUrl?.match(/\/shop\/store\/([^/]+)/)?.[1] || (brand.storeName || brand.brandName || '').toLowerCase().replace(/\s+/g, '');
      const scrapeKey = process.env.SCRAPE_KEY;
      dbg('handle: ' + handle + ', scrapeKey: ' + (scrapeKey ? 'yes' : 'NO'));
      
      if (scrapeKey && handle) {
        try {
          const freshResp = await fetch(
            `https://api.scrapecreators.com/v1/tiktok/profile/videos?handle=${encodeURIComponent(handle)}&limit=30`,
            { headers: { 'x-api-key': scrapeKey } }
          );
          dbg('ScrapeCreators status: ' + freshResp.status);
          if (freshResp.ok) {
            const freshData = await freshResp.json();
            const rawVideos = freshData.aweme_list || freshData.data || freshData.videos || freshData.posts || [];
            dbg('ScrapeCreators returned ' + rawVideos.length + ' videos. Keys: ' + (rawVideos[0] ? Object.keys(rawVideos[0]).slice(0, 5).join(',') : 'empty'));
            for (const fv of rawVideos) {
              const fid = String(fv.aweme_id || fv.id);
              const freshPlayUrls = fv.video?.play_addr?.url_list || [];
              const freshDlUrls = fv.video?.download_addr?.url_list || [];
              // Prefer play_addr (clean); download_addr often has baked TikTok watermark.
              freshVideosMap[fid] = freshPlayUrls[0] || freshDlUrls[0] || '';
            }
            dbg('freshMap keys: ' + Object.keys(freshVideosMap).join(', '));
            dbg('freshMap sample URL: ' + (Object.values(freshVideosMap)[0] || 'EMPTY').slice(0, 60));
          } else {
            const errText = await freshResp.text();
            dbg('ScrapeCreators error: ' + errText.slice(0, 200));
          }
        } catch (scErr) {
          dbg('ScrapeCreators EXCEPTION: ' + scErr.message);
        }
      } else {
        dbg('SKIPPED ScrapeCreators: no key or handle');
      }

      // Fallback: if freshVideosMap is still empty and we have cached videos, try to re-fetch each video individually
      if (Object.keys(freshVideosMap).length === 0 && topPicks.length > 0) {
        dbg('freshVideosMap empty — attempting individual video re-fetch via ScrapeCreators video endpoint');
        const sk2 = scrapeKey;
        if (sk2) {
          for (const pick of topPicks) {
            const vid = allVideos.find(v => String(v.id) === String(pick.videoId));
            if (!vid || !vid.id) continue;
            try {
              const vidUrl = 'https://www.tiktok.com/@' + (handle || 'user') + '/video/' + vid.id;
              const vResp = await fetch('https://api.scrapecreators.com/v1/tiktok/video?url=' + encodeURIComponent(vidUrl), {
                headers: { 'x-api-key': sk2 }
              });
              if (vResp.ok) {
                const vData = await vResp.json();
                const pickedUrl = vData?.aweme_detail?.video?.play_addr?.url_list?.[0] || vData?.video?.play_addr?.url_list?.[0] || vData?.aweme_detail?.video?.download_addr?.url_list?.[0] || vData?.video?.download_addr?.url_list?.[0];
                if (pickedUrl) {
                  freshVideosMap[String(vid.id)] = pickedUrl;
                  dbg('Individual fetch OK for ' + vid.id);
                }
              }
            } catch (e) { dbg('Individual fetch failed for ' + vid.id + ': ' + e.message); }
            await new Promise(r => setTimeout(r, 300));
          }
          dbg('After individual fetch: freshMap has ' + Object.keys(freshVideosMap).length + ' entries');
        }
      }

      let done = 0;
      let errors = 0;

      for (const pick of topPicks) {
        const video = allVideos.find(v => String(v.id) === String(pick.videoId));
        if (!video) { dbg('SKIP ' + pick.videoId + ': not found in allVideos'); errors++; done++; continue; }

        try {
          // ═══ WATERMARK-SAFE: Prefer play_addr / nwm; download_addr may be watermarked ═══
          const cleanResult = await getCleanVideoUrl(video, process.env.SCRAPE_KEY);
          let videoUrl = cleanResult.url || freshVideosMap[String(video.id)];
          if (!videoUrl) {
            console.log('[cai-activate] SKIPPED video ' + video.id + ' — no watermark-free URL (' + cleanResult.source + ')');
            if (cai.activityLog) cai.activityLog.push({ type: 'video_skipped', videoId: video.id, reason: 'watermark', ts: new Date().toISOString() });
            dbg('SKIP ' + video.id + ': no clean download URL');
            errors++;
            done++;
            continue;
          }
          // Watermark check — warn if URL contains download_addr (often watermarked)
          if (videoUrl.includes('download_addr')) {
            console.log('[cai-activate] WARNING video ' + video.id + ' URL contains download_addr (potentially watermarked), proceeding anyway');
          }
          dbg('Video ' + video.id + ': freshUrl=' + (freshVideosMap[String(video.id)] ? 'YES' : 'no') + ', cachedDl=' + (video.downloadUrl ? 'yes' : 'no') + ', final=' + videoUrl.slice(0, 50));

          dbg('Downloading ' + video.id + ' from ' + videoUrl.slice(0, 60));
          const dlResp = await fetch(videoUrl, { headers: TIKTOK_DL_HEADERS });
          dbg('Response ' + video.id + ': status=' + dlResp.status + ' ct=' + (dlResp.headers.get('content-type') || 'none') + ' cl=' + (dlResp.headers.get('content-length') || 'none'));
          if (!dlResp.ok) { dbg('FAIL ' + video.id + ': HTTP ' + dlResp.status); errors++; done++; continue; }
          const ct = (dlResp.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('text/html') || ct.includes('application/json')) {
            const body = await dlResp.text();
            dbg('FAIL ' + video.id + ': got ' + ct + ' body=' + body.slice(0, 150));
            errors++; done++; continue;
          }
          const videoBuffer = Buffer.from(await dlResp.arrayBuffer());
          if (videoBuffer.length < 10000) { dbg('FAIL ' + video.id + ': only ' + videoBuffer.length + ' bytes'); errors++; done++; continue; }
          // Validate MP4 magic bytes (ftyp at offset 4-7)
          const magic = videoBuffer.slice(4, 8).toString('ascii');
          if (magic !== 'ftyp') {
            dbg('FAIL ' + video.id + ': not a valid MP4 (magic=' + magic + ', first 20 bytes=' + videoBuffer.slice(0, 20).toString('hex') + ')');
            errors++; done++; continue;
          }

          dbg('OK download ' + video.id + ': ' + (videoBuffer.length / 1e6).toFixed(1) + 'MB. Uploading to Meta...');
          let up, metaVideoId;
          try {
            up = await metaUploadVideo(videoBuffer, '[CAi] ' + (video.authorHandle || 'creator'), metaToken, adAccount);
            metaVideoId = up.id || up.video_id;
            dbg('Upload OK ' + video.id + ' → Meta video ' + metaVideoId + ' response: ' + JSON.stringify(up).slice(0, 200));
          } catch (uploadErr) {
            dbg('UPLOAD FAILED ' + video.id + ': ' + uploadErr.message);
            errors++; done++; continue;
          }
          if (!metaVideoId) {
            dbg('UPLOAD FAILED ' + video.id + ': no video ID returned. Response: ' + JSON.stringify(up).slice(0, 300));
            errors++; done++; continue;
          }
          dbg('Waiting for Meta to process video ' + metaVideoId + '...');
          const videoReady = await metaWaitForVideo(metaVideoId, metaToken, 120000);
          if (!videoReady) {
            dbg('FAIL ' + video.id + ': Meta video ' + metaVideoId + ' not ready after 120s — skipping to avoid broken ad');
            errors++; done++;
            const skipBrand = await getBrandById(brandId);
            if (skipBrand?.cai && skipBrand.cai.generationId === generationId) {
              skipBrand.cai.processingProgress = { total: topPicks.length, done, errors };
              skipBrand.cai.activityLog.push({ type: 'video_timeout', ts: new Date().toISOString(), msg: 'Video ' + video.id + ' timed out during Meta processing — skipped' });
              await saveBrand(skipBrand);
            }
            continue;
          }
          dbg('Meta video ' + metaVideoId + ' ready. Creating ad creative...');

          const spec = {
            page_id: pageId,
            video_data: {
              video_id: metaVideoId,
              message: pick.primaryText || video.desc || '',
              title: pick.headline || storeDomain,
              image_url: video.cover || pick.coverUrl || 'https://img.freepik.com/free-photo/abstract-surface-textures-white-concrete-stone-wall_1258-14525.jpg',
              call_to_action: { type: 'SHOP_NOW', value: { link: adLinkUrl } },
            },
          };
          const adName = '[CAi] ' + (pick.tier || 'ad') + ' — ' + (video.authorHandle || 'creator');
          const cr = await metaPost(adAccount + '/adcreatives', { name: adName, object_story_spec: JSON.stringify(spec), access_token: metaToken });
          const ad = await metaPost(adAccount + '/ads', { name: adName, adset_id: ids.adset, creative: JSON.stringify({ creative_id: cr.id }), status: 'ACTIVE', access_token: metaToken });
          dbg('Ad created ' + video.id + ': adId=' + ad.id + ' creativeId=' + cr.id);

          // Save each creative immediately as it completes (guard against stale generation)
          const freshBrand = await getBrandById(brandId);
          if (freshBrand?.cai && freshBrand.cai.generationId === generationId) {
            freshBrand.cai.creatives.push({
              videoId: video.id, adId: ad.id, creativeId: cr.id, metaVideoId,
              creator: video.authorHandle || 'creator', hookScore: pick.hookScore || 70,
              hookReason: pick.hookReason || '', tier: pick.tier || 'test',
              dailyBudget: pick.dailyBudget || 30, primaryText: pick.primaryText || '',
              headline: pick.headline || '', status: 'active',
              addedAt: new Date().toISOString(), daysActive: 0, lastMetrics: {},
            });
            done++;
            freshBrand.cai.processingProgress = { total: topPicks.length, done, errors };
            freshBrand.cai.activityLog.push({ type: 'ad_created', ts: new Date().toISOString(), msg: pick.tier + ' ad created: @' + (video.authorHandle || 'creator') });
            await saveBrand(freshBrand);
            console.log('[cai-activate-bg] Ad created for ' + video.id + ' (' + done + '/' + topPicks.length + ')');
          }
        } catch (adErr) {
          dbg('EXCEPTION for ' + (pick.videoId || 'unknown') + ': ' + adErr.message);
          errors++;
          done++;
        }
      }

      // Mark processing complete
      const finalBrand = await getBrandById(brandId);
      if (finalBrand?.cai) {
        finalBrand.cai.processingStatus = errors === topPicks.length ? 'error' : 'complete';
        finalBrand.cai.processingProgress = { total: topPicks.length, done, errors };
        finalBrand.cai.debugLog = debugLog;
        if (finalBrand.cai.creatives.length > 0) {
          finalBrand.cai.activityLog.push({ type: 'processing_complete', ts: new Date().toISOString(), msg: finalBrand.cai.creatives.length + ' ads ready, ' + errors + ' failed' });
          // ═══ UNPAUSE: Set campaign + adset + all ads to ACTIVE on Meta ═══
          try {
            const mt = finalBrand.metaToken;
            const campId = finalBrand.cai.campaign?.id;
            const asId = finalBrand.cai.campaign?.adsetId;
            if (mt && campId) {
              await metaPost(campId, { status: 'ACTIVE', access_token: mt });
              console.log('[cai-activate-bg] Campaign UNPAUSED:', campId);
            }
            if (mt && asId) {
              await metaPost(asId, { status: 'ACTIVE', access_token: mt });
              console.log('[cai-activate-bg] Adset UNPAUSED:', asId);
            }
            for (const cr of finalBrand.cai.creatives) {
              if (cr.adId && mt) {
                try { await metaPost(cr.adId, { status: 'ACTIVE', access_token: mt }); } catch (_) {}
              }
            }
            console.log('[cai-activate-bg] All ads UNPAUSED');
            finalBrand.cai.activityLog.push({ type: 'campaign_live', ts: new Date().toISOString(), msg: 'Campaign and ' + finalBrand.cai.creatives.length + ' ads set to ACTIVE on Meta' });
          } catch (unpauseErr) {
            console.error('[cai-activate-bg] Unpause failed:', unpauseErr.message);
            finalBrand.cai.activityLog.push({ type: 'unpause_failed', ts: new Date().toISOString(), msg: 'Auto-unpause failed: ' + unpauseErr.message });
          }
        } else {
          finalBrand.cai.activityLog.push({ type: 'processing_error', ts: new Date().toISOString(), msg: 'All ' + topPicks.length + ' video downloads failed. Check debugLog for details.' });
        }
        await saveBrand(finalBrand);
      }
      console.log('[cai-activate-bg] DONE: ' + (done - errors) + ' ads created, ' + errors + ' errors');
      const creativesCount = (finalBrand.cai && finalBrand.cai.creatives) ? finalBrand.cai.creatives.length : (done - errors);
      if (creativesCount > 0) {
        sendBuildCompleteNotification(brandId, (finalBrand.brandName || finalBrand.storeName || 'CAi') + ' — CAi Campaign', creativesCount).catch(e => console.error('[cai-activate-bg] notify email failed:', e.message));
      }
    })().catch(err => {
      console.error('[cai-activate-bg] Fatal error:', err.message);
      getBrandById(brandId).then(b => {
        if (b?.cai) { b.cai.processingStatus = 'error'; saveBrand(b); }
      }).catch(() => {});
    });
  } catch (e) {
    console.log = originalConsoleLog;
    console.error('[cai-activate]', e.message);
    res.status(500).json({ error: e.message, steps: healEvents.length > 0 ? [{ step: 'self_heal', fixes: healEvents }, ...steps] : steps });
  }
});

// ═══ CAi build-complete email notification (used by background task + optional POST) ═══
async function sendBuildCompleteNotification(brandId, campaignName, creativesCount) {
  const brand = await getBrandById(brandId);
  if (!brand || !brand.email) return false;
  const name = brand.brandName || brand.storeName || 'your brand';
  const subject = 'Your CAi campaign is live — ' + (campaignName || name);
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="color: #9b6dff;">Your campaign is ready!</h2>
      <p>CAi finished building your Meta ad campaign for <strong>${name}</strong>.</p>
      <p><strong>${creativesCount || 0}</strong> ad creatives are now live and running on Meta.</p>
      <p style="margin-top: 24px;">
        <a href="https://www.creatorship.app/brand#dashboard" style="background: linear-gradient(135deg, #9b6dff, #0668E1); color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700;">View Your Campaign</a>
      </p>
      <p style="color: #888; font-size: 13px; margin-top: 32px;">— CAi by Creatorship</p>
    </div>
  `;
  return sendEmail(brand.email, subject, html);
}

app.post('/api/cai/notify-build-complete', authBrand, requireRole('editor'), async (req, res) => {
  try {
    const brandId = req.brandAuth?.brandId || req.body?.brandId;
    const { campaignName, creativesCount } = req.body || {};
    const brand = await getBrandById(brandId);
    if (!brand || !brand.email) return res.json({ ok: false });
    const ok = await sendBuildCompleteNotification(brandId, campaignName, creativesCount);
    if (ok) return res.json({ ok: true });
    return res.json({ ok: false, error: 'Email not configured' });
  } catch (e) {
    console.error('[notify-build-complete] Error:', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// CAi Status — what's running, how it's performing
// ═══ DIAGNOSTIC: Test video download pipeline ═══
app.get('/api/cai/test-download', authBrand, async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.query.brandId;
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  
  const handle = brand.tikTokStorePageUrl?.match(/@([^/?]+)/)?.[1] || brand.tikTokStorePageUrl?.match(/\/shop\/store\/([^/]+)/)?.[1] || (brand.storeName || brand.brandName || '').toLowerCase().replace(/\s+/g, '');
  const scrapeKey = process.env.SCRAPE_KEY;
  const steps = [];
  
  // Step 1: Get fresh URLs from ScrapeCreators
  let freshMap = {};
  try {
    const freshResp = await fetch(
      `https://api.scrapecreators.com/v1/tiktok/profile/videos?handle=${encodeURIComponent(handle)}&limit=5`,
      { headers: { 'x-api-key': scrapeKey } }
    );
    const freshData = await freshResp.json();
    const rawVideos = freshData.aweme_list || freshData.data || freshData.videos || freshData.posts || [];
    steps.push({ step: 'scrape', status: 'ok', videosReturned: rawVideos.length });
    
    if (rawVideos.length > 0) {
      const fv = rawVideos[0];
      const dlUrls = fv.video?.download_addr?.url_list || [];
      const playUrls = fv.video?.play_addr?.url_list || [];
      const videoUrl = playUrls[0] || dlUrls[0] || '';
      if (!videoUrl) {
        console.log('[cai-activate] SKIPPED video ' + (fv.aweme_id || fv.id) + ' — no play_addr or download_addr');
        steps.push({ step: 'url_extract', videoId: fv.aweme_id || fv.id, hasDl: dlUrls.length, hasPlay: playUrls.length, skipped: 'no_url' });
      } else {
      steps.push({ step: 'url_extract', videoId: fv.aweme_id || fv.id, hasDl: dlUrls.length, hasPlay: playUrls.length, urlPrefix: videoUrl.slice(0, 80) });
      
      if (videoUrl) {
        // Step 2: Download with headers
        try {
          const dlResp = await fetch(videoUrl, { headers: TIKTOK_DL_HEADERS });
          const ct = (dlResp.headers.get('content-type') || '').toLowerCase();
          const cl = dlResp.headers.get('content-length');
          steps.push({ step: 'download_with_headers', status: dlResp.status, contentType: ct, contentLength: cl, ok: dlResp.ok });
          
          if (dlResp.ok && !ct.includes('text/html')) {
            const buf = Buffer.from(await dlResp.arrayBuffer());
            steps.push({ step: 'buffer', size: buf.length, sizeStr: (buf.length / 1e6).toFixed(1) + 'MB', isVideo: buf.length > 100000 });
          } else {
            // Read body to see what we got
            const bodyText = await dlResp.text();
            steps.push({ step: 'download_body', bodyPreview: bodyText.slice(0, 300), isHtml: bodyText.includes('<html') || bodyText.includes('<!DOCTYPE') });
          }
        } catch (dlErr) {
          steps.push({ step: 'download_error', error: dlErr.message });
        }
        
        // Step 3: Also try WITHOUT headers for comparison
        try {
          const dlResp2 = await fetch(videoUrl);
          const ct2 = (dlResp2.headers.get('content-type') || '').toLowerCase();
          const cl2 = dlResp2.headers.get('content-length');
          steps.push({ step: 'download_no_headers', status: dlResp2.status, contentType: ct2, contentLength: cl2 });
        } catch (dlErr2) {
          steps.push({ step: 'download_no_headers_error', error: dlErr2.message });
        }
      }
    }
  }
  } catch (e) {
    steps.push({ step: 'scrape_error', error: e.message });
  }
  
  res.json({ handle, steps });
});

app.get('/api/cai/status', authBrand, async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.query.brandId;
  if (!brandId) return res.status(400).json({ error: 'brandId required' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });

  // ═══ WATCHDOG: If processing has been stuck for >5 min, mark as complete with whatever we have ═══
  if (brand.cai?.processingStatus === 'processing' && brand.cai?.activatedAt) {
    const elapsed = Date.now() - new Date(brand.cai.activatedAt).getTime();
    if (elapsed > 5 * 60 * 1000) {
      const creatives = brand.cai.creatives || [];
      const progress = brand.cai.processingProgress || {};
      brand.cai.processingStatus = creatives.length > 0 ? 'complete' : 'error';
      brand.cai.processingProgress = { total: progress.total || 0, done: progress.total || 0, errors: (progress.total || 0) - creatives.length };
      brand.cai.activityLog = [...(brand.cai.activityLog || []), { type: 'watchdog_recovery', ts: new Date().toISOString(), msg: 'Processing stalled after 5min. ' + creatives.length + ' ads saved, ' + ((progress.total || 0) - creatives.length) + ' lost. Background may have been interrupted.' }];
      await saveBrand(brand);
      console.log('[cai-watchdog] Recovered stuck processing for brand ' + brandId + ': ' + creatives.length + ' creatives saved');
    }
  }

  // Migration: fix brands where cai.isActive is true but campaign status is paused
  if (brand.cai?.isActive && brand.cai?.status === 'paused') {
    brand.cai.isActive = false;
    for (const cr of (brand.cai.creatives || [])) { cr.status = 'paused'; }
    await saveBrand(brand);
    console.log('[cai-status] Migrated brand ' + brandId + ' from active to paused');
  }
  // Also fix: if all ads were created as PAUSED but isActive still true
  if (brand.cai?.isActive && brand.cai?.processingStatus === 'complete') {
    const hasActiveAds = (brand.cai.creatives || []).some(c => c.status === 'active');
    if (!hasActiveAds) {
      brand.cai.isActive = false;
      await saveBrand(brand);
    }
  }

  // Migration: reset outreachAuthorized for brands that were auto-approved before the explicit consent fix
  if (brand.outreachAuthorized && !brand.outreachAuthorizedViaModal) {
    brand.outreachAuthorized = false;
    brand.outreachAuthorizedAt = null;
    await saveBrand(brand);
    console.log('[cai-status] Reset outreachAuthorized for brand ' + brandId + ' (was auto-approved)');
  }

  let cai = brand.cai || {};
  // ═══ META SYNC — verify campaign status against actual Meta (throttled to once per 5 min) ═══
  const lastSync = brand.cai?.lastMetaSync ? new Date(brand.cai.lastMetaSync).getTime() : 0;
  if (brand.metaToken && brand.cai?.campaign?.id && (Date.now() - lastSync > 5 * 60 * 1000)) {
    try {
      const syncResult = await syncCampaignWithMeta(brand);
      if (syncResult.changed) {
        const updatedBrand = await getBrandById(brandId);
        if (updatedBrand) {
          brand.cai = updatedBrand.cai;
          cai = brand.cai || cai;
        }
      }
    } catch (syncErr) {
      console.error('[meta-sync] Error in status check:', syncErr.message);
    }
  }

  res.json({
    isActive: (cai.creatives || []).some(c => c.status === 'active') && cai.processingStatus === 'complete',
    monthlyBudget: cai.monthlyBudget || 0,
    roasTarget: cai.roasTarget || 0,
    activatedAt: cai.activatedAt || null,
    campaign: cai.campaign || null,
    processingStatus: cai.processingStatus || null,
    processingProgress: cai.processingProgress || null,
    processingError: cai.processingError || null,
    processingErrorAt: cai.processingErrorAt || null,
    creativesCount: (cai.creatives || []).length,
    activeCreatives: (cai.creatives || []).filter(c => c.status === 'active').length,
    performance: cai.performance || {},
    creatives: (cai.creatives || []).map(c => ({
      videoId: c.videoId, creator: c.creator, creatorHandle: c.creatorHandle || c.creator, tier: c.tier,
      hookScore: c.hookScore, hookReason: c.hookReason,
      primaryText: c.primaryText || '', headline: c.headline || '',
      status: c.status, daysActive: c.daysActive,
      adId: c.adId || null, creativeId: c.creativeId || null, metaVideoId: c.metaVideoId || null,
      pauseReason: c.pauseReason || null, fatigueReason: c.fatigueReason || null,
      peakRoas: c.peakRoas || 0, peakCtr: c.peakCtr || 0,
      lastMetrics: c.lastMetrics || {},
      addedAt: c.addedAt || null,
    })),
    deepDive: brand.caiDeepDive || null,
    activityLog: (cai.activityLog || []).slice(-20),
    debugLog: (cai.debugLog || []).slice(-30),
    allCampaigns: getCaiCampaigns(brand).map(c => ({
      localId: c.localId,
      metaCampaignId: c.metaCampaignId,
      metaAdsetId: c.metaAdsetId,
      type: c.type,
      name: c.name,
      status: c.status,
      budget: c.budget,
      roasTarget: c.roasTarget,
      creativesCount: (c.creatives || []).length,
      activeCreatives: (c.creatives || []).filter(cr => cr.status === 'active').length,
      creatives: (c.creatives || []).map(cr => ({
        videoId: cr.videoId, creator: cr.creator, creatorHandle: cr.creatorHandle || cr.creator,
        tier: cr.tier, hookScore: cr.hookScore, hookReason: cr.hookReason,
        primaryText: cr.primaryText || '', headline: cr.headline || '',
        status: cr.status, daysActive: cr.daysActive,
        adId: cr.adId || null, creativeId: cr.creativeId || null, metaVideoId: cr.metaVideoId || null,
        lastMetrics: cr.lastMetrics || {}, addedAt: cr.addedAt || null,
      })),
      activityLog: (c.activityLog || []).slice(-10),
      processingStatus: c.processingStatus || null,
      processingProgress: c.processingProgress || null,
      createdAt: c.createdAt,
      activatedAt: c.activatedAt,
      startDate: c.startDate, endDate: c.endDate,
      promoDetails: c.promoDetails,
    })),
  });
});

// ═══ MANUAL META SYNC ═══
app.post('/api/cai/sync-meta', authBrand, requireRole('editor'), async (req, res) => {
  const brandId = req.brandAuth?.brandId;
  if (!brandId) return res.status(400).json({ error: 'brandId required' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });

  try {
    const result = await syncCampaignWithMeta(brand);
    res.json(result);
  } catch (e) {
    console.error('[meta-sync] Manual sync error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══ CAi Create Campaign — create a new promotion, A/B test, or additional always-on campaign ═══
app.post('/api/cai/create-campaign', authBrand, requireRole('editor'), async (req, res) => {
  const brandId = req.brandAuth?.brandId;
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  if (!brand.metaToken || !brand.adAccount || !brand.pageId) return res.status(400).json({ error: 'Meta not connected. Connect Meta first.' });

  const { type, name, budget, roasTarget, videoIds, startDate, endDate, promoDetails } = req.body;
  if (!type || !name) return res.status(400).json({ error: 'type and name required' });
  if (!['always-on', 'promotion', 'ab-test'].includes(type)) return res.status(400).json({ error: 'Invalid type. Use: always-on, promotion, ab-test' });

  const budgetAmount = Number(budget?.amount || budget || 300);
  const budgetType = budget?.type || (type === 'promotion' ? 'lifetime' : 'monthly');
  const roas = Number(roasTarget || 3.0);

  const metaToken = brand.metaToken;
  const adAccount = brand.adAccount;
  const pageId = brand.pageId;
  const websiteUrl = brand.websiteUrl || brand.storeUrl || brand.tikTokShopUrl || '';

  try {
    // Pre-flight check: verify Meta token is still valid
    try {
      const meResp = await apiFetch('https://graph.facebook.com/v22.0/me?access_token=' + metaToken);
      if (!meResp.name && !meResp.id) throw new Error('Meta token may be expired');
    } catch (tokenErr) {
      return res.status(400).json({ error: 'Your Meta connection has expired. Please reconnect Meta in your Account settings.', metaExpired: true });
    }
    const dailyBudget = budgetType === 'monthly' ? Math.round(budgetAmount / 30) : null;
    const lifetimeBudget = budgetType === 'lifetime' ? budgetAmount : null;
    const campParams = {
      name: name,
      objective: 'OUTCOME_SALES',
      status: 'PAUSED',
      special_ad_categories: '[]',
      access_token: metaToken,
    };
    const campaign = await metaPost(adAccount + '/campaigns', campParams);
    if (!campaign.id) return res.status(500).json({ error: 'Failed to create campaign on Meta' });

    const adsetParams = {
      name: name + ' — Adset',
      campaign_id: campaign.id,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: JSON.stringify({ geo_locations: { countries: ['US'] }, age_min: 18, age_max: 65 }),
      promoted_object: JSON.stringify({ pixel_id: brand.pixelId || '', custom_event_type: 'PURCHASE' }),
      status: 'ACTIVE',
      access_token: metaToken,
    };
    if (dailyBudget) adsetParams.daily_budget = dailyBudget * 100;
    if (lifetimeBudget) {
      adsetParams.lifetime_budget = lifetimeBudget * 100;
      if (startDate) adsetParams.start_time = new Date(startDate).toISOString();
      if (endDate) adsetParams.end_time = new Date(endDate).toISOString();
    }
    const adset = await metaPost(adAccount + '/adsets', adsetParams);
    if (!adset.id) return res.status(500).json({ error: 'Failed to create adset on Meta' });

    const localId = 'cai_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const newCamp = {
      localId,
      metaCampaignId: campaign.id,
      metaAdsetId: adset.id,
      type,
      name,
      status: 'paused',
      budget: { type: budgetType, amount: budgetAmount },
      roasTarget: roas,
      creatives: [],
      activityLog: [{ type: 'created', ts: new Date().toISOString(), msg: type + ' campaign created: ' + name }],
      debugLog: [],
      generationId: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      processingStatus: null,
      processingProgress: null,
      createdAt: new Date().toISOString(),
      activatedAt: null,
      startDate: startDate || null,
      endDate: endDate || null,
      promoDetails: promoDetails || null,
    };

    const campaigns = getCaiCampaigns(brand);
    campaigns.push(newCamp);
    saveCaiCampaigns(brand, campaigns);
    await saveBrand(brand);

    console.log('[cai-create-campaign] Created ' + type + ' campaign: ' + name + ' (Meta: ' + campaign.id + ') for brand ' + brandId);

    if (videoIds && videoIds.length > 0) {
      newCamp.processingStatus = 'processing';
      newCamp.processingProgress = { total: videoIds.length, done: 0, errors: 0 };
      saveCaiCampaigns(brand, campaigns);
      await saveBrand(brand);

      (async () => {
        let done = 0, errors = 0;
        for (const videoId of videoIds) {
          try {
            await caiAddCreativeToCampaign(brand, localId, videoId);
            done++;
          } catch (e) {
            console.error('[cai-create-campaign] Failed to add video ' + videoId + ': ' + e.message);
            errors++;
            done++;
          }
          const fb = await getBrandById(brandId);
          const fCamps = getCaiCampaigns(fb);
          const fCamp = fCamps.find(c => c.localId === localId);
          if (fCamp) {
            fCamp.processingProgress = { total: videoIds.length, done, errors };
            if (done === videoIds.length) {
              fCamp.processingStatus = errors === videoIds.length ? 'error' : 'complete';
              fCamp.activityLog.push({ type: 'processing_complete', ts: new Date().toISOString(), msg: (done - errors) + ' ads ready, ' + errors + ' failed' });
              if (done > errors) {
                // All ads stay PAUSED — brand approves and unpauses manually
                fCamp.status = 'paused';
                fCamp.activatedAt = new Date().toISOString();
                for (const cr of fCamp.creatives) { cr.status = 'paused'; }
                fCamp.activityLog.push({ type: 'campaign_ready', ts: new Date().toISOString(), msg: (done - errors) + ' ads created (PAUSED) — ready for your review' });
                console.log('[cai-create-campaign] ' + (done - errors) + ' ads created as PAUSED — awaiting brand approval');
                // Email brand that campaigns are ready for review
                try {
                  const resendKey = process.env.RESEND_KEY;
                  if (resendKey && fb?.email) {
                    await fetch('https://api.resend.com/emails', {
                      method: 'POST',
                      headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        from: 'CAi <noreply@creatorship.app>',
                        to: [fb.email],
                        subject: (done - errors) + ' Meta ads ready for your review — ' + (fb.brandName || fb.storeName || 'Your brand'),
                        html: '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">' +
                          '<h2 style="color:#34d399">Your CAi campaign is ready!</h2>' +
                          '<p>CAi has built <strong>' + (done - errors) + ' Meta ads</strong> for <strong>' + (fb.brandName || fb.storeName || 'your brand') + '</strong>.</p>' +
                          '<p>All ads are <strong>PAUSED</strong> — they won\'t spend any money until you review and approve them.</p>' +
                          (errors > 0 ? '<p style="color:#ffb400">' + errors + ' video(s) failed to process (TikTok CDN URLs may have expired).</p>' : '') +
                          '<p><a href="https://www.creatorship.app/brand#campaigns" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#9b6dff,#0668E1);color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Review Your Ads</a></p>' +
                          '<p style="color:#888;font-size:12px">Your ads will stay paused until you activate them. No surprise spend.</p>' +
                          '</div>',
                      }),
                    });
                    console.log('[cai-activate-bg] Success email sent to ' + fb.email);
                  }
                } catch (emailErr) { console.error('[cai-activate-bg] Failed to send success email:', emailErr.message); }
                fb.cai = fb.cai || {};
                fb.cai.isActive = false;
              }
            }
            saveCaiCampaigns(fb, fCamps);
            await saveBrand(fb);
          }
        }
      })().catch(async (e) => {
      console.error('[cai-create-campaign] Background error:', e.message);
      // Save error status so frontend shows it on next visit
      try {
        const fb = await getBrandById(brandId);
        if (fb) {
          fb.cai = fb.cai || {};
          fb.cai.processingStatus = 'error';
          fb.cai.processingError = e.message;
          fb.cai.processingErrorAt = new Date().toISOString();
          fb.cai.activityLog = [...(fb.cai.activityLog || []), { type: 'processing_error', ts: new Date().toISOString(), msg: 'Background processing failed: ' + e.message }];
          await saveBrand(fb);
        }
      } catch (_) {}
      // Email the brand about the failure
      try {
        const resendKey = process.env.RESEND_KEY;
        const b = await getBrandById(brandId);
        if (resendKey && b?.email) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'CAi <noreply@creatorship.app>',
              to: [b.email],
              subject: 'CAi campaign build failed — action needed',
              html: '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">' +
                '<h2 style="color:#ef4444">Your CAi campaign couldn\'t be built</h2>' +
                '<p>Something went wrong while building your Meta ad campaign for <strong>' + (b.brandName || b.storeName || 'your brand') + '</strong>.</p>' +
                '<p><strong>Error:</strong> ' + (e.message || '').replace(/</g, '&lt;') + '</p>' +
                '<p>Common causes:</p>' +
                '<ul>' +
                '<li>Meta ad account has no payment method set up</li>' +
                '<li>Meta access token expired — reconnect Meta in Settings</li>' +
                '<li>TikTok video URLs expired — try running activation again</li>' +
                '</ul>' +
                '<p><a href="https://www.creatorship.app/brand#optimize" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#9b6dff,#0668E1);color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Try Again</a></p>' +
                '<p style="color:#888;font-size:12px">If this keeps happening, reply to this email or contact support@creatorship.app</p>' +
                '</div>',
            }),
          });
          console.log('[cai-activate-bg] Failure email sent to ' + b.email);
        }
      } catch (emailErr) { console.error('[cai-activate-bg] Failed to send error email:', emailErr.message); }
    });
    }

    res.json({ success: true, localId, metaCampaignId: campaign.id, metaAdsetId: adset.id, type, name });
  } catch (e) {
    console.error('[cai-create-campaign] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══ CAi Add Creative to Specific Campaign ═══
async function caiAddCreativeToCampaign(brand, campaignLocalId, videoId, primaryText, headline) {
  const campaigns = getCaiCampaigns(brand);
  const camp = campaigns.find(c => c.localId === campaignLocalId);
  if (!camp) throw new Error('Campaign not found: ' + campaignLocalId);

  const metaToken = brand.metaToken;
  const adAccount = brand.adAccount;
  const pageId = brand.pageId;
  const adsetId = camp.metaAdsetId;
  const websiteUrl = brand.websiteUrl || brand.storeUrl || '';

  const allVideos = [
    ...(brand.tiktokVideosCache || []),
    ...(brand.uploads || []).filter(u => u.videoUrl).map(u => ({
      id: u.id, desc: u.title || '', downloadUrl: u.videoUrl, authorHandle: u.creatorHandle || '',
    })),
  ];
  const video = allVideos.find(v => String(v.id) === String(videoId));
  if (!video) throw new Error('Video not found in content pool');

  let videoUrl = video.downloadUrl || '';
  const handle = video.authorHandle || brand.tikTokStorePageUrl?.match(/@([^/?]+)/)?.[1] || brand.tikTokStorePageUrl?.match(/\/shop\/store\/([^/]+)/)?.[1] || (brand.storeName || brand.brandName || '').toLowerCase().replace(/\s+/g, '');
  const scrapeKey = process.env.SCRAPE_KEY;
  if (scrapeKey && handle) {
    try {
      const freshResp = await fetch(`https://api.scrapecreators.com/v1/tiktok/profile/videos?handle=${encodeURIComponent(handle)}&limit=30`, { headers: { 'x-api-key': scrapeKey } });
      if (freshResp.ok) {
        const freshData = await freshResp.json();
        const rawVideos = freshData.aweme_list || freshData.data || freshData.videos || freshData.posts || [];
        const match = rawVideos.find(fv => String(fv.aweme_id || fv.id) === String(video.id));
        if (match) {
          const freshUrl = (match.video?.download_addr?.url_list || [])[0] || '';
          if (freshUrl) videoUrl = freshUrl;
        }
      }
    } catch (_) {}
  }
  if (!videoUrl) throw new Error('No video URL available');

  const dlResp = await fetch(videoUrl, { headers: typeof TIKTOK_DL_HEADERS !== 'undefined' ? TIKTOK_DL_HEADERS : {} });
  const videoBuffer = Buffer.from(await dlResp.arrayBuffer());
  if (videoBuffer.length < 10000) throw new Error('Downloaded file too small: ' + videoBuffer.length + ' bytes');

  const up = await metaUploadVideo(videoBuffer, '[CAi] ' + (video.authorHandle || 'creator'), metaToken, adAccount);
  const metaVideoId = up.id || up.video_id;
  if (!metaVideoId) throw new Error('Meta upload failed: ' + JSON.stringify(up).slice(0, 200));

  await metaWaitForVideo(metaVideoId, metaToken, 90000);

  const text = primaryText || ('Check out what @' + (video.authorHandle || 'creator') + ' found! Shop now →');
  const head = headline || (brand.brandName || 'Shop Now');

  const cr = await metaPost(adAccount + '/adcreatives', {
    name: '[CAi] ' + (video.authorHandle || '') + ' creative',
    object_story_spec: JSON.stringify({
      page_id: pageId,
      video_data: { video_id: metaVideoId, message: text, title: head, image_url: video.cover || video.coverHd || 'https://img.freepik.com/free-photo/abstract-surface-textures-white-concrete-stone-wall_1258-14525.jpg', call_to_action: { type: 'SHOP_NOW', value: { link: websiteUrl || brand.storeUrl || brand.tikTokShopUrl || 'https://www.tiktok.com/shop' } } },
    }),
    access_token: metaToken,
  });

  const ad = await metaPost(adAccount + '/ads', {
    name: '[CAi] ' + (video.authorHandle || 'creator') + ' — ' + (video.desc || '').slice(0, 30),
    adset_id: adsetId,
    creative: JSON.stringify({ creative_id: cr.id }),
    status: 'ACTIVE',
    access_token: metaToken,
  });

  camp.creatives.push({
    videoId: String(video.id),
    adId: ad.id,
    creativeId: cr.id,
    metaVideoId,
    creator: video.authorHandle || 'creator',
    creatorHandle: video.authorHandle || '',
    tier: 'manual',
    hookScore: null,
    hookReason: null,
    primaryText: text,
    headline: head,
    status: 'active',
    addedAt: new Date().toISOString(),
    lastMetrics: {},
  });

  saveCaiCampaigns(brand, campaigns);
  await saveBrand(brand);

  return { adId: ad.id, creativeId: cr.id, metaVideoId };
}

// CAi Add Creative — add a video to the active campaign
app.post('/api/cai/add-creative', authBrand, requireRole('editor'), async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  if (!brandId) return res.status(400).json({ error: 'brandId required' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  if (brand.billingSuspended) return res.status(403).json({ error: 'Billing suspended — update your payment method at Account → Billing to reactivate', suspended: true, reason: brand.billingSuspendReason });
  if (brand.isBadActor) return res.status(403).json({ error: 'Account suspended — contact support@creatorship.app', suspended: true });
  if (!brand.cai?.campaign?.id) return res.status(400).json({ error: 'No active campaign. Activate CAi first.' });

  const { videoId, primaryText, headline } = req.body;
  if (!videoId) return res.status(400).json({ error: 'videoId required' });

  try {
    const result = await caiAddCreativeToActiveCampaign(brand, videoId, primaryText, headline);
    res.json(result);
  } catch (e) {
    console.error('[cai-add-creative]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// CAi Deactivate
app.post('/api/cai/deactivate', authBrand, requireRole('editor'), async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  // Pause campaign on Meta
  if (brand.cai?.campaign?.id && brand.metaToken) {
    try {
      await metaPost(brand.cai.campaign.id, { status: 'PAUSED', access_token: brand.metaToken });
      console.log('[cai-deactivate] Campaign PAUSED on Meta:', brand.cai.campaign.id);
    } catch (e) { console.error('[cai-deactivate] Meta pause failed:', e.message); }
  }
  if (brand.cai) { brand.cai.isActive = false; brand.cai.deactivatedAt = new Date().toISOString(); }
  await auditLog(brand.id, 'cai_deactivated', {});
  await saveBrand(brand);
  res.json({ success: true });
});

// ═══ FULL RESET — Clear ALL CAi data, return brand to pre-analysis state ═══
app.post('/api/cai/reset', authBrand, requireRole('editor'), async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  brand.cai = null;
  brand.deepDive = null;
  brand.deepDiveCache = null;
  await saveBrand(brand);
  console.log('[cai-reset] Full reset for brand ' + brandId);
  res.json({ success: true });
});

// ═══ CAi PERFORMANCE ENGINE — Poll Meta Insights, auto-pause losers, auto-scale winners ═══
async function caiPollPerformance(brand) {
  if (!brand?.cai?.campaign?.id) return { error: 'No campaign' };
  const metaToken = brand.metaToken;
  if (!metaToken) return { error: 'No Meta token' };
  const creatives = brand.cai.creatives || [];
  const adIds = creatives.filter(c => c.adId).map(c => c.adId);
  console.log('[cai-poll] Polling ' + adIds.length + ' ads from ' + creatives.length + ' creatives. Campaign: ' + brand.cai.campaign.id);
  const campaignId = brand.cai.campaign.id;

  const activity = [];
  const now = new Date();

  try {
    // Fetch campaign-level insights (today)
    const todayStr = now.toISOString().split('T')[0];
    const campInsights = await apiFetch(
      'https://graph.facebook.com/v22.0/' + campaignId + '/insights?fields=spend,impressions,clicks,ctr,actions,cost_per_action_type,action_values&time_range={"since":"' + todayStr + '","until":"' + todayStr + '"}&access_token=' + metaToken
    ).catch(() => null);

    // Fetch per-ad insights
    const adInsights = await apiFetch(
      'https://graph.facebook.com/v22.0/' + campaignId + '/insights?fields=ad_id,ad_name,spend,impressions,clicks,ctr,actions,cost_per_action_type,action_values&level=ad&time_range={"since":"' + todayStr + '","until":"' + todayStr + '"}&access_token=' + metaToken
    ).catch(() => null);

    // Fetch 7-day campaign insights
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
    const weekInsights = await apiFetch(
      'https://graph.facebook.com/v22.0/' + campaignId + '/insights?fields=spend,impressions,clicks,actions,action_values&time_range={"since":"' + weekAgo + '","until":"' + todayStr + '"}&access_token=' + metaToken
    ).catch(() => null);

    // Parse campaign-level metrics
    const campData = campInsights?.data?.[0] || {};
    const weekData = weekInsights?.data?.[0] || {};
    const todaySpend = parseFloat(campData.spend || '0');
    const todayImpressions = parseInt(campData.impressions || '0');
    const todayClicks = parseInt(campData.clicks || '0');
    const todayCtr = parseFloat(campData.ctr || '0');
    const weekSpend = parseFloat(weekData.spend || '0');

    // Extract actions (purchases or link clicks)
    const getActionValue = (actions, type) => {
      if (!actions) return 0;
      const a = actions.find(x => x.action_type === type);
      return a ? parseFloat(a.value || '0') : 0;
    };
    const getCostPerAction = (costs, type) => {
      if (!costs) return 0;
      const c = costs.find(x => x.action_type === type);
      return c ? parseFloat(c.value || '0') : 0;
    };
    const todayPurchases = getActionValue(campData.actions, 'purchase') || getActionValue(campData.actions, 'offsite_conversion.fb_pixel_purchase');
    const todayLinkClicks = getActionValue(campData.actions, 'link_click');
    const todayConversions = todayPurchases || todayLinkClicks;
    const todayCpa = todayConversions > 0 ? todaySpend / todayConversions : 0;
    const todayRevenue = parseFloat((campData.action_values || []).find(x => x.action_type === 'purchase')?.value || '0');
    const todayRoas = todaySpend > 0 ? todayRevenue / todaySpend : 0;
    const weekRevenue = parseFloat((weekData.action_values || []).find(x => x.action_type === 'purchase')?.value || '0');
    const weekRoas = weekSpend > 0 ? weekRevenue / weekSpend : 0;

    // Parse per-ad metrics and update creatives
    const adData = adInsights?.data || [];
    const roasTarget = brand.cai.roasTarget || 3.0;
    const targetCpa = (brand.avgProductPrice || 30) * 0.4; // 40% of product price

    for (const ad of adData) {
      const creative = (brand.cai.creatives || []).find(c => c.adId === ad.ad_id);
      if (!creative) continue;

      const adSpend = parseFloat(ad.spend || '0');
      const adImpressions = parseInt(ad.impressions || '0');
      const adClicks = parseInt(ad.clicks || '0');
      const adCtr = parseFloat(ad.ctr || '0');
      const adPurchases = getActionValue(ad.actions, 'purchase') || getActionValue(ad.actions, 'offsite_conversion.fb_pixel_purchase');
      const adLinkClicks = getActionValue(ad.actions, 'link_click');
      const adConversions = adPurchases || adLinkClicks;
      const adCpa = adConversions > 0 ? adSpend / adConversions : 0;
      const adRevenue = parseFloat((ad.action_values || []).find(x => x.action_type === 'purchase')?.value || '0');
      const adRoas = adSpend > 0 ? adRevenue / adSpend : 0;

      creative.lastMetrics = {
        spend: adSpend, impressions: adImpressions, clicks: adClicks,
        ctr: adCtr, conversions: adConversions, cpa: adCpa,
        revenue: adRevenue, roas: adRoas, updatedAt: now.toISOString(),
      };

      // Track days active
      if (creative.addedAt) {
        creative.daysActive = Math.floor((now.getTime() - new Date(creative.addedAt).getTime()) / 86400000);
      }

      // ═══ AUTO-PAUSE: CPA > 2x target for spending ads ═══
      if (adSpend > 5 && adCpa > targetCpa * 2 && creative.status === 'active') {
        creative.consecutiveHighCpa = (creative.consecutiveHighCpa || 0) + 1;
        if (creative.consecutiveHighCpa >= 3) {
          // Pause on Meta
          try {
            await metaPost(ad.ad_id, { status: 'PAUSED', access_token: metaToken });
            creative.status = 'paused';
            creative.pausedAt = now.toISOString();
            creative.pauseReason = 'CPA $' + adCpa.toFixed(0) + ' exceeded 2x target ($' + (targetCpa * 2).toFixed(0) + ') for 3+ days';
            activity.push({ type: 'auto_pause', adId: ad.ad_id, creator: creative.creator, reason: creative.pauseReason, ts: now.toISOString() });
          } catch (e) { console.error('[cai-autopause] Failed:', e.message); }
        }
      } else {
        creative.consecutiveHighCpa = 0;
      }

      // ═══ AUTO-SCALE: ROAS > target for winning ads ═══
      if (adSpend > 5 && adRoas > roasTarget && creative.status === 'active') {
        creative.consecutiveHighRoas = (creative.consecutiveHighRoas || 0) + 1;
        if (creative.consecutiveHighRoas >= 3) {
          // Increase campaign budget by 20%
          try {
            const campBudget = await apiFetch('https://graph.facebook.com/v22.0/' + campaignId + '?fields=daily_budget&access_token=' + metaToken);
            const currentBudget = parseInt(campBudget?.daily_budget || '0');
            const newBudget = Math.round(currentBudget * 1.2);
            await metaPost(campaignId, { daily_budget: newBudget, access_token: metaToken });
            activity.push({ type: 'auto_scale', adId: ad.ad_id, creator: creative.creator, from: currentBudget / 100, to: newBudget / 100, ts: now.toISOString() });
            creative.consecutiveHighRoas = 0; // Reset after scaling
          } catch (e) { console.error('[cai-autoscale] Failed:', e.message); }
        }
      } else if (adRoas <= roasTarget) {
        creative.consecutiveHighRoas = 0;
      }

      // ═══ FATIGUE DETECTION: Performance decay + budget-adjusted days ═══
      // Smart fatigue: higher spend = faster fatigue because frequency builds faster
      const dailyBudget = (brand.cai?.monthlyBudget || 1500) / 30;
      const fatigueThresholdDays = dailyBudget >= 500 ? 10 : dailyBudget >= 200 ? 14 : dailyBudget >= 100 ? 21 : 30;

      // Track peak performance for decay detection
      if (adRoas > (creative.peakRoas || 0)) creative.peakRoas = adRoas;
      if (adCtr > (creative.peakCtr || 0)) creative.peakCtr = adCtr;

      // Performance decay signals (more reliable than fixed days)
      const ctrDecay = creative.peakCtr > 0 && adCtr > 0 ? (1 - adCtr / creative.peakCtr) : 0;
      const roasDecay = creative.peakRoas > 0 && adRoas > 0 ? (1 - adRoas / creative.peakRoas) : 0;
      const hasPerfDecay = (ctrDecay > 0.3 || roasDecay > 0.4) && adSpend > 5; // CTR dropped 30%+ or ROAS dropped 40%+ from peak

      if (creative.status === 'active' && (hasPerfDecay || creative.daysActive >= fatigueThresholdDays)) {
        creative.status = 'fatigued';
        creative.fatigueReason = hasPerfDecay
          ? 'Performance declining — ' + (ctrDecay > 0.3 ? 'CTR dropped ' + Math.round(ctrDecay * 100) + '% from peak' : 'ROAS dropped ' + Math.round(roasDecay * 100) + '% from peak')
          : 'Running ' + creative.daysActive + ' days at $' + Math.round(dailyBudget) + '/day — likely reaching audience saturation';
        activity.push({ type: 'fatigue_flag', adId: ad.ad_id, creator: creative.creator, daysActive: creative.daysActive, reason: creative.fatigueReason, ts: now.toISOString() });
      }
    }

    // Update aggregate performance
    brand.cai.performance = {
      today: { spend: todaySpend, revenue: todayRevenue, roas: todayRoas, cpa: todayCpa, impressions: todayImpressions, clicks: todayClicks, conversions: todayConversions },
      week: { spend: weekSpend, revenue: weekRevenue, roas: weekRoas },
      bestAd: adData.length > 0 ? (() => { const sorted = [...adData].sort((a, b) => parseFloat(b.spend || '0') - parseFloat(a.spend || '0')); const best = sorted[0]; const c = (brand.cai.creatives || []).find(x => x.adId === best?.ad_id); return c ? { creator: c.creator, tier: c.tier, spend: parseFloat(best.spend || '0') } : null; })() : null,
      lastPolledAt: now.toISOString(),
    };

    // ═══ Spend Cap Alert ═══
    const dailyBudget = Math.round((brand.cai?.monthlyBudget || 0) / 30);
    const todaySpendNum = brand.cai.performance.today?.spend || 0;
    if (dailyBudget > 0 && todaySpendNum > dailyBudget * 2) {
      console.log('[spend-cap] ALERT: ' + brand.email + ' spent $' + todaySpendNum.toFixed(2) + ' today (budget: $' + dailyBudget + '/day, 2x exceeded)');
      if (process.env.RESEND_KEY) {
        const spendHtml = '<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px"><h2 style="color:#ffb400">Spend Alert</h2><p>Your Meta ads have spent <strong>$' + todaySpendNum.toFixed(2) + '</strong> today, which is more than 2× your daily budget of $' + dailyBudget + '.</p><p>This can happen when Meta\'s algorithm finds high-performing audiences. If this isn\'t expected, you can pause your campaigns.</p><p><a href="' + (process.env.FRONTEND_URL || 'https://creatorship.app') + '/brand#campaigns" style="background:#ffb400;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Review Campaigns</a></p></div>';
        sendEmail(brand.email, '⚠️ Spend alert: $' + todaySpendNum.toFixed(0) + ' today (budget: $' + dailyBudget + '/day)', spendHtml).catch(() => {});
        sendEmail(process.env.ADMIN_EMAIL || 'admin@creatorship.app', '⚠️ Spend alert: ' + brand.email + ' — $' + todaySpendNum.toFixed(0) + ' today (budget: $' + dailyBudget + '/day)', spendHtml).catch(() => {});
      }
      brand.spendAlert = { amount: todaySpendNum, budget: dailyBudget, at: new Date().toISOString() };
    }

    // Save activity log
    brand.cai.activityLog = [...(brand.cai.activityLog || []).slice(-50), ...activity];

    await saveBrand(brand);
    return { success: true, today: brand.cai.performance.today, week: brand.cai.performance.week, activity, adsPolled: adData.length };
  } catch (e) {
    console.error('[cai-poll]', e.message);
    return { error: e.message };
  }
}

// Poll performance for a specific brand
app.post('/api/cai/poll-performance', authBrand, async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  const result = await caiPollPerformance(brand);
  res.json(result);
});

// Admin: poll all active brands (for cron job)
app.post('/api/admin/cai-poll-all', async (req, res) => {
  const brands = await loadBrands();
  const active = brands.filter(b => b.cai?.isActive && b.metaToken);
  const results = [];
  for (const brand of active) {
    const r = await caiPollPerformance(brand);
    results.push({ brandId: brand.id, name: brand.brandName || brand.storeName, ...r });
  }
  res.json({ polled: results.length, results });
});

// Admin: send weekly digest NOW (for testing)
app.post('/api/admin/cai-send-digest', async (req, res) => {
  const { brandId } = req.body;
  const brands = brandId ? [await getBrandById(brandId)].filter(Boolean) : (await loadBrands()).filter(b => b.cai?.isActive && b.email);
  const sent = [];
  for (const brand of brands) {
    if (!brand.email) continue;
    const perf = brand.cai?.performance || {};
    const week = perf.week || {};
    const creatives = brand.cai?.creatives || [];
    const activity = brand.cai?.activityLog || [];
    const activeCount = creatives.filter(c => c.status === 'active').length;
    const pausedCount = creatives.filter(c => c.status === 'paused').length;
    const recentActivity = activity.slice(-5);
    const activityHtml = recentActivity.length > 0
      ? recentActivity.map(a => {
          if (a.type === 'auto_pause') return `<p style="color:#ef4444;font-size:13px;margin:4px 0;">Paused @${a.creator}</p>`;
          if (a.type === 'auto_scale') return `<p style="color:#34d399;font-size:13px;margin:4px 0;">Scaled @${a.creator} budget</p>`;
          if (a.type === 'creator_approved') return `<p style="color:#9b6dff;font-size:13px;margin:4px 0;">@${a.creator} approved — video added to campaign</p>`;
          return '';
        }).join('')
      : '<p style="color:#6b7280;font-size:13px;">No actions this week.</p>';

    try {
      await sendEmail(brand.email, 'CAi Weekly: $' + (week.spend || 0).toFixed(0) + ' spent · ' + (week.roas || 0).toFixed(1) + 'x ROAS',
        emailBase({
          title: (brand.brandName || brand.storeName || 'Brand') + ' — CAi Weekly Digest',
          preheader: '$' + (week.revenue || 0).toFixed(0) + ' revenue this week',
          headerEmoji: '🧠', accentColor: '#9b6dff', accentGradient: 'linear-gradient(135deg,#9b6dff,#0668E1)',
          bodyHtml: `<div style="background:#111827;border-radius:12px;padding:20px;margin-bottom:16px;"><p style="color:#9b6dff;font-weight:700;font-size:12px;margin:0 0 12px;">THIS WEEK</p><div style="display:flex;gap:24px;"><div><p style="color:#e0e4ed;font-size:22px;font-weight:800;margin:0;">$${(week.spend||0).toFixed(0)}</p><p style="color:#6b7280;font-size:11px;margin:2px 0;">spent</p></div><div><p style="color:#34d399;font-size:22px;font-weight:800;margin:0;">$${(week.revenue||0).toFixed(0)}</p><p style="color:#6b7280;font-size:11px;margin:2px 0;">revenue</p></div><div><p style="color:#9b6dff;font-size:22px;font-weight:800;margin:0;">${(week.roas||0).toFixed(1)}x</p><p style="color:#6b7280;font-size:11px;margin:2px 0;">ROAS</p></div></div></div><p style="color:#8b95a8;font-size:13px;">${activeCount} active · ${pausedCount} paused · ${creatives.length} total</p>${activityHtml}`,
          ctaText: 'View Dashboard', ctaUrl: 'https://www.creatorship.app/brand#ai-plans',
        })
      );
      sent.push(brand.email);
    } catch (e) { console.error('[digest] Failed for', brand.email, e.message); }
  }
  res.json({ sent: sent.length, emails: sent });
});

// ═══ CREATOR CONTENT — Product-first creator video discovery ═══
app.get('/api/brand/shop-products', authBrand, async (req, res) => {
  const brandId = req.brandAuth?.brandId;
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  const scrapeKey = process.env.SCRAPE_KEY;
  if (!scrapeKey) return res.status(500).json({ error: 'ScrapeCreators API key not configured' });

  const shopUrl = brand.tikTokShopUrl || brand.tikTokStorePageUrl || '';
  if (!shopUrl) return res.status(400).json({ error: 'No TikTok Shop URL configured' });

  try {
    if (brand.shopProductsCache && brand.shopProductsCacheUpdatedAt) {
      const cacheAge = Date.now() - new Date(brand.shopProductsCacheUpdatedAt).getTime();
      if (cacheAge < 24 * 60 * 60 * 1000) {
        return res.json({ products: brand.shopProductsCache, cached: true });
      }
    }

    // ═══ TRY MULTIPLE URL FORMATS — ScrapeCreators is picky about format ═══
    const handle = (brand.tikTokStorePageUrl || shopUrl || '').match(/@([^/?]+)/)?.[1] || (brand.storeName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const urlsToTry = [
      brand.tikTokShopUrlWorking,
      shopUrl.split('?')[0].replace(/\/+$/, ''),
      'https://www.tiktok.com/@' + handle,
      'https://www.tiktok.com/shop/store/' + handle,
      'https://www.tiktok.com/@' + handle.replace(/-/g, ''),
    ].filter((u, i, a) => u && a.indexOf(u) === i);

    let resp = null;
    let data = null;
    let workingUrl = null;
    for (const tryUrl of urlsToTry) {
      try {
        console.log('[shop-products] Trying URL: ' + tryUrl);
        const r = await fetch('https://api.scrapecreators.com/v1/tiktok/shop/products?url=' + encodeURIComponent(tryUrl) + '&region=US', {
          headers: { 'x-api-key': scrapeKey }
        });
        if (r.ok) {
          const d = await r.json();
          if (d.products && d.products.length > 0) {
            resp = r;
            data = d;
            workingUrl = tryUrl;
            console.log('[shop-products] Success with URL: ' + tryUrl + ' — ' + d.products.length + ' products');
            break;
          } else {
            console.log('[shop-products] URL ' + tryUrl + ' returned OK but 0 products');
          }
        } else {
          console.log('[shop-products] URL ' + tryUrl + ' returned ' + r.status);
        }
      } catch (fetchErr) {
        console.log('[shop-products] URL ' + tryUrl + ' fetch error: ' + fetchErr.message);
      }
    }

    if (!data || !data.products || data.products.length === 0) {
      if (brand.enrichedShop?.products && brand.enrichedShop.products.length > 0) {
        console.log('[shop-products] All ScrapeCreators URLs failed — using enriched shop cache (' + brand.enrichedShop.products.length + ' products)');
        const fallbackProducts = brand.enrichedShop.products.map(p => ({
          id: p.id || p.productId || String(Math.random()),
          title: p.title || p.name || 'Product',
          image: p.image || p.thumbnail || '',
          price: p.price || '0',
          currency: '$',
          sold: p.sold || 0,
          formatSold: p.formatSold || '',
          rating: p.rating || 0,
          reviewCount: p.reviewCount || 0,
          url: p.url || '',
        }));
        brand.shopProductsCache = fallbackProducts;
        brand.shopProductsCacheUpdatedAt = new Date().toISOString();
        await saveBrand(brand);
        return res.json({ products: fallbackProducts, cached: false, source: 'enriched_shop_fallback' });
      }
      return res.status(404).json({ error: 'No products found. Tried ' + urlsToTry.length + ' URL formats.' });
    }

    if (workingUrl && workingUrl !== shopUrl) {
      brand.tikTokShopUrlWorking = workingUrl;
      console.log('[shop-products] Saved working URL format: ' + workingUrl);
    }

    const products = (data.products || []).map(p => ({
      id: p.product_id || p.id,
      title: p.title || 'Product',
      image: p.image?.url_list?.[0] || p.image?.url || '',
      price: p.product_price_info?.sale_price_decimal || p.product_price_info?.origin_price_decimal || '0',
      currency: p.product_price_info?.currency_symbol || '$',
      sold: p.sold_info?.sold_count || 0,
      formatSold: p.sold_info?.format_sold_count || '',
      rating: p.review_info?.overall_review_star || 0,
      reviewCount: p.review_info?.total_review_count || 0,
      url: 'https://www.tiktok.com/shop/pdp/' + (p.product_id || p.id),
    })).sort((a, b) => (b.sold || 0) - (a.sold || 0));

    brand.shopProductsCache = products;
    brand.shopProductsCacheUpdatedAt = new Date().toISOString();
    await saveBrand(brand);

    res.json({ products, cached: false });
  } catch (e) {
    console.error('[shop-products] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/brand/product-creators', authBrand, async (req, res) => {
  const brandId = req.brandAuth?.brandId;
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  const scrapeKey = process.env.SCRAPE_KEY;
  if (!scrapeKey) return res.status(500).json({ error: 'ScrapeCreators API key not configured' });

  const { productId, productUrl } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId required' });

  const brandHandle = (brand.tikTokStorePageUrl || '').match(/@([^/?]+)/)?.[1]?.toLowerCase() || (brand.storeName || '').toLowerCase().replace(/\s+/g, '');

  try {
    const cacheKey = 'productCreators_' + productId;
    const forceRefresh = req.body.force === true;
    const cached = brand[cacheKey];
    if (!forceRefresh && cached && cached.updatedAt) {
      const cacheAge = Date.now() - new Date(cached.updatedAt).getTime();
      if (cacheAge < 12 * 60 * 60 * 1000) {
        return res.json({ videos: cached.videos, cached: true });
      }
    }

    const url = productUrl || ('https://www.tiktok.com/shop/pdp/' + productId);
    console.log('[product-creators] Fetching creator videos for product ' + productId);

    const resp = await fetch(
      'https://api.scrapecreators.com/v1/tiktok/product?url=' + encodeURIComponent(url) + '&get_related_videos=true&region=US',
      { headers: { 'x-api-key': scrapeKey } }
    );
    if (!resp.ok) return res.status(502).json({ error: 'ScrapeCreators returned ' + resp.status });
    const data = await resp.json();

    const relatedVideos = data.related_videos || [];
    const productInfo = data.product_info || {};
    if (relatedVideos.length > 0) console.log('[product-creators] Raw video keys:', JSON.stringify(Object.keys(relatedVideos[0])).slice(0, 200), 'aweme_info keys:', relatedVideos[0].aweme_info ? JSON.stringify(Object.keys(relatedVideos[0].aweme_info)).slice(0, 200) : 'none');

    const creatorVideos = relatedVideos.filter(rv => {
      const author = rv.aweme_info?.author || rv;
      const ah = (author.unique_id || rv.unique_id || ((rv.url || '').match(/@([^/]+)/)?.[1]) || '').toLowerCase().replace(/^@/, '');
      return ah && ah !== brandHandle;
    }).map(rv => {
      const author = rv.aweme_info?.author || rv;
      const stats = rv.aweme_info?.statistics || rv.statistics || rv;
      return {
        id: String(rv.aweme_id || rv.video_id || rv.id || Date.now() + Math.random()),
        desc: (rv.aweme_info?.desc || rv.desc || rv.title || '').slice(0, 200),
        views: stats.play_count || rv.play_count || rv.views || 0,
        likes: stats.digg_count || rv.digg_count || rv.likes || 0,
        comments: stats.comment_count || rv.comment_count || 0,
        shares: stats.share_count || rv.share_count || 0,
        cover: rv.aweme_info?.video?.cover?.url_list?.[0] || rv.aweme_info?.video?.origin_cover?.url_list?.[0] || rv.aweme_info?.video?.dynamic_cover?.url_list?.[0] || rv.video?.cover?.url_list?.[0] || rv.video?.origin_cover?.url_list?.[0] || rv.cover_url || rv.thumbnail_url || rv.thumbnail || rv.cover || '',
        authorHandle: author.unique_id || rv.unique_id || ((rv.url || '').match(/@([^/]+)/)?.[1]) || '',
        authorNickname: author.nickname || rv.author_name || '',
        authorAvatar: author.avatar_thumb?.url_list?.[0] || rv.author_avatar_url || '',
        tiktokUrl: rv.url || ('https://www.tiktok.com/@' + (author.unique_id || rv.unique_id || ((rv.url || '').match(/@([^/]+)/)?.[1]) || '') + '/video/' + (rv.aweme_id || rv.video_id || '')),
        downloadUrl: (rv.aweme_info?.video?.download_addr?.url_list || [])[0] || '',
        playUrl: (rv.aweme_info?.video?.play_addr?.url_list || [])[0] || rv.content_url || rv.video_url || '',
        isAffiliate: !!(rv.bc_ad_label_text || rv.is_eligible_for_commission),
        _productId: productId,
      };
    }).sort((a, b) => (b.views || 0) - (a.views || 0));

    brand[cacheKey] = { videos: creatorVideos, updatedAt: new Date().toISOString() };
    await saveBrand(brand);

    console.log('[product-creators] Found ' + creatorVideos.length + ' creator videos for product ' + productId);
    res.json({
      videos: creatorVideos,
      count: creatorVideos.length,
      productTitle: productInfo.product_base?.title || '',
      cached: false,
    });
  } catch (e) {
    console.error('[product-creators] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══ CAi RECOMMENDATIONS ENGINE — pattern-based campaign suggestions ═══
function generateCampaignRecommendations(brand) {
  const recs = [];
  const creatives = brand.cai?.creatives || [];
  const allCamps = getCaiCampaigns(brand);
  const performance = brand.cai?.performance || {};
  const today = performance.today || {};
  const week = performance.week || {};
  const roasTarget = brand.cai?.roasTarget || 3;
  const monthlyBudget = brand.cai?.monthlyBudget || 0;
  const tiktokVideos = brand.tiktokVideosCache || [];

  const brandHandle = (brand.storeName || '').toLowerCase().replace(/\s+/g, '').replace(/^@/, '');
  const creatorAds = creatives.filter(c => {
    const ch = (c.creatorHandle || c.creator || '').toLowerCase().replace(/^@/, '');
    return ch && ch !== brandHandle;
  });
  const brandAds = creatives.filter(c => {
    const ch = (c.creatorHandle || c.creator || '').toLowerCase().replace(/^@/, '');
    return !ch || ch === brandHandle;
  });
  if (creatorAds.length > 0 && brandAds.length > 0) {
    const creatorRoas = creatorAds.reduce((s, c) => s + (c.lastMetrics?.roas || 0), 0) / creatorAds.length;
    const brandRoas = brandAds.reduce((s, c) => s + (c.lastMetrics?.roas || 0), 0) / brandAds.length;
    if (creatorRoas > brandRoas * 1.5 && creatorRoas > 0) {
      recs.push({ priority: 1, emoji: '🎯', text: 'Creator content outperforms brand content by ' + Math.round((creatorRoas / Math.max(brandRoas, 0.1) - 1) * 100) + '%. Consider adding more creator videos.', type: 'content_mix' });
    } else if (brandRoas > creatorRoas * 1.5 && brandRoas > 0) {
      recs.push({ priority: 1, emoji: '🎯', text: 'Your brand content is outperforming creator content. Double down on your strongest brand videos.', type: 'content_mix' });
    }
  }

  const fatigued = creatives.filter(c => c.status === 'fatigued');
  const fatiguedPct = creatives.length > 0 ? fatigued.length / creatives.length : 0;
  if (fatiguedPct > 0.5) {
    recs.push({ priority: 1, emoji: '⚠️', text: Math.round(fatiguedPct * 100) + '% of your ads are fatigued. Add fresh content from the Content Library to maintain performance.', type: 'fatigue' });
  } else if (fatigued.length > 0) {
    recs.push({ priority: 2, emoji: '⚠️', text: fatigued.length + ' ad' + (fatigued.length > 1 ? 's are' : ' is') + ' showing fatigue. Check the Campaigns tab for details.', type: 'fatigue' });
  }

  const inCampIds = new Set(creatives.map(c => String(c.videoId)));
  const unusedHighPerf = tiktokVideos.filter(v => !inCampIds.has(String(v.id)) && (v.views || 0) > 1000000);
  if (unusedHighPerf.length > 0) {
    recs.push({ priority: 2, emoji: '🆕', text: unusedHighPerf.length + ' video' + (unusedHighPerf.length > 1 ? 's' : '') + ' with 1M+ views ' + (unusedHighPerf.length > 1 ? 'are' : 'is') + ' not in any campaign. Add them from the Content Library for more ad variety.', type: 'unused_content' });
  }

  if (week.spend > 0 && week.roas < roasTarget * 0.5) {
    recs.push({ priority: 1, emoji: '💰', text: 'This week\'s ROAS (' + (week.roas || 0).toFixed(1) + 'x) is well below your ' + roasTarget.toFixed(1) + 'x target. Consider pausing underperformers or reducing budget while testing new creatives.', type: 'budget' });
  } else if (week.spend > 0 && week.roas > roasTarget * 2) {
    recs.push({ priority: 2, emoji: '🚀', text: 'ROAS is ' + (week.roas || 0).toFixed(1) + 'x — ' + Math.round(week.roas / roasTarget) + 'x above target! Consider increasing daily budget to capture more conversions while performance is hot.', type: 'budget' });
  }

  const activeCreatives = creatives.filter(c => c.status === 'active');
  if (activeCreatives.length < 10 && tiktokVideos.length > activeCreatives.length) {
    recs.push({ priority: 2, emoji: '📊', text: 'Only ' + activeCreatives.length + ' active ad' + (activeCreatives.length !== 1 ? 's' : '') + '. Meta\'s algorithm improves with volume — top brands test 20-100+ creatives. Add more from the Content Library.', type: 'creative_volume' });
  }

  if (!performance.lastPolledAt) {
    recs.push({ priority: 3, emoji: '📡', text: 'No performance data yet. Click "Refresh Metrics" to pull the latest from Meta.', type: 'no_data' });
  } else {
    const hoursSincePoll = (Date.now() - new Date(performance.lastPolledAt).getTime()) / 3600000;
    if (hoursSincePoll > 24) {
      recs.push({ priority: 3, emoji: '📡', text: 'Performance data is ' + Math.round(hoursSincePoll) + ' hours old. Click "Refresh Metrics" for the latest.', type: 'stale_data' });
    }
  }

  const topAd = [...creatives].sort((a, b) => (b.lastMetrics?.roas || 0) - (a.lastMetrics?.roas || 0))[0];
  if (topAd && (topAd.lastMetrics?.roas || 0) > roasTarget && (topAd.lastMetrics?.spend || 0) > 5) {
    recs.push({ priority: 3, emoji: '⭐', text: 'Top performer: @' + (topAd.creatorHandle || topAd.creator || 'creator') + ' (' + (topAd.tier || 'ad') + ') at ' + (topAd.lastMetrics.roas || 0).toFixed(1) + 'x ROAS. This content style is resonating with your audience.', type: 'top_performer' });
  }

  return recs.sort((a, b) => a.priority - b.priority);
}

app.get('/api/cai/recommendations', authBrand, async (req, res) => {
  const brand = await getBrandById(req.brandAuth?.brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  const recs = generateCampaignRecommendations(brand);
  res.json({ recommendations: recs, count: recs.length });
});

// CAi System Intelligence — version, capabilities, changelog, self-improvement recommendations
// ═══ SHARED: Add a video to an active CAi campaign (used by both /api/cai/add-creative and /api/launch routing) ═══
async function caiAddCreativeToActiveCampaign(brand, videoId, primaryText, headline) {
  if (!brand?.cai?.campaign?.id) throw new Error('No active campaign. Activate CAi first.');
  const metaToken = brand.metaToken;
  const adAccount = brand.adAccount;
  const pageId = brand.pageId;
  const adsetId = brand.cai.campaign.adsetId;
  const websiteUrl = brand.websiteUrl || brand.storeUrl || '';

  // Find video in content pool
  const allVideos = [
    ...(brand.tiktokVideosCache || []),
    ...(brand.uploads || []).filter(u => u.videoUrl).map(u => ({
      id: u.id, desc: u.title || '', downloadUrl: u.videoUrl, authorHandle: u.creatorHandle || '',
    })),
  ];
  const video = allVideos.find(v => String(v.id) === String(videoId));
  if (!video) throw new Error('Video not found in content pool');

  // ═══ FRESH URL: Re-fetch from ScrapeCreators to get non-expired CDN URLs ═══
  let videoUrl = video.downloadUrl || '';
  const handle = video.authorHandle || brand.tikTokStorePageUrl?.match(/@([^/?]+)/)?.[1] || brand.tikTokStorePageUrl?.match(/\/shop\/store\/([^/]+)/)?.[1] || (brand.storeName || brand.brandName || '').toLowerCase().replace(/\s+/g, '');
  const scrapeKey = process.env.SCRAPE_KEY;

  if (scrapeKey && handle) {
    try {
      const freshResp = await fetch(
        `https://api.scrapecreators.com/v1/tiktok/profile/videos?handle=${encodeURIComponent(handle)}&limit=30`,
        { headers: { 'x-api-key': scrapeKey } }
      );
      if (freshResp.ok) {
        const freshData = await freshResp.json();
        const rawVideos = freshData.aweme_list || freshData.data || freshData.videos || freshData.posts || [];
        const match = rawVideos.find(fv => String(fv.aweme_id || fv.id) === String(video.id));
        if (match) {
          const freshDlUrls = match.video?.download_addr?.url_list || [];
          const freshPlayUrls = match.video?.play_addr?.url_list || [];
          const freshUrl = freshDlUrls[0] || '';
          if (freshUrl) { videoUrl = freshUrl; console.log('[cai-add] Freshened URL for video ' + video.id); }
        }
      }
    } catch (_) {}
  }

  if (!videoUrl) throw new Error('No video URL available');

  // Download + upload
  const dlResp = await fetch(videoUrl, { headers: TIKTOK_DL_HEADERS });
  if (!dlResp.ok) throw new Error('Video download failed — CDN URL may be expired');
  const ct = (dlResp.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/json')) throw new Error('Video CDN returned ' + ct + ' — URL expired');
  const videoBuffer = Buffer.from(await dlResp.arrayBuffer());
  if (videoBuffer.length < 10000) throw new Error('Video file too small (' + videoBuffer.length + ' bytes)');

  const up = await metaUploadVideo(videoBuffer, '[CAi] ' + (video.authorHandle || 'creator'), metaToken, adAccount);
  const metaVideoId = up.id || up.video_id;
  await metaWaitForVideo(metaVideoId, metaToken, 60000);

  const spec = {
    page_id: pageId,
    video_data: {
      video_id: metaVideoId,
      message: primaryText || video.desc || '',
      title: headline || (brand.brandName || brand.storeName || '') + ' — Shop Now',
      image_url: 'https://img.freepik.com/free-photo/abstract-surface-textures-white-concrete-stone-wall_1258-14525.jpg',
      call_to_action: { type: 'SHOP_NOW', value: { link: websiteUrl || brand.storeUrl || brand.tikTokShopUrl || ('https://' + (brand.storeName || 'shop').toLowerCase().replace(/[^a-z0-9]/g, '') + '.com') } },
    },
  };
  const adName = '[CAi] ' + (video.authorHandle || 'creator');
  const cr = await metaPost(adAccount + '/adcreatives', { name: adName, object_story_spec: JSON.stringify(spec), access_token: metaToken });
  const ad = await metaPost(adAccount + '/ads', { name: adName, adset_id: adsetId, creative: JSON.stringify({ creative_id: cr.id }), status: 'ACTIVE', access_token: metaToken });

  // Update brand CAi state
  brand.cai.creatives = brand.cai.creatives || [];
  brand.cai.creatives.push({
    videoId: video.id, adId: ad.id, creativeId: cr.id, metaVideoId,
    creator: video.authorHandle || 'creator', hookScore: 0, tier: 'test',
    status: 'active', addedAt: new Date().toISOString(), daysActive: 0, lastMetrics: {},
  });

  // Increase campaign budget ($30/day per new creative)
  try {
    const campData = await apiFetch('https://graph.facebook.com/v22.0/' + brand.cai.campaign.id + '?fields=daily_budget&access_token=' + metaToken);
    const currentBudget = parseInt(campData?.daily_budget || '0');
    await metaPost(brand.cai.campaign.id, { daily_budget: currentBudget + 3000, access_token: metaToken });
  } catch (_) {}

  await saveBrand(brand);
  return { success: true, adId: ad.id, totalCreatives: brand.cai.creatives.length };
}

const CAI_CAPABILITIES = [
  // ═══ SHIPPED (v3.0) ═══
  { name: 'Volume-First Ad Testing', status: 'active', desc: 'Load ALL content as ads (20-500), Meta CBO finds winners. TikTok views ≠ Meta performance.' },
  { name: 'Multi-Campaign Management', status: 'active', desc: 'Always-on, promotions, A/B tests — create and manage multiple campaigns simultaneously' },
  { name: 'Auto-Performance Polling', status: 'active', desc: 'Every 4h: pulls spend, ROAS, CTR, CPA from Meta Insights per ad' },
  { name: 'Auto-Pause Underperformers', status: 'active', desc: 'Pauses ads with CPA >2× target for 3+ consecutive polls — zero wasted spend' },
  { name: 'Auto-Scale Winners', status: 'active', desc: 'Increases budget 20% when ROAS exceeds target for 3+ polls' },
  { name: 'Creative Fatigue Detection', status: 'active', desc: 'CTR drop 40%+ from peak → flagged. Budget-adjusted thresholds ($500/d=10d, $100/d=21d)' },
  { name: 'Weekly Digest Email', status: 'active', desc: 'Sunday 9am: spend, ROAS, activity log, recommendations' },
  { name: 'Daily Content Auto-Refresh', status: 'active', desc: 'Scans TikTok daily for new videos, updates content library' },
  { name: 'AI Deep Dive Analysis', status: 'active', desc: 'Brand intelligence, ad strategy blueprint, content audit, revenue model, action items' },
  { name: 'Product-First Creator Discovery', status: 'active', desc: 'Browse TikTok Shop products → see all affiliate creators per product' },
  { name: 'Creator Outreach System', status: 'active', desc: 'Pre-written DM templates, copy button, TikTok link for usage rights requests' },
  { name: 'Source Intelligence', status: 'active', desc: 'Creator vs Brand vs Upload tracking with per-source performance breakdown' },
  { name: 'AI Ad Copy Generation', status: 'active', desc: 'DTC conversion copy per video — headlines, primary text, CTA' },
  { name: 'Hook Analysis & Scoring', status: 'active', desc: 'First 2 seconds analyzed, scroll-stopping power scored 0-100' },
  { name: 'CBO Campaign Structure', status: 'active', desc: 'Advantage+ Sales campaigns with campaign-level budget optimization' },
  { name: 'Broad Targeting', status: 'active', desc: 'Advantage+ Audience — Meta finds buyers, no micro-targeting needed' },
  { name: 'Campaign Recommendations', status: 'active', desc: 'Contextual suggestions: content gaps, fatigue alerts, budget efficiency, scaling opportunities' },
  { name: 'Toast & Modal System', status: 'active', desc: 'Styled notifications and confirm dialogs — zero native browser alerts' },
  { name: 'URL-Routed Navigation', status: 'active', desc: 'Every tab has a URL (#dashboard, #campaigns, #content, etc.)' },
  { name: 'Centralized Version System', status: 'active', desc: 'One line in server.js updates version everywhere — API, frontend, homepage' },

  // ═══ IN PROGRESS (March 16-31) ═══
  { name: 'Drag & Drop Video Upload', status: 'planned', desc: 'Drop MP4 files directly into Uploads tab — multer backend, Railway volume storage' },
  { name: 'Video Player Modal', status: 'planned', desc: 'Click any creator thumbnail → inline video player with autoplay' },
  { name: 'Mobile Responsive', status: 'planned', desc: 'Full mobile experience — dashboard, campaigns, content all work on phone' },
  { name: 'TikTok Developer App Approval', status: 'planned', desc: 'Submit production app for TikTok OAuth — demo video ready, privacy/terms live' },
  { name: 'Stripe Test → Live Switch', status: 'planned', desc: 'Flip Stripe to live mode, enable real 4% billing on managed ad spend' },

  // ═══ APRIL 2026 ═══
  { name: 'TikTok Shop Partner API', status: 'roadmap', desc: 'Brand TikTok Shop OAuth → full affiliate creator list, not just public page scraping' },
  { name: 'In-App Creator DMs', status: 'roadmap', desc: 'Send usage rights requests directly from Creatorship via TikTok Shop messaging API' },
  { name: 'Approval Status Tracking', status: 'roadmap', desc: 'Track creator responses: Pending → Approved → In Campaign → Earning' },
  { name: 'Meta Conversions API (CAPI)', status: 'roadmap', desc: 'Server-side event tracking for accurate conversion attribution without iOS limitations' },
  { name: 'Bulk Creative Upload', status: 'roadmap', desc: 'Select 50-500 videos at once → one-click load all into campaign' },
  { name: 'Self-Serve Onboarding', status: 'roadmap', desc: 'Brand signs up → connects TikTok + Meta → CAi activated in under 90 seconds' },
  { name: 'Creator Licensing Agreements', status: 'roadmap', desc: 'In-app content rights contracts with e-sign — legal protection for both parties' },
  { name: 'Auto-Invoice & Billing', status: 'roadmap', desc: 'Monthly Stripe invoices, managed ad spend metering, payment failure handling' },

  // ═══ MAY 2026 ═══
  { name: 'ML-Driven Optimization', status: 'roadmap', desc: 'Machine learning model trained on historical performance — predicts ROAS before spend' },
  { name: 'Creative Intelligence Reports', status: 'roadmap', desc: 'Weekly AI report: what hooks convert, which audiences respond, optimal video length' },
  { name: 'Multi-Brand Dashboard', status: 'roadmap', desc: 'Agency view — manage 10-50 brands from one login with cross-brand analytics' },
  { name: 'Cross-Platform (Meta + TikTok Ads)', status: 'roadmap', desc: 'Same creatives on Meta and TikTok simultaneously, compare performance side-by-side' },
  { name: 'Creator Revenue Share', status: 'roadmap', desc: 'Creators earn % of ad revenue from their content — tracked and paid automatically' },
  { name: 'Automated A/B Testing', status: 'roadmap', desc: 'CAi creates split tests automatically — hooks, copy variants, thumbnail tests' },
  { name: 'Webhook Integrations', status: 'roadmap', desc: 'Slack notifications, Zapier triggers for campaign events, Shopify order sync' },
  { name: 'White-Label Mode', status: 'roadmap', desc: 'Agencies rebrand Creatorship as their own tool — custom domain, logo, colors' },

  // ═══ JUNE 2026 TARGET ═══
  { name: 'ROAS Protection', status: 'roadmap', desc: 'Refund ad credit if CAi fails to hit 90% of target ROAS (GMV Max model)' },
  { name: 'API Access for Agencies', status: 'roadmap', desc: 'REST API to manage brands, campaigns, creatives programmatically' },
  { name: '50+ Brands Live', status: 'roadmap', desc: 'Target: 50 brands with active CAi campaigns managing $500K+/mo total ad spend' },
  { name: 'SOC 2 Compliance', status: 'roadmap', desc: 'Enterprise security certification for large brand partnerships' },
];

const CAI_CHANGELOG = [
  { version: '3.3.0', date: '2026-03-17', changes: [
    'Smart Estimation Engine: category-aware CPA/ROAS benchmarks for 8 product categories',
    'Business model detection: subscription vs one-time vs bundle — adjusts CPA, ROAS, and LTV projections',
    'Content Score rubric: transparent 100-point scoring across volume, reach, engagement, shares, consistency, recency',
    'First-purchase vs LTV ROAS: subscription brands see both metrics with explanation',
    'CAi Video Qualification System: scoring engine for future TikTok Shop Partner API (handles thousands of videos)',
    'Fast-track rules: videos with 2+ sales, 100K+ views, or 500+ shares auto-qualify',
    'Realistic projections with delivery rate model — higher ROAS targets show lower delivery estimates',
    'CRITICAL: Watermark-safe video URLs — prefer play_addr / nwm over download_addr for Meta uploads; re-fetch via ScrapeCreators when needed',
    'Meta Pixel auto-fetch during OAuth + attach to campaigns + fallback to TRAFFIC if no pixel',
    'Meta campaign sync: verify campaign status against Meta every 5 min + manual Sync button',
    'Analysis page "Why CAi Tests Videos You\'d Never Consider" value section',
  ]},
  { version: '3.2.0', date: '2026-03-17', changes: [
    'Analysis page redesign: renamed sections (Your Brand Profile, Your Ad-Ready Videos, Creator Videos — License to Run as Ads)',
    'Pipeline badges on every video card: Download → Reformat for Meta → Generate ad copy → Launch paused',
    'Ad Strategy approach vs GMV Max side-by-side comparison layout',
    'Single "Let CAi Run" CTA — removed Manual button confusion, manual noted as available later',
    '"Don\'t have a Meta ads account?" 5-step setup guide with direct links',
    'Page ID yellow warning banner — impossible to miss before connecting Meta',
    'ROAS colors flipped: low = green (safe), high = yellow/red (aggressive)',
    'CAi version system: CAI_VERSION + CAI_CHANGELOG constants, /api/version endpoint',
    'Landing page hero: shorter text, purple gradient background, radial glow',
    'Purple logo gradient across all pages',
  ]},
  { version: '3.1.0', date: '2026-03-17', changes: [
    'SECURITY: Password-confirmed account deletion — requires current password + uses JWT brandId',
    'SECURITY: Rate limiting on login (10/15min), signup (5/hr), password reset (10/15min)',
    'SECURITY: Meta token expiry checking — getValidMetaToken() validates before every API call',
    'SECURITY: Email verification gate — must verify email before activating CAi',
    'SECURITY: OAuth CSRF protection for Meta callback',
    'SECURITY: Data isolation — req.brandAuth.brandId from JWT, not req.body',
    'SECURITY: saveBrand wrapped in try/catch — server won\'t crash on Supabase failures',
    'Meta health check: validates payment method, permissions, account status, Page access before activation',
    'Creator outreach: explicit authorization via modal during activation (not auto-approved on signup)',
    'Outreach auth moved to Step 3 in visible setup flow + outreachAuthorizedViaModal flag',
    '4-step setup: Connect Meta → Select Page → Authorize Outreach → Verify Email',
    'Setup block stays visible until ALL 4 steps complete (not just Meta connected)',
    'Deep dive overlay: position fixed, lighter blur, see background',
    'Activation building overlay: lighter blur, profile checklist',
    'Deep dive auto-start: won\'t re-run after Meta redirect, checks URL params + stored data',
    '#optimize hash initializes mode to auto — budget page shows after Meta redirect',
    'Clicking Analysis during setup redirects to optimize instead of welcome screen',
    'Stripe-branded payment UI with trust signals, Current Period spinner bug fixed',
    'Budget defaults: Growth tier pre-selected, ROAS default 2.0x, removed CAi dot',
    'React Error Boundary with friendly fallback UI',
    'beforeunload warning during campaign activation',
    'Hidden tabs during onboarding — only Dashboard + Account until deep dive runs',
    'Audit log for destructive actions (requires audit_log table in Supabase)',
    'Password strength: requires uppercase + number',
    'ConfirmModal supports **bold** markdown syntax',
    'Health check deep-links to specific ad account billing page',
    'Email verification redirects to /brand#optimize',
    'Brand avatar uses shopLogo first, unavatar.io as fallback',
    'Shop products endpoint: 4 URL format fallback chain + enriched shop data fallback',
    '"CAi found your shop" banner on signup enrichment',
    'Light theme overhaul: white inputs, visible borders, proper card contrast',
  ]},
  { version: '3.0.0', date: '2026-03-16', changes: [
    'Volume-first ad strategy: test all content, Meta decides winners — not 5 picks',
    'Navigation overhaul: single-row header, URL routing per tab (#dashboard, #campaigns, etc.)',
    'Dashboard redesign: budget pacing, conversion funnel, campaign status, untapped content thumbnails',
    'Content tab: 3 sections — Your Content / Creator Content / Uploads',
    'Creator Content: product-first discovery — browse TikTok Shop products, find affiliate creator videos',
    'Creator outreach modal: pre-written DM templates, copy button, TikTok link',
    'Analysis tab: agency-grade deep dive report with revenue model and action items',
    'Optimize tab: ROAS strategy guide, budget context, How CAi Works, changelog dropdown',
    'Toast notification system: all browser alerts/confirms replaced with styled modals',
    'Multi-campaign support (promotions, A/B tests, always-on)',
    'Auto-poll every 4h, weekly digest email, daily content refresh',
    'Campaign recommendations engine, source intelligence',
    'Centralized version system: update once, propagates everywhere',
  ] },
  { version: '2.4.0', date: '2026-03-14', changes: ['6-hour performance polling cron — all active brands polled automatically', 'Weekly digest email: spend, revenue, ROAS, active/paused ads, CAi actions', 'Creator auto-add: approved creator videos auto-added to CAi campaign', 'Dashboard shows CAi status + performance when active', 'Admin: manual digest trigger endpoint', 'Admin: poll-all endpoint for manual cron trigger'] },
  { version: '2.3.2', date: '2026-03-14', changes: ['CMO metrics in terminal, full analysis rebuild, revenue modeling'] },
  { version: '2.3.0', date: '2026-03-14', changes: ['Live performance dashboard: today/this week spend, revenue, ROAS, CPA', 'Meta Insights polling: real per-ad metrics from Meta API', 'Auto-pause: ads with CPA >2x target for 3+ polls get paused automatically', 'Auto-scale: campaign budget +20% when ROAS exceeds target for 3+ polls', 'Creative fatigue detection: flags ads at 21+ days', 'Activity feed: live log of CAi decisions (pauses, scales, flags)'] },
  { version: '2.2.1', date: '2026-03-14', changes: ['Removed Creators and Content tabs — CAi is the product', 'Default landing is CAi tab', 'Legacy v1.0 endpoints archived'] },
  { version: '2.1.0', date: '2026-03-14', changes: ['Deep Dive: personalized brand analysis before activation', 'Two modes: Let CAi Run (auto) vs Manual with CAi Assist', 'Trust-building flow: analyze → recommend → choose mode → activate', 'Live activity feed showing CAi decisions in real-time', 'Brand-specific hook descriptions and content scoring'] },
  { version: '2.0.0', date: '2026-03-14', changes: ['Always-on campaign system (GMV Max model)', 'One CBO campaign per brand with Advantage+ targeting', 'Auto-routing: launches add to existing campaign', 'DTC media buying knowledge baked into all prompts', 'Hook-focused reasoning instead of marketing analytics', 'Creative scoring with dailyBudget and CPA estimates'] },
  { version: '1.5.0', date: '2026-03-14', changes: ['Unified launch modal — CAi builds entire campaign', 'One-click launch with AI-set budget, targeting, copy', 'Unified card design across Content, Creators, CAi Plans'] },
  { version: '1.0.0', date: '2026-03-13', changes: ['Initial CAi — ad copy generation', 'Campaign plan streaming', 'Video scoring (0-100)', 'Revenue/ROAS predictions'] },
];

const CAI_META_UPDATES = [
  { source: 'Meta Q2 2025', insight: 'Advantage+ Sales Campaigns deliver 22% higher ROAS than manual', applied: true },
  { source: 'Meta 2025', insight: 'New ads can be added without resetting learning phase', applied: true },
  { source: 'Meta 2025', insight: 'Max 150 ads per campaign, 50 per ad set', applied: true },
  { source: 'Billo 2025', insight: '70-80% of ad performance comes from creative quality', applied: true },
  { source: 'Meta API v25 (Q1 2026)', insight: 'Unified Advantage+ campaign structure — legacy ASC deprecated', applied: false, action: 'Migrate to new API structure when v25 launches' },
  { source: 'Meta 2026', insight: 'Full AI ad creation — supply goal + budget + product image, Meta builds everything', applied: false, action: 'Evaluate if we should let Meta generate creatives or keep CAi control' },
  { source: 'GMV Max', insight: 'Creative volume is THE most critical factor for algorithm performance', applied: true },
  { source: 'GMV Max', insight: 'ROI Protection — refund if <90% of target (20+ daily orders required)', applied: false, action: 'Build ROAS Protection feature for Creatorship brands' },
];

// ═══ ADMIN: Version propagation check ═══
app.get('/api/admin/version-check', async (req, res) => {
  res.json({
    serverVersion: CAI_VERSION,
    locations: [
      { where: 'server.js CAI_VERSION', value: CAI_VERSION, source: 'server' },
      { where: '/api/cai/system-info', value: CAI_VERSION, source: 'api' },
      { where: 'App.jsx CAI_VER (dynamic)', value: 'Fetched from API at load', source: 'frontend' },
      { where: 'CaiBadge component', value: 'Uses sysInfo.version or CAI_VER fallback', source: 'frontend' },
      { where: 'PoweredByCai (homepage)', value: 'Uses CAI_VER (updated from API)', source: 'frontend' },
      { where: 'Optimize tab trust section', value: 'Uses sysInfo.version', source: 'frontend' },
      { where: 'Deep Dive terminal', value: 'Uses CAI_VER', source: 'frontend' },
      { where: 'Activation terminal', value: 'Uses CAI_VER', source: 'frontend' },
      { where: 'Profile dropdown', value: 'Uses sysInfo.version (brand portal only)', source: 'frontend' },
    ],
    howToUpdate: 'Change CAI_VERSION in server.js line ~6596. Add a changelog entry to CAI_CHANGELOG. Push to main. All frontend locations auto-update from /api/cai/system-info.',
    changelog: CAI_CHANGELOG,
    currentCapabilities: CAI_CAPABILITIES.filter(c => c.status === 'active').length + ' active, ' + CAI_CAPABILITIES.filter(c => c.status === 'planned').length + ' planned',
  });
});

app.get('/api/cai/system-info', async (req, res) => {
  res.json({
    version: CAI_VERSION,
    capabilities: CAI_CAPABILITIES,
    changelog: CAI_CHANGELOG,
    metaUpdates: CAI_META_UPDATES,
    activeCount: CAI_CAPABILITIES.filter(c => c.status === 'active').length,
    plannedCount: CAI_CAPABILITIES.filter(c => c.status === 'planned').length,
    roadmapCount: CAI_CAPABILITIES.filter(c => c.status === 'roadmap').length,
    knowledgeSources: ['Meta Q2 2025 Earnings', 'Meta Ads API v22-24 docs', 'Billo Creative Research 2025', 'TikTok GMV Max documentation', 'Jon Loomer 83 Meta Changes 2025', 'DTC agency benchmarks ($30M+/yr managed spend)'],
  });
});

// Admin: CAi overview across all brands
app.get('/api/admin/cai-overview', async (req, res) => {
  const brands = await loadBrands();
  const caiActive = brands.filter(b => b.cai?.isActive);
  const caiEverActivated = brands.filter(b => b.cai?.activatedAt);
  const totalCreatives = caiActive.reduce((s, b) => s + (b.cai?.creatives?.length || 0), 0);
  const totalBudget = caiActive.reduce((s, b) => s + (b.cai?.monthlyBudget || 0), 0);

  res.json({
    version: CAI_VERSION,
    totalBrands: brands.length,
    caiActiveCount: caiActive.length,
    caiEverActivated: caiEverActivated.length,
    totalCreativesManaged: totalCreatives,
    totalMonthlyBudget: totalBudget,
    brands: caiActive.map(b => ({
      id: b.id,
      name: b.brandName || b.storeName || b.email || 'Unknown',
      monthlyBudget: b.cai?.monthlyBudget || 0,
      roasTarget: b.cai?.roasTarget || 0,
      creativesCount: b.cai?.creatives?.length || 0,
      activatedAt: b.cai?.activatedAt,
      campaignId: b.cai?.campaign?.id,
    })),
    capabilities: CAI_CAPABILITIES,
    changelog: CAI_CHANGELOG,
    metaUpdates: CAI_META_UPDATES,
    needsAttention: CAI_META_UPDATES.filter(u => !u.applied),
  });
});

// ═══ LEGACY v1.0 — Archived endpoints, not exposed in UI. Kept for backward compatibility. ═══
// Legacy ad copy endpoint
app.post('/api/ai/generate-ad-copy', authBrand, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI not configured' });
  const { brandId, videoData, productTitle, productPrice } = req.body;
  if (!brandId) return res.status(400).json({ error: 'brandId required' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  const vid = videoData || {};
  const brandName = brand.brandName || brand.storeName || '';
  const price = productPrice || brand.avgProductPrice || 0;
  const brief = brand.caiBrief || '';
  const prompt = `You are a Meta Ads copywriter. Write ad copy for this TikTok video as a Meta ad.\nBRAND: ${brandName}\nPRODUCT: ${productTitle || brandName} ${price ? '($' + price + ')' : ''}\nVIDEO: ${(vid.desc || vid.caption || '').slice(0, 300)}\nVIEWS: ${vid.views || 0} | LIKES: ${vid.likes || 0} | CREATOR: @${vid.authorHandle || vid.creator || 'creator'}\n${brief ? 'BRIEF: ' + brief : ''}\nReturn ONLY JSON: { "primaryText": "max 200 chars", "headline": "under 40 chars", "description": "under 80 chars" }\nWrite like a DTC brand. No hashtags. No emojis in headline.`;
  try {
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }) });
    if (!aiResp.ok) return res.json({ error: 'AI error' });
    const data = await aiResp.json();
    const text = (data.content || []).map(b => b.text || '').join('');
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const copy = JSON.parse(cleaned);
    res.json({ success: true, copy });
  } catch (e) { res.json({ error: e.message }); }
});

// Legacy v1.0 — Plan generation (replaced by /api/cai/deep-dive in v2.1+)
app.post('/api/ai/generate-plan', authBrand, async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  if (!brandId) return res.status(400).json({ error: 'brandId required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI service not configured. Add ANTHROPIC_API_KEY to Railway env vars.' });

  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });

  // Budget + strategy inputs from the brand
  const monthlyBudget = Number(req.body.monthlyBudget) || brand.caiMonthlyBudget || 1500;
  const minRoas = Number(req.body.minRoas) || brand.caiMinRoas || 2.0;
  const riskTolerance = req.body.riskTolerance || brand.caiRiskTolerance || 'balanced';
  const goal = req.body.goal || brand.caiGoal || 'sales';
  const productPrice = Number(req.body.productPrice) || brand.avgProductPrice || 30;
  const brief = req.body.brief || brand.caiBrief || '';
  const creativeAngle = req.body.creativeAngle || brand.caiCreativeAngle || '';
  const flightStart = req.body.flightStart || '';
  const flightEnd = req.body.flightEnd || '';

  // Save preferences to brand
  brand.caiMonthlyBudget = monthlyBudget;
  brand.caiMinRoas = minRoas;
  brand.caiRiskTolerance = riskTolerance;
  brand.caiGoal = goal;
  brand.avgProductPrice = productPrice;
  brand.caiBrief = brief;
  brand.caiCreativeAngle = creativeAngle;
  await saveBrand(brand);

  // Gather brand's video data
  const cached = brand.tiktokVideosCache || [];
  const uploadedAsVideos = (brand.uploads || []).filter(u => u.videoUrl).map(u => ({
    id: u.id, desc: u.title || 'Creator Video', views: 0, likes: 0, comments: 0, shares: 0,
    duration: 0, authorHandle: u.creatorHandle || '', isShoppable: false,
    cover: '', downloadUrl: u.videoUrl || '', tiktokUrl: u.videoUrl || '', _source: 'upload',
  }));
  const allVideosForPlan = [...cached, ...uploadedAsVideos];
  if (allVideosForPlan.length === 0) return res.status(400).json({ error: 'No videos found. Visit the Content tab first to load your TikTok videos.' });

  const dailyBudget = Math.round(monthlyBudget / 30);

  // Build video summaries for the prompt
  const videoSummaries = allVideosForPlan
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 30)
    .map(v => ({
      id: v.id,
      desc: (v.desc || '').slice(0, 200),
      views: v.views || 0,
      likes: v.likes || 0,
      comments: v.comments || 0,
      shares: v.shares || 0,
      engagementRate: v.engagementRate || (v.views > 0 ? (((v.likes||0)+(v.comments||0)+(v.shares||0))/v.views*100).toFixed(2) : 0),
      duration: v.duration || 0,
      authorHandle: v.authorHandle || '',
      isShoppable: !!v.isShoppable,
      hashtags: (v.hashtags || []).slice(0, 5),
      cover: v.cover || '',
      downloadUrl: v.downloadUrl || '',
      tiktokUrl: v.tiktokUrl || '',
      isBrandOwned: (v.authorHandle || '').toLowerCase() === (brand.storeName || '').toLowerCase().replace(/\s+/g, ''),
    }));

  const brandContext = {
    brandName: brand.brandName || brand.storeName || '',
    storeName: brand.storeName || '',
    storeUrl: brand.storeUrl || '',
    websiteUrl: brand.websiteUrl || '',
    description: brand.brandDescription || '',
    defaultCommission: brand.defaultCommission || 10,
    avgProductPrice: productPrice,
  };

  const systemPrompt = `You are CAi, a senior paid media strategist at a DTC performance agency. You build Meta ad campaigns from TikTok content for e-commerce brands. You think in terms of budget allocation, creative testing, and unit economics.

THE BRAND'S CONSTRAINTS:
- Monthly ad budget: $${monthlyBudget} ($${dailyBudget}/day)
- Minimum acceptable ROAS: ${minRoas}x (they need at least $${minRoas} back per $1 spent)
- Risk tolerance: ${riskTolerance} (conservative = proven content only, balanced = mix of safe + tests, aggressive = more experimental bets)
- Primary goal: ${goal}
- Average product price: $${productPrice}
- Creator commission: ${brand.defaultCommission || 10}%

YOUR MEDIA BUYING STRATEGY:
1. BUDGET ALLOCATION: Split the $${dailyBudget}/day budget across creatives intelligently.
   - Top performer gets 30-40% of budget (your "hero" creative)
   - 2-3 "proven" creatives get 15-25% each
   - 1-2 "test" creatives get 5-10% each (if risk tolerance allows)
   - Total daily budgets across all recommendations MUST equal $${dailyBudget}/day (± $5)
   
2. CREATIVE SELECTION: Volume-first — load ALL ${videoSummaries.length} videos. Meta's CBO decides winners, not us.
   - Brand-owned videos (isBrandOwned=true) need NO licensing — include all
   - Don't cherry-pick — TikTok views do NOT predict Meta ad performance
   - A 500K-view video might outconvert a 37M-view video (different algorithm, different intent)
   - Meta needs 20-500 creatives to optimize. Feed the algorithm options.
   
3. ROAS PREDICTIONS: Be realistic based on unit economics:
   - Product price: $${productPrice}
   - Break-even CPA = $${productPrice} / ${minRoas} = $${(productPrice / minRoas).toFixed(2)}
   - With ${brand.defaultCommission || 10}% commission, brand net per sale = $${(productPrice * (1 - (brand.defaultCommission || 10) / 100)).toFixed(2)}
   - Factor in Meta's typical CPMs ($8-25) and CTRs (1-3%) for TikTok-style creatives

4. AD COPY: Write like a direct response copywriter, not a brand marketer:
   - Hook in first line (question, bold claim, or pattern interrupt)
   - Social proof when possible ("37M people watched this")
   - Clear benefit + CTA
   - Headline under 40 chars — punchy, benefit-driven

5. CONFIDENCE SCORING: Based on how likely the video meets the min ROAS target:
   - 85-100: Near-certain to hit ${minRoas}x ROAS (viral + product-focused + brand-owned)
   - 70-84: Strong probability (high engagement + clear product benefit)
   - 55-69: Moderate — worth testing but uncertain
   - Below 55: Risky bet (only include if risk tolerance is aggressive)

Return ONLY valid JSON with this structure:
{
  "planName": "string",
  "strategy": "string - 1-2 sentences. What videos were picked and why their hooks work. Be specific about the content, not marketing jargon.",
  "totalDailyBudget": ${dailyBudget},
  "estimatedMonthlySpend": ${monthlyBudget},
  "estimatedMonthlyRevenue": number,
  "estimatedRoas": number,
  "breakEvenCpa": ${(productPrice / minRoas).toFixed(2)},
  "videosAnalyzed": ${videoSummaries.length},
  "recommendations": [
    {
      "videoId": "string",
      "rank": number,
      "tier": "hero|proven|test",
      "primaryText": "string - Meta ad primary text",
      "headline": "string - under 40 chars",
      "dailyBudget": number,
      "budgetPct": number (percentage of total budget),
      "predictedRoasLow": number,
      "predictedRoasHigh": number,
      "predictedCpa": number,
      "confidenceScore": number,
      "reasoning": "string - 1 sentence MAX. Describe the hook: what the viewer sees in the first 2-3 seconds and why it works as an ad. Be specific about what the product does on screen. Example: 'Nose visibly opens wider in first 2 seconds — immediate proof the device works.' NOT generic marketing analysis.",
      "targetAudience": "string",
      "objective": "${goal === 'sales' ? 'SALES' : goal === 'traffic' ? 'TRAFFIC' : 'AWARENESS'}",
      "isBrandOwned": boolean,
      "licensingNeeded": boolean
    }
  ]
}`;

  const briefSection = brief ? `\n\nCAMPAIGN BRIEF FROM THE BRAND:\n"${brief}"\n${creativeAngle ? 'Prioritize creative angle: ' + creativeAngle.replace(/-/g, ' ') : ''}${flightStart ? '\nFlight: ' + flightStart + ' to ' + (flightEnd || 'ongoing') : ''}\nIMPORTANT: Tailor ALL ad copy, creative selection, and budget allocation to match this brief. If the brief mentions a promotion, weave the offer into every headline and primary text. If it mentions a specific audience or angle, prioritize videos that match.` : '';

  const userPrompt = `Brand: ${JSON.stringify(brandContext)}

Budget: $${monthlyBudget}/mo ($${dailyBudget}/day) | Min ROAS: ${minRoas}x | Risk: ${riskTolerance} | Goal: ${goal}${briefSection}

Here are ${videoSummaries.length} TikTok videos. Build a campaign plan that maximizes value within the budget constraints:

${JSON.stringify(videoSummaries, null, 2)}`;

  try {
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error('[ai] Anthropic API error:', aiResp.status, errText.slice(0, 500));
      let detail = '';
      try { const e = JSON.parse(errText); detail = e.error?.message || e.message || ''; } catch (_) { detail = errText.slice(0, 150); }
      return res.status(502).json({ error: 'AI service error (HTTP ' + aiResp.status + '): ' + detail });
    }

    const aiData = await aiResp.json();
    const rawText = (aiData.content || []).filter(c => c.type === 'text').map(c => c.text).join('');

    // Parse JSON from response (strip markdown fences if present)
    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let plan;
    try { plan = JSON.parse(cleaned); } catch (parseErr) {
      console.error('[ai] Failed to parse AI response:', cleaned.slice(0, 500));
      return res.status(502).json({ error: 'AI returned invalid response. Try again.' });
    }

    // Enrich plan with video data + brand preferences
    const existingPlan = loadAiPlan(brandId);
    plan.brandId = brandId;
    plan.generatedAt = new Date().toISOString();
    plan.status = 'pending_review';
    plan.version = (existingPlan?.version || 0) + 1;
    plan.budgetConfig = { monthlyBudget, minRoas, riskTolerance, goal, productPrice, brief, creativeAngle, flightStart, flightEnd };
    plan.previousPlanId = existingPlan?.generatedAt || null;
    plan.recommendations = (plan.recommendations || []).map(rec => {
      const vid = allVideosForPlan.find(v => String(v.id) === String(rec.videoId));
      return {
        ...rec,
        status: 'pending',
        videoData: vid ? {
          cover: vid.cover || vid.coverHd || '',
          desc: vid.desc || '',
          views: vid.views || 0,
          likes: vid.likes || 0,
          shares: vid.shares || 0,
          authorHandle: vid.authorHandle || '',
          downloadUrl: vid.downloadUrl || '',
          tiktokUrl: vid.tiktokUrl || '',
          duration: vid.duration || 0,
        } : null,
      };
    });

    // Save plan + reset new videos counter
    saveAiPlan(brandId, plan);
    brand.newVideosSincePlan = 0;
    brand.lastPlanGeneratedAt = plan.generatedAt;
    await saveBrand(brand);
    logActivity('ai_plan_generated', { brandId, brandName: brand.brandName, recommendations: plan.recommendations.length, totalDailyBudget: plan.totalDailyBudget, version: plan.version });

    // Send notification email
    if (brand.email) {
      const recCount = plan.recommendations.length;
      const estRevenue = plan.estimatedMonthlyRevenue || 0;
      sendEmail(
        brand.email,
        'Your CAi Campaign Plan is Ready',
        emailBase({
          title: 'Your AI Campaign Plan is Ready',
          preheader: recCount + ' videos selected for Meta ads',
          headerEmoji: '🧠',
          accentColor: '#9b6dff',
          accentGradient: 'linear-gradient(135deg,#9b6dff,#0668E1)',
          bodyHtml: `<p>CAi analyzed your TikTok content and selected <strong>${recCount} videos</strong> for Meta ad campaigns.</p><p>Estimated monthly revenue: <strong>$${Math.round(estRevenue).toLocaleString()}</strong></p><p style="color:#6b7280;">Review the plan, edit ad copy if you want, and launch with one click.</p>`,
          ctaText: 'Review Your Plan',
          ctaUrl: 'https://www.creatorship.app/brand#ai-plans'
        })
      ).catch(() => {});
    }

    res.json({ success: true, plan });
  } catch (e) {
    console.error('[ai] Generate plan error:', e.message);
    res.status(500).json({ error: 'Failed to generate plan: ' + e.message });
  }
});

// Stream-generate a campaign plan (SSE — live terminal view for brands)
app.post('/api/ai/generate-plan-stream', authBrand, async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  if (!brandId) return res.status(400).json({ error: 'brandId required' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI not configured' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  const cached = brand.tiktokVideosCache || [];
  // Merge brand uploads into the video pool for CAi analysis
  const uploadedAsVideos = (brand.uploads || []).filter(u => u.videoUrl).map(u => ({
    id: u.id, desc: u.title || 'Creator Video', views: 0, likes: 0, comments: 0, shares: 0,
    duration: 0, authorHandle: u.creatorHandle || '', isShoppable: false,
    cover: '', downloadUrl: u.videoUrl || '', tiktokUrl: u.videoUrl || '',
    _source: 'upload',
  }));
  const allVideos = [...cached, ...uploadedAsVideos];
  if (allVideos.length === 0) return res.status(400).json({ error: 'No videos found' });

  const mb = Number(req.body.monthlyBudget) || brand.caiMonthlyBudget || 1500;
  const mr = Number(req.body.minRoas) || brand.caiMinRoas || 2.0;
  const rt = req.body.riskTolerance || brand.caiRiskTolerance || 'balanced';
  const gl = req.body.goal || brand.caiGoal || 'sales';
  const pp = Number(req.body.productPrice) || brand.avgProductPrice || 30;
  const brief = req.body.brief || brand.caiBrief || '';
  const ca = req.body.creativeAngle || brand.caiCreativeAngle || '';
  const fs2 = req.body.flightStart || '', fe = req.body.flightEnd || '';
  const db = Math.round(mb / 30);
  brand.caiMonthlyBudget = mb; brand.caiMinRoas = mr; brand.caiRiskTolerance = rt; brand.caiGoal = gl; brand.avgProductPrice = pp; brand.caiBrief = brief; brand.caiCreativeAngle = ca;
  await saveBrand(brand);

  const vs = allVideos.sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 30).map(v => ({ id: v.id, desc: (v.desc || '').slice(0, 200), views: v.views || 0, likes: v.likes || 0, comments: v.comments || 0, shares: v.shares || 0, engagementRate: v.views > 0 ? (((v.likes||0)+(v.comments||0)+(v.shares||0))/v.views*100).toFixed(2) : 0, duration: v.duration || 0, authorHandle: v.authorHandle || '', isShoppable: !!v.isShoppable, cover: v.cover || '', downloadUrl: v.downloadUrl || '', tiktokUrl: v.tiktokUrl || '', isBrandOwned: (v.authorHandle || '').toLowerCase() === (brand.storeName || '').toLowerCase().replace(/\s+/g, ''), source: v._source || 'tiktok' }));
  const bc = { brandName: brand.brandName || brand.storeName || '', storeName: brand.storeName || '', storeUrl: brand.storeUrl || '', websiteUrl: brand.websiteUrl || '', description: brand.brandDescription || '', defaultCommission: brand.defaultCommission || 10, avgProductPrice: pp };

  const sp = `You are CAi, a senior paid media strategist. Build Meta ad campaigns from TikTok content for e-commerce brands.\nCONSTRAINTS: Budget $${mb}/mo ($${db}/day), Min ROAS ${mr}x, Risk: ${rt}, Goal: ${gl}, Product $${pp}, Commission ${brand.defaultCommission || 10}%.\nSTRATEGY: Hero 30-40% budget, Proven 15-25% each, Test 5-10%. Brand-owned need no licensing. REASONING MUST be 1 sentence about the video hook (what viewer sees in first 2-3 seconds), NOT marketing metrics or analytics. Totals must equal $${db}/day.\nReturn ONLY valid JSON: { "planName": string, "strategy": "1-2 sentences about which videos were picked and why their hooks work — be specific about the content", "totalDailyBudget": ${db}, "estimatedMonthlySpend": ${mb}, "estimatedMonthlyRevenue": number, "estimatedRoas": number, "breakEvenCpa": ${(pp/mr).toFixed(2)}, "videosAnalyzed": ${vs.length}, "recommendations": [{ "videoId": string, "rank": number, "tier": "hero|proven|test", "primaryText": string, "headline": string, "dailyBudget": number, "budgetPct": number, "predictedRoasLow": number, "predictedRoasHigh": number, "predictedCpa": number, "confidenceScore": number, "reasoning": "1 sentence about the video hook — what viewer sees first 2 seconds", "targetAudience": string, "objective": "${gl === 'sales' ? 'SALES' : gl === 'traffic' ? 'TRAFFIC' : 'AWARENESS'}", "isBrandOwned": boolean, "licensingNeeded": boolean }] }`;
  const bs = brief ? `\nBRIEF: "${brief}"${ca ? ' Angle: ' + ca : ''}${fs2 ? ' Flight: ' + fs2 + ' to ' + (fe || 'ongoing') : ''}\nTailor ALL copy to this brief.` : '';
  const up = `Brand: ${JSON.stringify(bc)}\nBudget: $${mb}/mo | Min ROAS: ${mr}x | Risk: ${rt}${bs}\n\n${vs.length} videos:\n${JSON.stringify(vs, null, 2)}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, stream: true, system: sp, messages: [{ role: 'user', content: up }] }),
    });
    if (!aiResp.ok) { const e = await aiResp.text(); res.write('data: ' + JSON.stringify({ type: 'error', error: e.slice(0, 200) }) + '\n\n'); res.end(); return; }

    let fullText = '';
    let buffer = '';
    const reader = aiResp.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const d = line.slice(6); if (d === '[DONE]') continue;
          try { const evt = JSON.parse(d); if (evt.type === 'content_block_delta' && evt.delta?.text) { fullText += evt.delta.text; res.write('data: ' + JSON.stringify({ type: 'delta', text: evt.delta.text }) + '\n\n'); } } catch (_) {}
        }
      }
    } catch (streamErr) { res.write('data: ' + JSON.stringify({ type: 'error', error: 'Stream error: ' + streamErr.message }) + '\n\n'); res.end(); return; }
    // Stream finished — parse plan
    try {
      const cleaned = fullText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const plan = JSON.parse(cleaned);
      const existing = loadAiPlan(brandId);
      plan.brandId = brandId; plan.generatedAt = new Date().toISOString(); plan.status = 'pending_review';
      plan.version = (existing?.version || 0) + 1;
      plan.budgetConfig = { monthlyBudget: mb, minRoas: mr, riskTolerance: rt, goal: gl, productPrice: pp, brief, creativeAngle: ca, flightStart: fs2, flightEnd: fe };
      plan.recommendations = (plan.recommendations || []).map(rec => {
        const vid = allVideos.find(v => String(v.id) === String(rec.videoId));
        return { ...rec, status: 'pending', videoData: vid ? { cover: vid.cover || '', desc: vid.desc || '', views: vid.views || 0, likes: vid.likes || 0, shares: vid.shares || 0, authorHandle: vid.authorHandle || '', downloadUrl: vid.downloadUrl || '', tiktokUrl: vid.tiktokUrl || '', duration: vid.duration || 0 } : null };
      });
      saveAiPlan(brandId, plan); brand.newVideosSincePlan = 0; brand.lastPlanGeneratedAt = plan.generatedAt; await saveBrand(brand);
      logActivity('ai_plan_generated', { brandId, brandName: brand.brandName, recommendations: plan.recommendations.length, version: plan.version });
      res.write('data: ' + JSON.stringify({ type: 'done', plan }) + '\n\n');
    } catch (e) { res.write('data: ' + JSON.stringify({ type: 'error', error: 'Parse failed: ' + e.message }) + '\n\n'); }
    res.end();
  } catch (e) { res.write('data: ' + JSON.stringify({ type: 'error', error: e.message }) + '\n\n'); res.end(); }
});

// Get saved AI plan for a brand
app.get('/api/brand/ai-plans', authBrand, async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.query.brandId;
  if (!brandId) return res.status(400).json({ error: 'brandId required' });
  const plan = loadAiPlan(brandId);
  res.json({ plan: plan || null });
});

// Approve/deny/edit individual recommendations
app.post('/api/brand/ai-plans/update', authBrand, async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  const { videoId, action, edits } = req.body;
  if (!brandId || !videoId || !action) return res.status(400).json({ error: 'brandId, videoId, and action required' });

  const plan = loadAiPlan(brandId);
  if (!plan) return res.status(404).json({ error: 'No plan found. Generate one first.' });

  const rec = plan.recommendations.find(r => String(r.videoId) === String(videoId));
  if (!rec) return res.status(404).json({ error: 'Video not found in plan' });

  if (action === 'approve') rec.status = 'approved';
  else if (action === 'deny') rec.status = 'denied';
  else if (action === 'edit') {
    if (edits?.primaryText) rec.primaryText = edits.primaryText;
    if (edits?.headline) rec.headline = edits.headline;
    if (edits?.dailyBudget) rec.dailyBudget = Number(edits.dailyBudget);
    rec.editedAt = new Date().toISOString();
  }
  else if (action === 'reset') rec.status = 'pending';

  // Update plan status
  const allStatuses = plan.recommendations.map(r => r.status);
  plan.status = allStatuses.every(s => s === 'launched') ? 'launched' : allStatuses.some(s => s === 'approved') ? 'partially_approved' : 'pending_review';
  plan.updatedAt = new Date().toISOString();

  saveAiPlan(brandId, plan);
  logActivity('ai_plan_' + action, { brandId, videoId });
  res.json({ success: true, plan });
});

// Launch all approved recommendations
app.post('/api/brand/ai-plans/launch-approved', authBrand, async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  if (!brandId) return res.status(400).json({ error: 'brandId required' });

  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  if (brand.billingSuspended) return res.status(403).json({ error: 'Billing suspended — update your payment method at Account → Billing to reactivate', suspended: true, reason: brand.billingSuspendReason });
  if (brand.isBadActor) return res.status(403).json({ error: 'Account suspended — contact support@creatorship.app', suspended: true });
  if (!brand.metaToken) return res.status(400).json({ error: 'Connect Meta Ads first' });

  const plan = loadAiPlan(brandId);
  if (!plan) return res.status(404).json({ error: 'No plan found' });

  const approved = plan.recommendations.filter(r => r.status === 'approved');
  if (approved.length === 0) return res.status(400).json({ error: 'No approved recommendations. Approve at least one video first.' });

  const results = [];
  for (const rec of approved) {
    try {
      // Build launch payload
      const launchBody = {
        videoId: rec.videoId,
        brandId,
        metaToken: brand.metaToken,
        adAccount: brand.adAccount,
        pageId: brand.pageId,
        primaryText: rec.primaryText || '',
        headline: rec.headline || '',
        description: '',
        cta: 'SHOP_NOW',
        displayUrl: (brand.storeName || 'creatorship') + '.com',
        websiteUrl: brand.websiteUrl || brand.storeUrl || '',
        campaignName: '[CAi] ' + (rec.videoData?.authorHandle || 'creator') + '_' + new Date().toISOString().slice(0, 10).replace(/-/g, ''),
        objective: rec.objective || 'SALES',
        budgetType: 'daily',
        dailyBudget: rec.dailyBudget || 50,
        duration: '7',
        startNow: true,
        ageMin: '18',
        ageMax: '65',
        locations: ['United States'],
        gender: 'all',
        audienceType: 'broad',
        placementType: 'advantage',
        placements: { fbFeed: true, igFeed: true, igStories: true, igReels: true, fbReels: true, audienceNetwork: true },
        commission: brand.defaultCommission || 10,
      };

      // Call internal launch
      const launchResp = await fetch((process.env.FRONTEND_URL || 'http://localhost:' + PORT) + '/api/launch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + req.headers.authorization?.replace('Bearer ', ''),
        },
        body: JSON.stringify(launchBody),
      });
      const launchData = await launchResp.json();

      if (launchData.success) {
        rec.status = 'launched';
        rec.launchedAt = new Date().toISOString();
        rec.campaignId = launchData.ids?.campaign;
        results.push({ videoId: rec.videoId, success: true, campaignId: launchData.ids?.campaign });
      } else {
        results.push({ videoId: rec.videoId, success: false, error: launchData.error || 'Launch failed' });
      }
    } catch (e) {
      results.push({ videoId: rec.videoId, success: false, error: e.message });
    }
  }

  plan.updatedAt = new Date().toISOString();
  saveAiPlan(brandId, plan);

  const launched = results.filter(r => r.success).length;
  logActivity('ai_plans_batch_launch', { brandId, total: approved.length, launched, failed: approved.length - launched });

  res.json({ success: true, results, launched, total: approved.length });
});

app.post('/api/launch', authBrand, requireRole('editor'), async (req, res) => {
  let { videoId, metaToken, adAccount, pageId, dailyBudget = 50, brandId,
    campaignName, objective, budgetType, lifetimeBudget, duration, startNow, startDate,
    primaryText, headline, description, cta, displayUrl, websiteUrl,
    ageMin, ageMax, locations, gender, audienceType, interests,
    placementType, placements, commission, productTitle, productPrice, variants } = req.body;

  // ═══ CAi 2.0 ROUTING: If CAi is active, add video to existing campaign directly ═══
  if (brandId && !Array.isArray(variants)) {
    const brandForCai = await getBrandById(brandId);
    if (brandForCai?.billingSuspended) return res.status(403).json({ error: 'Billing suspended — update your payment method at Account → Billing to reactivate', suspended: true, reason: brandForCai.billingSuspendReason });
    if (brandForCai?.isBadActor) return res.status(403).json({ error: 'Account suspended — contact support@creatorship.app', suspended: true });
    if (brandForCai?.cai?.isActive && brandForCai?.cai?.campaign?.id) {
      try {
        const result = await caiAddCreativeToActiveCampaign(brandForCai, videoId, primaryText, headline);
        if (result.success) {
          return res.json({
            success: true,
            ids: { campaign: brandForCai.cai.campaign.id, adset: brandForCai.cai.campaign.adsetId, ad: result.adId },
            steps: [{ step: 'cai_routing', status: 'ok' }],
            reusingCampaign: true,
            caiActive: true,
            adCount: result.totalCreatives,
            dailyBudget,
          });
        }
      } catch (caiErr) {
        console.log('[launch] CAi routing error, falling through to legacy:', caiErr.message);
      }
    }
  }

  // ═══ LEGACY FLOW (for brands without CAi active) ═══
  const useVariants = Array.isArray(variants) && variants.length > 1;
  if (brandId) {
    const brand = await getBrandById(brandId);
    if (brand) {
      if (brand.billingSuspended) return res.status(403).json({ error: 'Billing suspended — update your payment method at Account → Billing to reactivate', suspended: true, reason: brand.billingSuspendReason });
      if (brand.isBadActor) return res.status(403).json({ error: 'Account suspended — contact support@creatorship.app', suspended: true });
      if (!metaToken && brand.metaToken) metaToken = brand.metaToken;
      if (!adAccount && brand.adAccount) adAccount = brand.adAccount;
      if (!pageId && brand.pageId) pageId = brand.pageId;
      // Auto-recover: if token exists but adAccount missing, fetch from Meta
      if (metaToken && !adAccount) {
        try {
          const acctData = await apiFetch('https://graph.facebook.com/v22.0/me/adaccounts?fields=id,name,account_status&access_token=' + metaToken);
          const active = (acctData.data || []).filter(a => a.account_status === 1 || a.account_status === 3);
          if (active.length > 0) {
            adAccount = active[0].id;
            brand.adAccount = adAccount;
            brand.metaAdAccounts = (acctData.data || []).filter(a => a.account_status === 1).map(a => ({ id: a.id, name: a.name || a.id }));
            await saveBrand(brand);
            console.log('[launch] Auto-recovered adAccount:', adAccount);
          }
        } catch (e) { console.error('[launch] Auto-recover failed:', e.message); }
      }
    }
  }
  if (!metaToken || !adAccount) return res.status(400).json({ error: 'metaToken and adAccount required — connect Meta API in Settings' });
  // Check free launch limit if billing is not set up
  if (brandId) {
    const b = await getBrandById(brandId);
    if (b) {
      const freeLaunchLimit = 3;
      const freeLaunchesUsed = b.freeLaunchesUsed || 0;
      const hasBilling = !!b.billingEnabled;

      if (!hasBilling && freeLaunchesUsed >= freeLaunchLimit) {
        return res.status(402).json({
          error: 'Free launches used up. Add a payment method in Settings → Billing to continue launching campaigns.',
          freeLaunchesUsed,
          freeLaunchLimit,
          requiresBilling: true
        });
      }
    }
  }
  const scan = getScanForBrand(brandId);
  const deep = getDeepScanForBrand(brandId);
  const allVideos = [
    ...(scan?.qualified || []), ...(scan?.filtered || []),
    ...(deep?.confirmed || []), ...(deep?.broader || []),
  ];
  let video = null;
  if (useVariants) {
    if (!variants.every(v => v && v.videoUrl)) return res.status(400).json({ error: 'Each variant must have videoUrl' });
    if (!pageId) return res.status(400).json({ error: 'pageId required for multi-variant launch' });
  } else {
    // Tier 1: Check scan files
    if (allVideos.length > 0) {
      video = allVideos.find(v => v.id === videoId || String(v.id) === String(videoId));
    }
    // Tier 2: Check brand's tiktok-videos cache in Supabase
    if (!video && brandId) {
      const brandForCache = await getBrandById(brandId);
      const cached = brandForCache?.tiktokVideosCache || [];
      const cachedVid = cached.find(v => v.id === videoId || String(v.id) === String(videoId));
      if (cachedVid) {
        video = {
          id: cachedVid.id,
          content_url: cachedVid.downloadUrl || '',
          creator: cachedVid.authorHandle || cachedVid.authorName || 'creator',
          caption: cachedVid.desc || '',
          thumbnail: cachedVid.cover || cachedVid.coverHd || '',
          views: cachedVid.views || 0,
          likes: cachedVid.likes || 0,
          shares: cachedVid.shares || 0,
          tiktokUrl: cachedVid.tiktokUrl || '',
        };
        console.log('[launch] Video found in tiktok-videos cache:', video.id, 'by', video.creator);
      }
    }
    // Tier 3: Fetch from ScrapeCreators live
    if (!video && brandId) {
      const brandForFetch = await getBrandById(brandId);
      let handle = '';
      const pageUrl = brandForFetch?.tikTokStorePageUrl || '';
      if (pageUrl) { const m = pageUrl.match(/@([^/?]+)/); if (m) handle = m[1]; }
      if (!handle && brandForFetch?.storeName) handle = brandForFetch.storeName.toLowerCase().replace(/\s+/g, '');
      const scrapeKey = process.env.SCRAPE_KEY;
      if (handle && scrapeKey) {
        try {
          const videosRes = await fetch(
            `https://api.scrapecreators.com/v1/tiktok/profile/videos?handle=${encodeURIComponent(handle)}&limit=30`,
            { headers: { 'x-api-key': scrapeKey } }
          );
          if (videosRes.ok) {
            const videosData = await videosRes.json();
            const rawVideos = videosData.aweme_list || videosData.data || videosData.videos || videosData.posts || [];
            const match = rawVideos.find(v => String(v.aweme_id || v.id || '') === String(videoId));
            if (match) {
              const dlUrls = match.video?.download_addr?.url_list || [];
              const playUrls = match.video?.play_addr?.url_list || [];
              video = {
                id: match.aweme_id || match.id,
                content_url: dlUrls[0] || '',
                creator: match.author?.unique_id || handle,
                caption: match.desc || '',
                thumbnail: match.video?.cover?.url_list?.[0] || '',
                views: match.statistics?.play_count || 0,
              };
              console.log('[launch] Video found via live ScrapeCreators:', video.id, 'by', video.creator);
            }
          }
        } catch (e) { console.error('[launch] ScrapeCreators fallback failed:', e.message); }
      }
    }
    if (!video) return res.status(404).json({ error: 'Video not found in scan results, cache, or live fetch' });
  }
  const steps = [], ids = {};

  // Map frontend objective to Meta API objective
  const objectiveMap = { SALES: 'OUTCOME_SALES', TRAFFIC: 'OUTCOME_TRAFFIC', AWARENESS: 'OUTCOME_AWARENESS' };
  const metaObjective = objectiveMap[objective] || 'OUTCOME_TRAFFIC';

  // Build targeting from form data
  const tgt = {};
  // Meta v22 requires advantage_audience flag
  tgt.targeting_automation = { advantage_audience: 0 };
  // Geo targeting — map location strings to country codes where possible
  const countryMap = { 'United States': 'US', 'Canada': 'CA', 'United Kingdom': 'GB', 'Australia': 'AU', 'Germany': 'DE', 'France': 'FR', 'Japan': 'JP', 'Brazil': 'BR', 'Mexico': 'MX', 'India': 'IN', 'Spain': 'ES', 'Italy': 'IT', 'Netherlands': 'NL', 'Sweden': 'SE', 'Norway': 'NO' };
  const countries = (locations || ['United States']).map(l => countryMap[l] || l).filter(c => c.length <= 3);
  tgt.geo_locations = { countries: countries.length ? countries : ['US'] };
  tgt.age_min = parseInt(ageMin) || 18;
  tgt.age_max = parseInt(ageMax) || 65;
  // Gender: Meta uses genders: [1]=male, [2]=female, omit for all
  if (gender === 'male') tgt.genders = [1];
  else if (gender === 'female') tgt.genders = [2];
  // Interests (if interest-based targeting)
  if (audienceType === 'interest' && interests) {
    const interestList = interests.split(',').map(i => i.trim()).filter(Boolean);
    if (interestList.length) {
      tgt.flexible_spec = [{ interests: interestList.map(i => ({ id: 0, name: i })) }];
    }
  }
  // Placements
  let targetingPlacements = {};
  if (placementType === 'manual' && placements) {
    const pubs = [];
    const fbPos = [], igPos = [];
    if (placements.fbFeed) { pubs.push('facebook'); fbPos.push('feed'); }
    if (placements.fbReels) { if (!pubs.includes('facebook')) pubs.push('facebook'); fbPos.push('facebook_reels'); }
    if (placements.igFeed) { pubs.push('instagram'); igPos.push('stream'); }
    if (placements.igStories) { if (!pubs.includes('instagram')) pubs.push('instagram'); igPos.push('story'); }
    if (placements.igReels) { if (!pubs.includes('instagram')) pubs.push('instagram'); igPos.push('reels'); }
    if (placements.audienceNetwork) pubs.push('audience_network');
    if (pubs.length) targetingPlacements.publisher_platforms = [...new Set(pubs)];
    if (fbPos.length) targetingPlacements.facebook_positions = fbPos;
    if (igPos.length) targetingPlacements.instagram_positions = igPos;
  }
  Object.assign(tgt, targetingPlacements);

  // Budget calculation
  const useDailyBudget = budgetType !== 'lifetime';
  const budgetAmount = useDailyBudget ? (dailyBudget || 50) : (lifetimeBudget || 350);

  // Schedule — compute end_time from duration
  const now = new Date();
  const startTime = (startNow || !startDate) ? now : new Date(startDate);
  let endTime = null;
  if (duration && duration !== 'none') {
    const days = parseInt(duration) || 7;
    endTime = new Date(startTime.getTime() + days * 86400000);
  }

  // Use form campaign name or fallback
  const campName = (campaignName || '').trim() || (useVariants ? '[Creatorship] Multi-variant' : ('[Creatorship] ' + video.creator));

  try {
    // Download + Upload (single-video path only)
    if (!useVariants) {
      if (!video.content_url) throw new Error('No video CDN URL available');
      // Download with validation
      const dlResp = await fetch(video.content_url, { headers: TIKTOK_DL_HEADERS });
      if (!dlResp.ok) throw new Error('Video download failed: HTTP ' + dlResp.status + ' — CDN URL may be expired');
      const ct = (dlResp.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html') || ct.includes('application/json')) throw new Error('Video CDN returned ' + ct + ' instead of video — URL expired');
      const videoBuffer = Buffer.from(await dlResp.arrayBuffer());
      if (videoBuffer.length < 10000) throw new Error('Downloaded video too small (' + videoBuffer.length + ' bytes) — not a valid video file');
      steps.push({ step: 'download', status: 'ok', size: videoBuffer.length });
      // Upload to Meta
      const up = await metaUploadVideo(videoBuffer, '[CS] ' + video.creator, metaToken, adAccount);
      ids.video = up.id || up.video_id; steps.push({ step: 'upload', status: 'ok', id: ids.video });
      // Wait for Meta to process the video before creating creative
      const videoReady = await metaWaitForVideo(ids.video, metaToken, 60000);
      steps.push({ step: 'video_processing', status: videoReady ? 'ok' : 'timeout' });
    }
    // Campaign
    const camp = await metaPost(adAccount + '/campaigns', { name: campName, objective: metaObjective, status: 'PAUSED', special_ad_categories: [], is_adset_budget_sharing_enabled: false, access_token: metaToken });
    ids.campaign = camp.id; steps.push({ step: 'campaign', status: 'ok', id: ids.campaign });
    // Save to registry immediately so even if later steps fail, we track this campaign
    await saveCampaignRegistryEntry(ids.campaign, {
      brandId: brandId || null,
      creator: useVariants ? (variants[0]?.creatorHandle || 'Multi-variant') : video.creator,
      creatorHandle: useVariants ? (variants[0]?.creatorHandle || 'Multi-variant') : video.creator,
      campaignName: campName,
      commission: commission || scan?.commission || 10,
      campaignType: 'always-on',
    });
    // Ad Set
    const adsetName = useVariants ? '[CS] ' + campName : '[CS] ' + video.creator;
    // OFFSITE_CONVERSIONS requires a Meta Pixel — use LINK_CLICKS for SALES without pixel, VALUE if pixel available
    const brandsForPixel_brand = await getBrandById(brandId);
    const hasPixel = !!(brandsForPixel_brand?.metaPixelId);
    const optimizationGoal = metaObjective === 'OUTCOME_SALES'
      ? (hasPixel ? 'OFFSITE_CONVERSIONS' : 'LINK_CLICKS')
      : metaObjective === 'OUTCOME_AWARENESS' ? 'REACH'
      : metaObjective === 'OUTCOME_LEADS' ? 'LEAD_GENERATION'
      : 'LINK_CLICKS';
    const adsetParams = {
      name: adsetName,
      campaign_id: ids.campaign,
      billing_event: 'IMPRESSIONS',
      optimization_goal: optimizationGoal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      status: 'ACTIVE',
      targeting: JSON.stringify(tgt),
      access_token: metaToken
    };
    // Add promoted_object for pixel-based optimization
    if (hasPixel && metaObjective === 'OUTCOME_SALES') {
      adsetParams.promoted_object = JSON.stringify({ pixel_id: brandsForPixel_brand.metaPixelId, custom_event_type: 'PURCHASE' });
    }
    if (useDailyBudget) {
      adsetParams.daily_budget = budgetAmount * 100;
    } else {
      adsetParams.lifetime_budget = budgetAmount * 100;
      if (endTime) adsetParams.end_time = endTime.toISOString();
    }
    if (!startNow && startDate) adsetParams.start_time = startTime.toISOString();
    if (endTime && useDailyBudget) adsetParams.end_time = endTime.toISOString();

    const aset = await metaPost(adAccount + '/adsets', adsetParams);
    ids.adset = aset.id; steps.push({ step: 'adset', status: 'ok', id: ids.adset });
    // Creative + Ad
    const linkUrl = websiteUrl || scan?.productUrl || 'https://' + (productTitle || 'shop').toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
    const message = primaryText || (useVariants ? '' : (video.caption || video.creator).split(/[.!?\n]/)[0].slice(0, 80));
    if (useVariants && pageId) {
      const createdAdIds = [];
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const creatorLabel = v.creatorHandle || ('Creator ' + (i + 1));
        try {
          ensureDir(VIDEO_DIR);
          const vFn = 'video_variant_' + Date.now() + '_' + i + '_' + (v.creatorHandle || 'v').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20) + '.mp4';
          const vFp = path.join(VIDEO_DIR, vFn);
          await downloadFile(v.videoUrl, vFp);
          steps.push({ step: 'download_variant_' + (i + 1), status: 'ok' });
          const vUp = await metaUploadVideo(vFp, '[CS] ' + creatorLabel, metaToken, adAccount);
          const videoId = vUp.id || vUp.video_id;
          steps.push({ step: 'upload_variant_' + (i + 1), status: 'ok', id: videoId });
          // Wait for Meta to process the variant video
          await metaWaitForVideo(videoId, metaToken, 60000);
          const vMessage = primaryText || (creatorLabel + ' — Creatorship');
          const spec = { page_id: pageId, video_data: { video_id: videoId, message: vMessage, title: headline || undefined, link_description: description || undefined, image_url: 'https://img.freepik.com/free-photo/abstract-surface-textures-white-concrete-stone-wall_1258-14525.jpg', call_to_action: { type: cta || 'SHOP_NOW', value: { link: linkUrl } } } };
          const adName = campName + ' — Variant ' + (i + 1) + ' (' + creatorLabel + ')';
          const cr = await metaPost(adAccount + '/adcreatives', { name: adName, object_story_spec: JSON.stringify(spec), access_token: metaToken });
          steps.push({ step: 'creative_variant_' + (i + 1), status: 'ok', id: cr.id });
          const ad = await metaPost(adAccount + '/ads', { name: adName, adset_id: ids.adset, creative: JSON.stringify({ creative_id: cr.id }), status: 'ACTIVE', access_token: metaToken });
          createdAdIds[i] = ad.id;
          steps.push({ step: 'ad_variant_' + (i + 1), status: 'ok', id: ad.id });
        } catch (e) { steps.push({ step: 'variant_' + (i + 1), status: 'error', error: e.message }); }
      }
      ids.ads = createdAdIds;
    } else if (!useVariants && pageId) {
      try {
        const msg = message || (video.caption || video.creator).split(/[.!?\n]/)[0].slice(0, 80);
        const spec = { page_id: pageId, video_data: { video_id: ids.video, message: msg, title: headline || undefined, link_description: description || undefined, image_url: 'https://img.freepik.com/free-photo/abstract-surface-textures-white-concrete-stone-wall_1258-14525.jpg', call_to_action: { type: cta || 'SHOP_NOW', value: { link: linkUrl } } } };
        const cr = await metaPost(adAccount + '/adcreatives', { name: '[CS] ' + video.creator, object_story_spec: JSON.stringify(spec), access_token: metaToken });
        ids.creative = cr.id; steps.push({ step: 'creative', status: 'ok', id: ids.creative });
        const ad = await metaPost(adAccount + '/ads', { name: '[CS] ' + video.creator + ' Ad', adset_id: ids.adset, creative: JSON.stringify({ creative_id: ids.creative }), status: 'ACTIVE', access_token: metaToken });
        ids.ad = ad.id; steps.push({ step: 'ad', status: 'ok', id: ids.ad });
      } catch (e) { steps.push({ step: 'creative', status: 'error', error: e.message }); }
    }
    // Registry already saved; Supabase schema does not store adsetId/creativeId/adId/variants
    // Increment launch count for this brand
    if (brandId) {
      const brandForCount = await getBrandById(brandId);
      if (brandForCount) {
        brandForCount.launchCount = (brandForCount.launchCount || 0) + 1;
        if (!brandForCount.billingEnabled) {
          brandForCount.freeLaunchesUsed = (brandForCount.freeLaunchesUsed || 0) + 1;
        }
        await saveBrand(brandForCount);
      }
    }
    logActivity('campaign_launch', { brandId, campaignName: campName, videoId, adAccount });
    res.json({ success: true, video: useVariants ? null : video, ids, steps, dailyBudget: budgetAmount, commission: commission || scan?.commission, variants: useVariants ? variants : undefined });
    // Send campaign launch email (non-blocking)
    if (brandId) {
      const brandForEmail = await getBrandById(brandId);
      if (brandForEmail?.email) {
        const creatorLine = useVariants ? '<p><strong>Creators:</strong> ' + variants.map(v => v.creatorHandle || 'Creator').join(', ') + '</p>' : '<p><strong>Creator:</strong> ' + video.creator + '</p>';
        sendEmail(
          brandForEmail.email,
          'Campaign Launched: ' + campName,
          emailBase({
            title: `Campaign launched: ${campName}`,
            preheader: 'Your campaign is now live.',
            headerEmoji: '🎯',
            accentColor: '#10b981',
            accentGradient: 'linear-gradient(135deg,#10b981,#0099ff)',
            bodyHtml: `<p>Your campaign <strong>${campName}</strong> has been launched successfully and is now live.</p>${creatorLine}<p style="color:#6b7280;">Track performance in your brand dashboard.</p>`,
            ctaText: 'View Campaign',
            ctaUrl: 'https://www.creatorship.app/brand'
          })
        ).catch(() => {});
      }
    }
    // Send deal notification email to creator (non-blocking) — single-video only
    if (!useVariants) {
    const creatorsForEmail = await loadCreators();
    const creatorRec = creatorsForEmail.find(c =>
      creatorNameMatches(video.creator, c.tiktokHandle || '') ||
      creatorNameMatches(video.creator, c.displayName || '')
    );
    if (creatorRec?.email) {
      const commPct = commission || scan?.commission || 10;
      const prodPrice = registry[ids.campaign]?.productPrice ?? 39.99;
      const perSale = Number(prodPrice) * (commPct / 100);
      sendEmail(
        creatorRec.email,
        'A brand launched your content as a Meta ad',
        emailBase({
          title: 'Your content is now a Meta ad! 🎉',
          preheader: 'A brand is running your video as a paid ad.',
          headerEmoji: '📢',
          accentColor: '#FE2C55',
          accentGradient: 'linear-gradient(135deg,#FE2C55,#ff6b35)',
          bodyHtml: `<p>A brand just launched your TikTok content as a Meta ad. Every sale it drives earns you commission.</p><p style="color:#6b7280;">Check your dashboard to see your earnings in real time.</p>`,
          ctaText: 'View Earnings',
          ctaUrl: 'https://www.creatorship.app/creator'
        })
      ).catch(() => {});
    }
    }
  } catch (e) { res.json({ success: false, error: e.message, ids, steps }); }
});

app.get('/api/status', async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.query.brandId;
  const s = getScanForBrand(brandId);
  res.json(s ? { hasScan: true, ...s } : { hasScan: false });
});

// Brand dashboard — store name, creators, campaigns, spend (from registry)
app.get('/api/brand/dashboard', async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.query.brandId;
  if (!brandId) return res.status(400).json({ error: 'brandId required' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  const scan = getScanForBrand(brandId);
  const registry = await loadCampaignRegistry();
  const brandCampaigns = Object.entries(registry)
    .filter(([, m]) => m.brandId === brandId)
    .map(([id, m]) => ({ id, ...m }));
  const totalSpend = 0; // Meta spend would require token; could aggregate from insights if needed
  const totalRevenue = 0; // Would come from Meta insights if token available
  res.json({
    storeName: brand.storeName,
    brandName: brand.brandName,
    creators: scan?.qualified?.slice(0, 10) || [],
    campaigns: brandCampaigns,
    totalSpend,
    totalRevenue,
    hasScan: !!scan,
  });
});

// ═══════════════════════════════════════════════════════════
// META CAMPAIGN INSIGHTS
// ═══════════════════════════════════════════════════════════
app.post('/api/campaigns/delete', authBrand, requireRole('editor'), async (req, res) => {
  const brandId = req.brandAuth?.brandId;
  const { campaignId, archiveOnMeta } = req.body;
  if (!brandId || !campaignId) return res.json({ error: 'brandId and campaignId required' });

  if (archiveOnMeta) {
    const brand = await getBrandById(brandId);
    if (brand?.metaToken) {
      try {
        await metaPost(campaignId, { status: 'ARCHIVED', access_token: brand.metaToken });
        console.log('[campaigns/delete] Archived campaign on Meta:', campaignId);
      } catch (e) {
        console.error('[campaigns/delete] Meta archive failed:', e.message);
      }
    }
  }

  await deleteCampaignRegistryEntry(campaignId);
  res.json({ success: true });
});

app.get('/api/campaigns', async (req, res) => {
  const { metaToken, adAccount, brandId } = req.query;
  if (!metaToken || !adAccount) return res.status(400).json({ error: 'metaToken and adAccount required' });
  try {
    const fields = 'id,name,status,daily_budget,lifetime_budget,objective,created_time,updated_time,start_time,stop_time';
    const filtering = encodeURIComponent(JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: 'Creatorship' }]));
    const url = `https://graph.facebook.com/v22.0/${adAccount}/campaigns?fields=${fields}&filtering=${filtering}&limit=50&access_token=${metaToken}`;
    const campaigns = await apiFetch(url);
    if (campaigns.error) return res.status(400).json({ error: campaigns.error.message });

    const registry = await loadCampaignRegistry();
    const results = [];
    const metaCampaigns = campaigns.data || [];
    for (const c of metaCampaigns) {
      if (brandId) {
        const meta = registry[c.id] || {};
        if (meta.brandId && meta.brandId !== brandId) continue;
      }
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

app.post('/api/campaigns/toggle', authBrand, requireRole('editor'), async (req, res) => {
  const { metaToken, campaignId, newStatus } = req.body;
  if (!metaToken || !campaignId) return res.status(400).json({ error: 'metaToken and campaignId required' });
  try {
    const result = await metaPost(campaignId, { status: newStatus || 'PAUSED', access_token: metaToken });
    res.json({ success: true, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ CAi Campaign Actions — pause, resume, update specific campaigns ═══
app.post('/api/cai/campaign/pause', authBrand, requireRole('editor'), async (req, res) => {
  const brandId = req.brandAuth?.brandId;
  const { localId } = req.body;
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  const campaigns = getCaiCampaigns(brand);
  const camp = campaigns.find(c => c.localId === localId);
  if (!camp) return res.status(404).json({ error: 'Campaign not found' });
  if (!brand.metaToken) return res.status(400).json({ error: 'No Meta token' });
  try {
    await metaPost(camp.metaCampaignId, { status: 'PAUSED', access_token: brand.metaToken });
    camp.status = 'paused';
    camp.activityLog.push({ type: 'paused', ts: new Date().toISOString(), msg: 'Campaign paused' });
    saveCaiCampaigns(brand, campaigns);
    await saveBrand(brand);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cai/campaign/resume', authBrand, requireRole('editor'), async (req, res) => {
  const brandId = req.brandAuth?.brandId;
  const { localId } = req.body;
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  const campaigns = getCaiCampaigns(brand);
  const camp = campaigns.find(c => c.localId === localId);
  if (!camp) return res.status(404).json({ error: 'Campaign not found' });
  if (!brand.metaToken) return res.status(400).json({ error: 'No Meta token' });
  try {
    await metaPost(camp.metaCampaignId, { status: 'ACTIVE', access_token: brand.metaToken });
    camp.status = 'active';
    camp.activatedAt = camp.activatedAt || new Date().toISOString();
    camp.activityLog.push({ type: 'resumed', ts: new Date().toISOString(), msg: 'Campaign resumed' });
    saveCaiCampaigns(brand, campaigns);
    await saveBrand(brand);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cai/campaign/update', authBrand, requireRole('editor'), async (req, res) => {
  const brandId = req.brandAuth?.brandId;
  const { localId, budget, roasTarget, name } = req.body;
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  const campaigns = getCaiCampaigns(brand);
  const camp = campaigns.find(c => c.localId === localId);
  if (!camp) return res.status(404).json({ error: 'Campaign not found' });
  if (name) camp.name = name;
  if (roasTarget) camp.roasTarget = Number(roasTarget);
  if (budget) {
    const amt = Number(budget.amount || budget);
    camp.budget = { type: camp.budget?.type || 'monthly', amount: amt };
    if (brand.metaToken && camp.metaAdsetId) {
      try {
        const params = { access_token: brand.metaToken };
        if (camp.budget.type === 'monthly') params.daily_budget = Math.round(amt / 30) * 100;
        else params.lifetime_budget = amt * 100;
        await metaPost(camp.metaAdsetId, params);
      } catch (e) { console.error('[cai-update] Meta budget update failed:', e.message); }
    }
  }
  camp.activityLog.push({ type: 'updated', ts: new Date().toISOString(), msg: 'Settings updated' });
  saveCaiCampaigns(brand, campaigns);
  await saveBrand(brand);
  res.json({ success: true });
});

app.post('/api/cai/campaign/add-creative', authBrand, requireRole('editor'), async (req, res) => {
  const brandId = req.brandAuth?.brandId;
  const { localId, videoId } = req.body;
  if (!localId || !videoId) return res.status(400).json({ error: 'localId and videoId required' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  if (brand.billingSuspended) return res.status(403).json({ error: 'Billing suspended — update your payment method at Account → Billing to reactivate', suspended: true, reason: brand.billingSuspendReason });
  if (brand.isBadActor) return res.status(403).json({ error: 'Account suspended — contact support@creatorship.app', suspended: true });
  try {
    const result = await caiAddCreativeToCampaign(brand, localId, String(videoId));
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[cai-campaign-add-creative] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cai/campaign/archive', authBrand, requireRole('editor'), async (req, res) => {
  const brandId = req.brandAuth?.brandId;
  const { localId } = req.body;
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  const campaigns = getCaiCampaigns(brand);
  const camp = campaigns.find(c => c.localId === localId);
  if (!camp) return res.status(404).json({ error: 'Campaign not found' });
  if (brand.metaToken && camp.metaCampaignId) {
    try { await metaPost(camp.metaCampaignId, { status: 'PAUSED', access_token: brand.metaToken }); } catch (_) {}
  }
  camp.status = 'archived';
  camp.activityLog.push({ type: 'archived', ts: new Date().toISOString(), msg: 'Campaign archived' });
  saveCaiCampaigns(brand, campaigns);
  await saveBrand(brand);
  res.json({ success: true });
});

app.post('/api/brand/campaigns/pause-all', authBrand, requireRole('editor'), async (req, res) => {
  const brandId = req.brandAuth?.brandId;
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  if (!brand.metaToken || !brand.adAccount) return res.status(400).json({ error: 'Meta not connected' });
  try {
    const filtering = encodeURIComponent(JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: '[C' }]));
    const campaigns = await apiFetch(`https://graph.facebook.com/v22.0/${brand.adAccount}/campaigns?fields=id,name,status&filtering=${filtering}&limit=50&access_token=${brand.metaToken}`);
    const active = (campaigns.data || []).filter(c => c.status === 'ACTIVE');
    const paused = [];
    for (const c of active) {
      try {
        await metaPost(c.id, { status: 'PAUSED', access_token: brand.metaToken });
        paused.push(c.id);
      } catch (e) { console.error('[pause-all] Failed for', c.id, e.message); }
    }
    if (brand.cai?.isActive) {
      brand.cai.isActive = false;
      brand.cai.deactivatedAt = new Date().toISOString();
      await saveBrand(brand);
    }
    console.log('[pause-all] Paused', paused.length, 'campaigns for brand', brandId);
    res.json({ success: true, paused: paused.length, total: active.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/campaigns/budget', authBrand, requireRole('editor'), async (req, res) => {
  const { metaToken, adsetId, dailyBudget } = req.body;
  if (!metaToken || !adsetId) return res.status(400).json({ error: 'metaToken and adsetId required' });
  try {
    const result = await metaPost(adsetId, { daily_budget: Math.round(dailyBudget * 100), access_token: metaToken });
    res.json({ success: true, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ AUTOMATED WEEKLY CREATOR PAYOUTS ═══
// Pipeline: Meta campaign conversions → commission calculation → Stripe transfer
// Trigger: POST /api/payouts/run-weekly (called by Railway cron or manually)
app.post('/api/payouts/run-weekly', async (req, res) => {
  const secret = req.headers['x-payout-secret'] || req.body.secret;
  if (secret !== (process.env.PAYOUT_SECRET || 'creatorship-payouts-2026')) return res.status(403).json({ error: 'Unauthorized' });
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const MIN_PAYOUT_CENTS = 2500; // $25 minimum
  const registry = await loadCampaignRegistry();
  const brands = await loadBrands();
  const creators = (() => { try { return loadJson(CREATORS_FILE) || []; } catch (_) { return []; } })();

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const since = weekAgo.toISOString().slice(0, 10);
  const until = now.toISOString().slice(0, 10);
  const periodKey = since + '_to_' + until;

  const payoutRuns = await loadPayoutRuns();
  if (payoutRuns.find(r => r.period_key === periodKey && r.status === 'completed')) {
    return res.json({ message: 'Already processed for ' + periodKey, skipped: true });
  }

  const brandCampaigns = {};
  for (const [campaignId, meta] of Object.entries(registry)) {
    const brandId = meta.brandId;
    if (!brandId) continue;
    if (!brandCampaigns[brandId]) brandCampaigns[brandId] = [];
    brandCampaigns[brandId].push({ campaignId, ...meta });
  }

  const creatorEarnings = {};
  const pullResults = [];

  for (const [brandId, campaigns] of Object.entries(brandCampaigns)) {
    const brand = brands.find(b => b.id === brandId);
    if (!brand || !brand.metaToken || !brand.adAccount) {
      pullResults.push({ brandId, status: 'no_meta_credentials', campaigns: campaigns.length });
      continue;
    }

    for (const camp of campaigns) {
      try {
        const insightsUrl = 'https://graph.facebook.com/v22.0/' + camp.campaignId + '/insights?fields=spend,actions,action_values&time_range={"since":"' + since + '","until":"' + until + '"}&access_token=' + brand.metaToken;
        const data = await apiFetch(insightsUrl);

        if (!data.data || !data.data[0]) {
          pullResults.push({ campaignId: camp.campaignId, creator: camp.creator, status: 'no_data' });
          continue;
        }

        const insights = data.data[0];
        const spend = parseFloat(insights.spend || 0);
        const purchaseTypes = ['offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase'];
        let purchases = 0;
        let purchaseValue = 0;

        if (insights.actions) {
          for (const action of insights.actions) {
            if (purchaseTypes.includes(action.action_type)) purchases += parseInt(action.value || 0);
          }
        }
        if (insights.action_values) {
          for (const av of insights.action_values) {
            if (purchaseTypes.includes(av.action_type)) purchaseValue += parseFloat(av.value || 0);
          }
        }

        const commissionPct = camp.commission || 10;
        const productPrice = camp.productPrice || 39.99;
        const revenue = purchaseValue > 0 ? purchaseValue : purchases * productPrice;
        const creatorCommission = revenue * (commissionPct / 100);
        const commissionCents = Math.round(creatorCommission * 100);

        if (commissionCents > 0) {
          const creatorKey = (camp.creator || '').toLowerCase().trim();
          if (!creatorEarnings[creatorKey]) creatorEarnings[creatorKey] = { earned: 0, breakdown: [] };
          creatorEarnings[creatorKey].earned += commissionCents;
          creatorEarnings[creatorKey].breakdown.push({
            campaignId: camp.campaignId, brandId, brandName: brand.brandName || brand.email,
            product: camp.productTitle || 'Product', purchases,
            revenue: Math.round(revenue * 100) / 100, commissionPct,
            commission: Math.round(creatorCommission * 100) / 100,
            spend: Math.round(spend * 100) / 100, period: periodKey,
          });
        }

        pullResults.push({
          campaignId: camp.campaignId, creator: camp.creator, status: 'ok',
          spend: Math.round(spend * 100) / 100, purchases,
          revenue: Math.round(revenue * 100) / 100,
          commission: Math.round(creatorCommission * 100) / 100,
        });
      } catch (e) {
        pullResults.push({ campaignId: camp.campaignId, creator: camp.creator, status: 'error', error: e.message });
      }
    }
  }

  const earningsPath = path.join(DATA_DIR, 'creator_earnings.json');
  let allEarnings = {};
  try { if (fs.existsSync(earningsPath)) allEarnings = loadJson(earningsPath) || {}; } catch (_) {}

  for (const [creatorKey, data] of Object.entries(creatorEarnings)) {
    if (!allEarnings[creatorKey]) {
      allEarnings[creatorKey] = { totalEarned: 0, totalPaid: 0, pendingBalance: 0, thisMonth: 0, payouts: [], earnings: [] };
    }
    const ce = allEarnings[creatorKey];
    const earnedDollars = data.earned / 100;
    ce.totalEarned = Math.round((ce.totalEarned + earnedDollars) * 100) / 100;
    ce.pendingBalance = Math.round(((ce.pendingBalance || 0) + earnedDollars) * 100) / 100;
    ce.thisMonth = Math.round(((ce.thisMonth || 0) + earnedDollars) * 100) / 100;

    for (const bd of data.breakdown) {
      ce.earnings.push({
        date: now.toISOString().slice(0, 10), brand: bd.brandName, video: bd.product,
        amount: bd.commission, campaignId: bd.campaignId, purchases: bd.purchases,
        period: bd.period, status: 'Pending',
      });
    }
  }

  ensureDir(DATA_DIR);
  saveJson(earningsPath, allEarnings);

  const payoutResults = [];

  for (const [creatorKey, ce] of Object.entries(allEarnings)) {
    const pendingCents = Math.round((ce.pendingBalance || 0) * 100);
    if (pendingCents < MIN_PAYOUT_CENTS) {
      if (pendingCents > 0) payoutResults.push({ creator: creatorKey, status: 'below_minimum', pending: ce.pendingBalance, minimum: MIN_PAYOUT_CENTS / 100 });
      continue;
    }

    const creatorRec = creators.find(c =>
      creatorNameMatches(c.display_name || '', creatorKey) ||
      creatorNameMatches(c.tiktokHandle || '', creatorKey) ||
      creatorNameMatches(c.open_id || '', creatorKey)
    );

    if (!creatorRec?.stripeAccountId) {
      payoutResults.push({ creator: creatorKey, status: 'no_stripe_account', pending: ce.pendingBalance });
      continue;
    }

    try {
      const account = await stripe.accounts.retrieve(creatorRec.stripeAccountId);
      if (!account.payouts_enabled) {
        payoutResults.push({ creator: creatorKey, status: 'stripe_payouts_not_enabled', pending: ce.pendingBalance });
        continue;
      }
    } catch (e) {
      payoutResults.push({ creator: creatorKey, status: 'stripe_check_failed', error: e.message });
      continue;
    }

    try {
      const transfer = await stripe.transfers.create({
        amount: pendingCents, currency: 'usd', destination: creatorRec.stripeAccountId,
        description: 'Creatorship weekly payout — ' + periodKey,
        metadata: { creator: creatorKey, period: periodKey },
      });

      ce.totalPaid = Math.round(((ce.totalPaid || 0) + ce.pendingBalance) * 100) / 100;
      const paidAmount = ce.pendingBalance;
      ce.pendingBalance = 0;
      for (const e of ce.earnings) { if (e.status === 'Pending') e.status = 'Paid'; }
      ce.payouts.push({ date: now.toISOString().slice(0, 10), amount: paidAmount, stripeTransferId: transfer.id, period: periodKey, status: 'paid' });

      const globalEarningsFile = path.join(DATA_DIR, 'earnings.json');
      let globalEarnings = [];
      try { if (fs.existsSync(globalEarningsFile)) globalEarnings = loadJson(globalEarningsFile) || []; } catch (_) {}
      globalEarnings.push({ creatorId: creatorKey, amount: paidAmount, stripeTransferId: transfer.id, description: 'Weekly payout — ' + periodKey, status: 'paid', date: now.toISOString() });
      saveJson(globalEarningsFile, globalEarnings);

      payoutResults.push({ creator: creatorKey, status: 'paid', amount: paidAmount, transferId: transfer.id });

      const creatorEmail = creatorRec.email;
      if (creatorEmail) {
        sendEmail(
          creatorEmail,
          'You got paid! $' + paidAmount.toFixed(2) + ' from Creatorship',
          emailBase({
            title: 'You got paid! 💸',
            preheader: 'Your earnings just landed.',
            headerEmoji: '💸',
            accentColor: '#10b981',
            accentGradient: 'linear-gradient(135deg,#10b981,#25F4EE)',
            bodyHtml: `<p>Great news — your payout of <strong>$${paidAmount.toFixed(2)}</strong> has been sent to your account.</p><p style="color:#6b7280;">Keep creating. More campaigns, more earnings.</p>`,
            ctaText: 'View Dashboard',
            ctaUrl: 'https://www.creatorship.app/creator'
          })
        ).catch(err => console.error('[payouts] Email failed for', creatorKey, err.message));
      }
    } catch (e) {
      payoutResults.push({ creator: creatorKey, status: 'transfer_failed', error: e.message, pending: ce.pendingBalance });
      console.error('[payouts] Transfer failed for', creatorKey, ':', e.message);
    }
  }

  saveJson(earningsPath, allEarnings);

  const totalPaid = payoutResults.filter(r => r.status === 'paid').reduce((s, r) => s + (r.amount || 0), 0);
  await savePayoutRun({
    periodKey,
    creatorHandle: '_run',
    status: 'completed',
    payoutAmount: totalPaid,
  });

  const summary = {
    success: true, period: periodKey, campaignsChecked: pullResults.length,
    creatorsWithEarnings: Object.keys(creatorEarnings).length,
    payoutsMade: payoutResults.filter(r => r.status === 'paid').length,
    totalPaid: payoutResults.filter(r => r.status === 'paid').reduce((s, r) => s + (r.amount || 0), 0),
    pullResults, payoutResults,
  };

  res.json(summary);
});

app.get('/api/payouts/status', async (req, res) => {
  const secret = req.headers['x-payout-secret'] || req.query.secret;
  if (secret !== (process.env.PAYOUT_SECRET || 'creatorship-payouts-2026')) return res.status(403).json({ error: 'Unauthorized' });

  const payoutRuns = await loadPayoutRuns();
  const runsForResponse = payoutRuns.map(r => ({ periodKey: r.period_key, runAt: r.created_at, status: r.status, payoutAmount: r.payout_amount, creatorsProcessed: null, payoutsMade: null, totalPaid: r.payout_amount, campaignsChecked: null }));

  const earningsPath = path.join(DATA_DIR, 'creator_earnings.json');
  let allEarnings = {};
  try { if (fs.existsSync(earningsPath)) allEarnings = loadJson(earningsPath) || {}; } catch (_) {}

  const creatorSummaries = Object.entries(allEarnings).map(([key, ce]) => ({
    creator: key, totalEarned: ce.totalEarned || 0, totalPaid: ce.totalPaid || 0,
    pendingBalance: ce.pendingBalance || 0, payoutCount: (ce.payouts || []).length,
    lastPayout: (ce.payouts || []).slice(-1)[0]?.date || null,
  }));

  res.json({ lastRun: runsForResponse[0] || null, totalRuns: payoutRuns.length, creators: creatorSummaries, recentRuns: runsForResponse.slice(0, 5) });
});

// ═══ UPDATE CAMPAIGN COMMISSION ═══
app.post('/api/brand/update-commission', async (req, res) => {
  const { brandId, campaignId, commission } = req.body;
  if (!brandId || !campaignId) return res.status(400).json({ error: 'brandId and campaignId required' });
  const commissionNum = Math.max(1, Math.min(80, Number(commission) || 10));
  const brands = await loadBrands();
  const brand = brands.find(b => b.id === brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  const registry = await loadCampaignRegistry();
  if (!registry[campaignId]) return res.status(404).json({ error: 'Campaign not found in registry' });
  if (registry[campaignId].brandId && registry[campaignId].brandId !== brandId) return res.status(403).json({ error: 'Not your campaign' });
  const oldCommission = registry[campaignId].commission;
  const commissionHistory = [...(registry[campaignId].commissionHistory || []), { from: oldCommission, to: commissionNum, changedAt: new Date().toISOString(), changedBy: brand.email }];
  await saveCampaignRegistryEntry(campaignId, { ...registry[campaignId], commission: commissionNum, commissionHistory });
  await auditLog(brand.id, 'commission_changed', { campaignId, from: oldCommission, to: commissionNum });
  res.json({ success: true, campaignId, oldCommission, newCommission: commissionNum });
});

// ═══════════════════════════════════════════════════════════
// BRAND OUTREACH PIPELINE — on creator TikTok connect, scrape Shop videos and email brands
// ═══════════════════════════════════════════════════════════
function checkAndTriggerOutreach(creator) {
  if (creator.outreachCompleted) return;
  if (!(creator.tiktokHandle && String(creator.tiktokHandle).trim())) return;
  if (!creator.emailVerified && !creator.email_confirmed_at) return;
  triggerCreatorBrandOutreach(creator).catch(() => {});
}
async function triggerCreatorBrandOutreach(creator) {
  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  const resendKey = process.env.RESEND_KEY;
  if (!apiKey || !resendKey) return;

  const handle = (creator.tiktokHandle || creator.username || '').replace(/^@/, '').trim();
  if (!handle) return;

  // Prevent re-running if already done
  if (creator.outreachCompleted) { return; }

  try {
    // Step 1: fetch creator videos
    const videosRes = await fetch(
      `https://api.scrapecreators.com/v1/tiktok/profile/videos?handle=${encodeURIComponent(handle)}&limit=100`,
      { headers: { 'x-api-key': apiKey } }
    );
    if (!videosRes.ok) {
      console.error(`[OUTREACH] Videos fetch failed for @${handle}: HTTP ${videosRes.status}`);
      return;
    }
    const videosData = await videosRes.json();
    const rawVideos = videosData.aweme_list || videosData.data || videosData.videos || videosData.posts || [];
    // Step 2: filter to shoppable only
    const shopVideos = rawVideos.filter(v => v.shop_product_url || v.commerce_info?.product_items?.length || v.is_commerce_commodity);
    if (!shopVideos.length) return;

    // Step 3: dedupe by product URL
    const seen = new Set();
    const uniqueShopVideos = shopVideos.filter(v => {
      if (seen.has(v.shop_product_url)) return false;
      seen.add(v.shop_product_url);
      return true;
    });

    // Step 4: for each product, get seller and send email
    for (const video of uniqueShopVideos.slice(0, 50)) {
      try {
        const productUrl = video.shop_product_url || video.commerce_info?.product_items?.[0]?.product_id;
        if (!productUrl) continue;
        const productRes = await fetch(
          `https://api.scrapecreators.com/v1/tiktok/product?url=${encodeURIComponent(productUrl)}`,
          { headers: { 'x-api-key': apiKey } }
        );
        if (!productRes.ok) continue;
        const productData = await productRes.json();
        const seller = productData?.seller || productData?.product_info?.seller;
        if (!seller?.name) continue;

        let brandWebsite = '';
        let brandBio = '';
        const sellerTiktokUrl = seller.tiktok_url || '';
        if (sellerTiktokUrl) {
          const sellerHandle = sellerTiktokUrl.split('@')[1]?.split('/')[0] || seller.tiktok_id;
          if (sellerHandle) {
            try {
              const sellerProfileRes = await fetch('https://api.scrapecreators.com/v1/tiktok/profile?handle=' + encodeURIComponent(sellerHandle), { method: 'GET', headers: { 'x-api-key': apiKey } });
              if (sellerProfileRes.ok) {
                const sellerProfile = await sellerProfileRes.json();
                const bioLink = sellerProfile?.user?.bio_link || sellerProfile?.bio_link;
                brandWebsite = (bioLink?.link || bioLink?.url || sellerProfile?.bioLink || '').trim();
                brandBio = (sellerProfile?.user?.signature || sellerProfile?.signature || sellerProfile?.bio || '').trim();
              }
            } catch (_) {}
          }
        }

        const fullTitle = productData?.product_base?.title || productData?.product_info?.product_base?.title || 'your product';
        const productTitle = fullTitle.length > 60 ? fullTitle.substring(0, 60).trim() + '…' : fullTitle;
        const videoUrl = video.share_url || video.url || video.playAddr || video.play_addr || (video.video && (video.video.play_addr?.url_list?.[0] || video.video.play_addr)) || 'https://www.tiktok.com/@' + handle;
        const videoThumb = video.cover || video.cover_url || (video.video?.cover?.url_list && video.video.cover.url_list[0]) || '';
        const thumbImg = videoThumb
          ? `<a href="${videoUrl}" target="_blank" style="display:block;text-decoration:none;"><img src="${videoThumb}" alt="TikTok video" style="width:100%;max-width:340px;border-radius:10px;display:block;" /><p style="margin:8px 0 0 0;font-size:13px;color:#0553B8;font-weight:500;">▶ Watch on TikTok</p></a>`
          : `<a href="${videoUrl}" target="_blank" style="display:block;background:#f0f0f0;border-radius:10px;padding:32px;text-align:center;color:#0553B8;text-decoration:none;">▶ View video on TikTok →</a>`;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'David at Creatorship <david@creatorship.app>',
            to: ['david@creatorship.app'],
            reply_to: creator.email || undefined,
            subject: `${creator.displayName || '@' + handle} made a TikTok video of "${productTitle}" — licensed for Meta ads`,
            html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        
        <!-- Header -->
        <tr>
          <td style="padding:28px 40px 24px 40px;border-bottom:1px solid #f0f0f0;">
            <span style="font-size:24px;font-weight:800;letter-spacing:-0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              <span style="color:#FF0050;">C</span><span style="color:#ee0055;">r</span><span style="color:#cc0077;">e</span><span style="color:#aa0099;">a</span><span style="color:#7700bb;">t</span><span style="color:#00bbdd;">o</span><span style="color:#00ccee;">r</span><span style="color:#0553B8;">ship</span>
            </span>
          </td>
        </tr>

        <!-- Hero -->
        <tr>
          <td style="padding:36px 40px 0 40px;">
            <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#0553B8;text-transform:uppercase;letter-spacing:0.8px;">New Licensed Content</p>
            <h1 style="margin:0 0 20px 0;font-size:24px;font-weight:700;color:#111;line-height:1.3;">
              @${handle} licensed their TikTok video of your product for Meta ads
            </h1>
            <p style="margin:0 0 28px 0;font-size:16px;color:#444;line-height:1.6;">
              <strong>@${handle}</strong> recently made a TikTok featuring <strong>${productTitle}</strong> and granted Creatorship the rights to run it as a Meta ad campaign on their behalf.
            </p>
          </td>
        </tr>

        <!-- Video Thumbnail -->
        <tr>
          <td style="padding:0 40px 28px 40px;">
            ${thumbImg}
          </td>
        </tr>

        <!-- Value Prop -->
        <tr>
          <td style="padding:0 40px 32px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9ff;border-radius:10px;border:1px solid #e8ecff;">
              <tr><td style="padding:24px 28px;">
                <p style="margin:0 0 16px 0;font-size:16px;font-weight:600;color:#111;">What this means for you</p>
                <table cellpadding="0" cellspacing="0">
                  <tr><td style="padding:6px 0;font-size:15px;color:#333;line-height:1.5;">✅&nbsp; This video is cleared to run as a paid Meta ad</td></tr>
                  <tr><td style="padding:6px 0;font-size:15px;color:#333;line-height:1.5;">✅&nbsp; We handle campaign setup, targeting &amp; reporting</td></tr>
                  <tr><td style="padding:6px 0;font-size:15px;color:#333;line-height:1.5;">✅&nbsp; Pay a set commission on performance only</td></tr>
                  <tr><td style="padding:6px 0;font-size:15px;color:#333;line-height:1.5;">✅&nbsp; No upfront cost. No monthly fees. Ever.</td></tr>
                </table>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:0 40px 40px 40px;">
            <a href="https://www.creatorship.app" target="_blank" style="display:inline-block;background:#0553B8;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:16px 32px;border-radius:8px;letter-spacing:0.2px;">
              Start running Meta ads via Creatorship.app →
            </a>
            <p style="margin:16px 0 0 0;font-size:14px;color:#666;">Free to get started. No credit card required.</p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;background:#f9f9f9;border-top:1px solid #f0f0f0;">
            <p style="margin:0;font-size:12px;color:#999;line-height:1.6;">
              You're receiving this because @${handle} granted Creatorship the rights to license their TikTok content for Meta advertising.
              <a href="mailto:david@creatorship.app?subject=STOP" style="color:#999;">Unsubscribe</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
          })
        });

        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.error('[OUTREACH] Product loop error for @' + handle + ':', e.message);
      }
    }

    // Mark outreach as completed so it doesn't re-run
    const creators = await loadCreators();
    const idx = creators.findIndex(c => c.id === creator.id);
    if (idx !== -1) {
      creators[idx].outreachCompleted = true;
      creators[idx].outreachCompletedAt = new Date().toISOString();
      await saveCreators(creators);
    }
  } catch (e) {
    console.error('[OUTREACH] Pipeline failed for @' + handle + ':', e.message);
  }
}

app.post('/api/creator/trigger-outreach', async (req, res) => {
  try {
    const creatorId = req.headers['x-creator-id'];
    const creatorToken = req.headers['x-creator-token'];
    if (!creatorId || !creatorToken) return res.status(401).json({ error: 'Unauthorized' });
    const creator = await getCreatorById(creatorId, creatorToken);
    if (!creator) return res.status(401).json({ error: 'Unauthorized' });
    triggerCreatorBrandOutreach(creator).catch(() => {});
    res.json({ success: true, message: 'Outreach pipeline started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// TERMS & PRIVACY — served by React SPA (static HTML files kept as data sources)
const PUBLIC_DIR = path.join(__dirname, 'public');

app.get('/api/fetch-tiktok-profile', async (req, res) => {
  try {
    let handle = String(req.query.handle || '').trim().replace(/^@/, '');
    if (!handle) return res.status(400).json({ error: 'handle required' });
    const apiKey = process.env.SCRAPECREATORS_API_KEY;
    if (!apiKey) return res.status(502).json({ error: 'ScrapeCreators API key not configured' });
    const profileUrl = 'https://api.scrapecreators.com/v1/tiktok/profile?handle=' + encodeURIComponent(handle);
    const profileResp = await fetch(profileUrl, { method: 'GET', headers: { 'x-api-key': apiKey, 'content-type': 'application/json' } });
    if (!profileResp.ok) return res.status(404).json({ error: 'Profile not found' });
    const profileData = await profileResp.json();
    if (!profileData.success || !profileData.user) return res.status(404).json({ error: 'Profile not found' });
    const user = profileData.user;
    const stats = profileData.stats || {};
    const displayName = user.nickname || user.unique_id || handle;
    const videoCount = stats.videoCount || 0;
    return res.json({
      avatarUrl: user.avatarThumb || user.avatarMedium || '',
      displayName,
      handle: user.unique_id || user.handle || user.username || handle,
      videoCount,
    });
  } catch (e) {
    console.error('[fetch-tiktok-profile] Error:', e);
    return res.status(404).json({ error: 'Profile not found' });
  }
});

app.get('/api/creator/enrich', async (req, res) => {
  try {
    const rawUrl = String(req.query.url || '');
    const m = rawUrl.match(/@([A-Za-z0-9_.]+)/);
    if (!m) return res.status(400).json({ error: 'Invalid TikTok profile URL' });
    const handle = m[1];

    const apiKey = process.env.SCRAPECREATORS_API_KEY;
    if (!apiKey) return res.status(502).json({ error: 'ScrapeCreators API key not configured' });

    const headers = { 'x-api-key': apiKey, 'content-type': 'application/json' };
    const profileUrl = 'https://api.scrapecreators.com/v1/tiktok/profile?handle=' + encodeURIComponent(handle);
    const videosUrl = 'https://api.scrapecreators.com/v1/tiktok/profile/videos?handle=' + encodeURIComponent(handle) + '&limit=6';

    const profileResp = await fetch(profileUrl, { method: 'GET', headers });
    if (!profileResp.ok) {
      let profileErr = '';
      try { profileErr = await profileResp.text(); } catch (_) {}
      console.error('[creator/enrich] ScrapeCreators profile error:', profileResp.status, profileErr);
      return res.status(502).json({ error: 'Failed to fetch creator data from ScrapeCreators' });
    }

    const profileData = await profileResp.json();
    if (!profileData.success) {
      return res.status(502).json({ error: profileData.message || 'ScrapeCreators error' });
    }
    const user = profileData.user || {};
    const stats = profileData.stats || {};

    let rawVideos = [];
    try {
      const videosResp = await fetch(videosUrl, { method: 'GET', headers });
      if (!videosResp.ok) {
        let videosErr = '';
        try { videosErr = await videosResp.text(); } catch (_) {}
        console.error('[creator/enrich] ScrapeCreators videos error:', videosResp.status, videosErr);
      } else {
        const videosData = await videosResp.json();
        rawVideos = videosData.data?.videos || videosData.data?.items || videosData.data || videosData.videos || videosData.items || [];
      }
    } catch (videosErr) {
      console.error('[creator/enrich] Videos fetch failed:', videosErr);
    }

    return res.json({
      handle: user.unique_id || user.handle || user.username || handle,
      displayName: user.nickname || '',
      avatarUrl: user.avatarThumb || user.avatarMedium || '',
      bio: user.signature || '',
      verified: user.verified || false,
      followerCount: stats.followerCount || 0,
      followingCount: stats.followingCount || 0,
      heartCount: stats.heartCount || stats.heart || 0,
      videoCount: stats.videoCount || 0,
      videos: (Array.isArray(rawVideos) ? rawVideos : []).map(v => ({
        id: v.aweme_id || v.id || v.video_id || '',
        desc: v.desc || v.caption || v.title || '',
        cover: v.video?.cover?.url_list?.[0] || v.cover || v.cover_url || v.video_cover || '',
        playAddr: v.video?.play_addr?.url_list?.[0] || v.play_addr || v.play_url || v.content_url || '',
        views: Number(v.statistics?.play_count || v.views || v.play_count || 0),
        likes: Number(v.statistics?.digg_count || v.likes || v.like_count || 0),
        comments: Number(v.statistics?.comment_count || v.comments || v.comment_count || 0),
        shares: Number(v.statistics?.share_count || v.shares || v.share_count || 0),
      })),
    });
  } catch (e) {
    console.error('[creator/enrich] Error:', e);
    return res.status(500).json({ error: 'Failed to enrich creator profile' });
  }
});

app.post('/api/creator/enrich-profile', async (req, res) => {
  try {
    const { creatorId } = req.body;
    if (!creatorId) return res.json({ error: 'creatorId required' });

    const creators = await loadCreators();
    const creator = creators.find(c => c.id === creatorId);
    if (!creator) return res.json({ error: 'Creator not found' });

    const handleRaw = (creator.tiktokHandle || creator.displayName || '').trim().replace(/^@/, '');
    if (!handleRaw) return res.json({ error: 'No handle to enrich' });
    const looksLikeOpenId = handleRaw.startsWith('-') || (handleRaw.length > 20 && /^[A-Za-z0-9_-]+$/.test(handleRaw));
    if (looksLikeOpenId) return res.json({ error: 'No handle to enrich' });

    const apiKey = process.env.SCRAPECREATORS_API_KEY;
    if (!apiKey) return res.json({ success: false, error: 'ScrapeCreators API key not configured' });

    const headers = { 'x-api-key': apiKey, 'content-type': 'application/json' };
    const profileUrl = 'https://api.scrapecreators.com/v1/tiktok/profile?handle=' + encodeURIComponent(handleRaw);
    const profileResp = await fetch(profileUrl, { method: 'GET', headers });
    if (!profileResp.ok) {
      let profileErr = '';
      try { profileErr = await profileResp.text(); } catch (_) {}
      return res.json({ success: false, error: 'Enrich failed', detail: profileErr || profileResp.status });
    }

    const profileData = await profileResp.json();
    if (!profileData.success) return res.json({ success: false, error: profileData.message || 'ScrapeCreators error' });

    const user = profileData.user || {};
    const stats = profileData.stats || {};
    const enrichData = {
      handle: user.unique_id || user.handle || user.username || handleRaw,
      displayName: user.nickname || '',
      avatarUrl: user.avatarThumb || user.avatarMedium || '',
      followerCount: stats.followerCount || 0,
      videoCount: stats.videoCount || 0,
      verified: user.verified || false,
    };
    if (!enrichData.avatarUrl) return res.json({ success: false, error: 'Enrich failed', detail: 'No avatar in response' });

    const idx = creators.findIndex(c => c.id === creatorId);
    if (idx === -1) return res.json({ error: 'Creator not found' });

    const isGarbled = !creator.tiktokHandle || creator.tiktokHandle.startsWith('-') ||
      (creator.tiktokHandle.length > 20 && /^[A-Za-z0-9_-]+$/.test(creator.tiktokHandle));

    creators[idx].tiktokAvatar = enrichData.avatarUrl;
    creators[idx].tiktokFollowers = enrichData.followerCount || 0;
    creators[idx].tiktokVideos = enrichData.videoCount || 0;
    creators[idx].enrichedProfile = enrichData;
    if (isGarbled && enrichData.handle) creators[idx].tiktokHandle = enrichData.handle;
    if (enrichData.displayName && (!creator.displayName || creator.displayName === (creator.email || '').split('@')[0])) {
      creators[idx].displayName = enrichData.displayName;
    }

    await saveCreators(creators);
    const updated = { ...creators[idx] };
    delete updated.password;
    return res.json({ success: true, creator: updated });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

app.get('/api/brand/enrich', async (req, res) => {
  try {
    const brandName = String(req.query.brandName || '').trim();
    const url = String(req.query.url || '').trim();

    if (brandName) {
      const apiResp = await fetch(
        'https://api.scrapecreators.com/v1/tiktok/shop/search?query=' + encodeURIComponent(brandName) + '&region=US',
        { method: 'GET', headers: { 'x-api-key': process.env.SCRAPECREATORS_API_KEY } }
      );
      const data = await apiResp.json();
      if (!apiResp.ok || data?.success === false) {
        return res.status(502).json({ error: data?.message || 'Could not search shop' });
      }
      const products = Array.isArray(data?.products) ? data.products : [];
      const first = products[0];
      const seller = first?.seller_info || {};
      const nameLower = brandName.toLowerCase();
      const match = products.find(p => (p.seller_info?.shop_name || '').toLowerCase().includes(nameLower)) || first;
      const sellerInfo = match?.seller_info || seller;
      let logoUrl = '';
      const tryLogo = (v) => { if (typeof v === 'string' && v) return v; if (v?.url_list?.[0]) return v.url_list[0]; return ''; };
      logoUrl = tryLogo(sellerInfo.sellerLogo) || tryLogo(sellerInfo.shopLogo) || tryLogo(sellerInfo.avatarUrl) || tryLogo(sellerInfo.avatar) || tryLogo(sellerInfo.logo) || tryLogo(sellerInfo.seller_logo) || tryLogo(sellerInfo.shop_avatar) || tryLogo(sellerInfo.shop_logo) || '';
      // Fallback: check product-level seller_info.shop_logo (raw API response)
      if (!logoUrl) {
        for (const p of products) {
          const pLogo = p.seller_info?.shop_logo?.url_list?.[0] || p.seller_info?.shop_avatar?.url_list?.[0];
          if (pLogo) { logoUrl = pLogo; break; }
        }
      }
      const sameSeller = sellerInfo.seller_id ? products.filter(p => p.seller_info?.seller_id === sellerInfo.seller_id) : products;
      const topProducts = sameSeller.slice(0, 20);
      const storeName = sellerInfo.shop_name || brandName || '';
      const storeId = extractStoreIdFromShopResponse(data) ?? sellerInfo.seller_id ?? sellerInfo.shop_id ?? sellerInfo.store_id;
      const tikTokShopUrl = storeId && storeName
        ? 'https://www.tiktok.com/shop/store/' + slugifyStoreName(storeName) + '/' + String(storeId)
        : (sellerInfo.shop_link || sellerInfo.shop_url || '');
      const brandId = req.brandAuth?.brandId || req.query.brandId;
      if (brandId && tikTokShopUrl) {
        const brand = await getBrandById(brandId);
        if (brand) {
          brand.tikTokShopUrl = tikTokShopUrl;
          brand.shopLogo = logoUrl || brand.shopLogo;
          if (!brand.tikTokStorePageUrl && storeName) {
            const cleanHandle = storeName.toLowerCase().replace(/[^a-z0-9]/g, '');
            brand.tikTokStorePageUrl = 'https://www.tiktok.com/@' + cleanHandle;
          }
          await saveBrand(brand);
        }
      }
      const followerCount = sellerInfo.follower_count ?? sellerInfo.followers ?? null;
      const totalItemsSold = sellerInfo.total_sold ?? sellerInfo.sold_count ?? null;
      const totalProducts = sellerInfo.product_count ?? topProducts.length ?? null;
      const rating = sellerInfo.rating ?? sellerInfo.shop_rating ?? null;
      const reviewCount = sellerInfo.review_count ?? null;
      // --- Follow-up: call /shop/products with discovered store URL to get shopInfo + all products ---
      let finalLogo = logoUrl || '';
      let finalProducts = topProducts;
      let finalShopInfo = {};
      let finalTotalProducts = totalProducts;
      if (tikTokShopUrl) {
        try {
          let allProducts = [];
          let cursor = undefined;
          let pageCount = 0;
          const maxPages = 5; // safety limit (5 pages × ~10 products = ~50 max)
          do {
            const productsUrl = 'https://api.scrapecreators.com/v1/tiktok/shop/products?url=' + encodeURIComponent(tikTokShopUrl) + '&region=US' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
            const pResp = await fetch(productsUrl, { method: 'GET', headers: { 'x-api-key': process.env.SCRAPECREATORS_API_KEY } });
            const pData = await pResp.json();
            if (!pResp.ok || pData?.success === false) break;
            if (pageCount === 0 && pData.shopInfo) {
              finalShopInfo = pData.shopInfo;
              const tryL = (v) => { if (typeof v === 'string' && v) return v; if (v?.url_list?.[0]) return v.url_list[0]; return ''; };
              finalLogo = tryL(pData.shopInfo.shop_logo) || finalLogo;
              finalTotalProducts = pData.shopInfo.on_sell_product_count || pData.shopInfo.display_on_sell_product_count || finalTotalProducts;
            }
            const pageProducts = Array.isArray(pData.products) ? pData.products : [];
            allProducts = allProducts.concat(pageProducts);
            cursor = pData.has_more ? pData.cursor : undefined;
            pageCount++;
          } while (cursor && pageCount < maxPages);
          if (allProducts.length > 0) {
            finalProducts = allProducts;
          }
        } catch (e) {
          console.error('[brand/enrich] Follow-up /shop/products failed:', e.message);
        }
      }
      // Also try product-level seller_info.shop_logo as final fallback
      if (!finalLogo && finalProducts.length > 0) {
        const firstSeller = finalProducts[0]?.seller_info;
        if (firstSeller?.shop_logo?.url_list?.[0]) finalLogo = firstSeller.shop_logo.url_list[0];
      }
      // Final fallback: fetch TikTok profile avatar from ScrapeCreators
      if (!finalLogo) {
        try {
          const profileHandle = (storeName || brandName || '').toLowerCase().replace(/[\s_\-.]+/g, '');
          if (profileHandle) {
            const profileResp = await fetch('https://api.scrapecreators.com/v1/tiktok/profile?handle=' + encodeURIComponent(profileHandle), {
              headers: { 'x-api-key': process.env.SCRAPE_KEY || process.env.SCRAPECREATORS_API_KEY }
            });
            if (profileResp.ok) {
              const profileData = await profileResp.json();
              finalLogo = profileData.avatar_url || profileData.avatar_url_100 || profileData.avatar_thumb?.url_list?.[0] || profileData.avatar_medium?.url_list?.[0] || '';
              if (finalLogo) console.log('[brand/enrich] Got avatar from profile endpoint for @' + profileHandle);
            }
          }
        } catch (e) { console.error('[brand/enrich] Profile avatar fallback failed:', e.message); }
      }
      const enrichFollowers = finalShopInfo.followers_count ?? finalShopInfo.follower_count ?? followerCount;
      const enrichSold = finalShopInfo.sold_count ?? finalShopInfo.total_sold ?? totalItemsSold;
      const enrichRating = finalShopInfo.shop_rating ?? finalShopInfo.rating ?? rating;
      const enrichReviews = finalShopInfo.review_count ?? reviewCount;
      if (brandId && finalLogo) {
        const brand = await getBrandById(brandId);
        if (brand) {
          brand.shopLogo = finalLogo || brand.shopLogo;
          await saveBrand(brand);
        }
      }
      return res.json({
        shopName: finalShopInfo.shop_name || storeName,
        storeName: finalShopInfo.shop_name || storeName || undefined,
        shopLogo: finalLogo || '',
        logoUrl: finalLogo || undefined,
        avatarUrl: finalLogo || undefined,
        followerCount: enrichFollowers != null && !isNaN(enrichFollowers) ? Number(enrichFollowers) : undefined,
        totalItemsSold: enrichSold != null && !isNaN(enrichSold) ? Number(enrichSold) : undefined,
        totalProducts: finalTotalProducts != null && !isNaN(finalTotalProducts) ? Number(finalTotalProducts) : undefined,
        rating: enrichRating != null && enrichRating !== '' ? (typeof enrichRating === 'number' ? enrichRating : parseFloat(enrichRating)) : undefined,
        reviewCount: enrichReviews != null && !isNaN(enrichReviews) ? Number(enrichReviews) : undefined,
        shopRating: finalShopInfo.shop_rating || (enrichRating != null ? String(enrichRating) : ''),
        soldCount: finalShopInfo.format_sold_count || (enrichSold != null ? String(enrichSold) : ''),
        followersCount: finalShopInfo.format_followers_count || (enrichFollowers != null ? String(enrichFollowers) : ''),
        productCount: finalTotalProducts || finalProducts.length,
        shopSlogan: finalShopInfo.shop_slogan || sellerInfo.shop_slogan || '',
        shopLink: finalShopInfo.shop_link || sellerInfo.shop_link || sellerInfo.shop_url || '',
        tikTokShopUrl: tikTokShopUrl || undefined,
        products: finalProducts.slice(0, 50).map(p => ({
          id: p.product_id,
          title: p.title,
          image: (typeof p.image === 'string' ? p.image : (p.image?.url_list?.[0] || '')),
          price: p.product_price_info?.sale_price_format || p.product_price_info?.single_product_price_format || '',
          soldCount: p.sold_info?.sold_count || 0,
          rating: p.rate_info?.score || 0,
          url: p.seo_url?.canonical_url || ''
        }))
      });
    }

    if (!url) return res.status(400).json({ error: 'Shop URL or brandName required' });

    const apiResp = await fetch(
      'https://api.scrapecreators.com/v1/tiktok/shop/products?url=' + encodeURIComponent(url),
      { method: 'GET', headers: { 'x-api-key': process.env.SCRAPECREATORS_API_KEY } }
    );
    const data = await apiResp.json();
    if (!apiResp.ok || data?.success === false) {
      return res.status(502).json({ error: data?.message || 'Could not fetch shop' });
    }

    const shopInfo = data?.shopInfo || data || {};
    let allUrlProducts = Array.isArray(data?.products) ? data.products : [];
    // --- Paginate through remaining pages ---
    let urlCursor = data?.has_more ? data?.cursor : undefined;
    let urlPageCount = 1;
    const urlMaxPages = 5;
    while (urlCursor && urlPageCount < urlMaxPages) {
      try {
        const nextUrl = 'https://api.scrapecreators.com/v1/tiktok/shop/products?url=' + encodeURIComponent(url) + '&region=US&cursor=' + encodeURIComponent(urlCursor);
        const nextResp = await fetch(nextUrl, { method: 'GET', headers: { 'x-api-key': process.env.SCRAPECREATORS_API_KEY } });
        const nextData = await nextResp.json();
        if (!nextResp.ok || nextData?.success === false) break;
        const nextProducts = Array.isArray(nextData?.products) ? nextData.products : [];
        allUrlProducts = allUrlProducts.concat(nextProducts);
        urlCursor = nextData?.has_more ? nextData?.cursor : undefined;
        urlPageCount++;
      } catch (e) { console.error('[brand/enrich] URL pagination error:', e.message); break; }
    }
    const products = allUrlProducts;
    const tryLogo = (v) => { if (typeof v === 'string' && v) return v; if (v?.url_list?.[0]) return v.url_list[0]; return ''; };
    let logoUrl = tryLogo(shopInfo.sellerLogo) || tryLogo(shopInfo.shopLogo) || tryLogo(shopInfo.avatarUrl) || tryLogo(shopInfo.avatar) || tryLogo(shopInfo.logo) || tryLogo(shopInfo.seller_logo) || tryLogo(shopInfo.shop_avatar) || tryLogo(shopInfo.shop_logo) || tryLogo(shopInfo.cover) || '';
    // Fallback: check product-level seller_info.shop_logo (raw API response)
    if (!logoUrl) {
      for (const p of products) {
        const pLogo = p.seller_info?.shop_logo?.url_list?.[0] || p.seller_info?.shop_avatar?.url_list?.[0];
        if (pLogo) { logoUrl = pLogo; break; }
      }
    }
    // Final fallback: fetch TikTok profile avatar from ScrapeCreators
    if (!logoUrl) {
      try {
        const profileHandle = (shopInfo.shop_name || url.match(/\/store\/([^/]+)/)?.[1] || '').toLowerCase().replace(/[\s_\-.]+/g, '');
        if (profileHandle) {
          const profileResp = await fetch('https://api.scrapecreators.com/v1/tiktok/profile?handle=' + encodeURIComponent(profileHandle), {
            headers: { 'x-api-key': process.env.SCRAPE_KEY || process.env.SCRAPECREATORS_API_KEY }
          });
          if (profileResp.ok) {
            const profileData = await profileResp.json();
            logoUrl = profileData.avatar_url || profileData.avatar_url_100 || profileData.avatar_thumb?.url_list?.[0] || profileData.avatar_medium?.url_list?.[0] || '';
            if (logoUrl) console.log('[brand/enrich] Got avatar from profile endpoint for @' + profileHandle);
          }
        }
      } catch (e) { console.error('[brand/enrich] Profile avatar fallback failed:', e.message); }
    }
    const storeName = shopInfo.shop_name || '';
    const storeIdEnrich = extractStoreIdFromShopResponse(data);
    const tikTokShopUrlEnrich = storeIdEnrich && storeName
      ? 'https://www.tiktok.com/shop/store/' + slugifyStoreName(storeName) + '/' + String(storeIdEnrich)
      : (shopInfo.shop_link || shopInfo.shop_url || '');
    const brandIdEnrich = req.brandAuth?.brandId || req.query.brandId;
    if (brandIdEnrich && tikTokShopUrlEnrich) {
      const brand = await getBrandById(brandIdEnrich);
      if (brand) {
        brand.tikTokShopUrl = tikTokShopUrlEnrich;
        brand.shopLogo = logoUrl || brand.shopLogo;
        if (!brand.tikTokStorePageUrl && storeName) {
          const cleanHandle = storeName.toLowerCase().replace(/[^a-z0-9]/g, '');
          brand.tikTokStorePageUrl = 'https://www.tiktok.com/@' + cleanHandle;
        }
        await saveBrand(brand);
      }
    }
    const followerCount = shopInfo.followers_count ?? shopInfo.follower_count ?? (typeof shopInfo.format_followers_count === 'string' ? parseInt(shopInfo.format_followers_count.replace(/\D/g, ''), 10) : shopInfo.format_followers_count);
    const totalItemsSold = shopInfo.sold_count ?? shopInfo.total_sold ?? (typeof shopInfo.format_sold_count === 'string' ? parseInt(shopInfo.format_sold_count.replace(/\D/g, ''), 10) : shopInfo.format_sold_count);
    const totalProducts = shopInfo.product_count ?? shopInfo.display_on_sell_product_count ?? products.length;
    const rating = shopInfo.rating ?? shopInfo.shop_rating ?? shopInfo.rating_value;
    const reviewCount = shopInfo.review_count ?? shopInfo.reviews_count;
    return res.json({
      shopName: storeName,
      storeName: storeName || undefined,
      shopLogo: logoUrl || '',
      logoUrl: logoUrl || undefined,
      avatarUrl: logoUrl || undefined,
      followerCount: followerCount != null && !isNaN(followerCount) ? Number(followerCount) : undefined,
      totalItemsSold: totalItemsSold != null && !isNaN(totalItemsSold) ? Number(totalItemsSold) : undefined,
      totalProducts: totalProducts != null && !isNaN(totalProducts) ? Number(totalProducts) : undefined,
      rating: rating != null && rating !== '' ? (typeof rating === 'number' ? rating : parseFloat(rating)) : undefined,
      reviewCount: reviewCount != null && !isNaN(reviewCount) ? Number(reviewCount) : undefined,
      shopRating: shopInfo.shop_rating || (rating != null ? String(rating) : ''),
      soldCount: shopInfo.format_sold_count || (totalItemsSold != null ? String(totalItemsSold) : ''),
      followersCount: shopInfo.format_followers_count || (followerCount != null ? String(followerCount) : ''),
      productCount: shopInfo.display_on_sell_product_count || products.length,
      shopSlogan: shopInfo.shop_slogan || '',
      shopLink: shopInfo.shop_link || '',
      tikTokShopUrl: tikTokShopUrlEnrich || undefined,
      products: products.slice(0, 50).map(p => ({
        id: p.product_id,
        title: p.title,
        image: p.image?.url_list?.[0] || '',
        price: p.product_price_info?.sale_price_format || '',
        soldCount: p.sold_info?.sold_count || 0,
        rating: p.rate_info?.score || 0,
        url: p.seo_url?.canonical_url || ''
      }))
    });
  } catch (e) {
    console.error('[brand/enrich] Error:', e);
    return res.status(500).json({ error: 'Failed to enrich brand shop' });
  }
});

function requireAdminPassword(req, res, next) {
  if (req.headers['x-admin-password'] === process.env.ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.get('/api/admin/creators', requireAdminPassword, async (req, res) => {
  res.json(await loadCreators());
});

app.patch('/api/admin/creators/:email', requireAdminPassword, async (req, res) => {
  const targetEmail = String(req.params.email || '').toLowerCase();
  const creators = await loadCreators();
  const idx = creators.findIndex(c => (c.email || '').toLowerCase() === targetEmail);
  if (idx === -1) return res.status(404).json({ error: 'Creator not found' });

  const body = req.body || {};
  if (body.displayName !== undefined) creators[idx].displayName = body.displayName;
  if (body.tiktokHandle !== undefined) creators[idx].tiktokHandle = body.tiktokHandle;
  if (body.email !== undefined) creators[idx].email = String(body.email || '').toLowerCase();
  if (body.notes !== undefined) creators[idx].notes = body.notes;
  if (body.banned !== undefined) {
    creators[idx].banned = !!body.banned;
    if (creators[idx].banned) {
      creators[idx].bannedAt = new Date().toISOString();
      creators[idx].bannedReason = body.bannedReason || '';
    } else {
      delete creators[idx].bannedAt;
      delete creators[idx].bannedReason;
    }
  }
  await saveCreators(creators);
  return res.json(creators[idx]);
});

// DELETE ghost/corrupt creator entries with no email and no creatorId/id
app.delete('/api/admin/creators/purge-ghosts', requireAdminPassword, async (req, res) => {
  try {
    const creators = await loadCreators();
    const before = creators.length;
    const filtered = creators.filter(c => c.email && (c.id || c.creatorId));
    await saveCreators(filtered);
    return res.json({ success: true, removed: before - filtered.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/creators/:email', requireAdminPassword, async (req, res) => {
  const targetEmail = String(req.params.email || '').toLowerCase();
  if (!targetEmail || targetEmail === 'undefined') {
    return res.status(400).json({ error: 'Invalid creator ID' });
  }
  const creators = await loadCreators();
  const idx = creators.findIndex(c => (c.email || '').toLowerCase() === targetEmail);
  if (idx === -1) return res.status(404).json({ error: 'Creator not found' });
  creators.splice(idx, 1);
  await saveCreators(creators);
  return res.json({ success: true });
});

app.patch('/api/admin/brands/:email', requireAdminPassword, async (req, res) => {
  const targetEmail = String(req.params.email || '').toLowerCase();
  const brand = await getBrandByEmail(targetEmail);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });

  const body = req.body || {};
  if (body.displayName !== undefined) brand.displayName = body.displayName;
  if (body.tiktokHandle !== undefined) brand.tiktokHandle = body.tiktokHandle;
  if (body.email !== undefined) brand.email = String(body.email || '').toLowerCase();
  if (body.notes !== undefined) brand.notes = body.notes;
  if (body.banned !== undefined) {
    brand.banned = !!body.banned;
    if (brand.banned) {
      brand.bannedAt = new Date().toISOString();
      brand.bannedReason = body.bannedReason || '';
    } else {
      delete brand.bannedAt;
      delete brand.bannedReason;
    }
  }
  await saveBrand(brand);
  return res.json(brand);
});

app.delete('/api/admin/brands/:email', requireAdminPassword, async (req, res) => {
  const targetEmail = String(req.params.email || '').toLowerCase();
  const brand = await getBrandByEmail(targetEmail);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  await deleteBrandById(brand.id);
  return res.json({ success: true });
});

app.post('/api/admin/creators/:email/ban', requireAdminPassword, async (req, res) => {
  const targetEmail = String(req.params.email || '').toLowerCase();
  const creators = await loadCreators();
  const idx = creators.findIndex(c => (c.email || '').toLowerCase() === targetEmail);
  if (idx === -1) return res.status(404).json({ error: 'Creator not found' });
  creators[idx].banned = true;
  creators[idx].bannedAt = new Date().toISOString();
  creators[idx].bannedReason = (req.body || {}).bannedReason || '';
  await saveCreators(creators);
  return res.json(creators[idx]);
});

app.post('/api/admin/creators/:email/unban', requireAdminPassword, async (req, res) => {
  const targetEmail = String(req.params.email || '').toLowerCase();
  const creators = await loadCreators();
  const idx = creators.findIndex(c => (c.email || '').toLowerCase() === targetEmail);
  if (idx === -1) return res.status(404).json({ error: 'Creator not found' });
  creators[idx].banned = false;
  delete creators[idx].bannedAt;
  delete creators[idx].bannedReason;
  await saveCreators(creators);
  return res.json(creators[idx]);
});

// ═══ HEALTH CHECK ═══
app.get('/api/health', async (req, res) => {
  const start = Date.now();
  const checks = {};
  try {
    if (!supabase) throw new Error('Not configured');
    const { error } = await supabase.from('brands').select('id').limit(1);
    if (error) throw error;
    checks.supabase = { status: 'ok' };
  } catch (e) { checks.supabase = { status: 'error', message: e.message }; }
  try {
    if (!stripe) throw new Error('Not configured');
    await stripe.balance.retrieve();
    checks.stripe = { status: 'ok' };
  } catch (e) { checks.stripe = { status: 'error', message: e.message }; }
  const scrapeKey = process.env.SCRAPE_KEY || process.env.SCRAPECREATORS_API_KEY;
  checks.scrapeCreators = { status: scrapeKey ? 'ok' : 'error', message: scrapeKey ? 'Key set' : 'Not configured' };
  checks.resend = { status: process.env.RESEND_KEY ? 'ok' : 'error', message: process.env.RESEND_KEY ? 'Key set' : 'Not configured' };
  const mem = process.memoryUsage();
  checks.memory = { heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024), rssMB: Math.round(mem.rss / 1024 / 1024) };
  const allOk = checks.supabase.status === 'ok' && checks.stripe.status === 'ok';
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'degraded',
    uptime: Math.round(process.uptime()),
    latencyMs: Date.now() - start,
    checks,
    version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
    timestamp: new Date().toISOString(),
  });
});

// ═══ CAi VERSION INFO ═══
app.get('/api/version', (req, res) => {
  res.json({
    version: CAI_VERSION,
    deployed: new Date().toISOString(),
    node: process.version,
  });
});

// ═══ SENTRY ERROR HANDLER (must be after all routes, before static serving) ═══
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// Global unhandled rejection / exception logging
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  if (process.env.SENTRY_DSN) Sentry.captureException(reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
});

// Creator views their pending license requests (from Supabase)
app.get('/api/creator/license-requests', async (req, res) => {
  const handle = (req.query.handle || '').toLowerCase().replace(/^@/, '');
  const email = (req.query.email || '').toLowerCase();
  if (!handle && !email) return res.json({ requests: [] });
  try {
    let query = supabase.from('content_licenses').select('*');
    if (handle) query = query.ilike('creator_handle', handle);
    else if (email) query = query.ilike('creator_email', email);
    query = query.in('outreach_status', ['outreach_sent', 'pending', 'approved']);
    query = query.order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) { console.error('[license-requests] Supabase error:', error.message); return res.json({ requests: [] }); }
    // Map Supabase column names to the format the frontend expects
    const requests = (data || []).map(r => ({
      id: r.id,
      brandId: r.brand_id,
      creatorHandle: r.creator_handle,
      creatorEmail: r.creator_email,
      videoId: r.video_id,
      videoUrl: r.video_url,
      videoDesc: r.video_desc,
      videoCover: r.video_cover,
      productId: r.product_id,
      productName: r.product_name,
      status: r.outreach_status === 'outreach_sent' ? 'pending' : r.outreach_status,
      revenueSharePct: r.revenue_share_pct,
      sentAt: r.outreach_sent_at,
      approvedAt: r.approved_at,
      declinedAt: r.declined_at,
      licenseStart: r.license_start,
      licenseEnd: r.license_end,
      inCampaign: r.in_campaign,
    }));
    res.json({ requests });
  } catch (e) { console.error('[license-requests] Error:', e.message); res.json({ requests: [] }); }
});

// Creator approves/denies a license request (via Supabase)
app.post('/api/creator/license-respond', async (req, res) => {
  const { requestId, action, creatorEmail } = req.body;
  if (!requestId || !action) return res.status(400).json({ error: 'requestId and action required' });

  const { data: license, error } = await supabase.from('content_licenses').select('*').eq('id', requestId).single();
  if (error || !license) return res.status(404).json({ error: 'Request not found' });

  const now = new Date().toISOString();
  if (action === 'approve') {
    const licenseEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('content_licenses').update({
      outreach_status: 'approved',
      approved_at: now,
      approval_ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      license_start: now,
      license_end: licenseEnd,
      updated_at: now,
    }).eq('id', requestId);
  } else {
    await supabase.from('content_licenses').update({
      outreach_status: 'declined',
      declined_at: now,
      decline_reason: (creatorEmail || '') + ' declined via portal',
      updated_at: now,
    }).eq('id', requestId);
  }

  // Notify brand
  const brand = await getBrandById(license.brand_id);
  if (brand?.email) {
    const approved = action === 'approve';
    await sendEmail(brand.email, (approved ? 'Creator approved' : 'Creator declined') + ' — @' + license.creator_handle, emailBase({
      title: approved ? 'Creator approved your request' : 'Creator declined',
      preheader: '@' + license.creator_handle + ' ' + (approved ? 'approved' : 'declined'),
      headerEmoji: approved ? '🎉' : '❌',
      accentColor: approved ? '#10b981' : '#ef4444',
      accentGradient: approved ? 'linear-gradient(135deg,#10b981,#34d399)' : 'linear-gradient(135deg,#ef4444,#dc2626)',
      bodyHtml: '<p><strong>@' + escapeHtml(license.creator_handle) + '</strong> has ' + (approved ? 'approved' : 'declined') + ' your request to use their video as a Meta ad.</p>' + (approved ? '<p style="color:#6b7280">CAi will automatically add this video to your campaign.</p>' : ''),
      ctaText: approved ? 'View Dashboard' : 'View Dashboard',
      ctaUrl: 'https://www.creatorship.app/brand#dashboard',
    })).catch(() => {});
  }

  await auditLog(license.brand_id, 'license_' + action, { licenseId: requestId, creatorHandle: license.creator_handle, videoId: license.video_id });

  // Auto-add to campaign if approved
  if (action === 'approve' && brand?.cai?.isActive && brand?.cai?.campaign?.id) {
    try {
      await caiAddCreativeToActiveCampaign(brand, license.video_id, null, null);
      await supabase.from('content_licenses').update({ in_campaign: true, campaign_id: brand.cai.campaign.id, added_to_campaign_at: now }).eq('id', requestId);
      console.log('[license-respond] Auto-added video ' + license.video_id + ' to campaign');
    } catch (e) {
      console.error('[license-respond] Auto-add failed:', e.message);
    }
  }

  res.json({ success: true });
});

// Plan status — tells frontend if plan is stale / has new videos
app.get('/api/brand/ai-plan-status', authBrand, async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.query.brandId;
  if (!brandId) return res.status(400).json({ error: 'brandId required' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  const plan = loadAiPlan(brandId);
  const cached = brand.tiktokVideosCache || [];
  const planAge = plan?.generatedAt ? Math.floor((Date.now() - new Date(plan.generatedAt).getTime()) / 86400000) : null;
  const lastScan = brand.lastContentScanAt || null;
  const lastScanAgo = lastScan ? Math.floor((Date.now() - new Date(lastScan).getTime()) / 3600000) : null;
  const newSincePlan = brand.newVideosSincePlan || 0;
  const totalTracked = cached.length;
  const needsRefresh = (newSincePlan >= 2) || (planAge != null && planAge >= 3);
  res.json({
    hasPlan: !!plan,
    planAge,
    planVersion: plan?.version || 1,
    lastScanAt: lastScan,
    lastScanHoursAgo: lastScanAgo,
    newVideosSincePlan: newSincePlan,
    totalVideosTracked: totalTracked,
    videosInPlan: plan?.recommendations?.length || 0,
    needsRefresh,
    reason: needsRefresh ? (newSincePlan >= 2 ? newSincePlan + ' new videos since last plan' : 'Plan is ' + planAge + ' days old') : null,
  });
});

// Manual trigger for daily content scan
app.post('/api/admin/run-content-scan', checkAdmin, async (req, res) => {
  try { await dailyContentScan(); res.json({ success: true }); } catch (e) { res.json({ error: e.message }); }
});

// ═══ STATIC (Vite build) — serve if dist/ exists ═══
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath));
  // Explicit SPA routes so /brand, /brand#overview, /creator, etc. always get index.html
  ['/brand', '/creator', '/admin', '/contact', '/terms', '/privacy'].forEach((p) => {
    app.get(p, (req, res) => res.sendFile(path.join(distPath, 'index.html')));
    app.get(p + '/*', async (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  });
  app.get('*', async (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ═══ START ═══

// ═══ WEEKLY DIGEST EMAIL (Monday 6am UTC) ═══
async function sendWeeklyDigest() {
  console.log('[digest] Running weekly digest...');
  try {
    const brands = await loadBrands();
    const registry = await loadCampaignRegistry();
    let sent = 0;
    for (const brand of brands) {
      if (!brand.email || !brand.metaToken || !brand.adAccount) continue;
      const brandCampaigns = Object.entries(registry).filter(([, m]) => m.brandId === brand.id);
      if (brandCampaigns.length === 0) continue;
      // Pull last 7 days of insights
      const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const until = new Date().toISOString().slice(0, 10);
      let totalSpend = 0, totalImpressions = 0, totalClicks = 0;
      try {
        const url = `https://graph.facebook.com/v22.0/${brand.adAccount}/insights?fields=spend,impressions,clicks&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&limit=100&access_token=${brand.metaToken}`;
        const data = await apiFetch(url);
        for (const d of (data.data || [])) { totalSpend += parseFloat(d.spend || 0); totalImpressions += parseInt(d.impressions || 0); totalClicks += parseInt(d.clicks || 0); }
      } catch (_) {}
      const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0';
      const cpc = totalClicks > 0 ? (totalSpend / totalClicks).toFixed(2) : '0';
      await sendEmail(brand.email, 'Weekly Campaign Digest — ' + (brand.brandName || 'Your Brand'), emailBase({
        title: 'Your Weekly Campaign Digest',
        preheader: '$' + Math.round(totalSpend) + ' spent this week across ' + brandCampaigns.length + ' campaigns',
        headerEmoji: '📊',
        accentColor: '#0668E1',
        accentGradient: 'linear-gradient(135deg,#0668E1,#00C2FF)',
        bodyHtml: `<p>Here's your weekly performance summary for <strong>${escapeHtml(brand.brandName || 'your brand')}</strong>:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#6b7280">Ad Spend</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700">$${totalSpend.toFixed(2)}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#6b7280">Impressions</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700">${totalImpressions.toLocaleString()}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#6b7280">Clicks</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700">${totalClicks.toLocaleString()}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#6b7280">CTR</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700">${ctr}%</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Avg CPC</td><td style="padding:8px 0;text-align:right;font-weight:700">$${cpc}</td></tr>
        </table>
        <p style="color:#6b7280">${brandCampaigns.length} campaign${brandCampaigns.length !== 1 ? 's' : ''} running · Week of ${since} to ${until}</p>`,
        ctaText: 'View Dashboard',
        ctaUrl: 'https://www.creatorship.app/brand#campaigns',
      })).catch(() => {});
      sent++;
      logActivity('weekly_digest_sent', { brandId: brand.id, email: brand.email, spend: totalSpend });
    }
    console.log('[digest] Sent', sent, 'weekly digests');
  } catch (e) { console.error('[digest] Error:', e.message); }
}

// Manual trigger for weekly digest
app.post('/api/admin/send-digest', checkAdmin, async (req, res) => {
  try { await sendWeeklyDigest(); res.json({ success: true }); } catch (e) { res.json({ error: e.message }); }
});

// ═══ CREATOR LICENSE REQUESTS ═══
const LICENSE_DIR = path.join(DATA_DIR, 'license_requests');
ensureDir(LICENSE_DIR);

// Brand requests license for specific videos from a creator
app.post('/api/brand/license-request', authBrand, async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  const { creatorHandle, videos, message } = req.body;
  if (!brandId || !creatorHandle || !videos?.length) return res.status(400).json({ error: 'brandId, creatorHandle, and videos required' });

  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });

  const requestId = 'lr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const request = {
    id: requestId,
    brandId,
    brandName: brand.brandName || brand.storeName || '',
    creatorHandle,
    videos: videos.map(v => ({
      id: v.id,
      desc: v.desc || '',
      views: v.views || 0,
      cover: v.cover || '',
      tiktokUrl: v.tiktokUrl || '',
      projectedDailyBudget: v.dailyBudget || 50,
      projectedCommission: v.commission || brand.defaultCommission || 10,
      projectedMonthlyEarnings: Math.round((v.dailyBudget || 50) * 30 * (v.predictedRoasLow || 2) * ((v.commission || brand.defaultCommission || 10) / 100)),
    })),
    message: message || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  // Save request
  const filePath = path.join(LICENSE_DIR, requestId + '.json');
  saveJson(filePath, request);

  // Find creator by handle and send email
  const creators = await loadCreators();
  const creator = creators.find(c => (c.tiktokHandle || '').toLowerCase() === creatorHandle.toLowerCase() || (c.displayName || '').toLowerCase() === creatorHandle.toLowerCase());

  if (creator?.email) {
    const totalProjected = request.videos.reduce((s, v) => s + v.projectedMonthlyEarnings, 0);
    await sendEmail(creator.email, brand.brandName + ' wants to run your content as Meta ads', emailBase({
      title: 'A brand wants to use your content',
      preheader: 'Projected earnings: $' + totalProjected.toLocaleString() + '/mo',
      headerEmoji: '💰',
      accentColor: '#10b981',
      accentGradient: 'linear-gradient(135deg,#10b981,#34d399)',
      bodyHtml: `<p><strong>${escapeHtml(brand.brandName || 'A brand')}</strong> wants to run ${request.videos.length} of your TikTok video${request.videos.length > 1 ? 's' : ''} as Meta (Facebook/Instagram) ads.</p>
      <p style="font-size:24px;font-weight:800;color:#10b981;margin:16px 0">$${totalProjected.toLocaleString()}/mo projected earnings</p>
      <p style="color:#6b7280">You earn ${request.videos[0].projectedCommission}% commission on every sale the ads drive. No upfront cost — you only earn money.</p>
      ${message ? '<p style="color:#6b7280;font-style:italic">"' + escapeHtml(message) + '"</p>' : ''}`,
      ctaText: 'Review & Approve',
      ctaUrl: 'https://www.creatorship.app/creator#license-' + requestId,
    })).catch(() => {});
    logActivity('license_request_sent', { brandId, creatorHandle, videos: request.videos.length, creatorEmail: creator.email });
  }

  logActivity('license_request_created', { brandId, creatorHandle, videos: request.videos.length, requestId });
  res.json({ success: true, requestId, request });
});

// ═══ DAILY CONTENT MONITORING ═══
async function dailyContentScan() {
  console.log('[scan] Running daily content scan...');
  const scrapeKey = process.env.SCRAPE_KEY;
  if (!scrapeKey) { console.log('[scan] No SCRAPE_KEY — skipping'); return; }
  try {
    const brands = await loadBrands();
    let scanned = 0;
    for (const brand of brands) {
      if (!brand.storeName) continue;
      const handle = (brand.storeName || '').toLowerCase().replace(/\s+/g, '');
      if (!handle) continue;
      try {
        const videosRes = await fetch(
          `https://api.scrapecreators.com/v1/tiktok/profile/videos?handle=${encodeURIComponent(handle)}&limit=30`,
          { headers: { 'x-api-key': scrapeKey } }
        );
        if (!videosRes.ok) continue;
        const videosData = await videosRes.json();
        const rawVideos = videosData.data || videosData.videos || videosData.aweme_list || [];
        const oldCache = brand.tiktokVideosCache || [];
        const oldIds = new Set(oldCache.map(v => String(v.id)));
        const newVideos = rawVideos.filter(v => !oldIds.has(String(v.aweme_id || v.id || '')));

        // Update scan metadata on brand
        brand.lastContentScanAt = new Date().toISOString();
        brand.newVideosSincePlan = (brand.newVideosSincePlan || 0) + newVideos.length;
        brand.totalVideosTracked = oldCache.length + newVideos.length;

        // Merge new videos into cache
        if (newVideos.length > 0) {
          const mapped = newVideos.map(v => ({
            id: String(v.aweme_id || v.id || ''),
            desc: v.desc || '',
            views: v.statistics?.play_count || v.views || 0,
            likes: v.statistics?.digg_count || v.likes || 0,
            comments: v.statistics?.comment_count || v.comments || 0,
            shares: v.statistics?.share_count || v.shares || 0,
            cover: v.video?.cover?.url_list?.[0] || v.cover || '',
            downloadUrl: v.video?.download_addr?.url_list?.[0] || '',
            playUrl: v.video?.play_addr?.url_list?.[0] || '',
            authorHandle: v.author?.unique_id || handle,
            duration: v.video?.duration || v.duration || 0,
            tiktokUrl: v.share_url || `https://www.tiktok.com/@${handle}/video/${v.aweme_id || v.id}`,
            isShoppable: !!(v.anchor_info || v.commerce_info),
            discoveredAt: new Date().toISOString(),
          }));
          brand.tiktokVideosCache = [...oldCache, ...mapped];
          brand.tiktokVideosCachedAt = new Date().toISOString();
          console.log('[scan]', brand.brandName || handle, ':', newVideos.length, 'new videos found');

          // Check if any new video is high-performing (100K+ views)
          const highPerformers = mapped.filter(v => v.views >= 100000);
          if (highPerformers.length > 0 && brand.email) {
            const plan = loadAiPlan(brand.id);
            const planAge = plan?.generatedAt ? Math.floor((Date.now() - new Date(plan.generatedAt).getTime()) / 86400000) : null;
            sendEmail(brand.email, highPerformers.length + ' new high-performing video' + (highPerformers.length > 1 ? 's' : '') + ' detected', emailBase({
              title: 'New Content Detected by CAi',
              preheader: highPerformers.length + ' new videos with 100K+ views — update your plan',
              headerEmoji: '🔍',
              accentColor: '#9b6dff',
              accentGradient: 'linear-gradient(135deg,#9b6dff,#0668E1)',
              bodyHtml: `<p>CAi found <strong>${highPerformers.length} new video${highPerformers.length > 1 ? 's' : ''}</strong> with 100K+ views on your TikTok.</p>
              <table style="width:100%;border-collapse:collapse;margin:12px 0">${highPerformers.slice(0, 3).map(v => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee"><strong>${(v.views/1000).toFixed(0)}K views</strong> · ${(v.desc || '').slice(0, 60)}${(v.desc || '').length > 60 ? '...' : ''}</td></tr>`).join('')}</table>
              <p style="color:#6b7280">${brand.newVideosSincePlan || highPerformers.length} new videos since your last plan${planAge != null ? ' (' + planAge + ' days ago)' : ''}. Update your plan to include them.</p>`,
              ctaText: 'Update Campaign Plan',
              ctaUrl: 'https://www.creatorship.app/brand#ai-plans',
            })).catch(() => {});
            logActivity('new_content_detected', { brandId: brand.id, newVideos: highPerformers.length, handle });
          }
        }
        await saveBrand(brand);
        scanned++;
        // Rate limit — don't hammer ScrapeCreators
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) { console.error('[scan] Error scanning', handle, ':', e.message); }
    }
    console.log('[scan] Scanned', scanned, 'brands');
  } catch (e) { console.error('[scan] Fatal error:', e.message); }
}

// Built-in cron: Weekly payouts (Fri 2pm UTC) + Monthly billing (1st 3pm UTC)
function scheduleCron() {
  const check = () => {
    const now = new Date();
    const day = now.getUTCDay(), hour = now.getUTCHours(), date = now.getUTCDate(), minute = now.getUTCMinutes();
    // Monday 6am UTC — Weekly digest email
    if (day === 1 && hour === 6 && minute === 0) {
      sendWeeklyDigest().catch(e => console.error('[cron] Digest error:', e.message));
    }
    // Daily 6am UTC — Scan all brands for new TikTok content
    if (hour === 6 && minute === 0) {
      dailyContentScan().catch(e => console.error('[cron] Content scan error:', e.message));
    }
    if (day === 5 && hour === 14 && minute === 0) {
      fetch('http://localhost:3001/api/payouts/run-weekly', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-payout-secret': process.env.PAYOUT_SECRET || 'creatorship-payouts-2026' }, body: JSON.stringify({ secret: process.env.PAYOUT_SECRET || 'creatorship-payouts-2026' }) }).then(r => r.json()).then(() => {}).catch(e => console.error('[cron] Payouts error:', e.message));
    }
    if (date === 1 && hour === 15 && minute === 0) {
      fetch('http://localhost:3001/api/billing/run', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-billing-secret': process.env.BILLING_SECRET || 'creatorship-billing-2026' }, body: JSON.stringify({ secret: process.env.BILLING_SECRET || 'creatorship-billing-2026' }) }).then(r => r.json()).then(() => {}).catch(e => console.error('[cron] Billing error:', e.message));
    }
    // Daily 10am UTC — check for expiring Meta tokens
    if (hour === 10 && minute === 0) {
      (async () => {
        try {
          const brands = await loadBrands();
          const now = Date.now();
          for (const b of brands) {
            if (!b.metaToken || !b.metaTokenExpiresAt || !b.email) continue;
            const daysLeft = Math.floor((new Date(b.metaTokenExpiresAt) - now) / 86400000);
            // Send warning at 7 days and 1 day before expiry
            if (daysLeft === 7 || daysLeft === 1) {
              const frontendUrl = process.env.FRONTEND_URL || 'https://www.creatorship.app';
              const reAuthUrl = frontendUrl + '/auth/meta?email=' + encodeURIComponent(b.email);
              sendEmail(
                b.email,
                daysLeft === 1 ? 'Meta connection expires tomorrow' : 'Meta connection expires in 7 days',
                emailBase({
                  title: daysLeft === 1 ? 'Meta connection expires tomorrow' : 'Action needed: Meta connection expiring',
                  preheader: 'Reconnect to keep campaigns running.',
                  headerEmoji: '⚠️',
                  accentColor: daysLeft === 1 ? '#ef4444' : '#F59E0B',
                  accentGradient: daysLeft === 1 ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'linear-gradient(135deg,#F59E0B,#D97706)',
                  bodyHtml: `<p>Your Meta Ads connection for <strong>${escapeHtml(b.brandName || 'your brand')}</strong> expires in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>.</p><p>${daysLeft === 1 ? 'Your campaigns will stop running tomorrow unless you reconnect.' : 'Reconnect now to avoid any interruption to your campaigns.'}</p>`,
                  ctaText: 'Reconnect Meta',
                  ctaUrl: reAuthUrl,
                })
              ).catch(err => console.error('[cron] Meta expiry email failed:', b.email, err.message));
              console.log('[cron] Meta expiry warning sent to', b.email, '- days left:', daysLeft);
            }
          }
        } catch (e) { console.error('[cron] Meta expiry check error:', e.message); }
      })();
    }
  };
  setInterval(check, 60000);
  console.log('  Cron: Weekly digest (Mon 6am) + Daily scan (6am) + Weekly payouts (Fri 14:00) + Monthly billing (1st 15:00) + Meta token check (10:00)');
}

// ═══════════════════════════════════════════════════════════════
// CONTENT LICENSING SYSTEM — outreach, approvals, content rights
// ═══════════════════════════════════════════════════════════════

app.post('/api/brand/authorize-outreach', authBrand, requireRole('admin'), async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.body.brandId;
  if (!brandId) return res.status(400).json({ error: 'brandId required' });
  const brand = await getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  brand.outreachAuthorized = true;
  brand.outreachAuthorizedAt = new Date().toISOString();
  brand.outreachAuthorizedViaModal = true;
  await saveBrand(brand);
  await auditLog(brandId, 'outreach_authorized', { authorizedAt: brand.outreachAuthorizedAt });
  res.json({ success: true, authorizedAt: brand.outreachAuthorizedAt });
});

app.get('/api/brand/licenses', authBrand, async (req, res) => {
  const brandId = req.brandAuth?.brandId || req.query.brandId;
  const { data, error } = await supabase.from('content_licenses').select('*').eq('brand_id', brandId).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ licenses: data || [] });
});

app.post('/api/brand/request-content-license', authBrand, async (req, res) => {
  const { brandId, creatorHandle, creatorEmail, videoId, videoUrl, videoDesc, videoCover, productId, productName, revenueSharePct } = req.body;
  const brand = await getBrandById(brandId || req.brandAuth?.brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  if (!brand.outreachAuthorized) return res.status(403).json({ error: 'Outreach not authorized. Enable it in Account settings.' });
  if (!creatorHandle) return res.status(400).json({ error: 'Creator handle required' });
  if (!videoId) return res.status(400).json({ error: 'Video ID required' });

  const { data: existing } = await supabase.from('content_licenses').select('id, outreach_status').eq('brand_id', brand.id).eq('video_id', videoId);
  if (existing && existing.length > 0) {
    const ex = existing[0];
    if (ex.outreach_status === 'approved') return res.json({ success: true, alreadyApproved: true, licenseId: ex.id });
    if (ex.outreach_status === 'outreach_sent' || ex.outreach_status === 'pending') return res.json({ success: true, alreadySent: true, licenseId: ex.id });
    if (ex.outreach_status === 'declined') return res.status(400).json({ error: 'Creator declined this request.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const frontendUrl = process.env.FRONTEND_URL || 'https://creatorship.app';
  const approveUrl = frontendUrl + '/approve/' + token;
  const revShare = revenueSharePct || 10;
  const licenseId = 'lic_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');

  const { error: insertError } = await supabase.from('content_licenses').insert({
    id: licenseId, brand_id: brand.id, creator_handle: creatorHandle, creator_email: creatorEmail || null,
    video_id: videoId, video_url: videoUrl || null, video_desc: (videoDesc || '').slice(0, 300),
    video_cover: videoCover || null, product_id: productId || null, product_name: productName || null,
    outreach_status: creatorEmail ? 'outreach_sent' : 'not_contacted',
    outreach_sent_at: creatorEmail ? new Date().toISOString() : null,
    outreach_channel: 'email', outreach_token: token, revenue_share_pct: revShare,
  });
  if (insertError) return res.status(500).json({ error: 'Failed to create license: ' + insertError.message });

  if (creatorEmail) {
    const brandName = brand.brandName || brand.storeName || 'our brand';
    const emailHtml = '<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;background:#0a0e16;color:#e2e8f0;border-radius:16px;overflow:hidden">'
      + '<div style="padding:32px 28px;background:linear-gradient(135deg,rgba(155,109,255,.15),rgba(6,104,225,.08));border-bottom:1px solid rgba(255,255,255,.08)">'
      + '<div style="font-size:24px;font-weight:800;color:#fff;margin-bottom:8px">' + escapeHtml(brandName) + ' wants to license your video</div>'
      + '<div style="font-size:14px;color:rgba(255,255,255,.6)">via Creatorship — Creator Content Licensing</div></div>'
      + '<div style="padding:28px">'
      + '<p style="font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 16px">Hi ' + escapeHtml(creatorHandle) + '! We\'re reaching out on behalf of <strong style="color:#fff">' + escapeHtml(brandName) + '</strong>.</p>'
      + '<p style="font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 16px">Your TikTok video is performing well and we\'d love to run it as a paid ad on Meta (Facebook &amp; Instagram).</p>'
      + '<div style="background:rgba(155,109,255,.08);border:1px solid rgba(155,109,255,.2);border-radius:12px;padding:16px 20px;margin:20px 0">'
      + '<div style="font-size:14px;font-weight:700;color:#9b6dff;margin-bottom:10px">What\'s in it for you</div>'
      + '<div style="font-size:14px;color:#e2e8f0;line-height:1.8">'
      + '&#10003; Keep earning your TikTok Shop commission<br/>'
      + '&#10003; Earn an additional <strong style="color:#34d399">' + revShare + '% of ad revenue</strong><br/>'
      + '&#10003; Zero work — we handle everything<br/>'
      + '&#10003; Revoke anytime from your dashboard</div></div>'
      + '<div style="text-align:center;margin:28px 0">'
      + '<a href="' + approveUrl + '" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#9b6dff,#0668E1);color:#fff;font-size:16px;font-weight:700;text-decoration:none;border-radius:10px">Approve Content Usage →</a></div>'
      + '<p style="font-size:13px;color:rgba(255,255,255,.4);text-align:center">No account needed.</p></div>'
      + '<div style="padding:16px 28px;border-top:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.2)">'
      + '<div style="font-size:12px;color:rgba(255,255,255,.35);text-align:center">Sent by Creatorship on behalf of ' + escapeHtml(brandName) + '</div></div></div>';

    const sent = await sendEmail(creatorEmail, brandName + ' wants to run your TikTok video as a paid ad', emailHtml);
    if (!sent) {
      await supabase.from('content_licenses').update({ outreach_status: 'send_failed' }).eq('id', licenseId);
    }
  }

  await auditLog(brand.id, 'license_requested', { licenseId, creatorHandle, videoId, hasEmail: !!creatorEmail });
  res.json({ success: true, licenseId, emailSent: !!creatorEmail, approveUrl: creatorEmail ? undefined : approveUrl });
});

app.get('/approve/:token', async (req, res) => {
  const { token } = req.params;
  const { data, error } = await supabase.from('content_licenses').select('*').eq('outreach_token', token).single();
  if (error || !data) return res.status(404).send('<html><body style="background:#0a0e16;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><h1>Link expired or invalid</h1></body></html>');
  if (data.approved_at) return res.send('<html><body style="background:#0a0e16;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><h1 style="color:#34d399">Already Approved ✓</h1></body></html>');
  if (data.declined_at) return res.send('<html><body style="background:#0a0e16;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><h1>Previously Declined</h1></body></html>');

  const brand = await getBrandById(data.brand_id);
  const brandName = escapeHtml(brand?.brandName || brand?.storeName || 'the brand');
  const revPct = data.revenue_share_pct || 10;
  const coverHtml = data.video_cover ? '<div style="margin-bottom:16px;border-radius:10px;overflow:hidden;height:200px;background:#111"><img src="' + data.video_cover + '" style="width:100%;height:100%;object-fit:cover"/></div>' : '';
  const descHtml = data.video_desc ? '<p style="font-size:13px;color:rgba(255,255,255,.5);margin-bottom:16px;font-style:italic">"' + escapeHtml(data.video_desc.slice(0, 100)) + '..."</p>' : '';

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Approve Content Usage</title>'
    + '<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0e16;color:#e2e8f0;font-family:-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}'
    + '.card{max-width:500px;width:100%;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:20px;overflow:hidden}'
    + '.hd{padding:28px;background:linear-gradient(135deg,rgba(155,109,255,.1),rgba(6,104,225,.06));border-bottom:1px solid rgba(255,255,255,.06)}'
    + '.bd{padding:24px 28px}.term{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:14px;line-height:1.6}'
    + '.term:last-child{border-bottom:none}.ck{color:#34d399;flex-shrink:0}'
    + '.btns{display:flex;gap:10px;margin-top:24px}.btn{flex:1;padding:14px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;border:none;font-family:inherit}'
    + '.btn-a{background:linear-gradient(135deg,#9b6dff,#0668E1);color:#fff}.btn-d{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.15);color:#ef4444}'
    + '.res{display:none;text-align:center;padding:40px 28px}.ft{padding:16px 28px;border-top:1px solid rgba(255,255,255,.04);font-size:12px;color:rgba(255,255,255,.3);text-align:center}'
    + '</style></head><body><div class="card"><div class="hd"><h1 style="font-size:22px;font-weight:800;color:#fff">' + brandName + ' wants to license your video</h1>'
    + '<p style="margin-top:8px;font-size:14px;color:rgba(255,255,255,.5)">via Creatorship</p></div>'
    + '<div class="bd" id="terms">' + coverHtml + descHtml
    + '<p style="font-size:15px;margin-bottom:20px;line-height:1.6">By approving, you agree to:</p>'
    + '<div class="term"><span class="ck">✓</span><span>Grant <strong>' + brandName + '</strong> permission to use this video as a paid ad on Meta</span></div>'
    + '<div class="term"><span class="ck">✓</span><span>You keep all your existing TikTok Shop commissions</span></div>'
    + '<div class="term"><span class="ck">✓</span><span>You earn <strong style="color:#34d399">' + revPct + '%</strong> of ad revenue generated by this content</span></div>'
    + '<div class="term"><span class="ck">✓</span><span>License lasts 90 days and auto-renews unless you revoke</span></div>'
    + '<div class="term"><span class="ck">✓</span><span>You can revoke at any time</span></div>'
    + '<div class="btns"><button class="btn btn-a" onclick="doApprove()">Approve ✓</button><button class="btn btn-d" onclick="doDecline()">Decline</button></div></div>'
    + '<div class="res" id="ra"><div style="font-size:48px;margin-bottom:16px">🎉</div><h1 style="color:#34d399">Approved!</h1>'
    + '<p style="margin-top:12px;font-size:15px;color:#cbd5e1">' + brandName + ' can now use your video as a Meta ad. You will earn ' + revPct + '% of ad revenue.</p></div>'
    + '<div class="res" id="rd"><h1>Declined</h1><p style="margin-top:12px;font-size:15px;color:#cbd5e1">No worries. You won\'t be contacted about this video again.</p></div>'
    + '<div class="ft">Powered by <strong style="color:#9b6dff">Creatorship</strong></div></div>'
    + '<script>'
    + 'async function doApprove(){document.getElementById("terms").style.display="none";document.getElementById("ra").style.display="block";'
    + 'fetch("/api/approve/' + token + '",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"approve"})});}'
    + 'async function doDecline(){var r=prompt("Optional: why are you declining?");document.getElementById("terms").style.display="none";document.getElementById("rd").style.display="block";'
    + 'fetch("/api/approve/' + token + '",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"decline",reason:r||""})});}'
    + '</script></body></html>';

  res.send(html);
});

app.post('/api/approve/:token', async (req, res) => {
  const { token } = req.params;
  const { action, reason } = req.body;
  const { data, error } = await supabase.from('content_licenses').select('*').eq('outreach_token', token).single();
  if (error || !data) return res.status(404).json({ error: 'License not found' });
  if (data.approved_at || data.declined_at) return res.json({ success: true, message: 'Already processed' });

  const now = new Date().toISOString();
  if (action === 'approve') {
    const licenseEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('content_licenses').update({
      outreach_status: 'approved', approved_at: now, approval_ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      license_start: now, license_end: licenseEnd, updated_at: now,
    }).eq('id', data.id);
    const brand = await getBrandById(data.brand_id);
    if (brand) {
      await sendEmail(brand.email, data.creator_handle + ' approved content usage!',
        '<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;background:#0a0e16;color:#e2e8f0;border-radius:16px">'
        + '<h2 style="color:#34d399">Creator Approved!</h2>'
        + '<p style="font-size:15px;line-height:1.7"><strong>@' + escapeHtml(data.creator_handle) + '</strong> approved usage of their video as a Meta ad.</p>'
        + '<p style="font-size:14px;color:#9b6dff">CAi will automatically add it to your campaign.</p></div>'
      );
      await auditLog(data.brand_id, 'license_approved', { licenseId: data.id, creatorHandle: data.creator_handle, videoId: data.video_id });
    }
  } else if (action === 'decline') {
    await supabase.from('content_licenses').update({
      outreach_status: 'declined', declined_at: now, decline_reason: (reason || '').slice(0, 500), updated_at: now,
    }).eq('id', data.id);
    await auditLog(data.brand_id, 'license_declined', { licenseId: data.id, creatorHandle: data.creator_handle, videoId: data.video_id, reason });
  }
  res.json({ success: true, action });
});

app.post('/api/license/revoke', async (req, res) => {
  const { licenseId, revokedBy, reason } = req.body;
  if (!licenseId) return res.status(400).json({ error: 'licenseId required' });
  const { data, error } = await supabase.from('content_licenses').select('*').eq('id', licenseId).single();
  if (error || !data) return res.status(404).json({ error: 'License not found' });
  if (data.revoked_at) return res.json({ success: true, message: 'Already revoked' });
  const now = new Date().toISOString();
  await supabase.from('content_licenses').update({
    outreach_status: 'revoked', revoked_at: now, revoked_by: revokedBy || 'unknown',
    revoke_reason: (reason || '').slice(0, 500), in_campaign: false, updated_at: now,
  }).eq('id', licenseId);
  await auditLog(data.brand_id, 'license_revoked', { licenseId, creatorHandle: data.creator_handle, videoId: data.video_id, revokedBy, reason });
  const brand = await getBrandById(data.brand_id);
  if (revokedBy === 'creator' && brand) {
    await sendEmail(brand.email, 'Creator revoked content license — @' + data.creator_handle,
      '<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px"><h2 style="color:#ffb400">Content License Revoked</h2>'
      + '<p><strong>@' + escapeHtml(data.creator_handle) + '</strong> has revoked permission to use their video. CAi will pause this ad within 24 hours.</p></div>'
    );
  }
  res.json({ success: true });
});

scheduleCron();

const PORT = Number(process.env.PORT) || 3001;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  Creatorship API: http://localhost:' + PORT);
  console.log('  Tunnel URL:      ' + TUNNEL_URL);
  console.log('  TikTok Redirect: ' + REDIRECT_URI);
  console.log('  Meta OAuth:      ' + META_REDIRECT_URI);
  if (!REDIRECT_URI.startsWith('https')) {
    console.log('  ⚠ TikTok Login Kit requires HTTPS. For local dev, run: ngrok http ' + PORT);
    console.log('  Then set TUNNEL_URL=https://YOUR-NGROK-URL and add that redirect in TikTok Developer Portal.');
  }
  console.log('');

  // ═══ CAi DAILY CRON — Poll performance for all active brands every 6 hours ═══
  const CAI_POLL_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
  setInterval(async () => {
    try {
      const brands = await loadBrands();
      const active = brands.filter(b => b.cai?.isActive && b.metaToken);
      if (active.length === 0) return;
      console.log('[cai-cron] Polling ' + active.length + ' active brands...');
      for (const brand of active) {
        try {
          const result = await caiPollPerformance(brand);
          console.log('[cai-cron] ' + (brand.brandName || brand.storeName || brand.id) + ': ' + (result.success ? result.adsPolled + ' ads polled' : result.error));
        } catch (e) { console.error('[cai-cron] Error for ' + brand.id + ':', e.message); }
      }
    } catch (e) { console.error('[cai-cron] Fatal:', e.message); }
  }, CAI_POLL_INTERVAL);
  console.log('  [cai-cron] Performance polling active (every 6h)');

  // ═══ CAi WEEKLY DIGEST — Send email summary every Monday at 9am EST ═══
  const checkWeeklyDigest = async () => {
    const now = new Date();
    const estHour = (now.getUTCHours() - 5 + 24) % 24; // EST offset
    const isMonday = now.getUTCDay() === 1;
    if (!isMonday || estHour !== 14) return; // 9am EST = 14 UTC

    try {
      const brands = await loadBrands();
      const active = brands.filter(b => b.cai?.isActive && b.email);
      for (const brand of active) {
        const perf = brand.cai?.performance || {};
        const today = perf.today || {};
        const week = perf.week || {};
        const creatives = brand.cai?.creatives || [];
        const activeCount = creatives.filter(c => c.status === 'active').length;
        const pausedCount = creatives.filter(c => c.status === 'paused').length;
        const activity = brand.cai?.activityLog || [];
        const recentActivity = activity.slice(-5);

        // Build activity lines for email
        const activityHtml = recentActivity.length > 0
          ? recentActivity.map(a => {
              if (a.type === 'auto_pause') return `<p style="color:#ef4444;font-size:13px;margin:4px 0;">⏸ Paused @${a.creator} — ${a.reason || 'CPA too high'}</p>`;
              if (a.type === 'auto_scale') return `<p style="color:#34d399;font-size:13px;margin:4px 0;">📈 Scaled budget $${a.from} → $${a.to}/day — @${a.creator} winning</p>`;
              if (a.type === 'fatigue_flag') return `<p style="color:#ffb400;font-size:13px;margin:4px 0;">⚠ @${a.creator} — creative fatigue after ${a.daysActive} days</p>`;
              return '';
            }).join('')
          : '<p style="color:#6b7280;font-size:13px;">No automated actions this week.</p>';

        const weekSpend = week.spend || 0;
        const weekRevenue = week.revenue || 0;
        const weekRoas = week.roas || 0;
        const brandName = brand.brandName || brand.storeName || 'Your brand';

        // Don't send if no spend data
        if (weekSpend === 0 && !recentActivity.length) continue;

        // Check if we already sent this week
        const lastDigest = brand.cai?.lastDigestSentAt;
        if (lastDigest) {
          const daysSince = (now.getTime() - new Date(lastDigest).getTime()) / 86400000;
          if (daysSince < 5) continue; // Don't double-send
        }

        await sendEmail(
          brand.email,
          'CAi Weekly: ' + (weekSpend > 0 ? '$' + weekSpend.toFixed(0) + ' spent · ' + weekRoas.toFixed(1) + 'x ROAS' : 'Status update'),
          emailBase({
            title: brandName + ' — CAi Weekly Digest',
            preheader: weekSpend > 0 ? '$' + weekRevenue.toFixed(0) + ' revenue this week' : 'Your CAi status update',
            headerEmoji: '🧠',
            accentColor: '#9b6dff',
            accentGradient: 'linear-gradient(135deg,#9b6dff,#0668E1)',
            bodyHtml: `
              <div style="background:#111827;border-radius:12px;padding:20px;margin-bottom:16px;">
                <p style="color:#9b6dff;font-weight:700;font-size:12px;margin:0 0 12px;">THIS WEEK</p>
                <div style="display:flex;gap:24px;">
                  <div><p style="color:#e0e4ed;font-size:22px;font-weight:800;margin:0;">$${weekSpend.toFixed(0)}</p><p style="color:#6b7280;font-size:11px;margin:2px 0 0;">spent</p></div>
                  <div><p style="color:#34d399;font-size:22px;font-weight:800;margin:0;">$${weekRevenue.toFixed(0)}</p><p style="color:#6b7280;font-size:11px;margin:2px 0 0;">revenue</p></div>
                  <div><p style="color:#9b6dff;font-size:22px;font-weight:800;margin:0;">${weekRoas.toFixed(1)}x</p><p style="color:#6b7280;font-size:11px;margin:2px 0 0;">ROAS</p></div>
                </div>
              </div>
              <p style="color:#e0e4ed;font-size:14px;font-weight:700;margin:16px 0 8px;">Campaign Status</p>
              <p style="color:#8b95a8;font-size:13px;margin:4px 0;">${activeCount} active ads · ${pausedCount} paused · ${creatives.length} total creatives</p>
              ${recentActivity.length > 0 ? '<p style="color:#e0e4ed;font-size:14px;font-weight:700;margin:16px 0 8px;">CAi Actions This Week</p>' + activityHtml : ''}
            `,
            ctaText: 'View CAi Dashboard',
            ctaUrl: 'https://www.creatorship.app/brand#ai-plans',
          })
        ).catch(() => {});

        brand.cai.lastDigestSentAt = now.toISOString();
        await saveBrand(brand);
        console.log('[cai-digest] Sent weekly digest to ' + brand.email);
      }
    } catch (e) { console.error('[cai-digest] Error:', e.message); }
  };
  setInterval(checkWeeklyDigest, 60 * 60 * 1000);
  console.log('  [cai-digest] Weekly digest check active (Mondays 9am EST)');
});
server.on('error', (err) => {
  console.error('[fatal] Server listen error:', err.message);
  process.exit(1);
});
