import { sound } from './audio.js';
import { COLORS, frame, measure, panel, segmentBar, shadowEllipse, stripes, text, verticalGradient, wrapText } from './draw.js';
import { t } from './i18n.js';
import { ROSTER_SLOTS, STAT_MAX } from './roster.js';
import { drawBust, drawFrame } from './sprites.js';

const TURNTABLE = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'];
const TURNTABLE_HOLD_SECONDS = 1.8;
const TURNTABLE_STEP_SECONDS = 0.22;
const SLOT_SIZE = 26;
const SLOT_GAP = 4;
const SLOT_STRIPE_ALPHA = 0.35;
const SLOT_STRIPE_SPACING = 4;
const BLINK_SECONDS = 0.5;
const NAME_SIZE = 16;
const NAME_SIZE_SMALL = 8;
const STATS = [['power', 'statPower', COLORS.red], ['speed', 'statSpeed', COLORS.cyan], ['stamina', 'statStamina', '#7ee08a']];

let rememberedIndex = 0;

function buildBackground(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  verticalGradient(ctx, width, height, '#1b1550', '#07060f');
  stripes(ctx, width, height, 'rgba(255, 255, 255, 0.035)');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  for (let y = height - 70; y < height; y += 12) ctx.fillRect(0, y, width, 6);
  return canvas;
}

