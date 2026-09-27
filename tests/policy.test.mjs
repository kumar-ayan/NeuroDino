import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRunner } from "../src/lib/runner.ts";
import {
  NETWORK,
  forward,
  observation,
  validModel,
} from "../src/lib/policy.ts";
import { Connectome, CIRCUIT } from "../src/lib/connectome.ts";
import { Trainer, episode, rng, randomWeights } from "../src/lib/training.ts";
import { benchmark } from "../src/lib/benchmark.ts";
const model = JSON.parse(
  readFileSync(
    new URL("../public/benchmarks/model.json", import.meta.url),
    "utf8",
  ),
);
test("actual learned weights and hidden activations determine the selected score", () => {
  const weights = Array(NETWORK.parameters).fill(0);
  weights[229] = 2;
  const result = forward(weights, Array(16).fill(0));
  assert.deepEqual(result.scores, [0, 2, 0]);
  assert.equal(result.action, 1);
  assert.equal(episode(weights, 42, 20).jumps, 1);
});
test("measured circuit activity depends on input and resets per episode", () => {
  const a = new Connectome(),
    b = new Connectome(),
    input = observation(createRunner());
  const first = a.step(input);
  assert.deepEqual(first, b.step(input));
  assert.ok(a.activity.some((v) => v !== 0));
  const altered = input.slice();
  altered[0] = 1;
  for (let i = 0; i < 10; i++) {
    a.step(input);
    b.step(altered);
  }
  assert.notDeepEqual(Array.from(a.activity), Array.from(b.activity));
  assert.notDeepEqual(
    CIRCUIT.outputs.map((i) => a.activity[i]),
    CIRCUIT.outputs.map((i) => b.activity[i]),
  );
  assert.deepEqual(a.step(input, true), Array(16).fill(0));
  assert.ok(a.activity.every((v) => v === 0));
});
test("every circuit edge points to real cells and output has a path from driven input", () => {
  assert.equal(new Set(CIRCUIT.nodes.map((n) => n.id)).size, 80);
  assert.equal(CIRCUIT.edges.length, 1296);
  assert.equal(
    CIRCUIT.edges.reduce((n, e) => n + e[2], 0),
    26029,
  );
  const reached = new Set(CIRCUIT.inputs.map(([i]) => i));
  for (let t = 0; t < 80; t++)
    for (const [a, b, w] of CIRCUIT.edges) {
      assert.ok(
        Number.isInteger(w) && w > 0 && a >= 0 && a < 80 && b >= 0 && b < 80,
      );
      if (reached.has(a) && CIRCUIT.nodes[a].sign) reached.add(b);
    }
  for (const i of CIRCUIT.outputs)
    assert.ok(reached.has(i), `unreachable ${i}`);
});
test("malformed and incompatible checkpoints are rejected", () => {
  assert.ok(validModel(model));
  for (const bad of [
    null,
    {},
    { ...model, version: "flyjump-v1" },
    { ...model, weights: [] },
    { ...model, weights: model.weights.map(() => NaN) },
  ])
    assert.equal(validModel(bad), false);
});
test("seeded learning changes the search distribution through actual rollouts", () => {
  const a = new Trainer(42),
    b = new Trainer(42),
    original = a.champion.weights.slice();
  assert.deepEqual(original, randomWeights(rng(42)));
  const first = a.step();
  assert.deepEqual(first, b.step());
  assert.equal(first.episodes, 196);
  assert.ok(a.mean.some((n) => n !== 0));
  assert.notDeepEqual(first.model.weights, original);
});
test("published benchmark reproduces exactly against the shipped graph, checkpoint and Chromium", () => {
  const saved = JSON.parse(
    readFileSync(
      new URL("../public/benchmarks/benchmark.json", import.meta.url),
      "utf8",
    ),
  );
  const actual = benchmark(model);
  assert.deepEqual(actual.results, saved.results);
  assert.ok(actual.results[0].meanScore > actual.results[1].meanScore * 10);
});
