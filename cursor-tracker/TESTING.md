# Testing Guide

## Unit Testing

### Backend Tests

Create `server/test.js`:

```javascript
import assert from "assert";

// Test throttle validation
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

// Test cases
console.log("Testing cursor validation...");

assert.ok(
  isValidCursorUpdate({ x: 100, y: 200, ts: 1692518400, seq: 1 }),
  "Valid update should pass"
);

assert.ok(
  !isValidCursorUpdate({ x: -10, y: 200, ts: 1692518400, seq: 1 }),
  "Negative x should fail"
);

assert.ok(
  !isValidCursorUpdate({ x: 100, y: 200, ts: "invalid", seq: 1 }),
  "Invalid timestamp should fail"
);

console.log("✓ All tests passed!");
```

Run with:

```bash
node test.js
```

### Frontend Tests

Create `frontend/__tests__/math.test.ts`:

```typescript
import { lerp, throttle } from "../utils/math";

describe("Math utilities", () => {
  test("lerp calculates correct interpolation", () => {
    expect(lerp(0, 100, 0)).toBe(0);
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(0, 100, 1)).toBe(100);
  });

  test("lerp clamps t between 0 and 1", () => {
    expect(lerp(0, 100, -0.5)).toBe(0);
    expect(lerp(0, 100, 1.5)).toBe(100);
  });

  test("throttle limits function calls", (done) => {
    let count = 0;
    const throttled = throttle(() => count++, 100);

    throttled();
    throttled();
    throttled();
    expect(count).toBe(1);

    setTimeout(() => {
      throttled();
      expect(count).toBe(2);
      done();
    }, 101);
  });
});
```

Run with:

```bash
npm install --save-dev jest @testing-library/react
npm test
```

## Integration Testing

### Scenario 1: Two Users, Cursor Tracking

```javascript
// test/integration.test.js
const io = require("socket.io-client");
const assert = require("assert");

async function testTwoUserCursorTracking() {
  const url = "http://localhost:4000";

  // User 1 connects
  const user1 = io(url);
  await new Promise((resolve) => user1.on("connect", resolve));

  // User 2 connects
  const user2 = io(url);
  await new Promise((resolve) => user2.on("connect", resolve));

  // User 1 joins
  user1.emit("join", { name: "User 1" });
  const initData = await new Promise((resolve) => user1.on("init", resolve));
  assert.strictEqual(initData.userId, user1.id);

  // User 2 should receive user_joined event
  const joinedEvent = await new Promise((resolve) =>
    user2.on("user_joined", resolve)
  );
  assert.strictEqual(joinedEvent.id, user1.id);

  // User 1 moves cursor
  user1.emit("cursor_move", { x: 100, y: 200, ts: Date.now(), seq: 1 });

  // User 2 should receive cursor_update
  const cursorUpdate = await new Promise((resolve) =>
    user2.on("cursor_update", resolve)
  );
  assert.strictEqual(cursorUpdate.x, 100);
  assert.strictEqual(cursorUpdate.y, 200);

  console.log("✓ Two-user cursor tracking test passed");

  user1.close();
  user2.close();
}

testTwoUserCursorTracking().catch(console.error);
```

### Scenario 2: Object Ownership

```javascript
async function testObjectOwnership() {
  const url = "http://localhost:4000";

  // User 1 connects
  const user1 = io(url);
  const user2 = io(url);

  await Promise.all([
    new Promise((resolve) => user1.on("connect", resolve)),
    new Promise((resolve) => user2.on("connect", resolve)),
  ]);

  user1.emit("join", { name: "User 1" });
  user2.emit("join", { name: "User 2" });

  // Both receive init
  const init1 = await new Promise((resolve) => user1.on("init", resolve));
  const init2 = await new Promise((resolve) => user2.on("init", resolve));

  const objectId = init1.objects[0].id;

  // User 1 picks up object
  user1.emit("pickup", { objectId });
  const update1 = await new Promise((resolve) =>
    user1.on("object_update", resolve)
  );
  assert.strictEqual(update1.ownerId, user1.id);

  // User 2 tries to pick up same object
  user2.emit("pickup", { objectId });
  const rejection = await new Promise((resolve) =>
    user2.on("object_reject", resolve)
  );
  assert.ok(rejection.reason.includes("owned"));

  console.log("✓ Object ownership test passed");

  user1.close();
  user2.close();
}
```

