# Advanced Guide & Performance Optimization

## In-Depth Architecture

### 1. Throttling Deep Dive

#### Why 50ms?

Mouse events fire at ~150-300 Hz depending on the device.

```
Timeline:
0ms    ├─ Mouse move (Event 1)
2ms    ├─ Mouse move (Event 2)
4ms    ├─ Mouse move (Event 3)
...
50ms   ├─ SEND UPDATE (Throttled - Event N)
52ms   ├─ Mouse move (Event N+1)
...
100ms  └─ SEND UPDATE (Throttled - Event M)
```

**Without throttling:** 150 events/sec × 30 bytes = 4.5 KB/sec per user

**With 50ms throttle:** 20 events/sec × 30 bytes = 0.6 KB/sec per user

**Reduction:** 87% less bandwidth!

#### Throttle Implementation

```typescript
export function throttle<T extends (...args: unknown[]) => void>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;

  return function (...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastCall >= limit) {
      // Key check: time elapsed > limit
      lastCall = now;
      func(...args);
    }
  };
}

// Usage
const throttledSendCursor = throttle((x, y) => {
  socket.emit("cursor_move", { x, y, ts: Date.now(), seq: seqNum++ });
}, 50); // Max once per 50ms

// This happens 150+ times/sec but only emits ~20 times/sec
window.addEventListener("mousemove", (e) => {
  throttledSendCursor(e.clientX, e.clientY);
});
```

### 2. Linear Interpolation (LERP) Deep Dive

#### The Problem

Updates arrive every 50ms. Screen renders every ~16.67ms (60 FPS).

```
Timeline (ms):    0      16.67   33.33   50      66.67   83.33   100
Update arrivals:  U1 ..................... U2 ..................... U3
Screen renders:   R      R       R       R       R       R       R
                  (at old pos)          (jump to new pos)
```

**Result:** Jumpy, jerky movement

#### The Solution: LERP

Instead of jumping, smoothly transition from position A to position B.

```
LERP formula: result = a + (b - a) * t
where t: 0 → 1 (0% to 100% of the journey)

Example:
a = 100 (previous position)
b = 150 (new target position)
t = 0.0 → result = 100 + (150-100) * 0.0 = 100
t = 0.5 → result = 100 + (150-100) * 0.5 = 125 (halfway!)
t = 1.0 → result = 100 + (150-100) * 1.0 = 150 (at target)
```

#### Timeline with LERP

```
Timeline (ms):    0    16.67  33.33   50    66.67   83.33   100
Updates:          U1 .......   ...... U2 .......   ...... U3
LERP progress:    0%   33%    67%    100%   33%    67%    100%
Position:         100  116.7  133.3  150    166.7  183.3  200
Screen renders:   R    R      R      R      R      R      R
                  (smooth curve from 100→150→200)
```

**Result:** Smooth motion at 60 FPS!

#### Implementation

```typescript
// Store cursor state
interface RemoteCursor {
  x: number; // Current render position
  y: number;
  prevX: number; // Last known position (before update)
  prevY: number;
  targetX: number; // New position (from network update)
  targetY: number;
  lastUpdateTime: number;
}

// When update arrives
socket.on("cursor_update", (data) => {
  const cursor = cursors.get(data.id);

  // Shift current to previous, new becomes target
  cursor.prevX = cursor.targetX || cursor.x;
  cursor.prevY = cursor.targetY || cursor.y;
  cursor.targetX = data.x;
  cursor.targetY = data.y;
  cursor.lastUpdateTime = Date.now();
});

// In animation loop (requestAnimationFrame)
const animate = () => {
  const now = Date.now();

  cursors.forEach((cursor) => {
    // How far along are we in the 50ms interpolation?
    const elapsed = now - cursor.lastUpdateTime;
    const progress = Math.min(elapsed / 50, 1); // 0 to 1 over 50ms

    // LERP between previous and target
    cursor.x = lerp(cursor.prevX, cursor.targetX, progress);
    cursor.y = lerp(cursor.prevY, cursor.targetY, progress);

    // Draw on canvas
    drawCursor(ctx, cursor);
  });

  requestAnimationFrame(animate);
};
```

### 3. requestAnimationFrame Pattern

#### Why RAF instead of setTimeout?

```javascript
// ❌ Bad: Might not sync with monitor refresh
setInterval(() => {
  render();
}, 16);

// ✓ Good: Syncs perfectly with 60 FPS monitor
requestAnimationFrame(() => {
  render();
});
```

RAF is called by the browser exactly once per refresh cycle (typically 16.67ms for 60 Hz displays).

#### RAF Implementation

```typescript
let animationFrameId: number | null = null;

const animate = () => {
  // Update all cursor positions via LERP
  updateRemoteCursors();

  // Render canvas
  renderCanvas();

  // Schedule next frame
  animationFrameId = requestAnimationFrame(animate);
};

// Start
useEffect(() => {
  animationFrameId = requestAnimationFrame(animate);

  return () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
  };
}, []);
```

