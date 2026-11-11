// 게임 규칙 코드(src/core)를 서버 함수 폴더(supabase/functions/_shared/core)로 복사한다.
// 서버가 게임과 똑같은 규칙으로 판을 다시 돌리려면 두 곳이 같아야 한다. 규칙을 바꾸면 이걸 돌리고 서버 함수를 다시 배포한다.
// 실행: node tools/sync-edge.ts   (npm test 가 두 곳이 같은지 확인한다)
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export const SRC = "src/core";
export const DEST = "supabase/functions/_shared/core";

rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });
for (const f of readdirSync(SRC).filter((n) => n.endsWith(".ts"))) {
  copyFileSync(join(SRC, f), join(DEST, f));
  console.log(`${SRC}/${f} -> ${DEST}/${f}`);
}
