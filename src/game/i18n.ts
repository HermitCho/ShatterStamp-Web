/** 한국어(기본) / 영어 문구. PERFECT·COMBO 같은 게임 용어는 두 언어 모두 영어로 둔다. */
const TEXT = {
  SCORE: ["점수", "SCORE"],
  TIME: ["시간", "TIME"],
  BEST_FMT: ["최고 %d", "BEST %d"],
  TARGET_FMT: ["%d점 이상 +1초", "+1s AT %d PTS"],
  HOLD: ["홀드", "HOLD"],
  HOLD_HINT: ["탭하여\n보관", "Tap to\nhold"],
  NOW: ["지금", "NOW"],
  NEXT: ["다음", "NEXT"],
  FOOTER: ["홀드  Space · Shift · C · 우클릭", "HOLD  Space · Shift · C · right-click"],
  FOOTER_PAUSE: ["일시정지  Esc", "PAUSE  Esc"],
  TOUCH_HINT: ["보드를 눌러 조준 · 손을 떼어 찍기", "Touch to aim · release to stamp"],
  TOUCH_HOLD: ["홀드 칸을 눌러 모양 보관", "Tap HOLD to save a shape"],
  GRADE_SUB: ["%d개 / 최고 %d개", "%d of best %d"],
  SEC_FMT: ["+%d초", "+%ds"],
  SUBTITLE: ["한 번의 스탬프, 연쇄되는 짜릿함.", "One stamp. A chain reaction."],
  ARCADE_TAG: ["네온 아케이드 퍼즐", "NEON ARCADE PUZZLE"],
  TITLE_META: ["60초의 도전  ·  끝없는 콤보", "60 SECONDS  ·  ENDLESS COMBOS"],
  TAP_TO_START: ["화면을 눌러 시작하세요", "TAP TO START"],
  TAP_SOUND_HINT: ["누르면 음악이 함께 시작돼요", "Music starts with your first tap"],
  // 랭킹
  RANKING: ["랭킹", "RANKING"],
  RANK_SUB: ["사람마다 최고 점수 한 개씩", "Each player's best score"],
  RANK_SUB_MINE: ["내가 낸 점수 중 높은 순", "Your best runs"],
  RANK_TAB_ALL: ["전체 랭킹", "RANKING"],
  RANK_TAB_MINE: ["내 기록", "MY RECORDS"],
  TITLE_NICK_FMT: ["%s  ·  닉네임 변경", "%s  ·  CHANGE NAME"],
  RANK_LOGIN: ["Google로 로그인", "SIGN IN WITH GOOGLE"],
  RANK_NICK: ["닉네임", "NICKNAME"],
  RANK_NICK_UNSET: ["정하기", "SET"],
  RANK_LOGOUT: ["로그아웃", "SIGN OUT"],
  RANK_GUEST: ["로그인하면 내 점수도 랭킹에 올라가요", "Sign in to put your scores on the board"],
  RANK_OFF: ["랭킹은 준비 중이에요", "Ranking is coming soon"],
  RANK_LOADING: ["불러오는 중…", "Loading…"],
  RANK_ERROR: ["불러오지 못했어요. 잠시 뒤 다시 열어 주세요", "Couldn't load. Please try again later"],
  RANK_EMPTY: ["아직 기록이 없어요", "No scores yet"],
  RANK_MY_FMT: ["내 순위 %d위  ·  최고 %d", "MY RANK #%d  ·  BEST %d"],
  RANK_NO_SCORE: ["한 판 하면 내 순위가 보여요", "Play a run to get your rank"],
  RANK_ROW_COMBO: ["콤보 %d", "COMBO %d"],
  RESULT_RANK_SAVING: ["랭킹 등록 중…", "Saving to ranking…"],
  RESULT_RANK_FMT: ["랭킹 등록!  전체 %d위", "On the board!  #%d"],
  RESULT_RANK_SAVED: ["랭킹에 등록했어요", "Saved to ranking"],
  RESULT_RANK_GUEST: ["로그인하면 랭킹에 올라가요", "Sign in to join the ranking"],
  RESULT_RANK_NICK: ["닉네임을 정하면 랭킹에 올라가요", "Set a nickname to join the ranking"],
  RESULT_RANK_FAIL: ["랭킹 등록에 실패했어요", "Couldn't save to ranking"],
  NICK_TITLE: ["닉네임 정하기", "Choose a nickname"],
  NICK_HINT: ["랭킹에 보일 이름이에요  ·  2~12자", "Shown on the ranking  ·  2–12 characters"],
  NICK_OK: ["확인", "OK"],
  NICK_CANCEL: ["취소", "CANCEL"],
  NICK_TAKEN: ["이미 누가 쓰고 있는 닉네임이에요", "That nickname is taken"],
  NICK_INVALID: ["2~12자, 앞뒤 공백 없이 써 주세요", "2–12 characters, no leading/trailing spaces"],
  NICK_RESERVED: ["운영자로 오해할 수 있는 이름은 쓸 수 없어요", "That name could be mistaken for staff"],
  NICK_TOO_SOON: ["닉네임은 30초에 한 번 바꿀 수 있어요", "You can change your nickname every 30 seconds"],
  RESULT_RANK_LIMIT: ["잠시 뒤에 다시 등록할 수 있어요", "Too many submissions. Try again later"],
  RESULT_RANK_UNRANKED: ["서버 연결이 안 돼 이번 판은 랭킹에 안 올라가요", "Offline round: not ranked"],
  RESULT_RANK_REJECTED: ["판 기록 확인에 실패해 등록하지 않았어요", "Round couldn't be verified"],
  RESULT_RANK_OUTDATED: ["새 버전이 나왔어요. 새로고침 후 다시 해 주세요", "New version out. Please refresh"],
  NET_ERROR: ["연결에 실패했어요. 다시 시도해 주세요", "Connection failed. Please try again"],
  LOGO_TOP: ["SHATTER", "SHATTER"],
  LOGO_BOTTOM: ["STAMP", "STAMP"],
  HOWTO_SUB: ["세 가지만 기억하면 준비 완료", "Three things. Then you're ready."],
  SETTINGS_SUB: ["나에게 맞는 플레이 감각", "Make the arcade your own."],
  PAUSE_SUB: ["잠깐 쉬어 가도 괜찮아요", "Take a breath. Your run can wait."],
  PAUSE_META: ["준비되면 이어서 도전하세요", "Your next great stamp is waiting."],
  SOUND: ["효과음", "SOUND EFFECTS"],
  MUSIC: ["배경 음악", "MUSIC"],
  AUDIO: ["사운드", "AUDIO"],
  PREFERENCES: ["플레이 설정", "PREFERENCES"],
  SHAKE: ["화면 흔들림", "SCREEN SHAKE"],
  LANGUAGE: ["언어", "LANGUAGE"],
  PERCENT_FMT: ["%d%", "%d%"],
  COMBO_FMT: ["%d COMBO", "%d COMBO"],
  FEVER: ["FEVER ×3", "FEVER ×3"],
  FEVER_END: ["FEVER END", "FEVER END"],
  GO: ["GO!", "GO!"],
  GRADE_PERFECT: ["PERFECT", "PERFECT"],
  GRADE_GREAT: ["GREAT", "GREAT"],
  GRADE_GOOD: ["GOOD", "GOOD"],
  GRADE_MISS: ["MISS", "MISS"],
  GRADE_STREAK_FMT: ["%s ×%d", "%s ×%d"],
  POINTS_FMT: ["+%d", "+%d"],
  TIME_DELTA_FMT: ["%s초", "%ss"],
  PLAY_HINT: ["가장 큰 같은 색 덩어리를 찾아보세요", "Find the largest connected color group"],
  RESULT_TAG: ["이번 도전의 기록", "YOUR RUN, ALL WRAPPED UP"],
  RESULT_GRADES: ["스탬프 기록", "STAMP BREAKDOWN"],
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
  ON: ["켜짐", "ON"],
  OFF: ["꺼짐", "OFF"],
  LANG_NAME: ["한국어", "English"],
  TUTORIAL_BTN: ["튜토리얼", "TUTORIAL"],
  COUNT_FMT: ["%d개", "%d"],
  // 튜토리얼(첫 판)
  TUT_1: ["화살표가 가리키는 칸에 찍어 보세요.\n같은 색으로 이어진 블록이 함께 터져요!", "Stamp the cell under the arrow.\nLinked blocks of the same color break together!"],
  TUT_2: ["금색 PERFECT 자리를 찾아 찍으세요.\n빨간 MISS는 -1초, 콤보가 끊겨요!", "Find a gold PERFECT spot and stamp.\nA red MISS costs 1 second and your combo!"],
  TUT_3: ["연달아 찍으면 COMBO가 쌓여요.\n콤보 막대가 사라지기 전에 한 번 더!", "Stamp again quickly to build a COMBO.\nOne more before the bar runs out!"],
  TUT_4: ["오른쪽 홀드 칸을 눌러 모양을 보관하세요.\n스페이스나 우클릭으로도 가능해요.", "Tap HOLD to save a shape for later.\nSpace or right-click works too."],
  TUT_PROGRESS: ["튜토리얼  %d / %d", "TUTORIAL  %d / %d"],
  TUT_5: ["준비 완료!\n60초 동안 최고 점수에 도전하세요.", "Ready!\nGo for a high score in 60 seconds."],
  TUT_SKIP: ["건너뛰기", "SKIP"],
  TUT_WRONG: ["금색 PERFECT 자리에 찍어 보세요!", "Stamp where it shows a gold PERFECT!"],
  // 게임 방법 카드
  HOWTO_C1_T: ["찍으면 번져요", "Stamp & spread"],
  HOWTO_C1_B: ["도장이 닿은 칸마다, 이어진 같은 색 블록이 모두 터져요. 서로 다른 색에 걸쳐 찍어도 돼요!", "For EACH stamped cell, its connected same-color group breaks. Your stamp can cross different colors!"],
  HOWTO_STEP_FMT: ["%d", "%d"],
  HOWTO_STAMP_FMT: ["도장 %d칸 · 세 가지 색", "STAMP: %d CELLS, 3 COLORS"],
  HOWTO_BREAK_FMT: ["연결된 %d칸 파괴", "%d CELLS BREAK"],
  HOWTO_STAMP_LEGEND: ["흰 테두리 = 찍은 칸", "WHITE = STAMPED"],
  HOWTO_BREAK_LEGEND: ["각 색의 연결 블록 파괴", "EACH LINKED COLOR BREAKS"],
  HOWTO_C2_T: ["판정 색을 보세요", "Watch the color"],
  HOWTO_C2_B: ["누른 채 움직여 미리 보세요. 금색 PERFECT가 최고 자리! MISS는 -1초, 콤보도 끊겨요.", "Hold or hover to preview. Gold PERFECT is best. MISS: −1s, combo lost."],
  HOWTO_C3_T: ["콤보와 시간", "Combo & time"],
  HOWTO_C3_B: ["막대가 끝나기 전에 또 찍어 콤보! 10콤보부터 점수 ×3. 목표 점수를 넘기면 +1초.", "Stamp before the bar ends. At 10 combos, score ×3! Beat the target to earn +1s."],
  HOWTO_KEYS: ["홀드  Space / 우클릭   ·   일시정지  Esc", "HOLD  Space / right-click   ·   PAUSE  Esc"],
} as const;

export type TextKey = keyof typeof TEXT;

export const GRADE_KEYS: readonly TextKey[] = ["GRADE_PERFECT", "GRADE_GREAT", "GRADE_GOOD", "GRADE_MISS"];

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
