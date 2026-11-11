import { t, type TextKey } from "./i18n.ts";
import { FONT, SKIN } from "./skin.ts";

/**
 * 닉네임 입력 창. 캔버스는 글자 입력(한글 조합, 모바일 키보드)을 직접 받기 어려워
 * 화면 위에 HTML 입력칸을 잠깐 띄운다. 모양은 메뉴처럼 상자 없이 글자·밑줄·빛으로만 꾸민다.
 *
 * submit 은 성공하면 null, 실패하면 보여 줄 문구 키를 돌려준다. 성공하거나 취소하면 창을 닫는다.
 */
export function askNickname(
  current: string,
  submit: (name: string) => Promise<TextKey | null>,
  onClose: () => void,
  canCancel = true,
): void {
  if (document.getElementById("nick-overlay")) return;
  const root = document.createElement("div");
  root.id = "nick-overlay";
  root.innerHTML = `
    <style>
      #nick-overlay { position: fixed; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center;
        background: rgba(5, 3, 14, 0.88); font-family: ${FONT}; font-weight: 700; color: ${SKIN.text}; }
      #nick-overlay .box { width: min(86vw, 420px); text-align: center; transform: rotate(-1.5deg); }
      #nick-overlay h2 { margin: 0 0 6px; font-size: 30px; text-shadow: 0 0 14px ${SKIN.accent}88; }
      #nick-overlay p { margin: 0; font-size: 15px; color: ${SKIN.muted}; }
      #nick-overlay input { width: 100%; box-sizing: border-box; margin: 26px 0 8px; padding: 8px 4px; font: inherit; font-size: 26px;
        text-align: center; color: ${SKIN.text}; background: transparent; border: 0; border-bottom: 3px solid ${SKIN.accent};
        outline: none; box-shadow: 0 10px 14px -12px ${SKIN.accent}; }
      #nick-overlay .err { min-height: 22px; color: ${SKIN.score}; font-size: 15px; }
      #nick-overlay .row { display: flex; justify-content: center; gap: 34px; margin-top: 18px; }
      #nick-overlay button { font: inherit; font-size: 22px; background: transparent; border: 0; padding: 8px 14px; cursor: pointer; color: ${SKIN.text}; }
      #nick-overlay button.ok { color: ${SKIN.accent}; border: 3px solid ${SKIN.accent}; border-radius: 12px; box-shadow: 0 0 16px ${SKIN.accent}66;
        transform: rotate(-3deg); padding: 6px 26px; }
      #nick-overlay button:disabled { opacity: 0.5; cursor: default; }
    </style>
    <form class="box" autocomplete="off">
      <h2></h2>
      <p class="hint"></p>
      <input maxlength="12" enterkeyhint="done" />
      <div class="err"></div>
      <div class="row"><button type="button" class="cancel"></button><button type="submit" class="ok"></button></div>
    </form>`;
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  $("h2").textContent = t("NICK_TITLE");
  $(".hint").textContent = t("NICK_HINT");
  $(".ok").textContent = t("NICK_OK");
  const cancel = $<HTMLButtonElement>(".cancel");
  cancel.textContent = t("NICK_CANCEL");
  if (!canCancel) cancel.style.display = "none";
  const input = $<HTMLInputElement>("input");
  input.value = current;
  const err = $(".err");
  const close = () => {
    root.remove();
    onClose();
  };
  cancel.addEventListener("click", close);
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && canCancel) close();
  });
  $<HTMLFormElement>("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = $<HTMLButtonElement>(".ok");
    ok.disabled = true;
    err.textContent = "";
    const fail = await submit(input.value);
    ok.disabled = false;
    if (fail) {
      err.textContent = t(fail);
      input.focus();
    } else close();
  });
  document.body.appendChild(root);
  input.focus();
}
