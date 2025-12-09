/**
 * HOME PAGE - Main Cursor Tracker Dashboard
 *
 * Features:
 * - Connects to Socket.IO server
 * - Joins with user name
 * - Renders CursorLayer (all users' cursors)
 * - Renders ObjectLayer (draggable objects)
 * - Displays connection status and stats
 */

"use client";

import React, { useEffect, useState } from "react";
import { CursorLayer } from "../components/CursorLayer";
import { ObjectLayer } from "../components/ObjectLayer";
import { getSocket, disconnectSocket } from "../utils/socket";
import { Socket } from "socket.io-client";

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [userName, setUserName] = useState("");

  // ============================================
  // SOCKET INITIALIZATION
  // ============================================

  useEffect(() => {
    const sock = getSocket();

    // Connection event
    const handleConnect = () => {
      console.log("✓ Socket connected:", sock.id);
      setIsConnected(true);
      setUserId(sock.id || "");

      // Join with a name
      const name = `User-${(sock.id || "").substring(0, 5).toUpperCase()}`;
      setUserName(name);

      sock.emit("join", { name });
    };

    // Disconnection event
    const handleDisconnect = () => {
      console.log("✗ Socket disconnected");
      setIsConnected(false);
    };

    sock.on("connect", handleConnect);
    sock.on("disconnect", handleDisconnect);

    // Check if already connected
    if (sock.connected) {
      handleConnect();
    }

    setSocket(sock);

    return () => {
      sock.off("connect", handleConnect);
      sock.off("disconnect", handleDisconnect);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Optionally disconnect when leaving the page
      // disconnectSocket();
    };
  }, []);

  return (
    <div style={{ width: "100%", height: "100vh", overflow: "hidden" }}>
      {/* Render cursor layer */}
      {socket && <CursorLayer socket={socket} />}

      {/* Render draggable objects */}
      {socket && userId && <ObjectLayer socket={socket} userId={userId} />}

      {/* Connection status and info panel */}
      <div
        style={{
          position: "fixed",
          bottom: 20,
          left: 20,
          background: "rgba(0, 0, 0, 0.9)",
          color: "#fff",
          padding: "15px",
          borderRadius: "8px",
          fontSize: "13px",
          fontFamily: "monospace",
          maxWidth: "300px",
          zIndex: 102,
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: "10px" }}>
          {isConnected ? "✓ Connected" : "✗ Disconnected"}
        </div>
        <div style={{ marginBottom: "8px" }}>
          <strong>Status:</strong> {isConnected ? "Online" : "Offline"}
        </div>
        <div style={{ marginBottom: "8px" }}>
          <strong>User:</strong> {userName}
        </div>
        <div style={{ marginBottom: "8px" }}>
          <strong>Socket ID:</strong> {userId.substring(0, 8)}...
        </div>
        <div style={{ marginTop: "10px", fontSize: "11px", color: "#aaa" }}>
          👆 Move your cursor
          <br />
          🎯 Drag colored squares
        </div>
      </div>

      {/* Help text */}
      <div
        style={{
          position: "fixed",
          top: 20,
          left: 20,
          background: "rgba(0, 0, 0, 0.8)",
          color: "#fff",
          padding: "15px",
          borderRadius: "8px",
          fontSize: "13px",
          maxWidth: "350px",
          zIndex: 101,
        }}
      >
        <h2 style={{ margin: "0 0 10px 0", fontSize: "16px" }}>
          🖱️ Cursor Tracker
        </h2>
        <div style={{ fontSize: "12px", lineHeight: "1.5", color: "#ccc" }}>
          <p style={{ margin: "5px 0" }}>
            <strong>How it works:</strong>
          </p>
          <ul style={{ margin: "5px 0", paddingLeft: "20px" }}>
            <li>Your cursor is sent every 50ms</li>
            <li>Remote cursors smooth via interpolation</li>
            <li>Drag objects for real-time sharing</li>
            <li>Only one user can drag at a time</li>
          </ul>
          <p style={{ margin: "10px 0 0 0", fontSize: "11px", color: "#999" }}>
            Open in multiple windows to see live updates
          </p>
        </div>
      </div>
    </div>
  );
}
