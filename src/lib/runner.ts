import { createChromium } from "./chromium-engine.js";
export const RUNNER = {
  width: 600,
  height: 150,
  ground: 140,
  x: 50,
  step: 1 / 60,
};
export type Input = { jump?: boolean; duck?: boolean; releaseJump?: boolean };
export type Obstacle = {
  x: number;
  width: number;
  height: number;
  bottom: number;
  kind: "cactus" | "bird";
};
export type State = {
  time: number;
  distance: number;
  speed: number;
  y: number;
  vy: number;
  obstacles: Obstacle[];
  seed: number;
  dead: boolean;
  jumps: number;
  ducks: number;
  duck: boolean;
  fastFall: boolean;
  press: number;
  action: Input;
  engine: any;
  core: ReturnType<typeof createChromium>;
  canvas: HTMLCanvasElement | null;
  clock: number;
  inverted: boolean;
};
const noop = () => {};
export function createRunner(
  seed = 1,
  canvas: HTMLCanvasElement | null = null,
  sprite: CanvasImageSource | null = null,
): State {
  let randomSeed = seed >>> 0;
  const s = {
    seed,
    time: 0,
    distance: 0,
    speed: 360,
    y: 0,
    vy: 0,
    obstacles: [],
    dead: false,
    jumps: 0,
    ducks: 0,
    duck: false,
    fastFall: false,
    press: 0,
    action: {},
    canvas,
    clock: 1,
    inverted: false,
  } as unknown as State;
  const core = createChromium({
    now: () => s.clock,
    random: () => {
      randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0;
      return randomSeed / 4294967296;
    },
  });
  s.core = core;
  const { Runner, Trex, Horizon, DistanceMeter, GameOverPanel } = core;
  Runner.config = { ...Runner.config, ...Runner.normalConfig };
  Runner.spriteDefinition = Runner.spriteDefinitionByType.original;
  Runner.imageSprite = sprite;
  Runner.origImageSprite = sprite;
  Runner.slowDown = false;
  Runner.audioCues = false;
  const context = canvas?.getContext("2d") ?? {
    drawImage: noop,
    clearRect: noop,
    fillRect: noop,
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    globalAlpha: 1,
  };
  const surface = canvas ?? {
    width: 600,
    height: 150,
    getContext: () => context,
  };
  const spriteDef = Runner.spriteDefinition.HDPI;
  const r = Object.assign(Object.create(Runner.prototype), {
    canvas: surface,
    canvasCtx: context,
    config: Runner.config,
    dimensions: { WIDTH: 600, HEIGHT: 150 },
    spriteDef,
    msPerFrame: 1000 / 60,
    time: 1,
    currentSpeed: 6,
    runningTime: 0,
    distanceRan: 0,
    playing: true,
    crashed: false,
    activated: true,
    playingIntro: false,
    altGameModeActive: false,
    altGameModeFlashTimer: null,
    invertTimer: 0,
    invertTrigger: false,
    inverted: false,
    isDarkMode: false,
    soundFx: { SCORE: "score" },
    highestScore: 0,
  });
  s.engine = r;
  r.tRex = new Trex(surface, spriteDef.TREX);
  r.tRex.xPos = 50;
  r.tRex.xInitialPos = 50;
  r.tRex.update(0, Trex.status.RUNNING);
  r.horizon = new Horizon(
    surface,
    spriteDef,
    r.dimensions,
    r.config.GAP_COEFFICIENT,
  );
  r.distanceMeter = new DistanceMeter(surface, spriteDef.TEXT_SPRITE, 600);
  r.scheduleNextUpdate = noop;
  r.playIntro = noop;
  r.playSound = noop;
  r.invert = (reset: boolean) => {
    r.inverted = reset ? false : r.invertTrigger;
    if (reset) r.invertTimer = 0;
    s.inverted = r.inverted;
  };
  r.gameOver = () => {
    r.crashed = true;
    r.playing = false;
    r.tRex.update(0, Trex.status.CRASHED);
    const panel = new GameOverPanel(
      surface,
      spriteDef.TEXT_SPRITE,
      spriteDef.RESTART,
      r.dimensions,
    );
    panel.drawGameOverText(GameOverPanel.dimensions);
    if (sprite)
      context.drawImage(
        sprite,
        spriteDef.RESTART.x,
        spriteDef.RESTART.y,
        72,
        64,
        282,
        65,
        36,
        32,
      );
  };
  sync(s);
  return s;
}
function sync(s: State) {
  const r = s.engine,
    t = r.tRex;
  s.time = r.runningTime / 1000;
  s.distance = r.distanceRan;
  s.speed = r.currentSpeed * 60;
  s.y = t.groundYPos - t.yPos;
  s.vy = -t.jumpVelocity * 60;
  s.dead = r.crashed;
  s.duck = t.ducking;
  s.fastFall = t.speedDrop;
  s.press = s.action.jump ? 1 : 0;
  s.obstacles = obstacles(s);
}
export function obstacles(s: State): Obstacle[] {
  return s.engine.horizon.obstacles.map((o: any) => ({
    x: o.xPos,
    width: o.width,
    height: o.typeConfig.height,
    bottom: 140 - o.yPos - o.typeConfig.height,
    kind: o.typeConfig.type === "PTERODACTYL" ? "bird" : "cactus",
  }));
}
export const score = (s: State) =>
  s.engine.distanceMeter.getActualDistance(Math.ceil(s.distance));
/** Key transitions use Chromium's Trex methods. Holding jump never repeats keydown. */
export function applyInput(s: State, input: Input) {
  const t = s.engine.tRex,
    previous = s.action;
  const jump = !!input.jump && !input.duck,
    duck = !!input.duck;
  if ((!jump && previous.jump) || input.releaseJump) t.endJump();
  if (!duck && previous.duck) {
    t.speedDrop = false;
    t.setDuck(false);
  }
  if (duck && !previous.duck) {
    if (t.jumping) t.setSpeedDrop();
    else if (!t.ducking) {
      t.setDuck(true);
      s.ducks++;
    }
  }
  if (jump && !previous.jump && !t.jumping && !t.ducking) {
    t.startJump(s.engine.currentSpeed);
    s.jumps++;
  }
  s.action = { jump, duck };
}
export function autoInput(s: State): Input {
  const next = obstacles(s).find((o) => o.x + o.width > RUNNER.x);
  if (!next) return {};
  const distance = next.x - (RUNNER.x + 44);
  if (next.kind === "bird" && next.bottom >= 25)
    return { duck: next.bottom < 55 && distance < s.speed * 0.35 };
  return {
    jump:
      (!s.engine.tRex.jumping &&
        distance < s.speed * 0.2 + next.width * 0.1 &&
        next.x + next.width > RUNNER.x) ||
      (!!s.action.jump && s.engine.tRex.jumping),
  };
}
export function tickRunner(
  s: State,
  auto: boolean,
  input: Input = {},
  dt = RUNNER.step,
) {
  if (s.dead) return;
  if (Math.abs(dt - RUNNER.step) > 1e-9)
    throw new Error("Chromium benchmark uses a fixed 60 Hz clock");
  applyInput(s, auto ? autoInput(s) : input);
  s.clock += 1000 / 60;
  s.engine.update();
  sync(s);
}
