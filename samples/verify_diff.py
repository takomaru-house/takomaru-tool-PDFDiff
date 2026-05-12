# -*- coding: utf-8 -*-
"""mockup.html の差分アルゴリズムを Python で再現し、サンプルPDFの差分を可視化する。
- 2つのPDFを同サイズに揃えてレンダリング
- ピクセル差分 → グリッド連結成分 → bbox抽出
- bbox を After 画像にオーバーレイした PNG を生成
"""
import os, subprocess, json
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
TTF = "/sessions/beautiful-adoring-curie/.local/lib/python3.10/site-packages/japanize_matplotlib/fonts/ipaexg.ttf"

PIXEL_THRESHOLD = 32
CELL = 6
MIN_REGION_PX = 24
PADDING = 4
RENDER_DPI = 144  # mockup の RENDER_SCALE=2.0 相当 (72*2)


def render_pdf(pdf_path: str, out_prefix: str):
    """PDFをPNGに変換し最初のページのパスを返す。"""
    subprocess.run(
        ["pdftoppm", "-r", str(RENDER_DPI), pdf_path, out_prefix, "-png"],
        check=True, cwd=ROOT,
    )
    # 最初のページ
    return os.path.join(ROOT, out_prefix + "-1.png")


def pad_to_size(img: Image.Image, w: int, h: int) -> Image.Image:
    out = Image.new("RGB", (w, h), "white")
    out.paste(img, (0, 0))
    return out


def pixel_diff(a: Image.Image, b: Image.Image):
    w, h = a.size
    pa = a.load(); pb = b.load()
    mask = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            ar, ag, ab = pa[x, y][:3]
            br, bg, bb = pb[x, y][:3]
            d = max(abs(ar - br), abs(ag - bg), abs(ab - bb))
            if d > PIXEL_THRESHOLD:
                mask[y * w + x] = 1
    return mask


def cluster_regions(mask: bytearray, w: int, h: int):
    gw, gh = (w + CELL - 1) // CELL, (h + CELL - 1) // CELL
    cell = bytearray(gw * gh)
    for y in range(h):
        row = y * w
        for x in range(w):
            if mask[row + x]:
                cell[(y // CELL) * gw + (x // CELL)] = 1

    visited = bytearray(gw * gh)
    regions = []
    for i in range(gw * gh):
        if not cell[i] or visited[i]:
            continue
        queue = [i]
        visited[i] = 1
        head = 0
        min_x = min_y = 10**9
        max_x = max_y = -1
        count = 0
        while head < len(queue):
            idx = queue[head]; head += 1
            gx = idx % gw; gy = idx // gw
            count += 1
            if gx < min_x: min_x = gx
            if gx > max_x: max_x = gx
            if gy < min_y: min_y = gy
            if gy > max_y: max_y = gy
            for n in (idx - 1, idx + 1, idx - gw, idx + gw):
                if n < 0 or n >= gw * gh: continue
                if gx == 0 and n == idx - 1: continue
                if gx == gw - 1 and n == idx + 1: continue
                if not cell[n] or visited[n]: continue
                visited[n] = 1
                queue.append(n)
        px = count * CELL * CELL
        if px < MIN_REGION_PX: continue
        x0 = max(0, min_x * CELL - PADDING)
        y0 = max(0, min_y * CELL - PADDING)
        x1 = min(w, (max_x + 1) * CELL + PADDING)
        y1 = min(h, (max_y + 1) * CELL + PADDING)
        regions.append([x0, y0, x1 - x0, y1 - y0, px])

    # 近接マージ (gap=12px)
    def nearby(a, b, gap=12):
        ax2 = a[0] + a[2]; ay2 = a[1] + a[3]
        bx2 = b[0] + b[2]; by2 = b[1] + b[3]
        return not (b[0] - ax2 > gap or a[0] - bx2 > gap or
                    b[1] - ay2 > gap or a[1] - by2 > gap)

    def union(a, b):
        x = min(a[0], b[0]); y = min(a[1], b[1])
        x2 = max(a[0] + a[2], b[0] + b[2]); y2 = max(a[1] + a[3], b[1] + b[3])
        return [x, y, x2 - x, y2 - y, a[4] + b[4]]

    changed = True
    arr = list(regions)
    while changed:
        changed = False
        for i in range(len(arr)):
            for j in range(i + 1, len(arr)):
                if nearby(arr[i], arr[j]):
                    arr[i] = union(arr[i], arr[j])
                    arr.pop(j)
                    changed = True
                    break
            if changed: break
    arr.sort(key=lambda r: -r[4])
    return arr


def annotate(after_img: Image.Image, regions, out_path: str, sample_name: str):
    canvas = after_img.copy().convert("RGBA")
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    try:
        font = ImageFont.truetype(TTF, 22)
    except Exception:
        font = ImageFont.load_default()

    for i, r in enumerate(regions, 1):
        x, y, w, h = r[:4]
        # 半透明の塗り
        d.rectangle([x, y, x + w, y + h], fill=(124, 58, 237, 60), outline=(124, 58, 237, 230), width=3)
        # 番号ラベル
        d.rectangle([x, y - 26, x + 36, y], fill=(124, 58, 237, 230))
        d.text((x + 6, y - 24), f"#{i}", fill="white", font=font)

    # ヘッダー
    header = Image.new("RGBA", (canvas.width, 50), (255, 255, 255, 240))
    hd = ImageDraw.Draw(header)
    try:
        hf = ImageFont.truetype(TTF, 18)
    except Exception:
        hf = font
    hd.text((12, 12), f"差分検出結果: {sample_name}  (検出 {len(regions)} 領域)",
            fill=(40, 40, 60), font=hf)

    out = Image.alpha_composite(canvas, overlay)
    out.paste(header, (0, 0), header)
    out.convert("RGB").save(out_path)


def run(sample: str):
    before_pdf = os.path.join(ROOT, f"{sample}_before.pdf")
    after_pdf  = os.path.join(ROOT, f"{sample}_after.pdf")
    before_png = render_pdf(before_pdf, f"_tmp_{sample}_b")
    after_png  = render_pdf(after_pdf,  f"_tmp_{sample}_a")
    a = Image.open(before_png).convert("RGB")
    b = Image.open(after_png).convert("RGB")
    w = max(a.width, b.width); h = max(a.height, b.height)
    a = pad_to_size(a, w, h); b = pad_to_size(b, w, h)
    mask = pixel_diff(a, b)
    regions = cluster_regions(mask, w, h)
    out_path = os.path.join(ROOT, f"diff_result_{sample}.png")
    annotate(b, regions, out_path, sample)
    summary = {
        "sample": sample,
        "image_size": [w, h],
        "regions_count": len(regions),
        "regions": [
            {"id": i, "bbox_px": [r[0]//2, r[1]//2, r[2]//2, r[3]//2],
             "diff_pixels": r[4]}
            for i, r in enumerate(regions, 1)
        ],
    }
    with open(os.path.join(ROOT, f"diff_result_{sample}.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"OK {sample}: {len(regions)} regions → {out_path}")


if __name__ == "__main__":
    run("table")
    run("floorplan")
