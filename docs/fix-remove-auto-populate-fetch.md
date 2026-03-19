# Fix: Remove auto-populate fetch block

**File:** `src/App.jsx`

## Change

Removed the `fetch('/api/brand/update-profile', …)` chain from the TikTok auto-populate `useEffect` (after `setTikTokShopUrl` / `setTikTokStorePageUrl`) and set the effect dependency array to `[]` so it does not re-run on every `profile` / `brand` / `brandTikTokPage` change (avoids update loops / crashes).

## Deploy (example)

```bash
cd ~/Desktop/creatorship-mvp\ 2 && npm run build && git add -A && git commit -m "fix: nuke auto-populate fetch — final loop fix" && git push origin main
```
