/**
 * THROTTLE UTILITY
 *
 * Purpose: Limit how often a function is called
 * Why: Mouse events fire ~200+/sec. We only want to send cursor updates every 50ms
 * to reduce server load and network traffic.
 *
 * How it works:
 * 1. Store the last execution time
 * 2. When called, check if delay has elapsed
 * 3. If yes, execute and update last time
 * 4. If no, skip this call
 */

export function throttle<Args extends unknown[]>(
  func: (...args: Args) => void,
  limit: number
): (...args: Args) => void {
  let lastCall = 0;

  return function (...args: Args) {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      func(...args);
    }
  };
}

/**
 * LERP UTILITY (Linear Interpolation)
 *
 * Purpose: Smoothly transition between two values
 * Formula: result = a + (b - a) * t
 * where t is 0-1 (0=at 'a', 1=at 'b')
 *
 * Why: Cursor position updates come every 50ms, but we render every frame (~16ms).
 * Without interpolation, cursors appear jerky. With LERP, we smoothly interpolate
 * between the last known position and the next target position.
 */

export function lerp(start: number, end: number, t: number): number {
  // Clamp t between 0 and 1
  const clampedT = Math.max(0, Math.min(1, t));
  return start + (end - start) * clampedT;
}

/**
 * Calculate distance between two points
 */
export function distance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
