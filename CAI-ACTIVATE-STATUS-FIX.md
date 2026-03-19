# Fix: Ad Set and Ad status ACTIVE (campaign stays PAUSED)

**Goal:** Campaign PAUSED, Ad Set ACTIVE, Ads ACTIVE — brand turns on campaign with 1 click.

## What to change in `server.js`

1. **Find the cai-activate endpoint**  
   Search for the route that handles CAi activation (e.g. `cai-activate`, `api/.*activate`, or the handler that creates Meta campaigns/adsets/ads during activation).

2. **Ad set creation**  
   Find any `metaPost` / `fetch` / `axios` call where the URL contains **`/adsets`** (Meta Marketing API create ad set).  
   - If the body includes `status: 'PAUSED'`, change it to **`status: 'ACTIVE'`**.  
   - Do **not** change campaign creation (URL containing `campaigns` only) — keep campaign as **PAUSED**.

3. **Ad creation**  
   Find any call where the URL contains **`/ads`** (create ad).  
   - If the body includes `status: 'PAUSED'`, change it to **`status: 'ACTIVE'`**.

**Summary:**  
- Campaign: keep **PAUSED**.  
- Ad set(s): **ACTIVE**.  
- Ad(s): **ACTIVE**.

## One-line search (run locally)

```bash
cd ~/Desktop/creatorship-mvp\ 2
grep -n "PAUSED\|/adsets\|/ads" server.js | head -80
```

Then in your editor, change only the `status: 'PAUSED'` that appear in the **adset** and **ad** creation payloads to `status: 'ACTIVE'`. Leave campaign creation as PAUSED.

## After editing

```bash
cd ~/Desktop/creatorship-mvp\ 2 && node -c server.js && echo "SYNTAX OK" && npm run build && git add -A && git commit -m "fix: adset and ads created as ACTIVE inside PAUSED campaign — brand flips one switch to go live" && git push origin main
```
