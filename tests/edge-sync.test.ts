// 서버 함수가 쓰는 규칙 코드 복사본이 게임 규칙 코드와 같은지 확인한다. 다르면: node tools/sync-edge.ts
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("edge function core is a copy of src/core", () => {
  const src = readdirSync("src/core").filter((n) => n.endsWith(".ts")).sort();
  const dest = readdirSync("supabase/functions/_shared/core").filter((n) => n.endsWith(".ts")).sort();
  assert.deepEqual(dest, src, "file list differs: run node tools/sync-edge.ts");
  for (const f of src) {
    assert.equal(
      readFileSync(`supabase/functions/_shared/core/${f}`, "utf8"),
      readFileSync(`src/core/${f}`, "utf8"),
      `${f} differs: run node tools/sync-edge.ts`,
    );
  }
});
