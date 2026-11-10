# Shatter Stamp (Web)

60초 콤보 퍼즐 게임 **Shatter Stamp**의 웹(TypeScript + Canvas 2D) 버전.
Godot 버전(`D:\Godot\ShatterStamp`, https://github.com/HermitCho/ShatterStamp)과 규칙·수치가 같고,
엔진 없이 만들어 첫 로딩이 가볍다 (JS 약 13KB gzip + 한글 폰트 서브셋 약 120KB, Godot 웹 빌드는 약 10MB).

## 실행

```
npm install
npm run dev        # 개발 서버
npm run build      # dist/ 에 배포용 빌드
npm test           # 핵심 로직 테스트 (node --test, Node 22.18+)
npm run sim        # 봇 밸런스 시뮬레이션 (-- --runs=30 --base=1000 --growth=90)
```

디버그 주소 옵션: `?autoplay=1` (봇 자동 플레이), `?time=5` (시작 시간 초)

## 구조

```
src/core/          화면과 분리된 순수 로직 (테스트·시뮬레이션이 같은 코드를 씀)
  board-model.ts   보드: 연결 블록 탐색, 낙하, 보충, 보충 조정(다음 모양 최대치를 15개 근처로)
  game-rules.ts    판정(PERFECT/GREAT/GOOD/MISS), 점수, 콤보, 시간 보너스
  bot.ts           최대 파괴 자리 계산(덩어리 번호 방식)
  shapes.ts        모양 16종 (홀수 크기, 정가운데 = 마우스 칸)
  shape-queue.ts   주머니 섞기 방식 모양 큐
  rng.ts           시드 난수
src/game/          화면
  game.ts          게임 흐름, HUD, 오른쪽 모양 줄, 판정 글자, 타격감
  board-view.ts    블록 그림·애니메이션, 번지는 파괴, 판정 색 미리보기
  fx.ts            파편·섬광·충격파·별
  audio.ts         Web Audio 효과음 합성
  skin.ts, i18n.ts 네온 색, 한국어/영어 문구
tests/core.test.ts
tools/sim-balance.ts, tools/build-font.py
```

## 진행 상황

- [x] 1단계: 핵심 로직 + 테스트 + 시뮬레이션, 플레이 화면(미리보기, 번지는 파괴, 콤보·피버, 홀드, 타격감, 효과음), 간단한 타이틀·결과
- [ ] 2단계: 메뉴(타이틀 버튼, 게임 방법 카드, 설정, 일시정지), 언어 전환
- [ ] 3단계: 튜토리얼, 카운트다운·피버·마지막 5초 연출, 배경 음악, 결과 화면 카운트업, 배포

## 글꼴

`public/fonts/game_font.ttf`는 Noto Sans KR(SIL Open Font License 1.1, `public/fonts/OFL.txt`)의 서브셋이다.
한글 문구를 바꾸면 `python tools/build-font.py <NotoSansKR[wght].ttf>`로 다시 만든다.
