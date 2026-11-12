"""Build the in-game portrait and fighter sprite from the generated character sheet.

Usage: tools/.venv/Scripts/python tools/build_game_assets.py source/chatgpt.webp
Writes assets/guillaume/portrait.png, assets/guillaume/idle.png and prints the sprite metrics.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from animate_sprite import PANEL_LEFT, PANEL_MARGIN, belt_row, cut_background, to_pixels

ROOT = Path(__file__).resolve().parent.parent
PORTRAIT_PANEL_RIGHT = 760


def build(path, character_id='guillaume'):
    image = Image.open(path).convert('RGB')
    out = ROOT / 'assets' / character_id
    out.mkdir(parents=True, exist_ok=True)

    portrait_panel = image.crop((PANEL_MARGIN, PANEL_MARGIN, PORTRAIT_PANEL_RIGHT, image.height - PANEL_MARGIN))
    portrait = to_pixels(portrait_panel, np.ones((portrait_panel.height, portrait_panel.width), dtype=bool))
    portrait.save(out / 'portrait.png')

    fighter_panel = image.crop((PANEL_LEFT, PANEL_MARGIN, image.width - PANEL_MARGIN, image.height - PANEL_MARGIN))
    sprite = to_pixels(fighter_panel, cut_background(fighter_panel))
    sprite.save(out / 'idle.png')
    metrics = {'idle': {'width': sprite.width, 'height': sprite.height, 'belt': belt_row(sprite)}, 'portrait': list(portrait.size)}
    print(json.dumps(metrics))


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'source' / 'chatgpt.webp')