### 4. Socket Event Protocol

#### Message Flow Diagram

```
Browser A (User moves mouse)
    ↓
    throttle check (50ms)
    ↓
    socket.emit('cursor_move', {x, y, ts, seq})
    ↓
[Network]
    ↓
Server receives
    ↓
    validate payload
    ↓
    update user.x, user.y
    ↓
    socket.broadcast.emit('cursor_update', {id, x, y, name, color})
    ↓
[Network to other clients]
    ↓
Browser B receives 'cursor_update'
    ↓
    update cursor.prevX/Y = cursor.targetX/Y
    ↓
    update cursor.targetX/Y = new data
    ↓
    mark update timestamp
    ↓
Animation loop (RAF)
    ↓
    calculate LERP progress
    ↓
    update cursor.x/y via LERP
    ↓
    render on canvas
    ↓
    repeat every ~16ms
```

### 5. Object Ownership State Machine

```
Idle State (ownerId = null)
    ↓ emit('pickup')
    ↓
Pending State (ownerId = userId)
    ↓
Dragging State
    ├─ emit('object_move') repeatedly
    └─ broadcast 'object_update' to all clients
    ↓ emit('drop')
    ↓
Released State (ownerId = null)

Alternative paths:
- During Dragging: Other user tries pickup → server emits 'object_reject'
- On disconnect: Auto-release all objects (ownerId = null)
```

---

## Performance Optimization Techniques

### 1. Canvas Optimization

#### Use Dirty Rectangle Rendering

Instead of clearing entire canvas, only redraw changed areas:

```typescript
let dirtyRect = { x: 0, y: 0, width: 0, height: 0 };

const drawCursor = (cursor) => {
  const padding = 50; // Buffer around cursor

  // Expand dirty rect to include cursor area
  dirtyRect.x = Math.min(dirtyRect.x, cursor.x - padding);
  dirtyRect.y = Math.min(dirtyRect.y, cursor.y - padding);
  dirtyRect.width = Math.max(dirtyRect.width, cursor.x + padding);
  dirtyRect.height = Math.max(dirtyRect.height, cursor.y + padding);
};

const render = () => {
  // Only clear dirty area
  ctx.clearRect(dirtyRect.x, dirtyRect.y, dirtyRect.width, dirtyRect.height);

  // Redraw cursors
  remoteCursors.forEach(drawCursor);

  // Reset for next frame
  dirtyRect = { x: 0, y: 0, width: 0, height: 0 };
};
```

#### Use OffscreenCanvas for Multi-threading

```typescript
const canvas = new OffscreenCanvas(800, 600);
const ctx = canvas.getContext("2d");

// Render in worker thread
const worker = new Worker("render-worker.js");
worker.postMessage({
  cursors: remoteCursors,
  canvas: canvas,
  timestamp: now,
});

worker.onmessage = (e) => {
  // Copy bitmap to main canvas
  mainCtx.drawImage(e.data.bitmap, 0, 0);
};
```

### 2. Network Optimization

#### Compress Updates

```typescript
// Before: {x: 123.456, y: 456.789, ts: 1692518400000, seq: 42}
// 35 bytes

// After: [123, 457, 1692518400000, 42]  // Rounded + array
// 25 bytes

// Better: MessagePack binary format
// ~15 bytes
```

#### Batch Updates

Instead of sending each update immediately, batch 2-3 updates:

```typescript
const batchQueue = [];
const batchTimeout = 25; // ms

const addToBatch = (data) => {
  batchQueue.push(data);

  if (batchQueue.length === 1) {
    setTimeout(() => {
      socket.emit("cursor_batch", batchQueue);
      batchQueue.length = 0;
    }, batchTimeout);
  }
};
```

### 3. Memory Optimization

#### Use Object Pools

Instead of creating/destroying objects, reuse them:

```typescript
class CursorPool {
  pool: RemoteCursor[] = [];

  acquire(): RemoteCursor {
    return this.pool.pop() || this.createCursor();
  }

  release(cursor: RemoteCursor) {
    cursor.x = 0;
    cursor.y = 0;
    this.pool.push(cursor);
  }
}

// Usage
const pool = new CursorPool();
const cursor = pool.acquire();
// Use cursor...
pool.release(cursor);
```

#### Prevent Memory Leaks

```typescript
useEffect(() => {
  socket.on("cursor_update", handleCursorUpdate);

  // IMPORTANT: Clean up listeners
  return () => {
    socket.off("cursor_update", handleCursorUpdate);
  };
}, [socket]);
```

### 4. Interpolation Optimization

#### Adaptive Interpolation Duration

Adjust interpolation time based on network latency:

