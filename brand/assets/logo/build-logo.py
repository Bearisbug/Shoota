"""Rebuild the shoota logo SVGs from their construction sources.

Inputs: the castle path in symbol.svg (copied verbatim from leizhang's public/logo.svg, commit cc89c0c),
brand/fonts/Fredoka[wdth,wght].ttf, and HarfBuzz's hb-shape CLI for advances and kerning.
Run from the repository root inside a virtualenv that has fonttools:
    python brand/assets/logo/build-logo.py
"""
import re
import subprocess
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = Path(__file__).resolve().parent
FONT = HERE.parents[1] / "fonts" / "Fredoka[wdth,wght].ttf"

YELLOW, INK, CREAM = "#F2B53C", "#13100D", "#F4EFE4"  # brand.yellow, neutral.900, brand.cream in brand/tokens.json
WORD, WGHT, TRACK = "shoota", 600, 20  # Fredoka SemiBold, +0.02 em tracking (matched against the approved logo image)

CASTLE = re.search(r' d="([^"]+)"', (HERE / "symbol.svg").read_text()).group(1)
TILE_RX = 28            # 22% of the 128 tile, read off the approved app icon
CASTLE_SCALE = 0.78     # castle is 56% of the tile width in the approved app icon


def wordmark_path():
    font = TTFont(FONT)
    upm = font["head"].unitsPerEm
    shaped = subprocess.run(["hb-shape", f"--variations=wght={WGHT},wdth=100", str(FONT), WORD],
                            capture_output=True, text=True, check=True).stdout
    glyphs = re.findall(r"([\w.]+)=\d+\+(\d+)", shaped)
    gs = font.getGlyphSet(location={"wght": WGHT, "wdth": 100})
    pen, bounds = SVGPathPen(gs), BoundsPen(gs)
    x = 0
    for i, (name, adv) in enumerate(glyphs):
        # font units, y up -> SVG y down
        t = (1, 0, 0, -1, x, 0)
        gs[name].draw(TransformPen(pen, t))
        gs[name].draw(TransformPen(bounds, t))
        x += int(adv) + (TRACK if i < len(glyphs) - 1 else 0)
    o = BoundsPen(gs); gs["o"].draw(o)
    return pen.getCommands(), bounds.bounds, o.bounds[3], upm  # path, (xMin, yMin, xMax, yMax) in SVG space, x-height ink


def fmt(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def write(name, body, w, h):
    (HERE / name).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(w)} {fmt(h)}">{body}</svg>\n')


def main():
    d, (x0, y0, x1, y1), xh, _ = wordmark_path()
    ww, wh = x1 - x0, y1 - y0
    for color, name in ((CREAM, "wordmark-cream.svg"), (INK, "wordmark-ink.svg")):
        write(name, f'<path fill="{color}" transform="translate({fmt(-x0)} {fmt(-y0)})" d="{d}"/>', ww, wh)

    castle = f'<path fill="{INK}" transform="translate(64 64) scale({CASTLE_SCALE}) translate(-64 -65)" d="{CASTLE}"/>'
    tile = f'<rect width="128" height="128" rx="{TILE_RX}" fill="{YELLOW}"/>'
    write("app-icon.svg", tile + castle, 128, 128)

    # Lockup: wordmark ascender height = 56% of the tile, gap = 19% of the tile,
    # x-height band centred on the tile (all read off the approved lockup).
    s = 0.56 * 128 / wh
    gap = 0.19 * 128
    baseline = 64 + xh * s / 2
    word = lambda c: (f'<path fill="{c}" transform="translate({fmt(128 + gap - x0 * s)} {fmt(baseline)}) '
                      f'scale({round(s, 5)})" d="{d}"/>')
    lw = 128 + gap + ww * s
    for c, name in ((CREAM, "lockup-on-dark.svg"), (INK, "lockup-on-light.svg")):
        write(name, tile + castle + word(c), lw, 128)


if __name__ == "__main__":
    main()
