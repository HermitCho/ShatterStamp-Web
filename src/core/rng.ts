/** 시드를 줄 수 있는 난수(mulberry32). 테스트·시뮬레이션에서 같은 판을 다시 만들 수 있다. */
export class Rng {
  private s: number;

  constructor(seed = 0) {
    this.s = seed !== 0 ? seed >>> 0 : (Math.random() * 2 ** 32) >>> 0;
  }

  /** 0 이상 1 미만 */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** min 이상 max 이하 정수 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** 같은 상태에서 이어지는 복사본(미리보기에서 앞으로 나올 값을 그대로 미리 계산할 때) */
  clone(): Rng {
    const r = new Rng(1);
    r.s = this.s;
    return r;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}
