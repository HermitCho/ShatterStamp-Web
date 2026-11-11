// Shatter Stamp: 한 판 기록 검증 후 랭킹 등록 (Supabase Edge Function, Deno)
//
// 1. 로그인 토큰으로 누구인지 확인한다(브라우저가 보낸 사용자 번호는 받지 않는다).
// 2. 판 표(runs)에서 그 사람의 시드를 꺼낸다. 남의 표·쓴 표는 못 쓴다.
// 3. 게임과 같은 규칙 코드(_shared/core, src/core 복사본)로 판을 처음부터 다시 돌려 점수를 직접 계산한다.
// 4. 계산한 점수만 record_run 으로 넣는다(표 사용 처리, 실제 시간 검사, 하루 횟수 검사는 DB 함수가 한다).
//
// 배포: README의 "점수 검증 서버 함수" 참고. 규칙 코드를 바꾸면 tools/sync-edge.ts 를 돌린 뒤 다시 배포한다.
import { createClient } from "npm:@supabase/supabase-js@2";
import { REPLAY_VERSION, simulateRun } from "../_shared/core/replay.ts";

/** 이 주소에서 연 게임만 브라우저가 응답을 읽을 수 있다 */
const ALLOWED_ORIGINS = [
  "https://hermitcho.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];
const MAX_BODY = 256 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Supabase가 함수에 자동으로 넣어 주는 서버 전용 키. 코드·저장소에는 없다. */
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    const map = JSON.parse(keys) as Record<string, string>;
    const key = map.default ?? Object.values(map)[0];
    if (key) return key;
  }
  throw new Error("service key missing");
}

const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
  const reply = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ status: "bad_request" }, 405);

  // 1. 누구인지: 로그인 토큰을 인증 서버에 확인한다(위조·만료 토큰은 여기서 걸린다)
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return reply({ status: "signed_out" }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  const uid = auth?.user?.id;
  if (authError || !uid) return reply({ status: "signed_out" }, 401);

  // 요청 본문: 너무 크거나 모양이 이상하면 거절
  const raw = await req.text();
  if (raw.length > MAX_BODY) return reply({ status: "invalid" }, 413);
  let body: { run?: unknown; replay?: unknown; score?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ status: "invalid" }, 400);
  }
  const runId = body?.run;
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
