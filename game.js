'use strict';
(() => {
  // ============================================================
  //  Helpers & storage
  // ============================================================
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const fmtTime = (ms) => {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
  };
  const fmtShort = (n) => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M'
    : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(Math.round(n));
  const fmtDate = (ts) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  const store = {
    get(k, d) { try { const v = localStorage.getItem('stillfall.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('stillfall.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem('stillfall.' + k); } catch { /* storage unavailable */ } },
  };

  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(h, h2, t) { const a = hexRgb(h), b = hexRgb(h2); return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`; }
  function rgba(h, a) { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; }
  function rrect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // ============================================================
  //  Palette: one blue world, neon pieces, ink outlines
  // ============================================================
  const INK = '#0a1033';
  const BOARD = '#0b1550';
  const YELLOW = '#ffe23d';
  const PIECE = { I: '#2ef2ff', O: '#ffe23d', T: '#c45bff', S: '#3dff72', Z: '#ff3d6e', J: '#3d8bff', L: '#ff9a1f' };

  // ============================================================
  //  Pieces & rotation system
  // ============================================================
  const COLS = 10, VISIBLE = 20, HIDDEN = 3, ROWS = VISIBLE + HIDDEN;
  const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  const SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  };
  // Rotation pivot (in cells) for the rotate animation
  const PIVOT = { I: 2, O: 1, T: 1.5, S: 1.5, Z: 1.5, J: 1.5, L: 1.5 };
  const rotCW = (m) => m.map((row, y) => row.map((_, x) => m[m.length - 1 - x][y]));
  const CELLS = {};
  for (const t of TYPES) {
    let m = SHAPES[t];
    CELLS[t] = [];
    for (let r = 0; r < 4; r++) {
      const cells = [];
      m.forEach((row, y) => row.forEach((v, x) => { if (v) cells.push([x, y]); }));
      CELLS[t].push(cells);
      m = rotCW(m);
    }
  }
  // Wall kick offsets, (x, y) with y pointing UP.
  const KICKS = {
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  };
  const KICKS_I = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  };
  const LOCK_DELAY = 500, MAX_RESETS = 15, CLEAR_MS = 300;

  // ============================================================
  //  Settings & records
  // ============================================================
  const DEFAULTS = { ghost: true, grid: true, smooth: true, shake: true, effects: true, zenSpeed: 'rising',
    startLevel: 1, das: 150, arr: 30, softDrop: 50, sens: 1 };
  const settings = Object.assign({}, DEFAULTS, store.get('settings', {}));
  const saveSettings = () => store.set('settings', settings);

  let games = store.get('games', []);
  const bestOf = (mode) => games.reduce((m, g) => g.mode === mode ? Math.max(m, g.score) : m, 0);

  // ============================================================
  //  Elements & layout
  // ============================================================
  const boardCanvas = $('#board'), bctx = boardCanvas.getContext('2d');
  const holdCanvas = $('#holdCanvas'), hctx = holdCanvas.getContext('2d');
  const nextCanvas = $('#nextCanvas'), nctx = nextCanvas.getContext('2d');
  const fxCanvas = $('#fx'), fctx = fxCanvas.getContext('2d');
  const rainCanvas = $('#rain'), rctx = rainCanvas.getContext('2d');
  const boardWrap = $('#boardWrap'), popups = $('#popups'), gameEl = $('#game');
  const hud = { score: $('#score'), level: $('#level'), lines: $('#lines'), time: $('#time'), best: $('#best') };

  const safeProbe = document.createElement('div');
  safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
  document.body.appendChild(safeProbe);

  let cell = 30, dpr = 1, side = 100, mini = 20, boardRect = { left: 0, top: 0 };
  let layoutStacked = false;
  const gridCanvas = document.createElement('canvas');

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const vw = window.innerWidth, vh = window.innerHeight;
    const ps = getComputedStyle(safeProbe);
    const sat = parseFloat(ps.paddingTop) || 0, sab = parseFloat(ps.paddingBottom) || 0;
    const wide = vw >= 700 && vw > vh * 0.8;
    layoutStacked = false;
    if (wide) {
      gameEl.className = 'layout-wide';
      cell = clamp(Math.floor(Math.min((vw - 48) / (10 + 2 * 5.4 + 0.8), (vh - sat - sab - 50) / 20)), 14, 42);
      side = Math.floor(cell * 5.4);
      mini = Math.floor(cell * 0.8);
    } else {
      // Phones: pick whichever arrangement gives the bigger board.
      const availW = vw - 32, availH = vh - sat - sab - 22 - 46 - 24;
      const sideCell = Math.floor(Math.min(availW / (10 + 3.3 + 0.4), availH / 20.4));
      const stackCell = Math.floor(Math.min(availW / 10, (availH - 40) / 21.5));
      if (stackCell > sideCell + 1) {
        layoutStacked = true;
        gameEl.className = 'layout-stack';
        cell = clamp(stackCell, 12, 44);
        mini = Math.floor((cell * 10 - cell * 0.4 - 30) / (4.4 + 4 * 4.2));
        side = Math.floor(mini * 4.4 + 14);
      } else {
        gameEl.className = 'layout-narrow';
        cell = clamp(sideCell, 12, 42);
        side = Math.floor(cell * 3.3);
        mini = Math.floor((side - 14) / 4.2);
      }
    }
    const root = document.documentElement.style;
    root.setProperty('--cell', cell + 'px');
    root.setProperty('--side', side + 'px');

    boardCanvas.width = COLS * cell * dpr;
    boardCanvas.height = VISIBLE * cell * dpr;
    const sw = side - 14;
    if (layoutStacked) {
      sizeCanvas(holdCanvas, sw, mini * 2.5);
      sizeCanvas(nextCanvas, cell * 10 - cell * 0.4 - side - 14, mini * 2.5);
    } else {
      sizeCanvas(holdCanvas, sw, mini * 2.9);
      sizeCanvas(nextCanvas, sw, mini * 3 * 5 + mini * 0.4);
    }
    sizeCanvas(fxCanvas, vw, vh);
    sizeCanvas(rainCanvas, vw, vh);
    sprites.clear();
    buildGrid();
    drawLogo();
    sidesKey = '';
    requestAnimationFrame(() => { boardRect = boardWrap.getBoundingClientRect(); });
  }
  function sizeCanvas(c, w, h) {
    c.style.width = w + 'px'; c.style.height = h + 'px';
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  }

  // ============================================================
  //  Sprites: flat fill, one shade band, one highlight, ink outline
  // ============================================================
  const sprites = new Map();
  const colorOf = (v) => v === 8 ? '#6b78b8' : v === 9 ? '#ffffff' : PIECE[TYPES[v - 1]];

  function sprite(v, size, kind = 'block') {
    size = Math.max(4, Math.round(size));
    const key = kind + v + '|' + size;
    let c = sprites.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const hex = colorOf(v);
    const lw = Math.max(1.5, size * 0.085), i = lw / 2 + size * 0.025, s = size - i * 2, r = size * 0.22;
    if (kind === 'ghost') {
      rrect(g, i, i, s, s, r);
      g.fillStyle = rgba(hex, 0.1); g.fill();
      g.lineWidth = lw; g.strokeStyle = rgba(hex, 0.7); g.stroke();
    } else if (kind === 'flat') {
      rrect(g, i, i, s, s, r);
      g.fillStyle = hex; g.fill();
    } else {
      rrect(g, i, i, s, s, r);
      g.fillStyle = hex; g.fill();
      if (v !== 9) {
        g.save(); g.clip();
        g.fillStyle = mix(hex, INK, 0.34);
        g.fillRect(0, size * 0.7, size, size);
        g.restore();
        rrect(g, size * 0.2, size * 0.17, size * 0.32, size * 0.13, size * 0.065);
        g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill();
      }
      rrect(g, i, i, s, s, r);
      g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
    }
    sprites.set(key, c);
    return c;
  }

  function buildGrid() {
    const c = cell * dpr;
    gridCanvas.width = COLS * c; gridCanvas.height = VISIBLE * c;
    const g = gridCanvas.getContext('2d');
    g.fillStyle = BOARD;
    g.fillRect(0, 0, COLS * c, VISIBLE * c);
    if (settings.grid) {
      g.fillStyle = '#16236e';
      const d = Math.max(1.5, c * 0.07);
      for (let y = 1; y < VISIBLE; y++) for (let x = 1; x < COLS; x++) {
        g.beginPath(); g.arc(x * c, y * c, d, 0, Math.PI * 2); g.fill();
      }
    }
  }

  function drawLogo() {
    const holder = $('#logoMark');
    let c = holder.querySelector('canvas');
    if (!c) { c = document.createElement('canvas'); holder.appendChild(c); }
    const m = 22, layout = [[0, 0, 3], [1, 0, 3], [2, 0, 3], [1, -1, 3], [3, 0, 1], [3, -1, 1], [3, -2, 1], [3, 1, 1], [-1, 1, 6], [0, 1, 6], [1, 1, 6], [2, 1, 4], [-1, 0, 6], [4, 1, 7], [4, 0, 7]];
    const w = 6 * m, h = 4 * m;
    c.style.width = w + 'px'; c.style.height = h + 'px';
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d');
    for (const [x, y, v] of layout) g.drawImage(sprite(v, m * dpr), (x + 1) * m * dpr, (y + 2) * m * dpr);
  }

  // Logo word: each letter wears a piece colour
  (() => {
    const word = 'STILLFALL', cols = ['I', 'O', 'T', 'S', 'Z', 'J', 'L', 'I', 'O'];
    $('.logo-word').innerHTML = [...word].map((ch, i) => `<span style="--c:${PIECE[cols[i]]};--i:${i}">${ch}</span>`).join('');
  })();

  // ============================================================
  //  Game state
  // ============================================================
  let G = null;
  let screen = 'title';
  const emptyBoard = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(0));

  function newGame(mode) {
    G = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      mode, board: emptyBoard(), bag: [], queue: [], hold: null, holdUsed: false, cur: null,
      score: 0, lines: 0, startLevel: mode === 'classic' ? settings.startLevel : 1, level: 1,
      combo: -1, b2b: false, time: 0, pieces: 0, quads: 0, tspins: 0, maxCombo: 0, resets: 0,
      startedAt: Date.now(),
    };
    G.level = G.startLevel;
    initRuntime();
    fillQueue();
    spawn();
  }

  function initRuntime() {
    Object.assign(G, {
      gravAcc: 0, lockTimer: 0, lockResets: 0, lowestY: 0, lastRotate: false, lastKick: 0,
      clearing: null, collapse: null, squash: null, dead: null, grace: 0, dispScore: G.score,
      vis: { x: 0, y: 0 }, rotAnim: null, nextAnim: 1,
    });
  }

  function fillQueue() {
    while (G.queue.length < 7) {
      if (!G.bag.length) {
        G.bag = TYPES.slice();
        for (let i = G.bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [G.bag[i], G.bag[j]] = [G.bag[j], G.bag[i]]; }
      }
      G.queue.push(G.bag.pop());
    }
  }

  const cellsOf = (p, rot = p.rot) => CELLS[p.type][rot];
  function collides(p, dx = 0, dy = 0, rot = p.rot) {
    for (const [cx, cy] of CELLS[p.type][rot]) {
      const x = p.x + cx + dx, y = p.y + cy + dy;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && G.board[y][x]) return true;
    }
    return false;
  }
  const dropDist = (p) => { let d = 0; while (!collides(p, 0, d + 1)) d++; return d; };
  const grounded = () => G.cur && collides(G.cur, 0, 1);

  function spawn(type) {
    const fromQueue = !type;
    const t = type || G.queue.shift();
    fillQueue();
    if (fromQueue) G.nextAnim = 0;
    const p = { type: t, rot: 0, x: t === 'O' ? 4 : 3, y: HIDDEN - 2 };
    if (collides(p)) { G.cur = null; topOut(t); return; }
    if (!collides(p, 0, 1)) p.y++;
    G.cur = p;
    G.vis = { x: p.x, y: p.y - 0.9 };
    G.rotAnim = null;
    G.gravAcc = 0; G.lockTimer = 0; G.lockResets = 0; G.lowestY = p.y; G.lastRotate = false;
  }

  function gravityMs() {
    let lv = G.level;
    if (G.mode === 'zen') lv = settings.zenSpeed === 'calm' ? 1 : settings.zenSpeed === 'rising' ? Math.min(lv, 10) : lv;
    lv = Math.min(lv, 20);
    return Math.pow(0.8 - (lv - 1) * 0.007, lv - 1) * 1000;
  }

  function afterMove() {
    if (grounded() && G.lockResets < MAX_RESETS) { G.lockTimer = 0; G.lockResets++; }
  }

  function tryMove(dx, bumpOnFail) {
    if (!canAct()) return false;
    if (collides(G.cur, dx, 0)) { if (bumpOnFail) kick(dx * 70, 0); return false; }
    G.cur.x += dx;
    G.lastRotate = false;
    afterMove();
    return true;
  }

  function rotate(dir) {
    if (!canAct()) return false;
    const p = G.cur;
    if (p.type === 'O') { G.rotAnim = { t: 0, from: 0, wiggle: dir }; return false; }
    const from = p.rot, to = (from + dir + 4) % 4;
    const kicks = (p.type === 'I' ? KICKS_I : KICKS)[from + '>' + to];
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      if (!collides(p, kx, -ky, to)) {
        p.x += kx; p.y -= ky; p.rot = to;
        G.lastRotate = true; G.lastKick = i;
        G.rotAnim = { t: 0, from: -dir * Math.PI / 2 };
        if (p.y > G.lowestY) { G.lowestY = p.y; G.lockResets = 0; }
        afterMove();
        return true;
      }
    }
    G.rotAnim = { t: 0, from: 0, wiggle: dir };
    return false;
  }

  function softStep() {
    if (!canAct() || collides(G.cur, 0, 1)) return false;
    G.cur.y++; G.score += 1; G.lastRotate = false; G.gravAcc = 0;
    return true;
  }

  function hardDrop() {
    if (!canAct()) return;
    const p = G.cur, d = dropDist(p), fromY = Math.min(G.vis.y, p.y);
    p.y += d; G.score += d * 2;
    if (d > 0) G.lastRotate = false;
    dropFx(p, fromY);
    kick(0, Math.min(420, 160 + d * 16));
    lock(true);
  }

  function holdPiece() {
    if (!canAct() || G.holdUsed) return;
    const t = G.cur.type;
    G.holdUsed = true;
    if (G.hold) { const h = G.hold; G.hold = t; spawn(h); }
    else { G.hold = t; spawn(); }
    const hp = $('#holdPanel');
    hp.classList.remove('pop'); void hp.offsetWidth; hp.classList.add('pop');
  }

  const canAct = () => screen === 'playing' && G && G.cur && !G.dead && !G.clearing && G.grace <= 0;

  function tSpinType(p) {
    if (p.type !== 'T' || !G.lastRotate) return null;
    const occ = (x, y) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && G.board[y][x] !== 0);
    const c = [occ(p.x, p.y), occ(p.x + 2, p.y), occ(p.x + 2, p.y + 2), occ(p.x, p.y + 2)]; // TL TR BR BL
    if (c.filter(Boolean).length < 3) return null;
    const front = [[0, 1], [1, 2], [2, 3], [3, 0]][p.rot];
    return (c[front[0]] && c[front[1]]) || G.lastKick === 4 ? 'full' : 'mini';
  }

  function lock(hard) {
    const p = G.cur, v = TYPES.indexOf(p.type) + 1;
    const placed = cellsOf(p).map(([cx, cy]) => [p.x + cx, p.y + cy]);
    let allHidden = true;
    for (const [x, y] of placed) { if (y >= 0) G.board[y][x] = v; if (y >= HIDDEN) allHidden = false; }
    const spin = tSpinType(p);
    G.cur = null; G.holdUsed = false; G.pieces++;
    if (allHidden) { topOut(); return; }

    const rows = [];
    for (let y = 0; y < ROWS; y++) if (G.board[y].every((c) => c)) rows.push(y);
    score(rows, spin);

    if (rows.length) {
      G.squash = null;
      G.clearing = { rows, t: 0, dur: CLEAR_MS };
      clearFx(rows);
    } else {
      const xs = placed.map((c) => c[0]), ys = placed.map((c) => c[1]);
      G.squash = { cells: placed, t: 0, dur: hard ? 230 : 180, amt: hard ? 0.24 : 0.12,
        ax: (Math.min(...xs) + Math.max(...xs) + 1) / 2, ay: Math.max(...ys) + 1 };
      spawn();
      if (G.cur) saveGame();
    }
    updateDanger();
  }

  function score(rows, spin) {
    const n = rows.length, lv = G.level;
    let base = 0, name = '', sub = '', difficult = false, color = '#ffffff';
    if (spin === 'full') {
      base = [400, 800, 1200, 1600][n]; name = 'T-SPIN'; sub = ['', 'SINGLE', 'DOUBLE', 'TRIPLE'][n]; difficult = n > 0; color = PIECE.T;
    } else if (spin === 'mini') {
      base = [100, 200, 400][Math.min(n, 2)]; name = 'MINI T-SPIN'; sub = ['', 'SINGLE', 'DOUBLE'][Math.min(n, 2)]; difficult = n > 0; color = PIECE.T;
    } else {
      base = [0, 100, 300, 500, 800][n]; name = ['', '', 'DOUBLE', 'TRIPLE', 'QUAD!'][n]; difficult = n === 4;
      color = ['#fff', '#fff', PIECE.S, PIECE.L, PIECE.I][n];
    }
    let b2b = false, pc = false;
    if (n > 0) {
      if (difficult) { if (G.b2b) { base *= 1.5; b2b = true; } G.b2b = true; } else G.b2b = false;
      G.combo++;
      G.maxCombo = Math.max(G.maxCombo, G.combo);
      const set = new Set(rows);
      pc = G.board.every((r, y) => set.has(y) || r.every((c) => !c));
    } else {
      G.combo = -1;
    }
    let pts = base * lv;
    if (n > 0 && G.combo > 0) pts += 50 * G.combo * lv;
    if (pc) pts += [0, 800, 1200, 1800, 2000][n] * lv;
    pts = Math.round(pts);
    G.score += pts;
    if (n === 4) G.quads++;
    if (spin && n > 0) G.tspins++;
    if (pts >= 100) bump(hud.score);

    if (n > 0) {
      const before = G.level;
      G.lines += n;
      G.level = G.startLevel + Math.floor(G.lines / 10);
      if (G.level > before) levelUp();
    }

    const extras = [];
    if (sub) extras.push(sub);
    if (b2b) extras.push('BACK-TO-BACK');
    if (G.combo > 0) extras.push(`COMBO ×${G.combo}`);
    if (pc) { popup('PERFECT CLEAR!', `+${fmt(pts)}`, YELLOW, 0.95); return; }
    if (name || G.combo > 0) {
      const big = n >= 4 || (spin === 'full' && n > 0);
      popup(name || `COMBO ×${G.combo}`, (name ? extras : []).concat(pts ? [`+${fmt(pts)}`] : []).join(' · '), name ? color : YELLOW, big ? 1.05 : 0.78);
    }
  }

  function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

  function levelUp() {
    popup(`LEVEL ${G.level}`, 'speeding up', YELLOW, 0.8, 18);
    bump(hud.level);
    boardWrap.classList.add('levelup');
    setTimeout(() => boardWrap.classList.remove('levelup'), 450);
  }

  function finishClear() {
    const { rows, reset, next } = G.clearing;
    G.clearing = null;
    if (reset) {
      G.board = emptyBoard();
    } else {
      const set = new Set(rows), nb = new Array(ROWS), drop = new Array(ROWS).fill(0);
      let ny = ROWS - 1;
      for (let y = ROWS - 1; y >= 0; y--) {
        if (set.has(y)) continue;
        nb[ny] = G.board[y]; drop[ny] = ny - y; ny--;
      }
      for (; ny >= 0; ny--) nb[ny] = new Array(COLS).fill(0);
      G.board = nb;
      G.collapse = { t: 0, dur: 220, drop };
      kick(0, 60 + rows.length * 40);
    }
    spawn(next);
    updateDanger();
    if (G.cur) saveGame();
  }

  function topOut(pending) {
    G.squash = null;
    tumbleBoard();
    if (G.mode === 'classic') {
      G.dead = { t: 0 };
      G.cur = null;
      kick(0, 300);
      popup('TOP OUT!', '', PIECE.Z, 1.0);
      boardWrap.classList.remove('danger');
      return;
    }
    // Zen: the blocks tumble away and play carries on.
    G.combo = -1; G.b2b = false; G.resets++;
    G.clearing = { rows: [], t: 0, dur: 700, reset: true, next: pending };
    popup('FRESH START', 'the stack tumbles away', PIECE.I, 0.85);
  }

  function updateDanger() {
    let top = ROWS;
    for (let y = 0; y < ROWS; y++) if (G.board[y].some((c) => c)) { top = y; break; }
    boardWrap.classList.toggle('danger', !G.dead && top - HIDDEN < 4);
  }

  // ============================================================
  //  Board spring (bounce on drops, nudge on wall bumps)
  // ============================================================
  const spring = { x: 0, y: 0, vx: 0, vy: 0 };
  function kick(vx, vy) {
    if (!settings.shake) return;
    spring.vx += vx; spring.vy += vy;
  }
  function stepSpring(dt) {
    const s = Math.min(dt, 34) / 1000, w = 2 * Math.PI * 5.5, z = 0.32;
    for (const k of ['x', 'y']) {
      const v = 'v' + k;
      spring[v] += (-w * w * spring[k] - 2 * z * w * spring[v]) * s;
      spring[k] += spring[v] * s;
    }
    if (Math.abs(spring.x) + Math.abs(spring.y) + Math.abs(spring.vx) + Math.abs(spring.vy) < 0.05) {
      spring.x = spring.y = spring.vx = spring.vy = 0;
    }
    boardWrap.style.transform = spring.x || spring.y ? `translate(${spring.x.toFixed(2)}px, ${spring.y.toFixed(2)}px)` : '';
  }

  // ============================================================
  //  Game update
  // ============================================================
  const input = { left: false, right: false, down: false, dir: 0, das: 0, arr: 0 };
  let touchSoft = false;

  function update(dt) {
    if (screen !== 'playing' || !G) return;
    if (G.collapse) { G.collapse.t += dt; if (G.collapse.t >= G.collapse.dur) G.collapse = null; }
    if (G.squash) { G.squash.t += dt; if (G.squash.t >= G.squash.dur) G.squash = null; }
    if (G.rotAnim) { G.rotAnim.t += dt; if (G.rotAnim.t >= 120) G.rotAnim = null; }
    if (G.nextAnim < 1) G.nextAnim = Math.min(1, G.nextAnim + dt / 180);
    if (G.dead) {
      G.dead.t += dt;
      if (G.dead.t > 1500) endGame();
      return;
    }
    if (G.grace > 0) { G.grace -= dt; return; }
    G.time += dt;
    if (G.clearing) {
      G.clearing.t += dt;
      if (G.clearing.t >= G.clearing.dur) finishClear();
      chargeDas(dt);
      return;
    }
    if (!G.cur) return;
    chargeDas(dt, true);
    if (!G.cur) return;

    // gravity
    const grav = gravityMs();
    const soft = input.down || touchSoft;
    const interval = soft ? Math.min(grav, settings.softDrop) : grav;
    if (interval <= 0) {
      while (!collides(G.cur, 0, 1)) { G.cur.y++; G.score++; G.lastRotate = false; }
    } else {
      G.gravAcc += dt;
      while (G.gravAcc >= interval) {
        G.gravAcc -= interval;
        if (!collides(G.cur, 0, 1)) { G.cur.y++; G.lastRotate = false; if (soft) G.score++; }
        else { G.gravAcc = 0; break; }
      }
    }
    if (G.cur.y > G.lowestY) { G.lowestY = G.cur.y; G.lockResets = 0; }

    // lock delay
    if (grounded()) {
      G.lockTimer += dt;
      if (G.lockTimer >= LOCK_DELAY) lock(false);
    } else {
      G.lockTimer = 0;
    }
  }

  function chargeDas(dt, act) {
    if (!input.dir) return;
    const prev = input.das;
    input.das += dt;
    if (!act || input.das < settings.das) return;
    if (settings.arr === 0) { while (tryMove(input.dir)); return; }
    input.arr += prev < settings.das ? input.das - settings.das : dt;
    while (input.arr >= settings.arr) {
      input.arr -= settings.arr;
      if (!tryMove(input.dir)) { input.arr = 0; break; }
    }
  }

  // ============================================================
  //  Effects (flat cartoon particles)
  // ============================================================
  const parts = [];
  const fxOn = () => settings.effects;
  const rand = (a, b) => a + Math.random() * (b - a);

  function cellCenter(x, y) {
    return [boardRect.left + (x + 0.5) * cell, boardRect.top + (y - HIDDEN + 0.5) * cell];
  }

  function clearFx(rows) {
    boardWrap.classList.add('flash');
    setTimeout(() => boardWrap.classList.remove('flash'), 120);
    kick(0, 40 + rows.length * 30);
    if (!fxOn()) return;
    boardRect = boardWrap.getBoundingClientRect();
    for (const y of rows) {
      if (y < HIDDEN) continue;
      for (let x = 0; x < COLS; x++) {
        const v = G.board[y][x];
        if (!v) continue;
        const [cx, cy] = cellCenter(x, y);
        const delay = Math.abs(x - 4.5) * 14;
        parts.push({ kind: 'ring', x: cx, y: cy, life: -delay - 60, max: 260, r: cell * 0.5 });
        for (let i = 0; i < 2; i++) {
          parts.push({ kind: 'chunk', x: cx, y: cy, vx: rand(-0.28, 0.28) + (x - 4.5) * 0.025, vy: rand(-0.55, -0.2),
            g: 0.0016, life: -delay - 80, max: rand(500, 800), size: cell * rand(0.22, 0.34), rot: rand(0, 6), vr: rand(-0.015, 0.015), color: colorOf(v) });
        }
      }
      for (let i = 0; i < (rows.length >= 4 ? 4 : 2); i++) {
        const [sx, sy] = cellCenter(rand(0, 9), y);
        parts.push({ kind: 'star', x: sx, y: sy, vx: rand(-0.05, 0.05), vy: rand(-0.12, -0.04), life: -rand(40, 160), max: 520, size: cell * rand(0.35, 0.6), rot: rand(0, 1), color: Math.random() < 0.5 ? YELLOW : '#fff' });
      }
    }
    trimParts();
  }

  function dropFx(p, fromY) {
    if (!fxOn()) return;
    boardRect = boardWrap.getBoundingClientRect();
    const cols = {};
    for (const [cx, cy] of cellsOf(p)) {
      const x = p.x + cx;
      cols[x] = Math.min(cols[x] ?? 99, cy);
    }
    for (const [x, cy] of Object.entries(cols)) {
      const top = boardRect.top + (Math.max(HIDDEN, fromY + cy) - HIDDEN) * cell;
      const bot = boardRect.top + (p.y + cy - HIDDEN) * cell;
      if (bot - top < cell * 0.5) continue;
      const lx = boardRect.left + (+x) * cell;
      parts.push({ kind: 'speed', x: lx + cell * 0.3, y0: top, y1: bot, life: 0, max: 200 });
      parts.push({ kind: 'speed', x: lx + cell * 0.7, y0: top + cell * 0.6, y1: bot, life: 0, max: 170 });
    }
    // dust puffs from the landing edge
    let minX = 99, maxX = -1, maxY = -1;
    for (const [cx, cy] of cellsOf(p)) { minX = Math.min(minX, p.x + cx); maxX = Math.max(maxX, p.x + cx); maxY = Math.max(maxY, p.y + cy); }
    const by = boardRect.top + (maxY + 1 - HIDDEN) * cell;
    for (let i = 0; i < 3; i++) {
      parts.push({ kind: 'puff', x: boardRect.left + minX * cell, y: by - cell * 0.15, vx: -rand(0.04, 0.12), vy: -rand(0.01, 0.05), life: -i * 20, max: 340, r: cell * rand(0.18, 0.3) });
      parts.push({ kind: 'puff', x: boardRect.left + (maxX + 1) * cell, y: by - cell * 0.15, vx: rand(0.04, 0.12), vy: -rand(0.01, 0.05), life: -i * 20, max: 340, r: cell * rand(0.18, 0.3) });
    }
    trimParts();
  }

  // Every settled block jumps off the board and tumbles away.
  function tumbleBoard() {
    boardRect = boardWrap.getBoundingClientRect();
    for (let y = HIDDEN; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const v = G.board[y][x];
      if (!v) continue;
      const [cx, cy] = cellCenter(x, y);
      parts.push({ kind: 'block', v, x: cx, y: cy, vx: rand(-0.12, 0.12) + (x - 4.5) * 0.02, vy: rand(-0.55, -0.25),
        g: 0.0019, life: -(ROWS - y) * 18 - rand(0, 40), max: 1600, size: cell, rot: 0, vr: rand(-0.012, 0.012) });
    }
    G.board = emptyBoard();
  }

  function trimParts() { if (parts.length > 900) parts.splice(0, parts.length - 900); }

  let popupCount = 0;
  function popup(text, sub, color, scale = 0.8, top) {
    const el = document.createElement('div');
    el.className = 'popup';
    el.style.fontSize = (cell * scale) + 'px';
    el.style.setProperty('--c', color);
    el.style.top = (top ?? 34 + (popupCount % 3) * 10) + '%';
    el.textContent = text;
    if (sub) { const s = document.createElement('small'); s.textContent = sub; el.appendChild(s); }
    popups.appendChild(el);
    popupCount++;
    setTimeout(() => { el.remove(); popupCount = Math.max(0, popupCount - 1); }, 1350);
  }

  // ============================================================
  //  Rendering
  // ============================================================
  function drawBoard(dt) {
    const c = cell * dpr, W = COLS * c, H = VISIBLE * c;
    bctx.clearRect(0, 0, W, H);
    bctx.drawImage(gridCanvas, 0, 0);
    if (!G) return;
    const p = G.cur;

    // column guide under the falling piece
    if (p && settings.ghost) {
      const xs = new Set(cellsOf(p).map(([cx]) => p.x + cx));
      bctx.fillStyle = 'rgba(120,150,255,0.07)';
      for (const x of xs) bctx.fillRect(x * c, 0, c, H);
    }

    // settled blocks
    const clr = G.clearing, clrSet = clr ? new Set(clr.rows) : null;
    const col = G.collapse ? 1 - easeBack(clamp(G.collapse.t / G.collapse.dur, 0, 1)) : 0;
    const sq = G.squash, sqSet = sq ? new Set(sq.cells.map(([x, y]) => x + ',' + y)) : null;
    for (let y = HIDDEN; y < ROWS; y++) {
      const row = G.board[y];
      const vy = (y - HIDDEN - (G.collapse ? G.collapse.drop[y] * col : 0)) * c;
      if (clrSet && clrSet.has(y)) {
        for (let x = 0; x < COLS; x++) {
          if (!row[x]) continue;
          // staggered pop from the centre out: swell, flash white, shrink away
          const t = clamp((clr.t - Math.abs(x - 4.5) * 14) / 170, 0, 1);
          const s = t < 0.35 ? 1 + 0.22 * (t / 0.35) : 1.22 * (1 - easeOut((t - 0.35) / 0.65));
          if (s <= 0.01) continue;
          const sz = c * s, off = (c - sz) / 2;
          bctx.drawImage(sprite(t > 0.15 ? 9 : row[x], c), x * c + off, vy + off, sz, sz);
        }
        continue;
      }
      for (let x = 0; x < COLS; x++) {
        const v = row[x];
        if (!v || (sqSet && sqSet.has(x + ',' + y))) continue;
        bctx.drawImage(sprite(v, c), x * c, vy);
      }
    }

    // the piece that just landed squashes and springs back
    if (sq) {
      const u = sq.t / sq.dur, k = Math.sin(u * Math.PI) * (1 - u * 0.5) * sq.amt;
      const sx = 1 + k, sy = 1 - k;
      const ax = sq.ax * c, ay = (sq.ay - HIDDEN) * c;
      bctx.save();
      bctx.translate(ax, ay); bctx.scale(sx, sy); bctx.translate(-ax, -ay);
      for (const [x, y] of sq.cells) {
        if (y < HIDDEN) continue;
        const v = G.board[y][x];
        if (!v) continue;
        bctx.drawImage(sprite(v, c), x * c, (y - HIDDEN) * c);
        if (u < 0.45) { bctx.globalAlpha = (1 - u / 0.45) * 0.8; bctx.drawImage(sprite(9, c, 'flat'), x * c, (y - HIDDEN) * c); bctx.globalAlpha = 1; }
      }
      bctx.restore();
    }

    if (p) {
      const v = TYPES.indexOf(p.type) + 1;
      // smooth the drawn position toward the real one
      if (settings.smooth) {
        const k = 1 - Math.exp(-dt / 28);
        G.vis.x += (p.x - G.vis.x) * k;
        G.vis.y += (p.y - G.vis.y) * k;
        if (Math.abs(p.x - G.vis.x) > 3) G.vis.x = p.x;
        if (Math.abs(p.y - G.vis.y) > 4) G.vis.y = p.y;
        if (G.vis.y > p.y) G.vis.y = p.y;
      } else {
        G.vis.x = p.x; G.vis.y = p.y;
      }
      // ghost
      if (settings.ghost) {
        const d = dropDist(p);
        if (d > 0) for (const [cx, cy] of cellsOf(p)) {
          const y = p.y + cy + d - HIDDEN;
          if (y >= 0) bctx.drawImage(sprite(v, c, 'ghost'), (p.x + cx) * c, y * c);
        }
      }
      // active piece, rotating about its pivot
      let angle = 0, scale = 1;
      if (G.rotAnim && settings.smooth) {
        const u = clamp(G.rotAnim.t / 120, 0, 1);
        angle = G.rotAnim.wiggle ? Math.sin(u * Math.PI * 2) * 0.12 * G.rotAnim.wiggle * (1 - u) : G.rotAnim.from * (1 - easeOut(u));
        scale = 1 + 0.08 * Math.sin(u * Math.PI);
      }
      const lockPulse = grounded() ? G.lockTimer / LOCK_DELAY : 0;
      const pv = PIVOT[p.type];
      bctx.save();
      bctx.translate((G.vis.x + pv) * c, (G.vis.y - HIDDEN + pv) * c);
      if (angle) bctx.rotate(angle);
      if (scale !== 1) bctx.scale(scale, scale);
      for (const [cx, cy] of cellsOf(p)) {
        if (p.y + cy - HIDDEN < -1) continue;
        bctx.drawImage(sprite(v, c), (cx - pv) * c, (cy - pv) * c);
      }
      if (lockPulse > 0.05) {
        bctx.globalAlpha = lockPulse * 0.35;
        for (const [cx, cy] of cellsOf(p)) bctx.drawImage(sprite(9, c, 'flat'), (cx - pv) * c, (cy - pv) * c);
      }
      bctx.restore();
    }
  }

  let sidesKey = '';
  function drawSides() {
    if (!G) return;
    const animating = G.nextAnim < 1;
    const key = [G.hold, G.holdUsed, G.queue.slice(0, 5).join(''), mini].join('|');
    if (key === sidesKey && !animating) return;
    sidesKey = animating ? '' : key;
    $('#holdPanel').classList.toggle('used', G.holdUsed);
    const m = mini * dpr;
    hctx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (G.hold) drawMini(hctx, G.hold, holdCanvas.width / 2, holdCanvas.height / 2, m, 1);
    nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const e = easeBack(G.nextAnim);
    if (layoutStacked) {
      const slot = nextCanvas.width / 4;
      G.queue.slice(0, 4).forEach((t, i) => drawMini(nctx, t, slot * (i + 0.5 + (1 - e)), nextCanvas.height / 2, i === 0 ? m : m * 0.82, i === 3 ? G.nextAnim : 1));
      return;
    }
    G.queue.slice(0, 5).forEach((t, i) => {
      const s = i === 0 ? m : m * 0.82;
      const y = m * (1.6 + (i + (1 - e)) * 3) + (i ? m * 0.3 : 0);
      drawMini(nctx, t, nextCanvas.width / 2, y, s, i === 4 ? G.nextAnim : 1);
    });
  }

  function drawMini(g, type, cx, cy, m, alpha) {
    const cells = CELLS[type][0];
    const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const ox = cx - ((maxX - minX + 1) * m) / 2 - minX * m;
    const oy = cy - ((maxY - minY + 1) * m) / 2 - minY * m;
    const v = TYPES.indexOf(type) + 1;
    g.globalAlpha = alpha;
    for (const [x, y] of cells) g.drawImage(sprite(v, m), ox + x * m, oy + y * m);
    g.globalAlpha = 1;
  }

  function star(g, x, y, r, rot) {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + (i * Math.PI) / 4, rr = i % 2 ? r * 0.38 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
  }

  function drawFx(dt) {
    const W = fxCanvas.width, H = fxCanvas.height;
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, W, H);
    if (!parts.length) return;
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.lineJoin = 'round';
    const vh = H / dpr;
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.life += dt;
      if (q.life < 0) {
        // tumbling blocks wait in place until their turn to jump
        if (q.kind === 'block') fctx.drawImage(sprite(q.v, q.size * dpr), q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
        continue;
      }
      if (q.life >= q.max || (q.kind === 'block' && q.y > vh + cell * 2)) { parts.splice(i, 1); continue; }
      const t = q.life / q.max;
      fctx.globalAlpha = 1;
      if (q.kind === 'chunk' || q.kind === 'block') {
        q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
        fctx.save(); fctx.translate(q.x, q.y); fctx.rotate(q.rot);
        if (q.kind === 'block') {
          fctx.drawImage(sprite(q.v, q.size * dpr), -q.size / 2, -q.size / 2, q.size, q.size);
        } else {
          const s = q.size * (1 - t * 0.6);
          rrect(fctx, -s / 2, -s / 2, s, s, s * 0.25);
          fctx.fillStyle = q.color; fctx.fill();
          fctx.lineWidth = Math.max(1.5, s * 0.16); fctx.strokeStyle = INK; fctx.stroke();
        }
        fctx.restore();
      } else if (q.kind === 'star') {
        q.x += q.vx * dt; q.y += q.vy * dt;
        const s = q.size * (t < 0.25 ? easeBack(t / 0.25) : 1 - easeOut((t - 0.25) / 0.75));
        if (s <= 0) continue;
        star(fctx, q.x, q.y, s, q.rot + t * 1.5);
        fctx.fillStyle = q.color; fctx.fill();
        fctx.lineWidth = Math.max(1.5, s * 0.14); fctx.strokeStyle = INK; fctx.stroke();
      } else if (q.kind === 'ring') {
        fctx.globalAlpha = 1 - t;
        fctx.beginPath(); fctx.arc(q.x, q.y, q.r * (0.4 + easeOut(t) * 0.9), 0, Math.PI * 2);
        fctx.lineWidth = Math.max(1.5, cell * 0.12 * (1 - t)); fctx.strokeStyle = '#fff'; fctx.stroke();
      } else if (q.kind === 'puff') {
        q.x += q.vx * dt; q.y += q.vy * dt;
        fctx.globalAlpha = 0.85 * (1 - t);
        fctx.beginPath(); fctx.arc(q.x, q.y, q.r * (0.6 + easeOut(t) * 0.8), 0, Math.PI * 2);
        fctx.fillStyle = '#dfe6ff'; fctx.fill();
      } else if (q.kind === 'speed') {
        fctx.globalAlpha = 0.75 * (1 - t);
        const top = q.y0 + (q.y1 - q.y0) * easeOut(t);
        fctx.lineCap = 'round';
        fctx.beginPath(); fctx.moveTo(q.x, top); fctx.lineTo(q.x, q.y1);
        fctx.lineWidth = Math.max(1.5, cell * 0.08); fctx.strokeStyle = '#fff'; fctx.stroke();
      }
    }
    fctx.globalAlpha = 1;
  }

  // Calm silhouettes drifting behind everything
  const rain = [];
  function drawRain(dt) {
    const W = rainCanvas.width, H = rainCanvas.height;
    const vw = W / dpr, vh = H / dpr;
    const target = screen === 'title' ? 12 : 7;
    while (rain.length < target) {
      const m = rand(16, 34);
      rain.push({ type: TYPES[Math.floor(Math.random() * 7)], x: rand(0, vw), y: rain.seeded ? -m * 4 : rand(0, vh),
        vy: rand(0.006, 0.018), rot: rand(0, 6.28), vr: rand(-0.0003, 0.0003), m });
    }
    rain.seeded = true;
    rctx.setTransform(1, 0, 0, 1, 0, 0);
    rctx.clearRect(0, 0, W, H);
    rctx.fillStyle = 'rgba(8, 18, 90, 0.32)';
    for (let i = rain.length - 1; i >= 0; i--) {
      const r = rain[i];
      r.y += r.vy * dt; r.rot += r.vr * dt;
      if (r.y > vh + r.m * 4 || (rain.length > target && r.y < 0)) { rain.splice(i, 1); continue; }
      rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rctx.translate(r.x, r.y); rctx.rotate(r.rot);
      for (const [x, y] of CELLS[r.type][0]) {
        rrect(rctx, (x - 1.5) * r.m + 1.5, (y - 1) * r.m + 1.5, r.m - 3, r.m - 3, r.m * 0.22);
        rctx.fill();
      }
    }
  }

  const shown = {};
  function setText(el, key, text) { if (shown[key] !== text) { shown[key] = text; el.textContent = text; } }

  function drawHud(dt) {
    if (!G) return;
    G.dispScore += (G.score - G.dispScore) * Math.min(1, dt * 0.014);
    if (Math.abs(G.score - G.dispScore) < 1) G.dispScore = G.score;
    setText(hud.score, 'score', fmt(G.dispScore));
    setText(hud.level, 'level', String(G.level));
    setText(hud.lines, 'lines', String(G.lines));
    setText(hud.time, 'time', fmtTime(G.time));
    setText(hud.best, 'best', fmt(Math.max(bestOf(G.mode), G.score)));
  }

  // ============================================================
  //  Main loop
  // ============================================================
  let last = performance.now();
  function frame(t) {
    const dt = Math.min(50, t - last);
    last = t;
    update(dt);
    stepSpring(dt);
    if (screen !== 'title') { drawBoard(dt); drawSides(); drawHud(dt); }
    drawFx(dt);
    drawRain(dt);
    requestAnimationFrame(frame);
  }

  // ============================================================
  //  Keyboard
  // ============================================================
  const KEYS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', Space: 'drop',
    ArrowUp: 'cw', KeyX: 'cw', KeyZ: 'ccw', ControlLeft: 'ccw', ControlRight: 'ccw',
    KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold', Escape: 'pause', KeyP: 'pause',
  };

  window.addEventListener('keydown', (e) => {
    const a = KEYS[e.code];
    if (e.code === 'Escape' && (closeConfirm() || closeTopSheet())) { e.preventDefault(); return; }
    if (screen === 'paused' && a === 'pause' && !openSheet.current) { resume(); e.preventDefault(); return; }
    if (screen !== 'playing' || !a) return;
    e.preventDefault();
    if (e.repeat) return;
    switch (a) {
      case 'left': case 'right': {
        const d = a === 'left' ? -1 : 1;
        input[a] = true; input.dir = d; input.das = 0; input.arr = 0;
        tryMove(d, true);
        break;
      }
      case 'down': input.down = true; break;
      case 'drop': hardDrop(); break;
      case 'cw': rotate(1); break;
      case 'ccw': rotate(-1); break;
      case 'hold': holdPiece(); break;
      case 'pause': pause(); break;
    }
  });
  window.addEventListener('keyup', (e) => {
    const a = KEYS[e.code];
    if (a === 'left' || a === 'right') {
      input[a] = false;
      const other = a === 'left' ? 'right' : 'left';
      if (input.dir === (a === 'left' ? -1 : 1)) { input.dir = input[other] ? (other === 'left' ? -1 : 1) : 0; input.das = 0; input.arr = 0; }
    } else if (a === 'down') input.down = false;
  });
  const releaseKeys = () => { input.left = input.right = input.down = false; input.dir = 0; touchSoft = false; touch = null; };

  // ============================================================
  //  Touch gestures
  //  - sideways drag moves (follows the finger), any time
  //  - mostly-vertical downward drag soft drops
  //  - fast flick down hard drops, flick up holds, tap rotates
  // ============================================================
  let touch = null;
  const stepPx = () => (cell * 0.95) / settings.sens;

  function recentVelocity(t) {
    const h = t.hist, a = h[0], b = h[h.length - 1];
    const span = Math.max(16, b.t - a.t);
    return { vx: (b.x - a.x) / span, vy: (b.y - a.y) / span, dy: b.y - a.y };
  }

  window.addEventListener('touchstart', (e) => {
    if (screen !== 'playing') return;
    if (e.target.closest('button, #holdPanel, .overlay')) return;
    e.preventDefault();
    if (touch) return;
    const t = e.changedTouches[0], now = performance.now();
    touch = { id: t.identifier, x0: t.clientX, y0: t.clientY, ax: t.clientX, ay: t.clientY, t0: now,
      acted: false, held: false, maxDist: 0, hist: [{ x: t.clientX, y: t.clientY, t: now }] };
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    if (!e.target.closest('.scrollable')) e.preventDefault();
    if (!touch || screen !== 'playing') return;
    const t = [...e.changedTouches].find((x) => x.identifier === touch.id);
    if (!t) return;
    const x = t.clientX, y = t.clientY, now = performance.now();
    touch.hist.push({ x, y, t: now });
    while (touch.hist.length > 2 && now - touch.hist[0].t > 90) touch.hist.shift();
    touch.maxDist = Math.max(touch.maxDist, Math.hypot(x - touch.x0, y - touch.y0));
    const step = stepPx(), v = recentVelocity(touch);

    // horizontal: always follows the finger
    while (x - touch.ax >= step) { if (tryMove(1, true)) touch.acted = true; touch.ax += step; }
    while (touch.ax - x >= step) { if (tryMove(-1, true)) touch.acted = true; touch.ax -= step; }

    // vertical: only soft drop while the motion is clearly downward
    const vertical = Math.abs(v.vy) > Math.abs(v.vx) * 1.4;
    if (!vertical || y < touch.ay) touch.ay = y;
    if (vertical && v.vy > 0) {
      while (y - touch.ay >= step) { if (softStep()) touch.acted = true; touch.ay += step; }
    }

    // flick up holds immediately
    if (!touch.held && touch.y0 - y > cell * 1.6 && v.vy < -0.5 && Math.abs(x - touch.x0) < cell * 1.5) {
      touch.held = true; touch.acted = true;
      holdPiece();
    }
  }, { passive: false });

  window.addEventListener('touchend', (e) => {
    if (!touch) return;
    const t = [...e.changedTouches].find((x) => x.identifier === touch.id);
    if (!t) return;
    touch.hist.push({ x: t.clientX, y: t.clientY, t: performance.now() });
    const v = recentVelocity(touch);
    const dur = performance.now() - touch.t0;
    if (screen === 'playing') {
      if (!touch.acted && touch.maxDist < 14 && dur < 350) {
        rotate(t.clientX >= window.innerWidth / 2 ? 1 : -1);
      } else if (v.vy > 0.55 && v.dy > 16 && v.vy > Math.abs(v.vx) * 1.4) {
        hardDrop();
      } else if (!touch.held && v.vy < -0.5 && touch.y0 - t.clientY > cell) {
        holdPiece();
      }
    }
    touch = null;
  });
  window.addEventListener('touchcancel', () => { touch = null; });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  $('#holdPanel').addEventListener('pointerdown', (e) => { e.preventDefault(); holdPiece(); });

  // ============================================================
  //  Save / resume
  // ============================================================
  const SAVE_FIELDS = ['id', 'mode', 'board', 'bag', 'queue', 'hold', 'holdUsed', 'cur', 'score', 'lines', 'startLevel', 'level',
    'combo', 'b2b', 'time', 'pieces', 'quads', 'tspins', 'maxCombo', 'resets', 'startedAt'];
  function saveGame() {
    if (!G || G.dead) return;
    if (G.clearing) finishClear();
    const s = {};
    for (const k of SAVE_FIELDS) s[k] = G[k];
    store.set('save', s);
  }
  function loadSave() {
    const s = store.get('save', null);
    if (!s || !Array.isArray(s.board) || s.board.length !== ROWS) return null;
    return s;
  }

  // ============================================================
  //  Screens
  // ============================================================
  function setScreen(s) {
    screen = s;
    for (const c of ['title', 'playing', 'paused', 'over']) document.body.classList.toggle(c, c === s);
    $('#titleScreen').classList.toggle('show', s === 'title');
    $('#pauseScreen').classList.toggle('show', s === 'paused');
    $('#overScreen').classList.toggle('show', s === 'over');
    if (s !== 'playing') releaseKeys();
    if (s === 'title') refreshTitle();
  }

  function refreshTitle() {
    const zb = bestOf('zen'), cb = bestOf('classic');
    $('#zenBest').innerHTML = zb ? `<small>BEST</small>${fmt(zb)}` : '';
    $('#classicBest').innerHTML = cb ? `<small>BEST</small>${fmt(cb)}` : '';
    const s = loadSave();
    $('#continueBtn').classList.toggle('hidden', !s);
    if (s) $('#continueSub').textContent = `${s.mode === 'zen' ? 'Zen' : 'Classic'} · ${fmt(s.score)} pts · level ${s.level}`;
  }

  function start(mode) {
    const s = loadSave();
    if (s && s.mode === 'zen') recordGame(s); // an unfinished Zen session still counts
    store.del('save');
    newGame(mode);
    beginPlay('GO!');
  }

  function beginPlay(word) {
    parts.length = 0;
    popups.innerHTML = '';
    boardWrap.classList.remove('danger');
    sidesKey = '';
    setScreen('playing');
    updateDanger();
    requestAnimationFrame(() => { boardRect = boardWrap.getBoundingClientRect(); });
    popup(word, G.mode === 'zen' ? 'zen' : 'classic', YELLOW, 1.1);
    G.grace = 450;
  }

  function continueGame() {
    const s = loadSave();
    if (!s) return;
    G = Object.assign({}, s);
    initRuntime();
    if (G.cur) G.vis = { x: G.cur.x, y: G.cur.y - 0.9 };
    else spawn();
    beginPlay('WELCOME BACK');
  }

  function pause() {
    if (screen !== 'playing' || !G || G.dead) return;
    saveGame();
    $('#endBtnTitle').textContent = G.mode === 'zen' ? 'Finish session' : 'End game';
    $('#pauseLine').textContent = `${G.mode === 'zen' ? 'Zen' : 'Classic'} · ${fmt(G.score)} pts · level ${G.level} · ${fmtTime(G.time)}`;
    setScreen('paused');
  }
  function resume() {
    if (screen !== 'paused') return;
    setScreen('playing');
    G.grace = 350;
    popup('GO!', '', YELLOW, 0.95);
  }

  function recordGame(g) {
    if (!g || (g.score <= 0 && g.lines <= 0)) return null;
    if (games.some((x) => x.id === g.id)) return null;
    const prev = bestOf(g.mode);
    const entry = {
      id: g.id, mode: g.mode, score: g.score, lines: g.lines, level: g.level, time: Math.round(g.time),
      pieces: g.pieces, quads: g.quads, tspins: g.tspins, maxCombo: Math.max(0, g.maxCombo), date: Date.now(),
      high: g.score > prev, prevBest: prev,
    };
    games.push(entry);
    store.set('games', games);
    return entry;
  }

  // ---------- Results ----------
  function endGame() {
    const prevBest = bestOf(G.mode);
    const entry = recordGame(G);
    store.del('save');
    const isZen = G.mode === 'zen';
    const modeGames = games.filter((g) => g.mode === G.mode);
    $('#overTitle').textContent = isZen ? 'Session done!' : 'Game over';

    const nb = $('#newBest');
    nb.classList.add('hidden'); nb.classList.remove('in');
    const high = !!(entry && entry.high);
    let compare = '';
    if (!entry) compare = 'Too short to log. Clear a line next time!';
    else if (high && prevBest) compare = `Beat your old best by <b>${fmt(G.score - prevBest)}</b>`;
    else if (high) compare = 'Your first logged score!';
    else {
      const rank = modeGames.filter((g) => g.score > G.score).length + 1;
      compare = `<b>${fmt(prevBest - G.score)}</b> short of your best · #${rank} of ${modeGames.length}`;
    }
    $('#overCompare').innerHTML = compare;

    const stats = [
      ['Lines', G.lines], ['Level', G.level], ['Time', fmtTime(G.time)],
      ['Quads', G.quads], ['T-Spins', G.tspins], ['Best combo', Math.max(0, G.maxCombo)],
    ];
    $('#overStats').innerHTML = stats.map(([k, v], i) => `<div style="--i:${i}"><b>${v}</b><span>${k}</span></div>`).join('');

    const recent = modeGames.slice(-10);
    const hasBars = recent.length > 1;
    $('.bars-box').classList.toggle('hidden', !hasBars);
    if (hasBars) {
      const max = Math.max(...recent.map((g) => g.score), 1);
      $('#overBars').innerHTML = recent.map((g, i) =>
        `<i class="${entry && g.id === entry.id ? 'me' : ''}" style="height:${Math.max(6, (g.score / max) * 100)}%;--i:${i}" title="${fmt(g.score)}"></i>`).join('');
      $('#barsCap').textContent = `Your last ${recent.length} ${isZen ? 'Zen' : 'Classic'} games`;
    }

    setScreen('over');
    // count the score up, then slap on the sticker
    const target = G.score, el = $('#overScore'), t0 = performance.now(), dur = clamp(target / 30, 400, 1100);
    el.textContent = '0';
    const tick = (t) => {
      const u = clamp((t - t0 - 250) / dur, 0, 1);
      el.textContent = fmt(u < 1 ? Math.floor(target * easeOut(u)) : target);
      if (u < 1) requestAnimationFrame(tick);
      else if (high) { nb.classList.remove('hidden'); nb.classList.add('in'); celebrate(); }
    };
    requestAnimationFrame(tick);
  }

  function celebrate() {
    if (!fxOn()) return;
    const W = window.innerWidth, H = window.innerHeight;
    const colors = Object.values(PIECE);
    for (let i = 0; i < 70; i++) {
      parts.push({ kind: 'chunk', x: W / 2 + rand(-40, 40), y: H * 0.35, vx: rand(-0.6, 0.6), vy: rand(-0.95, -0.3),
        g: 0.0014, life: -rand(0, 120), max: rand(1300, 2000), size: rand(8, 14), rot: rand(0, 6), vr: rand(-0.02, 0.02), color: colors[i % colors.length] });
    }
    for (let i = 0; i < 10; i++) {
      parts.push({ kind: 'star', x: W / 2 + rand(-150, 150), y: H * 0.35 + rand(-90, 60), vx: 0, vy: -0.02, life: -rand(0, 500), max: 700, size: rand(12, 22), rot: rand(0, 1), color: i % 2 ? YELLOW : '#fff' });
    }
  }

  // ---------- Confirm dialog ----------
  let confirmCb = null;
  function confirmBox(title, text, yes, cb) {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    $('#confirmYes').textContent = yes;
    confirmCb = cb;
    $('#confirmScreen').classList.add('show');
  }
  function closeConfirm() {
    if (!$('#confirmScreen').classList.contains('show')) return false;
    $('#confirmScreen').classList.remove('show');
    confirmCb = null;
    return true;
  }
  $('#confirmNo').addEventListener('click', closeConfirm);
  $('#confirmYes').addEventListener('click', () => { const cb = confirmCb; closeConfirm(); if (cb) cb(); });

  // ---------- Sheets (records / settings / help) ----------
  const openSheet = { current: null };
  function showSheet(name) {
    const el = $(`#${name}Screen`);
    if (!el) return;
    if (screen === 'playing') pause();
    $$('.sheet').forEach((s) => s.classList.remove('show'));
    el.classList.add('show');
    openSheet.current = name;
    if (name === 'records') { if (G) rec.mode = G.mode; renderRecords(); }
    if (name === 'settings') renderSettings();
  }
  function closeTopSheet() {
    if (!openSheet.current) return false;
    $(`#${openSheet.current}Screen`).classList.remove('show');
    openSheet.current = null;
    return true;
  }
  $$('[data-open]').forEach((b) => b.addEventListener('click', () => showSheet(b.dataset.open)));
  $$('[data-close]').forEach((b) => b.addEventListener('click', closeTopSheet));
  $$('.sheet').forEach((s) => s.addEventListener('click', (e) => { if (e.target === s) closeTopSheet(); }));

  $('#zenBtn').addEventListener('click', () => start('zen'));
  $('#classicBtn').addEventListener('click', () => start('classic'));
  $('#continueBtn').addEventListener('click', continueGame);
  $('#pauseBtn').addEventListener('click', pause);
  $('#resumeBtn').addEventListener('click', resume);
  $('#endBtn').addEventListener('click', () => {
    const zen = G.mode === 'zen';
    confirmBox(zen ? 'Finish session?' : 'End game?', `Your ${fmt(G.score)} points will be logged to your records.`, zen ? 'Finish' : 'End it', () => {
      setScreen('playing'); G.grace = 0; G.cur = null; G.dead = { t: 900 };
      tumbleBoard();
    });
  });
  $('#restartBtn').addEventListener('click', () => {
    confirmBox('Restart?', G.mode === 'zen' ? 'This session will be logged and a fresh one starts.' : 'This run will be thrown away.', 'Restart', () => {
      if (G.mode === 'zen') recordGame(G);
      store.del('save');
      newGame(G.mode);
      beginPlay('GO!');
    });
  });
  $('#quitBtn').addEventListener('click', () => { saveGame(); setScreen('title'); });
  $('#againBtn').addEventListener('click', () => start(G ? G.mode : 'zen'));
  $('#overMenuBtn').addEventListener('click', () => setScreen('title'));

  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (screen === 'playing') pause(); else if (screen === 'paused') saveGame(); } });
  window.addEventListener('pagehide', () => { if (screen === 'playing' || screen === 'paused') saveGame(); });
  window.addEventListener('blur', () => { if (screen === 'playing' && !('ontouchstart' in window)) pause(); });

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ============================================================
  //  Settings UI
  // ============================================================
  function renderSettings() {
    $$('.toggle[data-set]').forEach((b) => b.classList.toggle('on', !!settings[b.dataset.set]));
    $$('[data-seg]').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(settings[seg.dataset.seg]) === b.dataset.v)));
    $$('[data-range]').forEach((r) => { r.value = settings[r.dataset.range]; });
    $('#startLevelVal').textContent = settings.startLevel;
    $('#dasVal').textContent = settings.das + ' ms';
    $('#arrVal').textContent = settings.arr === 0 ? 'instant' : settings.arr + ' ms';
    $('#sensVal').textContent = settings.sens.toFixed(2) + '×';
  }
  $$('.toggle[data-set]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.set;
    settings[k] = !settings[k];
    saveSettings();
    if (k === 'grid') buildGrid();
    renderSettings();
  }));
  $$('[data-seg]').forEach((seg) => seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const k = seg.dataset.seg, cur = settings[k];
    settings[k] = typeof cur === 'number' ? Number(b.dataset.v) : b.dataset.v;
    saveSettings(); renderSettings();
  }));
  $$('[data-range]').forEach((r) => r.addEventListener('input', () => {
    settings[r.dataset.range] = Number(r.value);
    saveSettings(); renderSettings();
  }));
  $$('[data-step]').forEach((b) => b.addEventListener('click', () => {
    settings.startLevel = clamp(settings.startLevel + Number(b.dataset.step), 1, 15);
    saveSettings(); renderSettings();
  }));
  $('#resetRecordsBtn').addEventListener('click', () => {
    if (!games.length) { toast('No records to erase'); return; }
    confirmBox('Erase records?', `All ${games.length} logged games will be deleted. Export a backup first if you want to keep them.`, 'Erase', () => {
      games = []; store.set('games', games);
      toast('Records erased');
      refreshTitle();
    });
  });

  // ============================================================
  //  Records UI + chart
  // ============================================================
  const rec = { mode: 'zen', axis: 'game', hover: -1, pts: [] };
  $('#recMode').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    rec.mode = b.dataset.v; renderRecords();
  });
  $('#recAxis').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    rec.axis = b.dataset.v; renderRecords();
  });

  function renderRecords() {
    $$('#recMode button').forEach((b) => b.classList.toggle('on', b.dataset.v === rec.mode));
    $$('#recAxis button').forEach((b) => b.classList.toggle('on', b.dataset.v === rec.axis));
    const list = games.filter((g) => g.mode === rec.mode).sort((a, b) => a.date - b.date);
    const best = list.reduce((m, g) => (!m || g.score > m.score ? g : m), null);
    const total = list.reduce((s, g) => s + g.score, 0);
    const lines = list.reduce((s, g) => s + g.lines, 0);
    const time = list.reduce((s, g) => s + (g.time || 0), 0);
    $('#recTiles').innerHTML = `
      <div class="tile hero"><span>Personal best</span><b>${best ? fmt(best.score) : '—'}</b>${best ? `<em>${fmtDate(best.date)}</em>` : ''}</div>
      <div class="tile"><span>Games</span><b>${list.length}</b></div>
      <div class="tile"><span>Average score</span><b>${list.length ? fmt(total / list.length) : '—'}</b></div>
      <div class="tile"><span>Total lines</span><b>${fmt(lines)}</b></div>
      <div class="tile"><span>Time played</span><b>${fmtTime(time)}</b></div>`;

    const highs = list.filter((g) => g.high).reverse();
    $('#recHighs').innerHTML = highs.length ? highs.map((g) => `
      <div class="row rec"><div class="r-score">${fmt(g.score)}${g.prevBest ? `<span class="r-delta">+${fmt(g.score - g.prevBest)}</span>` : ''}</div>
      <div class="r-date">${fmtDate(g.date)}</div>
      <div class="r-meta">${g.lines} lines · level ${g.level} · ${fmtTime(g.time || 0)}</div></div>`).join('')
      : '<div class="empty-note">Your new high scores will be logged here with the date and time.</div>';

    const recent = list.slice(-15).reverse();
    $('#recRecent').innerHTML = recent.length ? recent.map((g) => `
      <div class="row ${g.high ? 'rec' : ''}"><div class="r-score">${fmt(g.score)}</div>
      <div class="r-date">${fmtDate(g.date)}</div>
      <div class="r-meta">${g.lines} lines · level ${g.level} · ${fmtTime(g.time || 0)}${g.quads ? ` · ${g.quads} quads` : ''}</div></div>`).join('')
      : '<div class="empty-note">No games yet.</div>';

    rec.list = list;
    rec.hover = -1;
    requestAnimationFrame(drawChart);
  }

  function niceStep(max, n) {
    const raw = max / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }

  function drawChart() {
    const c = $('#chart'), box = c.parentElement;
    const w = box.clientWidth, h = box.clientHeight;
    if (!w) return;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const list = rec.list || [];
    $('#chartEmpty').classList.toggle('hidden', list.length > 0);
    $('#chartTip').classList.add('hidden');
    if (!list.length) { rec.pts = []; return; }

    const pad = { l: 44, r: 14, t: 12, b: 26 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const maxScore = Math.max(...list.map((x) => x.score), 1);
    const step = niceStep(maxScore, 4), ymax = Math.ceil(maxScore / step) * step;
    const byDate = rec.axis === 'date';
    let x0 = byDate ? list[0].date : 0, x1 = byDate ? list[list.length - 1].date : list.length - 1;
    if (x1 === x0) { x0 -= byDate ? 3600e3 : 1; x1 += byDate ? 3600e3 : 1; }
    const X = (v) => pad.l + ((v - x0) / (x1 - x0)) * pw;
    const Y = (v) => pad.t + ph - (v / ymax) * ph;

    const muted = '#a9b8ff', surface = '#14257f';
    g.font = '700 11px ' + getComputedStyle(document.documentElement).getPropertyValue('--font');
    g.textBaseline = 'middle';
    g.textAlign = 'right';
    for (let v = 0; v <= ymax + 1e-9; v += step) {
      const y = Math.round(Y(v)) + 0.5;
      g.strokeStyle = v === 0 ? 'rgba(10,16,51,0.9)' : 'rgba(10,16,51,0.45)';
      g.lineWidth = v === 0 ? 2 : 1;
      g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke();
      g.fillStyle = muted;
      g.fillText(fmtShort(v), pad.l - 8, y);
    }
    g.textBaseline = 'top';
    const xl = [];
    if (byDate) {
      for (let i = 0; i < 4; i++) xl.push([x0 + ((x1 - x0) * i) / 3, null]);
    } else {
      const n = list.length;
      const idx = n <= 4 ? list.map((_, i) => i) : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];
      for (const i of idx) xl.push([i, `#${i + 1}`]);
    }
    xl.forEach(([v, label], i) => {
      g.textAlign = i === 0 ? 'left' : i === xl.length - 1 ? 'right' : 'center';
      const text = label || new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      g.fillStyle = muted;
      g.fillText(text, clamp(X(v), pad.l, w - pad.r), h - pad.b + 8);
    });

    let best = 0;
    rec.pts = list.map((gm, i) => {
      best = Math.max(best, gm.score);
      return { x: X(byDate ? gm.date : i), y: Y(gm.score), by: Y(best), g: gm, best };
    });
    // area + step line for the personal best
    g.beginPath();
    rec.pts.forEach((p, i) => {
      if (i === 0) g.moveTo(p.x, p.by);
      else { g.lineTo(p.x, rec.pts[i - 1].by); g.lineTo(p.x, p.by); }
    });
    const lastP = rec.pts[rec.pts.length - 1];
    g.lineTo(w - pad.r, lastP.by);
    g.lineWidth = 3; g.strokeStyle = YELLOW; g.lineJoin = 'round'; g.lineCap = 'round';
    g.stroke();
    g.lineTo(w - pad.r, Y(0)); g.lineTo(rec.pts[0].x, Y(0)); g.closePath();
    g.fillStyle = rgba(YELLOW, 0.12); g.fill();

    for (const p of rec.pts) {
      if (p.g.high) continue;
      g.beginPath(); g.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      g.fillStyle = '#c9d4ff'; g.fill();
      g.lineWidth = 2; g.strokeStyle = surface; g.stroke();
    }
    for (const p of rec.pts) {
      if (!p.g.high) continue;
      g.beginPath(); g.arc(p.x, p.y, 5, 0, Math.PI * 2);
      g.fillStyle = YELLOW; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
    }
    const hp = rec.pts[rec.hover];
    if (hp) {
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(Math.round(hp.x) + 0.5, pad.t); g.lineTo(Math.round(hp.x) + 0.5, pad.t + ph); g.stroke();
      g.beginPath(); g.arc(hp.x, hp.y, 7, 0, Math.PI * 2);
      g.fillStyle = hp.g.high ? YELLOW : '#fff'; g.fill();
      g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
      const tip = $('#chartTip');
      tip.innerHTML = `<b>${fmt(hp.g.score)}</b>${hp.g.high ? ' <span class="tip-rec">New best!</span>' : ''}<br>${fmtDate(hp.g.date)}<br><span style="color:var(--muted)">Game #${rec.hover + 1} · best then ${fmt(hp.best)}</span>`;
      tip.classList.remove('hidden');
      const tw = tip.offsetWidth;
      tip.style.left = clamp(hp.x - tw / 2, 0, w - tw) + 'px';
      tip.style.top = Math.max(0, Math.min(hp.y, hp.by) - tip.offsetHeight - 12) + 'px';
    }
  }

  function chartHover(e) {
    if (!rec.pts.length) return;
    const r = $('#chart').getBoundingClientRect();
    const x = e.clientX - r.left;
    let bi = 0, bd = Infinity;
    rec.pts.forEach((p, i) => { const d = Math.abs(p.x - x); if (d < bd) { bd = d; bi = i; } });
    if (bi !== rec.hover) { rec.hover = bi; drawChart(); }
  }
  $('#chart').addEventListener('pointermove', chartHover);
  $('#chart').addEventListener('pointerdown', chartHover);
  $('#chart').addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { rec.hover = -1; drawChart(); } });

  // Backup
  $('#exportBtn').addEventListener('click', async () => {
    const data = JSON.stringify({ app: 'stillfall', version: 1, exported: new Date().toISOString(), games, settings }, null, 1);
    const name = `stillfall-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([data], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Stillfall backup' }); return; }
    } catch (err) { if (err && err.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Backup saved');
  });
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || !Array.isArray(d.games)) throw new Error('bad');
      const ids = new Set(games.map((g) => g.id));
      const add = d.games.filter((g) => g && g.id && !ids.has(g.id) && typeof g.score === 'number' && (g.mode === 'zen' || g.mode === 'classic'));
      games = games.concat(add).sort((a, b) => a.date - b.date);
      // recompute which games set a new best, in date order
      const bests = { zen: 0, classic: 0 };
      for (const g of games) { g.prevBest = bests[g.mode]; g.high = g.score > bests[g.mode]; if (g.high) bests[g.mode] = g.score; }
      store.set('games', games);
      toast(`Imported ${add.length} game${add.length === 1 ? '' : 's'}`);
      renderRecords(); refreshTitle();
    } catch {
      toast("That file isn't a Stillfall backup");
    }
  });

  // ============================================================
  //  Boot
  // ============================================================
  window.addEventListener('resize', () => { resize(); if (openSheet.current === 'records') drawChart(); });
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();
  setScreen('title');
  requestAnimationFrame(frame);

  if (location.hostname === 'localhost') window.__sf = { get G() { return G; }, endGame, hardDrop, rotate, tryMove, topOut };

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
