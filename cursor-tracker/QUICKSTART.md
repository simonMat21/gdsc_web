# Quick Start Guide

Get the Live Cursor Tracker running in 5 minutes!

## Prerequisites

- Node.js 16+ installed
- Two browser windows (for testing)

## 1. Start the Backend

```bash
cd cursor-tracker/server
npm install
npm run dev
```

You should see:

```
╔════════════════════════════════════════╗
║   Cursor Tracker Server Running        ║
║   http://localhost:4000                ║
║   WebSocket: ws://localhost:4000       ║
╚════════════════════════════════════════╝
```

## 2. Start the Frontend

In a new terminal:

```bash
cd cursor-tracker/frontend
npm install
npm run dev
```

You should see:

```
  ▲ Next.js 14.0.0
  - Local:        http://localhost:3000
```

## 3. Test It Out

1. Open `http://localhost:3000` in **Browser A**
2. Open `http://localhost:3000` in **Browser B**
3. Move your cursor in Browser A → See it in Browser B
4. Try dragging the colored squares!

## Troubleshooting

### "Connection refused" on frontend?

- Make sure backend is running on port 4000
- Check: `curl http://localhost:4000/stats`

### "Port already in use"?

```bash
# Kill process on port 4000
npx kill-port 4000

# Or manually on Windows PowerShell
Get-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess | Stop-Process
```

### "Module not found" errors?

```bash
# Delete node_modules and reinstall
rm -r node_modules package-lock.json
npm install
```

## Key Features to Try

✅ **Real-time cursor tracking** - Move mouse, see updates instantly

✅ **Smooth interpolation** - Cursors move fluidly despite 50ms throttling

✅ **Object ownership** - Only one person can drag at a time

✅ **Scalable** - Works with 10+ users

## Next Steps

- Read main `README.md` for architecture details
- Check `server/README.md` for API documentation
- Check `frontend/README.md` for component details
- Deploy to production (see Deployment section in main README)

## Production Deployment

See main README.md "Deployment" section for:

- Docker setup
- Heroku deployment
- Vercel deployment
- Nginx configuration

---

Happy tracking! 🚀
