// Shatter Stamp: 손님 기록을 Google 계정으로 옮기기 (Supabase Edge Function, Deno)
//
// 손님으로 하던 사람이 Google로 로그인하면, 게임은 로그인 직전에 들고 있던 손님 로그인 토큰을 함께 보낸다.
// 1. Authorization 머리글의 토큰: 막 로그인한 Google 계정(손님이 아니어야 한다)
// 2. 본문 guest: 같은 브라우저가 들고 있던 손님 계정의 토큰(손님이어야 한다)
// 두 토큰을 모두 인증 서버에 확인했으면 같은 사람이 가진 두 계정이다. DB 함수 merge_guest 가 기록을 옮기고
// (높은 쪽이 남는다), 여기서 빈 손님 계정을 지운다. 남의 손님 계정은 그 토큰이 없으니 옮길 수 없다.
import { admin, bearer, serve, userOf } from "../_shared/server.ts";

serve(8 * 1024, async (req, body, reply) => {
  const user = await userOf(bearer(req));
  if (!user || user.is_anonymous) return reply({ status: "signed_out" }, 401);
  const guest = typeof body.guest === "string" ? await userOf(body.guest) : null;
  if (!guest || !guest.is_anonymous) return reply({ status: "not_guest" });
  if (guest.id === user.id) return reply({ status: "same" });

  const { data, error } = await admin.rpc("merge_guest", { p_guest: guest.id, p_user: user.id });
  if (error) {
    console.error("merge_guest failed", error);
    return reply({ status: "error" }, 500);
  }
  if (data !== "ok") return reply({ status: String(data) });
  const del = await admin.auth.admin.deleteUser(guest.id);
  if (del.error) console.warn("guest delete failed", { guest: guest.id, error: del.error.message });
  return reply({ status: "ok" });
});
