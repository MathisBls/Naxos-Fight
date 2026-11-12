"""Build a fighter sprite sheet from a PixelLab character export, with every frame re-anchored.

Usage: tools/.venv/Scripts/python tools/build_sheet.py <character_uuid> [fighter_id]
Downloads the character ZIP from the PixelLab MCP API, keeps the East animations listed in ANCHORS
and writes assets/<fighter_id>/sheet.png and sheet.json in the layout read by loadSheet (src/sprites.js).

PixelLab frames drift inside their canvas from one frame to the next. Each frame is moved so that
its anchor matches the East rotation: the feet stay on the baseline, and the torso (or the planted
back heel for attacks) stays on the same column, so the fighter no longer slides in place.
Falls keep their own travel; Get Up ends on the standing pose and its row carries shift_x, the
distance the body must move so that its first frame continues the last Knockdown frame.
"""
import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DIRECTION = 'east'
ROTATION_ORDER = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
ALPHA_THRESHOLD = 10
HEEL_ROWS = 4
HEEL_PERCENTILE = 3
BODY_MARGIN = 1
DOWNLOAD_URL = 'https://api.pixellab.ai/mcp/characters/{}/download'

TORSO = 'torso'
FEET = 'feet'
AIR = 'air'
JUMP = 'jump'
RIGID = 'rigid'
RIGID_END = 'rigidEnd'
START_TORSO = 'startTorso'
GROUND_TOLERANCE = 3

ANCHORS = {
    'Idle': TORSO,
    'Guard Walk': TORSO,
    'Jump': JUMP,
    'Crouch': TORSO,
    'Right Punch': FEET,
    'Uppercut': FEET,
    'Light Kick': FEET,
    'High Kick': FEET,
    'Crouch Punch': START_TORSO,
    'Sweep': START_TORSO,
    'Jump Punch': AIR,
    'Jump Kick': AIR,
    'Block': FEET,
    'Crouch Block': START_TORSO,
    'Hurt': FEET,
    'Crouch Hurt': START_TORSO,
    'Knockdown': RIGID,
    'Get Up': RIGID_END,
    'Victory': FEET,
    'KO': RIGID,
}
FOLLOWS = {'Get Up': 'Knockdown'}


def opaque_mask(image):
    return np.array(image)[:, :, 3] > ALPHA_THRESHOLD


def bounds(mask):
    rows = np.where(mask.any(axis=1))[0]
    columns = np.where(mask.any(axis=0))[0]
    return rows[0], rows[-1], columns[0], columns[-1]


def center_x(mask, first_row, last_row):
    columns = np.where(mask[first_row:last_row + 1])[1]
    return float(columns.mean()) if columns.size else float(mask.shape[1] / 2)


def back_heel_x(mask, bottom):
    columns = np.where(mask[bottom - HEEL_ROWS + 1:bottom + 1])[1]
    return float(np.percentile(columns, HEEL_PERCENTILE)) if columns.size else float(mask.shape[1] / 2)


