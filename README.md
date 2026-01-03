# Live Cursor Tracker - Complete Documentation

## Project Overview

A real-time collaborative dashboard where 10+ users see each other's cursors moving smoothly with throttled updates, linear interpolation, and optional object pickup/drop functionality.

**Tech Stack:**

- Backend: Node.js + Express + Socket.IO
- Frontend: Next.js + TypeScript + Canvas API
- Protocol: WebSocket (Socket.IO)

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser 1 (Next.js)                     │
│ ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│ │ CursorLayer  │  │ ObjectLayer  │  │ Animation Loop (RAF)│ │
│ │ - Track mouse│  │ - Drag objs  │  │ - Interpolate (LERP)│ │
│ │ - Throttle   │  │ - Pickup     │  │ - Render canvas     │ │
│ │ - Emit       │  │ - Drop       │  │ - 60fps smooth      │ │
│ └──────┬───────┘  └──────┬───────┘  └────────────┬────────┘ │
│        │                 │                       │          │
│        └─────────────────┼───────────────────────┘          │
│                          │                                  │
│                   Socket.IO Client                          │
│                    (50ms throttle)                          │
└──────────────────────────┬─────────────────────────────────-┘
                           │
                ┌──────────┴──────────┐
                │   WebSocket on      │
                │   localhost:4000    │
                └──────────┬──────────┘
                           │
┌──────────────────────────┴─────────────────────────────────┐
│              Node.js + Express + Socket.IO                 │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ State Management                                       │ │
│ │ - users: Map<socketId, {id, x, y, color, name}>        │ │
│ │ - objects: Map<objId, {x, y, ownerId}>                 │ │
│ └────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Socket Event Handlers                                  │ │
│ │ - join: Init new user                                  │ │
│ │ - cursor_move: Receive throttled updates               │ │
│ │ - pickup/drop: Object ownership                        │ │
│ │ - disconnect: Cleanup                                  │ │
│ └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────--┘
```

---

## Backend Architecture

### Server Setup

**File:** `server/server.js`

```javascript
import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
```

**State:**

- `users: Map<socketId, UserData>` - Track connected users and their positions
- `objects: Map<objectId, ObjectData>` - Track global object state and ownership

### Key Features

#### 1. **Connection Handling**

```javascript
io.on("connection", (socket) => {
  users.set(socket.id, {
    id: socket.id,
    name: `User ${socket.id.substring(0, 5)}`,
    x: 0,
    y: 0,
    color: generateRandomColor(),
  });
});
```

#### 2. **Cursor Update Broadcasting**

When client sends `cursor_move`:

- Server validates position (0-10000 px)
- Updates user position in state
- **Broadcasts to all OTHER clients** (not sender)
- Why? Sender already has local position; others need the update

```javascript
socket.on("cursor_move", (data) => {
  if (!isValidCursorUpdate(data)) return;

  users.get(socket.id).x = data.x;
  users.get(socket.id).y = data.y;

  // Send to others, not sender
  socket.broadcast.emit("cursor_update", {
    id: socket.id,
    x: data.x,
    y: data.y,
    name: user.name,
    color: user.color,
  });
});
```

#### 3. **Object Ownership System**

**Pickup Event:**

```javascript
socket.on("pickup", (data) => {
  const obj = objects.get(data.objectId);

  // Only grant if not owned
  if (obj.ownerId && obj.ownerId !== socket.id) {
    socket.emit("object_reject", {
      reason: "Object is owned by another user",
    });
    return;
  }

  obj.ownerId = socket.id;
  io.emit("object_update", {
    id: objectId,
    ownerId: socket.id,
  });
});
```

**Drop Event:**

```javascript
socket.on("drop", (data) => {
  const obj = objects.get(data.objectId);

  // Verify ownership
  if (obj.ownerId !== socket.id) return;

  obj.x = data.x;
  obj.y = data.y;
  obj.ownerId = null; // Release

  io.emit("object_update", {
    /* ... */
  });
});
```

#### 4. **Cleanup on Disconnect**

```javascript
socket.on("disconnect", () => {
  users.delete(socket.id);

  // Release all objects owned by this user
  objects.forEach((obj) => {
    if (obj.ownerId === socket.id) {
      obj.ownerId = null;
    }
  });

  socket.broadcast.emit("user_left", { id: socket.id });
});
```

### Server Endpoints

| Method | Path     | Purpose                            |
| ------ | -------- | ---------------------------------- |
| GET    | `/stats` | Server statistics (users, objects) |
| POST   | `/reset` | Reset all objects to initial state |

---

## Frontend Architecture

### Core Concepts

#### 1. **Throttling (50ms intervals)**

**Why:** Mouse generates 100-300 events/sec. Sending all would overwhelm the server.

**Solution:** Use throttle to emit only once per 50ms

```typescript
const throttledSendCursor = throttle((x, y) => {
  socket.emit("cursor_move", {
    x,
    y,
    ts: Date.now(),
    seq: sequenceRef.current++,
  });
}, 50); // Fire max once per 50ms
```

**Result:** ~20 updates/sec instead of 200+

#### 2. **Linear Interpolation (LERP)**

**Why:** 50ms updates create jerky cursor movement (2 positions per screen frame).

**Solution:** Smoothly blend between positions using LERP.

```typescript
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

