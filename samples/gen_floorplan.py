# -*- coding: utf-8 -*-
"""間取り図サンプルPDF生成 (Before/After)。20ページ構成 (101〜120号室)、複数ページに差分を仕込む。"""
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

TTF_PATH = "/sessions/beautiful-adoring-curie/.local/lib/python3.10/site-packages/japanize_matplotlib/fonts/ipaexg.ttf"
pdfmetrics.registerFont(TTFont("IPAexG", TTF_PATH))
JP = "IPAexG"

PAGE_W, PAGE_H = landscape(A4)
ORIG_X, ORIG_Y = 60, 60
PLAN_W, PLAN_H = 720, 460
WALL_THICK = 3.0
INNER_THICK = 1.6
DOOR_GAP = 28


def header(c, title, version, unit_no):
    c.setFont(JP, 14)
    c.drawString(ORIG_X, PAGE_H - 30, f"{title}  {unit_no}号室")
    c.setFont(JP, 9)
    c.drawString(ORIG_X, PAGE_H - 46, version)
    c.setFont(JP, 8)
    c.drawRightString(PAGE_W - 30, PAGE_H - 30, "縮尺: 1/100  単位: mm")
    c.drawRightString(PAGE_W - 30, PAGE_H - 42, "作図: 設計室")


def outer_wall(c, x, y, w, h):
    c.setLineWidth(WALL_THICK)
    c.setStrokeColor(colors.black)
    c.rect(x, y, w, h, stroke=1, fill=0)


def inner_wall(c, x1, y1, x2, y2, gap=None):
    c.setLineWidth(INNER_THICK)
    c.setStrokeColor(colors.black)
    if gap is None:
        c.line(x1, y1, x2, y2); return
    g1, g2 = gap
    if x1 == x2:
        ys = sorted([y1, y2])
        c.line(x1, ys[0], x1, g1)
        c.line(x1, g2, x1, ys[1])
    else:
        xs = sorted([x1, x2])
        c.line(xs[0], y1, g1, y1)
        c.line(g2, y1, xs[1], y1)


def door_arc(c, hx, hy, r, start, extent):
    c.setLineWidth(0.6); c.setDash(2, 2)
    c.arc(hx - r, hy - r, hx + r, hy + r, startAng=start, extent=extent)
    c.setDash()


def window_marks(c, x1, y1, x2, y2):
    c.setLineWidth(0.7)
    if x1 == x2:
        c.line(x1 - 2, y1, x1 - 2, y2); c.line(x1 + 2, y1, x1 + 2, y2)
    else:
        c.line(x1, y1 - 2, x2, y1 - 2); c.line(x1, y1 + 2, x2, y1 + 2)


def label(c, x, y, text, size=10):
    c.setFont(JP, size); c.drawCentredString(x, y, text)


def dim_h(c, x1, x2, y, text):
    c.setLineWidth(0.4); c.setStrokeColor(colors.HexColor("#444"))
    c.line(x1, y, x2, y); c.line(x1, y - 4, x1, y + 4); c.line(x2, y - 4, x2, y + 4)
    c.setFillColor(colors.HexColor("#444")); c.setFont(JP, 7)
    c.drawCentredString((x1 + x2) / 2, y + 3, text)
    c.setFillColor(colors.black); c.setStrokeColor(colors.black)


def dim_v(c, y1, y2, x, text):
    c.setLineWidth(0.4); c.setStrokeColor(colors.HexColor("#444"))
    c.line(x, y1, x, y2); c.line(x - 4, y1, x + 4, y1); c.line(x - 4, y2, x + 4, y2)
    c.setFillColor(colors.HexColor("#444")); c.setFont(JP, 7)
    c.saveState(); c.translate(x - 3, (y1 + y2) / 2); c.rotate(90)
    c.drawCentredString(0, 0, text); c.restoreState()
    c.setFillColor(colors.black); c.setStrokeColor(colors.black)


