/** 배경 음악 세 곡을 화면과 따로(백그라운드 스레드에서) 만든다. 다 만든 곡부터 하나씩 돌려보낸다. */
import { makeFever, makeGame, makeTitle } from "./music.ts";

const makers: [string, () => Float32Array][] = [["title", makeTitle], ["game", makeGame], ["fever", makeFever]];
self.onmessage = () => {
  for (const [name, make] of makers) {
    const data = make();
    (self as unknown as Worker).postMessage({ name, data }, [data.buffer]);
  }
};
