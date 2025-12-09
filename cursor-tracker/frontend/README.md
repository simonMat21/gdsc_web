# Cursor Tracker Frontend

This is the Next.js frontend for the Live Cursor Tracker system.

## Setup

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` in your browser.

## Architecture

### Components

- **CursorLayer**: Handles local cursor tracking, socket communication, and rendering remote cursors with interpolation
- **ObjectLayer**: Manages draggable objects with pickup/drop functionality

### Utils

- **math.ts**: Throttle, LERP, and utility functions
- **socket.ts**: Socket.IO client setup and connection management

## How It Works

1. **Throttling**: Mouse events are throttled to 50ms intervals to reduce server load
2. **Interpolation**: Remote cursor positions are smoothly interpolated using LERP between updates
3. **Animation Loop**: requestAnimationFrame drives smooth 60fps animations
4. **Socket Events**:
   - `cursor_move`: Send throttled cursor position
   - `cursor_update`: Receive remote cursor updates
   - `pickup`/`drop`: Object ownership events

## Performance Tips

- Canvas rendering is used for cursor display (more efficient than DOM)
- Throttling reduces network traffic by ~75%
- LERP interpolation removes jerkiness without increasing bandwidth
- Map data structure for O(1) cursor lookup
