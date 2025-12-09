/**
 * CURSOR LAYER COMPONENT - OPTIMIZED
 *
 * Key optimizations:
 * 1. Use useRef for cursor data instead of useState to avoid re-renders
 * 2. Only re-render canvas on animation frame
 * 3. Update lastUpdateTime when receiving cursor updates
 * 4. Avoid creating new Map objects constantly
 */

"use client";

import React, { useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";
import { throttle, lerp } from "../utils/math";

interface CursorPosition {
  x: number;
  y: number;
}

interface RemoteCursor extends CursorPosition {
  id: string;
  name: string;
  color: string;
  targetX: number;
  targetY: number;
  prevX: number;
  prevY: number;
  lastUpdateTime: number;
}

interface CursorLayerProps {
  socket: Socket | null;
}

const INTERPOLATION_DURATION = 50; // ms

export function CursorLayer({ socket }: CursorLayerProps) {
  const [localCursor, setLocalCursor] = useState<CursorPosition>({
    x: 0,
    y: 0,
  });
  const [userCount, setUserCount] = useState(0);

  // Use useRef to store cursor data - avoids React re-renders
  const remoteCursorsRef = useRef<Map<string, RemoteCursor>>(new Map());

  const sequenceRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastCanvasSizeRef = useRef({ width: 0, height: 0 });

  // ============================================
  // THROTTLED LOCAL CURSOR SENDING
  // ============================================

  /**
   * Sends cursor position to server (throttled to 50ms)
   * Includes timestamp and sequence number for ordering
   */
  const throttledSendCursor = throttle((x: number, y: number) => {
    if (!socket) return;

    socket.emit("cursor_move", {
      x: Math.round(x),
      y: Math.round(y),
      ts: Date.now(),
      seq: sequenceRef.current++,
    });
  }, 50); // 50ms throttle = ~20 updates/sec

  // ============================================
  // LOCAL MOUSE EVENT HANDLER
  // ============================================

  const handleMouseMove = (e: MouseEvent) => {
    const x = e.clientX;
    const y = e.clientY;

    // Update local state (for rendering own cursor)
    setLocalCursor({ x, y });

    // Send to server (throttled)
    throttledSendCursor(x, y);
  };

  // ============================================
  // SOCKET EVENT LISTENERS
  // ============================================

  useEffect(() => {
    if (!socket) return;

    // Receive initialization data
    socket.on("init", (data) => {
      console.log("📡 Received init:", data);
      const cursors = remoteCursorsRef.current;
      cursors.clear();

      data.users.forEach((user: any) => {
        cursors.set(user.id, {
          id: user.id,
          x: user.x,
          y: user.y,
          targetX: user.x,
          targetY: user.y,
          prevX: user.x,
          prevY: user.y,
          name: user.name,
          color: user.color,
          lastUpdateTime: Date.now(),
        });
      });

      setUserCount(cursors.size);
    });

    // CRITICAL FIX: Update lastUpdateTime when receiving cursor update
    socket.on("cursor_update", (data) => {
      const { id, x, y, name, color, ts } = data;
      const cursors = remoteCursorsRef.current;
      const existing = cursors.get(id);

      if (existing) {
        // Update: shift current target to prev, set new target
        existing.prevX = existing.x; // Use current x (which is interpolated)
        existing.prevY = existing.y; // Use current y
        existing.targetX = x;
        existing.targetY = y;
        existing.lastUpdateTime = ts || Date.now(); // CRITICAL: Update this!
      } else {
        // New cursor
        cursors.set(id, {
          id,
          x,
          y,
          targetX: x,
          targetY: y,
          prevX: x,
          prevY: y,
          name,
          color,
          lastUpdateTime: ts || Date.now(),
        });
        setUserCount(cursors.size);
      }
    });

    socket.on("user_joined", (data) => {
      console.log(`👤 ${data.name} joined`);
      const cursors = remoteCursorsRef.current;
      cursors.set(data.id, {
        id: data.id,
        x: data.x,
        y: data.y,
        targetX: data.x,
        targetY: data.y,
        prevX: data.x,
        prevY: data.y,
        name: data.name,
        color: data.color,
        lastUpdateTime: Date.now(),
      });
      setUserCount(cursors.size);
    });

    socket.on("user_left", (data) => {
      console.log(`👋 User ${data.id} left`);
      const cursors = remoteCursorsRef.current;
      cursors.delete(data.id);
      setUserCount(cursors.size);
    });

    // Add mouse move listener
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      socket.off("init");
      socket.off("cursor_update");
      socket.off("user_joined");
      socket.off("user_left");
    };
  }, [socket]);

  // ============================================
  // ANIMATION LOOP - OPTIMIZED
  // ============================================

  /**
   * Renders the canvas with all cursors
   * Updates remote cursor positions via interpolation
   */
  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const now = Date.now();
    const cursors = remoteCursorsRef.current;

    // Update and render cursors WITHOUT calling setState
    cursors.forEach((cursor) => {
      // Calculate interpolation progress
      const elapsed = now - cursor.lastUpdateTime;
      const progress = Math.min(elapsed / INTERPOLATION_DURATION, 1);

      // Interpolate position
      cursor.x = lerp(cursor.prevX, cursor.targetX, progress);
      cursor.y = lerp(cursor.prevY, cursor.targetY, progress);

      // Draw cursor
      drawCursor(ctx, cursor);
    });

    animationFrameRef.current = requestAnimationFrame(animate);
  };

  /**
   * Draws a single cursor with name label
   */
  const drawCursor = (ctx: CanvasRenderingContext2D, cursor: RemoteCursor) => {
    const x = cursor.x;
    const y = cursor.y;
    const size = 8;

    ctx.save();

    // Draw outer glow
    ctx.fillStyle = `${cursor.color}33`; // Transparent color
    ctx.beginPath();
    ctx.arc(x, y, size + 8, 0, Math.PI * 2);
    ctx.fill();

    // Draw main circle
    ctx.fillStyle = cursor.color;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw center dot
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();

    // Draw crosshair
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - size - 2, y);
    ctx.lineTo(x + size + 2, y);
    ctx.moveTo(x, y - size - 2);
    ctx.lineTo(x, y + size + 2);
    ctx.stroke();

    // Draw name label with background
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.font = "bold 11px Arial";
    ctx.textBaseline = "top";
    const textWidth = ctx.measureText(cursor.name).width;
    ctx.fillRect(x + size + 8, y - 8, textWidth + 6, 16);

    ctx.fillStyle = "#fff";
    ctx.fillText(cursor.name, x + size + 11, y - 5);

    ctx.restore();
  };

  // Start animation loop
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Resize canvas - optimized to avoid redundant resizes
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const width = window.innerWidth;
      const height = window.innerHeight;

      // Only update if size actually changed
      if (
        width !== lastCanvasSizeRef.current.width ||
        height !== lastCanvasSizeRef.current.height
      ) {
        canvas.width = width;
        canvas.height = height;
        lastCanvasSizeRef.current = { width, height };
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 100,
          background: "transparent",
        }}
      />
      {/* Stats overlay */}
      <div
        style={{
          position: "fixed",
          top: 10,
          right: 10,
          background: "rgba(0,0,0,0.7)",
          color: "#fff",
          padding: "10px 15px",
          borderRadius: "5px",
          fontSize: "12px",
          fontFamily: "monospace",
          zIndex: 101,
        }}
      >
        <div>👤 Users: {userCount}</div>
        <div>
          📍 You: {Math.round(localCursor.x)}, {Math.round(localCursor.y)}
        </div>
      </div>
    </>
  );
}
