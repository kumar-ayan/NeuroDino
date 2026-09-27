import graph from "../data/connectome.json" with { type: "json" };
export const CIRCUIT = graph;
export const DYNAMICS = { iterations: 3, leak: 0.7, gain: 1.4, outputGain: 4 };
const count = graph.nodes.length;
const totals = new Float64Array(count);
for (const [pre, post, contacts] of graph.edges)
  totals[post] += contacts * Math.abs(graph.nodes[pre].sign);
const edges = graph.edges.map(([pre, post, contacts]) => [
  pre,
  post,
  totals[post] ? (contacts * graph.nodes[pre].sign) / totals[post] : 0,
]);
/** Signed, leaky tanh activity, not membrane voltage or measured firing rates. */
export class Connectome {
  activity = new Float64Array(count);
  scratch = new Float64Array(count);
  drive = new Float64Array(count);
  step(inputs: number[], ablated = false): number[] {
    if (ablated) {
      this.activity.fill(0);
      return graph.outputs.map(() => 0);
    }
    this.drive.fill(0);
    for (const [cell, channel] of graph.inputs)
      this.drive[cell] = 2 * (inputs[channel] - 0.5);
    for (let t = 0; t < DYNAMICS.iterations; t++) {
      this.scratch.set(this.drive);
      for (let e = 0; e < edges.length; e++) {
        const [pre, post, w] = edges[e];
        this.scratch[post] += DYNAMICS.gain * w * this.activity[pre];
      }
      for (let i = 0; i < count; i++)
        this.activity[i] =
          (1 - DYNAMICS.leak) * this.activity[i] +
          DYNAMICS.leak * Math.tanh(this.scratch[i]);
    }
    return graph.outputs.map((i) => this.activity[i] * DYNAMICS.outputGain);
  }
}
