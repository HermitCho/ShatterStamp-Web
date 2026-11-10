import { Rng } from "./rng.ts";
import { getShape, SHAPES, type Shape } from "./shapes.ts";

/**
 * "주머니 섞기"(bag) 방식 모양 큐.
 * 모든 모양을 한 주머니에 넣고 섞어서 하나씩 꺼낸다. 주머니가 비면 다시 채운다.
 * 같은 모양이 지나치게 반복되거나 오래 안 나오는 불운을 막는다.
 */
export class ShapeQueue {
  private rng: Rng;
  private bag: number[] = [];
  private queue: Shape[] = [];

  constructor(seed = 0) {
    this.rng = new Rng(seed);
  }

  peek(count: number): Shape[] {
    while (this.queue.length < count) this.queue.push(this.drawOne());
    return this.queue.slice(0, count);
  }

  pop(): Shape {
    this.peek(1);
    return this.queue.shift()!;
  }

  private drawOne(): Shape {
    if (this.bag.length === 0) this.refill();
    return getShape(this.bag.pop()!);
  }

  private refill(): void {
    this.bag = SHAPES.map((_, i) => i);
    for (let i = this.bag.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
    }
  }
}
