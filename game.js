/* Neon Stairs Drop - no deps, canvas2D */

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: true });

const elScore = document.getElementById('score');
const elHp = document.getElementById('hp');
const elBest = document.getElementById('best');
const elSpeed = document.getElementById('speed');
const overlay = document.getElementById('overlay');
const btnStart = document.getElementById('btnStart');
const toast = document.getElementById('toast');
const rankName = document.getElementById('rankName');
const rankSubmit = document.getElementById('rankSubmit');
const rankStatus = document.getElementById('rankStatus');
const rankList = document.getElementById('rankList');
const overlayAd = document.getElementById('overlayAd');

const RESTART_DELAY_MS = 2000;
let restartUnlockAt = 0;
let restartTimer = null;

// --- Supabase leaderboard (table: run) ---
// NOTE: anon key는 "공개 키"지만, 그래도 깃허브 공개 저장소에 올릴 땐 분리 권장.
const SUPABASE_URL = 'https://mawljjaittsnoyotxqhm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hd2xqamFpdHRzbm95b3R4cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMjIwNTgsImV4cCI6MjA4MTU5ODA1OH0.jzF9IqDtx6hcHwaWfjaT6GvG2jE7lotSaQMUdnRhaAM';
const RUN_TABLE = 'rankings_downy';
// 아래 컬럼명이 실제 테이블과 다르면 여기만 바꾸면 됨
const COL = {
  name: 'name',
  score: 'score',
  createdAt: 'created_at',
};
const sb = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function normName(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 16);
}
function loadName() {
  const v = localStorage.getItem('neonStairsName') || '';
  return normName(v);
}
function saveName(v) {
  try { localStorage.setItem('neonStairsName', normName(v)); } catch {}
}
rankName.value = loadName();

async function fetchTopRuns(limit = 20) {
  const t = window.t || ((key, vars = {}) => key);
  if (!sb) {
    rankStatus.textContent = t('rankingLoadFail', { msg: t('errorSupabase') });
    renderRanking([]);
    return { ok: false, message: t('errorSupabase') };
  }
  rankStatus.textContent = t('loadingRanking');
  try {
    const { data, error } = await sb
      .from(RUN_TABLE)
      .select(`${COL.name},${COL.score},${COL.createdAt}`)
      .order(COL.score, { ascending: false })
      .order(COL.createdAt, { ascending: true })
      .limit(limit);
    if (error) throw error;
    renderRanking(Array.isArray(data) ? data : []);
    rankStatus.textContent = t('rankingTop', { limit });
    return { ok: true };
  } catch (e) {
    const msg = e?.message || String(e);
    rankStatus.textContent = t('rankingLoadFail', { msg });
    renderRanking([]);
    return { ok: false, message: msg };
  }
}

function renderRanking(rows) {
  const t = window.t || ((key, vars = {}) => key);
  rankList.innerHTML = '';
  if (!rows || rows.length === 0) {
    const div = document.createElement('div');
    div.style.color = 'rgba(159,179,211,.85)';
    div.style.fontSize = '11px';
    div.style.letterSpacing = '.02em';
    div.textContent = t('rankingEmpty');
    rankList.appendChild(div);
    return;
  }
  rows.forEach((r, i) => {
    const item = document.createElement('div');
    item.className = 'rankItem';

    const left = document.createElement('div');
    left.className = 'rankLeft';
    const pos = document.createElement('div');
    pos.className = 'rankPos';
    pos.textContent = `#${i + 1}`;
    const nm = document.createElement('div');
    nm.className = 'rankName';
    nm.textContent = normName(r?.[COL.name]) || 'noname';
    left.appendChild(pos);
    left.appendChild(nm);

    const sc = document.createElement('div');
    sc.className = 'rankScore';
    sc.textContent = String(r?.[COL.score] ?? 0);

    item.appendChild(left);
    item.appendChild(sc);
    rankList.appendChild(item);
  });
}

