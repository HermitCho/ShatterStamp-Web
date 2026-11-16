// 서버 함수(submit-run, merge-guest)가 함께 쓰는 것: 관리자 연결, 허용 주소(CORS), 응답 만들기, 로그인 확인.
import { createClient, type User } from "npm:@supabase/supabase-js@2";

/** 이 주소에서 연 게임만 브라우저가 응답을 읽을 수 있다 */
const ALLOWED_ORIGINS = [
  "https://hermitcho.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

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

export const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), {
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

export type Reply = (body: Record<string, unknown>, status?: number) => Response;

/**
 * POST만 받는 함수 뼈대. OPTIONS(브라우저 사전 확인)와 다른 방법은 여기서 처리한다.
 * 본문이 maxBody보다 크거나 JSON이 아니면 handler를 부르지 않고 거절한다.
 */
export function serve(maxBody: number, handler: (req: Request, body: Record<string, unknown>, reply: Reply) => Promise<Response>): void {
  Deno.serve(async (req) => {
    const cors = corsHeaders(req.headers.get("origin"));
    const reply: Reply = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return reply({ status: "bad_request" }, 405);
    const raw = await req.text();
    if (raw.length > maxBody) return reply({ status: "invalid" }, 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply({ status: "invalid" }, 400);
    }
    if (!body || typeof body !== "object") return reply({ status: "invalid" }, 400);
    return handler(req, body as Record<string, unknown>, reply);
  });
}

/** 로그인 토큰을 인증 서버에 확인한다(위조·만료 토큰은 null) */
export async function userOf(token: string): Promise<User | null> {
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data?.user ?? null;
}

/** 요청의 Authorization 머리글에서 로그인 토큰을 꺼낸다 */
export function bearer(req: Request): string {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
}
