import { sound } from './audio.js';
import { COLORS, measure, shadowEllipse, text, verticalGradient } from './draw.js';
import { t } from './i18n.js';
import { drawFrame } from './sprites.js';

const WALK_SPEED = 72;
const JUMP_SPEED = 255;
const GRAVITY = 760;
const WALK_FPS = 11;
const FLOOR_MARGIN = 46;
const EDGE_MARGIN = 26;
const CROUCH_SCALE = 0.8;
const STEP_FRAMES = [2, 6];
const ATTACKS = {
  punch: { fps: 17, activeFrame: 4, lunge: 3, shake: 0.12, sparkSize: 1 },
  kick: { fps: 14, activeFrame: 3, lunge: 1, shake: 0.18, sparkSize: 1.4 },
};
const STAR_COUNT = 90;
const HINT_GAP = 14;
const SPARK_COLORS = ['#ffffff', '#ffd23f', '#ffb347'];

function seededStars(count) {
  let seed = 11;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return Array.from({ length: count }, () => ({ x: random(), y: random() * 0.62, phase: random() * Math.PI * 2, bright: random() > 0.8 }));
}

export function createStageScene({ fighter, onBack }) {
  const sheet = fighter.sheetData;
  const stars = seededStars(STAR_COUNT);
  const particles = [];
  const body = { x: null, y: 0, vx: 0, vy: 0, facing: 1, crouching: false, attack: null, walkTime: 0, lastStep: -1 };
  let time = 0;
  let shake = 0;
  let viewWidth = 0;
  let floorY = 0;

  function spawn(x, y, vx, vy, life, color, size = 1, gravity = 0) {
    particles.push({ x, y, vx, vy, life, max: life, color, size, gravity });
  }

  function dust(x, amount) {
    for (let i = 0; i < amount; i++) spawn(x + (Math.random() - 0.5) * 20, floorY - 1, (Math.random() - 0.5) * 50, -Math.random() * 25, 0.35 + Math.random() * 0.2, '#6d6494', 1, 40);
  }

  function spark(x, y, scale) {
    for (let i = 0; i < 14 * scale; i++) {
      const angle = Math.random() * Math.PI * 2, speed = (60 + Math.random() * 90) * scale;
      spawn(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0.18 + Math.random() * 0.15, SPARK_COLORS[i % SPARK_COLORS.length], Math.random() > 0.6 ? 2 : 1);
    }
    particles.push({ x, y, life: 0.12, max: 0.12, ring: true, size: 6 * scale, color: '#ffffff' });
  }

  function streaks(direction, y) {
    for (let i = 0; i < 4; i++) spawn(body.x - direction * 10, y + (i - 1.5) * 5, -direction * (140 + Math.random() * 60), 0, 0.12, 'rgba(244, 241, 234, 0.7)', 1);
  }

  function startAttack(kind) {
    body.attack = { kind, time: 0, impacted: false };
    sound.whoosh();
    streaks(-body.facing, floorY - sheet.baseline + sheet.bodyTop + 30);
  }

  function impact() {
    const spec = ATTACKS[body.attack.kind];
    const frames = sheet.animations[body.attack.kind];
    const active = frames[Math.min(spec.activeFrame, frames.length - 1)];
    const reachX = active.right - sheet.width / 2;
    const x = body.x + body.facing * reachX;
    const y = floorY - body.y - (sheet.baseline - active.reachRow);
    spark(x, y, spec.sparkSize);
    shake = Math.max(shake, spec.shake);
    body.x += body.facing * spec.lunge;
    sound.impact();
  }

  function currentFrame() {
    if (body.attack) {
      const frames = sheet.animations[body.attack.kind];
      return { frame: frames[Math.min(frames.length - 1, Math.floor(body.attack.time * ATTACKS[body.attack.kind].fps))] };
    }
    const grounded = body.y <= 0;
    if (!grounded) return { frame: sheet.rotations.east, scaleY: body.vy > 0 ? 1.04 : 0.98 };
    if (body.crouching) return { frame: sheet.rotations.east, scaleY: CROUCH_SCALE };
    if (Math.abs(body.vx) > 1 && sheet.animations.walk) {
      const frames = sheet.animations.walk;
      return { frame: frames[Math.floor(body.walkTime * WALK_FPS) % frames.length] };
    }
    const idle = sheet.rotations.east;
    return { frame: idle, splitRow: Math.round(idle.top + (idle.bottom - idle.top) * 0.52), upperOffset: Math.floor(time * 2) % 2 };
  }

  return {
    update(dt, input, view) {
      time += dt;
      viewWidth = view.width;
      floorY = view.height - FLOOR_MARGIN;
      if (body.x === null) body.x = Math.round(view.width * 0.35);
      if (input.wasPressed('Escape')) { onBack(); return; }

      const grounded = body.y <= 0 && body.vy === 0;
      if (body.attack) {
        const spec = ATTACKS[body.attack.kind];
        body.attack.time += dt;
        const index = Math.floor(body.attack.time * spec.fps);
        if (!body.attack.impacted && index >= spec.activeFrame) { body.attack.impacted = true; impact(); }
        if (index >= sheet.animations[body.attack.kind].length) body.attack = null;
        if (grounded) body.vx = 0;
      } else {
        const direction = (input.isDown('ArrowRight', 'KeyD') ? 1 : 0) - (input.isDown('ArrowLeft', 'KeyA') ? 1 : 0);
        body.crouching = grounded && input.isDown('ArrowDown', 'KeyS');
        if (input.wasPressed('KeyJ', 'Space') && sheet.animations.punch) startAttack('punch');
        else if (input.wasPressed('KeyK') && sheet.animations.kick) startAttack('kick');
        else if (grounded && !body.crouching && input.wasPressed('ArrowUp', 'KeyW')) { body.vy = JUMP_SPEED; sound.jump(); dust(body.x, 6); }
        if (!body.attack) {
          body.vx = body.crouching ? 0 : direction * WALK_SPEED;
          if (direction) body.facing = direction;
        }
      }

      if (body.y > 0 || body.vy !== 0) {
        body.vy -= GRAVITY * dt;
        body.y += body.vy * dt;
        if (body.y <= 0) { body.y = 0; body.vy = 0; dust(body.x, 10); sound.land(); }
      }
      body.x = Math.min(view.width - EDGE_MARGIN, Math.max(EDGE_MARGIN, body.x + body.vx * dt));

      if (Math.abs(body.vx) > 1 && body.y <= 0 && !body.attack) {
        body.walkTime += dt;
        const frameIndex = Math.floor(body.walkTime * WALK_FPS) % 8;
        if (frameIndex !== body.lastStep && STEP_FRAMES.includes(frameIndex)) { dust(body.x - body.facing * 6, 2); sound.step(); }
        body.lastStep = frameIndex;
      } else body.walkTime = 0;

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        if (p.ring) continue;
        p.vy += (p.gravity ?? 0) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      shake = Math.max(0, shake - dt);
    },

    render(ctx, view) {
      const { width, height } = view;
      const offsetX = shake > 0 ? Math.round((Math.random() - 0.5) * 4) : 0;
      const offsetY = shake > 0 ? Math.round((Math.random() - 0.5) * 3) : 0;
      verticalGradient(ctx, width, height, '#0d0b22', '#030208');
      for (const star of stars) {
        const twinkle = Math.sin(time * 2 + star.phase) > 0.6;
        ctx.fillStyle = star.bright || twinkle ? '#cfd3ff' : '#4a4880';
        ctx.fillRect(Math.round(star.x * width), Math.round(star.y * height), 1, 1);
      }
      ctx.save();
      ctx.translate(offsetX, offsetY);

      const horizon = floorY;
      ctx.fillStyle = '#0a0820';
      ctx.fillRect(0, horizon, width, height - horizon);
      ctx.fillStyle = COLORS.grid;
      for (let i = 1; i < 8; i++) {
        const y = horizon + Math.round((i * i) * 0.9);
        if (y < height) ctx.fillRect(0, y, width, 1);
      }
      const vanishX = width / 2;
      for (let i = -12; i <= 12; i++) {
        const bottomX = vanishX + i * 48;
        for (let y = horizon; y < height; y++) {
          const k = (y - horizon) / (height - horizon);
          ctx.fillRect(Math.round(vanishX + (bottomX - vanishX) * k), y, 1, 1);
        }
      }
      ctx.fillStyle = COLORS.floor;
      ctx.fillRect(0, horizon, width, 1);

      shadowEllipse(ctx, body.x, floorY + 1, Math.max(8, 16 - body.y * 0.08), 2, Math.max(0.15, 0.45 - body.y * 0.004));
      const pose = currentFrame();
      drawFrame(ctx, sheet, pose.frame, body.x, floorY - body.y, { flip: body.facing < 0, scaleY: pose.scaleY ?? 1, splitRow: pose.splitRow ?? null, upperOffset: pose.upperOffset ?? 0 });

      for (const p of particles) {
        const k = p.life / p.max;
        if (p.ring) {
          const radius = Math.round(p.size * (1.6 - k));
          ctx.fillStyle = p.color;
          for (let a = 0; a < 16; a++) {
            const angle = (a / 16) * Math.PI * 2;
            ctx.fillRect(Math.round(p.x + Math.cos(angle) * radius), Math.round(p.y + Math.sin(angle) * radius), 1, 1);
          }
          continue;
        }
        ctx.globalAlpha = Math.min(1, k * 1.5);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      text(ctx, t(fighter.nameKey), 12, 10, { color: COLORS.white });
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(11, 21, 122, 9);
      ctx.fillStyle = COLORS.gold;
      ctx.fillRect(12, 22, 120, 7);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(12, 22, 120, 2);
      text(ctx, t('training'), width - 12, 10, { align: 'right', color: COLORS.gold });

      const hints = [t('controlsMove'), t('controlsJump'), t('controlsCrouch'), t('controlsPunch'), t('controlsKick'), t('backHint')];
      const rows = [[]];
      let rowWidth = 0;
      for (const hint of hints) {
        const hintWidth = measure(ctx, hint) + HINT_GAP;
        if (rowWidth + hintWidth > width - 24 && rows[rows.length - 1].length) { rows.push([]); rowWidth = 0; }
        rows[rows.length - 1].push(hint);
        rowWidth += hintWidth;
      }
      rows.forEach((row, rowIndex) => {
        let x = 12;
        const y = height - 13 - (rows.length - 1 - rowIndex) * 11;
        for (const hint of row) {
          text(ctx, hint, x, y, { color: COLORS.muted });
          x += measure(ctx, hint) + HINT_GAP;
        }
      });
    },
  };
}
