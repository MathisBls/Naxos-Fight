export const FONT = '"Press Start 2P", monospace';
export const COLORS = {
  ink: '#07060f',
  white: '#f4f1ea',
  gold: '#ffd23f',
  goldDeep: '#b8860b',
  red: '#e2393f',
  cyan: '#7fd6ff',
  muted: '#8a86a8',
  panel: '#151230',
  panelLight: '#2c2760',
  locked: '#211d3d',
  slot: '#23306a',
  floor: '#5b4bb3',
  grid: '#2a1f5c',
  ground: '#0a0820',
  skyTop: '#0d0b22',
  skyBottom: '#030208',
  star: '#cfd3ff',
  starDim: '#4a4880',
  dust: '#6d6494',
  sparkHot: '#ffb347',
  barShine: 'rgba(255, 255, 255, 0.35)',
  barShade: 'rgba(0, 0, 0, 0.25)',
  barEmpty: '#2a0d14',
};

const DIACRITICS = /[̀-ͯ]/g;
const GLYPH_FALLBACKS = { '’': "'", '…': '...', 'Œ': 'OE', 'œ': 'oe' };

export function toArcadeText(value) {
  return String(value).normalize('NFD').replace(DIACRITICS, '').replace(/[’…Œœ]/g, glyph => GLYPH_FALLBACKS[glyph]);
}

export function text(ctx, raw, x, y, { size = 8, color = COLORS.white, align = 'left', shadow = COLORS.ink } = {}) {
  const value = toArcadeText(raw);
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const px = Math.round(x), py = Math.round(y);
  if (shadow) {
    ctx.fillStyle = shadow;
    ctx.fillText(value, px + 1, py + 1);
  }
  ctx.fillStyle = color;
  ctx.fillText(value, px, py);
}

export function wrapText(ctx, raw, maxWidth, size = 8) {
  ctx.font = `${size}px ${FONT}`;
  const lines = [];
  let line = '';
  for (const word of toArcadeText(raw).split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

export function panel(ctx, x, y, width, height, { fill = COLORS.panel, light = COLORS.panelLight } = {}) {
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(x - 1, y - 1, width + 2, height + 2);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = light;
  ctx.fillRect(x, y, width, 1);
  ctx.fillRect(x, y, 1, height);
}

export function measure(ctx, raw, size = 8) {
  ctx.font = `${size}px ${FONT}`;
  return ctx.measureText(toArcadeText(raw)).width;
}

export function frame(ctx, x, y, width, height, color, thickness = 2) {
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(x - thickness - 1, y - thickness - 1, width + (thickness + 1) * 2, height + (thickness + 1) * 2);
  ctx.fillStyle = color;
  ctx.fillRect(x - thickness, y - thickness, width + thickness * 2, height + thickness * 2);
}

export function segmentBar(ctx, x, y, value, max, color) {
  for (let i = 0; i < max; i++) {
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(x + i * 9, y, 8, 7);
    ctx.fillStyle = i < value ? color : COLORS.locked;
    ctx.fillRect(x + i * 9 + 1, y + 1, 6, 5);
  }
}

export function verticalGradient(ctx, width, height, top, bottom) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

export function shadowEllipse(ctx, x, y, radiusX, radiusY, alpha = 0.45) {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  for (let dy = -radiusY; dy <= radiusY; dy++) {
    const half = Math.round(radiusX * Math.sqrt(Math.max(0, 1 - (dy / (radiusY + 0.5)) ** 2)));
    ctx.fillRect(Math.round(x - half), Math.round(y + dy), half * 2, 1);
  }
}

export function stripes(ctx, width, height, color, spacing = 6) {
  ctx.fillStyle = color;
  for (let x = -height; x < width; x += spacing) {
    for (let y = 0; y < height; y += 2) ctx.fillRect(x + y, y, 1, 1);
  }
}
