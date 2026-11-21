// Sokoban solver — push-optimal, own implementation (make.fun entry).
// Approach: room decomposition (rooms are independent — boxes never leave
// their room) + breadth-first search over pushes per room, state = sorted
// box squares + lowest square of the player's reachable region. Prunes:
// dead squares (a box that can never reach a goal) and frozen 2x2 blocks.
// BFS by pushes => first solved state is push-optimal. No clock: the only
// cutoff is a state cap per room, so output is deterministic.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MAX_STATES = 250_000;

type Level = {
  w: number;
  h: number;
  wall: Uint8Array;
  goals: number[];
  boxes: number[];
  player: number;
};

type Room = {
  squares: number[];
  boxes: number[];
  goals: number[];
  done?: boolean;
};

type Solved = {
  pushes: number;
  moves: string;
  states: number;
  rooms?: number;
};

const DIRS: Array<[number, number, string, string]> = [
  [0, -1, 'u', 'U'],
  [0, 1, 'd', 'D'],
  [-1, 0, 'l', 'L'],
  [1, 0, 'r', 'R'],
];

export function parseLevel(text: string): Level {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall = new Uint8Array(w * h).fill(1);
  const goals: number[] = [];
  const boxes: number[] = [];
  let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const i = y * w + x;
      if (ch === '#') continue;
      wall[i] = 0;
      if (ch === '.' || ch === '*' || ch === '+') goals.push(i);
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) wall[y * w + x] = 1;
    }
  }
  return { w, h, wall, goals, boxes: boxes.sort((a, b) => a - b), player };
}

// Squares from which a lone box can be pushed onto some goal: pull back
// from the goals. A box on a non-live square is dead.
export function liveSquares(level: Level): Uint8Array {
  const { w, wall, goals } = level;
  const live = new Uint8Array(wall.length);
  const queue = [...goals];
  for (const g of goals) live[g] = 1;
  for (let qi = 0; qi < queue.length; qi++) {
    const x = queue[qi];
    for (const [dx, dy] of DIRS) {
      const d = dy * w + dx;
      const y = x - d; // box at y, pushed in direction d, lands on x
      if (!wall[y] && !wall[y - d] && !live[y]) {
        live[y] = 1;
        queue.push(y);
      }
    }
  }
  return live;
}

// Flood fill from `from` avoiding walls and `occupied` boxes. Returns the
// lowest reachable square and marks the region in `seen` with `stamp`.
function reachRegion(
  level: Level,
  occupied: Uint8Array,
  from: number,
  seen: Int32Array,
  stamp: number,
  stack: Int32Array,
): number {
  const { w, wall } = level;
  let low = from;
  let n = 0;
  stack[n++] = from;
  seen[from] = stamp;
  while (n > 0) {
    const p = stack[--n];
    if (p < low) low = p;
    const x = p % w;
    if (p - w >= 0 && wall[p - w] === 0 && occupied[p - w] === 0 && seen[p - w] !== stamp) {
      seen[p - w] = stamp; stack[n++] = p - w;
    }
    if (p + w < wall.length && wall[p + w] === 0 && occupied[p + w] === 0 && seen[p + w] !== stamp) {
      seen[p + w] = stamp; stack[n++] = p + w;
    }
    if (x > 0 && wall[p - 1] === 0 && occupied[p - 1] === 0 && seen[p - 1] !== stamp) {
      seen[p - 1] = stamp; stack[n++] = p - 1;
    }
    if (x < w - 1 && wall[p + 1] === 0 && occupied[p + 1] === 0 && seen[p + 1] !== stamp) {
      seen[p + 1] = stamp; stack[n++] = p + 1;
    }
  }
  return low;
}

// True when the box just pushed to `t` is part of a frozen 2x2 block of
// walls/boxes with a box off its goal inside it.
function frozenBlock(level: Level, occupied: Uint8Array, goal: Uint8Array, t: number): boolean {
  const { w, h, wall } = level;
  const tx = t % w;
  const ty = Math.floor(t / w);
  for (let oy = -1; oy <= 0; oy++) {
    for (let ox = -1; ox <= 0; ox++) {
      const ax = tx + ox;
      const ay = ty + oy;
      if (ax < 0 || ay < 0 || ax + 1 >= w || ay + 1 >= h) continue;
      const cells = [ay * w + ax, ay * w + ax + 1, (ay + 1) * w + ax, (ay + 1) * w + ax + 1];
      let full = true;
      let offGoal = false;
      for (const c of cells) {
        if (!(wall[c] || occupied[c])) { full = false; break; }
        if (occupied[c] && !goal[c]) offGoal = true;
      }
      if (full && offGoal) return true;
    }
  }
  return false;
}

