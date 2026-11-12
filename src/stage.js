import { sound } from './audio.js';
import { COLORS, measure, shadowEllipse, text, verticalGradient } from './draw.js';
import { t } from './i18n.js';
import { CODE_KEYS, CODE_LENGTH, NET_STATUS, ROLE, buildJoinLink, createNetSession, createRoomCode, readJoinCode } from './net.js';
import { ANIMATION } from './roster.js';
import { drawFrame } from './sprites.js';

const WALK_SPEED = 125;
const BACK_SPEED = 100;
const JUMP_SPEED = 345;
const JUMP_DRIFT = 130;
const GRAVITY = 1400;
const FLOOR_MARGIN = 46;
const HINT_BOTTOM = 13;
const EDGE_MARGIN = 26;
const ARENA_WIDTH = 400;
const REMOTE_INPUT_TIMEOUT = 0.5;
const NET_NOTICE_TIME = 3;
const START_GAP = 0.18;
const MIN_SPACING = 46;
const BODY_HALF_WIDTH = 18;
const REACH_TOLERANCE = 4;
const THREAT_RANGE = 96;
const MAX_HEALTH = 100;
const HEALTH_BAR_MAX_WIDTH = 170;
const HEALTH_BAR_HEIGHT = 9;
const HEALTH_BAR_TOP = 9;
const HUD_MARGIN = 8;
const KO_BADGE_WIDTH = 26;
const KO_BADGE_HEIGHT = 15;
const LOW_HEALTH = 25;
const BLINK_RATE = 8;
const HEALTH_TRAIL_SPEED = 55;
const REGEN_DELAY = 1.6;
const REGEN_SPEED = 35;
const ROUND_RESET_DELAY = 3.4;
const VICTORY_DELAY = 0.7;
const HIT_STOP = 0.06;
const PUSH_DECAY = 9;
const PRE_JUMP_TIME = 0.03;
const LANDING_TIME = 0.05;
const DOWN_TIME = 0.45;
const BLOCK_STUN = 0.16;
const STEP_FRAMES = [2, 6];
const STAR_COUNT = 90;
const HINT_GAP = 14;
const HINT_LINE = 11;
const SPARK_SETS = Object.freeze({ hit: [COLORS.white, COLORS.gold, COLORS.sparkHot], block: [COLORS.white, COLORS.cyan] });
const PARTNER_FILTER = 'saturate(0.35) brightness(0.72) contrast(1.15)';

const FPS = Object.freeze({ idle: 9, walk: 17, crouch: 5, block: 20, hurt: 16, knockdown: 16, getUp: 14, ko: 11, victory: 10 });
const JUMP_FRAME = Object.freeze({ prepare: 0, rise: 1, tuck: [2, 3, 4], fall: 5, land: 6 });

const STATE = Object.freeze({
  IDLE: 'idle',
  WALK: 'walk',
  CROUCH: 'crouch',
  PRE_JUMP: 'preJump',
  JUMP: 'jump',
  LANDING: 'landing',
  ATTACK: 'attack',
  BLOCK: 'block',
  HURT: 'hurt',
  KNOCKDOWN: 'knockdown',
  DOWN: 'down',
  GET_UP: 'getUp',
  KO: 'ko',
  VICTORY: 'victory',
});

const HEIGHT = Object.freeze({ HIGH: 'high', MID: 'mid', LOW: 'low' });
const STANCE = Object.freeze({ STAND: 'stand', CROUCH: 'crouch', AIR: 'air' });
const BUTTON = Object.freeze({ LIGHT_PUNCH: 'lightPunch', HEAVY_PUNCH: 'heavyPunch', LIGHT_KICK: 'lightKick', HEAVY_KICK: 'heavyKick' });

const MOVES = {
  punch: { animation: ANIMATION.PUNCH, fps: 18, damage: 6, height: HEIGHT.MID, push: 50, spark: 1, light: true },
  uppercut: { animation: ANIMATION.UPPERCUT, fps: 14, damage: 12, height: HEIGHT.MID, push: 90, spark: 1.5, knockdown: true },
  lightKick: { animation: ANIMATION.LIGHT_KICK, fps: 16, damage: 7, height: HEIGHT.MID, push: 60, spark: 1.1, light: true },
  kick: { animation: ANIMATION.KICK, fps: 14, damage: 11, height: HEIGHT.MID, push: 110, spark: 1.4 },
  crouchPunch: { animation: ANIMATION.CROUCH_PUNCH, fps: 18, damage: 5, height: HEIGHT.LOW, push: 40, spark: 0.9, light: true },
  sweep: { animation: ANIMATION.SWEEP, fps: 14, damage: 9, height: HEIGHT.LOW, push: 30, spark: 1.2, knockdown: true },
  jumpPunch: { animation: ANIMATION.JUMP_PUNCH, fps: 16, damage: 8, height: HEIGHT.HIGH, push: 70, spark: 1.1 },
  jumpKick: { animation: ANIMATION.JUMP_KICK, fps: 14, damage: 10, height: HEIGHT.HIGH, push: 90, spark: 1.3 },
};

const MOVE_FOR_BUTTON = {
  [STANCE.STAND]: { lightPunch: 'punch', heavyPunch: 'uppercut', lightKick: 'lightKick', heavyKick: 'kick' },
  [STANCE.CROUCH]: { lightPunch: 'crouchPunch', heavyPunch: 'crouchPunch', lightKick: 'sweep', heavyKick: 'sweep' },
  [STANCE.AIR]: { lightPunch: 'jumpPunch', heavyPunch: 'jumpPunch', lightKick: 'jumpKick', heavyKick: 'jumpKick' },
};

