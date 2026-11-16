// Shatter Stamp: 한 판 기록 검증 후 랭킹 등록 (Supabase Edge Function, Deno)
//
// 1. 로그인 토큰(Google 또는 손님)으로 누구인지 확인한다(브라우저가 보낸 사용자 번호는 받지 않는다).
// 2. 판 표(runs)에서 그 사람의 시드를 꺼낸다. 남의 표·쓴 표는 못 쓴다.
// 3. 게임과 같은 규칙 코드(_shared/core, src/core 복사본)로 판을 처음부터 다시 돌려 점수를 직접 계산한다.
// 4. 계산한 점수만 record_run 으로 넣는다(표 사용 처리, 실제 시간 검사, 하루 횟수 검사는 DB 함수가 한다).
//
// 배포: README의 "점수 검증 서버 함수" 참고. 규칙 코드를 바꾸면 tools/sync-edge.ts 를 돌린 뒤 다시 배포한다.
import { REPLAY_VERSION, simulateRun } from "../_shared/core/replay.ts";
import { admin, bearer, serve, userOf } from "../_shared/server.ts";

const MAX_BODY = 256 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(MAX_BODY, async (req, body, reply) => {
  // 1. 누구인지: 로그인 토큰을 인증 서버에 확인한다(위조·만료 토큰은 여기서 걸린다)
  const uid = (await userOf(bearer(req)))?.id;
  if (!uid) return reply({ status: "signed_out" }, 401);

  const runId = body.run;
  if (typeof runId !== "string" || !UUID_RE.test(runId)) return reply({ status: "invalid" }, 400);
  if ((body.replay as { v?: unknown } | undefined)?.v !== REPLAY_VERSION) return reply({ status: "version" });

  // 2. 판 표: 본인 것이고 아직 안 쓴 것만
  const { data: run, error: runError } = await admin
    .from("runs").select("seed, closed_at").eq("id", runId).eq("user_id", uid).maybeSingle();
  if (runError) return reply({ status: "error" }, 500);
  if (!run || run.closed_at) return reply({ status: "bad_run" });

  // 3. 다시 돌려서 점수 계산
  const sim = simulateRun(run.seed, body.replay);
  if (!sim.ok) {
    console.warn("replay rejected", { uid, runId, reason: sim.reason });
    return reply({ status: sim.reason === "version" ? "version" : "rejected" });
  }
  if (typeof body.score === "number" && body.score !== sim.score) {
    console.warn("client score differs", { uid, runId, client: body.score, server: sim.score });
  }

  // 4. 등록 (서버가 계산한 값만)
  const { data, error } = await admin.rpc("record_run", {
    p_user: uid, p_run: runId, p_score: sim.score, p_max_combo: sim.maxCombo,
    p_biggest: sim.biggest, p_duration: sim.duration,
  });
  const row = (data as { status: string; rank: number | null; best: number | null }[] | null)?.[0];
  if (error || !row) {
    console.error("record_run failed", error);
    return reply({ status: "error" }, 500);
  }
  return reply({ status: row.status, rank: row.rank, best: row.best, score: sim.score });
});
