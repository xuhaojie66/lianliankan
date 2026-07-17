import { useReducer, useEffect, useCallback, useRef, useState } from "react";
import {
  LEVELS,
  generateBoard,
  connectPath,
  findHint,
  shuffleBoard,
  hasAnyMove,
  countRemaining,
} from "./game";
import { audio } from "./audio";

const BASE_POINTS = 10;
const COMBO_WINDOW_MS = 5000;
const PATH_ANIM_MS = 340;

function setupLevel(level, prevScore, best) {
  const cfg = LEVELS[level];
  const board = generateBoard(cfg.rows, cfg.cols, cfg.kinds);
  return {
    status: "playing",
    level,
    rows: cfg.rows,
    cols: cfg.cols,
    board,
    remaining: cfg.rows * cfg.cols,
    selected: null,
    score: prevScore,
    combo: 0,
    lastMatchAt: 0,
    timeLeft: cfg.time,
    hintsLeft: cfg.hints,
    shufflesLeft: cfg.shuffles,
    hintPair: null,
    path: null,
    best,
  };
}

const initialState = {
  status: "ready",
  level: 0,
  rows: LEVELS[0].rows,
  cols: LEVELS[0].cols,
  board: null,
  remaining: 0,
  selected: null,
  score: 0,
  combo: 0,
  lastMatchAt: 0,
  timeLeft: LEVELS[0].time,
  hintsLeft: LEVELS[0].hints,
  shufflesLeft: LEVELS[0].shuffles,
  hintPair: null,
  path: null,
  best: 0,
};

