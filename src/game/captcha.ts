import { TURNSTILE_SITE_KEY } from "./online-config.ts";

/**
 * 사람인지 확인(Cloudflare Turnstile). 손님 계정을 만들 때 한 번 쓴다.
 * 보통은 아무것도 보이지 않고 끝난다. 확인이 더 필요할 때만 화면 아래에 작은 확인 칸이 잠깐 뜬다.
 * 사이트 키가 없으면 확인 없이 "" 를, 실패하면 null 을 돌려준다.
 */

interface Turnstile {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  remove(id: string): void;
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<Turnstile> | null = null;

function load(): Promise<Turnstile> {
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => {
      const ts = (window as unknown as { turnstile?: Turnstile }).turnstile;
      if (ts) resolve(ts);
      else reject(new Error("turnstile missing"));
    };
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile load failed"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export async function captchaToken(lang: "ko" | "en"): Promise<string | null> {
  if (!TURNSTILE_SITE_KEY) return "";
  let ts: Turnstile;
  try {
    ts = await load();
  } catch {
    return null;
  }
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:50%;bottom:max(12px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:12";
  document.body.appendChild(box);
  return new Promise<string | null>((resolve) => {
    let id = "";
    const done = (v: string | null) => {
      clearTimeout(timer);
      try {
        if (id) ts.remove(id);
      } catch {
        /* 이미 없어짐 */
      }
      box.remove();
      resolve(v);
    };
    // 확인이 끝나지 않으면(창을 그냥 두는 등) 손님 계정 없이 그대로 플레이한다
    const timer = setTimeout(() => done(null), 60_000);
    id = ts.render(box, {
      sitekey: TURNSTILE_SITE_KEY,
      appearance: "interaction-only",
      theme: "dark",
      language: lang,
      action: "guest",
      callback: (token: string) => done(token),
      "error-callback": () => done(null),
      "expired-callback": () => done(null),
    });
  });
}
