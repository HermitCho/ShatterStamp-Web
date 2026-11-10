/**
 * 부수기 모양 정의. 회전 없이 방향별 변형을 각각 별도 모양으로 둔다.
 * 모든 모양은 가로·세로 칸 수가 홀수(1·3·5)이고 정가운데 칸을 포함한다
 * → 마우스가 가리키는 칸이 항상 모양의 정중앙이 된다. 좌표는 정가운데가 (0,0).
 */
export interface Cell {
  x: number;
  y: number;
}

export interface Shape {
  id: string;
  cells: Cell[];
}

const c = (x: number, y: number): Cell => ({ x, y });

export const SHAPES: Shape[] = [
  { id: "I3H", cells: [c(-1, 0), c(0, 0), c(1, 0)] },
  { id: "I3V", cells: [c(0, -1), c(0, 0), c(0, 1)] },
  { id: "I5H", cells: [c(-2, 0), c(-1, 0), c(0, 0), c(1, 0), c(2, 0)] },
  { id: "I5V", cells: [c(0, -2), c(0, -1), c(0, 0), c(0, 1), c(0, 2)] },
  { id: "DIAG_A", cells: [c(-1, -1), c(0, 0), c(1, 1)] },
  { id: "DIAG_B", cells: [c(1, -1), c(0, 0), c(-1, 1)] },
  { id: "PLUS", cells: [c(0, -1), c(-1, 0), c(0, 0), c(1, 0), c(0, 1)] },
  { id: "X", cells: [c(-1, -1), c(1, -1), c(0, 0), c(-1, 1), c(1, 1)] },
  // 큰 T: 한 줄 3칸 + 가운데 기둥
  { id: "T_DOWN", cells: [c(-1, -1), c(0, -1), c(1, -1), c(0, 0), c(0, 1)] },
  { id: "T_UP", cells: [c(0, -1), c(0, 0), c(-1, 1), c(0, 1), c(1, 1)] },
  { id: "T_RIGHT", cells: [c(-1, -1), c(-1, 0), c(-1, 1), c(0, 0), c(1, 0)] },
  { id: "T_LEFT", cells: [c(1, -1), c(1, 0), c(1, 1), c(0, 0), c(-1, 0)] },
  // 3x3 안의 S / Z (세로·가로)
  { id: "S_V", cells: [c(-1, -1), c(0, -1), c(0, 0), c(0, 1), c(1, 1)] },
  { id: "Z_V", cells: [c(1, -1), c(0, -1), c(0, 0), c(0, 1), c(-1, 1)] },
  { id: "S_H", cells: [c(-1, -1), c(-1, 0), c(0, 0), c(1, 0), c(1, 1)] },
  { id: "Z_H", cells: [c(-1, 1), c(-1, 0), c(0, 0), c(1, 0), c(1, -1)] },
];

/** idx번 모양. 셀 좌표는 모양을 감싸는 상자의 정가운데가 (0,0)이 되도록 맞춘다. */
export function getShape(idx: number): Shape {
  const def = SHAPES[idx];
  return { id: def.id, cells: centered(def.cells) };
}

export function centered(cells: Cell[]): Cell[] {
  let mnx = cells[0].x, mny = cells[0].y, mxx = mnx, mxy = mny;
  for (const p of cells) {
    mnx = Math.min(mnx, p.x);
    mny = Math.min(mny, p.y);
    mxx = Math.max(mxx, p.x);
    mxy = Math.max(mxy, p.y);
  }
  const cx = Math.trunc((mnx + mxx) / 2);
  const cy = Math.trunc((mny + mxy) / 2);
  return cells.map((p) => ({ x: p.x - cx, y: p.y - cy }));
}