// Shortest walk from `from` to `to` around walls and boxes (lowercase LURD).
function walkTo(level: Level, occupied: Uint8Array, from: number, to: number): string {
  const { w, wall } = level;
  if (from === to) return '';
  const prev = new Int32Array(wall.length).fill(-1);
  const how: string[] = new Array(wall.length);
  const queue = [from];
  prev[from] = from;
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    if (p === to) break;
    for (const [dx, dy, letter] of DIRS) {
      const q = p + dy * w + dx;
      if (wall[q] || occupied[q] || prev[q] !== -1) continue;
      prev[q] = p;
      how[q] = letter;
      queue.push(q);
    }
  }
  if (prev[to] === -1) throw new Error('walkTo: push square out of reach');
  let s = '';
  for (let p = to; p !== from; p = prev[p]) s = how[p] + s;
  return s;
}

// A state key must be injective: base 1024 exceeds every square index
// this generator can draw (boards are at most 15x17 = 255 squares), and
// with 4 boxes the key stays far below 2^53, so no two states collide.
function stateKey(boxes: number[], low: number): number {
  let k = low;
  for (const b of boxes) k = k * 1024 + b;
  return k;
}

// Push-optimal solution of one (sub-)level: { pushes, moves } or null.
export function solvePushOptimal(level: Level, maxStates: number = MAX_STATES): Solved | null {
  const { w, wall, goals } = level;
  const size = wall.length;
  const goal = new Uint8Array(size);
  for (const g of goals) goal[g] = 1;
  const live = liveSquares(level);
  if (level.boxes.some((b) => !live[b])) return null;
  const occupied = new Uint8Array(size);
  const seen = new Int32Array(size);
  const mark = new Int32Array(size);
  const stack = new Int32Array(size);
  let stamp = 0;

  const solved = (boxes: number[]): boolean => boxes.every((b) => goal[b]);
  const boxesList: number[][] = [level.boxes];
  const playerList: number[] = [level.player];
  const parent: number[] = [-1];
  const pushFrom: number[] = [-1];
  const pushTo: number[] = [-1];
  const index = new Map<number, number>();
  for (const b of level.boxes) occupied[b] = 1;
  index.set(stateKey(level.boxes, reachRegion(level, occupied, level.player, seen, ++stamp, stack)), 0);
  for (const b of level.boxes) occupied[b] = 0;

  let found = solved(level.boxes) ? 0 : -1;
  for (let head = 0; found < 0 && head < boxesList.length; head++) {
    const boxes = boxesList[head];
    for (const b of boxes) occupied[b] = 1;
    reachRegion(level, occupied, playerList[head], seen, ++stamp, stack);
    const region = stamp;
    for (let bi = 0; bi < boxes.length && found < 0; bi++) {
      const b = boxes[bi];
      for (const [dx, dy] of DIRS) {
        const d = dy * w + dx;
        const t = b + d;
        // player must stand at b-d to push; target must be open, live, unoccupied
        if (seen[b - d] !== region || wall[t] || occupied[t] || !live[t]) continue;
        occupied[b] = 0;
        occupied[t] = 1;
        if (frozenBlock(level, occupied, goal, t)) {
          occupied[t] = 0;
          occupied[b] = 1;
          continue;
        }
        const next = boxes.slice();
        next[bi] = t;
        next.sort((x, y) => x - y);
        const key = stateKey(next, reachRegion(level, occupied, b, mark, ++stamp, stack));
        occupied[t] = 0;
        occupied[b] = 1;
        if (index.has(key)) continue;
        if (boxesList.length >= maxStates) {
          for (const x of boxes) occupied[x] = 0;
          return null;
        }
        index.set(key, boxesList.length);
        boxesList.push(next);
        playerList.push(b); // after the push the player stands where the box was
        parent.push(head);
        pushFrom.push(b);
        pushTo.push(t);
        if (solved(next)) {
          found = boxesList.length - 1;
          break;
        }
      }
    }
    for (const x of boxes) occupied[x] = 0;
  }
  if (found < 0) return null;

  const path: number[] = [];
  for (let s = found; s > 0; s = parent[s]) path.push(s);
  path.reverse();
  let moves = '';
  let player = level.player;
  let boxes = level.boxes;
  for (const s of path) {
    const from = pushFrom[s];
    const to = pushTo[s];
    const d = to - from;
    const dir = DIRS.find(([dx, dy]) => dy * w + dx === d);
    if (dir === undefined) throw new Error('reconstruction: no direction for push');
    for (const b of boxes) occupied[b] = 1;
    moves += walkTo(level, occupied, player, from - d);
    for (const b of boxes) occupied[b] = 0;
    moves += dir[3];
    player = from;
    boxes = boxesList[s];
  }
  return { pushes: path.length, moves, states: boxesList.length };
}

