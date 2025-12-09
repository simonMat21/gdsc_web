# Backend Server Documentation

## Overview

Node.js + Express + Socket.IO server that manages real-time cursor tracking and object ownership for multiple connected clients.

## Key Features

- **Real-time cursor broadcasting** with throttle-aware updates
- **Object ownership system** with pickup/drop mechanics
- **Automatic cleanup** when users disconnect
- **Server statistics endpoint** for monitoring
- **CORS-enabled** for frontend communication

## Running the Server

```bash
npm install
npm run dev
```

Server starts on `http://localhost:4000`

## API Reference

### Socket Events

#### From Client

##### `join`

Called when user connects. Initializes user data.

```javascript
socket.emit("join", {
  name: "User Name",
});
```

**Server Response (init):**

```javascript
socket.on("init", (data) => {
  // data = {
  //   userId: 'socket.id',
  //   users: [{id, name, x, y, color}, ...],
  //   objects: [{id, x, y, ownerId, color}, ...],
  //   color: 'user color'
  // }
});
```

##### `cursor_move`

Sends throttled cursor position (50ms interval).

```javascript
socket.emit("cursor_move", {
  x: 100, // 0-10000
  y: 200, // 0-10000
  ts: 1692518400, // timestamp
  seq: 42, // sequence number
});
```

**Server broadcasts to others:**

```javascript
socket.broadcast.emit("cursor_update", {
  id: "socket.id",
  x: 100,
  y: 200,
  ts: 1692518400,
  seq: 42,
  name: "User Name",
  color: "#FF6B6B",
});
```

##### `pickup`

Request ownership of an object.

```javascript
socket.emit("pickup", {
  objectId: "obj-1",
});
```

**Success Response:**

```javascript
io.emit("object_update", {
  id: "obj-1",
  x: 200,
  y: 200,
  ownerId: "socket.id",
});
```

**Failure Response:**

```javascript
socket.emit("object_reject", {
  objectId: "obj-1",
  reason: "Object is owned by another user",
});
```

##### `object_move`

Update object position while dragging (real-time, not throttled).

```javascript
socket.emit("object_move", {
  objectId: "obj-1",
  x: 250,
  y: 300,
});
```

**Server broadcasts:**

```javascript
io.emit("object_update", {
  id: "obj-1",
  x: 250,
  y: 300,
  ownerId: "socket.id",
});
```

##### `drop`

Release object ownership.

```javascript
socket.emit("drop", {
  objectId: "obj-1",
  x: 250,
  y: 300,
});
```

**Server broadcasts:**

```javascript
io.emit("object_update", {
  id: "obj-1",
  x: 250,
  y: 300,
  ownerId: null, // Released
});
```

#### From Server

| Event           | Payload                                | When                        |
| --------------- | -------------------------------------- | --------------------------- |
| `init`          | User state + connected users + objects | User joins                  |
| `cursor_update` | Remote cursor position                 | Another user moves          |
| `user_joined`   | New user data                          | Someone connects            |
| `user_left`     | Disconnected user ID                   | Someone disconnects         |
| `object_update` | Object state change                    | Object moved/picked/dropped |
| `object_reject` | Rejection reason                       | Action denied               |

### HTTP Endpoints

#### GET `/stats`

Server statistics and state.

**Response:**

```json
{
  "connectedUsers": 3,
  "totalObjects": 3,
  "usersList": [
    {
      "id": "abc123",
      "name": "User ABC",
      "position": { "x": 100, "y": 200 }
    }
  ],
  "objectsList": [
    {
      "id": "obj-1",
      "position": { "x": 200, "y": 200 },
      "ownedBy": null
    }
  ]
}
```

#### POST `/reset`

Reset all objects to initial state (releases all ownership).

**Response:**

```json
{
  "success": true,
  "message": "Objects reset"
}
```

## State Management

### User State

```javascript
{
  id: 'socket-id',
  name: 'User Name',
  x: 100,
  y: 200,
  color: '#FF6B6B',
  lastUpdate: 1692518400
}
```

### Object State