async function submitRun(name, score) {
  const t = window.t || ((key, vars = {}) => key);
  if (!sb) return { ok: false, message: t('errorSupabaseShort') };
  const n = normName(name);
  if (!n) return { ok: false, message: t('errorNoNickname') };
  rankSubmit.disabled = true;
  try {
    const payload = { [COL.name]: n, [COL.score]: score };
    const { error } = await sb.from(RUN_TABLE).insert(payload);
    if (error) throw error;
    saveName(n);
    toastMsg(t('toastRankSuccess'), 900);
    await fetchTopRuns(20);
    return { ok: true };
  } catch (e) {
    const msg = e?.message || String(e);
    toastMsg(t('toastRankFail', { msg }), 1400);
    return { ok: false, message: msg };
  } finally {
    rankSubmit.disabled = false;
  }
}

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
  // 초반 더 쉽고, 후반 덜 하드코어: 기본 속도↓, 가속↓, 최대 속도↓
  // 요청: 현재 체감의 1/5 수준으로
  baseScroll: 60,      // 아래로 내려가는 속도(초반)
  scrollAccel: 4,      // 시간이 지날수록 가속
  maxScroll: 164,

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
  // 시작엔 계단이 적게(간격 큼) → 점점 많아지게(간격 감소)
  // 초반을 더 쉽게: 시작 간격 크게
  gapStartMinCells: 10,
  gapStartMaxCells: 16,
  // 후반을 덜 하드코어: 끝 간격도 너무 촘촘해지지 않게
  gapEndMinCells: 7,
  gapEndMaxCells: 12,

  // HP 룰
  maxHp: 3,
  healEveryLandings: 20, // 착지한 계단 20개마다 1 회복
};

function difficulty01(t) {
  // 0..1 : 초반(0)엔 느긋/드문 계단, 1에 가까워질수록 촘촘/압박
  // 초반은 더 오래 캐주얼, 후반도 너무 급격히 안 올라가게 완만한 곡선
  const x = clamp(t / 70, 0, 1);
  // smoothstep-ish (완만하게 증가)
  return x * x * (3 - 2 * x);
}

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
rankSubmit.addEventListener('click', async () => {
  if (!state.dead) return;
  await submitRun(rankName.value, state.score);
});
rankName.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (!state.dead) return;
    await submitRun(rankName.value, state.score);
  }
});

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
  hp: 3,
  landings: 0,
  nextHealAt: 20,
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
let stairIdSeq = 1;

function resetWorld() {
  state.t = 0;
  state.dt = 0;
  state.scrollV = TUNE.baseScroll;
  state.score = 0;
  state.scoreCellsAcc = 0;
  state.hp = TUNE.maxHp;
  state.landings = 0;
  state.nextHealAt = TUNE.healEveryLandings;
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
  stairIdSeq = 1;

  // seed some stairs
  // 시작 즉사 방지: 플레이어 바로 아래에 "안전 계단" 하나를 강제 배치
  const cellsW = Math.floor(W / TUNE.laneWidth);
  const safeLen = irand(10, 14);
  const safeCellX = clamp(Math.floor((player.x / TUNE.laneWidth) - safeLen / 2), 1, cellsW - safeLen - 1);
  addStair(player.y + 70, safeCellX, safeLen);

  let y = player.y + 70 + TUNE.stepHeight * irand(2, 3);
  let x = irand(2, Math.floor(W / TUNE.laneWidth) - 10);
  let dir = Math.random() < 0.5 ? -1 : 1;
  // 초반엔 계단이 "적어 보이게" 시드 수를 줄이고, 세로 간격을 넓게 둠
  for (let i = 0; i < 8; i++) {
    const len = irand(TUNE.minStepLenCells + 2, TUNE.maxStepLenCells - 2);
    x = clamp(x + dir * irand(2, 6), 1, cellsW - len - 1);
    addStair(y, x, len);
    // 초반 텀은 "먼 느낌" 없게 너무 벌리지 않음
    y += TUNE.stepHeight * irand(2, 3);
    if (Math.random() < 0.35) dir *= -1;
  }

  elHp.textContent = String(state.hp);
}