const FALLBACK_ANIMATION = {
  [ANIMATION.WALK]: ANIMATION.IDLE,
  [ANIMATION.UPPERCUT]: ANIMATION.PUNCH,
  [ANIMATION.LIGHT_KICK]: ANIMATION.KICK,
  [ANIMATION.CROUCH_PUNCH]: ANIMATION.PUNCH,
  [ANIMATION.JUMP_PUNCH]: ANIMATION.JUMP_KICK,
  [ANIMATION.CROUCH_BLOCK]: ANIMATION.BLOCK,
  [ANIMATION.CROUCH_HURT]: ANIMATION.HURT,
  [ANIMATION.KO]: ANIMATION.KNOCKDOWN,
  [ANIMATION.GET_UP]: ANIMATION.IDLE,
  [ANIMATION.VICTORY]: ANIMATION.IDLE,
};

const PLAYER_ONE_KEYS = {
  left: ['KeyA'],
  right: ['KeyD'],
  up: ['KeyW'],
  down: ['KeyS'],
  [BUTTON.LIGHT_PUNCH]: ['KeyF'],
  [BUTTON.HEAVY_PUNCH]: ['KeyG'],
  [BUTTON.LIGHT_KICK]: ['KeyV'],
  [BUTTON.HEAVY_KICK]: ['KeyB'],
};

const PLAYER_TWO_KEYS = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  [BUTTON.LIGHT_PUNCH]: ['KeyI', 'Numpad4'],
  [BUTTON.HEAVY_PUNCH]: ['KeyO', 'Numpad5'],
  [BUTTON.LIGHT_KICK]: ['KeyK', 'Numpad1'],
  [BUTTON.HEAVY_KICK]: ['KeyL', 'Numpad2'],
};

const SYSTEM_KEYS = {
  host: ['KeyN'],
  join: ['KeyR'],
  confirm: ['Enter', 'NumpadEnter'],
  erase: ['Backspace'],
  partnerMode: ['Tab'],
  toggleHints: ['KeyH'],
  testHurt: ['Digit1'],
  testKnockdown: ['Digit2'],
  testVictory: ['Digit3'],
  testKo: ['Digit4'],
};

const PARTNER_MODE = Object.freeze({ VERSUS: 'versus', STAND: 'stand', CROUCH: 'crouch', GUARD: 'guard', ATTACK: 'attack' });
const PARTNER_MODES = Object.values(PARTNER_MODE);
const PARTNER_MODE_KEYS = {
  [PARTNER_MODE.VERSUS]: 'playerTwo',
  [PARTNER_MODE.STAND]: 'partnerStand',
  [PARTNER_MODE.CROUCH]: 'partnerCrouch',
  [PARTNER_MODE.GUARD]: 'partnerGuard',
  [PARTNER_MODE.ATTACK]: 'partnerAttack',
};
const ROUNDS_TO_WIN = 2;
const ROUND_MARKER_SIZE = 5;
const PARTNER_ATTACK_INTERVAL = 1.3;
const PARTNER_ATTACK_RANGE = 74;
const PARTNER_BUTTONS = [BUTTON.LIGHT_PUNCH, BUTTON.LIGHT_KICK, BUTTON.HEAVY_KICK, BUTTON.HEAVY_PUNCH];

const CONTROLLABLE = new Set([STATE.IDLE, STATE.WALK, STATE.CROUCH, STATE.BLOCK]);
const INVULNERABLE = new Set([STATE.KNOCKDOWN, STATE.DOWN, STATE.GET_UP, STATE.KO, STATE.VICTORY]);
const GUARD_STATES = new Set([STATE.IDLE, STATE.WALK, STATE.CROUCH, STATE.BLOCK]);

function seededStars(count) {
  let seed = 11;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return Array.from({ length: count }, () => ({ x: random(), y: random() * 0.62, phase: random() * Math.PI * 2, bright: random() > 0.8 }));
}

function createFighter({ nameKey, labelKey, facing, isPartner }) {
  return {
    nameKey, labelKey, facing, isPartner,
    x: null, y: 0, vx: 0, vy: 0, push: 0,
    health: MAX_HEALTH, healthTrail: MAX_HEALTH, sinceHit: REGEN_DELAY,
    state: STATE.IDLE, stateTime: 0,
    crouching: false, guarding: false, walkDirection: 0, walkTime: 0, lastStep: -1,
    roundsWon: 0, jumpDirection: 0, move: null, moveResolved: false, cancelable: false, stun: 0, combo: 0,
  };
}

function emptyIntent() {
  return { direction: 0, up: false, down: false, autoGuard: false, button: null };
}

