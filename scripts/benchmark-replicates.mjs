import { readFileSync, writeFileSync } from "node:fs";
import { benchmark } from "../src/lib/benchmark.ts";
const seeds = [20260912, 20260913, 20260914];
const results = seeds.map((seed) => {
  const path =
    seed === seeds[0]
      ? "public/benchmarks"
      : `public/benchmarks/replicates/${seed}`;
  const model = JSON.parse(readFileSync(`${path}/model.json`));
  const result = benchmark(model);
  if (seed !== seeds[0])
    writeFileSync(`${path}/benchmark.json`, JSON.stringify(result, null, 2));
  const neural = result.results[0];
  return {
    seed,
    generation: model.generation,
    validation: model.validation,
    survived: neural.survived,
    meanSeconds: neural.meanSeconds,
    meanScore: neural.meanScore,
  };
});
writeFileSync(
  "public/benchmarks/replicates.json",
  JSON.stringify(
    {
      note: "Same protocol and predeclared seeds. Published checkpoint is the first seed, not selected using test performance. Test courses overlap across replicas; these are 3 training runs, not 300 independent test courses.",
      results,
    },
    null,
    2,
  ),
);
console.table(results);
