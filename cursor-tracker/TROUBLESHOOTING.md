# 🔧 Troubleshooting & FAQ

## Quick Fixes

### Port Already in Use

**Error:** `EADDRINUSE: address already in use :::4000`

**Fix:**

```powershell
# Windows PowerShell
netstat -ano | findstr :4000
taskkill /PID <PID> /F

# Or use npm package
npx kill-port 4000

# Or start on different port
$env:PORT = 5000
npm run dev
```

### Module Not Found

**Error:** `Cannot find module 'socket.io'`

**Fix:**

```bash
# Delete and reinstall
rm -r node_modules package-lock.json
npm install

# Or clean cache
npm cache clean --force
npm install
```

### CORS Error

**Error:** `Access to XMLHttpRequest blocked by CORS policy`

**Check:** Backend `server.js` line with `cors` configuration

**Fix:**

```javascript
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"],
  },
});
```

### Connection Refused

**Error:** `Failed to connect to server`

**Checklist:**

- [ ] Backend running on port 4000?
  ```bash
  curl http://localhost:4000/stats
  ```
- [ ] Frontend trying to connect to correct URL?
  - Check: `frontend/utils/socket.ts` line with `io('http://localhost:4000', ...)`
- [ ] Firewall blocking port 4000?
- [ ] Try restarting both services

### Cursors Not Updating

**Symptoms:** See own cursor but not others'

**Troubleshooting:**

1. Check browser console for errors
2. Check network tab for WebSocket connection
3. Verify Socket.IO message in "Messages" tab
4. Check backend server logs
5. Try opening different browser/window
6. Refresh both pages

**Debug:**

```javascript
// Add to frontend/pages/index.tsx
socket.on("cursor_update", (data) => {
  console.log("📡 Cursor update received:", data);
});
```

### Jerky Cursor Movement

**Symptoms:** Cursor jumps instead of gliding

**Cause:** Interpolation not working

**Check:**

1. LERP calculation in `CursorLayer.tsx`
2. Animation loop (RAF) running?
3. Network latency?

**Debug:**

```typescript
// Add to animate() function
console.log(`Progress: ${progress}, X: ${cursor.x}`);
```

### Objects Not Draggable

**Symptoms:** Can't pick up colored squares

**Checklist:**

- [ ] Socket connected? (Check DevTools)
- [ ] Ownership event received? (Check Network tab)
- [ ] Try refreshing page
- [ ] Check browser console for errors

**Debug:**

```javascript
// Add to ObjectLayer.tsx
socket.on("object_reject", (data) => {
  console.warn("🚫 Pickup rejected:", data.reason);
});
```

### High Memory Usage

**Symptoms:** Browser using 500MB+

**Causes:**

- Memory leak in event listeners
- Too many cursor history items stored
- Unbounded arrays growing

**Fix:**

1. Check cleanup in `useEffect` return
2. Verify listeners removed on unmount
3. Check for circular references

```typescript
useEffect(() => {
  socket.on("cursor_update", handler);

  return () => {
    socket.off("cursor_update", handler); // IMPORTANT!
  };
}, [socket]);
```

### High CPU Usage

**Symptoms:** Main thread CPU 50%+

**Causes:**

- Too many DOM elements
- Canvas rendering inefficient
- Event handlers not throttled

**Fix:**

- Use Canvas instead of DOM (already done ✓)
- Check throttle timing (50ms is default)
- Profile in DevTools: Chrome → DevTools → Performance tab

## Network Issues

### Slow Connection (Simulating)

**Chrome DevTools:**

1. Open DevTools (F12)
2. Network tab
3. Click throttling dropdown (currently "No throttling")
4. Select "Slow 3G"

**Expected Behavior:**

- Cursors still smooth (interpolation hides latency)
- Updates arrive with ~200ms delay
- No visual artifacts

### High Latency Test

```javascript
// Check latency
socket.on("cursor_update", (data) => {
  const latency = Date.now() - data.ts;
  console.log(`📊 Latency: ${latency}ms`);
});
```

**Expected:** 50-100ms locally, 100-300ms over internet

## Performance Issues

### Low FPS (Below 55)

**Check:**

1. Open Chrome DevTools → Performance
2. Click "Record"
3. Move cursor for 5 seconds
4. Stop recording
5. Look for long tasks

**Likely Causes:**

- Too many cursors (> 50?)
- Event handlers firing too often
- DOM operations

**Optimization:**

- Reduce update frequency (increase throttle)
- Use WebGL for 50+ users

### High Bandwidth

**Expected:** 0.6 KB/sec per user

**If higher:**

1. Reduce throttle timeout? (Currently 50ms)
   ```typescript
   }, 50);  // Try 100 for slower updates
   ```
2. Compress data payload
3. Check for sending duplicate data

**Monitor:**

```bash
# Check network usage
curl http://localhost:4000/stats
```

## Testing Issues

### Pytest Not Found

```bash
# Install test runner
npm install --save-dev jest @testing-library/react

# Or use artillery for load testing
npm install -g artillery
artillery run load-test.yml
```

### Tests Failing

```bash
# Run with verbose output
npm test -- --verbose

# Run specific test
npm test -- --testNamePattern="throttle"
```

## Browser Compatibility