export function createStageScene({ fighter, onBack }) {
  const sheet = fighter.sheetData;
  const stars = seededStars(STAR_COUNT);
  const particles = [];
  const player = createFighter({ nameKey: fighter.nameKey, labelKey: 'playerOne', facing: 1, isPartner: false });
  const partner = createFighter({ nameKey: fighter.nameKey, labelKey: 'playerTwo', facing: -1, isPartner: true });
  const fighters = [player, partner];
  const activeFrameCache = new Map();
  let partnerModeIndex = 0;
  let matchWinner = null;
  let partnerCooldown = PARTNER_ATTACK_INTERVAL;
  let showHints = false;
  let time = 0;
  let shake = 0;
  let hitStop = 0;
  let roundOver = 0;
  const floorY = 0;
  const viewWidth = ARENA_WIDTH;
  let screenFloorY = 0;
  let role = ROLE.LOCAL;
  let net = null;
  let netStatus = null;
  let netNotice = null;
  let netNoticeTime = 0;
  let roomCode = '';
  let typedCode = null;
  let linkCopied = false;
  let remoteIntent = emptyIntent();
  let remoteInputAge = 0;
  const remoteButtons = [];
  const pendingEvents = [];
  let hintRowCount = 1;

  const framesFor = key => sheet.animations[key] ?? sheet.animations[FALLBACK_ANIMATION[key]] ?? [sheet.rotations.east];
  const isOnline = () => role !== ROLE.LOCAL;
  const isVersus = () => isOnline() || PARTNER_MODES[partnerModeIndex] === PARTNER_MODE.VERSUS;
  const localBody = () => (role === ROLE.GUEST ? partner : player);
  const opponentOf = body => (body === player ? partner : player);
  const grounded = body => body.y <= 0 && body.vy === 0;
  const loopFrame = (frames, seconds, fps) => frames[Math.floor(seconds * fps) % frames.length];
  const holdFrame = (frames, seconds, fps) => frames[Math.min(frames.length - 1, Math.floor(seconds * fps))];
  const playLength = (frames, fps) => frames.length / fps;

  function activeFrameIndex(animation) {
    if (!activeFrameCache.has(animation)) {
      const frames = framesFor(animation);
      let best = 0;
      frames.forEach((frame, index) => { if (frame.right > frames[best].right) best = index; });
      activeFrameCache.set(animation, best);
    }
    return activeFrameCache.get(animation);
  }

  function setState(body, state) {
    body.state = state;
    body.stateTime = 0;
  }

  function resetRound() {
    player.x = Math.round(viewWidth * (0.5 - START_GAP));
    partner.x = Math.round(viewWidth * (0.5 + START_GAP));
    for (const body of fighters) {
      Object.assign(body, { y: 0, vx: 0, vy: 0, push: 0, health: MAX_HEALTH, healthTrail: MAX_HEALTH, move: null, stun: 0, combo: 0, crouching: false, guarding: false });
      setState(body, STATE.IDLE);
    }
    player.facing = 1;
    partner.facing = -1;
    roundOver = 0;
    if (matchWinner) {
      for (const body of fighters) body.roundsWon = 0;
      matchWinner = null;
    }
  }

  function resetMatch() {
    for (const body of fighters) body.roundsWon = 0;
    matchWinner = null;
    resetRound();
  }

  function spawn(x, y, vx, vy, life, color, size = 1, gravity = 0) {
    particles.push({ x, y, vx, vy, life, max: life, color, size, gravity });
  }

  function play(name) {
    sound[name]();
    if (role === ROLE.HOST) pendingEvents.push({ type: 'sound', name });
  }

  function dust(x, amount) {
    if (role === ROLE.HOST) pendingEvents.push({ type: 'dust', x, amount });
    for (let i = 0; i < amount; i++) spawn(x + (Math.random() - 0.5) * 20, floorY - 1, (Math.random() - 0.5) * 50, -Math.random() * 25, 0.35 + Math.random() * 0.2, COLORS.dust, 1, 40);
  }

  function spark(x, y, scale, setName) {
    const colors = SPARK_SETS[setName];
    if (role === ROLE.HOST) pendingEvents.push({ type: 'spark', x, y, scale, setName });
    for (let i = 0; i < 14 * scale; i++) {
      const angle = Math.random() * Math.PI * 2, speed = (60 + Math.random() * 90) * scale;
      spawn(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0.18 + Math.random() * 0.15, colors[i % colors.length], Math.random() > 0.6 ? 2 : 1);
    }
    particles.push({ x, y, life: 0.12, max: 0.12, ring: true, size: 6 * scale, color: colors[0] });
  }

  function stanceOf(body) {
    if (!grounded(body)) return STANCE.AIR;
    return body.crouching ? STANCE.CROUCH : STANCE.STAND;
  }

  function startMove(body, button) {
    const stance = stanceOf(body);
    const moveKey = MOVE_FOR_BUTTON[stance][button];
    body.move = { key: moveKey, ...MOVES[moveKey], stance };
    body.moveResolved = false;
    body.cancelable = false;
    setState(body, STATE.ATTACK);
    if (stance !== STANCE.AIR) body.vx = 0;
    play('whoosh');
  }

  function startJump(body, direction) {
    body.jumpDirection = direction;
    body.crouching = false;
    setState(body, STATE.PRE_JUMP);
  }

  function hurt(body, attacker, move) {
    body.health = Math.max(0, body.health - move.damage);
    body.sinceHit = 0;
    body.combo = attacker.combo;
    body.push = attacker.facing * move.push;
    body.move = null;
    if (body.health <= 0) {
      setState(body, STATE.KO);
      body.vy = grounded(body) ? 0 : body.vy;
      roundOver = ROUND_RESET_DELAY;
      if (isVersus()) {
        attacker.roundsWon += 1;
        if (attacker.roundsWon >= ROUNDS_TO_WIN) matchWinner = attacker;
      }
      return;
    }
    if (move.knockdown || !grounded(body)) {
      setState(body, STATE.KNOCKDOWN);
      return;
    }
    setState(body, STATE.HURT);
  }

  function canBlock(defender, move) {
    if (!defender.guarding || !grounded(defender) || !GUARD_STATES.has(defender.state)) return false;
    if (move.height === HEIGHT.LOW) return defender.crouching;
    if (move.height === HEIGHT.HIGH) return !defender.crouching;
    return true;
  }

  function resolveHit(attacker) {
    const defender = opponentOf(attacker);
    const move = attacker.move;
    const frames = framesFor(move.animation);
    const active = frames[activeFrameIndex(move.animation)];
    const reach = active.right - sheet.width / 2;
    const distance = (defender.x - attacker.x) * attacker.facing;
    if (INVULNERABLE.has(defender.state) || distance <= 0 || distance - BODY_HALF_WIDTH - REACH_TOLERANCE > reach) return;
    const tipX = attacker.x + attacker.facing * reach;
    const contactX = attacker.facing > 0 ? Math.min(tipX, defender.x) : Math.max(tipX, defender.x);
    const contactY = floorY - attacker.y - (sheet.baseline - active.reachRow);
    hitStop = HIT_STOP;
    attacker.cancelable = true;
    if (canBlock(defender, move)) {
      setState(defender, STATE.BLOCK);
      defender.stun = BLOCK_STUN;
      defender.push = attacker.facing * move.push * 0.5;
      attacker.combo = 0;
      spark(contactX, contactY, move.spark * 0.6, 'block');
      play('block');
      return;
    }
    attacker.combo = INVULNERABLE.has(defender.state) || defender.state === STATE.HURT ? attacker.combo + 1 : 1;
    hurt(defender, attacker, move);
    spark(contactX, contactY, move.spark, 'hit');
    shake = Math.max(shake, 0.1 + move.spark * 0.05);
    play('impact');
  }

  function keyboardIntent(input, keys) {
    const intent = emptyIntent();
    intent.direction = (input.isDown(...keys.right) ? 1 : 0) - (input.isDown(...keys.left) ? 1 : 0);
    intent.up = input.isDown(...keys.up);
    intent.down = input.isDown(...keys.down);
    intent.button = Object.values(BUTTON).find(button => input.wasPressed(...keys[button])) ?? null;
    return intent;
  }

  function partnerIntent(input, dt) {
    const mode = PARTNER_MODES[partnerModeIndex];
    if (mode === PARTNER_MODE.VERSUS) return keyboardIntent(input, PLAYER_TWO_KEYS);
    const intent = emptyIntent();
    const distance = Math.abs(player.x - partner.x);
    const playerMove = player.state === STATE.ATTACK ? player.move : null;
    if (mode === PARTNER_MODE.CROUCH) intent.down = true;
    if (mode === PARTNER_MODE.GUARD) {
      intent.autoGuard = true;
      intent.down = playerMove ? playerMove.height === HEIGHT.LOW : false;
    }
    if (mode === PARTNER_MODE.ATTACK) {
      partnerCooldown -= dt;
      if (distance > PARTNER_ATTACK_RANGE) intent.direction = Math.sign(player.x - partner.x);
      else if (partnerCooldown <= 0 && CONTROLLABLE.has(partner.state)) {
        const button = PARTNER_BUTTONS[Math.floor(Math.random() * PARTNER_BUTTONS.length)];
        intent.down = button === BUTTON.HEAVY_KICK && Math.random() > 0.5;
        intent.button = button;
        partnerCooldown = PARTNER_ATTACK_INTERVAL * (0.7 + Math.random() * 0.6);
      }
    }
    return intent;
  }

  function threatened(body) {
    const opponent = opponentOf(body);
    return opponent.state === STATE.ATTACK && Math.abs(opponent.x - body.x) < THREAT_RANGE;
  }

  function applyIntent(body, intent) {
    const opponent = opponentOf(body);
    if (body.state === STATE.JUMP && intent.button && !body.move) { startMove(body, intent.button); return; }
    if (body.state === STATE.ATTACK && body.cancelable && grounded(body) && roundOver <= 0) {
      body.crouching = intent.down;
      if (intent.button) { startMove(body, intent.button); return; }
      if (intent.up && !intent.down) { body.move = null; startJump(body, intent.direction); return; }
    }
    if (!CONTROLLABLE.has(body.state) || body.stun > 0 || roundOver > 0) return;
    if (opponent.x !== body.x) body.facing = Math.sign(opponent.x - body.x);
    const backward = intent.direction !== 0 && intent.direction === -body.facing;
    body.crouching = intent.down;
    body.guarding = intent.autoGuard || backward;
    if (intent.button) { startMove(body, intent.button); return; }
    if (intent.up && !intent.down) { startJump(body, intent.direction); return; }
    const blocking = body.guarding && threatened(body);
    if (blocking) { if (body.state !== STATE.BLOCK) setState(body, STATE.BLOCK); body.vx = 0; return; }
    if (body.crouching) { if (body.state !== STATE.CROUCH) setState(body, STATE.CROUCH); body.vx = 0; return; }
    if (intent.direction) {
      if (body.state !== STATE.WALK) setState(body, STATE.WALK);
      body.walkDirection = intent.direction;
      body.vx = intent.direction * (backward ? BACK_SPEED : WALK_SPEED);
      return;
    }
    if (body.state !== STATE.IDLE) setState(body, STATE.IDLE);
    body.vx = 0;
  }

  function advanceState(body, dt) {
    body.stateTime += dt;
    body.stun = Math.max(0, body.stun - dt);
    const elapsed = body.stateTime;
    switch (body.state) {
      case STATE.PRE_JUMP:
        if (elapsed >= PRE_JUMP_TIME) {
          body.vy = JUMP_SPEED;
          body.vx = body.jumpDirection * JUMP_DRIFT;
          setState(body, STATE.JUMP);
          play('jump');
          dust(body.x, 6);
        }
        break;
      case STATE.ATTACK: {
        const frames = framesFor(body.move.animation);
        const index = Math.floor(elapsed * body.move.fps);
        const active = activeFrameIndex(body.move.animation);
        if (!body.moveResolved && index >= active) { body.moveResolved = true; resolveHit(body); }
        if (body.move.light && index > active) body.cancelable = true;
        if (index >= frames.length && body.move.stance !== STANCE.AIR) { body.move = null; setState(body, body.crouching ? STATE.CROUCH : STATE.IDLE); }
        break;
      }
      case STATE.BLOCK:
        if (body.stun <= 0 && !body.guarding) setState(body, body.crouching ? STATE.CROUCH : STATE.IDLE);
        break;
      case STATE.HURT:
        if (elapsed >= playLength(framesFor(body.crouching ? ANIMATION.CROUCH_HURT : ANIMATION.HURT), FPS.hurt)) setState(body, body.crouching ? STATE.CROUCH : STATE.IDLE);
        break;
      case STATE.KNOCKDOWN:
        if (elapsed >= playLength(framesFor(ANIMATION.KNOCKDOWN), FPS.knockdown) && grounded(body)) { setState(body, STATE.DOWN); dust(body.x, 12); play('land'); }
        break;
      case STATE.DOWN:
        if (elapsed >= DOWN_TIME) {
          const shiftX = sheet.animations[ANIMATION.GET_UP] ? sheet.animationShifts[ANIMATION.GET_UP] : 0;
          body.x = Math.min(viewWidth - EDGE_MARGIN, Math.max(EDGE_MARGIN, body.x + body.facing * shiftX));
          setState(body, STATE.GET_UP);
        }
        break;
      case STATE.GET_UP:
        if (elapsed >= playLength(framesFor(ANIMATION.GET_UP), FPS.getUp)) { body.crouching = false; setState(body, STATE.IDLE); }
        break;
      case STATE.LANDING:
        if (elapsed >= LANDING_TIME) setState(body, STATE.IDLE);
        break;
      default:
        break;
    }
  }

  function applyPhysics(body, dt) {
    if (body.y > 0 || body.vy !== 0) {
      body.vy -= GRAVITY * dt;
      body.y += body.vy * dt;
      if (body.y <= 0) {
        body.y = 0;
        body.vy = 0;
        body.vx = 0;
        dust(body.x, 10);
        play('land');
        if (body.state === STATE.JUMP || body.state === STATE.ATTACK) { body.move = null; setState(body, STATE.LANDING); }
      }
    }
    body.push -= body.push * Math.min(1, PUSH_DECAY * dt);
    body.x = Math.min(viewWidth - EDGE_MARGIN, Math.max(EDGE_MARGIN, body.x + (body.vx + body.push) * dt));

    if (body.state === STATE.WALK) {
      body.walkTime += dt;
      const frameIndex = Math.floor(body.walkTime * FPS.walk) % framesFor(ANIMATION.WALK).length;
      if (frameIndex !== body.lastStep && STEP_FRAMES.includes(frameIndex)) { dust(body.x - body.facing * 6, 2); play('step'); }
      body.lastStep = frameIndex;
    } else body.walkTime = 0;
  }

  function separate() {
    const gap = partner.x - player.x;
    if (Math.abs(gap) >= MIN_SPACING || !grounded(player) || !grounded(partner)) return;
    const overlap = (MIN_SPACING - Math.abs(gap)) / 2;
    const side = gap === 0 ? 1 : Math.sign(gap);
    player.x = Math.min(viewWidth - EDGE_MARGIN, Math.max(EDGE_MARGIN, player.x - side * overlap));
    partner.x = Math.min(viewWidth - EDGE_MARGIN, Math.max(EDGE_MARGIN, partner.x + side * overlap));
  }

  function regenerate(body, dt) {
    body.sinceHit += dt;
    if (body.isPartner && !isVersus() && body.sinceHit > REGEN_DELAY && body.state !== STATE.KO && roundOver <= 0) body.health = Math.min(MAX_HEALTH, body.health + REGEN_SPEED * dt);
    if (body.healthTrail > body.health) body.healthTrail = Math.max(body.health, body.healthTrail - HEALTH_TRAIL_SPEED * dt);
    else body.healthTrail = body.health;
    if (body.sinceHit > REGEN_DELAY) body.combo = 0;
  }

  function updateRound(dt) {
    if (roundOver <= 0) return;
    roundOver -= dt;
    for (const body of fighters) {
      const opponent = opponentOf(body);
      if (opponent.state === STATE.KO && body.state !== STATE.VICTORY && body.state !== STATE.KO && grounded(body) && ROUND_RESET_DELAY - roundOver > VICTORY_DELAY) {
        body.move = null;
        body.vx = 0;
        setState(body, STATE.VICTORY);
      }
    }
    if (roundOver <= 0) resetRound();
  }

  function testCommands(input) {
    if (input.wasPressed(...SYSTEM_KEYS.testHurt) && !INVULNERABLE.has(player.state)) { setState(player, STATE.HURT); player.move = null; player.push = -player.facing * 60; }
    if (input.wasPressed(...SYSTEM_KEYS.testKnockdown) && !INVULNERABLE.has(player.state)) { setState(player, STATE.KNOCKDOWN); player.move = null; player.push = -player.facing * 80; }
    if (input.wasPressed(...SYSTEM_KEYS.testVictory) && grounded(player)) { setState(player, STATE.VICTORY); player.move = null; player.vx = 0; roundOver = ROUND_RESET_DELAY; }
    if (input.wasPressed(...SYSTEM_KEYS.testKo) && player.state !== STATE.KO) { player.health = 0; setState(player, STATE.KO); player.move = null; player.vx = 0; roundOver = ROUND_RESET_DELAY; }
  }

  function poseFor(body) {
    const elapsed = body.stateTime;
    switch (body.state) {
      case STATE.WALK: {
        const frames = framesFor(ANIMATION.WALK);
        const index = Math.floor(body.walkTime * FPS.walk) % frames.length;
        return body.walkDirection === body.facing ? frames[index] : frames[frames.length - 1 - index];
      }
      case STATE.CROUCH: return loopFrame(framesFor(ANIMATION.CROUCH), elapsed, FPS.crouch);
      case STATE.PRE_JUMP: return framesFor(ANIMATION.JUMP)[JUMP_FRAME.prepare];
      case STATE.LANDING: return framesFor(ANIMATION.JUMP)[JUMP_FRAME.land] ?? framesFor(ANIMATION.JUMP)[0];
      case STATE.JUMP: {
        const frames = framesFor(ANIMATION.JUMP);
        if (body.vy > JUMP_SPEED * 0.55) return frames[JUMP_FRAME.rise] ?? frames[0];
        if (body.vy > -JUMP_SPEED * 0.45) {
          const tuck = JUMP_FRAME.tuck[Math.min(JUMP_FRAME.tuck.length - 1, Math.floor((JUMP_SPEED * 0.55 - body.vy) / JUMP_SPEED * JUMP_FRAME.tuck.length))];
          return frames[tuck] ?? frames[0];
        }
        return frames[JUMP_FRAME.fall] ?? frames[0];
      }
      case STATE.ATTACK: return holdFrame(framesFor(body.move.animation), elapsed, body.move.fps);
      case STATE.BLOCK: return holdFrame(framesFor(body.crouching ? ANIMATION.CROUCH_BLOCK : ANIMATION.BLOCK), elapsed, FPS.block);
      case STATE.HURT: return holdFrame(framesFor(body.crouching ? ANIMATION.CROUCH_HURT : ANIMATION.HURT), elapsed, FPS.hurt);
      case STATE.KNOCKDOWN: return holdFrame(framesFor(ANIMATION.KNOCKDOWN), elapsed, FPS.knockdown);
      case STATE.DOWN: { const frames = framesFor(ANIMATION.KNOCKDOWN); return frames[frames.length - 1]; }
      case STATE.GET_UP: return holdFrame(framesFor(ANIMATION.GET_UP), elapsed, FPS.getUp);
      case STATE.KO: return holdFrame(framesFor(ANIMATION.KO), elapsed, FPS.ko);
      case STATE.VICTORY: return holdFrame(framesFor(ANIMATION.VICTORY), elapsed, FPS.victory);
      default: return loopFrame(framesFor(ANIMATION.IDLE), time, FPS.idle);
    }
  }

  function mergedIntent(input) {
    const first = keyboardIntent(input, PLAYER_ONE_KEYS);
    const second = keyboardIntent(input, PLAYER_TWO_KEYS);
    return {
      ...emptyIntent(),
      direction: Math.sign(first.direction + second.direction),
      up: first.up || second.up,
      down: first.down || second.down,
      button: first.button ?? second.button,
    };
  }

  function showNotice(key) {
    netNotice = key;
    netNoticeTime = NET_NOTICE_TIME;
  }

  function leaveOnline(noticeKey) {
    net?.close();
    net = null;
    role = ROLE.LOCAL;
    netStatus = null;
    roomCode = '';
    if (noticeKey) showNotice(noticeKey);
    partnerModeIndex = PARTNER_MODES.indexOf(PARTNER_MODE.VERSUS);
    resetMatch();
  }

  function handleNetStatus(status) {
    netStatus = status;
    if (status === NET_STATUS.CONNECTED) {
      if (role === ROLE.HOST) resetMatch();
      showNotice('netConnected');
    }
    if (status === NET_STATUS.FAILED) leaveOnline('netFailed');
    if (status === NET_STATUS.CLOSED) leaveOnline('netClosed');
  }

  function handleNetMessage(message) {
    if (role === ROLE.HOST && message.kind === 'input') {
      remoteIntent = { ...emptyIntent(), direction: Math.sign(message.direction), up: Boolean(message.up), down: Boolean(message.down) };
      if (message.button && Object.values(BUTTON).includes(message.button)) remoteButtons.push(message.button);
      remoteInputAge = 0;
    }
    if (role === ROLE.GUEST && message.kind === 'state') applySnapshot(message);
  }

  function startOnline(nextRole, code) {
    net?.close();
    role = nextRole;
    roomCode = code;
    linkCopied = false;
    remoteButtons.length = 0;
    remoteIntent = emptyIntent();
    net = createNetSession({ role: nextRole, code, onMessage: handleNetMessage, onStatus: handleNetStatus });
    if (nextRole === ROLE.HOST) navigator.clipboard?.writeText(buildJoinLink(code)).then(() => { linkCopied = true; }, () => { linkCopied = false; });
  }

  function snapshotOf(body) {
    return {
      x: body.x, y: body.y, vy: body.vy, facing: body.facing, state: body.state, stateTime: body.stateTime,
      walkTime: body.walkTime, walkDirection: body.walkDirection, crouching: body.crouching, moveKey: body.move?.key ?? null,
      health: body.health, healthTrail: body.healthTrail, roundsWon: body.roundsWon, combo: body.combo, sinceHit: body.sinceHit,
    };
  }

  function sendSnapshot() {
    net.send({
      kind: 'state',
      fighters: fighters.map(snapshotOf),
      roundOver,
      shake,
      matchWinner: matchWinner ? fighters.indexOf(matchWinner) : null,
      events: pendingEvents.splice(0),
    });
  }

  function applySnapshot(message) {
    message.fighters.forEach((data, index) => {
      const body = fighters[index];
      const { moveKey, ...fields } = data;
      Object.assign(body, fields);
      body.move = moveKey && MOVES[moveKey] ? { key: moveKey, ...MOVES[moveKey] } : null;
    });
    roundOver = message.roundOver;
    shake = Math.max(shake, message.shake);
    matchWinner = message.matchWinner === null ? null : fighters[message.matchWinner];
    for (const event of message.events) {
      if (event.type === 'sound' && sound[event.name]) sound[event.name]();
      if (event.type === 'dust') dust(event.x, event.amount);
      if (event.type === 'spark' && SPARK_SETS[event.setName]) spark(event.x, event.y, event.scale, event.setName);
    }
  }

  function remotePartnerIntent(dt) {
    remoteInputAge += dt;
    if (remoteInputAge > REMOTE_INPUT_TIMEOUT) remoteIntent = emptyIntent();
    return { ...remoteIntent, button: remoteButtons.shift() ?? null };
  }

  function updateCodeEntry(input) {
    if (input.wasPressed('Escape')) { typedCode = null; return; }
    if (input.wasPressed(...SYSTEM_KEYS.erase)) typedCode = typedCode.slice(0, -1);
    for (const [code, character] of Object.entries(CODE_KEYS)) {
      if (typedCode.length < CODE_LENGTH && input.wasPressed(code)) typedCode += character;
    }
    if (typedCode.length === CODE_LENGTH && input.wasPressed(...SYSTEM_KEYS.confirm)) {
      const code = typedCode;
      typedCode = null;
      startOnline(ROLE.GUEST, code);
    }
  }

  function netMessageLines() {
    if (typedCode !== null) return [t('netEnterCode').replace('{code}', typedCode.padEnd(CODE_LENGTH, '_')), t('netEnterConfirm')];
    if (role === ROLE.HOST && netStatus !== NET_STATUS.CONNECTED) return [t('netHostCode').replace('{code}', roomCode), t(linkCopied ? 'netLinkCopied' : 'netWaiting')];
    if (role === ROLE.GUEST && netStatus !== NET_STATUS.CONNECTED) return [t('netJoining').replace('{code}', roomCode)];
    if (netNoticeTime > 0 && netNotice) return [t(netNotice)];
    return [];
  }

  function drawHealthBar(ctx, body, x, barWidth, anchorRight) {
    const y = HEALTH_BAR_TOP;
    const fill = Math.round(barWidth * body.health / MAX_HEALTH);
    const trail = Math.round(barWidth * body.healthTrail / MAX_HEALTH);
    const blinking = body.health > 0 && body.health <= LOW_HEALTH && Math.floor(time * BLINK_RATE) % 2 === 0;
    const anchored = size => (anchorRight ? x + barWidth - size : x);
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(x - 2, y - 2, barWidth + 4, HEALTH_BAR_HEIGHT + 4);
    ctx.fillStyle = COLORS.goldDeep;
    ctx.fillRect(x - 1, y - 1, barWidth + 2, HEALTH_BAR_HEIGHT + 2);
    ctx.fillStyle = COLORS.barEmpty;
    ctx.fillRect(x, y, barWidth, HEALTH_BAR_HEIGHT);
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(anchored(trail), y, trail, HEALTH_BAR_HEIGHT);
    ctx.fillStyle = blinking ? COLORS.white : COLORS.gold;
    ctx.fillRect(anchored(fill), y, fill, HEALTH_BAR_HEIGHT);
    ctx.fillStyle = COLORS.barShine;
    ctx.fillRect(anchored(fill), y + 1, fill, 2);
    ctx.fillStyle = COLORS.barShade;
    ctx.fillRect(anchored(fill), y + HEALTH_BAR_HEIGHT - 2, fill, 2);
  }

  function drawRoundMarker(ctx, x, y, won) {
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(x - 1, y - 1, ROUND_MARKER_SIZE + 2, ROUND_MARKER_SIZE + 2);
    ctx.fillStyle = won ? COLORS.gold : COLORS.panel;
    ctx.fillRect(x, y, ROUND_MARKER_SIZE, ROUND_MARKER_SIZE);
  }

  function drawHud(ctx, width) {
    const barWidth = Math.min(HEALTH_BAR_MAX_WIDTH, Math.floor((width - HUD_MARGIN * 2 - KO_BADGE_WIDTH - 8) / 2));
    const centerX = Math.round(width / 2);
    const badgeX = centerX - KO_BADGE_WIDTH / 2;
    drawHealthBar(ctx, player, badgeX - 4 - barWidth, barWidth, false);
    drawHealthBar(ctx, partner, badgeX + KO_BADGE_WIDTH + 4, barWidth, true);
    const knockedOut = fighters.some(body => body.state === STATE.KO);
    const badgeLit = !knockedOut || Math.floor(time * BLINK_RATE) % 2 === 0;
    const badgeTop = HEALTH_BAR_TOP - (KO_BADGE_HEIGHT - HEALTH_BAR_HEIGHT) / 2;
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(badgeX - 1, badgeTop - 1, KO_BADGE_WIDTH + 2, KO_BADGE_HEIGHT + 2);
    ctx.fillStyle = badgeLit ? COLORS.red : COLORS.panel;
    ctx.fillRect(badgeX, badgeTop, KO_BADGE_WIDTH, KO_BADGE_HEIGHT);
    text(ctx, t('koBadge'), centerX + 1, badgeTop + 4, { align: 'center', color: badgeLit ? COLORS.gold : COLORS.muted });
    const nameY = HEALTH_BAR_TOP + HEALTH_BAR_HEIGHT + 5;
    const leftX = badgeX - 4 - barWidth;
    const rightX = badgeX + KO_BADGE_WIDTH + 4 + barWidth;
    text(ctx, t(player.nameKey), leftX, nameY, { color: COLORS.white });
    text(ctx, t(partner.nameKey), rightX, nameY, { align: 'right', color: COLORS.white });
    const labelOf = body => {
      if (isOnline()) return t(body === localBody() ? 'netYou' : 'netOpponent');
      return t(body === player ? player.labelKey : PARTNER_MODE_KEYS[PARTNER_MODES[partnerModeIndex]]);
    };
    text(ctx, labelOf(player), leftX, nameY + 11, { color: COLORS.cyan });
    text(ctx, labelOf(partner), rightX, nameY + 11, { align: 'right', color: COLORS.cyan });
    if (isVersus()) {
      for (let round = 0; round < ROUNDS_TO_WIN; round++) {
        drawRoundMarker(ctx, badgeX - 4 - (round + 1) * (ROUND_MARKER_SIZE + 3), nameY + 12, player.roundsWon > round);
        drawRoundMarker(ctx, badgeX + KO_BADGE_WIDTH + 7 + round * (ROUND_MARKER_SIZE + 3), nameY + 12, partner.roundsWon > round);
      }
    } else text(ctx, t('training'), centerX, nameY + 11, { align: 'center', color: COLORS.gold });
    return { left: badgeX - 4 - barWidth, right: badgeX + KO_BADGE_WIDTH + 4 + barWidth, comboY: nameY + 24 };
  }

  function drawHints(ctx, width, height) {
    const hints = showHints
      ? ['controlsPlayerOne', 'controlsPlayerTwo', 'controlsBlock', 'controlsSweep', 'controlsPartner', 'controlsTests', 'controlsOnline', 'controlsHints', 'backHint'].map(t)
      : [t('controlsHints'), t('controlsOnline'), t('backHint')];
    const rows = [[]];
    let rowWidth = 0;
    for (const hint of hints) {
      const hintWidth = measure(ctx, hint) + HINT_GAP;
      if (rowWidth + hintWidth > width - 24 && rows[rows.length - 1].length) { rows.push([]); rowWidth = 0; }
      rows[rows.length - 1].push(hint);
      rowWidth += hintWidth;
    }
    hintRowCount = rows.length;
    rows.forEach((row, rowIndex) => {
      let x = 12;
      const y = height - HINT_BOTTOM - (rows.length - 1 - rowIndex) * HINT_LINE;
      for (const hint of row) {
        text(ctx, hint, x, y, { color: COLORS.muted });
        x += measure(ctx, hint) + HINT_GAP;
      }
    });
  }

  return {
    update(dt, input, view) {
      time += dt;
      netNoticeTime = Math.max(0, netNoticeTime - dt);
      screenFloorY = view.height - Math.max(FLOOR_MARGIN, HINT_BOTTOM + hintRowCount * HINT_LINE + 6);
      if (player.x === null) {
        resetRound();
        const joinCode = readJoinCode();
        if (joinCode) {
          window.history.replaceState(null, '', window.location.pathname);
          startOnline(ROLE.GUEST, joinCode);
        }
      }
      if (typedCode !== null) updateCodeEntry(input);
      else {
        if (input.wasPressed('Escape')) { net?.close(); onBack(); return; }
        if (input.wasPressed(...SYSTEM_KEYS.toggleHints)) showHints = !showHints;
        if (input.wasPressed(...SYSTEM_KEYS.host) && !isOnline()) startOnline(ROLE.HOST, createRoomCode());
        else if (input.wasPressed(...SYSTEM_KEYS.join) && !isOnline()) typedCode = '';
        else if (input.wasPressed(...SYSTEM_KEYS.partnerMode)) {
          if (isOnline()) leaveOnline(null);
          else { partnerModeIndex = (partnerModeIndex + 1) % PARTNER_MODES.length; partnerCooldown = PARTNER_ATTACK_INTERVAL; resetMatch(); play('cursor'); }
        }
        if (!isOnline()) testCommands(input);
      }

      if (role === ROLE.GUEST) {
        const intent = typedCode === null ? mergedIntent(input) : emptyIntent();
        net?.send({ kind: 'input', direction: intent.direction, up: intent.up, down: intent.down, button: intent.button });
      } else {
        const online = role === ROLE.HOST && netStatus === NET_STATUS.CONNECTED;
        const playerCommand = typedCode !== null ? emptyIntent() : (isOnline() ? mergedIntent(input) : keyboardIntent(input, PLAYER_ONE_KEYS));
        const partnerCommand = online ? remotePartnerIntent(dt) : (isOnline() ? emptyIntent() : partnerIntent(input, dt));
        if (hitStop > 0) hitStop -= dt;
        else {
          applyIntent(player, playerCommand);
          applyIntent(partner, partnerCommand);
          for (const body of fighters) { advanceState(body, dt); applyPhysics(body, dt); }
          separate();
        }
        for (const body of fighters) regenerate(body, dt);
        updateRound(dt);
        if (online) sendSnapshot();
        else pendingEvents.length = 0;
      }

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
      verticalGradient(ctx, width, height, COLORS.skyTop, COLORS.skyBottom);
      for (const star of stars) {
        const twinkle = Math.sin(time * 2 + star.phase) > 0.6;
        ctx.fillStyle = star.bright || twinkle ? COLORS.star : COLORS.starDim;
        ctx.fillRect(Math.round(star.x * width), Math.round(star.y * height), 1, 1);
      }
      ctx.save();
      ctx.translate(offsetX, offsetY);

      const horizon = screenFloorY;
      ctx.fillStyle = COLORS.ground;
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

      ctx.translate(Math.round((width - ARENA_WIDTH) / 2), screenFloorY);
      const drawOrder = player.state === STATE.ATTACK ? [partner, player] : [player, partner];
      for (const body of drawOrder) shadowEllipse(ctx, body.x, floorY + 1, Math.max(8, 16 - body.y * 0.08), 2, Math.max(0.15, 0.45 - body.y * 0.004));
      for (const body of drawOrder) {
        if (body.isPartner) ctx.filter = PARTNER_FILTER;
        drawFrame(ctx, sheet, poseFor(body), body.x, floorY - body.y, { flip: body.facing < 0 });
        ctx.filter = 'none';
      }

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

      const hud = drawHud(ctx, width);
      for (const body of fighters) {
        if (body.combo < 2 || body.sinceHit > REGEN_DELAY) continue;
        const comboText = t('comboHits').replace('{count}', String(body.combo));
        text(ctx, comboText, body === partner ? hud.left : hud.right, hud.comboY, { align: body === partner ? 'left' : 'right', color: COLORS.gold });
      }
      if (fighters.some(body => body.state === STATE.KO)) text(ctx, t('knockout'), Math.round(width / 2), Math.round(height * 0.32), { align: 'center', size: 16, color: COLORS.red });
      netMessageLines().forEach((line, index) => text(ctx, line, Math.round(width / 2), Math.round(height * 0.32) + 44 + index * 12, { align: 'center', color: COLORS.cyan }));
      if (matchWinner) text(ctx, t(matchWinner === player ? 'playerOneWins' : 'playerTwoWins'), Math.round(width / 2), Math.round(height * 0.32) + 24, { align: 'center', color: COLORS.gold });
      drawHints(ctx, width, height);
    },
  };
}
