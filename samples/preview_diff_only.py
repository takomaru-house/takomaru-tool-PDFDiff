# -*- coding: utf-8 -*-
"""新しい「差分のみモード」の見た目を Python で再現する。
mockup の pixelDiff と同じロジック:
  差分箇所 = After をそのまま等倍表示
  一致箇所 = After を白方向に 88% フェード
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
TTF = "/sessions/beautiful-adoring-curie/.local/lib/python3.10/site-packages/japanize_matplotlib/fonts/ipaexg.ttf"

PIXEL_THRESHOLD = 32
FADE = 0.88


def diff_only(before: Image.Image, after: Image.Image) -> Image.Image:
    w, h = before.size
    out = Image.new("RGB", (w, h), "white")
    pa = before.load(); pb = after.load(); po = out.load()
    for y in range(h):
        for x in range(w):
            ar, ag, ab = pa[x, y][:3]
            br, bg, bb = pb[x, y][:3]
            d = max(abs(ar - br), abs(ag - bg), abs(ab - bb))
            if d > PIXEL_THRESHOLD:
                po[x, y] = (br, bg, bb)
            else:
                po[x, y] = (
                    int(br + (255 - br) * FADE),
                    int(bg + (255 - bg) * FADE),
                    int(bb + (255 - bb) * FADE),
                )
    return out


def annotate(img: Image.Image, label: str) -> Image.Image:
    bg = Image.new("RGB", (img.width, img.height + 50), "#e9ecf3")
    bg.paste(img, (0, 50))
    d = ImageDraw.Draw(bg)
    font = ImageFont.truetype(TTF, 18)
    d.text((10, 14), label, fill="#1a2233", font=font)
    return bg


def main():
    for s in ["table", "floorplan"]:
        before = Image.open(os.path.join(ROOT, f"_tmp_{s}_b-1.png")).convert("RGB")
        after  = Image.open(os.path.join(ROOT, f"_tmp_{s}_a-1.png")).convert("RGB")
        # サイズ揃え
        w = max(before.width, after.width)
        h = max(before.height, after.height)
        bf = Image.new("RGB", (w, h), "white"); bf.paste(before, (0, 0))
        af = Image.new("RGB", (w, h), "white"); af.paste(after, (0, 0))
        result = diff_only(bf, af)
        # 表示用に縮小
        scale = 1200 / w
        nw, nh = int(w * scale), int(h * scale)
        result_small = result.resize((nw, nh), Image.LANCZOS)
        out = annotate(result_small, f"差分のみモード (新仕様) — {s}: 一致箇所は薄く、差分箇所は等倍で表示")
        out.save(os.path.join(ROOT, f"preview_mode_diff_{s}.png"))
        print("OK", s)


if __name__ == "__main__":
    main()
