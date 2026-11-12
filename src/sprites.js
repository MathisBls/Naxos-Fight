import { ANIMATION_KEYS } from './roster.js';

const ALPHA_THRESHOLD = 10;

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Image introuvable : ${src}`));
    image.src = src;
  });
}

function measure(pixels, sheetWidth, sx, sy, width, height) {
  let top = height, bottom = -1, left = width, right = -1, reachRow = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[((sy + y) * sheetWidth + sx + x) * 4 + 3] <= ALPHA_THRESHOLD) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) { right = x; reachRow = y; }
    }
  }
  return { top, bottom, left, right, reachRow };
}

export async function loadSheet(imageSrc, dataSrc) {
  const [image, data] = await Promise.all([loadImage(imageSrc), fetch(dataSrc).then(response => response.json())]);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const { width, height } = data.spritesheet.cell_size;
  const makeFrame = (row, column) => {
    const sx = column * width, sy = row * height;
    return { sx, sy, width, height, ...measure(pixels, image.width, sx, sy, width, height) };
  };
  const rotations = {};
  const animations = {};
  const animationShifts = {};
  for (const row of data.spritesheet.rows) {
    if (row.type === 'rotations') row.directions.forEach((direction, column) => { rotations[direction] = makeFrame(row.row, column); });
    else {
      const key = ANIMATION_KEYS[row.animation] ?? row.animation.toLowerCase();
      animations[key] = Array.from({ length: row.frame_count }, (_, column) => makeFrame(row.row, column));
      animationShifts[key] = row.shift_x ?? 0;
    }
  }
  const reference = rotations.east ?? Object.values(rotations)[0];
  return { image, width, height, rotations, animations, animationShifts, baseline: reference.bottom + 1, bodyTop: reference.top };
}

export function drawBust(ctx, sheet, frame, x, y, size) {
  const centerX = Math.round((frame.left + frame.right) / 2);
  const sourceX = Math.max(0, centerX - Math.floor(size / 2));
  const sourceY = Math.max(0, frame.top - 1);
  ctx.drawImage(sheet.image, frame.sx + sourceX, frame.sy + sourceY, size, size, x, y, size, size);
}

export function drawFrame(ctx, sheet, frame, x, groundY, { flip = false, scaleY = 1, splitRow = null, upperOffset = 0 } = {}) {
  const { width, height } = sheet;
  const drawHeight = Math.round(height * scaleY);
  const top = Math.round(groundY - sheet.baseline * scaleY);
  const left = Math.round(x - width / 2);
  ctx.save();
  if (flip) { ctx.translate(left + width, 0); ctx.scale(-1, 1); }
  else ctx.translate(left, 0);
  if (splitRow !== null && scaleY === 1) {
    ctx.drawImage(sheet.image, frame.sx, frame.sy + splitRow, width, height - splitRow, 0, top + splitRow, width, height - splitRow);
    ctx.drawImage(sheet.image, frame.sx, frame.sy, width, splitRow + 1, 0, top + upperOffset, width, splitRow + 1);
  } else ctx.drawImage(sheet.image, frame.sx, frame.sy, width, height, 0, top, width, drawHeight);
  ctx.restore();
}
