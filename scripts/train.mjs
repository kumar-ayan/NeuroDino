import { writeFileSync, mkdirSync } from "node:fs";
import { Trainer, TRAINING } from "../src/lib/training.ts";
const seed = Number(process.argv[2] ?? 20260912),
  generations = Number(process.argv[3] ?? TRAINING.generations);
const output = process.argv[4] ?? "public/benchmarks";
mkdirSync(output, { recursive: true });
const trainer = new Trainer(seed),
  start = performance.now();
for (let i = 0; i < generations; i++) {
  const p = trainer.step();
  console.log(
    `generation=${p.generation} train=${p.bestFitness.toFixed(1)} validation=${p.validation.toFixed(1)} episodes=${p.episodes}`,
  );
}
writeFileSync(`${output}/model.json`, JSON.stringify(trainer.champion));
writeFileSync(
  `${output}/training.json`,
  JSON.stringify(
    {
      algorithm: "CEM neuroevolution",
      seed,
      config: { ...TRAINING, generations },
      wallSeconds: (performance.now() - start) / 1000,
      history: trainer.history,
    },
    null,
    2,
  ),
);
