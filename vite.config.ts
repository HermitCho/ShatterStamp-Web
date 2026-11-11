import { defineConfig, type Plugin } from "vite";
import { SUPABASE_URL } from "./src/game/online-config.ts";

/**
 * 배포용 빌드에만 콘텐츠 보안 정책(CSP)을 넣는다. GitHub Pages는 응답 헤더를 못 바꾸므로 <meta>로 넣는다.
 * - 스크립트는 우리 사이트 파일만 실행한다(끼어든 스크립트·인라인 스크립트 차단 → 로그인 토큰 탈취 방지).
 * - 서버 통신은 우리 사이트와 Supabase 프로젝트로만 보낼 수 있다(데이터를 다른 곳으로 빼돌리지 못하게).
 * 개발 서버는 빠른 새로고침(HMR)이 인라인 코드를 써서 넣지 않는다.
 */
function contentSecurityPolicy(): Plugin {
  const supabase = SUPABASE_URL ? ` ${SUPABASE_URL}` : "";
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // 첫 화면 글꼴·닉네임 입력 창의 <style>
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${supabase}`,
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" },
      { tag: "meta", attrs: { name: "referrer", content: "strict-origin-when-cross-origin" }, injectTo: "head-prepend" },
    ],
  };
}

// GitHub Pages 같은 하위 경로에서도 열리도록 상대 경로로 빌드한다.
export default defineConfig({
  base: "./",
  build: { target: "es2022", outDir: "dist" },
  plugins: [contentSecurityPolicy()],
});