def draw_plan(c, version, unit_no, layout_type, mods):
    """layout_type: '1LDK' or '2LDK', mods: dict of variations."""
    header(c, "サンプル住宅 平面図", version, unit_no)
    x0, y0 = ORIG_X, ORIG_Y
    W, H = PLAN_W, PLAN_H
    outer_wall(c, x0, y0, W, H)

    # 共通の中央仕切り
    midx = x0 + W * 0.55
    if mods.get("move_wall"): midx += 30
    midy = y0 + H * 0.5

    inner_wall(c, midx, y0, midx, y0 + H, gap=(midy - 60, midy - 60 + DOOR_GAP))
    inner_wall(c, x0, midy, midx, midy, gap=(x0 + 130, x0 + 130 + DOOR_GAP))

    if layout_type == "2LDK" or mods.get("split_room"):
        split_y = y0 + H * 0.55
        inner_wall(c, midx, split_y, x0 + W, split_y,
                   gap=(x0 + W - 80, x0 + W - 80 + DOOR_GAP))

    # 玄関開口
    entry_x = x0 + W * 0.30
    c.setFillColor(colors.white); c.setStrokeColor(colors.white)
    c.rect(entry_x, y0 - 2, 36, 6, stroke=0, fill=1)
    c.setStrokeColor(colors.black); c.setFillColor(colors.black)
    door_arc(c, entry_x, y0, 26, 0, 90)
    c.setLineWidth(INNER_THICK)
    c.line(entry_x, y0, entry_x + 26, y0)

    # 窓
    window_marks(c, x0 + 60, y0 + H, x0 + 160, y0 + H)
    window_marks(c, x0 + W - 180, y0 + H, x0 + W - 60, y0 + H)
    window_marks(c, x0 + 30, y0, x0 + 110, y0)

    # 部屋ラベル
    ldk_size = mods.get("ldk_size", "16帖" if layout_type == "1LDK" else "14帖")
    if mods.get("rename_ldk"): ldk_size = "18帖"
    ldk_cx = (x0 + midx) / 2
    ldk_cy = (midy + y0 + H) / 2
    label(c, ldk_cx, ldk_cy + 10, f"LDK {ldk_size}", 12)
    label(c, ldk_cx, ldk_cy - 8, "(リビング・ダイニング・キッチン)", 8)

    if layout_type == "2LDK" or mods.get("split_room"):
        split_y = y0 + H * 0.55
        bedroom_size = mods.get("bedroom_size", "6帖")
        label(c, (midx + x0 + W) / 2, (split_y + y0 + H) / 2 + 5, f"寝室1 {bedroom_size}", 11)
        label(c, (midx + x0 + W) / 2, (y0 + split_y) / 2 + 5,
              "クロゼット" if mods.get("split_room") else "寝室2 5帖", 10)
    else:
        label(c, (midx + x0 + W) / 2, (midy + y0 + H) / 2, "寝室 8帖", 12)

    # 和室/洋室
    wa_label = "洋室 6帖" if mods.get("rename_wa") else "和室 6帖"
    label(c, x0 + (midx - x0) / 2, (y0 + midy) / 2 + 5, wa_label, 12)

    label(c, x0 + W * 0.42, y0 + 30, "玄関ホール", 9)
    bath_x = midx + 35; bath_y = y0 + H * 0.18
    label(c, bath_x, bath_y, "浴室", 10)
    label(c, bath_x + 70, bath_y, "洗面", 10)

    # 寸法線
    dim_h(c, x0, x0 + W, y0 - 18, "10,800")
    dim_v(c, y0, y0 + H, x0 - 20, "7,200" if mods.get("change_dim") else "6,800")
    dim_h(c, x0, midx, y0 + H + 14, "6,240" if mods.get("move_wall") else "5,940")
    dim_h(c, midx, x0 + W, y0 + H + 14, "4,560" if mods.get("move_wall") else "4,860")

    # 方位記号
    c.setFont(JP, 8); c.drawString(x0 + W - 28, y0 + H - 18, "N")
    c.setLineWidth(0.6)
    c.line(x0 + W - 24, y0 + H - 30, x0 + W - 24, y0 + H - 18)
    c.line(x0 + W - 24, y0 + H - 30, x0 + W - 28, y0 + H - 25)
    c.line(x0 + W - 24, y0 + H - 30, x0 + W - 20, y0 + H - 25)


def build(path, version_label, after=False):
    c = canvas.Canvas(path, pagesize=landscape(A4))
    # 20号室分。奇数階=1LDK、偶数階=2LDKと交互に
    for i in range(20):
        unit_no = 101 + i
        layout = "1LDK" if i % 2 == 0 else "2LDK"
        mods = {}
        # After 版で複数ページに差分を仕込む
        if after:
            if i == 1:    # 102号室
                mods["change_dim"] = True
            elif i == 3:  # 104号室
                mods["rename_wa"] = True
            elif i == 6:  # 107号室
                mods["move_wall"] = True
            elif i == 8:  # 109号室
                mods["rename_ldk"] = True
            elif i == 11: # 112号室
                mods["split_room"] = True
                mods["change_dim"] = True
            elif i == 14: # 115号室
                mods["move_wall"] = True
                mods["rename_wa"] = True
            elif i == 17: # 118号室
                mods["rename_ldk"] = True
                mods["split_room"] = True
        draw_plan(c, version_label, unit_no, layout, mods)
        c.showPage()
    c.save()


if __name__ == "__main__":
    out = "/sessions/beautiful-adoring-curie/mnt/50-pdf差分検出ツール/samples"
    build(out + "/floorplan_before.pdf", "Rev.A  2026-04-01", after=False)
    build(out + "/floorplan_after.pdf",  "Rev.B  2026-05-01", after=True)
    print("OK: 20-page floorplan_before.pdf / floorplan_after.pdf")
