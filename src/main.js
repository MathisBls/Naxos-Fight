import { sound } from './audio.js';
import { COLORS, text, verticalGradient } from './draw.js';
import { t } from './i18n.js';
import { CHARACTERS } from './roster.js';
import { createSelectScene } from './select.js';
import { loadImage, loadSheet } from './sprites.js';
import { createStageScene } from './stage.js';
import { createTitleScene } from './title.js';

const LOGO_SRC = 'assets/logo.png';

const TARGET_HEIGHT = 240;
const MIN_WIDTH = 400;
const MAX_FRAME_SECONDS = 1 / 30;
const FADE_SECONDS = 0.18;
const BLOCKED_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
const view = { width: 0, height: 0, scale: 1 };

function resize() {
  const scale = Math.max(1, Math.min(Math.round(window.innerHeight / TARGET_HEIGHT), Math.floor(window.innerWidth / MIN_WIDTH)));
  view.scale = scale;
  view.width = Math.ceil(window.innerWidth / scale);
  view.height = Math.ceil(window.innerHeight / scale);
  canvas.width = view.width;
  canvas.height = view.height;
  canvas.style.width = `${view.width * scale}px`;
  canvas.style.height = `${view.height * scale}px`;
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

const held = new Set();
const pressed = new Set();
window.addEventListener('keydown', event => {
  if (BLOCKED_KEYS.has(event.code)) event.preventDefault();
  if (!held.has(event.code)) pressed.add(event.code);
  held.add(event.code);
  sound.unlock();
});
window.addEventListener('keyup', event => held.delete(event.code));
window.addEventListener('blur', () => held.clear());

const input = {
  isDown: (...codes) => codes.some(code => held.has(code)),
  wasPressed: (...codes) => codes.some(code => pressed.has(code)),
};

let scene = null;
let fade = { alpha: 1, target: 0, next: null };

function goTo(createNext) {
  fade = { alpha: fade.alpha, target: 1, next: createNext };
}

function updateFade(dt) {
  const step = dt / FADE_SECONDS;
  if (fade.target > fade.alpha) {
    fade.alpha = Math.min(1, fade.alpha + step);
    if (fade.alpha >= 1 && fade.next) { scene = fade.next(); fade = { alpha: 1, target: 0, next: null }; }
  } else fade.alpha = Math.max(0, fade.alpha - step);
}

function drawLoading() {
  verticalGradient(ctx, view.width, view.height, '#12103a', COLORS.ink);
  text(ctx, t('loading'), view.width / 2, view.height / 2 - 4, { align: 'center', color: COLORS.gold });
}

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
  last = now;
  if (scene) {
    scene.update(dt, input, view);
    scene.render(ctx, view);
  } else drawLoading();
  updateFade(dt);
  if (fade.alpha > 0) {
    ctx.fillStyle = `rgba(7, 6, 15, ${fade.alpha})`;
    ctx.fillRect(0, 0, view.width, view.height);
  }
  pressed.clear();
  requestAnimationFrame(loop);
}

async function loadRoster() {
  return Promise.all(CHARACTERS.map(async character => ({
    ...character,
    portraitImage: await loadImage(character.portrait),
    thumbImage: await loadImage(character.thumb),
    sheetData: await loadSheet(character.sheet, character.sheetData),
  })));
}

async function boot() {
  requestAnimationFrame(loop);
  const [roster, logo] = await Promise.all([loadRoster(), loadImage(LOGO_SRC).catch(() => null), document.fonts.load('8px "Press Start 2P"')]);
  const openTitle = () => createTitleScene({ logo, onStart: () => goTo(openSelect) });
  const openSelect = () => createSelectScene({ roster, onBack: () => goTo(openTitle), onPick: fighter => goTo(() => createStageScene({ fighter, onBack: () => goTo(openSelect) })) });
  scene = openTitle();
}

boot();
