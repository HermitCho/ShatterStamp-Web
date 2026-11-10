/** 한국어(기본) / 영어 문구. PERFECT·COMBO 같은 게임 용어는 두 언어 모두 영어로 둔다. */
const TEXT = {
  SCORE: ["점수", "SCORE"],
  TIME: ["시간", "TIME"],
  BEST_FMT: ["최고 %d", "BEST %d"],
  TARGET_FMT: ["%d점 이상 +1초", "+1s AT %d PTS"],
  HOLD: ["홀드", "HOLD"],
  HOLD_HINT: ["스페이스 / 우클릭", "Space / right-click"],
  NOW: ["지금", "NOW"],
  NEXT: ["다음", "NEXT"],
  FOOTER: ["홀드: 스페이스 / Shift / C / 우클릭     일시정지: ESC", "HOLD: Space / Shift / C / right-click     PAUSE: ESC"],
  GRADE_SUB: ["%d개 / 최고 %d개", "%d of best %d"],
  SEC_FMT: ["+%d초", "+%ds"],
  TAP_START: ["터치해서 시작", "TAP TO START"],
  TAP_RETRY: ["터치해서 다시 하기", "TAP TO RETRY"],
  SUBTITLE: ["같은 색이 이어진 가장 큰 영역을 부숴라.", "Shatter the largest connected color area."],
  TIME_UP: ["시간 종료!", "TIME UP!"],
  NEW_BEST: ["최고 기록 달성!", "NEW BEST!"],
  R_MAX_COMBO: ["최대 콤보", "MAX COMBO"],
  R_TIME: ["얻은 시간", "TIME EARNED"],
  R_BIGGEST: ["최대 파괴", "BIGGEST BREAK"],
} as const;

export type TextKey = keyof typeof TEXT;

let lang = 0;
try {
  lang = localStorage.getItem("ss.lang") === "en" ? 1 : 0;
} catch {
  /* 저장소를 못 쓰는 환경에서도 기본값으로 동작 */
}

export function t(key: TextKey, ...args: (number | string)[]): string {
  let s: string = TEXT[key][lang];
  for (const a of args) s = s.replace(/%d|%s/, String(a));
  return s;
}

export function setLang(code: "ko" | "en"): void {
  lang = code === "en" ? 1 : 0;
  try {
    localStorage.setItem("ss.lang", code);
  } catch {
    /* 무시 */
  }
}

export function getLang(): "ko" | "en" {
  return lang === 1 ? "en" : "ko";
}
