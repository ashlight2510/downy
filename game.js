/* Neon Stairs Drop - no deps, canvas2D */

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: true });

const elScore = document.getElementById('score');
const elBest = document.getElementById('best');
const elSpeed = document.getElementById('speed');
const overlay = document.getElementById('overlay');
const btnStart = document.getElementById('btnStart');
const toast = document.getElementById('toast');

const DPR = () => Math.max(1, Math.min(2, window.devicePixelRatio || 1));

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));

function loadBest() {
  const v = Number(localStorage.getItem('neonStairsBest') || '0');
  return Number.isFinite(v) ? v : 0;
}
function saveBest(v) {
  try { localStorage.setItem('neonStairsBest', String(v)); } catch {}
}

let W = 0, H = 0, dpr = 1;
function resize() {
  dpr = DPR();
  const rect = canvas.getBoundingClientRect();
  W = Math.max(320, Math.floor(rect.width));
  H = Math.max(320, Math.floor(rect.height));
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize, { passive: true });

// --- Game tuning (feel) ---
const TUNE = {
  laneWidth: 16,       // "칸" 크기(점수 단위)
  stepHeight: 24,      // 계단 간격(세로)
  stepThickness: 10,
  playerR: 9,
  gravity: 1900,
  baseScroll: 340,     // 아래로 내려가는 속도(초반)
  scrollAccel: 28,     // 시간이 지날수록 가속
  maxScroll: 980,

  // 좌우 조작 감
  moveAccel: 2600,
  moveFriction: 14.0,
  moveMaxV: 720,

  // 착지/튕김
  coyoteTime: 0.08,
  bounceDamp: 0.10,

  // 난이도
  minStepLenCells: 5,
  maxStepLenCells: 18,
  minGapCells: 3,
  maxGapCells: 11,
};

// --- Input ---
const input = {
  left: false,
  right: false,
};
function onKey(down, e) {
  const k = e.key.toLowerCase();
  if (k === 'a' || k === 'arrowleft') input.left = down;
  if (k === 'd' || k === 'arrowright') input.right = down;
  if (down && k === ' ') {
    e.preventDefault();
    if (!state.running) startOrRestart();
  }
  if (down && k === 'escape') {
    e.preventDefault();
    togglePause();
  }
}
window.addEventListener('keydown', (e) => onKey(true, e));
window.addEventListener('keyup', (e) => onKey(false, e));

// touch: left/right halves
let touchId = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  touchId = e.pointerId;
  const x = e.offsetX;
  input.left = x < W * 0.5;
  input.right = x >= W * 0.5;
}, { passive: true });
canvas.addEventListener('pointermove', (e) => {
  if (touchId !== e.pointerId) return;
  const x = e.offsetX;
  input.left = x < W * 0.5;
  input.right = x >= W * 0.5;
}, { passive: true });
canvas.addEventListener('pointerup', (e) => {
  if (touchId !== e.pointerId) return;
  input.left = false;
  input.right = false;
  touchId = null;
}, { passive: true });
canvas.addEventListener('pointercancel', () => {
  input.left = false;
  input.right = false;
  touchId = null;
}, { passive: true });

btnStart.addEventListener('click', () => startOrRestart());

// --- State ---
const state = {
  running: false,
  paused: false,
  dead: false,
  t: 0,
  dt: 0,
  scrollV: 0,
  score: 0,
  best: loadBest(),
  scoreCellsAcc: 0, // 내려간 거리 누적(칸 단위로 점수 증가)
};
elBest.textContent = String(state.best);

const player = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  onGround: false,
  coyote: 0,
};

// Stairs: each has y, x0, x1, cells, hue
let stairs = [];
let particles = [];

function resetWorld() {
  state.t = 0;
  state.dt = 0;
  state.scrollV = TUNE.baseScroll;
  state.score = 0;
  state.scoreCellsAcc = 0;
  state.dead = false;
  state.paused = false;

  player.x = W * 0.5;
  player.y = H * 0.28;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.coyote = 0;

  stairs = [];
  particles = [];

  // seed some stairs
  let y = H * 0.35;
  let x = irand(2, Math.floor(W / TUNE.laneWidth) - 10);
  let dir = Math.random() < 0.5 ? -1 : 1;
  for (let i = 0; i < 18; i++) {
    const len = irand(TUNE.minStepLenCells + 2, TUNE.maxStepLenCells - 2);
    const cellsW = Math.floor(W / TUNE.laneWidth);
    x = clamp(x + dir * irand(2, 6), 1, cellsW - len - 1);
    addStair(y, x, len);
    y += TUNE.stepHeight;
    if (Math.random() < 0.35) dir *= -1;
  }
}