## Load Testing

### Artillery Load Test

Create `load-test.yml`:

```yaml
config:
  target: "http://localhost:4000"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 20
      name: "Ramp up"
    - duration: 60
      arrivalRate: 20
      name: "Sustained"

scenarios:
  - name: "Cursor Tracking"
    flow:
      - think: 1
      - emit:
          channel: "join"
          data: { name: "LoadTest User" }
      - think: 2
      - loop:
          - emit:
              channel: "cursor_move"
              data:
                x: "{{ random(0, 1000) }}"
                y: "{{ random(0, 800) }}"
                ts: "{{ now }}"
                seq: "{{ counter }}"
          - think: 0.05
        count: 100
```

Run with:

```bash
npm install -g artillery
artillery run load-test.yml
```

### Example Results

```
Summary report
==============
Scenarios launched:   200
Scenarios completed:  200
Requests completed:   20000
RPS sent: 166.67
Request latency:
  min: 10
  max: 250
  median: 45
  p95: 120
  p99: 200
Errors: 0
```

## Manual Testing Checklist

### Basic Functionality

- [ ] Two users can see each other's cursors
- [ ] Cursor updates feel smooth (no jerkiness)
- [ ] Cursors disappear when user leaves
- [ ] User names display correctly
- [ ] Colors are assigned randomly

### Object Interaction

- [ ] Can drag an object
- [ ] Object appears selected (gold border) while dragging
- [ ] Only one user can drag at a time
- [ ] Other users see the object moving
- [ ] Object position updates when dropped
- [ ] Can drop and pick up again

### Edge Cases

- [ ] Close/reopen browser → Still works
- [ ] Disconnect network → Shows offline
- [ ] Reconnect → Syncs state correctly
- [ ] 5+ users simultaneously
- [ ] Drag object while moving cursor
- [ ] Other user picks up object while you're dragging (should reject)

### Performance

- [ ] FPS stays 50+ with 5 users
- [ ] Memory usage stable over 5 minutes
- [ ] CPU usage <20% on main thread
- [ ] Network usage <1 MB/min with 5 users

### Network Conditions

```bash
# Simulate slow network (Chrome DevTools)
1. Open DevTools
2. Network tab
3. Click "Fast 3G" dropdown
4. Select "Slow 3G"
5. Test responsiveness
```

Expected behavior:

- Cursors still move smoothly (interpolation hides latency)
- Updates take longer to arrive (~200ms)
- No visual artifacts or freezing

## Browser Compatibility

| Browser     | Status | Notes           |
| ----------- | ------ | --------------- |
| Chrome 90+  | ✓      | Fully supported |
| Firefox 88+ | ✓      | Fully supported |
| Safari 14+  | ✓      | Fully supported |
| Edge 90+    | ✓      | Fully supported |
| IE 11       | ✗      | No Canvas API   |

## Debugging Tips

### Enable Verbose Logging

Frontend:

```typescript
localStorage.setItem("debug", "cursor-tracker:*");
```

Backend:

```javascript
process.env.DEBUG = "socket.io:*";
```

### Check Socket Connection

```javascript
socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  console.log('Server reachable?', await fetch('/stats'));
});
```

### Monitor Memory Leaks

```javascript
setInterval(() => {
  if (performance.memory) {
    console.log({
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
    });
  }
}, 5000);
```

## Performance Benchmarks

### Expected Metrics

| Metric         | Target  | Current   |
| -------------- | ------- | --------- |
| Cursor latency | <100ms  | ~50ms     |
| FPS            | 55+     | 60        |
| Memory/user    | <1MB    | ~0.5MB    |
| Bandwidth/user | <2 KB/s | ~0.6 KB/s |
| CPU usage      | <10%    | ~2%       |

---

See main README.md for more!
