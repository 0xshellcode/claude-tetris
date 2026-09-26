'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - light blue
  '#ffb74d', // L - orange
  '#90a4ae', // N - tuerca, gris metálico
  '#f06292', // + - rosa
  '#aed581', // U - lima
  '#4db6ac', // Y - verde azulado
  '#a1887f', // 1×1 - café
  '#ef5350', // power-up bomba
  '#f9a825', // power-up rayo
  '#ce93d8', // power-up tinte
  '#7986cb', // power-up gravedad
  '#0277bd', // power-up congelar
  '#ffffff', // comodín (se dibuja con degradado arcoíris)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca: hueco central que solo se rellena por abajo
  [[0,9,0],[9,9,9],[0,9,0]],                  // + (pentominó)
  [[10,0,10],[10,10,10],[0,0,0]],             // U (pentominó)
  [[0,0,0,0],[11,11,11,11],[0,11,0,0],[0,0,0,0]], // Y (pentominó)
  [[12]],                                      // 1×1 - recompensa tras un Tetris
  [[13]], [[14]], [[15]], [[16]], [[17]],      // power-ups (1×1, no se quedan en el tablero)
];

const STANDARD_TYPES = [1, 2, 3, 4, 5, 6, 7];
// Piezas no estándar que aparecen ocasionalmente: tuerca, +, U, Y
const SPECIAL_TYPES = [8, 9, 10, 11];
const SPECIAL_CHANCE = 0.1;
const SINGLE_TYPE = 12;
const QUEUE_SIZE = 5;

// Power-ups: cada POWERUP_EVERY líneas aparece uno en NEXT. Al fijarse no se
// queda en el tablero: aplica su efecto donde cae.
const POWERUPS = {
  13: { name: 'BOMBA', icon: '💣' },     // destruye un área 3×3
  14: { name: 'RAYO', icon: '⚡' },      // limpia su fila y su columna
  15: { name: 'TINTE', icon: '🎨' },     // un color entero pasa a ser comodín
  16: { name: 'GRAVEDAD', icon: '🧲' },  // compacta los huecos de cada columna
  17: { name: 'CONGELAR', icon: '❄️' },  // detiene la caída 5 s
};
const POWERUP_TYPES = Object.keys(POWERUPS).map(Number);
const POWERUP_EVERY = 5;
const FREEZE_MS = 5000;
// Los comodines desaparecen todos en la siguiente limpieza de líneas.
const WILD_TYPE = 18;
const WILD_BONUS = 25;
const DESTROY_BONUS = 10;

const LINE_SCORES = [0, 100, 300, 500, 800];
const TSPIN_SCORES = [400, 800, 1200, 1600];
const TSPIN_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE'];
const B2B_MULTIPLIER = 1.5;
const PERFECT_CLEAR_BONUS = 3000;
const T_TYPE = 3;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');

let board, current, queue, hold, canHold, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridLineColor = '#22222e';
// combo: limpiezas consecutivas; b2b: la última limpieza fue "difícil" (Tetris o T-spin)
let combo, b2b, lastMoveRotate;
let nextPowerupAt, freezeTime;
// Textos flotantes sobre el tablero y destello de Perfect Clear
let effects = [], flash = 0;
let audioCtx = null, muted = false;

const THEME_STORAGE_KEY = 'tetris-theme';

function updateGridLineColor() {
  gridLineColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim();
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (themeToggleBtn) themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  updateGridLineColor();
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  const preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  applyTheme(saved || preferred);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomPiece() {
  return makePiece(Math.random() < SPECIAL_CHANCE ? pick(SPECIAL_TYPES) : pick(STANDARD_TYPES));
}

function fillQueue() {
  while (queue.length < QUEUE_SIZE) queue.push(randomPiece());
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      lastMoveRotate = true;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

// Regla de las 3 esquinas: la T giró como último movimiento y al menos
// 3 de las 4 esquinas de su caja 3×3 están ocupadas (paredes y suelo cuentan).
function isTSpin() {
  if (current.type !== T_TYPE || !lastMoveRotate) return false;
  const corners = [[0, 0], [2, 0], [0, 2], [2, 2]];
  let filled = 0;
  for (const [dc, dr] of corners) {
    const x = current.x + dc, y = current.y + dr;
    if (x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x])) filled++;
  }
  return filled >= 3;
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  // Recompensa por Tetris: la siguiente pieza es un 1×1 para tapar huecos.
  if (cleared === 4) queue.unshift(makePiece(SINGLE_TYPE));
  if (cleared) {
    lines += cleared;
    removeWilds();
    // Tras la pieza que está por salir, para que se vea en NEXT.
    while (lines >= nextPowerupAt) {
      queue.splice(1, 0, makePiece(pick(POWERUP_TYPES)));
      nextPowerupAt += POWERUP_EVERY;
    }
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  }
  return cleared;
}

