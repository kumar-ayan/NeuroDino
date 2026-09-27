import { episode, rng, randomWeights, type Episode } from "./training.ts";
import { type Model, NETWORK } from "./policy.ts";
export const BENCHMARK = {
  seconds: 180,
  seeds: Array.from({ length: 100 }, (_, i) => 2100001 + i),
};
export function summarize(runs: Episode[]) {
  const sorted = runs.map((r) => r.seconds).sort((a, b) => a - b);
  return {
    courses: runs.length,
    survived: runs.filter((r) => !r.dead).length,
    meanSeconds: runs.reduce((n, r) => n + r.seconds, 0) / runs.length,
    medianSeconds: sorted[Math.floor(sorted.length / 2)],
    meanScore: runs.reduce((n, r) => n + r.score, 0) / runs.length,
  };
}
export function benchmark(model: Model) {
  const policies = [
    ["connectome + trained readout", model.weights, "idle"],
    ["silenced connectome", model.weights, "ablated"],
    ["untrained readout", randomWeights(rng(model.trainingSeed)), "idle"],
    ["rule", null, "rule"],
    ["random", null, "random"],
    ["idle", null, "idle"],
  ] as const;
  return {
    model,
    environment: NETWORK.version,
    modelGeneration: model.generation,
    trainingSeed: model.trainingSeed,
    config: BENCHMARK,
    results: policies.map(([name, weights, baseline]) => {
      const runs = BENCHMARK.seeds.map((seed) =>
        episode(weights, seed, BENCHMARK.seconds, baseline),
      );
      return { name, ...summarize(runs), runs };
    }),
  };
}
export type Benchmark = ReturnType<typeof benchmark>;
