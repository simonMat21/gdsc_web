/**
 * SOCKET CONNECTION UTILITIES
 *
 * Centralized Socket.IO client setup and event handling
 * Handles connection, reconnection, and cleanup
 */

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io("http://localhost:4000", {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socket.on("connect", () => {
      console.log("✓ Connected to server:", socket?.id);
    });

    socket.on("disconnect", () => {
      console.log("✗ Disconnected from server");
    });

    socket.on("connect_error", (error) => {
      console.error("✗ Connection error:", error);
    });
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
