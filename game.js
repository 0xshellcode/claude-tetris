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
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const MAX_START_LEVEL = 10;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const pauseMenu = document.getElementById('pause-menu');
const pauseMain = document.getElementById('pause-main');
const pauseControls = document.getElementById('pause-controls');
const startLevelEl = document.getElementById('start-level');

let board, current, next, score, lines, level, startLevel, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridLineColor = '#22222e';

const THEME_STORAGE_KEY = 'tetris-theme';
const START_LEVEL_STORAGE_KEY = 'tetris-start-level';

// Nivel elegido en el menú de pausa; se aplica en la siguiente partida (init).
let selectedStartLevel = clampLevel(Number(localStorage.getItem(START_LEVEL_STORAGE_KEY)) || 1);

// Teclas pulsadas mientras el menú estaba abierto. Sus auto-repeticiones se
// ignoran al volver al juego hasta que se suelten, para evitar movimientos
// accidentales (p. ej. dejar ← pulsada al cerrar el menú).
const heldDuringMenu = new Set();

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

function clampLevel(lvl) {
  return Math.min(MAX_START_LEVEL, Math.max(1, Math.floor(lvl)));
}

function intervalForLevel(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
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
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = intervalForLevel(level);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
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
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
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
  if (paused) resume();
  else pause();
}

function pause() {
  paused = true;
  cancelAnimationFrame(animId);
  // Mostrar primero: un elemento con display:none no puede recibir el foco.
  pauseMenu.classList.remove('hidden');
  showMenuView(pauseMain);
}

function resume() {
  paused = false;
  closePauseMenu();
  lastTime = performance.now();
  loop(lastTime);
}

function closePauseMenu() {
  // Quitar el foco del botón pulsado: si no, Space/Enter lo reactivarían.
  if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
  pauseMenu.classList.add('hidden');
}

function showMenuView(view) {
  pauseMain.classList.toggle('hidden', view !== pauseMain);
  pauseControls.classList.toggle('hidden', view !== pauseControls);
  view.querySelector('.menu-btn').focus();
}

function setStartLevel(lvl) {
  selectedStartLevel = clampLevel(lvl);
  localStorage.setItem(START_LEVEL_STORAGE_KEY, selectedStartLevel);
  renderStartLevel();
}

function renderStartLevel() {
  startLevelEl.textContent = selectedStartLevel;
  pauseMenu.querySelector('[data-action="level-down"]').disabled = selectedStartLevel <= 1;
  pauseMenu.querySelector('[data-action="level-up"]').disabled = selectedStartLevel >= MAX_START_LEVEL;
}

const MENU_ACTIONS = {
  resume,
  restart: init,
  controls: () => showMenuView(pauseControls),
  back: () => showMenuView(pauseMain),
  'level-down': () => setStartLevel(selectedStartLevel - 1),
  'level-up': () => setStartLevel(selectedStartLevel + 1),
};

function handleMenuKey(e) {
  const inMain = !pauseMain.classList.contains('hidden');
  switch (e.code) {
    case 'Space':
      // Space es el hard drop: no debe activar el botón enfocado (p. ej.
      // Reiniciar) si el jugador lo pulsa por reflejo. Los botones usan Enter.
      e.preventDefault();
      break;
    case 'ArrowUp':
    case 'ArrowDown': {
      e.preventDefault();
      const items = [...pauseMenu.querySelectorAll('.menu-view:not(.hidden) .menu-btn')];
      const i = items.indexOf(document.activeElement);
      const step = e.code === 'ArrowDown' ? 1 : -1;
      const nextIndex = i < 0 ? (step > 0 ? 0 : items.length - 1) : (i + step + items.length) % items.length;
      items[nextIndex].focus();
      break;
    }
    case 'ArrowLeft':
    case 'ArrowRight':
      if (inMain) setStartLevel(selectedStartLevel + (e.code === 'ArrowRight' ? 1 : -1));
      break;
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
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
  startLevel = selectedStartLevel;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = intervalForLevel(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  closePauseMenu();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    // Ignorar auto-repetición: mantener P abriría y cerraría el menú en bucle.
    if (e.repeat) return;
    if (e.code === 'Escape' && paused && !pauseControls.classList.contains('hidden')) {
      showMenuView(pauseMain);
      return;
    }
    togglePause();
    return;
  }
  if (paused) {
    heldDuringMenu.add(e.code);
    handleMenuKey(e);
    return;
  }
  if (gameOver) return;
  if (heldDuringMenu.has(e.code)) {
    if (e.repeat) return;
    // Pulsación nueva: se perdió el keyup (p. ej. la ventana perdió el foco).
    heldDuringMenu.delete(e.code);
  }
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
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
  }
  updateHUD();
});

document.addEventListener('keyup', e => heldDuringMenu.delete(e.code));

pauseMenu.addEventListener('click', e => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action) MENU_ACTIONS[action]();
});

restartBtn.addEventListener('click', init);
themeToggleBtn?.addEventListener('click', toggleTheme);

initTheme();
renderStartLevel();
init();
