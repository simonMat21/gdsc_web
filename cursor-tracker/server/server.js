import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

// ============================================
// STATE MANAGEMENT
// ============================================

// Track all connected users
const users = new Map(); // Map<socketId, { id, name, x, y, color, lastUpdate }>

// Track global objects and their state
const objects = new Map(); // Map<objectId, { id, x, y, width, height, ownerId, color }>

// Initialize default objects
function initializeObjects() {
  objects.set("obj-1", {
    id: "obj-1",
    x: 200,
    y: 200,
    width: 40,
    height: 40,
    ownerId: null, // null means no one is dragging it
    color: "#FF6B6B",
  });

  objects.set("obj-2", {
    id: "obj-2",
    x: 500,
    y: 300,
    width: 40,
    height: 40,
    ownerId: null,
    color: "#4ECDC4",
  });

  objects.set("obj-3", {
    id: "obj-3",
    x: 800,
    y: 150,
    width: 40,
    height: 40,
    ownerId: null,
    color: "#45B7D1",
  });
}

initializeObjects();

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate a random color for new users
 */
function generateRandomColor() {
  const colors = [
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#FFA07A",
    "#98D8C8",
    "#F7DC6F",
    "#BB8FCE",
    "#85C1E2",
    "#F8B88B",
    "#A9DFBF",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Validate cursor position payload
 */
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

/**
 * Get current object state for broadcasting
 */
function getObjectState() {
  return Array.from(objects.values()).map((obj) => ({
    id: obj.id,
    x: obj.x,
    y: obj.y,
    width: obj.width,
    height: obj.height,
    ownerId: obj.ownerId,
    color: obj.color,
  }));
}

// ============================================
// SOCKET.IO EVENT HANDLERS
// ============================================

io.on("connection", (socket) => {
  console.log(`[CONNECT] User ${socket.id} joined`);

  // Store user information
  const userColor = generateRandomColor();
  users.set(socket.id, {
    id: socket.id,
    name: `User ${socket.id.substring(0, 5)}`,
    x: 0,
    y: 0,
    color: userColor,
    lastUpdate: Date.now(),
  });

  // ============================================
  // JOIN EVENT: Send current state to new user
  // ============================================
  socket.on("join", (data) => {
    const user = users.get(socket.id);
    if (user && data.name) {
      user.name = data.name;
    }

    console.log(`[JOIN] ${user.name} joined with color ${userColor}`);

    // Send current state to the new user
    socket.emit("init", {
      userId: socket.id,
      users: Array.from(users.values()).filter((u) => u.id !== socket.id),
      objects: getObjectState(),
      color: userColor,
    });

    // Announce new user to all others
    socket.broadcast.emit("user_joined", {
      id: socket.id,
      name: user.name,
      x: user.x,
      y: user.y,
      color: userColor,
    });
  });

  // ============================================
  // CURSOR_MOVE EVENT: Handle throttled cursor updates
  // ============================================
  socket.on("cursor_move", (data) => {
    // Validate incoming data
    if (!isValidCursorUpdate(data)) {
      console.warn(`[INVALID] ${socket.id} sent invalid cursor data:`, data);
      return;
    }

    const user = users.get(socket.id);
    if (!user) return;

    // Update user position
    user.x = data.x;
    user.y = data.y;
    user.lastUpdate = Date.now();

    // Broadcast cursor update to all OTHER clients
    // This is more efficient than broadcasting to everyone and filtering on client
    socket.broadcast.emit("cursor_update", {
      id: socket.id,
      x: data.x,
      y: data.y,
      ts: data.ts,
      seq: data.seq,
      name: user.name,
      color: user.color,
    });
  });

  // ============================================
  // PICKUP EVENT: Request ownership of an object
  // ============================================
  socket.on("pickup", (data) => {
    const { objectId } = data;
    const obj = objects.get(objectId);

    if (!obj) {
      socket.emit("object_reject", { objectId, reason: "Object not found" });
      return;
    }

    // Check if object is already owned by someone else
    if (obj.ownerId && obj.ownerId !== socket.id) {
      socket.emit("object_reject", {
        objectId,
        reason: "Object is owned by another user",
      });
      return;
    }

    // Grant ownership
    obj.ownerId = socket.id;

    console.log(`[PICKUP] ${socket.id} picked up ${objectId}`);

    // Broadcast object state change to all clients
    io.emit("object_update", {
      id: objectId,
      x: obj.x,
      y: obj.y,
      ownerId: obj.ownerId,
    });
  });

  // ============================================
  // OBJECT_MOVE EVENT: Update object position while dragging
  // ============================================
  socket.on("object_move", (data) => {
    const { objectId, x, y } = data;
    const obj = objects.get(objectId);

    if (!obj) return;

    // Verify ownership
    if (obj.ownerId !== socket.id) {
      socket.emit("object_reject", {
        objectId,
        reason: "You do not own this object",
      });
      return;
    }

    // Update object position
    obj.x = x;
    obj.y = y;

    // Broadcast to all clients
    io.emit("object_update", {
      id: objectId,
      x: obj.x,
      y: obj.y,
      ownerId: obj.ownerId,
    });
  });

  // ============================================
  // DROP EVENT: Release object ownership
  // ============================================
  socket.on("drop", (data) => {
    const { objectId, x, y } = data;
    const obj = objects.get(objectId);

    if (!obj) return;

    // Verify ownership
    if (obj.ownerId !== socket.id) return;

    // Update final position and release ownership
    obj.x = x;
    obj.y = y;
    obj.ownerId = null;

    console.log(`[DROP] ${socket.id} dropped ${objectId} at (${x}, ${y})`);

    // Broadcast final state
    io.emit("object_update", {
      id: objectId,
      x: obj.x,
      y: obj.y,
      ownerId: obj.ownerId,
    });
  });

  // ============================================
  // DISCONNECT EVENT: Clean up user and objects
  // ============================================
  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    console.log(`[DISCONNECT] ${user?.name || socket.id} left`);

    users.delete(socket.id);

    // Release any objects owned by this user
    objects.forEach((obj) => {
      if (obj.ownerId === socket.id) {
        obj.ownerId = null;
        io.emit("object_update", {
          id: obj.id,
          x: obj.x,
          y: obj.y,
          ownerId: null,
        });
      }
    });

    // Notify all clients of disconnection
    socket.broadcast.emit("user_left", { id: socket.id });
  });
});

// ============================================
// HTTP ENDPOINTS
// ============================================

/**
 * GET /stats - Server statistics and debugging info
 */
app.get("/stats", (req, res) => {
  res.json({
    connectedUsers: users.size,
    totalObjects: objects.size,
    usersList: Array.from(users.values()).map((u) => ({
      id: u.id,
      name: u.name,
      position: { x: u.x, y: u.y },
    })),
    objectsList: Array.from(objects.values()).map((obj) => ({
      id: obj.id,
      position: { x: obj.x, y: obj.y },
      ownedBy: obj.ownerId,
    })),
  });
});

/**
 * POST /reset - Reset all objects to initial state
 */
app.post("/reset", (req, res) => {
  // Release all objects
  objects.forEach((obj) => {
    obj.ownerId = null;
  });

  // Notify all clients
  io.emit("init", {
    objects: getObjectState(),
  });

  res.json({ success: true, message: "Objects reset" });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   Cursor Tracker Server Running        ║
║   http://localhost:${PORT}              ║
║   WebSocket: ws://localhost:${PORT}     ║
╚════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
