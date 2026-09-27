import { useCallback, useEffect, useRef, useState } from "react";
import { Runner, type Telemetry } from "./components/Runner";
import { BrainScene } from "./components/BrainScene";
import { FlyScene } from "./components/FlyScene";
import { PolicyNetwork } from "./components/PolicyNetwork";
import { validModel, type Model, type Decision } from "./lib/policy";

const initial: Telemetry = {
  score: 0,
  best: 0,
  jumps: 0,
  speed: 360,
  round: 1,
  dead: false,
  press: false,
  duck: false,
  ducks: 0,
  fastFall: false,
};

const SAVE_KEY = "neurodino-policy-v2";

export function App() {
  const [playing, setPlaying] = useState(true),
    [mode, setMode] = useState<"neural" | "rule" | "manual">("neural"),
    [reset, setReset] = useState(0),
    [telemetry, setTelemetry] = useState(initial);
  const [model, setModel] = useState<Model | null>(null),
    [decision, setDecision] = useState<Decision | null>(null);
  const controls = useRef({ left: 0, right: 0 });

  const setModelSafe = (m: Model) => {
    setModel(m);
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(m));
    } catch {
      /* Storage may be full or disabled; the run continues without caching. */
    }
  };

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const cached = localStorage.getItem(SAVE_KEY);
        if (cached) {
          const m: unknown = JSON.parse(cached);
          if (validModel(m)) {
            if (!disposed) {
              setModel(m);
              setPlaying(true);
            }
            return;
          }
        }
      } catch {}
      try {
        const response = await fetch("/benchmarks/model.json");
        if (!response.ok) throw new Error("Checkpoint unavailable");
        const m: unknown = await response.json();
        if (!validModel(m)) throw new Error("Invalid checkpoint");
        if (!disposed) {
          setModel(m);
          setPlaying(true);
        }
      } catch {
        /* The dino keeps running on the rule/manual fallback until a
           checkpoint appears at /benchmarks/model.json. */
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, []);

  const manual = useCallback(() => setMode("manual"), []);

  return (
    <>
      <header className="masthead">
        <div className="header-inner">
          <a className="brand" href="#top">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-word">
              <b>Neuro</b>Dino
            </span>
          </a>
          <div className="controls">
            <label className="controller-select">
              Controller{" "}
              <select
                aria-label="Controller"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as typeof mode);
                  setReset((x) => x + 1);
                  setDecision(null);
                }}
              >
                <option value="neural">Trained agent</option>
                <option value="rule">Rule baseline</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <button onClick={() => setReset((x) => x + 1)}>Restart</button>
            <button onClick={() => setPlaying(!playing)}>
              {playing ? "Pause" : "Play"}
            </button>
          </div>
        </div>
      </header>
      <main id="top" className="bare">
        <div className="workbench">
          <section className="panel network-panel">
            <h2>
              <span>Decision network</span>
              <small>
                {mode === "neural"
                  ? model
                    ? `generation ${model.generation}`
                    : "loading checkpoint…"
                  : "idle"}
              </small>
            </h2>
            <PolicyNetwork
              decision={decision}
              model={model}
              active={mode === "neural" && !!decision}
            />
          </section>
          <section className="panel fly-panel">
            <h2>
              <span>Keyboard output</span>
            </h2>
            <FlyScene controls={controls} />
          </section>
          <section className="panel brain-panel">
            <h2>
              <span>Brain activity</span>
            </h2>
            <BrainScene
              activity={decision?.activity}
              active={mode === "neural" && !!decision}
            />
          </section>
        </div>
        <section className="panel game-panel">
          <Runner
            playing={playing && (mode !== "neural" || !!model)}
            auto={mode === "rule"}
            model={mode === "neural" ? model : null}
            reset={reset}
            controls={controls}
            onTelemetry={setTelemetry}
            onDecision={setDecision}
            onManual={manual}
          />
          <div className="metrics" aria-live="off">
            <div>
              <span>SCORE</span>
              <strong>{String(telemetry.score).padStart(5, "0")}</strong>
            </div>
            <div>
              <span>BEST</span>
              <strong>{String(telemetry.best).padStart(5, "0")}</strong>
            </div>
            <div>
              <span>JUMPS</span>
              <strong>{telemetry.jumps}</strong>
            </div>
            <div>
              <span>DUCKS</span>
              <strong>{telemetry.ducks}</strong>
            </div>
            <div>
              <span>SPEED</span>
              <strong>
                {Math.round(telemetry.speed)}
                <small> px/s</small>
              </strong>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
