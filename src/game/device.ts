/** 손가락으로 하는 기기인지(휴대폰·태블릿). 키보드·마우스 안내를 빼고 터치 안내를 보여 줄 때 쓴다. */
const coarse = typeof matchMedia === "function" ? matchMedia("(pointer: coarse)") : null;

export function touchUI(): boolean {
  return coarse?.matches ?? false;
}
