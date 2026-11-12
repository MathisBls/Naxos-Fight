export const ROSTER_SLOTS = 12;
export const STAT_MAX = 5;

export const CHARACTERS = [
  {
    id: 'guillaume',
    nameKey: 'guillaumeName',
    roleKey: 'guillaumeRole',
    bioKey: 'guillaumeBio',
    moveKeys: ['guillaumeMove1', 'guillaumeMove2', 'guillaumeMove3'],
    accent: '#7fb4ff',
    stats: { power: 3, speed: 4, stamina: 3 },
    portrait: 'assets/guillaume/portrait.png',
    sheet: 'assets/guillaume/sheet.png',
    sheetData: 'assets/guillaume/sheet.json',
  },
];

export const ANIMATION = Object.freeze({
  IDLE: 'idle',
  WALK: 'walk',
  JUMP: 'jump',
  CROUCH: 'crouch',
  PUNCH: 'punch',
  UPPERCUT: 'uppercut',
  LIGHT_KICK: 'lightKick',
  KICK: 'kick',
  CROUCH_PUNCH: 'crouchPunch',
  SWEEP: 'sweep',
  JUMP_PUNCH: 'jumpPunch',
  JUMP_KICK: 'jumpKick',
  BLOCK: 'block',
  CROUCH_BLOCK: 'crouchBlock',
  HURT: 'hurt',
  CROUCH_HURT: 'crouchHurt',
  KNOCKDOWN: 'knockdown',
  GET_UP: 'getUp',
  VICTORY: 'victory',
  KO: 'ko',
});

export const ANIMATION_KEYS = {
  Idle: ANIMATION.IDLE,
  'Guard Walk': ANIMATION.WALK,
  Jump: ANIMATION.JUMP,
  Crouch: ANIMATION.CROUCH,
  'Right Punch': ANIMATION.PUNCH,
  Uppercut: ANIMATION.UPPERCUT,
  'Light Kick': ANIMATION.LIGHT_KICK,
  'High Kick': ANIMATION.KICK,
  'Crouch Punch': ANIMATION.CROUCH_PUNCH,
  Sweep: ANIMATION.SWEEP,
  'Jump Punch': ANIMATION.JUMP_PUNCH,
  'Jump Kick': ANIMATION.JUMP_KICK,
  Block: ANIMATION.BLOCK,
  'Crouch Block': ANIMATION.CROUCH_BLOCK,
  Hurt: ANIMATION.HURT,
  'Crouch Hurt': ANIMATION.CROUCH_HURT,
  Knockdown: ANIMATION.KNOCKDOWN,
  'Get Up': ANIMATION.GET_UP,
  Victory: ANIMATION.VICTORY,
  KO: ANIMATION.KO,
};
