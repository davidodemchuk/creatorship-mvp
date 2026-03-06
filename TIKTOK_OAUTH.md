# TikTok OAuth Setup

TikTok Login Kit requires an **HTTPS** redirect URI. `http://localhost` will fail with a redirect_uri error.

## Option 1: Use ngrok (recommended for local dev)

1. Install ngrok: `brew install ngrok` or download from ngrok.com
2. Start your server: `npm run dev`
3. In another terminal: `ngrok http 3001`
4. Copy the HTTPS URL (e.g. `https://abc123.ngrok-free.app`)
5. Set env and restart:
   ```bash
   TUNNEL_URL=https://abc123.ngrok-free.app npm run dev
   ```
6. In [TikTok Developer Portal](https://developers.tiktok.com/) → your app → **Login Kit** → add redirect URI:
   ```
   https://abc123.ngrok-free.app/auth/tiktok/callback
   ```
7. Visit your app via the ngrok URL or localhost (Connect TikTok will use the tunnel for OAuth)

## Option 2: Explicit redirect URI

If you've already registered a specific URI in TikTok's portal:

```bash
TIKTOK_REDIRECT_URI=https://your-exact-uri.com/auth/tiktok/callback npm run dev
```

## Option 3: Deployed app

When deployed (Vercel, Railway, etc.), set:

```bash
TUNNEL_URL=https://your-domain.com
```

Add `https://your-domain.com/auth/tiktok/callback` to your TikTok app's Login Kit redirect URIs.