```javascript
{
  id: 'obj-1',
  x: 200,
  y: 200,
  width: 40,
  height: 40,
  ownerId: null,  // null = no one, otherwise socket.id
  color: '#FF6B6B'
}
```

## Validation

### Cursor Position Validation

```javascript
function isValidCursorUpdate(data) {
  return (
    typeof data.x === "number" &&
    typeof data.y === "number" &&
    typeof data.ts === "number" &&
    typeof data.seq === "number" &&
    data.x >= 0 &&
    data.x <= 10000 &&
    data.y >= 0 &&
    data.y <= 10000
  );
}
```

Invalid data is silently dropped (logged as warning).

## Ownership Rules

1. **Object starts unowned** (ownerId = null)
2. **Pickup attempt:**
   - If ownerId is null → Grant ownership
   - If ownerId is socket.id → Keep ownership
   - If ownerId is someone else → Reject
3. **Move object:** Only owner can emit `object_move`
4. **Drop object:** Only owner can emit `drop`
5. **Auto-release:** On disconnect, all objects owned by user are released

## Scalability Tips

### For 10+ Users

1. **Use Redis adapter for load balancing:**

   ```javascript
   import { createAdapter } from "@socket.io/redis-adapter";
   io.adapter(createAdapter(pubClient, subClient));
   ```

2. **Implement rate limiting:**

   ```javascript
   socket.on("cursor_move", (data) => {
     if (shouldRateLimit(socket.id)) {
       socket.emit("error", "Too many updates");
       return;
     }
     // Process...
   });
   ```

3. **Monitor memory usage:**

   - Each user: ~500 bytes
   - Each object: ~200 bytes
   - 10 users: ~5 KB + object overhead

4. **Use clustering for multiple cores:**

   ```javascript
   import cluster from "cluster";
   import os from "os";

   if (cluster.isMaster) {
     for (let i = 0; i < os.cpus().length; i++) {
       cluster.fork();
     }
   } else {
     // Server code
   }
   ```

## Security Considerations

### Current Implementation

- Basic CORS enabled
- Payload validation
- No authentication

### Production Hardening

1. **Add JWT authentication:**

   ```javascript
   io.use((socket, next) => {
     const token = socket.handshake.auth.token;
     try {
       const decoded = jwt.verify(token, SECRET);
       socket.userId = decoded.userId;
       next();
     } catch (err) {
       next(new Error("Invalid token"));
     }
   });
   ```

2. **Rate limiting:**

   ```javascript
   const rateLimit = require("express-rate-limit");
   app.use(
     rateLimit({
       windowMs: 15 * 60 * 1000,
       max: 100,
     })
   );
   ```

3. **Input sanitization:**

   ```javascript
   const xss = require("xss");
   const sanitizedName = xss(data.name);
   ```

4. **HTTPS/WSS only in production:**
   ```javascript
   io.use((socket, next) => {
     if (!socket.handshake.headers["x-forwarded-proto"] === "https") {
       next(new Error("Use HTTPS"));
     }
     next();
   });
   ```

## Debugging

### Enable verbose logging:

```javascript
io.on("connection", (socket) => {
  console.log(`[CONNECT] ${socket.id}`);

  socket.on("cursor_move", (data) => {
    console.log(`[MOVE] ${socket.id}: (${data.x}, ${data.y})`);
  });
});
```

### Check server state:

```bash
curl http://localhost:4000/stats
```

### Monitor events in real-time:

```javascript
// Add to server.js
io.on("connection", (socket) => {
  const original = socket.emit;
  socket.emit = function (event, data) {
    console.log(`[EMIT] ${socket.id} <- ${event}`, data);
    return original.apply(socket, arguments);
  };
});
```

## Performance Metrics

### Bandwidth per user:

- Cursor update: ~30 bytes
- Frequency: 20 updates/sec (throttled at 50ms)
- Per user: 20 × 30 = 600 bytes/sec ≈ 0.6 KB/sec

### For 10 users:

- 0.6 × 10 = 6 KB/sec ≈ 43 MB/hour

### Server resources (10 users):

- Memory: ~10 KB state data
- CPU: Minimal (mostly I/O bound)
- Network: See bandwidth above

---

See main README.md for full architecture and deployment guides.
