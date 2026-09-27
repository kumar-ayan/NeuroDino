import { useEffect, useRef, useState } from "react";
import {
  ACTIONS,
  INPUT_LABELS,
  NETWORK,
  type Decision,
  type Model,
} from "../lib/policy";
export function PolicyNetwork({
  decision,
  model,
  active,
}: {
  decision: Decision | null;
  model: Model | null;
  active: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const o = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 450));
    o.observe(host.current!);
    return () => o.disconnect();
  }, []);
  const ix = narrow ? 139 : 177,
    hx = narrow ? 214 : 314,
    ox = narrow ? 278 : 442,
    tx = narrow ? 294 : 462;
  const d = decision ?? {
    inputs: Array(NETWORK.inputs).fill(0),
    hidden: Array(12).fill(0),
    scores: [0, 0, 0],
    action: 0,
  };
  const inputY = (i: number) => (narrow ? 42 + i * 24 : 39 + i * 18),
    hiddenY = (i: number) => (narrow ? 56 + i * 30 : 49 + i * 23),
    outputY = (i: number) => (narrow ? 116 + i * 106 : 91 + i * 83);
  const color = (v: number) => (v >= 0 ? "#8fb89a" : "#d98d76");
  const dim = active ? 1 : 0.55;
  return (
    <div ref={host} className="policy-network">
      <svg
        viewBox={narrow ? "0 0 360 440" : "0 0 600 338"}
        role="img"
        aria-label="Actual trained readout: 16 descending-cell activities, 12 tanh neurons, 3 action scores."
      >
        <text x="16" y="17">
          CIRCUIT OUT
        </text>
        <text x={narrow ? 184 : 267} y="17">
          HIDDEN
        </text>
        <text x={narrow ? 294 : 458} y="17">
          ACTIONS
        </text>
        {model &&
          d.inputs.flatMap((v, i) =>
            d.hidden.map((_, h) => {
              const c = v * model.weights[h * 17 + i];
              return (
                <line
                  key={`i${i}-${h}`}
                  x1={ix}
                  y1={inputY(i)}
                  x2={hx}
                  y2={hiddenY(h)}
                  stroke={color(c)}
                  strokeOpacity={Math.min(0.6, 0.02 + Math.abs(c) * 0.12)}
                  strokeWidth=".7"
                />
              );
            }),
          )}
        {model &&
          d.hidden.flatMap((v, h) =>
            d.scores.map((_, a) => {
              const c = v * model.weights[204 + a * 13 + h];
              return (
                <line
                  key={`h${h}-${a}`}
                  x1={hx}
                  y1={hiddenY(h)}
                  x2={ox}
                  y2={outputY(a)}
                  stroke={color(c)}
                  strokeOpacity={Math.min(0.85, 0.05 + Math.abs(c) * 0.2)}
                  strokeWidth={active && a === d.action ? 1.8 : 0.6}
                />
              );
            }),
          )}
        {d.inputs.map((v, i) => (
          <g key={i}>
            <text x="16" y={inputY(i) + 4}>
              {INPUT_LABELS[i]}
            </text>
            <text x={narrow ? 123 : 159} y={inputY(i) + 4} textAnchor="end">
              {v.toFixed(2)}
            </text>
            <circle
              cx={ix}
              cy={inputY(i)}
              r="4"
              fill={color(v)}
              fillOpacity={0.2 + Math.min(1, Math.abs(v)) * 0.8}
            >
              <title>
                Descending neuron {i + 1}, readout input {v.toFixed(4)}
              </title>
            </circle>
          </g>
        ))}
        {d.hidden.map((v, h) => (
          <circle
            key={h}
            cx={hx}
            cy={hiddenY(h)}
            r="5"
            fill={color(v)}
            fillOpacity={0.15 + Math.abs(v) * 0.85}
          >
            <title>
              Learned hidden neuron {h + 1}: {v.toFixed(4)}
            </title>
          </circle>
        ))}
        {d.scores.map((v, a) => (
          <g key={a}>
            <circle
              cx={ox}
              cy={outputY(a)}
              r={active && a === d.action ? 9 : 6}
              fill={active && a === d.action ? "#f0a477" : "#ddd2c2"}
              opacity={dim}
            >
              <title>{ACTIONS[a]} score {v.toFixed(4)}</title>
            </circle>
            <text x={tx} y={outputY(a) - 4} opacity={dim}>
              {ACTIONS[a].toUpperCase()} {active && a === d.action ? "◀" : ""}
            </text>
            <text x={tx} y={outputY(a) + 15} opacity={dim}>
              {v.toFixed(3)}
            </text>
          </g>
        ))}
      </svg>
      <div className="policy-caption">
        {!model
          ? "Loading trained weights…"
          : !active
            ? "Readout inactive"
            : `${ACTIONS[d.action]} selected · generation ${model.generation}`}
        <span>16 → 12 → 3</span>
      </div>
    </div>
  );
}