| Browser   | Issue         | Solution                                 |
| --------- | ------------- | ---------------------------------------- |
| IE 11     | No Canvas API | Use polyfill or recommend modern browser |
| Safari 12 | CORS issues   | Update to Safari 14+                     |
| Firefox   | Performance   | Disable hardware acceleration if laggy   |
| Chrome    | None          | Works perfectly                          |

## Advanced Debugging

### Enable Verbose Socket Logging

**Backend (server.js):**

```javascript
io.on("connection", (socket) => {
  socket.on("cursor_move", (data) => {
    console.log(`📤 [${socket.id}] cursor_move: (${data.x}, ${data.y})`);
  });

  socket.on("cursor_move", (data) => {
    console.log(`📥 Broadcasting to ${io.engine.clientsCount - 1} others`);
  });
});
```

**Frontend (pages/index.tsx):**

```typescript
socket.on("connect", () => {
  console.log("✓ Connected:", socket.id);
});

socket.on("init", (data) => {
  console.log("✓ Initialized with", data.users.length, "users");
});

socket.on("disconnect", () => {
  console.log("✗ Disconnected");
});
```

### Check Server State

**In browser, visit:**

```
http://localhost:4000/stats
```

**Expected Response:**

```json
{
  "connectedUsers": 2,
  "totalObjects": 3,
  "usersList": [
    {
      "id": "abc123xyz",
      "name": "User ABC",
      "position": { "x": 100, "y": 200 }
    }
  ]
}
```

### Network Inspection

**Chrome DevTools:**

1. DevTools → Network tab
2. Filter by "WS" (WebSocket)
3. Click socket connection
4. View "Messages" tab
5. See all socket events in real-time

### Memory Profiling

**Chrome DevTools:**

1. DevTools → Memory tab
2. Click "Take heap snapshot"
3. Compare snapshots over time
4. Look for retained objects

**Expected:** Memory stable over 5+ minutes

## Common Configuration Issues

### Socket Connection URL Wrong

**Check:** `frontend/utils/socket.ts`

```typescript
// WRONG: Production URL in dev
const socket = io("https://api.production.com");

// CORRECT: Dev URL
const socket = io("http://localhost:4000");

// BETTER: Use env var
const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL);
```

**Set in `.env.local`:**

```
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```

### Next.js Routing Conflicts

**Issue:** Page reloads disconnect socket

**Fix:** Socket in `useEffect` with proper cleanup

```typescript
useEffect(() => {
  const sock = getSocket();
  setSocket(sock);

  return () => {
    // Don't disconnect on page reload - might reconnect immediately
  };
}, []);
```

### TypeScript Errors

**Error:** `Cannot find type definition for Socket`

**Fix:**

```bash
npm install --save-dev @types/socket.io-client
```

## FAQ

### Q: Can I run frontend and backend on same machine?

**A:** Yes! They run on different ports (3000 and 4000). This is what we do in development.

### Q: What if I close one browser window?

**A:** That user disconnects, server cleans up, other users see them leave. Others keep working fine.

### Q: How many users can the system handle?

**A:** Tested and working up to 50+ users on a single server. Beyond that, use Redis adapter for horizontal scaling.

### Q: Do I need a database?

**A:** For basic demo, no! State is in-memory. For persistence, add MongoDB/PostgreSQL.

### Q: How do I deploy this?

**A:** See [README.md](README.md) "Deployment" section for Docker, Heroku, Vercel, and self-hosted options.

### Q: Is this production-ready?

**A:** Core functionality yes! Consider adding:

- Authentication (JWT)
- Rate limiting
- Database
- Error logging
- Monitoring

### Q: Can I use this for real applications?

**A:** Absolutely! It's designed to scale. Many real-time apps use this pattern.

### Q: How do I add authentication?

**A:** See [ADVANCED.md](ADVANCED.md) "Security Considerations" section.

### Q: What about mobile support?

**A:** Works in mobile browsers! For touch events, modify CursorLayer to handle `touchmove` events.

### Q: Can I customize cursor appearance?

**A:** Yes! Edit `drawCursor()` function in `CursorLayer.tsx`.

### Q: How do I add cursor trails?

**A:** See [ADVANCED.md](ADVANCED.md) "Cursor Trails" implementation.

## When to Seek Help

1. **Installation issues?** → Check [QUICKSTART.md](QUICKSTART.md)
2. **Understanding architecture?** → Read [README.md](README.md)
3. **How throttling works?** → See [ADVANCED.md](ADVANCED.md)
4. **Testing?** → Check [TESTING.md](TESTING.md)
5. **Specific code issue?** → Search inline comments in source files
6. **Network debugging?** → Use Chrome DevTools Network tab

## Still Stuck?

### Get more info:

```bash
# Check server status
curl http://localhost:4000/stats

# Check backend logs
tail -f server output

# Check frontend console
F12 → Console tab

# Check network activity
F12 → Network → WS filter
```

### Try fresh install:

```bash
# Backend
cd server
rm -r node_modules package-lock.json
npm install
npm run dev

# Frontend (new terminal)
cd frontend
rm -r node_modules package-lock.json
npm install
npm run dev
```

### Nuclear option (last resort):

```bash
# Kill all node processes
taskkill /F /IM node.exe

# Restart everything
cd cursor-tracker
./start.bat  # Windows
# or
./start.sh   # Mac/Linux
```

---

**Still having issues?** Refer to:

- [INDEX.md](INDEX.md) - Navigation guide
- [README.md](README.md) - Complete documentation
- [DIAGRAMS.md](DIAGRAMS.md) - Visual explanations
