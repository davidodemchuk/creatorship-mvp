# Deployment (Railway)

## Environment variables

Add these to your Railway project variables:

| Variable | Description |
|----------|-------------|
| `ADMIN_PASSWORD` | Admin portal password (default: `creatorship2026` if not set) |
| `TUNNEL_URL` | Base URL of your deployed app (e.g. `https://your-app.railway.app`) |
| `FRONTEND_URL` | Same as TUNNEL_URL when frontend is served by the same server |

## Admin portal

- URL: `/admin`
- Password: set `ADMIN_PASSWORD=creatorship2026` (or your choice) in Railway variables
