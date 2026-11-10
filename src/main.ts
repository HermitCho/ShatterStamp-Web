import { Game, H, W } from "./game/game.ts";

/**
 * 진입점: 720x1280 논리 화면을 창에 맞춰 늘리고(비율 유지), 화면 밀도(devicePixelRatio)만큼 선명하게 그린다.
 * 디버그: ?autoplay=1 (봇 자동 플레이), ?time=5 (시작 시간 초)
 */
const canvas = document.getElementById("game") as HTMLCanvasElement;
const g = canvas.getContext("2d")!;
const params = new URLSearchParams(location.search);
const game = new Game({ autoplay: params.has("autoplay"), time: Number(params.get("time")) || undefined });

let scale = 1;
function resize(): void {
  const vw = window.innerWidth, vh = window.innerHeight;
  scale = Math.min(vw / W, vh / H);
  const cssW = Math.floor(W * scale), cssH = Math.floor(H * scale);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function toLogical(e: PointerEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  game.pointerDown(...toLogical(e), e.button);
  game.pointerMove(...toLogical(e), e.pointerType === "touch");
});
canvas.addEventListener("pointermove", (e) => game.pointerMove(...toLogical(e), e.pointerType === "touch"));
canvas.addEventListener("pointerup", (e) => game.pointerUp(...toLogical(e), e.pointerType === "touch"));
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.code === "Space") e.preventDefault();
  game.key(e.code);
});

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  game.draw(g);
  requestAnimationFrame(frame);
}
// 글꼴을 다 받은 뒤 시작해야 첫 화면 글자가 대체 글꼴로 깜빡이지 않는다.
document.fonts.load('700 20px "GameFont"').finally(() => requestAnimationFrame(frame));