function addStair(y, cellX, lenCells) {
  const x0 = cellX * TUNE.laneWidth;
  const x1 = (cellX + lenCells) * TUNE.laneWidth;
  stairs.push({
    y,
    x0,
    x1,
    cells: lenCells,
    hue: (180 + Math.random() * 160) % 360,
    wob: rand(0, Math.PI * 2),
  });
}

function ensureStairs() {
  // keep generating beyond bottom
  let maxY = -Infinity;
  for (const s of stairs) maxY = Math.max(maxY, s.y);
  if (!Number.isFinite(maxY)) maxY = 0;

  const cellsW = Math.floor(W / TUNE.laneWidth);
  while (maxY < H + 240) {
    const prev = stairs[stairs.length - 1];
    const prevCenter = prev ? (prev.x0 + prev.x1) * 0.5 : W * 0.5;
    const prevCell = Math.floor(prevCenter / TUNE.laneWidth);

    const gap = irand(TUNE.minGapCells, TUNE.maxGapCells);
    const y = maxY + gap * (TUNE.stepHeight * 0.35) + TUNE.stepHeight;

    const len = irand(TUNE.minStepLenCells, TUNE.maxStepLenCells);
    const drift = irand(-10, 10);
    const cellX = clamp(prevCell + drift, 1, cellsW - len - 1);
    addStair(y, cellX, len);
    maxY = y;
  }
}

function toastMsg(msg, ms = 1100) {
  toast.textContent = msg;
  toast.classList.add('show');
  window.clearTimeout(toastMsg._t);
  toastMsg._t = window.setTimeout(() => toast.classList.remove('show'), ms);
}

function startOrRestart() {
  overlay.classList.add('hidden');
  state.running = true;
  state.dead = false;
  resetWorld();
  toastMsg('가속을 느껴봐. 좌우로 드리프트!');
}

function gameOver() {
  state.dead = true;
  state.running = false;
  if (state.score > state.best) {
    state.best = state.score;
    saveBest(state.best);
    elBest.textContent = String(state.best);
  }
  overlay.classList.remove('hidden');
  overlay.querySelector('.title').textContent = 'GAME OVER';
  overlay.querySelector('.sub').innerHTML =
    `점수: <b>${state.score}</b> · 최고: <b>${state.best}</b><br/>Space 또는 버튼으로 재시작`;
  btnStart.textContent = '다시하기';
}

function togglePause() {
  if (!state.running) return;
  state.paused = !state.paused;
  toastMsg(state.paused ? '일시정지' : '재개');
}

// --- Particles ---
function spawnTrail(x, y, hue, n = 2) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x: x + rand(-2, 2),
      y: y + rand(-2, 2),
      vx: rand(-40, 40),
      vy: rand(60, 140),
      life: rand(0.25, 0.55),
      t: 0,
      r: rand(1.3, 2.6),
      hue: (hue + rand(-12, 12) + 360) % 360,
    });
  }
}

function spawnBurst(x, y, hue) {
  for (let i = 0; i < 32; i++) {
    const a = rand(0, Math.PI * 2);
    const sp = rand(120, 620);
    particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: rand(0.4, 0.9),
      t: 0,
      r: rand(1.5, 3.2),
      hue: (hue + rand(-28, 28) + 360) % 360,
    });
  }
}

// --- Physics / update ---
function update(dt) {
  state.dt = dt;
  state.t += dt;

  // scroll speed ramps up (가속 느낌)
  state.scrollV = clamp(
    TUNE.baseScroll + state.t * TUNE.scrollAccel,
    TUNE.baseScroll,
    TUNE.maxScroll
  );

  // Score: 내려간 거리(스크롤) 기준, "칸"마다 1점
  state.scoreCellsAcc += (state.scrollV * dt) / TUNE.laneWidth;
  const add = Math.floor(state.scoreCellsAcc);
  if (add > 0) {
    state.score += add;
    state.scoreCellsAcc -= add;
  }

  // stairs move upward relative to camera (player appears descending)
  for (const s of stairs) s.y -= state.scrollV * dt;
  // remove off-screen
  stairs = stairs.filter((s) => s.y > -120);
  ensureStairs();

  // player horizontal accel + friction
  const ax = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (ax !== 0) {
    player.vx += ax * TUNE.moveAccel * dt;
  } else {
    // exponential friction
    player.vx *= Math.exp(-TUNE.moveFriction * dt);
  }
  player.vx = clamp(player.vx, -TUNE.moveMaxV, TUNE.moveMaxV);

  // gravity
  player.vy += TUNE.gravity * dt;

  // integrate
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // walls (bounce a bit)
  if (player.x < TUNE.playerR) {
    player.x = TUNE.playerR;
    player.vx = -player.vx * (1 - TUNE.bounceDamp);
  } else if (player.x > W - TUNE.playerR) {
    player.x = W - TUNE.playerR;
    player.vx = -player.vx * (1 - TUNE.bounceDamp);
  }

  // ground check against stairs
  player.onGround = false;
  let groundY = Infinity;
  for (const s of stairs) {
    // stair top surface y = s.y
    const withinX = player.x >= s.x0 - TUNE.playerR && player.x <= s.x1 + TUNE.playerR;
    if (!withinX) continue;
    const dy = (player.y + TUNE.playerR) - s.y;
    // only collide when falling and near the top
    if (player.vy >= 0 && dy >= -16 && dy <= 18) {
      groundY = Math.min(groundY, s.y);
    }
  }

  if (groundY !== Infinity) {
    // snap to ground
    player.y = groundY - TUNE.playerR;
    player.vy = 0;
    player.onGround = true;
    player.coyote = TUNE.coyoteTime;
  } else {
    player.coyote = Math.max(0, player.coyote - dt);
  }

  // particles
  const trailHue = lerp(190, 320, (Math.sin(state.t * 1.6) * 0.5 + 0.5));
  spawnTrail(player.x, player.y + TUNE.playerR, trailHue, 2);

  for (const p of particles) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += (p.vy - state.scrollV * 0.65) * dt;
    p.vx *= Math.exp(-2.2 * dt);
    p.vy *= Math.exp(-2.2 * dt);
  }
  particles = particles.filter((p) => p.t < p.life);

  // death: fall below bottom (missed stairs)
  if (player.y > H + 70) {
    spawnBurst(player.x, H - 40, 350);
    gameOver();
  }

  // HUD
  elScore.textContent = String(state.score);
  elSpeed.textContent = String((state.scrollV / 100).toFixed(1));
}