// Rooms: cut the dead squares of the player's row (the hallway) out of the
// floor; each remaining part holding boxes is a room. Null when malformed.
export function roomsOf(level: Level): Room[] | null {
  const { w, wall, goals, boxes, player } = level;
  const live = liveSquares(level);
  const row = Math.floor(player / w);
  const cut = new Uint8Array(wall.length);
  for (let i = row * w; i < (row + 1) * w; i++) if (!wall[i] && !live[i]) cut[i] = 1;
  if (boxes.some((b) => cut[b])) return null;
  const part = new Int32Array(wall.length).fill(-1);
  const rooms: Room[] = [];
  for (let s = 0; s < wall.length; s++) {
    if (wall[s] || cut[s] || part[s] >= 0) continue;
    const squares = [s];
    part[s] = rooms.length;
    for (let i = 0; i < squares.length; i++) {
      const p = squares[i];
      const x = p % w;
      const nbs: number[] = [];
      if (p - w >= 0) nbs.push(p - w);
      if (p + w < wall.length) nbs.push(p + w);
      if (x > 0) nbs.push(p - 1);
      if (x < w - 1) nbs.push(p + 1);
      for (const q of nbs) {
        if (!wall[q] && !cut[q] && part[q] < 0) {
          part[q] = rooms.length;
          squares.push(q);
        }
      }
    }
    rooms.push({ squares, boxes: [], goals: [] });
  }
  for (const b of boxes) rooms[part[b]].boxes.push(b);
  for (const g of goals) if (part[g] >= 0) rooms[part[g]].goals.push(g);
  if (goals.some((g) => part[g] < 0)) return null;
  if (rooms.some((r) => r.boxes.length !== r.goals.length)) return null;
  return rooms.filter((r) => r.boxes.length > 0);
}

// Solve room by room: other rooms' boxes stand as walls; the player walks on
// from where the last room left it. Returns { pushes, moves } or null.
export function solveByRooms(level: Level, maxStates: number = MAX_STATES): Solved | null {
  const rooms = roomsOf(level);
  if (rooms === null) return solvePushOptimal(level, maxStates);
  let player = level.player;
  let pushes = 0;
  let moves = '';
  let totalStates = 0;
  for (const room of rooms) {
    const wall = level.wall.slice();
    for (const other of rooms) {
      if (other === room) continue;
      for (const b of other.done ? other.goals : other.boxes) wall[b] = 1;
    }
    const sub: Level = {
      w: level.w,
      h: level.h,
      wall,
      goals: room.goals.slice().sort((a, b) => a - b),
      boxes: room.boxes.slice().sort((a, b) => a - b),
      player,
    };
    const solved = solvePushOptimal(sub, maxStates);
    if (solved === null) return null;
    pushes += solved.pushes;
    moves += solved.moves;
    totalStates += solved.states;
    player = endOf(level.w, player, solved.moves);
    room.done = true;
  }
  return { pushes, moves, states: totalStates, rooms: rooms.length };
}

function endOf(w: number, from: number, moves: string): number {
  let p = from;
  for (const ch of moves.toLowerCase()) p += ch === 'u' ? -w : ch === 'd' ? w : ch === 'l' ? -1 : 1;
  return p;
}

// Entry point: node /bot/main.ts — reads every <id>/level.txt under
// $MAKEFUN_INPUT_DIR (/input), writes <id>/solution.txt under
// $MAKEFUN_OUTPUT_DIR (/output). No clock, no randomness, no network:
// two runs on the same set write byte-identical solutions.
const I: string = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O: string = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const level = parseLevel(readFileSync(join(I, id, 'level.txt'), 'utf8'));
  const res = solveByRooms(level);
  const moves = res === null ? '' : res.moves;
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'solution.txt'), `${moves}\n`);
}