function reducer(state, action) {
  switch (action.type) {
    case "START_GAME":
      return setupLevel(0, 0, state.best);

    case "NEXT_LEVEL":
      return setupLevel(state.level + 1, state.score, state.best);

    case "RESTART_LEVEL":
      return setupLevel(state.level, state.score, state.best);

    case "SELECT":
      return { ...state, selected: action.pos, hintPair: null };

    case "MATCH": {
      const { a, b, path } = action;
      const now = Date.now();
      const combo =
        now - state.lastMatchAt <= COMBO_WINDOW_MS ? state.combo + 1 : 1;
      const gained = BASE_POINTS * combo;
      const score = state.score + gained;
      const board = state.board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
      board[a.r][a.c].matched = true;
      board[b.r][b.c].matched = true;
      return {
        ...state,
        board,
        selected: null,
        hintPair: null,
        path,
        combo,
        lastMatchAt: now,
        score,
        best: Math.max(state.best, score),
      };
    }

    case "CLEAR_PATH": {
      // Remove the matched tiles for good, then resolve win / deadlock.
      const board = state.board.map((row) =>
        row.map((cell) => (cell && cell.matched ? null : cell))
      );
      const remaining = countRemaining(board, state.rows, state.cols);
      if (remaining === 0) {
        const timeBonus = state.timeLeft * 2;
        const score = state.score + timeBonus;
        return {
          ...state,
          board,
          remaining,
          path: null,
          selected: null,
          score,
          best: Math.max(state.best, score),
          status: "won",
        };
      }
      // Auto-shuffle on deadlock so the game is never stuck.
      if (!hasAnyMove(board, state.rows, state.cols)) {
        const shuffled = shuffleBoard(board, state.rows, state.cols);
        return { ...state, board: shuffled, remaining, path: null, selected: null };
      }
      return { ...state, board, remaining, path: null, selected: null };
    }

    case "HINT": {
      if (state.hintsLeft <= 0) return state;
      const pair = findHint(state.board, state.rows, state.cols);
      if (!pair) return state;
      return { ...state, hintPair: pair, hintsLeft: state.hintsLeft - 1 };
    }

    case "CLEAR_HINT":
      return { ...state, hintPair: null };

    case "SHUFFLE": {
      if (state.shufflesLeft <= 0) return state;
      const board = shuffleBoard(state.board, state.rows, state.cols);
      return {
        ...state,
        board,
        selected: null,
        hintPair: null,
        shufflesLeft: state.shufflesLeft - 1,
      };
    }

    case "TICK": {
      if (state.status !== "playing") return state;
      const timeLeft = state.timeLeft - 1;
      if (timeLeft <= 0) {
        return { ...state, timeLeft: 0, status: "lost" };
      }
      return { ...state, timeLeft };
    }

    default:
      return state;
  }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [sfxOn, setSfxOn] = useState(true);
  const [bgmOn, setBgmOn] = useState(true);
  const audioReady = useRef(false);

  const {
    status,
    level,
    rows,
    cols,
    board,
    selected,
    score,
    combo,
    timeLeft,
    hintsLeft,
    shufflesLeft,
    hintPair,
    path,
    remaining,
    best,
  } = state;

  // Lazily create the audio context on the first user gesture.
  const initAudio = useCallback(() => {
    if (audioReady.current) return;
    audioReady.current = true;
    audio.ensure();
    audio.setSfx(sfxOn);
    audio.setBgm(bgmOn);
  }, [sfxOn, bgmOn]);

  // Countdown timer.
  useEffect(() => {
    if (status !== "playing") return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [status]);

  // After a match, show the connect line briefly then clear the tiles.
  useEffect(() => {
    if (!path) return;
    const id = setTimeout(() => dispatch({ type: "CLEAR_PATH" }), PATH_ANIM_MS);
    return () => clearTimeout(id);
  }, [path]);

  // Auto-dismiss a hint highlight.
  useEffect(() => {
    if (!hintPair) return;
    const id = setTimeout(() => dispatch({ type: "CLEAR_HINT" }), 2500);
    return () => clearTimeout(id);
  }, [hintPair]);

  // End-of-game sounds.
  useEffect(() => {
    if (status === "won") audio.playSfx("win");
    if (status === "lost") audio.playSfx("lose");
  }, [status]);

  const startGame = () => {
    initAudio();
    dispatch({ type: "START_GAME" });
  };

  const handleTile = (r, c) => {
    if (status !== "playing" || path) return;
    const cell = board[r][c];
    if (!cell || cell.matched) return;

    if (!selected) {
      audio.playSfx("select");
      dispatch({ type: "SELECT", pos: { r, c } });
      return;
    }
    if (selected.r === r && selected.c === c) {
      dispatch({ type: "SELECT", pos: null });
      return;
    }
    const p = connectPath(board, rows, cols, selected, { r, c });
    if (p) {
      audio.playSfx("match");
      dispatch({ type: "MATCH", a: selected, b: { r, c }, path: p });
    } else {
      audio.playSfx("error");
      dispatch({ type: "SELECT", pos: { r, c } });
    }
  };

  const useHint = () => {
    if (hintsLeft <= 0) return;
    audio.playSfx("hint");
    dispatch({ type: "HINT" });
  };

  const useShuffle = () => {
    if (shufflesLeft <= 0) return;
    audio.playSfx("shuffle");
    dispatch({ type: "SHUFFLE" });
  };

  const toggleSfx = () => {
    initAudio();
    const next = !sfxOn;
    setSfxOn(next);
    audio.setSfx(next);
    if (next) audio.playSfx("select");
  };

  const toggleBgm = () => {
    initAudio();
    const next = !bgmOn;
    setBgmOn(next);
    audio.setBgm(next);
  };

  const isSelected = (r, c) => selected && selected.r === r && selected.c === c;
  const isHint = (r, c) =>
    hintPair && hintPair.some((p) => p.r === r && p.c === c);

  const isLastLevel = level >= LEVELS.length - 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 flex flex-col items-center py-6 px-3 text-white">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-wide">连连看</h1>
          <div className="flex gap-2">
            <button
              onClick={toggleSfx}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                sfxOn ? "bg-indigo-500" : "bg-white/10 text-white/60"
              }`}
              title="音效开关"
            >
              {sfxOn ? "🔊 音效" : "🔇 音效"}
            </button>
            <button
              onClick={toggleBgm}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                bgmOn ? "bg-indigo-500" : "bg-white/10 text-white/60"
              }`}
              title="背景音乐开关"
            >
              {bgmOn ? "🎵 音乐" : "🎵 关"}
            </button>
          </div>
        </div>

        {/* HUD */}
        {status !== "ready" && (
          <div className="grid grid-cols-4 gap-2 mb-3 text-center">
            <Stat label="关卡" value={`${level + 1}/${LEVELS.length}`} />
            <Stat label="分数" value={score} />
            <Stat
              label="时间"
              value={formatTime(timeLeft)}
              danger={timeLeft <= 15}
            />
            <Stat label="最高分" value={best} />
          </div>
        )}

        {status !== "ready" && (
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-white/70">
              剩余 <span className="font-bold text-white">{remaining}</span>
              {combo > 1 && (
                <span className="ml-3 text-amber-300 font-bold">
                  连击 ×{combo}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={useHint}
                disabled={hintsLeft <= 0}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                提示 ({hintsLeft})
              </button>
              <button
                onClick={useShuffle}
                disabled={shufflesLeft <= 0}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                洗牌 ({shufflesLeft})
              </button>
              <button
                onClick={() => dispatch({ type: "RESTART_LEVEL" })}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/20 transition-all"
              >
                重开
              </button>
            </div>
          </div>
        )}

        {/* Ready / start screen */}
        {status === "ready" && (
          <div className="mt-10 flex flex-col items-center text-center gap-5">
            <div className="text-6xl">🀄🎴🧩</div>
            <p className="text-white/70 max-w-md leading-relaxed">
              点选两个相同的图案，若能用不超过两个拐角的通路连上就消除。
              在倒计时结束前消完全部方块即可通关，共 {LEVELS.length} 关，难度递增。
            </p>
            <button
              onClick={startGame}
              className="px-8 py-3 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-lg font-bold shadow-lg transition-all"
            >
              开始游戏
            </button>
          </div>
        )}

        {/* Board */}
        {board && status !== "ready" && (
          <div className="relative bg-black/20 rounded-2xl p-2 sm:p-3 select-none">
            <div
              className="grid gap-1 sm:gap-1.5"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {board.map((row, r) =>
                row.map((cell, c) => {
                  if (!cell) {
                    return <div key={`${r}-${c}`} className="aspect-square" />;
                  }
                  const sel = isSelected(r, c);
                  const hint = isHint(r, c);
                  return (
                    <button
                      key={cell.id}
                      onClick={() => handleTile(r, c)}
                      className={`aspect-square rounded-md sm:rounded-lg flex items-center justify-center text-lg sm:text-2xl md:text-3xl transition-all ${
                        sel
                          ? "bg-indigo-400 scale-105 ring-2 ring-white"
                          : "bg-white/90 hover:bg-white"
                      }`}
                      style={{
                        animation: cell.matched
                          ? `tileVanish ${PATH_ANIM_MS}ms ease forwards`
                          : undefined,
                        ...(hint
                          ? { animation: "hintPulse 0.8s ease-in-out infinite" }
                          : {}),
                      }}
                    >
                      <span className="pointer-events-none">{cell.icon}</span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Connect-line overlay */}
            {path && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox={`0 0 ${cols} ${rows}`}
                preserveAspectRatio="none"
                style={{ overflow: "visible" }}
              >
                <polyline
                  points={path
                    .map((p) => `${p.c + 0.5},${p.r + 0.5}`)
                    .join(" ")}
                  fill="none"
                  stroke="#facc15"
                  strokeWidth="0.12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="0.3 0.2"
                  style={{ animation: "dashFlow 0.5s linear infinite" }}
                />
              </svg>
            )}
          </div>
        )}

        {/* Result modal */}
        {(status === "won" || status === "lost") && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-20 p-4">
            <div
              className="bg-slate-800 rounded-2xl p-6 sm:p-8 text-center max-w-sm w-full shadow-2xl"
              style={{ animation: "slideUpCard 0.4s ease" }}
            >
              {status === "won" ? (
                <>
                  <div className="text-5xl mb-3">🎉</div>
                  <h2 className="text-2xl font-bold mb-2">
                    {isLastLevel ? "全部通关！" : `第 ${level + 1} 关完成！`}
                  </h2>
                  <p className="text-white/70 mb-1">当前分数 {score}</p>
                  <p className="text-white/50 text-sm mb-5">最高分 {best}</p>
                  {isLastLevel ? (
                    <button
                      onClick={startGame}
                      className="w-full px-5 py-3 bg-indigo-500 hover:bg-indigo-600 rounded-xl font-bold transition-all"
                    >
                      再玩一次
                    </button>
                  ) : (
                    <button
                      onClick={() => dispatch({ type: "NEXT_LEVEL" })}
                      className="w-full px-5 py-3 bg-indigo-500 hover:bg-indigo-600 rounded-xl font-bold transition-all"
                    >
                      下一关 →
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="text-5xl mb-3">⏰</div>
                  <h2 className="text-2xl font-bold mb-2">时间到！</h2>
                  <p className="text-white/70 mb-1">本局分数 {score}</p>
                  <p className="text-white/50 text-sm mb-5">
                    最高分 {best} · 还剩 {remaining} 块
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => dispatch({ type: "RESTART_LEVEL" })}
                      className="flex-1 px-5 py-3 bg-indigo-500 hover:bg-indigo-600 rounded-xl font-bold transition-all"
                    >
                      重试本关
                    </button>
                    <button
                      onClick={startGame}
                      className="flex-1 px-5 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-all"
                    >
                      重新开始
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-white/40 text-xs mt-5">
          点击两个相同图案 · 通路拐角 ≤ 2 即可消除 · 无解会自动洗牌
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, danger }) {
  return (
    <div className="bg-white/5 rounded-lg py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/50">
        {label}
      </div>
      <div
        className={`text-lg font-bold font-mono ${
          danger ? "text-red-400" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
