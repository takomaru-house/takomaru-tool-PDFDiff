# -*- coding: utf-8 -*-
"""mockup.html の各表示モードを Python で模擬し、プレビュー画像を生成する。
- 並列モード: 縮小表示で画面に収まる例
- 重ね合わせモード: mix-blend-mode: multiply 相当を ImageChops.multiply で再現
"""
import os
from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
TTF = "/sessions/beautiful-adoring-curie/.local/lib/python3.10/site-packages/japanize_matplotlib/fonts/ipaexg.ttf"


def make_sbs(before: Image.Image, after: Image.Image, target_w: int) -> Image.Image:
    """並列モード: 全体を target_w 内に収まる縮小表示にする。"""
    gap = 16
    each_w = (target_w - gap) // 2
    scale = each_w / max(before.width, after.width)
    nw, nh = int(before.width * scale), int(before.height * scale)
    bf = before.resize((nw, nh), Image.LANCZOS)
    af = after.resize((nw, nh), Image.LANCZOS)
    bg = Image.new("RGB", (target_w, nh + 50), "#e9ecf3")
    bg.paste(bf, (0, 50))
    bg.paste(af, (each_w + gap, 50))
    d = ImageDraw.Draw(bg)
    font = ImageFont.truetype(TTF, 18)
    d.text((10, 14), "並列モード — 自動フィット縮小表示", fill="#1a2233", font=font)
    d.rectangle([0, 50, nw - 1, nh + 49], outline="#666", width=1)
    d.rectangle([each_w + gap, 50, each_w + gap + nw - 1, nh + 49], outline="#666", width=1)
    sf = ImageFont.truetype(TTF, 12)
    d.text((6, 56), "Before", fill="#444", font=sf)
    d.text((each_w + gap + 6, 56), "After", fill="#444", font=sf)
    return bg


def make_overlay(before: Image.Image, after: Image.Image, opacity: float, target_w: int) -> Image.Image:
    """重ね合わせモード: After を multiply blend で重ねる (CSS mix-blend-mode 相当)。"""
    scale = target_w / max(before.width, after.width)
    nw, nh = int(before.width * scale), int(before.height * scale)
    bf = before.resize((nw, nh), Image.LANCZOS).convert("RGB")
    af = after.resize((nw, nh), Image.LANCZOS).convert("RGB")
    # CSS multiply: result = (a * b) / 255
    blended = ImageChops.multiply(bf, af)
    # opacity を加味した最終合成: result_at_opacity = blended*opacity + bf*(1-opacity)
    out = Image.blend(bf, blended, opacity)
    bg = Image.new("RGB", (target_w, nh + 50), "#e9ecf3")
    bg.paste(out, (0, 50))
    d = ImageDraw.Draw(bg)
    font = ImageFont.truetype(TTF, 18)
    d.text((10, 14), f"重ね合わせモード — 透過率 {int(opacity * 100)}% (multiply blend)",
           fill="#1a2233", font=font)
    return bg


def main():
    samples = ["table", "floorplan"]
    target_w = 1200
    for s in samples:
        before = Image.open(os.path.join(ROOT, f"_tmp_{s}_b-1.png"))
        after = Image.open(os.path.join(ROOT, f"_tmp_{s}_a-1.png"))
        # 並列モードのプレビュー
        sbs = make_sbs(before, after, target_w)
        sbs.save(os.path.join(ROOT, f"preview_mode_sbs_{s}.png"))
        # 重ね合わせ (3段階)
        for op in (0.3, 0.5, 0.8):
            ov = make_overlay(before, after, op, target_w)
            ov.save(os.path.join(ROOT, f"preview_mode_overlay_{s}_{int(op*100)}.png"))
        print(f"OK {s}")


if __name__ == "__main__":
    main()