export function createSelectScene({ roster, onPick, onBack }) {
  let index = Math.min(rememberedIndex, ROSTER_SLOTS - 1);
  let time = 0;
  let turntableTime = 0;
  let background = null;
  let backgroundKey = '';
  let confirmed = false;

  const current = () => roster[index] ?? null;

  function move(step) {
    index = (index + step + ROSTER_SLOTS) % ROSTER_SLOTS;
    rememberedIndex = index;
    turntableTime = 0;
    sound.cursor();
  }

  function turntableDirection() {
    if (turntableTime < TURNTABLE_HOLD_SECONDS) return 'south';
    const step = Math.floor((turntableTime - TURNTABLE_HOLD_SECONDS) / TURNTABLE_STEP_SECONDS);
    if (step >= TURNTABLE.length) { turntableTime = 0; return 'south'; }
    return TURNTABLE[step];
  }

  return {
    update(dt, input) {
      time += dt;
      turntableTime += dt;
      if (confirmed) return;
      if (input.wasPressed('Escape')) { confirmed = true; onBack(); return; }
      if (input.wasPressed('ArrowRight', 'KeyD')) move(1);
      if (input.wasPressed('ArrowLeft', 'KeyA')) move(-1);
      if (input.wasPressed('ArrowDown', 'KeyS')) move(Math.ceil(ROSTER_SLOTS / 2));
      if (input.wasPressed('ArrowUp', 'KeyW')) move(-Math.ceil(ROSTER_SLOTS / 2));
      if (input.wasPressed('Enter', 'Space', 'NumpadEnter')) {
        if (!current()) { sound.denied(); return; }
        confirmed = true;
        sound.confirm();
        onPick(current());
      }
    },

    render(ctx, view) {
      const { width, height } = view;
      const key = `${width}x${height}`;
      if (key !== backgroundKey) { background = buildBackground(width, height); backgroundKey = key; }
      ctx.drawImage(background, 0, 0);

      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(0, 6, width, 17);
      ctx.fillStyle = COLORS.goldDeep;
      ctx.fillRect(0, 23, width, 1);
      text(ctx, t('selectTitle'), width / 2, 11, { align: 'center', color: COLORS.gold });

      const fighter = current();
      const portraitX = 14, portraitY = 34;
      const portraitWidth = 74, portraitHeight = 98;
      frame(ctx, portraitX, portraitY, portraitWidth, portraitHeight, fighter ? COLORS.gold : COLORS.muted);
      if (fighter) ctx.drawImage(fighter.portraitImage, portraitX, portraitY, portraitWidth, portraitHeight);
      else {
        ctx.fillStyle = COLORS.locked;
        ctx.fillRect(portraitX, portraitY, portraitWidth, portraitHeight);
        text(ctx, '?', portraitX + portraitWidth / 2, portraitY + 40, { align: 'center', size: 16, color: COLORS.muted });
      }

      const previewWidth = 96;
      const infoX = portraitX + portraitWidth + 14;
      const infoWidth = Math.max(120, width - infoX - previewWidth - 16);
      const name = fighter ? t(fighter.nameKey) : t('lockedName');
      const nameSize = measure(ctx, name, NAME_SIZE) <= infoWidth ? NAME_SIZE : NAME_SIZE_SMALL;
      text(ctx, name, infoX, nameSize === NAME_SIZE ? 34 : 40, { size: nameSize });
      text(ctx, fighter ? t(fighter.roleKey) : t('locked'), infoX, 54, { color: fighter ? fighter.accent : COLORS.muted });
      if (fighter) {
        STATS.forEach(([stat, labelKey, color], row) => {
          text(ctx, t(labelKey), infoX, 68 + row * 11, { color: COLORS.white });
          segmentBar(ctx, infoX + 82, 68 + row * 11, fighter.stats[stat], STAT_MAX, color);
        });
        text(ctx, t('movesTitle'), infoX, 104, { color: COLORS.gold });
        fighter.moveKeys.forEach((moveKey, row) => text(ctx, `${row + 1} ${t(moveKey)}`, infoX, 114 + row * 10, { color: row === 0 ? COLORS.white : COLORS.muted }));
      }

      const previewX = width - previewWidth / 2 - 10;
      const groundY = 142;
      shadowEllipse(ctx, previewX, groundY, 18, 3);
      if (fighter) {
        const sheet = fighter.sheetData;
        const direction = turntableDirection();
        const breathing = direction === 'south' && Math.floor(time * 2) % 2 === 1 ? 1 : 0;
        const rotation = sheet.rotations[direction] ?? sheet.rotations.south;
        const splitRow = Math.round(rotation.top + (rotation.bottom - rotation.top) * 0.52);
        drawFrame(ctx, sheet, rotation, previewX, groundY, { splitRow, upperOffset: breathing });
      }

      const bioY = 152;
      panel(ctx, 14, bioY, width - 28, 26);
      const bio = fighter ? t(fighter.bioKey) : t('lockedBio');
      wrapText(ctx, bio, width - 44).slice(0, 2).forEach((line, row) => text(ctx, line, 22, bioY + 5 + row * 10));

      const oneRow = ROSTER_SLOTS * (SLOT_SIZE + SLOT_GAP) - SLOT_GAP <= width - 28;
      const perRow = oneRow ? ROSTER_SLOTS : Math.ceil(ROSTER_SLOTS / 2);
      const rows = Math.ceil(ROSTER_SLOTS / perRow);
      const stripWidth = perRow * (SLOT_SIZE + SLOT_GAP) - SLOT_GAP;
      const stripX = Math.round((width - stripWidth) / 2);
      const stripY = Math.max(bioY + 32, height - rows * (SLOT_SIZE + SLOT_GAP) - 20);
      for (let slot = 0; slot < ROSTER_SLOTS; slot++) {
        const x = stripX + (slot % perRow) * (SLOT_SIZE + SLOT_GAP);
        const y = stripY + Math.floor(slot / perRow) * (SLOT_SIZE + SLOT_GAP);
        const occupant = roster[slot];
        const isCurrent = slot === index;
        const blinkOn = Math.floor(time / BLINK_SECONDS) % 2 === 0;
        frame(ctx, x, y, SLOT_SIZE, SLOT_SIZE, isCurrent ? (blinkOn ? COLORS.gold : COLORS.goldDeep) : COLORS.panelLight, isCurrent ? 2 : 1);
        ctx.fillStyle = occupant ? COLORS.slot : COLORS.locked;
        ctx.fillRect(x, y, SLOT_SIZE, SLOT_SIZE);
        if (occupant) {
          ctx.save();
          ctx.translate(x, y);
          ctx.beginPath();
          ctx.rect(0, 0, SLOT_SIZE, SLOT_SIZE);
          ctx.clip();
          ctx.globalAlpha = SLOT_STRIPE_ALPHA;
          stripes(ctx, SLOT_SIZE, SLOT_SIZE, occupant.accent, SLOT_STRIPE_SPACING);
          ctx.restore();
          drawBust(ctx, occupant.sheetData, occupant.sheetData.rotations.south, x + 1, y + 1, SLOT_SIZE - 2);
        } else text(ctx, '?', x + SLOT_SIZE / 2, y + 9, { align: 'center', color: COLORS.muted });
      }

      const hintY = height - 13;
      const prompt = current() ? t('pressStart') : t('locked');
      if (Math.floor(time / BLINK_SECONDS) % 2 === 0 || !current()) text(ctx, prompt, width / 2, hintY, { align: 'center', color: current() ? COLORS.gold : COLORS.muted });
      const freeSide = (width - measure(ctx, prompt)) / 2 - 20;
      if (measure(ctx, t('browseHint')) <= freeSide) text(ctx, t('browseHint'), 14, hintY, { color: COLORS.muted });
    },
  };
}
