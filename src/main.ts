import { Game, H, W } from "./game/game.ts";

/**
 * 진입점: 720x1280 논리 화면을 창에 맞춰 늘리고(비율 유지), 화면 밀도(devicePixelRatio)만큼 선명하게 그린다.
 * 디버그: ?autoplay=1 (봇 자동 플레이), ?time=5 (시작 시간 초), ?debug=1 (자동 확인 스크립트용으로 window.__game 공개, 랭킹 등록 안 함), ?rankmock=1|in (가짜 랭킹 서버)
 */
const canvas = document.getElementById("game") as HTMLCanvasElement;
const g = canvas.getContext("2d")!;
const params = new URLSearchParams(location.search);
const game = new Game({ autoplay: params.has("autoplay"), time: Number(params.get("time")) || undefined });
// 디버그 주소일 때만 콘솔/자동 확인 스크립트에서 게임을 만질 수 있게 연다.
if (params.has("autoplay") || params.has("debug") || params.has("rankmock")) (window as unknown as { __game: Game }).__game = game;

let scale = 1;
function resize(): void {
  const vw = window.innerWidth, vh = window.innerHeight;
  const inset = vw >= 900 && vh >= 600 ? 48 : 0;
  scale = Math.min((vw - inset) / W, (vh - inset) / H);
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
// 게임 화면 바깥(PC 양옆 배경)을 눌러도 첫 입력으로 쳐서 소리를 열고 대기 화면을 넘긴다.
window.addEventListener("pointerdown", (e) => {
  if (e.target !== canvas) game.wake();
});
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  // 닉네임 입력칸에 글자를 칠 때는 게임 조작으로 받지 않는다
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === "Space") e.preventDefault();
  // The title (including its first-input gate) and ranking own Tab navigation.
  // Do not also focus a legal link and activate it with the menu's next Enter.
  const titleInput = game.state === "title" && (!game.menus.isOpen || game.menus.current === "title");
  if (e.code === "Tab" && (titleInput || game.menus.current === "ranking")) e.preventDefault();
  // Opening the nickname input must not also submit that newly focused form.
  if (titleInput && (e.code === "Enter" || e.code === "NumpadEnter")) e.preventDefault();
  game.key(e.code);
});

// 2) 탭·앱을 벗어나면 판을 멈추고 소리를 끈다
document.addEventListener("visibilitychange", () => game.setHidden(document.hidden));

let last = performance.now();
let inGame = false;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  // 1) 개인정보처리방침·이용약관 링크는 타이틀에서만 보인다(플레이 중 잘못 눌러 판이 날아가지 않게)
  const ig = game.state !== "title";
  if (ig !== inGame) document.body.classList.toggle("ingame", (inGame = ig));
  game.draw(g);
  requestAnimationFrame(frame);
}
// 글꼴을 다 받은 뒤 시작해야 첫 화면 글자가 대체 글꼴로 깜빡이지 않는다.
document.fonts.load('700 20px "GameFont"').finally(() => requestAnimationFrame(frame));
