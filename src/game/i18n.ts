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
  SUBTITLE: ["같은 색이 이어진 가장 큰 영역을 부숴라.", "Shatter the largest connected color area."],
  TIME_UP: ["시간 종료!", "TIME UP!"],
  NEW_BEST: ["최고 기록 달성!", "NEW BEST!"],
  R_MAX_COMBO: ["최대 콤보", "MAX COMBO"],
  R_TIME: ["얻은 시간", "TIME EARNED"],
  R_BIGGEST: ["최대 파괴", "BIGGEST BREAK"],
  // 메뉴
  START: ["시작", "START"],
  HOW_TO_PLAY: ["게임 방법", "HOW TO PLAY"],
  SETTINGS: ["설정", "SETTINGS"],
  BACK: ["뒤로", "BACK"],
  PAUSED: ["일시정지", "PAUSED"],
  RESUME: ["계속하기", "RESUME"],
  RESTART: ["다시 시작", "RESTART"],
  TITLE: ["타이틀로", "TITLE"],
  RETRY: ["다시 하기", "RETRY"],
  SOUND_FMT: ["효과음  %d%", "SOUND  %d%"],
  MUSIC_FMT: ["음악  %d%", "MUSIC  %d%"],
  SHAKE_FMT: ["화면 흔들림: %s", "SCREEN SHAKE: %s"],
  ON: ["켜짐", "ON"],
  OFF: ["꺼짐", "OFF"],
  LANGUAGE_FMT: ["언어: %s", "LANGUAGE: %s"],
  LANG_NAME: ["한국어", "English"],
  TUTORIAL_BTN: ["튜토리얼", "TUTORIAL"],
  COUNT_FMT: ["%d개", "%d"],
  // 튜토리얼(첫 판)
  TUT_1: ["NOW 모양을 보드에 찍어 보세요.\n같은 색 덩어리는 한 칸만 걸쳐도 다 터져요!", "Stamp the NOW shape on the board.\nTouch one block of a color group - the whole group breaks!"],
  TUT_2: ["마우스를 움직여 금색 PERFECT가 뜨는 자리를\n찾아 찍으세요. 빨간 MISS는 시간 -1초!", "Move around to find a spot showing a gold PERFECT,\nthen stamp. A red MISS costs 1 second!"],
  TUT_3: ["연달아 찍으면 COMBO가 쌓여요.\n콤보 막대가 사라지기 전에 한 번 더!", "Stamp again quickly to build a COMBO.\nOne more before the bar runs out!"],
  TUT_4: ["오른쪽 HOLD 칸에 모양을 맡겨 둘 수 있어요.\n스페이스 / 우클릭 / HOLD 칸 터치", "Save a shape for later with HOLD.\nSpace / right-click / tap HOLD"],
  TUT_5: ["준비 완료!\n60초 동안 최고 점수에 도전하세요.", "Ready!\nGo for a high score in 60 seconds."],
  TUT_SKIP: ["건너뛰기", "SKIP"],
  TUT_WRONG: ["금색 PERFECT 자리에 찍어 보세요!", "Stamp where it shows a gold PERFECT!"],
  // 게임 방법 카드
  HOWTO_C1_T: ["찍으면 번져요", "Stamp & spread"],
  HOWTO_C1_B: ["찍은 블록과 같은 색으로\n이어진 블록이 모두 터져요.\n한 칸만 걸쳐도 덩어리째!", "Every block linked to the\nstamped ones by the same\ncolor breaks. One touch = all!"],
  HOWTO_C2_T: ["판정 색을 보세요", "Watch the color"],
  HOWTO_C2_B: ["마우스를 올리면 미리 보여요.\n금색 PERFECT가 최고 자리.\n빨간 MISS는 -1초, 콤보 끊김.", "Hover to preview the grade.\nGold PERFECT = best spot.\nRed MISS: -1s, combo lost."],
  HOWTO_C3_T: ["콤보와 시간", "Combo & time"],
  HOWTO_C3_B: ["막대가 남았을 때 또 찍으면\n콤보! 10콤보 = FEVER x3.\n목표 점수를 넘기면 +1초.", "Stamp before the bar ends\nfor a COMBO. 10 = FEVER x3.\nBeat the target score: +1s."],
  HOWTO_KEYS: ["홀드: 우클릭 / 스페이스     일시정지: ESC", "HOLD: right-click / Space     PAUSE: ESC"],
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