function removeWilds() {
  let removed = 0;
  for (const row of board)
    for (let c = 0; c < COLS; c++)
      if (row[c] === WILD_TYPE) { row[c] = 0; removed++; }
  if (removed) {
    score += removed * WILD_BONUS * level;
    addEffect(`COMODINES +${removed}`, 3);
  }
}

function applyPowerup() {
  const px = current.x, py = current.y;
  const { name } = POWERUPS[current.type];
  let destroyed = 0;
  const destroy = (r, c) => {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS || !board[r][c]) return;
    board[r][c] = 0;
    destroyed++;
  };

  if (name === 'BOMBA') {
    for (let r = py - 1; r <= py + 1; r++)
      for (let c = px - 1; c <= px + 1; c++) destroy(r, c);
  } else if (name === 'RAYO') {
    for (let r = 0; r < ROWS; r++) destroy(r, px);
    for (let c = 0; c < COLS; c++) destroy(py, c);
    board.splice(py, 1);
    board.unshift(new Array(COLS).fill(0));
  } else if (name === 'TINTE') {
    // Color del bloque sobre el que cae; si cae al suelo, el más abundante.
    let target = board[py + 1]?.[px];
    if (!target || target === WILD_TYPE) {
      const counts = {};
      for (const row of board)
        for (const v of row)
          if (v && v !== WILD_TYPE) counts[v] = (counts[v] || 0) + 1;
      target = Number(Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]) || 0;
    }
    if (target)
      for (const row of board)
        for (let c = 0; c < COLS; c++)
          if (row[c] === target) row[c] = WILD_TYPE;
  } else if (name === 'GRAVEDAD') {
    for (let c = 0; c < COLS; c++) {
      const column = [];
      for (let r = ROWS - 1; r >= 0; r--) if (board[r][c]) column.push(board[r][c]);
      for (let r = ROWS - 1, i = 0; r >= 0; r--, i++) board[r][c] = column[i] || 0;
    }
  } else if (name === 'CONGELAR') {
    freezeTime = FREEZE_MS;
  }

  score += destroyed * DESTROY_BONUS * level;
  addEffect(name, 0);
  playTone(220, 0.25, 0, 'sawtooth');
  playTone(440, 0.2, 0.1, 'triangle');
}

function scoreClear(cleared, tspin) {
  if (!cleared && !tspin) {
    combo = 0;
    updateHUD();
    return;
  }
  let points = (tspin ? TSPIN_SCORES[cleared] : LINE_SCORES[cleared] || 0) * level;
  const labels = [];
  if (tspin) labels.push(`T-SPIN ${TSPIN_NAMES[cleared]}`.trim());
  else if (cleared === 4) labels.push('TETRIS');

  if (cleared) {
    const difficult = tspin || cleared >= 4;
    if (difficult && b2b) {
      points = Math.floor(points * B2B_MULTIPLIER);
      labels.push('BACK-TO-BACK');
    }
    b2b = difficult;
    combo++;
    if (combo > 1) {
      points *= combo;
      labels.push(`COMBO x${combo}`);
    }
    if (board.every(row => row.every(v => !v))) {
      points += PERFECT_CLEAR_BONUS * level;
      labels.push('PERFECT CLEAR');
      flash = 400;
    }
  } else {
    combo = 0;
  }

  score += points;
  labels.forEach((text, i) => addEffect(text, i));
  if (labels.length) addEffect(`+${points.toLocaleString()}`, labels.length);
  playClearSound(cleared, labels.length > 0);
  updateHUD();
}

function addEffect(text, slot = 0) {
  effects.push({ text, slot, ttl: 1200, max: 1200 });
}

function playTone(freq, duration, delay = 0, type = 'square') {
  if (muted) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    return;
  }
  const t = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.06, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + duration);
}