// --- Render ---
function glowRect(x, y, w, h, hue, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = `hsla(${hue},100%,62%,.85)`;
  ctx.shadowBlur = 18;
  ctx.fillStyle = `hsla(${hue},100%,58%,.92)`;
  ctx.fillRect(x, y, w, h);
  ctx.shadowBlur = 0;
  ctx.fillStyle = `rgba(255,255,255,.12)`;
  ctx.fillRect(x, y, w, 2);
  ctx.restore();
}

function render() {
  // background fade + vignette
  ctx.clearRect(0, 0, W, H);

  // subtle parallax grid
  const t = state.t;
  const gridY = (t * state.scrollV * 0.0025) % 40;
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 1;
  for (let y = -40; y < H + 40; y += 40) {
    const yy = y - gridY;
    ctx.strokeStyle = 'rgba(18,247,255,.10)';
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(W, yy);
    ctx.stroke();
  }
  for (let x = 0; x <= W; x += 64) {
    ctx.strokeStyle = 'rgba(255,43,214,.06)';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.restore();

  // stairs
  for (const s of stairs) {
    const wob = Math.sin(state.t * 2.2 + s.wob) * 0.8;
    const y = s.y + wob;
    glowRect(s.x0, y, s.x1 - s.x0, TUNE.stepThickness, s.hue, 0.95);
  }

  // particles
  ctx.save();
  for (const p of particles) {
    const k = 1 - p.t / p.life;
    ctx.globalAlpha = 0.75 * k;
    ctx.fillStyle = `hsla(${p.hue},100%,65%,1)`;
    ctx.shadowColor = `hsla(${p.hue},100%,62%,.85)`;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (0.6 + 0.7 * k), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // player
  const speed = Math.abs(player.vx) / TUNE.moveMaxV;
  const hue = lerp(185, 325, speed);
  ctx.save();
  ctx.shadowColor = `hsla(${hue},100%,62%,.9)`;
  ctx.shadowBlur = 28;
  ctx.fillStyle = `hsla(${hue},100%,64%,.95)`;
  ctx.beginPath();
  ctx.arc(player.x, player.y, TUNE.playerR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(player.x - player.vx * 0.008, player.y + 1, TUNE.playerR - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // vignette
  ctx.save();
  const g = ctx.createRadialGradient(W * 0.5, H * 0.48, 40, W * 0.5, H * 0.48, Math.max(W, H) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.52)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // tiny chromatic edge
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = 'rgba(18,247,255,1)';
  ctx.fillRect(0, 0, W, 2);
  ctx.fillStyle = 'rgba(255,43,214,1)';
  ctx.fillRect(0, H - 2, W, 2);
  ctx.restore();
}

// --- Loop ---
let last = performance.now();
function tick(now) {
  const raw = (now - last) / 1000;
  last = now;
  const dt = clamp(raw, 0, 1 / 30);

  if (state.running && !state.paused) update(dt);
  render();

  requestAnimationFrame(tick);
}

// bootstrap
resize();
resetWorld();
requestAnimationFrame(tick);

// initial overlay text
overlay.querySelector('.title').textContent = 'NEON STAIRS DROP';
btnStart.textContent = '시작하기';


