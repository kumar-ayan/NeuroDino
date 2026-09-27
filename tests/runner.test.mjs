import test from "node:test";
import assert from "node:assert/strict";
import {
  createRunner,
  tickRunner,
  applyInput,
  score,
} from "../src/lib/runner.ts";
const run = (s, frames, input = {}) => {
  for (let i = 0; i < frames && !s.dead; i++) tickRunner(s, false, input);
  return s;
};
const snapshot = (s) => ({
  time: s.time,
  distance: s.distance,
  y: s.y,
  vy: s.vy,
  obstacles: s.obstacles,
  dead: s.dead,
  score: score(s),
  jumps: s.jumps,
  ducks: s.ducks,
});
test("headless and rendered adapters execute identical upstream physics and randomness", () => {
  let draws = 0;
  const context = new Proxy(
    {},
    {
      get: (_, key) =>
        key === "globalAlpha"
          ? 1
          : () => {
              draws++;
            },
      set: () => true,
    },
  );
  const a = createRunner(42),
    b = createRunner(42, { getContext: () => context }, { sprite: true });
  for (let i = 0; i < 6000 && !a.dead; i++) {
    const input = { jump: i % 50 < 25, duck: i % 193 > 182 };
    tickRunner(a, false, input);
    tickRunner(b, false, input);
    assert.deepEqual(snapshot(a), snapshot(b));
  }
  assert.ok(draws > 100);
  assert.ok(a.dead);
});
test("holding jump does not create repeated keydowns; release and press jumps again", () => {
  const s = createRunner();
  run(s, 100, { jump: true });
  assert.equal(s.jumps, 1);
  assert.equal(s.y, 0);
  tickRunner(s, false);
  tickRunner(s, false, { jump: true });
  assert.equal(s.jumps, 2);
  assert.ok(s.y > 0);
});
test("original variable-height jump and speed drop remain available", () => {
  const full = createRunner(),
    short = createRunner(),
    drop = createRunner();
  let a = 0,
    b = 0;
  for (let i = 0; i < 60; i++) {
    tickRunner(full, false, { jump: true });
    tickRunner(short, false, { jump: i < 5 });
    tickRunner(drop, false, { jump: i < 8, duck: i >= 8 });
    a = Math.max(a, full.y);
    b = Math.max(b, short.y);
    if (i === 20) assert.ok(drop.y < full.y);
  }
  assert.ok(a > b);
  assert.ok(b >= 30);
  assert.equal(drop.y, 0);
});
test("original bird collision boxes permit ducking, while ground cacti remain lethal", () => {
  const s = createRunner(),
    { Runner, Obstacle } = s.core;
  const obstacle = (type, y) => {
    const o = new Obstacle(
      s.engine.canvasCtx,
      Runner.spriteDefinition.OBSTACLES.find((o) => o.type === type),
      s.engine.spriteDef[type],
      s.engine.dimensions,
      0.6,
      8,
    );
    o.xPos = 55;
    o.yPos = y;
    return o;
  };
  const bird = obstacle("PTERODACTYL", 75);
  assert.ok(s.core.checkForCollision(bird, s.engine.tRex));
  applyInput(s, { duck: true });
  assert.equal(s.core.checkForCollision(bird, s.engine.tRex), undefined);
  assert.ok(
    s.core.checkForCollision(obstacle("CACTUS_LARGE", 90), s.engine.tRex),
  );
});
test("upstream score and seed course are deterministic and idle collides", () => {
  const a = run(createRunner(123), 600),
    b = run(createRunner(123), 600);
  assert.deepEqual(snapshot(a), snapshot(b));
  assert.ok(a.dead);
  assert.equal(score(a), Math.round(Math.ceil(a.distance) * 0.025));
});