function addStair(y, cellX, lenCells) {
  const x0 = cellX * TUNE.laneWidth;
  const x1 = (cellX + lenCells) * TUNE.laneWidth;
  stairs.push({
    id: stairIdSeq++,
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

  const d = difficulty01(state.t);
  const cellsW = Math.floor(W / TUNE.laneWidth);
  while (maxY < H + 240) {
    const prev = stairs[stairs.length - 1];
    const prevCenter = prev ? (prev.x0 + prev.x1) * 0.5 : W * 0.5;
    const prevCell = Math.floor(prevCenter / TUNE.laneWidth);

    const gapMin = Math.round(lerp(TUNE.gapStartMinCells, TUNE.gapEndMinCells, d));
    const gapMax = Math.round(lerp(TUNE.gapStartMaxCells, TUNE.gapEndMaxCells, d));
    const gap = irand(gapMin, Math.max(gapMin, gapMax));
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

function loadOverlayAd() {
  if (!overlayAd || overlayAd.dataset.loaded) return;
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
    overlayAd.dataset.loaded = 'true';
  } catch {
    // ignore ad loading errors
  }
}

function lockRestart() {
  restartUnlockAt = Date.now() + RESTART_DELAY_MS;
  if (btnStart) btnStart.disabled = true;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (!state.dead) return;
    if (btnStart) btnStart.disabled = false;
  }, RESTART_DELAY_MS);
}

function unlockRestart() {
  restartUnlockAt = 0;
  if (restartTimer) clearTimeout(restartTimer);
  if (btnStart) btnStart.disabled = false;
}

function canRestart() {
  return Date.now() >= restartUnlockAt;
}

function startOrRestart() {
  if (state.dead && !canRestart()) return;
  overlay.classList.add('hidden');
  if (overlayAd) overlayAd.style.display = 'none';
  unlockRestart();
  state.running = true;
  state.dead = false;
  resetWorld();
  toastMsg('가속을 느껴봐. 좌우로 드리프트!');
}

function gameOver(reason = '') {
  state.dead = true;
  state.running = false;
  if (state.score > state.best) {
    state.best = state.score;
    saveBest(state.best);
    elBest.textContent = String(state.best);
  }
  const t = window.t || ((key, vars = {}) => key);
  overlay.classList.remove('hidden');
  overlay.querySelector('.title').textContent = t('gameOver');
  const reasonText = reason === '추락' ? t('reasonFall') : reason === '천장' ? t('reasonCeiling') : reason === 'HP 0' ? t('reasonHpZero') : reason;
  const r = reason ? t('gameOverReason', { reason: reasonText }) : '';
  overlay.querySelector('.sub').innerHTML =
    r + t('gameOverScore', { score: state.score, best: state.best });
  btnStart.textContent = t('btnRestart');
  if (overlayAd) overlayAd.style.display = 'block';
  loadOverlayAd();
  lockRestart();
  // 랭킹 로드(백그라운드)
  fetchTopRuns(20);
}

function togglePause() {
  const t = window.t || ((key, vars = {}) => key);
  if (!state.running) return;
  state.paused = !state.paused;
  toastMsg(state.paused ? t('toastPause') : t('toastResume'));
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
  const wasOnGround = player.onGround;
  player.onGround = false;
  let groundY = Infinity;
  let groundStair = null;
  for (const s of stairs) {
    // stair top surface y = s.y
    const withinX = player.x >= s.x0 - TUNE.playerR && player.x <= s.x1 + TUNE.playerR;
    if (!withinX) continue;
    const dy = (player.y + TUNE.playerR) - s.y;
    // only collide when falling and near the top
    if (player.vy >= 0 && dy >= -16 && dy <= 18) {
      if (s.y < groundY) {
        groundY = s.y;
        groundStair = s;
      }
    }
  }

  if (groundY !== Infinity) {
    // 충돌 데미지: "화면 1/3 높이에서 떨어진" 정도의 속도 이상으로 착지하면 HP 감소
    const fallH = H / 3;
    const impactV = player.vy; // 착지 직전 속도
    const dmgThreshold = Math.sqrt(2 * TUNE.gravity * fallH);
    if (impactV >= dmgThreshold) {
      const t = window.t || ((key, vars = {}) => key);
      state.hp -= 1;
      spawnBurst(player.x, groundY - 4, 0);
      toastMsg(t('toastImpact'), 900);
      if (state.hp <= 0) {
        elHp.textContent = '0';
        gameOver('HP 0');
        return;
      }
    }
    // snap to ground
    player.y = groundY - TUNE.playerR;
    player.vy = 0;
    player.onGround = true;
    player.coyote = TUNE.coyoteTime;

    // 착지 카운트 + 회복(20개마다)
    if (!wasOnGround && groundStair) {
      state.landings += 1;
      if (state.landings >= state.nextHealAt) {
        const t = window.t || ((key, vars = {}) => key);
        if (state.hp < TUNE.maxHp) {
          state.hp += 1;
          toastMsg(t('toastHeal'), 800);
        }
        state.nextHealAt += TUNE.healEveryLandings;
      }
    }
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
    gameOver('추락');
    return;
  }

  // death: off the top (천장에 박음 / 공이 안 보이면 사망)
  if (player.y < -80) {
    spawnBurst(player.x, 40, 200);
    gameOver('천장');
    return;
  }

  // HUD
  elScore.textContent = String(state.score);
  elHp.textContent = String(state.hp);
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
fetchTopRuns(20);

// initial overlay text
// window.t는 index.html에서 이미 정의되어 있으므로 const t 선언 제거
if (overlay && overlay.querySelector('.title')) {
  overlay.querySelector('.title').textContent = (window.t || ((key) => key))('title');
}
if (btnStart) {
  btnStart.textContent = (window.t || ((key) => key))('btnStart');
}
