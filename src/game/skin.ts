/** 네온 아케이드 테마 색. Godot 버전의 GameSkin "neon"과 같은 값. */
export const SKIN = {
  bg: "#090715",
  bgFever: "#150b24",
  text: "#f0f3ff",
  muted: "#a5a4be",
  score: "#ff6be0",
  scoreGlow: "rgba(255,51,191,0.55)",
  timeText: "#ffdb4d",
  timeGlow: "rgba(255,179,38,0.55)",
  accent: "#40f2ff",
  onAccent: "#050d1a",
  button: "#171329",
  buttonBorder: "#453654",
  blocks: ["#ff3b80", "#ffc733", "#4dff8c", "#40d9ff", "#b866ff"],
  boardBg: "#0d0a1a",
  boardBorder: "rgba(64,217,255,0.45)",
  slot: "rgba(64,217,255,0.05)",
  panel: "#121022",
  panelHi: "#1c1631",
  panelBorder: "#35304c",
  panelBorderHi: "#ff40d9",
  piece: "#40f2ff",
  pieceDim: "rgba(64,242,255,0.25)",
  dim: "rgba(0,0,5,0.5)",
  track: "rgba(64,217,255,0.1)",
  time: "#40f2ff",
  warn: "#ff3333",
  ring: "rgba(64,242,255,0.95)",
  /** 콤보 단계 색: 1~2 / 3~5 / 6~9 / 10+(피버) */
  tiers: ["#ebfaff", "#40f2ff", "#ffc733", "#ff40d9"],
  /** 판정 색: 금 PERFECT / 하늘 GREAT / 초록 GOOD / 빨강 MISS (미리보기와 판정 글자가 같은 색) */
  grades: ["#ffd633", "#40f2ff", "#4dff8c", "#ff3333"],
};

export const FONT = '"GameFont", "Noto Sans KR", "Malgun Gothic", sans-serif';

export function font(size: number, weight = 700): string {
  return `${weight} ${size}px ${FONT}`;
}

/** "#rrggbb" → rgba 문자열 */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 두 "#rrggbb" 색을 섞는다(t=0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}
