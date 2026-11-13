# Shatter Stamp (Web)

60초 콤보 퍼즐 게임 **Shatter Stamp**의 웹(TypeScript + Canvas 2D) 버전.
Godot 버전(`D:\Godot\ShatterStamp`, https://github.com/HermitCho/ShatterStamp)과 규칙·수치가 같고,
엔진 없이 만들어 첫 로딩이 가볍다 (JS 약 26KB gzip + 한글 폰트 서브셋 약 140KB, Godot 웹 빌드는 약 10MB).

**플레이:** https://hermitcho.github.io/ShatterStamp-Web/

## 실행

```
npm install
npm run dev        # 개발 서버
npm run build      # dist/ 에 배포용 빌드
npm test           # 핵심 로직 테스트 (node --test, Node 22.18+)
npm run sim        # 봇 밸런스 시뮬레이션 (-- --runs=30 --base=1000 --growth=90)
```

디버그 주소 옵션: `?autoplay=1` (봇 자동 플레이), `?time=5` (시작 시간 초), `?debug=1` (자동 확인용 `window.__game` 공개, 랭킹 등록 안 함),
`?rankmock=1|in` (가짜 랭킹 서버: 손님 / 로그인 상태. 판 기록 검증도 브라우저 안에서 그대로 해 본다)

`main`에 push하면 GitHub Actions가 테스트 → 빌드 → GitHub Pages 배포를 한다(`.github/workflows/deploy.yml`).

## 구조

```
src/core/          화면과 분리된 순수 로직 (테스트·시뮬레이션이 같은 코드를 씀)
  board-model.ts   보드: 연결 블록 탐색, 낙하, 보충, 보충 조정(다음 모양 최대치를 15개 근처로)
  game-rules.ts    판정(PERFECT/GREAT/GOOD/MISS), 점수, 콤보, 시간 보너스
  bot.ts           최대 파괴 자리 계산(덩어리 번호 방식)
  shapes.ts        모양 16종 (홀수 크기, 정가운데 = 마우스 칸)
  shape-queue.ts   주머니 섞기 방식 모양 큐
  rng.ts           시드 난수
  replay.ts        판 다시 돌리기: 서버 시드로 보드를 만들고, 찍기·홀드 기록으로 점수를 다시 계산(랭킹 검증)
src/game/          화면
  game.ts          게임 흐름, HUD, 오른쪽 모양 줄, 판정 글자, 타격감
  menus.ts         타이틀 / 게임 방법 / 설정 / 일시정지 / 결과 / 랭킹 (캔버스 버튼·슬라이더, 키보드 이동)
  stamp-menu.ts    메뉴 모양: 옮겨 다니는 도장 선택 표시, 글자, 슬라이더
  online.ts        온라인 랭킹(Supabase): Google 로그인, 닉네임, 점수 등록, TOP 10 (?rankmock=1 가짜 데이터)
  online-config.ts Supabase 주소·공개 키
  nick-input.ts    닉네임 입력 창(HTML)
  howto.ts         게임 방법 그림 카드
  draw.ts          글자 그리기 도우미
  board-view.ts    블록 그림·애니메이션, 번지는 파괴, 판정 색 미리보기
  fx.ts            파편·섬광·충격파·별
  audio.ts         Web Audio 효과음 합성
  music.ts         배경 음악 합성(타이틀 / 게임 / 피버 층)
  stage.ts         카운트다운, TIME UP, 피버 배지, 화면 가장자리 빛
  title.ts         타이틀 로고 등장 연출과 배경
  tutorial.ts      첫 판 튜토리얼 안내 상자와 표시
  neon.ts          네온 글씨
  tween.ts         작은 애니메이션 도구
  skin.ts, i18n.ts 네온 색, 한국어/영어 문구
supabase/schema.sql  랭킹 DB 표·권한·함수   supabase/security-test.sql  보안 자체 점검
supabase/functions/submit-run/  점수 검증 서버 함수(Deno)   _shared/core/  src/core 복사본(tools/sync-edge.ts)
tests/core.test.ts, tests/replay.test.ts, tests/edge-sync.test.ts, tests/tween.test.ts
tools/sim-balance.ts, tools/build-font.py, tools/sync-edge.ts
```

## 진행 상황

- [x] 1단계: 핵심 로직 + 테스트 + 시뮬레이션, 플레이 화면(미리보기, 번지는 파괴, 콤보·피버, 홀드, 타격감, 효과음), 간단한 타이틀·결과
- [x] 2단계: 메뉴(타이틀 버튼, 게임 방법 카드, 설정 — 효과음·음악 볼륨·화면 흔들림·언어, 일시정지, 결과 버튼), 키보드 이동(↑↓ Enter Esc ←→)
- [x] 3단계: 첫 판 튜토리얼(최고 자리만 받기, 건너뛰기), 3·2·1·GO!, 피버 배지·불꽃·가장자리 빛·FEVER END, 마지막 5초 경고, TIME UP, 타이틀 로고·배경 연출, 배경 음악 3곡(Web Audio 합성), 결과 카운트업, GitHub Pages 배포

## 온라인 랭킹 (Supabase)

1. supabase.com 에서 프로젝트를 만든다(무료).
2. SQL Editor → New query 에 `supabase/schema.sql` 전체를 붙여 넣고 Run.
3. Authentication → Sign In / Providers → Google 을 켜고, Google Cloud 콘솔에서 만든 OAuth 클라이언트 ID·비밀번호를 넣는다.
   Google 쪽 "승인된 리디렉션 URI"에는 Supabase가 보여 주는 콜백 주소(`https://<프로젝트>.supabase.co/auth/v1/callback`)를 넣는다.
4. Authentication → URL Configuration: Site URL = `https://hermitcho.github.io/ShatterStamp-Web/`,
   Redirect URLs 에 위 주소와 `http://localhost:5173/` 를 추가한다.
5. Project Settings → API 의 Project URL 과 anon(public) 키를 `src/game/online-config.ts` 에 넣는다.
6. 점수 검증 서버 함수를 배포한다(아래).

### 점수 검증 서버 함수 배포

**자동:** `src/core`(게임 규칙)·`supabase/functions`·`tools/sync-edge.ts`가 바뀌어 main에 올라오면
GitHub Actions(`.github/workflows/edge.yml`)가 규칙 코드를 복사(`node tools/sync-edge.ts`) → `npm test` →
`supabase functions deploy submit-run --remote=<프로젝트> --no-verify-jwt --use-api`를 실행한다
(로그인 확인은 함수 안에서 직접 하므로 게이트웨이 JWT 검사는 끈다. Docker 없이 서버에서 묶는다. CLI 버전은 고정).
손으로 다시 배포하려면 GitHub › Actions › Deploy edge function › Run workflow.

**처음 한 번:** supabase.com › Account › Access Tokens 에서 토큰을 만들어
GitHub 저장소 › Settings › Secrets and variables › Actions › `SUPABASE_ACCESS_TOKEN` 에 넣는다.
토큰은 PC·채팅·저장소에 두지 않는다.

**게임 규칙(`src/core`)을 바꾸면** `REPLAY_VERSION`을 올린다. 사이트와 서버 함수가 같은 push로 함께 배포된다
(서버가 옛 규칙으로 계산하면 기록이 거절된다. `npm test`가 복사본이 같은지 확인한다).

연결 정보가 비어 있으면 랭킹은 "준비 중"으로 보이고 게임은 그대로 동작한다. 라이브러리는 로그인 흔적이 있거나 랭킹을 열 때만 받는다.

### 보안

- **DB 문은 함수뿐:** 표(`profiles`, `scores`, `runs`)는 RLS를 켜고 권한을 모두 회수해 브라우저가 직접 읽거나 쓸 수 없다.
  `leaderboard`(누구나), `my_profile`·`set_nickname`·`start_run`·`my_top`·`my_rank`(로그인)만 열려 있고,
  누구인지는 함수가 로그인 토큰(`auth.uid()`)에서 꺼낸다. 랭킹에는 닉네임·점수만 나가고 내부 계정 번호는 나가지 않는다.
- **서버 검사:** 닉네임 2~12자·보이지 않는 글자 금지·대소문자 무시 중복 금지·운영자 사칭 금지·30초에 한 번 변경,
  점수·콤보 범위, 하루 300번 등록, 판 표는 2초에 한 번·하루 1000번.
- **확인:** `schema.sql` 실행 뒤 `supabase/security-test.sql`을 SQL Editor에서 실행하면 방문자·가짜 사용자 3명으로 공격을 흉내 내고
  결과를 표로 보여 준다(시험 데이터는 되돌린다). 모든 `pass`가 true여야 한다.
- **사이트:** 배포 빌드에 콘텐츠 보안 정책(CSP)을 넣어 우리 파일 밖의 스크립트 실행과 Supabase 밖으로의 통신을 막는다(`vite.config.ts`).
- **점수 검증(리플레이):** 브라우저는 점수를 보내지 않는다.
  1. 판을 시작할 때 서버가 예측할 수 없는 시드를 담은 "판 표"(`start_run`)를 준다. 새 표를 받으면 안 쓴 이전 표는 닫힌다.
  2. 게임은 그 시드로 보드·모양 순서를 만들고, 찍기·홀드를 게임 시간과 함께 기록한다.
  3. 서버 함수 `submit-run`이 로그인 토큰으로 사용자를 확인하고, 본인의 안 쓴 표인지 본 뒤,
     게임과 같은 규칙 코드로 판을 처음부터 다시 돌려 점수를 직접 계산한다. 쿨다운 무시·시간 끝난 뒤 찍기·
     튜토리얼 악용·잘못된 값이 있으면 거절한다.
  4. 계산한 점수는 `record_run`(서버 함수 전용, 로그인 사용자도 못 부름)이 넣는다. 표는 한 번만 쓰이고,
     표를 받은 뒤 실제로 흐른 시간이 판의 게임 시간보다 짧으면(미리 계산해 바로 보내기) 거절한다.
  - 남는 한계: 실제로 60초 동안 판을 두는 프로그램(봇)은 막지 못한다. 점수가 사람 기록보다 지나치게 높으면 확인이 필요하다.
  - 자동 플레이·`?time=`·`?debug=1` 판은 처음부터 등록하지 않는다.
- **키:** 게임에는 공개용 publishable 키만 넣는다. Secret / service_role 키는 저장소·채팅 어디에도 두지 않는다.
- **대시보드:** Email 로그인 끄기(Google만 사용), Google OAuth 앱 게시, Supabase·Google·GitHub 계정 2단계 인증,
  Supabase Advisors → Security Advisor 경고 0개 확인.

## 글꼴

`public/fonts/game_font.ttf`는 Noto Sans KR(SIL Open Font License 1.1, `public/fonts/OFL.txt`)의 서브셋이다.
한글 문구를 바꾸면 `python tools/build-font.py <NotoSansKR[wght].ttf>`로 다시 만든다.