// In animation loop:
const elapsed = now - lastUpdateTime;
const progress = Math.min(elapsed / 50, 1); // 0 to 1 over 50ms

cursor.x = lerp(cursor.prevX, cursor.targetX, progress);
cursor.y = lerp(cursor.prevY, cursor.targetY, progress);
```

**Timeline:**

- t=0: at prevX/prevY
- t=0.5: halfway to targetX/targetY
- t=1: at targetX/targetY

#### 3. **requestAnimationFrame Loop**

60 FPS animation loop that:

1. Updates all remote cursor positions via LERP
2. Clears canvas and redraws all cursors
3. Shows names and colors

```typescript
const animate = () => {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  remoteCursors.forEach((cursor) => {
    const elapsed = now - cursor.lastUpdateTime;
    const progress = Math.min(elapsed / 50, 1);

    cursor.x = lerp(cursor.prevX, cursor.targetX, progress);
    cursor.y = lerp(cursor.prevY, cursor.targetY, progress);

    drawCursor(ctx, cursor);
  });

  requestAnimationFrame(animate);
};
```

### CursorLayer Component

**Responsibilities:**

- Track local mouse position
- Throttle and send updates
- Receive remote cursor updates
- Interpolate remote cursor positions
- Render all cursors on canvas

**Event Flow:**

```
Mouse Move
    ↓
handleMouseMove (updates local state)
    ↓
throttledSendCursor (50ms throttle)
    ↓
socket.emit('cursor_move')
    ↓
Server broadcasts to others
    ↓
cursor_update received
    ↓
Update remoteCursors (set target pos)
    ↓
animate() via RAF
    ↓
LERP between prev and target
    ↓
Draw on canvas
```

### ObjectLayer Component

**Responsibilities:**

- Render draggable objects
- Handle mouse down/move/up for dragging
- Request pickup from server
- Emit object_move while dragging
- Emit drop on mouse up

**Event Flow:**

```
Mouse Down on Object
    ↓
emit('pickup', {objectId})
    ↓
Server grants ownership
    ↓
object_update received → ownerId = userId
    ↓
Mouse Move
    ↓
emit('object_move', {x, y}) [not throttled]
    ↓
Server updates and broadcasts
    ↓
Mouse Up
    ↓
emit('drop', {x, y})
    ↓
