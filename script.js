import { WebHaptics } from 'https://cdn.jsdelivr.net/npm/web-haptics@0.0.6/+esm';

const haptics = new WebHaptics({ debug: true });
let lastHapticLiter = -1;

const track = document.getElementById('slider-track');
const canvas = document.getElementById('slider-canvas');
const ctx = canvas.getContext('2d');
const priceEl = document.getElementById('price');
const litersEl = document.getElementById('liters-badge');
const fullTankLabel = document.getElementById('full-tank-label');
const btnPlus = document.getElementById('btn-plus');
const btnMinus = document.getElementById('btn-minus');
const refuelBtn = document.getElementById('refuel-btn');

const DPR = window.devicePixelRatio || 1;
const TRACK_W = 130;
const TRACK_H = 299;
const PAD_X = 24;
const CANVAS_W = TRACK_W + PAD_X * 2;
const CANVAS_H = TRACK_H;
const RADIUS = 21;

const BG_COLOR = '#e4eaf2';
const SELECT_COLOR = '#9ca7b8';
const FILL_COLOR = '#00a6ff';

const PINCH_AMOUNT = 6;
const PINCH_RADIUS = 70;

const MAX_LITERS = 60;
const PRICE_PER_LITER = 58.33;
const MIN_PRICE = 100;
const MIN_LITERS = Math.ceil(MIN_PRICE / PRICE_PER_LITER);
const REFUEL_DURATION = 5000;

canvas.width = CANVAS_W * DPR;
canvas.height = CANVAS_H * DPR;
ctx.scale(DPR, DPR);

let selectedLiters = MAX_LITERS;
let phase = 'select';
let selectRatio = 1;
let fuelRatio = 0;

let isDragging = false;
let pointerY = TRACK_H * 0.5;
let currentPinch = 0;
let targetPinch = 0;
let glareOpacity = 0;
let targetGlare = 0;
let glareScale = 1;
let targetGlareScale = 1;
let animRunning = false;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function formatPrice(rubles) {
  return rubles.toLocaleString('ru-RU') + ' ₽';
}

function updateUI() {
  const price = Math.round(selectedLiters * PRICE_PER_LITER);
  priceEl.textContent = formatPrice(price);
  litersEl.textContent = selectedLiters + ' л';
  fullTankLabel.style.display = selectedLiters === MAX_LITERS ? '' : 'none';
}

function roundedRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.closePath();
}

function buildPinchedPath(pinch, py) {
  const steps = 256;
  ctx.beginPath();

  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * TRACK_H;
    const dy = y - py;
    const influence = Math.exp(-(dy * dy) / (2 * (PINCH_RADIUS * PINCH_RADIUS) / 4));
    const inset = pinch * influence;

    let baseInset = 0;
    if (y < RADIUS) {
      const dx = Math.sqrt(Math.max(0, RADIUS * RADIUS - (y - RADIUS) * (y - RADIUS)));
      baseInset = RADIUS - dx;
    }
    if (y > TRACK_H - RADIUS) {
      const cy = TRACK_H - RADIUS;
      const dx = Math.sqrt(Math.max(0, RADIUS * RADIUS - (y - cy) * (y - cy)));
      baseInset = RADIUS - dx;
    }

    const leftX = PAD_X + baseInset + inset;
    const rightX = PAD_X + TRACK_W - baseInset - inset;
    points.push({ y, leftX, rightX });
  }

  ctx.moveTo(points[0].rightX, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].rightX, points[i].y);
  }
  for (let i = points.length - 1; i >= 0; i--) {
    ctx.lineTo(points[i].leftX, points[i].y);
  }
  ctx.closePath();
}

function shapePath(hasPinch) {
  if (hasPinch) {
    buildPinchedPath(currentPinch, pointerY);
  } else {
    roundedRectPath(PAD_X, 0, TRACK_W, TRACK_H, RADIUS);
  }
}

function render() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  const hasPinch = currentPinch > 0.1;

  ctx.save();
  shapePath(hasPinch);
  ctx.clip();

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  if (phase === 'select') {
    const selectH = selectRatio * TRACK_H;
    const selectTop = TRACK_H - selectH;
    ctx.fillStyle = SELECT_COLOR;
    ctx.fillRect(0, selectTop, CANVAS_W, selectH);
  } else {
    const selectH = selectRatio * TRACK_H;
    const selectTop = TRACK_H - selectH;
    ctx.fillStyle = SELECT_COLOR;
    ctx.fillRect(0, selectTop, CANVAS_W, selectH);

    const fuelH = fuelRatio * selectRatio * TRACK_H;
    const fuelTop = TRACK_H - fuelH;
    ctx.fillStyle = FILL_COLOR;
    ctx.fillRect(0, fuelTop, CANVAS_W, fuelH);
  }

  ctx.restore();

  if (phase === 'refueling' && glareOpacity > 0.01) {
    const fuelH = fuelRatio * selectRatio * TRACK_H;
    const fuelTop = TRACK_H - fuelH;

    ctx.save();

    shapePath(hasPinch);
    ctx.clip();

    ctx.beginPath();
    ctx.rect(0, fuelTop, CANVAS_W, CANVAS_H - fuelTop);
    ctx.clip();

    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = glareOpacity;

    const GLARE_W = 260;
    const GLARE_H = 140;
    const glareCx = CANVAS_W / 2;
    const glareCy = fuelTop + 5;

    ctx.translate(glareCx, glareCy);
    ctx.scale(GLARE_W / 2 * glareScale, GLARE_H / 2 * glareScale);

    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.7)');
    grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.3)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.restore();
  }
}

