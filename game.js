'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Cada skin define su paleta (índice = tipo de pieza) y cómo se dibuja un bloque.
// draw(context, px, py, size, color) recibe coordenadas en píxeles.
const SKINS = {
  retro: {
    label: 'Retro',
    colors: [
      null,
      '#4dd0e1', // I - cyan
      '#ffd54f', // O - yellow
      '#ba68c8', // T - purple
      '#81c784', // S - green
      '#e57373', // Z - red
      '#64b5f6', // J - light blue
      '#ffb74d', // L - orange
      '#90a4ae', // N - tuerca, gris metálico
    ],
    draw: drawRetroBlock,
  },
  neon: {
    label: 'Neon',
    colors: [null, '#00f0ff', '#fff200', '#d000ff', '#39ff14', '#ff073a', '#1f6fff', '#ff9f00', '#c8c8ff'],
    draw: drawNeonBlock,
  },
  pastel: {
    label: 'Pastel',
    colors: [null, '#a8e6ef', '#fdf1a8', '#d7b9e8', '#b8e6c1', '#f5b7b1', '#aed6f1', '#fad7a0', '#cfd8dc'],
    draw: drawPastelBlock,
  },
  pixel: {
    label: 'Pixel art',
    colors: [null, '#00bcd4', '#fdd835', '#8e24aa', '#43a047', '#e53935', '#1e88e5', '#fb8c00', '#78909c'],
    draw: drawPixelBlock,
  },
};

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
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridLineColor = '#22222e';
let activeSkin = SKINS.retro;

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

const SKIN_STORAGE_KEY = 'tetris-skin';

function applySkin(name) {
  const skinName = SKINS[name] ? name : 'retro';
  activeSkin = SKINS[skinName];
  document.documentElement.dataset.skin = skinName;
  if (skinSelect) skinSelect.value = skinName;
  // La skin puede cambiar las variables CSS del tablero (p. ej. neon fuerza fondo negro).
  updateGridLineColor();
  // Redibujar al momento: en pausa o game over el loop no está corriendo.
  if (current) {
    draw();
    drawNext();
  }
}

function changeSkin(name) {
  localStorage.setItem(SKIN_STORAGE_KEY, name);
  applySkin(name);
}

function initSkin() {
  if (skinSelect) {
    for (const [value, skin] of Object.entries(SKINS)) {
      skinSelect.add(new Option(skin.label, value));
    }
  }
  applySkin(localStorage.getItem(SKIN_STORAGE_KEY));
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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
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
  context.globalAlpha = alpha ?? 1;
  activeSkin.draw(context, x * size, y * size, size, activeSkin.colors[colorIndex]);
  context.globalAlpha = 1;
}

// Aclara (amount > 0) u oscurece (amount < 0) un color hex mezclándolo con blanco o negro.
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  const mix = v => Math.round(v + (target - v) * t);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 0xff)}, ${mix(n & 0xff)})`;
}

function drawRetroBlock(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawNeonBlock(context, px, py, size, color) {
  context.save();
  // Relleno translúcido + contorno brillante con glow.
  context.globalAlpha *= 0.25;
  context.fillStyle = color;
  context.fillRect(px + 3, py + 3, size - 6, size - 6);
  context.restore();

  context.save();
  context.shadowColor = color;
  context.shadowBlur = size * 0.5;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 3, py + 3, size - 6, size - 6);
  context.restore();
}

function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawPastelBlock(context, px, py, size, color) {
  const r = size * 0.25;
  roundRectPath(context, px + 1.5, py + 1.5, size - 3, size - 3, r);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = shade(color, -0.18);
  context.lineWidth = 1.5;
  context.stroke();
  // brillo suave arriba
  roundRectPath(context, px + 5, py + 4, size - 10, size * 0.22, size * 0.1);
  context.fillStyle = 'rgba(255,255,255,0.45)';
  context.fill();
}

function drawPixelBlock(context, px, py, size, color) {
  // Rejilla de 10×10 "píxeles" gruesos por bloque.
  const u = size / 10;
  const dot = (i, j, w, h, fill) => {
    context.fillStyle = fill;
    context.fillRect(px + i * u, py + j * u, w * u, h * u);
  };
  dot(0, 0, 10, 10, shade(color, -0.55)); // contorno
  dot(1, 1, 8, 8, color);                 // cuerpo
  dot(1, 1, 8, 1, shade(color, 0.45));    // bisel claro arriba
  dot(1, 1, 1, 8, shade(color, 0.45));    // bisel claro izquierda
  dot(1, 8, 8, 1, shade(color, -0.3));    // bisel oscuro abajo
  dot(8, 1, 1, 8, shade(color, -0.3));    // bisel oscuro derecha
  // textura: tramado en diagonal
  const dither = shade(color, -0.15);
  for (let j = 2; j < 8; j++)
    for (let i = 2; i < 8; i++)
      if ((i + j) % 3 === 0) dot(i, j, 1, 1, dither);
  // destello
  dot(2, 2, 2, 1, '#ffffff');
  dot(2, 3, 1, 1, '#ffffff');
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
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // Con el selector de skin enfocado, las flechas cambian la opción, no la pieza.
  if (e.target === skinSelect) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
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

restartBtn.addEventListener('click', init);
themeToggleBtn?.addEventListener('click', toggleTheme);
skinSelect?.addEventListener('change', () => {
  changeSkin(skinSelect.value);
  // Devolver el foco al juego para que las teclas vuelvan a mover piezas.
  skinSelect.blur();
});

initTheme();
initSkin();
init();
