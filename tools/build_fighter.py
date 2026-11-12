"""Turn a portrait photo into pixel-art fighter assets.

Usage: tools/.venv/Scripts/python tools/build_fighter.py source/photo.png
Writes assets/portrait.png, assets/head.png, assets/fighter_sheet.png and tests/preview.png, tests/fighter.gif.
"""
import colorsys
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
OUTLINE = (22, 18, 26, 255)
SEAM_DARKEN = 0.72
HEAD_WIDTH = 30
BACKGROUND_TOLERANCE = 52
HAIR_MAX_LUMINANCE = 72
PORTRAIT_WIDTH = 64
FRAME_SIZE = (72, 100)
GROUND_Y = 96
PREVIEW_SCALE = 4
LIGHT = np.array([-0.55, -0.6, 0.58])
LIGHT = LIGHT / np.linalg.norm(LIGHT)
KIT = {'shirt': '#a9c4e8', 'jeans': '#3b4f82', 'shoes': '#2c2428', 'belt': '#3a2a22'}


def hex_rgb(value):
    value = value.lstrip('#')
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def ramp(rgb, steps=(-0.3, -0.16, 0, 0.1, 0.19)):
    h, l, s = colorsys.rgb_to_hls(*(c / 255 for c in rgb))
    tones = []
    for i, shift in enumerate(steps):
        hue = (h + (0.025 if shift < 0 else -0.015) * abs(shift) * 3) % 1
        sat = min(1, s * (1.08 if shift < 0 else 0.92))
        r, g, b = colorsys.hls_to_rgb(hue, min(0.97, max(0.04, l + shift)), sat)
        tones.append((round(r * 255), round(g * 255), round(b * 255), 255))
    return tones


def background_mask(photo):
    """True where the pixel belongs to the flat studio background, flood-filled from the top and sides."""
    pixels = np.asarray(photo, dtype=np.float32)
    height, width, _ = pixels.shape
    row_bg = (pixels[:, :3].mean(axis=1) + pixels[:, -3:].mean(axis=1)) / 2
    distance = np.linalg.norm(pixels - row_bg[:, None, :], axis=2)
    saturation = pixels.max(axis=2) - pixels.min(axis=2)
    luminance = pixels.mean(axis=2)
    similar = (distance < BACKGROUND_TOLERANCE) & (saturation < 26) & (luminance > HAIR_MAX_LUMINANCE)
    mask = np.zeros((height, width), dtype=bool)
    stack = [(y, x) for y in range(height) for x in (0, width - 1)] + [(0, x) for x in range(width)]
    while stack:
        y, x = stack.pop()
        if y < 0 or y >= height or x < 0 or x >= width or mask[y, x] or not similar[y, x]:
            continue
        mask[y, x] = True
        stack.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    return mask


def shirt_top(photo, foreground):
    pixels = np.asarray(photo, dtype=np.int32)
    blue = (pixels[:, :, 2] > pixels[:, :, 0] + 18) & (pixels[:, :, 2] > 150) & foreground
    rows = np.where(blue.sum(axis=1) > photo.width * 0.08)[0]
    return int(rows[0]) if len(rows) else photo.height


def pixelize(image, alpha, width, colors):
    height = round(image.height * width / image.width)
    small = image.resize((width, height), Image.BOX)
    small_alpha = alpha.resize((width, height), Image.BOX)
    small = ImageEnhance.Contrast(small).enhance(1.12)
    small = ImageEnhance.Color(small).enhance(1.15)
    quantized = small.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    rgba = quantized.convert('RGBA')
    opaque = np.asarray(small_alpha) > 127
    data = np.asarray(rgba).copy()
    data[~opaque] = (0, 0, 0, 0)
    return Image.fromarray(data, 'RGBA')


def add_outline(image):
    data = np.asarray(image).copy()
    opaque = data[:, :, 3] > 0
    padded = np.pad(opaque, 1)
    neighbour = padded[:-2, 1:-1] | padded[2:, 1:-1] | padded[1:-1, :-2] | padded[1:-1, 2:]
    edge = neighbour & ~opaque
    data[edge] = OUTLINE
    return Image.fromarray(data, 'RGBA')


