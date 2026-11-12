"""Cut a generated fighter out of its flat background, turn it into real pixels and animate it in code.

Usage: tools/.venv/Scripts/python tools/animate_sprite.py source/chatgpt.webp
Writes assets/fighter_idle.png and tests/fighter_demo.gif.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PANEL_LEFT = 792
PANEL_MARGIN = 14
GRID = 10
PALETTE_SIZE = 56
BACKGROUND_TOLERANCE = 38
ENCLOSED_TOLERANCE = 18
FRINGE_PASSES = 3
SCALE = 4
STAGE = (31, 35, 51, 255)
FLOOR = (12, 13, 20, 255)
FRAME_SIZE = (96, 124)


def cut_background(image):
    pixels = np.asarray(image, dtype=np.float32)
    height, width, _ = pixels.shape
    corners = np.array([pixels[5, 5], pixels[5, -6], pixels[-6, 5], pixels[-6, -6]])
    background = np.median(corners, axis=0)
    similar = np.linalg.norm(pixels - background, axis=2) < BACKGROUND_TOLERANCE
    mask = np.zeros((height, width), dtype=bool)
    stack = [(y, x) for y in range(height) for x in (0, width - 1)] + [(y, x) for x in range(width) for y in (0, height - 1)]
    while stack:
        y, x = stack.pop()
        if y < 0 or y >= height or x < 0 or x >= width or mask[y, x] or not similar[y, x]:
            continue
        mask[y, x] = True
        stack.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    enclosed = np.linalg.norm(pixels - background, axis=2) < ENCLOSED_TOLERANCE
    return ~(mask | enclosed)


def grid_phase(pixels):
    best, best_score = (0, 0), float('inf')
    sample = pixels[:GRID * 40, :GRID * 40]
    for oy in range(GRID):
        for ox in range(GRID):
            block = sample[oy:oy + GRID * 30, ox:ox + GRID * 30]
            h, w = block.shape[0] // GRID, block.shape[1] // GRID
            cells = block[:h * GRID, :w * GRID].reshape(h, GRID, w, GRID, 3)
            score = cells.var(axis=(1, 3)).mean()
            if score < best_score:
                best, best_score = (ox, oy), score
    return best


def to_pixels(image, foreground):
    pixels = np.asarray(image, dtype=np.float32)
    ox, oy = grid_phase(pixels)
    rows, cols = (pixels.shape[0] - oy) // GRID, (pixels.shape[1] - ox) // GRID
    cells = pixels[oy:oy + rows * GRID, ox:ox + cols * GRID].reshape(rows, GRID, cols, GRID, 3)
    inner = cells[:, 2:-2, :, 2:-2].reshape(rows, (GRID - 4), cols, (GRID - 4), 3)
    colors = np.median(inner.transpose(0, 2, 1, 3, 4).reshape(rows, cols, -1, 3), axis=2)
    coverage = foreground[oy:oy + rows * GRID, ox:ox + cols * GRID].reshape(rows, GRID, cols, GRID).mean(axis=(1, 3))
    small = Image.fromarray(colors.astype(np.uint8), 'RGB')
    quantized = np.asarray(small.quantize(colors=PALETTE_SIZE, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGBA')).copy()
    quantized[coverage < 0.5] = (0, 0, 0, 0)
    quantized = strip_fringe(quantized)
    sprite = Image.fromarray(quantized, 'RGBA')
    return sprite.crop(sprite.getbbox())


def is_background_blue(rgb):
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    return (b > 95) & (b > r + 55) & (b > g + 30) & (r < 90)


def strip_fringe(data):
    """Peel off background-blue pixels that touch transparency, left by the anti-aliasing of the original image."""
    for _ in range(FRINGE_PASSES):
        opaque = data[:, :, 3] > 0
        padded_opaque = np.pad(opaque, 1)
        touches_void = ~(padded_opaque[:-2, 1:-1] & padded_opaque[2:, 1:-1] & padded_opaque[1:-1, :-2] & padded_opaque[1:-1, 2:])
        fringe = opaque & touches_void & is_background_blue(data[:, :, :3])
        if not fringe.any():
            break
        data[fringe] = (0, 0, 0, 0)
    return data


def belt_row(sprite):
    data = np.asarray(sprite)
    dark = (data[:, :, 3] > 0) & (data[:, :, :3].sum(axis=2) < 120)
    middle = range(int(sprite.height * 0.42), int(sprite.height * 0.62))
    return max(middle, key=lambda y: dark[y].sum())


def pose(sprite, belt, breath=0, recoil=0, flash=0.0):
    """Upper body sinks with the breath while the legs stay planted; a hit pushes the fighter back and flashes it."""
    frame = Image.new('RGBA', FRAME_SIZE, (0, 0, 0, 0))
    x = (FRAME_SIZE[0] - sprite.width) // 2 - recoil
    y = FRAME_SIZE[1] - sprite.height - 4
    legs = sprite.crop((0, belt, sprite.width, sprite.height))
    upper = sprite.crop((0, 0, sprite.width, belt + 1))
    frame.paste(legs, (x + recoil // 2, y + belt), legs)
    frame.paste(upper, (x, y + breath), upper)
    if flash:
        data = np.asarray(frame).astype(np.float32)
        opaque = data[:, :, 3] > 0
        data[opaque, :3] = data[opaque, :3] * (1 - flash) + np.array([255, 255, 255]) * flash
        frame = Image.fromarray(data.astype(np.uint8), 'RGBA')
    return frame


def on_stage(frame, shake=0):
    card = Image.new('RGBA', FRAME_SIZE, STAGE)
    card.paste(Image.new('RGBA', (FRAME_SIZE[0] - 16, 2), FLOOR), (8, FRAME_SIZE[1] - 4))
    card.paste(frame, (shake, 0), frame)
    return card.resize((FRAME_SIZE[0] * SCALE, FRAME_SIZE[1] * SCALE), Image.NEAREST)


def main(path):
    image = Image.open(path).convert('RGB')
    panel = image.crop((PANEL_LEFT, PANEL_MARGIN, image.width - PANEL_MARGIN, image.height - PANEL_MARGIN))
    sprite = to_pixels(panel, cut_background(panel))
    belt = belt_row(sprite)
    (ROOT / 'assets').mkdir(exist_ok=True)
    (ROOT / 'tests').mkdir(exist_ok=True)
    sprite.save(ROOT / 'assets' / 'fighter_idle.png')

    idle = [pose(sprite, belt, breath) for breath in (0, 1, 2, 1)]
    hit = [pose(sprite, belt, 1, recoil=4, flash=0.8), pose(sprite, belt, 2, recoil=7, flash=0.35), pose(sprite, belt, 2, recoil=5), pose(sprite, belt, 1, recoil=2)]
    frames = [on_stage(f) for f in idle * 3] + [on_stage(hit[0], 2), on_stage(hit[1], -2), on_stage(hit[2], 1), on_stage(hit[3])] + [on_stage(f) for f in idle * 2]
    durations = [220] * 12 + [60, 70, 90, 110] + [220] * 8
    frames[0].save(ROOT / 'tests' / 'fighter_demo.gif', save_all=True, append_images=frames[1:], duration=durations, loop=0, disposal=2)
    print('sprite', sprite.size, 'belt row', belt)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'source' / 'chatgpt.webp')