// El tono sube un semitono por cada eslabón del combo; las jugadas
// especiales añaden un arpegio.
function playClearSound(cleared, special) {
  const base = 330 * Math.pow(2, Math.min(combo, 12) / 12);
  for (let i = 0; i < Math.max(1, cleared); i++) playTone(base * Math.pow(1.25, i), 0.12, i * 0.06);
  if (special) [1, 1.5, 2].forEach((m, i) => playTone(base * 2 * m, 0.15, 0.25 + i * 0.08, 'triangle'));
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  if (gy !== current.y) lastMoveRotate = false;
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    lastMoveRotate = false;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (POWERUPS[current.type]) {
    applyPowerup();
    // Un power-up no rompe el combo si no limpia líneas.
    const cleared = clearLines();
    if (cleared) scoreClear(cleared, false);
    else updateHUD();
  } else {
    const tspin = isTSpin();
    merge();
    scoreClear(clearLines(), tspin);
  }
  canHold = true;
  spawn();
}

function spawn(piece) {
  if (piece) {
    current = piece;
  } else {
    current = queue.shift();
    fillQueue();
  }
  lastMoveRotate = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
  drawHold();
}

// Guarda la pieza actual en el hold. Si ya había una, se intercambian.
// Solo se permite una vez por pieza: canHold vuelve a true al fijarla.
function holdPiece() {
  if (!canHold) return;
  const held = hold;
  hold = current.type;
  canHold = false;
  spawn(held ? makePiece(held) : undefined);
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  comboEl.textContent = combo > 1 ? `x${combo}` : '-';
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const px = x * size + 1, py = y * size + 1;
  context.globalAlpha = alpha ?? 1;
  if (colorIndex === WILD_TYPE) {
    const gradient = context.createLinearGradient(px, py, px + size, py + size);
    ['#e57373', '#ffd54f', '#81c784', '#64b5f6', '#ba68c8'].forEach((c, i) => gradient.addColorStop(i / 4, c));
    context.fillStyle = gradient;
  } else {
    context.fillStyle = COLORS[colorIndex];
  }
  context.fillRect(px, py, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px, py, size - 2, 4);
  const powerup = POWERUPS[colorIndex];
  if (powerup) {
    context.font = `${Math.floor(size * 0.6)}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#000';
    context.fillText(powerup.icon, px + size / 2 - 1, py + size / 2);
    context.textBaseline = 'alphabetic';
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridLineColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // La pieza que ya no cabe al perder no se dibuja encima del tablero.
  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  drawEffects();
}

function drawEffects() {
  if (freezeTime > 0) {
    ctx.fillStyle = 'rgba(129,212,250,0.12)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = '#29b6f6';
    ctx.fillText(`❄️ ${(freezeTime / 1000).toFixed(1)}s`, canvas.width / 2, 24);
  }
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(flash / 400) * 0.6})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px system-ui, sans-serif';
  for (const fx of effects) {
    const progress = 1 - fx.ttl / fx.max;
    const y = canvas.height * 0.35 + fx.slot * 28 - progress * 30;
    ctx.globalAlpha = Math.min(1, fx.ttl / 400);
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(fx.text, canvas.width / 2, y);
    ctx.fillStyle = '#ffd54f';
    ctx.fillText(fx.text, canvas.width / 2, y);
  }
  ctx.globalAlpha = 1;
}

function updateEffects(dt) {
  flash = Math.max(0, flash - dt);
  for (const fx of effects) fx.ttl -= dt;
  effects = effects.filter(fx => fx.ttl > 0);
}

function drawPreview(context, previewCanvas, shape) {
  const NB = 30;
  context.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  if (!shape) return;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, offX + c, offY + r, shape[r][c], NB);
}

function drawNext() {
  drawPreview(nextCtx, nextCanvas, queue[0].shape);
}

function drawHold() {
  drawPreview(holdCtx, holdCanvas, hold ? PIECES[hold] : null);
  holdCanvas.classList.toggle('locked', !canHold);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  draw();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeTime > 0) freezeTime = Math.max(0, freezeTime - dt);
  else dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
      lastMoveRotate = false;
    } else {
      lockPiece();
    }
  }
  updateEffects(dt);
  // endGame() pudo ejecutarse dentro de este frame: su cancelAnimationFrame no
  // detiene el frame en curso, así que aquí se corta el loop sin agendar otro.
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  combo = 0;
  b2b = false;
  nextPowerupAt = POWERUP_EVERY;
  freezeTime = 0;
  effects = [];
  flash = 0;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  hold = null;
  canHold = true;
  queue = [];
  fillQueue();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyM') { muted = !muted; return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) { current.x--; lastMoveRotate = false; }
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) { current.x++; lastMoveRotate = false; }
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdPiece();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
themeToggleBtn?.addEventListener('click', toggleTheme);

initTheme();
init();