```typescript
let avgLatency = 50; // ms

socket.on("cursor_update", (data) => {
  // Adjust interpolation based on latency
  const adaptiveDuration = Math.max(50, avgLatency * 1.2);

  cursor.interpolationDuration = adaptiveDuration;
  cursor.targetX = data.x;
  cursor.targetY = data.y;
  cursor.lastUpdateTime = Date.now();
});
```

#### Easing Functions

Replace linear with ease-out for more natural motion:

```typescript
// Linear (current)
const lerp = (a, b, t) => a + (b - a) * t;

// Ease-out (decelerating)
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// Usage
const progress = Math.min(elapsed / duration, 1);
const eased = easeOut(progress);
const x = lerp(prevX, targetX, eased);
```

---

## Scaling to 10+ Users

### 1. Client-Side Scalability

**Per-user overhead:**

- Canvas rendering: O(n) users
- DOM elements (objects): O(m) objects
- Memory: ~1 KB per user

**For 10 users:** ~10 KB + graphics

**Optimization:**

- Use WebGL for >50 users
- Cull cursors outside viewport
- Reduce update frequency for distant cursors

### 2. Server-Side Scalability

#### Horizontal Scaling with Redis

```javascript
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

const pubClient = createClient();
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

**Benefit:** Multiple server instances can share state

#### Load Balancing

```nginx
upstream cursor_servers {
  server localhost:4000;
  server localhost:4001;
  server localhost:4002;
}

server {
  listen 80;
  location / {
    proxy_pass http://cursor_servers;
  }
}
```

### 3. Database Integration

Store persistent data:

```javascript
import sqlite3 from "sqlite3";

const db = new sqlite3.Database(":memory:");

db.run(`CREATE TABLE objects (
  id TEXT PRIMARY KEY,
  x REAL, y REAL,
  ownerId TEXT, color TEXT
)`);

socket.on("drop", (data) => {
  db.run("UPDATE objects SET x=?, y=?, ownerId=NULL WHERE id=?", [
    data.x,
    data.y,
    data.objectId,
  ]);
});
```

---

## Debugging & Monitoring

### 1. Network Monitoring

```typescript
socket.on("cursor_update", (data) => {
  const latency = Date.now() - data.ts;
  console.log(`📡 Cursor update: ${latency}ms latency`);
});
```

### 2. Frame Rate Monitoring

```typescript
let frameCount = 0;
let lastTime = Date.now();

const animate = () => {
  frameCount++;
  const now = Date.now();

  if (now - lastTime >= 1000) {
    console.log(`📊 FPS: ${frameCount}`);
    frameCount = 0;
    lastTime = now;
  }

  requestAnimationFrame(animate);
};
```

### 3. Memory Profiling

```typescript
// Chrome DevTools > Memory > Heap Snapshot
console.log(`🧠 Memory: ${performance.memory.usedJSHeapSize / 1048576}MB`);
```

---

## Advanced Features

### 1. Cursor Trails

```typescript
interface Trail {
  x: number;
  y: number;
  age: number;
  alpha: number;
}

const trails = new Map<string, Trail[]>();

const updateTrail = (cursor: RemoteCursor) => {
  if (!trails.has(cursor.id)) {
    trails.set(cursor.id, []);
  }

  const trail = trails.get(cursor.id)!;

  // Add new point
  trail.push({
    x: cursor.x,
    y: cursor.y,
    age: 0,
    alpha: 1,
  });

  // Fade out and remove old points
  trail.forEach((point) => {
    point.age++;
    point.alpha = 1 - point.age / 20;
  });

  trail = trail.filter((p) => p.alpha > 0);
  trails.set(cursor.id, trail);
};

const drawTrail = (ctx: CanvasRenderingContext2D, cursor: RemoteCursor) => {
  const trail = trails.get(cursor.id) || [];

  trail.forEach((point) => {
    ctx.globalAlpha = point.alpha * 0.3;
    ctx.fillStyle = cursor.color;
    ctx.fillRect(point.x - 2, point.y - 2, 4, 4);
  });

  ctx.globalAlpha = 1;
};
```

### 2. Prediction

Predict next cursor position based on velocity:

```typescript
interface CursorVelocity {
  vx: number;
  vy: number;
  lastX: number;
  lastY: number;
}

const velocities = new Map<string, CursorVelocity>();

socket.on("cursor_update", (data) => {
  const vel = velocities.get(data.id) || { vx: 0, vy: 0 };

  vel.vx = (data.x - vel.lastX) / 50; // pixels per ms
  vel.vy = (data.y - vel.lastY) / 50;
  vel.lastX = data.x;
  vel.lastY = data.y;

  velocities.set(data.id, vel);
});

// In animation loop, predict future position
const predictedX = cursor.x + velocity.vx * elapsedMs;
const predictedY = cursor.y + velocity.vy * elapsedMs;
```

---

See main README.md for more!
