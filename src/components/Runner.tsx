import { useEffect, useRef, useState, type RefObject } from "react";
import { createRunner, tickRunner, RUNNER, score } from "../lib/runner";
import {
  decide,
  actionInput,
  NETWORK,
  type Model,
  type Decision,
} from "../lib/policy";
import { Connectome } from "../lib/connectome";
export type Telemetry = {
  score: number;
  best: number;
  jumps: number;
  speed: number;
  round: number;
  dead: boolean;
  press: boolean;
  duck: boolean;
  ducks: number;
  fastFall: boolean;
};
export function Runner({
  playing,
  auto,
  model,
  reset,
  controls,
  onTelemetry,
  onDecision,
  onManual,
}: {
  playing: boolean;
  auto: boolean;
  model: Model | null;
  reset: number;
  onDecision: (d: Decision | null) => void;
  onManual: () => void;
  controls: RefObject<{ left: number; right: number }>;
  onTelemetry: (t: Telemetry) => void;
}) {
  const restartCurrent = useRef<() => void>(() => {});
  const input = useRef({ jump: false, duck: false, pendingJump: false }),
    canvas = useRef<HTMLCanvasElement>(null),
    options = useRef({ playing, auto, model });
  options.current = { playing, auto, model };
  const best = useRef(0),
    round = useRef(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const el = canvas.current!,
      ctx = el.getContext("2d")!,
      sprite = new Image();
    const surface = document.createElement("canvas");
    surface.width = 1200;
    surface.height = 300;
    surface.getContext("2d")!.scale(2, 2);
    let disposed = false,
      frame = 0;
    const clear = () => {
      input.current = { jump: false, duck: false, pendingJump: false };
    };
    clear();
    let restart = () => {};
    const press = (key: "jump" | "duck") => {
      if (!options.current.playing) return;
      onManual();
      input.current[key] = true;
      if (key === "jump") input.current.pendingJump = true;
      restart();
    };
    const keyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest(
          'button,input,textarea,select,a,[contenteditable="true"]',
        )
      )
        return;
      if (["Space", "ArrowUp", "ArrowDown", "KeyS"].includes(e.code)) {
        e.preventDefault();
        if (!e.repeat)
          press(e.code === "ArrowDown" || e.code === "KeyS" ? "duck" : "jump");
      }
    };
    const keyUp = (e: KeyboardEvent) => {
      if (["Space", "ArrowUp"].includes(e.code)) input.current.jump = false;
      if (["ArrowDown", "KeyS"].includes(e.code)) input.current.duck = false;
    };
    const visibility = () => {
      if (document.hidden) clear();
    };
    const tap = (e: PointerEvent) => {
      if (e.button !== 0) return;
      el.focus({ preventScroll: true });
      el.setPointerCapture(e.pointerId);
      press("jump");
    };
    const release = () => {
      input.current.jump = false;
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", visibility);
    el.addEventListener("pointerdown", tap);
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("lostpointercapture", release);
    sprite.onload = () => {
      if (disposed) return;
      setError("");
      let state = createRunner(++round.current, surface, sprite),
        brain = new Connectome(),
        previous = performance.now(),
        acc = 0,
        ended = 0,
        lastReport = 0,
        steps = 0,
        decision: Decision | null = null;
      const newRun = () => {
        state = createRunner(++round.current, surface, sprite);
        brain = new Connectome();
        ended = 0;
        acc = 0;
        steps = 0;
        decision = null;
      };
      restart = () => {
        if (state.dead) newRun();
      };
      restartCurrent.current = restart;
      const animate = (now: number) => {
        const dt = Math.min(0.1, (now - previous) / 1000);
        previous = now;
        if (options.current.playing && !document.hidden) {
          if (state.dead) {
            ended += dt;
            if (ended > 1.4 && (options.current.model || options.current.auto))
              newRun();
          } else {
            acc += dt;
            while (acc >= RUNNER.step && !state.dead) {
              if (steps % NETWORK.decisionSteps === 0 && options.current.model)
                decision = decide(options.current.model.weights, state, brain);
              if (!options.current.model) decision = null;
              tickRunner(
                state,
                options.current.auto,
                decision
                  ? actionInput(decision.action)
                  : {
                      jump: input.current.jump || input.current.pendingJump,
                      duck: input.current.duck,
                    },
              );
              if (!options.current.model && !options.current.auto)
                input.current.pendingJump = false;
              steps++;
              acc -= RUNNER.step;
            }
          }
        } else {
          acc = 0;
          clear();
        }
        controls.current.left = !state.dead && state.action.jump ? 1 : 0;
        controls.current.right = !state.dead && state.action.duck ? 1 : 0;
        best.current = Math.max(best.current, score(state));
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, 1200, 300);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(surface, 0, 0);
        el.style.filter = state.inverted ? "invert(1)" : "none";
        Object.assign(el.dataset, {
          time: state.time.toFixed(3),
          jumps: String(state.jumps),
          score: String(score(state)),
          dead: String(state.dead),
          duck: String(state.duck),
          fastFall: String(state.fastFall),
          ducks: String(state.ducks),
          height: state.y.toFixed(2),
          action: decision ? String(decision.action) : "none",
          controller: options.current.model
            ? "neural"
            : options.current.auto
              ? "rule"
              : "manual",
        });
        if (now - lastReport > 66) {
          lastReport = now;
          onDecision(
            decision
              ? { ...decision, activity: Array.from(brain.activity) }
              : null,
          );
          onTelemetry({
            score: score(state),
            best: best.current,
            jumps: state.jumps,
            speed: state.speed,
            round: round.current,
            dead: state.dead,
            press: !!controls.current.left,
            duck: state.duck,
            ducks: state.ducks,
            fastFall: state.fastFall,
          });
        }
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
    };
    sprite.onerror = () => {
      if (!disposed)
        setError("Original game sprite could not load. Reload to retry.");
    };
    sprite.src = "/vendor/chromium/200-offline-sprite.png";
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
      el.removeEventListener("pointerdown", tap);
      el.removeEventListener("pointerup", release);
      el.removeEventListener("pointercancel", release);
      el.removeEventListener("lostpointercapture", release);
      clear();
      controls.current.left = 0;
      controls.current.right = 0;
    };
  }, [reset, controls, onTelemetry, onDecision, onManual]);
  const button = (key: "jump" | "duck", label: string) => (
    <button
      disabled={!playing}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onManual();
        input.current[key] = true;
        if (key === "jump") input.current.pendingJump = true;
        restartCurrent.current();
      }}
      onPointerUp={() => {
        input.current[key] = false;
      }}
      onPointerCancel={() => {
        input.current[key] = false;
      }}
      onLostPointerCapture={() => {
        input.current[key] = false;
      }}
      onBlur={() => {
        input.current[key] = false;
      }}
      onKeyDown={(e) => {
        if ((e.code === "Space" || e.code === "Enter") && !e.repeat) {
          e.preventDefault();
          onManual();
          input.current[key] = true;
          if (key === "jump") input.current.pendingJump = true;
          restartCurrent.current();
        }
      }}
      onKeyUp={(e) => {
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          input.current[key] = false;
        }
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="game-stage">
      <canvas
        width="1200"
        height="300"
        ref={canvas}
        tabIndex={0}
        className="runner-canvas"
        role="img"
        aria-label="Original Chromium Dino. Space or Up to jump, Down or S to duck or drop."
      />
      {error && <p role="alert">{error}</p>}
      <div className="runner-inputs" hidden>
        {button("jump", "↑ Jump")}
        {button("duck", "↓ Hold to duck")}
      </div>
    </div>
  );
}