function animate() {
  let needsUpdate = false;

  const pinchDiff = targetPinch - currentPinch;
  if (Math.abs(pinchDiff) > 0.05) {
    currentPinch = lerp(currentPinch, targetPinch, 0.13);
    needsUpdate = true;
  } else if (currentPinch !== targetPinch) {
    currentPinch = targetPinch;
    needsUpdate = true;
  }

  const glareDiff = targetGlare - glareOpacity;
  if (Math.abs(glareDiff) > 0.005) {
    glareOpacity = lerp(glareOpacity, targetGlare, 0.18);
    needsUpdate = true;
  } else if (glareOpacity !== targetGlare) {
    glareOpacity = targetGlare;
    needsUpdate = true;
  }

  const scaleDiff = targetGlareScale - glareScale;
  if (Math.abs(scaleDiff) > 0.01) {
    glareScale = lerp(glareScale, targetGlareScale, 0.17);
    needsUpdate = true;
  } else if (glareScale !== targetGlareScale) {
    glareScale = targetGlareScale;
    needsUpdate = true;
  }

  if (needsUpdate) {
    render();
    requestAnimationFrame(animate);
  } else {
    render();
    animRunning = false;
  }
}

function startAnim() {
  if (!animRunning) {
    animRunning = true;
    requestAnimationFrame(animate);
  }
}

function setLiters(val, fromDrag = false) {
  const prev = selectedLiters;
  selectedLiters = Math.max(MIN_LITERS, Math.min(MAX_LITERS, val));
  selectRatio = selectedLiters / MAX_LITERS;
  updateUI();
  render();

  if (selectedLiters !== prev) {
    if (fromDrag) {
      if (selectedLiters !== lastHapticLiter) {
        lastHapticLiter = selectedLiters;
        const intensity = 0.15 + 0.85 * (selectedLiters / MAX_LITERS);
        haptics.trigger([{ duration: 30, intensity }]);
      }
    } else {
      haptics.trigger('nudge');
    }
  }
}

function updateSelectFromPointer(clientY) {
  const rect = track.getBoundingClientRect();
  const y = clientY - rect.top;
  const ratio = 1 - Math.max(0, Math.min(1, y / rect.height));
  const liters = Math.max(MIN_LITERS, Math.round(ratio * MAX_LITERS));
  setLiters(liters, true);
  pointerY = Math.max(0, Math.min(TRACK_H, y));
}

function onPointerDown(e) {
  if (phase !== 'select') return;
  isDragging = true;
  track.setPointerCapture(e.pointerId);
  updateSelectFromPointer(e.clientY);
  targetPinch = PINCH_AMOUNT;
  startAnim();
}

function onPointerMove(e) {
  if (!isDragging) return;
  updateSelectFromPointer(e.clientY);
  render();
}

function onPointerUp() {
  if (!isDragging) return;
  isDragging = false;
  targetPinch = 0;
  startAnim();
}

track.addEventListener('pointerdown', onPointerDown);
track.addEventListener('pointermove', onPointerMove);
track.addEventListener('pointerup', onPointerUp);
track.addEventListener('pointercancel', onPointerUp);

btnPlus.addEventListener('click', () => {
  if (phase !== 'select') return;
  setLiters(selectedLiters + 1);
});

btnMinus.addEventListener('click', () => {
  if (phase !== 'select') return;
  setLiters(selectedLiters - 1);
});

let refuelAnim = null;

function startRefueling() {
  if (phase !== 'select') return;

  phase = 'refueling';
  fuelRatio = 0;
  glareScale = 1;
  targetGlareScale = 1;
  refuelBtn.disabled = true;
  btnPlus.disabled = true;
  btnMinus.disabled = true;

  targetPinch = PINCH_AMOUNT;
  targetGlare = 1;
  pointerY = TRACK_H;
  startAnim();

  const litersToFuel = selectedLiters;
  const duration = (litersToFuel / MAX_LITERS) * REFUEL_DURATION;
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);

    fuelRatio = t;
    pointerY = TRACK_H * (1 - t * selectRatio);
    render();

    if (t < 1) {
      refuelAnim = requestAnimationFrame(tick);
    } else {
      refuelAnim = null;
      targetPinch = 0;
      targetGlareScale = 4;
      targetGlare = 0;
      startAnim();

      setTimeout(() => {
        phase = 'select';
        fuelRatio = 0;
        glareScale = 1;
        targetGlareScale = 1;
        refuelBtn.disabled = false;
        btnPlus.disabled = false;
        btnMinus.disabled = false;
        render();
      }, 1500);
    }
  }

  refuelAnim = requestAnimationFrame(tick);
}

refuelBtn.addEventListener('click', startRefueling);

setLiters(MAX_LITERS);
render();
