// Pure game logic for 连连看 (Onet / Lianliankan): board generation and the
// classic "connect with at most 2 turns, travelling through empty cells and the
// outer border" path-finding. No React here so it can be reasoned about/tested.

// Mixed emoji pool (fruits, animals, faces, food, nature, objects...).
export const EMOJIS = [
  "🍎", "🍊", "🍋", "🍇", "🍉", "🍓", "🍑", "🍍",
  "🐶", "🐱", "🐰", "🐼", "🐸", "🦊", "🐷", "🐵",
  "😀", "😎", "🥳", "😍", "🤖", "👻", "🎃", "💩",
  "⭐", "🌈", "🌸", "🍀", "🔥", "💧", "⚡", "❄️",
  "⚽", "🎧", "🎸", "🚀", "💎", "🎁", "🏀", "🍕",
];

// Level configuration: bigger board + more kinds + less time each level.
export const LEVELS = [
  { rows: 6, cols: 8, kinds: 12, time: 180, hints: 3, shuffles: 2 },
  { rows: 8, cols: 10, kinds: 18, time: 240, hints: 3, shuffles: 2 },
  { rows: 10, cols: 12, kinds: 24, time: 300, hints: 2, shuffles: 1 },
];

let nextId = 1;

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A cell is blocked if it holds a (not-yet-matched) tile. Anything outside the
// board (the border ring, index -1..rows / -1..cols) is always passable.
function isBlocked(board, rows, cols, r, c) {
  if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
  const cell = board[r][c];
  return cell !== null && !cell.matched;
}

// True if a and b are on the same row/col and all cells strictly between are free.
function straightClear(board, rows, cols, a, b) {
  if (a.r === b.r) {
    const c1 = Math.min(a.c, b.c);
    const c2 = Math.max(a.c, b.c);
    for (let c = c1 + 1; c < c2; c++) {
      if (isBlocked(board, rows, cols, a.r, c)) return false;
    }
    return true;
  }
  if (a.c === b.c) {
    const r1 = Math.min(a.r, b.r);
    const r2 = Math.max(a.r, b.r);
    for (let r = r1 + 1; r < r2; r++) {
      if (isBlocked(board, rows, cols, r, a.c)) return false;
    }
    return true;
  }
  return false;
}

function straightPath(board, rows, cols, a, b) {
  return straightClear(board, rows, cols, a, b) ? [a, b] : null;
}

// One turn: an L-shaped path through an empty corner point.
function oneTurnPath(board, rows, cols, a, b) {
  const corners = [
    { r: a.r, c: b.c },
    { r: b.r, c: a.c },
  ];
  for (const corner of corners) {
    if (isBlocked(board, rows, cols, corner.r, corner.c)) continue;
    if (
      straightClear(board, rows, cols, a, corner) &&
      straightClear(board, rows, cols, corner, b)
    ) {
      return [a, corner, b];
    }
  }
  return null;
}

function le1Path(board, rows, cols, a, b) {
  return (
    straightPath(board, rows, cols, a, b) || oneTurnPath(board, rows, cols, a, b)
  );
}

// Returns the connecting path (array of points) if a and b (both tiles) can be
// linked with 0, 1 or 2 turns; otherwise null.
export function connectPath(board, rows, cols, a, b) {
  const ca = board[a.r][a.c];
  const cb = board[b.r][b.c];
  if (!ca || !cb) return null;
  if (ca.icon !== cb.icon) return null;
  if (a.r === b.r && a.c === b.c) return null;

  const direct = le1Path(board, rows, cols, a, b);
  if (direct) return direct;

  // Two turns: pick an intermediate empty point P reachable straight from A,
  // then connect P to B with <=1 turn. Search the board plus one border ring.
  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      if (r === a.r && c === a.c) continue;
      if (isBlocked(board, rows, cols, r, c)) continue;
      const p = { r, c };
      if (!straightClear(board, rows, cols, a, p)) continue;
      const sub = le1Path(board, rows, cols, p, b);
      if (sub) return [a, ...sub];
    }
  }
  return null;
}

// Coordinates of all remaining (unmatched) tiles.
function remainingCoords(board, rows, cols) {
  const coords = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      if (cell && !cell.matched) coords.push({ r, c });
    }
  }
  return coords;
}

// Find one removable pair (for the hint feature). Returns [a, b] or null.
export function findHint(board, rows, cols) {
  const coords = remainingCoords(board, rows, cols);
  const byIcon = new Map();
  for (const co of coords) {
    const icon = board[co.r][co.c].icon;
    if (!byIcon.has(icon)) byIcon.set(icon, []);
    byIcon.get(icon).push(co);
  }
  for (const group of byIcon.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (connectPath(board, rows, cols, group[i], group[j])) {
          return [group[i], group[j]];
        }
      }
    }
  }
  return null;
}

export function hasAnyMove(board, rows, cols) {
  return findHint(board, rows, cols) !== null;
}

// Build a fresh board that is guaranteed to have at least one move initially.
export function generateBoard(rows, cols, kinds) {
  const total = rows * cols; // guaranteed even by level config
  const pairCount = total / 2;
  const palette = EMOJIS.slice(0, Math.min(kinds, EMOJIS.length));

  const build = () => {
    const icons = [];
    for (let i = 0; i < pairCount; i++) {
      const icon = palette[i % palette.length];
      icons.push(icon, icon);
    }
    const shuffled = shuffleArray(icons);
    const board = [];
    let k = 0;
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push({ id: nextId++, icon: shuffled[k++], matched: false });
      }
      board.push(row);
    }
    return board;
  };

  let board = build();
  let tries = 0;
  while (!hasAnyMove(board, rows, cols) && tries < 30) {
    board = build();
    tries++;
  }
  return board;
}

// Re-randomise the icons of the remaining tiles over their current positions.
// Guarantees a solvable arrangement when possible.
export function shuffleBoard(board, rows, cols) {
  const coords = remainingCoords(board, rows, cols);
  const attempt = () => {
    const icons = shuffleArray(coords.map((co) => board[co.r][co.c].icon));
    const next = board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
    coords.forEach((co, i) => {
      next[co.r][co.c] = { ...next[co.r][co.c], icon: icons[i], matched: false };
    });
    return next;
  };
  let next = attempt();
  let tries = 0;
  while (!hasAnyMove(next, rows, cols) && tries < 30) {
    next = attempt();
    tries++;
  }
  return next;
}

export function countRemaining(board, rows, cols) {
  return remainingCoords(board, rows, cols).length;
}