Server releases ownership (ownerId = null)
```

---

## Socket Protocol

### Events from Client

| Event         | Payload              | When                    |
| ------------- | -------------------- | ----------------------- |
| `join`        | `{name: string}`     | User connects           |
| `cursor_move` | `{x, y, ts, seq}`    | Mouse moves (throttled) |
| `pickup`      | `{objectId: string}` | Click object            |
| `object_move` | `{objectId, x, y}`   | Drag object             |
| `drop`        | `{objectId, x, y}`   | Release object          |

### Events from Server

| Event           | Payload                        | When                    |
| --------------- | ------------------------------ | ----------------------- |
| `init`          | `{userId, users[], objects[]}` | User joins              |
| `cursor_update` | `{id, x, y, name, color}`      | Other user moves cursor |
| `user_joined`   | `{id, name, x, y, color}`      | Someone joins           |
| `user_left`     | `{id}`                         | Someone disconnects     |
| `object_update` | `{id, x, y, ownerId}`          | Object state changes    |
| `object_reject` | `{reason}`                     | Action denied           |

---

## Performance Analysis

### Bandwidth Calculation

**Without Throttling:**

- Mouse events: 150 events/sec
- Per event: ~30 bytes
- For 10 users: 150 × 30 × 10 = 45 KB/sec

**With Throttling (50ms):**

- Throttled events: 20 events/sec
- Per event: ~30 bytes
- For 10 users: 20 × 30 × 10 = 6 KB/sec

**Bandwidth Reduction: ~87%** ✓

### Frame Rate Analysis

**Scenario:**

- Server sends cursor updates every 50ms
- Browser renders at 60 FPS (16.67ms per frame)
- Without interpolation: 2-3 frames between updates (jerky)
- With LERP: Smooth blending over 50ms across 3 frames

**Result:** Smooth 60 FPS motion despite 50ms update interval ✓

### Scalability to 10+ Users

**Per-User Overhead:**

- Local mouse tracking: ~1 handler
- Remote cursor: ~1 canvas element to render
- Socket listener: 1 event handler
- Memory: ~500 bytes per user

**For 10 users:** ~5 KB memory + efficient rendering

**Bottlenecks to Watch:**

1. Canvas rendering (O(n) users) → Use WebGL if >50 users
2. Socket broadcast (O(n) clients) → Use Redis adapter for horizontal scaling
3. Object ownership conflicts → No conflict with ownership rules ✓

---

## Setup & Installation

### Prerequisites

- Node.js 16+
- npm or yarn
- Two browsers/windows for testing

### Backend Setup

```bash
cd server
npm install
npm run dev
# Server running on http://localhost:4000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
# App running on http://localhost:3000
```

### Testing

1. Open `http://localhost:3000` in multiple browser windows
2. Move your cursor → See live updates
3. Click and drag colored squares → See object ownership

---

## Debugging Guide

### Enable Verbose Logging

**Backend:**

```javascript
// Add to server.js
io.on("connection", (socket) => {
  socket.on("cursor_move", (data) => {
    console.log(`[DEBUG] ${socket.id} cursor: (${data.x}, ${data.y})`);
  });
});
```

**Frontend:**

```typescript
socket.on("cursor_update", (data) => {
  console.log(`[DEBUG] Remote cursor: ${data.name} at (${data.x}, ${data.y})`);
});
```

### Network Inspector

1. Open DevTools → Network tab
2. Filter by WS (WebSocket)
3. Click socket connection
4. View "Messages" tab

### Common Issues

| Issue                 | Cause                     | Solution                          |
| --------------------- | ------------------------- | --------------------------------- |
| Cursors not showing   | Socket not connected      | Check server is running           |
| Jerky movement        | Interpolation not working | Check LERP math and RAF loop      |
| Lag                   | Network latency           | Throttle can be tuned (try 100ms) |
| Objects not draggable | Ownership conflict        | Refresh page if stuck             |

---

## Deployment

### Environment Setup

**Backend (.env):**

```
PORT=4000
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com
```

**Frontend (.env.local):**

```
NEXT_PUBLIC_SOCKET_URL=https://api.yourdomain.com
```

### Docker Setup (Optional)

