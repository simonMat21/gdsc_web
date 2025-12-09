/**
 * OBJECT LAYER COMPONENT
 *
 * This component:
 * 1. Renders draggable objects
 * 2. Handles pickup/drop logic
 * 3. Shows object ownership and highlights
 * 4. Syncs object state with server
 */

"use client";

import React, { useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";

interface DraggableObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ownerId: string | null;
  color: string;
}

interface ObjectLayerProps {
  socket: Socket | null;
  userId: string;
}

export function ObjectLayer({ socket, userId }: ObjectLayerProps) {
  const [objects, setObjects] = useState<Map<string, DraggableObject>>(
    new Map()
  );

  // Use refs for drag state to avoid re-renders on every mousemove
  const dragStateRef = useRef({
    draggingId: null as string | null,
    dragOffset: { x: 0, y: 0 },
  });

  // Track for UI updates (e.g., visual feedback)
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Throttled object_move emit
  const lastEmitRef = useRef<number>(0);
  const EMIT_THROTTLE = 30; // ms

  // ============================================
  // SOCKET LISTENERS
  // ============================================

  useEffect(() => {
    if (!socket) return;

    // Initialize objects
    socket.on("init", (data) => {
      const objectsMap = new Map<string, DraggableObject>();
      data.objects.forEach((obj: any) => {
        objectsMap.set(obj.id, obj);
      });
      setObjects(objectsMap);
    });

    // Update object state
    socket.on("object_update", (data) => {
      setObjects((prev) => {
        const updated = new Map(prev);
        if (updated.has(data.id)) {
          const obj = updated.get(data.id)!;
          obj.x = data.x;
          obj.y = data.y;
          obj.ownerId = data.ownerId;
        }
        return updated;
      });
    });

    // Handle rejection
    socket.on("object_reject", (data) => {
      console.warn("Object action rejected:", data.reason);
      setDraggingId(null);
    });

    return () => {
      socket.off("init");
      socket.off("object_update");
      socket.off("object_reject");
    };
  }, [socket]);

  // ============================================
  // PICKUP HANDLER
  // ============================================

  const handleMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    objectId: string
  ) => {
    e.preventDefault();

    const obj = objects.get(objectId);
    if (!obj) return;

    // If already owned by someone else, can't drag
    if (obj.ownerId && obj.ownerId !== userId) {
      console.log("Cannot drag: object owned by another user");
      return;
    }

    // Request pickup
    socket?.emit("pickup", { objectId });

    // Store in ref (no re-render needed)
    dragStateRef.current.draggingId = objectId;
    setDraggingId(objectId); // For UI feedback only

    // Calculate offset between mouse and object position
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    dragStateRef.current.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // Store current state in a ref to avoid stale closures
  const stateRef = useRef({ objects, userId, socket });

  useEffect(() => {
    stateRef.current = { objects, userId, socket };
  }, [objects, userId, socket]);

  // Event handlers that read from refs (no stale closure issues)
  const handleMoveWithRef = (e: MouseEvent) => {
    const { objects, userId, socket } = stateRef.current;
    const { draggingId, dragOffset } = dragStateRef.current;
    if (!draggingId || !socket) return;

    const obj = objects.get(draggingId);
    if (!obj || obj.ownerId !== userId) return;

    // Calculate new position
    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;

    // Clamp to window bounds
    const clampedX = Math.max(0, Math.min(x, window.innerWidth - obj.width));
    const clampedY = Math.max(0, Math.min(y, window.innerHeight - obj.height));

    // Throttle socket emit to reduce network load (30ms)
    const now = Date.now();
    if (now - lastEmitRef.current >= EMIT_THROTTLE) {
      socket.emit("object_move", {
        objectId: draggingId,
        x: clampedX,
        y: clampedY,
      });
      lastEmitRef.current = now;
    }

    // Update local state immediately for responsiveness (only position changes)
    setObjects((prev) => {
      const updated = new Map(prev);
      const obj = updated.get(draggingId)!;
      obj.x = clampedX;
      obj.y = clampedY;
      return updated;
    });
  };

  const handleUpWithRef = () => {
    const { objects, socket } = stateRef.current;
    const { draggingId } = dragStateRef.current;
    if (!draggingId || !socket) return;

    const obj = objects.get(draggingId);
    if (!obj) return;

    // Emit drop event
    socket.emit("drop", {
      objectId: draggingId,
      x: obj.x,
      y: obj.y,
    });

    dragStateRef.current.draggingId = null;
    setDraggingId(null);
  };

  // Add event listeners (only re-attach when dragging starts/ends)
  useEffect(() => {
    window.addEventListener("mousemove", handleMoveWithRef);
    window.addEventListener("mouseup", handleUpWithRef);

    return () => {
      window.removeEventListener("mousemove", handleMoveWithRef);
      window.removeEventListener("mouseup", handleUpWithRef);
    };
  }, []);

  // ============================================
  // RENDER
  // ============================================

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      {Array.from(objects.values()).map((obj) => (
        <div
          key={obj.id}
          onMouseDown={(e) => handleMouseDown(e, obj.id)}
          style={{
            position: "fixed",
            left: `${obj.x}px`,
            top: `${obj.y}px`,
            width: `${obj.width}px`,
            height: `${obj.height}px`,
            backgroundColor: obj.color,
            borderRadius: "4px",
            cursor:
              obj.ownerId && obj.ownerId !== userId ? "not-allowed" : "grab",
            border:
              obj.ownerId === userId
                ? "3px solid gold"
                : obj.ownerId
                ? "2px solid red"
                : "none",
            boxShadow:
              obj.ownerId === userId
                ? "0 0 10px rgba(255, 215, 0, 0.8)"
                : "none",
            pointerEvents: "auto",
            transition: draggingId === obj.id ? "none" : "left 0.1s, top 0.1s",
            userSelect: "none",
          }}
          title={
            obj.ownerId
              ? `Owned by: ${obj.ownerId.substring(0, 5)}`
              : "Drag me!"
          }
        />
      ))}
    </div>
  );
}
