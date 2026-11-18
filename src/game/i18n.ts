/** 한국어(기본) / 영어 문구. FEVER·CHAIN 같은 큰 연출 글자는 두 언어 모두 영어로 둔다. */
const TEXT = {
  SCORE: ["점수", "SCORE"],
  BEST: ["최고", "BEST"],
  TIME: ["시간", "TIME"],
  BEST_FMT: ["최고 %d", "BEST %d"],
  TARGET_FMT: ["%d점 → +1초", "%d PTS → +1s"],
  HOLD: ["홀드", "HOLD"],
  NOW: ["지금", "NOW"],
  SEC_FMT: ["+%d초", "+%ds"],
  ARCADE_TAG: ["네온 아케이드 퍼즐", "NEON ARCADE PUZZLE"],
  TAP_TO_START: ["화면을 눌러 시작하세요", "TAP TO START"],
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
  RANK_LINK: ["Google 로그인", "SIGN IN"],
  RANK_NICK_FIRST: ["닉네임을 정하면 내 순위가 보여요", "Set a nickname to see your rank"],
  RANK_GOOGLE_FIRST: ["Google에 로그인하면 내 순위가 보여요", "Sign in with Google to see your rank"],
  RANK_GUEST: ["로그인하고 내 기록을 랭킹에 남겨 보세요", "Sign in and put your best on the board"],
  RANK_PLACE: ["순위", "RANK"],
  RANK_PLAYER: ["닉네임", "PLAYER"],
  RANK_DATE: ["날짜", "DATE"],
  RANK_COMBO: ["연쇄", "CHAIN"],
  RANK_ME: ["나", "ME"],
  RANK_MY_PLACE: ["내 순위", "MY RANK"],
  RANK_PLACE_FMT: ["%d위", "#%d"],
  RANK_EDIT_NAME: ["닉네임 변경", "EDIT NICKNAME"],
  RANK_GUEST_RECORDS: ["로그인하면 내 기록을 볼 수 있어요", "Sign in to see your personal bests"],
  RANK_OFF: ["랭킹은 준비 중이에요", "Ranking is coming soon"],
  RANK_LOADING: ["불러오는 중…", "Loading…"],
  RANK_ERROR: ["불러오지 못했어요. 잠시 뒤 다시 열어 주세요", "Couldn't load. Please try again later"],
  RANK_EMPTY: ["아직 기록이 없어요", "No scores yet"],
  RANK_MY_FMT: ["내 순위 %d위  ·  최고 %d", "MY RANK #%d  ·  BEST %d"],
  RANK_NO_SCORE: ["한 판 하면 내 순위가 보여요", "Play a run to get your rank"],
  RANK_ROW_COMBO: ["연쇄 %d", "CHAIN %d"],
  RESULT_RANK_SAVING: ["랭킹 등록 중…", "Saving to ranking…"],
  RESULT_RANK_FMT: ["랭킹 등록!  전체 %d위", "On the board!  #%d"],
  RESULT_RANK_SAVED: ["랭킹에 등록했어요", "Saved to ranking"],
  RESULT_RANK_GUEST: ["로그인하면 랭킹에 올라가요", "Sign in to join the ranking"],
  RESULT_RANK_NICK: ["기록 저장! 닉네임을 정하면 랭킹에 보여요", "Saved! Set a nickname to show on the board"],
  RESULT_RANK_GOOGLE: ["기록 저장! Google에 로그인하면 랭킹에 올라가요", "Saved! Sign in with Google to join the board"],
  RESULT_RANK_PENDING: ["연결이 안 돼요. 이 기록은 다음에 다시 올릴게요", "Offline. We'll upload this run later"],
  RESULT_RANK_FAIL: ["랭킹 등록에 실패했어요", "Couldn't save to ranking"],
  NICK_TITLE: ["닉네임 정하기", "Choose a nickname"],
  NICK_HINT: ["랭킹에 보일 이름이에요  ·  2~12자", "Shown on the ranking  ·  2–12 characters"],
  NICK_OK: ["확인", "OK"],
  NICK_CANCEL: ["취소", "CANCEL"],
  NICK_TAKEN: ["이미 누가 쓰고 있는 닉네임이에요", "That nickname is taken"],
  NICK_INVALID: ["2~12자, 앞뒤 공백 없이 써 주세요", "2–12 characters, no leading/trailing spaces"],
  NICK_RESERVED: ["운영자로 오해할 수 있는 이름은 쓸 수 없어요", "That name could be mistaken for staff"],
  NICK_BLOCKED: ["쓸 수 없는 말이 들어 있어요", "That nickname isn't allowed"],
  NICK_TOO_SOON: ["닉네임은 30초에 한 번 바꿀 수 있어요", "You can change your nickname every 30 seconds"],
  RESULT_RANK_LIMIT: ["잠시 뒤에 다시 등록할 수 있어요", "Too many submissions. Try again later"],
  RESULT_RANK_UNRANKED: ["서버 연결이 안 돼 이번 판은 랭킹에 안 올라가요", "Offline round: not ranked"],
  RESULT_RANK_REJECTED: ["판 기록 확인에 실패해 등록하지 않았어요", "Round couldn't be verified"],
  RESULT_RANK_OUTDATED: ["새 버전이 나왔어요. 새로고침 후 다시 해 주세요", "New version out. Please refresh"],
  NET_ERROR: ["연결에 실패했어요. 다시 시도해 주세요", "Connection failed. Please try again"],
  LOGO_TOP: ["SHATTER", "SHATTER"],
  LOGO_BOTTOM: ["STAMP", "STAMP"],
  HOWTO_SUB: ["다섯 장만 보면 준비 완료", "Five pages. Then you're ready."],
  SETTINGS_SUB: ["나에게 맞는 플레이 감각", "Make the arcade your own."],
  PAUSE_SUB: ["잠깐 쉬어 가도 괜찮아요", "Take a breath. Your run can wait."],
  PAUSE_META: ["3 · 2 · 1 뒤에 이어서 시작해요", "Resume after a 3 · 2 · 1 countdown"],
  COUNTDOWN_READY: ["준비하세요", "GET READY"],
  RESUME_READY: ["이어서 도전", "BACK TO YOUR RUN"],
  PAUSE_LOCK_FMT: ["%d초", "%ds"],
  LEGAL_PRIVACY: ["개인정보처리방침", "Privacy Policy"],
  LEGAL_TERMS: ["이용약관", "Terms of Service"],
  SOUND: ["효과음", "SOUND EFFECTS"],
  MUSIC: ["배경 음악", "MUSIC"],
  AUDIO: ["사운드", "AUDIO"],
  PREFERENCES: ["플레이 설정", "PREFERENCES"],
  SHAKE: ["화면 흔들림", "SCREEN SHAKE"],
  LANGUAGE: ["언어", "LANGUAGE"],
  PERCENT_FMT: ["%d%", "%d%"],
  FEVER: ["FEVER 3×3", "FEVER 3×3"],
  READY: ["READY?", "READY?"],
  FEVER_END: ["FEVER END", "FEVER END"],
  GO: ["GO!", "GO!"],
  POINTS_FMT: ["+%d", "+%d"],
  CELLS_FMT: ["%d칸", "%d CELLS"],
  CHAIN_FMT: ["연쇄 %d", "CHAIN %d"],
  CRYSTAL_NEW: ["가로 크리스탈!", "ROW CRYSTAL!"],
  CRYSTAL_COL_NEW: ["세로 크리스탈!", "COLUMN CRYSTAL!"],
  CRYSTAL_CROSS_NEW: ["십자 크리스탈!", "CROSS CRYSTAL!"],
  COLORS_FMT: ["%d색 ×%s", "%d COLORS ×%s"],
  COLORS_LABEL: ["여러 색", "COLORS"],
  TIME_DELTA_FMT: ["%s초", "%ss"],
  RESULT_TAG: ["이번 도전의 기록", "YOUR RUN, ALL WRAPPED UP"],
  RESULT_GRADES: ["연쇄와 크리스탈", "CHAINS & CRYSTALS"],
  TIME_UP: ["시간 종료!", "TIME UP!"],
  NEW_BEST: ["최고 기록 달성!", "NEW BEST!"],
  R_MAX_CHAIN: ["최대 연쇄", "LONGEST CHAIN"],
  R_CHAINS: ["연쇄", "CHAINS"],
  R_CRYSTALS: ["크리스탈", "CRYSTALS"],
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
  TUT_2: ["여러 색을 한 번에 터뜨릴수록 배율이 올라요.\n위쪽 색 줄에 셈에 든 색이 켜져요!", "Break several colors at once for a bigger multiplier.\nThe color row at the top shows what counted!"],
  TUT_3: ["올려 보면 찍을 칸이 빛나요.\n가장 크게 무너지는 곳을 찾아 찍으세요!", "Aim and the stamp cells glow.\nFind the spot that topples the most!"],
  TUT_4: ["오른쪽 홀드 칸을 눌러 모양을 보관하세요.\n언제든 다시 눌러 보관한 모양과 바꿔 써요.", "Tap HOLD to save a shape for later.\nTap it any time to swap it back in."],
  TUT_4_PC: ["오른쪽 홀드 칸을 클릭해 모양을 보관하세요.\n스페이스나 우클릭으로도 가능해요.", "Click HOLD to save a shape for later.\nSpace or right-click works too."],
  TUT_PROGRESS: ["튜토리얼  %d / %d", "TUTORIAL  %d / %d"],
  TUT_5: ["준비 완료! 이제부터는 한 번에\n9칸 이상 부서지는 곳만 찍혀요.", "Ready! From now on, only spots\nthat break 9+ blocks will stamp."],
  TUT_SKIP: ["건너뛰기", "SKIP"],
  TUT_WRONG: ["화살표 자리에 찍어 보세요!", "Stamp where the arrow points!"],
  // 게임 방법 카드
  HOWTO_C1_T: ["찍으면 번져요", "Stamp & spread"],
  HOWTO_C1_B: ["도장이 닿은 칸마다, 이어진 같은 색 블록이 모두 터져요. 서로 다른 색에 걸쳐 찍어도 돼요.", "For EACH stamped cell, its connected same-color group breaks. Your stamp can cross colors."],
  HOWTO_C1_RULE: ["한 번에 9칸 이상 부서지는 곳만 찍혀요!", "Only spots that break 9+ blocks will stamp!"],
  HOWTO_STEP_FMT: ["%d", "%d"],
  HOWTO_STAMP_FMT: ["도장 %d칸 · 세 가지 색", "STAMP: %d CELLS, 3 COLORS"],
  HOWTO_BREAK_FMT: ["현재 연결된 %d칸 파괴", "%d CELLS BREAK HERE"],
  HOWTO_AIM: ["누른 채 움직이면 찍을 칸이 빛나고 부서질 덩어리는 색 선으로 묶여요. 손을 떼면 찍혀요", "Drag to aim: stamp cells glow, what breaks is outlined. Lift to stamp"],
  HOWTO_AIM_PC: ["마우스를 올리면 찍을 칸이 빛나고 부서질 덩어리는 색 선으로 묶여요. 클릭하면 찍혀요", "Hover to aim: stamp cells glow, what breaks is outlined. Click to stamp"],
  HOWTO_C2_T: ["떨어지면 연쇄", "Fall & chain"],
  HOWTO_C2_B: ["부서진 자리로 위 블록이 떨어져 같은 색이 6칸 이상 이어지면 저절로 터져요. 연쇄는 덤으로 받는 보너스예요!", "Blocks fall into the gap. When 6+ of a color link up, they break on their own. Chains are a free bonus!"],
  HOWTO_CHAIN_0: ["이 줄을 찍으면…", "Stamp this row…"],
  HOWTO_CHAIN_1: ["금색이 떨어져서 이어지고", "Gold falls and links up"],
  HOWTO_CHAIN_2: ["연쇄 %d!  보너스", "CHAIN %d!  Bonus"],
  HOWTO_CHAIN_NOTE: ["연쇄와 크리스탈이 피버 게이지를 채우면 6초 동안 도장이 3×3! 아무 데나 찍혀요", "Chains and crystals fill FEVER: 6s of 3×3 stamps, anywhere!"],
  HOWTO_C3_T: ["여러 색", "Many colors"],
  HOWTO_C4_T: ["크리스탈", "Crystals"],
  HOWTO_C5_T: ["시간 늘리기", "Earn time"],
  HOWTO_COLORS_NOTE: ["위쪽 색 줄에 셈에 든 색이 켜져요", "The color row at the top lights what counted"],
  HOWTO_CR_ROW: ["가로줄", "ROW"],
  HOWTO_CR_COL: ["세로줄", "COLUMN"],
  HOWTO_CR_CROSS: ["십자", "CROSS"],
  HOWTO_CR_ROW_IF: ["13칸+ 옆으로 길게", "13+ wide"],
  HOWTO_CR_COL_IF: ["13칸+ 위아래로 길게", "13+ tall"],
  HOWTO_CR_CROSS_IF: ["15칸+ 또는 4색+", "15+ or 4+ colors"],
  HOWTO_CRYSTAL_NOTE: ["옆 블록이 터질 때 함께 깨지며 줄을 통째로 지워요", "Breaks with its neighbor and clears the whole line"],
  HOWTO_TIME_3: ["3색", "3 colors"],
  HOWTO_TIME_4: ["4색 이상", "4+ colors"],
  HOWTO_TIME_CR: ["크리스탈 하나", "Each crystal"],
  HOWTO_TIME_NOTE: ["피버 중에는 시간이 늘지 않아요", "No time bonus during FEVER"],
  HOWTO_COLORS_T: ["여러 색", "Many colors"],
  HOWTO_COLORS_B: ["한 번에 3칸 이상씩 터뜨린 색이 2·3·4·5가지면 점수 ×1.5 · ×2.2 · ×3 · ×4", "Break 2/3/4/5 colors (3+ each) in one stamp: ×1.5 · ×2.2 · ×3 · ×4"],
  HOWTO_CRYSTAL_T: ["크리스탈", "Crystal"],
  HOWTO_CRYSTAL_B: ["13칸 이상 부수면 부순 모양대로 가로·세로, 15칸 이상이나 4색 이상이면 십자 크리스탈! 옆에서 터지면 줄을 통째로!", "Break 13+ for a row or column crystal (follows the shape), 15+ or 4+ colors for a cross. Break next to it to clear the line!"],
  HOWTO_TIME_T: ["시간 늘리기", "Earn time"],
  HOWTO_TIME_B: ["3색 +0.25초, 4색 이상 +0.5초, 크리스탈을 깰 때마다 +0.5초", "3 colors +0.25s, 4+ colors +0.5s, each crystal +0.5s"],
  HOWTO_NEXT: ["다음", "NEXT"],
  HOWTO_PREV: ["이전", "BACK"],
  HOWTO_DONE: ["완료", "DONE"],
  HOWTO_KEYS: ["홀드  Space / 우클릭   ·   일시정지  Esc", "HOLD  Space / right-click   ·   PAUSE  Esc"],
} as const;

export type TextKey = keyof typeof TEXT;


// 기본은 영어. 설정에서 한국어를 고른 적이 있으면 한국어로 연다.
let lang = 1;
try {
  lang = localStorage.getItem("ss.lang") === "ko" ? 0 : 1;
} catch {
  /* 저장소를 못 쓰는 환경에서도 기본값으로 동작 */
}

export function t(key: TextKey, ...args: (number | string)[]): string {
  let s: string = TEXT[key][lang];
  // 숫자는 어디서나 쉼표를 붙인다(+2,250 · 1,110점)
  for (const a of args) s = s.replace(/%d|%s/, typeof a === "number" ? a.toLocaleString("en-US") : a);
  return s;
}

export function setLang(code: "ko" | "en"): void {
  lang = code === "en" ? 1 : 0;
  updateDocumentLanguage();
  try {
    localStorage.setItem("ss.lang", code);
  } catch {
    /* 무시 */
  }
}

export function getLang(): "ko" | "en" {
  return lang === 1 ? "en" : "ko";
}

function updateDocumentLanguage(): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = getLang();
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n as TextKey;
    if (key in TEXT) el.textContent = t(key);
  });
}

updateDocumentLanguage();
