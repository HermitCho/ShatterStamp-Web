// 애니메이션 도구 테스트: 콜백 안에서 추가한 애니메이션이 사라지지 않아야 한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Tweens } from "../src/game/tween.ts";

test("a seq added from inside a callback still runs", () => {
  const tw = new Tweens();
  let fired = false;
  tw.add().wait(0.1).call(() => tw.add().wait(0.5).call(() => (fired = true)));
  for (let i = 0; i < 100; i++) tw.update(1 / 60);
  assert.ok(fired);
});

test("clear() from inside a callback drops the rest", () => {
  const tw = new Tweens();
  let late = false;
  tw.add().wait(0.1).call(() => tw.clear());
  tw.add().wait(0.5).call(() => (late = true));
  for (let i = 0; i < 100; i++) tw.update(1 / 60);
  assert.equal(late, false);
});
