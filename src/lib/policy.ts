import { RUNNER, type State, type Input } from "./runner.ts";
import { CIRCUIT, Connectome } from "./connectome.ts";
export const OBSERVATION_LABELS = [
  "Proximity",
  "Width",
  "Height",
  "Altitude",
  "Speed",
  "Player Y",
  "Velocity",
  "Grounded",
];
export const INPUT_LABELS = CIRCUIT.outputs.map(
  (i) => CIRCUIT.nodes[i].type ?? String(CIRCUIT.nodes[i].id),
);
export const ACTIONS = ["Run", "Jump", "Duck"] as const;
export const NETWORK = {
  inputs: 16,
  hidden: 12,
  outputs: 3,
  parameters: 243,
  decisionSteps: 2,
  version: "flydino-chromium98-connectome-v2",
} as const;
export type Model = {
  version: typeof NETWORK.version;
  weights: number[];
  generation: number;
  trainingSeed: number;
  validation: number;
};
export type Decision = {
  inputs: number[];
  hidden: number[];
  scores: number[];
  action: number;
  observations?: number[];
  activity?: number[];
};
/** CodeBullet-inspired structured observations; engineered state access, not pixels. */
export function observation(s: State): number[] {
  const o = s.obstacles.find((o) => o.x + o.width > RUNNER.x);
  return [
    o ? 1 - Math.max(0, Math.min(1, (o.x - RUNNER.x) / 600)) : 0,
    o ? o.width / 75 : 0,
    o ? o.height / 60 : 0,
    o ? o.bottom / 60 : 0,
    s.speed / 780,
    s.y / 100,
    (s.vy / 900 + 1) / 2,
    s.y === 0 ? 1 : 0,
  ];
}
export function forward(weights: number[], inputs: number[]): Decision {
  const hidden = new Array<number>(12),
    scores = new Array<number>(3);
  let k = 0;
  for (let h = 0; h < 12; h++) {
    let z = 0;
    for (let i = 0; i < NETWORK.inputs; i++) z += weights[k++] * inputs[i];
    hidden[h] = Math.tanh(z + weights[k++]);
  }
  for (let a = 0; a < 3; a++) {
    let z = 0;
    for (let h = 0; h < 12; h++) z += weights[k++] * hidden[h];
    scores[a] = z + weights[k++];
  }
  let action = 0;
  for (let a = 1; a < 3; a++) if (scores[a] > scores[action]) action = a;
  return { inputs, hidden, scores, action };
}
export function decide(
  weights: number[],
  s: State,
  brain: Connectome,
  ablated = false,
): Decision {
  const observations = observation(s),
    inputs = brain.step(observations, ablated);
  return { ...forward(weights, inputs), observations };
}
export const actionInput = (action: number): Input => ({
  jump: action === 1,
  duck: action === 2,
});
export function validModel(value: unknown): value is Model {
  if (!value || typeof value !== "object") return false;
  const m = value as Model;
  return (
    m.version === NETWORK.version &&
    Array.isArray(m.weights) &&
    m.weights.length === NETWORK.parameters &&
    m.weights.every((n) => Number.isFinite(n) && Math.abs(n) < 1e4) &&
    Number.isInteger(m.generation) &&
    m.generation >= 0 &&
    Number.isInteger(m.trainingSeed) &&
    Number.isFinite(m.validation)
  );
}
