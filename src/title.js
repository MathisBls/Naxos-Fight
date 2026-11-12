import { sound } from './audio.js';
import { COLORS, text, verticalGradient } from './draw.js';
import { t } from './i18n.js';

const BLINK_SECONDS = 0.5;
const LOGO_MAX_WIDTH_RATIO = 0.82;
const LOGO_MAX_HEIGHT_RATIO = 0.62;
const LOGO_FLOAT_PIXELS = 2;

export function createTitleScene({ logo, onStart }) {
  let time = 0;
  let started = false;

  return {
    update(dt, input) {
      time += dt;
      if (started) return;
      if (input.wasPressed('Enter', 'Space', 'NumpadEnter')) {
        started = true;
        sound.confirm();
        onStart();
      }
    },

    render(ctx, view) {
      const { width, height } = view;
      verticalGradient(ctx, width, height, '#0b1640', '#000000');
      ctx.fillStyle = 'rgba(80, 160, 255, 0.06)';
      for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 1);

      const float = Math.round(Math.sin(time * 2) * LOGO_FLOAT_PIXELS);
      if (logo) {
        const scale = Math.min((width * LOGO_MAX_WIDTH_RATIO) / logo.width, (height * LOGO_MAX_HEIGHT_RATIO) / logo.height);
        const drawWidth = Math.round(logo.width * scale), drawHeight = Math.round(logo.height * scale);
        ctx.drawImage(logo, Math.round((width - drawWidth) / 2), Math.round(height * 0.38 - drawHeight / 2) + float, drawWidth, drawHeight);
      } else {
        text(ctx, t('gameTitle'), width / 2, height * 0.34 + float, { align: 'center', size: 24, color: COLORS.cyan });
      }

      if (Math.floor(time / BLINK_SECONDS) % 2 === 0) text(ctx, t('pressStart'), width / 2, height * 0.78, { align: 'center', color: COLORS.gold });
      text(ctx, t('titleFooter'), width / 2, height - 14, { align: 'center', color: COLORS.muted });
    },
  };
}
