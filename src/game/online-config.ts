/**
 * Supabase 프로젝트 연결 정보 (대시보드 → Project Settings → API).
 * 둘 다 원래 브라우저에 공개되는 값이다. 권한은 DB의 RLS 규칙(supabase/schema.sql)이 지킨다.
 * 비어 있으면 랭킹 기능이 "준비 중"으로 보이고 게임은 그대로 동작한다.
 */
export const SUPABASE_URL: string = "https://brydmjqtutbgphkzsocl.supabase.co";
export const SUPABASE_ANON_KEY: string = "sb_publishable_Js99KjURVnUDJDBS79Bd2w_Wc8Oe4tv";