def anchor_x(mask, mode):
    top, bottom, _, _ = bounds(mask)
    height = bottom - top + 1
    if mode == FEET:
        return back_heel_x(mask, bottom)
    return center_x(mask, top + height // 6, top + height // 2)


def body_component_mask(mask):
    labels = np.zeros(mask.shape, dtype=np.int32)
    sizes = [0]
    height, width = mask.shape
    for start_y, start_x in zip(*np.nonzero(mask)):
        if labels[start_y, start_x]:
            continue
        label = len(sizes)
        labels[start_y, start_x] = label
        stack, size = [(start_y, start_x)], 0
        while stack:
            y, x = stack.pop()
            size += 1
            for ny in range(max(0, y - 1), min(height, y + 2)):
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    if mask[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = label
                        stack.append((ny, nx))
        sizes.append(size)
    body = labels == int(np.argmax(sizes))
    top, bottom, left, right = bounds(body)
    near_body = np.zeros(mask.shape, dtype=bool)
    near_body[max(0, top - BODY_MARGIN):bottom + BODY_MARGIN + 1, max(0, left - BODY_MARGIN):right + BODY_MARGIN + 1] = True
    kept = {label for label in np.unique(labels[near_body & mask])}
    return np.isin(labels, list(kept)) & mask


def remove_strays(image):
    pixels = np.array(image)
    pixels[~body_component_mask(pixels[:, :, 3] > ALPHA_THRESHOLD)] = 0
    return Image.fromarray(pixels)


def shift(image, dx, dy):
    canvas = Image.new('RGBA', image.size, (0, 0, 0, 0))
    canvas.paste(image, (dx, dy))
    return canvas


def place_in_cell(image, cell_size):
    cell = Image.new('RGBA', (cell_size, cell_size), (0, 0, 0, 0))
    cell.paste(image, ((cell_size - image.width) // 2, (cell_size - image.height) // 2))
    return cell


def frame_offset(mask, mode, reference_mask):
    top, bottom, _, _ = bounds(mask)
    ref_top, ref_bottom, _, _ = bounds(reference_mask)
    dx = round(anchor_x(reference_mask, mode) - anchor_x(mask, mode))
    airborne = mode == AIR or (mode == JUMP and bottom < ref_bottom - GROUND_TOLERANCE)
    dy = ref_top - top if airborne else ref_bottom - bottom
    return dx, dy


def bbox_center_x(mask):
    _, _, left, right = bounds(mask)
    return (left + right) / 2


def anchor_frames(frames, mode, reference_mask):
    masks = [opaque_mask(frame) for frame in frames]
    if mode == RIGID_END:
        rigid_dx = round(anchor_x(reference_mask, TORSO) - anchor_x(masks[-1], TORSO))
    elif mode == START_TORSO:
        rigid_dx = round(anchor_x(reference_mask, TORSO) - anchor_x(masks[0], TORSO))
    else:
        rigid_dx = round(bbox_center_x(reference_mask) - bbox_center_x(masks[0]))
    _, ref_bottom, _, _ = bounds(reference_mask)
    anchored = []
    for frame, mask in zip(frames, masks):
        if mode in (RIGID, RIGID_END, START_TORSO):
            dx, dy = rigid_dx, ref_bottom - bounds(mask)[1]
        else:
            dx, dy = frame_offset(mask, mode, reference_mask)
        anchored.append(shift(frame, dx, dy))
    return anchored


def load_export(character_uuid):
    with urllib.request.urlopen(DOWNLOAD_URL.format(character_uuid)) as response:
        archive = zipfile.ZipFile(io.BytesIO(response.read()))
    metadata = json.loads(archive.read('metadata.json'))
    names = archive.namelist()
    state_dir = next(name.split('/')[0] for name in names if '/rotations/' in name)

    def read(path):
        return Image.open(io.BytesIO(archive.read(path))).convert('RGBA')

    rotations = {direction: read(f'{state_dir}/rotations/{direction}.png') for direction in ROTATION_ORDER}
    animations = {}
    for name in ANCHORS:
        prefix = f"{state_dir}/animations/{name.replace(' ', '_')}/{DIRECTION}/"
        paths = sorted(path for path in names if path.startswith(prefix) and path.endswith('.png'))
        if paths:
            animations[name] = [remove_strays(read(path)) for path in paths]
    cell_size = max(max(image.size) for frames in [list(rotations.values()), *animations.values()] for image in frames)
    rotations = {direction: place_in_cell(image, cell_size) for direction, image in rotations.items()}
    animations = {name: [place_in_cell(image, cell_size) for image in frames] for name, frames in animations.items()}
    return metadata, rotations, animations, cell_size


def build(character_uuid, fighter_id):
    metadata, rotations, animations, cell_size = load_export(character_uuid)
    reference_mask = opaque_mask(rotations[DIRECTION])
    rows = [{'row': 0, 'type': 'rotations', 'frame_count': len(ROTATION_ORDER), 'directions': ROTATION_ORDER}]
    strips = [[rotations[direction] for direction in ROTATION_ORDER]]
    anchored_by_name = {}
    for name, frames in animations.items():
        anchored = anchor_frames(frames, ANCHORS[name], reference_mask)
        anchored_by_name[name] = anchored
        strips.append(anchored)
        row = {'row': len(rows), 'type': 'animation', 'frame_count': len(frames), 'animation': name, 'direction': DIRECTION}
        previous = anchored_by_name.get(FOLLOWS.get(name))
        if previous:
            row['shift_x'] = round(bbox_center_x(opaque_mask(previous[-1])) - bbox_center_x(opaque_mask(anchored[0])))
        rows.append(row)

    columns = max(len(strip) for strip in strips)
    sheet = Image.new('RGBA', (columns * cell_size, len(strips) * cell_size), (0, 0, 0, 0))
    for row_index, strip in enumerate(strips):
        for column, frame in enumerate(strip):
            sheet.paste(frame, (column * cell_size, row_index * cell_size))

    out = ROOT / 'assets' / fighter_id
    out.mkdir(parents=True, exist_ok=True)
    sheet.save(out / 'sheet.png')
    data = {
        'character': {'id': character_uuid, 'size': metadata['states'][0]['character']['size']},
        'spritesheet': {
            'cell_size': {'width': cell_size, 'height': cell_size},
            'sheet_size': {'width': sheet.width, 'height': sheet.height},
            'columns': columns,
            'rows': rows,
        },
    }
    (out / 'sheet.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    missing = [name for name in ANCHORS if name not in animations]
    print(json.dumps({'animations': {name: len(frames) for name, frames in animations.items()}, 'missing': missing}))


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'guillaume')
