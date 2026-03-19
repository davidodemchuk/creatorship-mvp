# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deployment

Deployed on **Railway**. Auto-deploys from `main` branch. Always run `npm run build` before pushing to ensure the frontend builds cleanly.

## Build & Run Commands

- **Dev mode (frontend + backend):** `npm run dev` — starts Express server on :3001 and Vite dev server on :5173 concurrently
- **Build frontend:** `npm run build` — Vite production build to `dist/`
- **Start production server:** `npm start` (or `node server.js`) — serves API + static `dist/` on port 3001
- **Frontend only:** `npm run client` — Vite dev server only
- **Backend only:** `npm run server` — Express server only

There are no tests or linting configured.

## Architecture

This is a **single-file monolith** — both the frontend and backend live in one file each:

- **`server.js`** (~1300 lines) — Express API server. All routes, data persistence, and third-party integrations in one file. Uses flat JSON files in `data/` for storage (no database). Serves the Vite `dist/` build in production mode.
- **`src/App.jsx`** (~3700 lines) — The entire React frontend in a single component file. Contains all pages, components, styles (inline CSS-in-JS), and client-side logic. No component splitting or separate CSS files.
- **`src/main.jsx`** — Just the React/BrowserRouter mount point.

### Frontend Structure (App.jsx sections)

The file is organized into labeled sections separated by `/*═══` comment blocks:

- **Homepage** — Landing page with hero, ROI calculator, pricing, social proof (`Homepage`, `HeroSection`, `ROICalculator`, `PricingSection`, etc.). **Do not modify the landing page.**
- **Brand Portal** — Brand signup/login, dashboard with tabs for overview, creator discovery, campaigns, settings (`BrandPortal`, `BrandDashboardView`, `CreatorDiscoveryView`, `CampaignsTab`, `SettingsTab`)
- **Creator Portal** — Creator signup/login, TikTok OAuth connection, deals dashboard, earnings/payouts (`CreatorPortal`, `CreatorDemoDashboard`, `CreatorAuthForm`)
- **Admin Portal** — Password-gated admin view (`AdminPortal`, `AdminPasswordGate`)

Routing uses `react-router-dom` with paths: `/`, `/brand`, `/creator`, `/admin`.

### Backend API Groups (server.js)

- **TikTok OAuth** — `/auth/tiktok`, `/auth/tiktok/callback`, `/api/tiktok/*`
- **Creator endpoints** — `/api/creators/*`, `/api/creator/*` (signup, login, deals, earnings, payout settings, Stripe Connect)
- **Brand endpoints** — `/api/brand/*` (signup, login, profile, settings, campaigns, dashboard)
- **Scanning/Discovery** — `/api/scan`, `/api/deep-scan`, `/api/store` (ScrapeCreators API integration)
- **Campaign management** — `/api/campaigns/*`, `/api/launch` (Meta Marketing API integration)
- **Admin** — `/api/admin/verify`
- **Demo data** — `/api/demo-data`

### Data Storage

All persistence is flat JSON files in `data/` directory:
- `brands.json`, `creators.json` — user accounts (bcrypt-hashed passwords)
- `campaign_registry.json` — launched campaigns
- `latest_scan.json`, `latest_deep_scan.json` — cached creator scan results
- `tt_tokens.json` — TikTok OAuth tokens for connected creators
- `creator_earnings.json`, `earnings.json` — payout tracking

### Third-Party Integrations

- **TikTok Login Kit** — OAuth flow for creators (requires HTTPS; use ngrok for local dev)
- **ScrapeCreators API** — Creator discovery and video scanning
- **Meta Marketing API** — Ad campaign creation and management
- **Stripe Connect** — Creator payouts

## Environment Variables

- `STRIPE_SECRET_KEY` — Stripe API key (optional; Stripe features disabled without it)
- `TUNNEL_URL` — Base URL for ngrok/cloudflared tunnel (default: `http://localhost:3001`)
- `TIKTOK_REDIRECT_URI` — Override TikTok OAuth callback URL
- `FRONTEND_URL` — Frontend URL for redirects (default: `http://localhost:5173`)
- `DATA_DIR` — Override data storage directory (default: `./data`)
- `META_AD_ACCOUNT` — Fallback Meta ad account ID
- `ADMIN_PASSWORD` — Admin portal password (default: `creatorship2026`)
- `NODE_ENV` — Set to `production` to serve static files from `dist/`

## Key Conventions

- The frontend uses a global color theme object `C` and inline styles throughout — no CSS modules or styled-components. Key design tokens: accent `#00e0b4`, orange `#ff9f43`, bg-deep `#0b0f1a`.
- CSS is injected as a template literal string (`CSS` constant) at the top of App.jsx.
- Helper shorthands: `$()` formats currency, `fN()` formats numbers, `g()` builds gradients, `gT()` builds gradient text styles.
- The Vite dev server proxies `/api` and `/auth` routes to the Express backend (configured in `vite.config.js`).
- Demo mode exists for both brand and creator portals — users can explore without signing up.