def padded(image, pad=1):
    canvas = Image.new('RGBA', (image.width + pad * 2, image.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(image, (pad, pad))
    return canvas


def skin_color(photo, foreground, top, bottom):
    pixels = np.asarray(photo, dtype=np.int32)[top:bottom]
    mask = foreground[top:bottom]
    r, g, b = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    skin = mask & (r > g + 12) & (g > b) & (r > 120)
    return tuple(int(np.median(c[skin])) for c in (r, g, b)) if skin.any() else (226, 178, 148)


class Painter:
    """Draws shaded volumes (capsules with a variable radius) into an indexed frame, 16-bit style."""

    def __init__(self, size):
        self.width, self.height = size
        self.color = np.zeros((self.height, self.width, 4), dtype=np.uint8)
        self.part = np.full((self.height, self.width), -1, dtype=np.int32)
        self.next_part = 0

    def tube(self, a, b, radius, tones, profile=None):
        part = self.next_part
        self.next_part += 1
        ax, ay = a
        bx, by = b
        r_max = max(radius) if isinstance(radius, (tuple, list)) else radius
        x0, x1 = int(min(ax, bx) - r_max - 1), int(max(ax, bx) + r_max + 2)
        y0, y1 = int(min(ay, by) - r_max - 1), int(max(ay, by) + r_max + 2)
        dx, dy = bx - ax, by - ay
        length2 = dx * dx + dy * dy or 1e-6
        for y in range(max(0, y0), min(self.height, y1)):
            for x in range(max(0, x0), min(self.width, x1)):
                px, py = x + 0.5, y + 0.5
                t = min(1, max(0, ((px - ax) * dx + (py - ay) * dy) / length2))
                r = radius[0] + (radius[1] - radius[0]) * t if isinstance(radius, (tuple, list)) else radius
                cx, cy = ax + dx * t, ay + dy * t
                ox, oy = px - cx, py - cy
                distance = math.hypot(ox, oy)
                if distance > r:
                    continue
                nx, ny = ox / r, oy / r
                nz = math.sqrt(max(0, 1 - nx * nx - ny * ny))
                light = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
                tone = 0 if light < 0.05 else 1 if light < 0.35 else 2 if light < 0.62 else 3 if light < 0.86 else 4
                color = tones[tone]
                if profile:
                    color = profile(t, color) or color
                self.color[y, x] = color
                self.part[y, x] = part
        return part

    def blit(self, image, x, y):
        part = self.next_part
        self.next_part += 1
        data = np.asarray(image)
        for j in range(image.height):
            for i in range(image.width):
                if data[j, i, 3] == 0:
                    continue
                tx, ty = x + i, y + j
                if 0 <= tx < self.width and 0 <= ty < self.height:
                    self.color[ty, tx] = data[j, i]
                    self.part[ty, tx] = part

    def finish(self):
        data = self.color.copy()
        part = self.part
        h, w = part.shape
        for y in range(h):
            for x in range(w):
                if part[y, x] < 0:
                    continue
                for ny, nx in ((y - 1, x), (y, x - 1)):
                    if 0 <= ny < h and 0 <= nx < w and part[ny, nx] >= 0 and part[ny, nx] < part[y, x]:
                        r, g, b, a = data[y, x]
                        data[y, x] = (int(r * SEAM_DARKEN), int(g * SEAM_DARKEN), int(b * SEAM_DARKEN), a)
                        break
        return add_outline(Image.fromarray(data, 'RGBA'))


POSES = {
    'guard': {'lift': 0, 'lean': 0, 'front_hand': (47, 33), 'front_elbow': (44, 46), 'back_hand': (39, 36), 'back_elbow': (33, 48), 'front_knee': (41, 77), 'back_knee': (25, 78)},
    'guard_low': {'lift': 1, 'lean': 0, 'front_hand': (47, 35), 'front_elbow': (44, 48), 'back_hand': (39, 38), 'back_elbow': (33, 50), 'front_knee': (42, 78), 'back_knee': (24, 79)},
    'punch': {'lift': 0, 'lean': 3, 'front_hand': (67, 36), 'front_elbow': (56, 37), 'back_hand': (40, 38), 'back_elbow': (34, 49), 'front_knee': (43, 76), 'back_knee': (23, 78)},
}


def draw_fighter(head, skin, pose_name):
    pose = POSES[pose_name]
    painter = Painter(FRAME_SIZE)
    lift, lean = pose['lift'], pose['lean']
    shirt, jeans, shoes, skin_ramp = ramp(hex_rgb(KIT['shirt'])), ramp(hex_rgb(KIT['jeans'])), ramp(hex_rgb(KIT['shoes'])), ramp(skin)
    hip = (33, 60 + lift)
    neck = (34 + lean, 33 + lift)
    back_shoulder = (29 + lean, 37 + lift)
    front_shoulder = (39 + lean, 37 + lift)

    def jeans_profile(t, color):
        return None

    painter.tube(back_shoulder, pose['back_elbow'], (5, 4.4), [tuple(int(c * 0.86) if i < 3 else c for i, c in enumerate(t)) for t in shirt])
    painter.tube(pose['back_elbow'], pose['back_hand'], (4.2, 3.6), [tuple(int(c * 0.86) if i < 3 else c for i, c in enumerate(t)) for t in shirt])
    painter.tube(pose['back_hand'], (pose['back_hand'][0] + 1, pose['back_hand'][1] - 1), 4.2, skin_ramp)
    painter.tube(hip, pose['back_knee'], (7, 6), [tuple(int(c * 0.85) if i < 3 else c for i, c in enumerate(t)) for t in jeans], jeans_profile)
    painter.tube(pose['back_knee'], (20, GROUND_Y - 4), (6, 5.2), [tuple(int(c * 0.85) if i < 3 else c for i, c in enumerate(t)) for t in jeans])
    painter.tube((19, GROUND_Y - 3), (14, GROUND_Y - 2), 3.6, shoes)
    painter.tube(hip, pose['front_knee'], (7.4, 6.2), jeans)
    painter.tube(pose['front_knee'], (46, GROUND_Y - 4), (6.2, 5.4), jeans)
    painter.tube((46, GROUND_Y - 3), (53, GROUND_Y - 2), 3.8, shoes)
    painter.tube((hip[0], hip[1] - 1), neck, (8, 9.5), shirt)
    head_x = neck[0] - head.width // 2
    head_y = neck[1] - head.height + 4
    painter.blit(head, head_x, head_y)
    painter.tube(front_shoulder, pose['front_elbow'], (5.4, 4.8), shirt)
    painter.tube(pose['front_elbow'], pose['front_hand'], (4.6, 3.9), shirt)
    painter.tube(pose['front_hand'], (pose['front_hand'][0] + 1.5, pose['front_hand'][1] - 0.5), 4.6, skin_ramp)
    return painter.finish()


def gradient_card(size, top=(141, 143, 150), bottom=(70, 72, 82)):
    card = Image.new('RGBA', size)
    draw = ImageDraw.Draw(card)
    for y in range(size[1]):
        k = y / max(1, size[1] - 1)
        draw.line([(0, y), (size[0], y)], fill=tuple(round(top[i] + (bottom[i] - top[i]) * k) for i in range(3)) + (255,))
    return card


def scale(image, factor):
    return image.resize((image.width * factor, image.height * factor), Image.NEAREST)


def main(photo_path):
    photo = Image.open(photo_path).convert('RGB')
    background = background_mask(photo)
    foreground = ~background
    alpha = Image.fromarray((foreground * 255).astype(np.uint8), 'L')
    ys, xs = np.where(foreground)
    top, left, right = int(ys.min()), int(xs.min()), int(xs.max())
    collar = shirt_top(photo, foreground)

    portrait = add_outline(padded(pixelize(photo, alpha, PORTRAIT_WIDTH, 28)))
    head_box = (left, top, right + 1, collar + 2)
    head = add_outline(padded(pixelize(photo.crop(head_box), alpha.crop(head_box), HEAD_WIDTH, 14)))
    skin = skin_color(photo, foreground, top + (collar - top) // 3, collar)

    frames = [draw_fighter(head, skin, name) for name in ('guard', 'guard_low', 'punch')]
    sheet = Image.new('RGBA', (FRAME_SIZE[0] * len(frames), FRAME_SIZE[1]), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.paste(frame, (i * FRAME_SIZE[0], 0), frame)

    (ROOT / 'assets').mkdir(exist_ok=True)
    (ROOT / 'tests').mkdir(exist_ok=True)
    portrait.save(ROOT / 'assets' / 'portrait.png')
    head.save(ROOT / 'assets' / 'head.png')
    sheet.save(ROOT / 'assets' / 'fighter_sheet.png')

    stage_color = (20, 22, 31, 255)
    card = gradient_card((portrait.width + 8, portrait.height + 8))
    card.paste(portrait, (4, 4), portrait)
    big_card = scale(card, PREVIEW_SCALE)
    frame_cards = []
    for frame in frames:
        bg = Image.new('RGBA', FRAME_SIZE, (31, 35, 51, 255))
        ImageDraw.Draw(bg).rectangle([(8, GROUND_Y), (FRAME_SIZE[0] - 8, GROUND_Y + 1)], fill=(12, 13, 20, 255))
        bg.paste(frame, (0, 0), frame)
        frame_cards.append(scale(bg, PREVIEW_SCALE))
    gap = 24
    width = big_card.width + gap * (len(frame_cards) + 2) + sum(f.width for f in frame_cards)
    height = max(big_card.height, frame_cards[0].height) + gap * 2
    preview = Image.new('RGBA', (width, height), stage_color)
    preview.paste(big_card, (gap, (height - big_card.height) // 2))
    x = gap * 2 + big_card.width
    for card_frame in frame_cards:
        preview.paste(card_frame, (x, (height - card_frame.height) // 2))
        x += card_frame.width + gap
    preview.save(ROOT / 'tests' / 'preview.png')

    gif_frames = [frame_cards[0], frame_cards[1], frame_cards[0], frame_cards[1], frame_cards[2], frame_cards[2], frame_cards[0]]
    gif_frames[0].save(ROOT / 'tests' / 'fighter.gif', save_all=True, append_images=gif_frames[1:], duration=[260, 260, 260, 260, 110, 220, 260], loop=0, disposal=2)
    print('portrait', portrait.size, 'head', head.size, 'skin', skin, 'collar row', collar)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'source' / 'photo.png')