**Backend Dockerfile:**

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY server.js .
EXPOSE 4000
CMD ["node", "server.js"]
```

**Build & Run:**

```bash
docker build -t cursor-tracker-server .
docker run -p 4000:4000 cursor-tracker-server
```

### Heroku Deployment

**Backend:**

```bash
heroku create cursor-tracker-server
git push heroku main
heroku open
```

**Frontend (Vercel):**

```bash
vercel
# Set NEXT_PUBLIC_SOCKET_URL env var
```

### Nginx Config (Production)

```nginx
upstream socket_io {
  server localhost:4000;
}

server {
  listen 80;
  server_name yourdomain.com;

  location /socket.io {
    proxy_pass http://socket_io;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

---

## Optional Enhancements

### 1. Redis Adapter (Horizontal Scaling)

```bash
npm install socket.io-redis
```

```javascript
import { createAdapter } from "@socket.io/redis-adapter";

io.adapter(createAdapter(pubClient, subClient));
```

**Benefit:** Multiple server instances can share socket rooms

### 2. JWT Authentication

```javascript
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const decoded = jwt.verify(token, SECRET);
  socket.userId = decoded.userId;
  next();
});
```

### 3. Server-Side Rate Limiting

```javascript
const rateLimit = new Map();

socket.on("cursor_move", (data) => {
  if (!rateLimit.has(socket.id)) {
    rateLimit.set(socket.id, []);
  }

  const times = rateLimit.get(socket.id);
  times.push(Date.now());

  // Keep only last 10 updates
  if (times.length > 10) times.shift();

  // Reject if 10 updates in <1 sec
  if (times[times.length - 1] - times[0] < 1000) {
    socket.emit("error", "Rate limited");
    return;
  }

  // Process update...
});
```

### 4. Cursor Trails

```typescript
// Store trail points
const trails = new Map<string, Array<{ x; y; age }>>();

// In animation loop:
trails.forEach((trail) => {
  trail.forEach((point, i) => {
    point.age++;
    const alpha = 1 - point.age / 20;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(point.x, point.y, 2, 2);
  });

  // Remove old points
  trail = trail.filter((p) => p.age < 20);
});
```

### 5. Cursor Snapping

```javascript
const GRID_SIZE = 20;
const snappedX = Math.round(x / GRID_SIZE) * GRID_SIZE;
const snappedY = Math.round(y / GRID_SIZE) * GRID_SIZE;
```

---

## Performance Monitoring

### Key Metrics

```javascript
// Frame rate
let frameCount = 0;
let lastTime = Date.now();

animate = () => {
  frameCount++;
  const now = Date.now();
  if (now - lastTime >= 1000) {
    console.log(`FPS: ${frameCount}`);
    frameCount = 0;
    lastTime = now;
  }
};

// Network latency
const pingStart = Date.now();
socket.emit("ping");
socket.on("pong", () => {
  const latency = Date.now() - pingStart;
  console.log(`Latency: ${latency}ms`);
});
```

---

## Troubleshooting

### Server won't start

```bash
# Port already in use?
npx kill-port 4000
npm run dev
```

### CORS errors

```javascript
// Add to server.js
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*", // For dev only!
    methods: ["GET", "POST"],
  },
});
```

### Cursors lag behind mouse

1. Check interpolation duration (50ms)
2. Verify LERP formula correctness
3. Monitor network latency (`/stats` endpoint)

---

## File Structure

```
cursor-tracker/
├── server/
│   ├── package.json
│   ├── server.js
│   └── README.md
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   ├── tsconfig.json
│   ├── pages/
│   │   ├── _app.tsx
│   │   └── index.tsx
│   ├── components/
│   │   ├── CursorLayer.tsx
│   │   └── ObjectLayer.tsx
│   ├── utils/
│   │   ├── math.ts
│   │   └── socket.ts
│   ├── styles/
│   │   └── globals.css
│   ├── public/
│   └── README.md
└── README.md (this file)
```

---

## Next Steps

1. **Add persistent storage**: Save objects to database
2. **User profiles**: Store and display user avatars
3. **Room support**: Separate cursors per room
4. **Mobile support**: Touch events
5. **Analytics**: Track user sessions and interactions

---

## License

MIT

---

## Support

For issues, open an issue on GitHub or contact support.
