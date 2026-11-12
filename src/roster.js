export const ROSTER_SLOTS = 12;
export const STAT_MAX = 5;

export const CHARACTERS = [
  {
    id: 'designer',
    nameKey: 'designerName',
    roleKey: 'designerRole',
    bioKey: 'designerBio',
    moveKeys: ['designerMove1', 'designerMove2', 'designerMove3'],
    accent: '#7fb4ff',
    stats: { power: 3, speed: 4, stamina: 3 },
    portrait: 'assets/designer/portrait.png',
    thumb: 'assets/designer/thumb.png',
    sheet: 'assets/designer/sheet.png',
    sheetData: 'assets/designer/sheet.json',
  },
];

export const ANIMATION_KEYS = { 'Right Punch': 'punch', 'High Kick': 'kick', Walking: 'walk', 'Taking Punch': 'hurt' };
