"""Build one lossless Spiderlings Webbing runtime texture atlas per color.

The fifty source PNGs are an explicit compatibility fallback and are never
rewritten.  This builder reads their alpha bounds, copies those RGBA pixels
without resampling, and records the original canvas offset in Pixi v7
spritesheet metadata.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image
import oxipng


MOD_ROOT = Path(__file__).resolve().parents[1]
ATLAS_ROOT = MOD_ROOT / "TextureAtlas"
ATLAS_SIZE = 4096
FRAME_GAP = 1
SOURCES = (
    "Models/SpiderlingsWebbingLv1/ArmWebbing.png",
    "Models/SpiderlingsWebbingLv1/MittenLeft.png",
    "Models/SpiderlingsWebbingLv1/MittenRight.png",
    "Models/SpiderlingsWebbingLv1/Belly.png",
    "Models/SpiderlingsWebbingLv1/Legs.png",
    "Models/SpiderlingsWebbingLv1/Ankles.png",
    "Models/SpiderlingsWebbingLv1/Foot.png",
    "Models/SpiderlingsWebbingLv1/Blindfold.png",
    "Models/SpiderlingsWebbingLv1/Stuffing.png",
    "Models/SpiderlingsWebbingLv1/Gag.png",
    "Models/SpiderlingsWebbingLv2/ArmWebbing.png",
    "Models/SpiderlingsWebbingLv2/Belly.png",
    "Models/SpiderlingsWebbingLv2/Legs.png",
    "Models/SpiderlingsWebbingLv2/Ankles.png",
    "Models/SpiderlingsWebbingLv2/Foot.png",
    "Models/SpiderlingsWebbingLv3/ArmWebbing.png",
    "Models/SpiderlingsWebbingLv3/Belly.png",
    "Models/SpiderlingsWebbingLv3/Legs.png",
    "Models/SpiderlingsWebbingLv3/Ankles.png",
    "Models/SpiderlingsWebbingLv3/Foot.png",
    "Models/SpiderlingsWebbingLv3/Blindfold.png",
    "Models/SpiderlingsWebbingLv3/Gag.png",
    "Models/SpiderlingsWebbingLv3/Hood.png",
    "Models/SpiderlingsWebbingCocoon/Cocoon.png",
    "Models/SpiderlingsWebbingCocoon/OuterWebs.png",
)


PINK_SOURCES = (
    "Models/SpiderlingsWebbingLv1Pink/ArmWebbing.png",
    "Models/SpiderlingsWebbingLv1Pink/MittenLeft.png",
    "Models/SpiderlingsWebbingLv1Pink/MittenRight.png",
    "Models/SpiderlingsWebbingLv1Pink/Belly.png",
    "Models/SpiderlingsWebbingLv1Pink/Legs.png",
    "Models/SpiderlingsWebbingLv1Pink/Ankles.png",
    "Models/SpiderlingsWebbingLv1Pink/Foot.png",
    "Models/SpiderlingsWebbingLv1Pink/Blindfold.png",
    "Models/SpiderlingsWebbingLv1Pink/Stuffing.png",
    "Models/SpiderlingsWebbingLv1Pink/Gag.png",
    "Models/SpiderlingsWebbingLv2Pink/ArmWebbing.png",
    "Models/SpiderlingsWebbingLv2Pink/Belly.png",
    "Models/SpiderlingsWebbingLv2Pink/Legs.png",
    "Models/SpiderlingsWebbingLv2Pink/Ankles.png",
    "Models/SpiderlingsWebbingLv2Pink/Foot.png",
    "Models/SpiderlingsWebbingLv3Pink/ArmWebbing.png",
    "Models/SpiderlingsWebbingLv3Pink/Belly.png",
    "Models/SpiderlingsWebbingLv3Pink/Legs.png",
    "Models/SpiderlingsWebbingLv3Pink/Ankles.png",
    "Models/SpiderlingsWebbingLv3Pink/Foot.png",
    "Models/SpiderlingsWebbingLv3Pink/Blindfold.png",
    "Models/SpiderlingsWebbingLv3Pink/Gag.png",
    "Models/SpiderlingsWebbingLv3Pink/Hood.png",
    "Models/SpiderlingsWebbingCocoonPink/Cocoon.png",
    "Models/SpiderlingsWebbingCocoonPink/OuterWebs.png",
)

def read_source(runtime_path: str) -> dict[str, object]:
    source_path = MOD_ROOT / runtime_path
    if not source_path.is_file():
        raise FileNotFoundError(f"Missing atlas source: {runtime_path}")

    with Image.open(source_path) as source:
        if source.mode != "RGBA":
            raise ValueError(f"Atlas source must already be RGBA: {runtime_path}")
        alpha_bounds = source.getchannel("A").getbbox()
        if alpha_bounds is None:
            raise ValueError(f"Atlas source has no non-transparent bounds: {runtime_path}")
        left, top, right, bottom = alpha_bounds
        crop = source.crop(alpha_bounds).copy()
        return {
            "runtime_path": runtime_path,
            "source_width": source.width,
            "source_height": source.height,
            "left": left,
            "top": top,
            "width": right - left,
            "height": bottom - top,
            "crop": crop,
        }


def pack(sources: list[dict[str, object]]) -> dict[str, tuple[int, int]]:
    # Best-short-side-fit packing reuses free space beside the full-height
    # Cocoon. Frames keep their orientation and a transparent one-pixel border.
    placements: dict[str, tuple[int, int]] = {}
    free_rectangles = [(0, 0, ATLAS_SIZE, ATLAS_SIZE)]

    for source in sorted(sources, key=lambda item: (-int(item["height"]), str(item["runtime_path"]))):
        packed_width = int(source["width"]) + FRAME_GAP * 2
        packed_height = int(source["height"]) + FRAME_GAP * 2
        if packed_width > ATLAS_SIZE or packed_height > ATLAS_SIZE:
            raise ValueError(f"Atlas frame exceeds {ATLAS_SIZE}: {source['runtime_path']}")
        candidates = [
            (min(width - packed_width, height - packed_height),
             max(width - packed_width, height - packed_height), y, x)
            for x, y, width, height in free_rectangles
            if packed_width <= width and packed_height <= height
        ]
        if not candidates:
            raise ValueError(f"Explicit Webbing sources do not fit one {ATLAS_SIZE} atlas page")
        _, _, frame_y, frame_x = min(candidates)
        placements[str(source["runtime_path"])] = (frame_x + FRAME_GAP, frame_y + FRAME_GAP)

        remaining = []
        for x, y, width, height in free_rectangles:
            if (frame_x >= x + width or frame_x + packed_width <= x
                    or frame_y >= y + height or frame_y + packed_height <= y):
                remaining.append((x, y, width, height))
                continue
            if frame_x > x:
                remaining.append((x, y, frame_x - x, height))
            if frame_x + packed_width < x + width:
                remaining.append((frame_x + packed_width, y, x + width - frame_x - packed_width, height))
            if frame_y > y:
                remaining.append((x, y, width, frame_y - y))
            if frame_y + packed_height < y + height:
                remaining.append((x, frame_y + packed_height, width, y + height - frame_y - packed_height))

        # Splitting every intersected free rectangle can produce duplicates or
        # contained regions. Keep only maximal regions for the next frame.
        unique = list(dict.fromkeys(remaining))
        free_rectangles = [
            rectangle for rectangle in unique
            if not any(
                rectangle != other
                and rectangle[0] >= other[0] and rectangle[1] >= other[1]
                and rectangle[0] + rectangle[2] <= other[0] + other[2]
                and rectangle[1] + rectangle[3] <= other[1] + other[3]
                for other in unique
            )
        ]

    return placements


def build_page(atlas_name: str, runtime_paths: tuple[str, ...]) -> None:
    sources = [read_source(runtime_path) for runtime_path in runtime_paths]
    placements = pack(sources)
    page = Image.new("RGBA", (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0, 0))
    frames: dict[str, object] = {}

    for source in sources:
        runtime_path = str(source["runtime_path"])
        frame_x, frame_y = placements[runtime_path]
        crop = source["crop"]
        assert isinstance(crop, Image.Image)
        page.paste(crop, (frame_x, frame_y))
        frames[runtime_path] = {
            "frame": {
                "x": frame_x,
                "y": frame_y,
                "w": int(source["width"]),
                "h": int(source["height"]),
            },
            "rotated": False,
            "trimmed": True,
            "spriteSourceSize": {
                "x": int(source["left"]),
                "y": int(source["top"]),
                "w": int(source["width"]),
                "h": int(source["height"]),
            },
            "sourceSize": {
                "w": int(source["source_width"]),
                "h": int(source["source_height"]),
            },
        }

    atlas = {
        "frames": frames,
        "meta": {
            "app": "Spiderlings lossless Webbing atlas builder",
            "version": "1.0",
            "image": f"{atlas_name}.png",
            "format": "RGBA8888",
            "size": {"w": ATLAS_SIZE, "h": ATLAS_SIZE},
            "scale": "1",
        },
    }

    ATLAS_ROOT.mkdir(parents=True, exist_ok=True)
    page.save(ATLAS_ROOT / f"{atlas_name}.png", format="PNG", compress_level=9, optimize=False)
    # Recompress only the derived page; preserve transparent RGB and metadata.
    oxipng.optimize(
        ATLAS_ROOT / f"{atlas_name}.png",
        level=2,
        optimize_alpha=False,
        strip=oxipng.StripChunks.none(),
    )
    (ATLAS_ROOT / f"{atlas_name}.json").write_text(
        json.dumps(atlas, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"Built {atlas_name}.json/.png with {len(frames)} explicit frames.")


def build() -> None:
    build_page("spiderlings-webbing-0", SOURCES)
    build_page("spiderlings-webbing-pink-0", PINK_SOURCES)


if __name__ == "__main__":
    build()
