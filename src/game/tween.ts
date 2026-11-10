/** 아주 작은 애니메이션 도구: 단계(시간, 갱신 함수)를 차례로 실행한다. */
export type Ease = (k: number) => number;

export const ease = {
  linear: (k: number) => k,
  inQuad: (k: number) => k * k,
  outCubic: (k: number) => 1 - (1 - k) ** 3,
  outBack: (k: number) => {
    const c = 1.70158;
    return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2;
  },
};

interface Step {
  dur: number;
  fn?: (k: number) => void;
  done?: () => void;
}

export class Seq {
  private steps: Step[] = [];
  private i = 0;
  private t = 0;
  dead = false;

  /** dur 동안 fn(0→1)을 부른다. */
  to(dur: number, fn: (k: number) => void, e: Ease = ease.linear): this {
    this.steps.push({ dur, fn: (k) => fn(e(k)) });
    return this;
  }

  wait(dur: number): this {
    if (dur > 0) this.steps.push({ dur });
    return this;
  }

  call(done: () => void): this {
    this.steps.push({ dur: 0, done });
    return this;
  }

  kill(): void {
    this.dead = true;
  }

  /** 끝났으면 true */
  update(dt: number): boolean {
    if (this.dead) return true;
    while (this.i < this.steps.length) {
      const s = this.steps[this.i];
      this.t += dt;
      const k = s.dur > 0 ? Math.min(1, this.t / s.dur) : 1;
      s.fn?.(k);
      if (k < 1) return false;
      s.done?.();
      dt = s.dur > 0 ? this.t - s.dur : dt * 0;
      this.t = 0;
      this.i++;
      if (dt <= 0) dt = 0;
    }
    this.dead = true;
    return true;
  }
}

/** 여러 Seq를 한꺼번에 돌린다. */
export class Tweens {
  private list: Seq[] = [];

  add(): Seq {
    const s = new Seq();
    this.list.push(s);
    return s;
  }

  /**
   * 돌리는 도중 콜백이 새 Seq를 add()하거나 clear()해도 잃지 않게 한다.
   * (돌리는 목록을 따로 떼어 두고, 그 사이 새로 들어온 것은 뒤에 붙인다. clear()되었으면 남은 것은 버린다.)
   */
  update(dt: number): void {
    const running = this.list;
    this.list = [];
    const gen = this.gen;
    const keep = running.filter((s) => !s.update(dt));
    this.list = gen === this.gen ? keep.concat(this.list) : this.list;
  }

  clear(): void {
    this.list = [];
    this.gen++;
  }

  private gen = 0;
}
