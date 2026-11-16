/**
 * Supabase 프로젝트 연결 정보 (대시보드 → Project Settings → API).
 * 둘 다 원래 브라우저에 공개되는 값이다. 권한은 DB의 RLS 규칙(supabase/schema.sql)이 지킨다.
 * 비어 있으면 랭킹 기능이 "준비 중"으로 보이고 게임은 그대로 동작한다.
 */
export const SUPABASE_URL: string = "https://brydmjqtutbgphkzsocl.supabase.co";
export const SUPABASE_ANON_KEY: string = "sb_publishable_Js99KjURVnUDJDBS79Bd2w_Wc8Oe4tv";
/**
 * Cloudflare Turnstile 사이트 키(공개용). 손님 계정을 만들 때 사람인지 보이지 않게 확인한다.
 * 비어 있으면 확인 없이 손님 계정을 만든다(Supabase 쪽 CAPTCHA 설정도 꺼 둬야 한다).
 * 비밀 키는 여기 두지 않는다. Supabase 대시보드(Authentication → Attack Protection)에만 넣는다.
 */
export const TURNSTILE_SITE_KEY: string = "0x4AAAAAAGDFcW35fkKEXxJh";
