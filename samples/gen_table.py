# -*- coding: utf-8 -*-
"""価格表サンプルPDF生成 (Before/After)。20ページ構成、複数ページに差分を仕込む。"""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

TTF_PATH = "/sessions/beautiful-adoring-curie/.local/lib/python3.10/site-packages/japanize_matplotlib/fonts/ipaexg.ttf"
pdfmetrics.registerFont(TTFont("IPAexG", TTF_PATH))
JP = "IPAexG"

styles = getSampleStyleSheet()
title_style = ParagraphStyle("JpTitle", parent=styles["Title"], fontName=JP, fontSize=16, leading=20)
body_style  = ParagraphStyle("JpBody",  parent=styles["Normal"], fontName=JP, fontSize=9, leading=13)

CATEGORIES = [
  ("PC・タブレット", "PC", [
    ("A-001","ノートPC 13インチ","128,000","12"),("A-002","ノートPC 15インチ","148,000","8"),
    ("A-003","ノートPC 17インチ","168,000","5"),("A-004","デスクトップ Compact","98,000","10"),
    ("A-005","タブレット 10.9インチ","78,000","20"),("A-006","タブレット 12.9インチ","118,000","14"),
    ("A-007","2-in-1 PC","138,000","7"),
  ]),
  ("周辺機器", "周辺機器", [
    ("B-101","外付けSSD 1TB","12,800","45"),("B-102","外付けSSD 2TB","22,800","30"),
    ("B-103","外付けSSD 4TB","42,800","12"),("B-201","ワイヤレスマウス","3,980","120"),
    ("B-202","メカニカルキーボード","9,800","60"),("B-203","ゲーミングマウスパッド","2,500","80"),
    ("B-204","USBハブ 4ポート","1,980","150"),
  ]),
  ("モニタ・ディスプレイ", "モニタ", [
    ("C-301","24インチ FHDモニタ","22,800","30"),("C-302","27インチモニタ","32,800","20"),
    ("C-303","32インチモニタ","48,000","10"),("C-304","曲面ウルトラワイド","78,000","5"),
    ("C-305","モバイルモニタ 15.6","28,000","25"),
  ]),
  ("オーディオ", "オーディオ", [
    ("D-401","ノイキャンヘッドセット","18,800","25"),("D-402","USBスピーカー","5,500","40"),
    ("D-403","ワイヤレスイヤホン","12,800","60"),("D-404","コンデンサマイク","9,800","18"),
    ("D-405","オーディオインターフェース","22,000","12"),
  ]),
  ("ストレージ", "ストレージ", [
    ("E-501","USBメモリ 64GB","1,280","200"),("E-502","USBメモリ 256GB","3,800","100"),
    ("E-503","外付けHDD 4TB","13,800","40"),("E-504","NAS 2ベイ","32,800","8"),
    ("E-505","microSDXC 512GB","8,800","55"),
  ]),
  ("ネットワーク", "ネットワーク", [
    ("F-601","Wi-Fi 6 ルータ","12,800","20"),("F-602","メッシュWi-Fi 3台","32,800","10"),
    ("F-603","8ポートスイッチ","5,800","30"),("F-604","LANケーブル CAT6 5m","780","300"),
    ("F-605","USB-C 1GbE アダプタ","3,200","60"),
  ]),
  ("入力機器", "入力", [
    ("G-701","ペンタブレット","18,800","15"),("G-702","ゲームパッド","5,500","40"),
    ("G-703","トラックボール","7,800","20"),("G-704","テンキー","1,980","80"),
  ]),
  ("ケーブル類", "ケーブル", [
    ("H-801","USB-C 1m","980","500"),("H-802","USB-C 2m PD対応","1,580","400"),
    ("H-803","HDMI 2.1 2m","1,980","200"),("H-804","DisplayPort 1.4 2m","2,500","120"),
    ("H-805","Thunderbolt 4 1m","5,800","30"),
  ]),
  ("バッテリー・電源", "電源", [
    ("I-901","モバイルバッテリ 10000mAh","3,800","80"),("I-902","モバイルバッテリ 20000mAh","5,800","50"),
    ("I-903","USB-C PD充電器 65W","3,500","120"),("I-904","USB-C PD充電器 100W","6,800","40"),
    ("I-905","ポータブル電源 500Wh","58,000","5"),
  ]),
  ("プリンタ", "プリンタ", [
    ("J-1001","A4 インクジェット複合機","18,800","12"),("J-1002","A4 レーザー複合機","32,800","8"),
    ("J-1003","A3 インクジェット","48,000","4"),("J-1004","ラベルプリンタ","12,800","15"),
    ("J-1005","感熱レシートプリンタ","9,800","20"),
  ]),
  ("スキャナ・OCR", "スキャナ", [
    ("K-1101","ドキュメントスキャナ","38,000","10"),("K-1102","フィルムスキャナ","22,000","5"),
    ("K-1103","ハンディスキャナ","12,800","12"),
  ]),
  ("メディア・記録", "メディア", [
    ("L-1201","Blu-ray 25GB 50枚","3,500","30"),("L-1202","DVD-R 50枚","1,500","60"),
    ("L-1203","外付けBlu-rayドライブ","12,800","10"),
  ]),
  ("ソフトウェア", "ソフト", [
    ("M-1301","オフィススイート 1年","12,800","-"),("M-1302","セキュリティソフト 3台","5,500","-"),
    ("M-1303","PDF編集ソフト","12,800","-"),("M-1304","クラウドストレージ 200GB","3,800","-"),
  ]),
  ("オフィス家具", "家具", [
    ("N-1401","昇降デスク 120cm","32,800","10"),("N-1402","ゲーミングチェア","28,800","12"),
    ("N-1403","モニタアーム シングル","5,800","40"),("N-1404","モニタアーム デュアル","9,800","20"),
  ]),
  ("文具・消耗品", "文具", [
    ("O-1501","A4 コピー用紙 500枚","480","200"),("O-1502","ボールペン 0.5 黒","120","1000"),
    ("O-1503","蛍光ペン 5色セット","550","300"),("O-1504","クリアファイル 100枚","1,200","150"),
  ]),
  ("書籍・教材", "書籍", [
    ("P-1601","プログラミング入門書","2,800","30"),("P-1602","ビジネス書 マネジメント","1,800","40"),
    ("P-1603","TOEIC 公式問題集","3,300","25"),
  ]),
  ("防災用品", "防災", [
    ("Q-1701","非常食 7日分","8,800","20"),("Q-1702","ヘルメット","3,200","30"),
    ("Q-1703","懐中電灯 LED","1,800","50"),("Q-1704","防災リュック","12,800","15"),
  ]),
  ("救急・衛生", "救急", [
    ("R-1801","救急セット","3,800","30"),("R-1802","AED 練習用","98,000","2"),
    ("R-1803","アルコール消毒液 5L","2,800","50"),
  ]),
  ("清掃用品", "清掃", [
    ("S-1901","コードレス掃除機","32,800","8"),("S-1902","オフィス用空気清浄機","28,000","10"),
    ("S-1903","床用ワイパー","1,200","80"),
  ]),
  ("廃棄物管理", "廃棄物", [
    ("T-2001","シュレッダー 業務用","48,000","5"),("T-2002","分別ゴミ箱 4種","8,800","20"),
    ("T-2003","PCリサイクル受付","-","-"),
  ]),
]


def build_page(elements, page_num, title, intro, rows, footer):
    elements.append(Paragraph(f"Page {page_num} / 20  -  {title}", title_style))
    elements.append(Spacer(1, 6))
    elements.append(Paragraph(intro, body_style))
    elements.append(Spacer(1, 8))
    data = [["商品ID","商品名","カテゴリ","単価(円)","在庫数"]] + rows
    style = TableStyle([
        ("FONT",(0,0),(-1,-1),JP,9),
        ("BACKGROUND",(0,0),(-1,0),colors.HexColor("#3b5998")),
        ("TEXTCOLOR",(0,0),(-1,0),colors.white),
        ("ALIGN",(3,1),(4,-1),"RIGHT"),
        ("GRID",(0,0),(-1,-1),0.4,colors.grey),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.whitesmoke,colors.white]),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),
        ("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),
    ])
    t = Table(data, repeatRows=1, colWidths=[60,180,80,70,60])
    t.setStyle(style)
    elements.append(t)
    elements.append(Spacer(1,12))
    elements.append(Paragraph(footer, body_style))


def make(path, suffix, after=False):
    doc = SimpleDocTemplate(path, pagesize=A4, topMargin=40, bottomMargin=30, leftMargin=40, rightMargin=40)
    elements = []
    for i,(cat,short,items) in enumerate(CATEGORIES, start=1):
        rows = [[c0,n,short,p,s] for (c0,n,p,s) in items]
        if after:
            if i == 2:
                rows[0][3] = "13,500"
                rows.append(["B-205","USB-Cドック 11-in-1",short,"8,800","60"])
            elif i == 4:
                rows = [r for r in rows if r[0] != "D-402"]
                rows.append(["D-406","Bluetoothスピーカー",short,"7,800","35"])
            elif i == 7:
                for r in rows:
                    if r[0] == "G-704": r[4] = "30"
            elif i == 10:
                for r in rows:
                    if r[0] == "J-1003": r[1] = "A3 大判インクジェット (新)"
            elif i == 14:
                for r in rows:
                    if r[0] == "N-1402": r[3] = "32,800"
            elif i == 17:
                for r in rows:
                    if r[0] == "Q-1701": r[4] = "12"
                    if r[0] == "Q-1704": r[1] = "防災リュック (新モデル)"
            elif i == 20:
                rows.append(["T-2004","古紙回収ボックス",short,"3,200","15"])
        title = f"{cat} 製品一覧"
        intro = f"カテゴリ: {cat}。月次で更新される製品マスタです。{suffix}"
        footer = f"備考: 単価は税抜き。在庫はカテゴリ「{cat}」({i}/20)時点。"
        build_page(elements, i, title, intro, rows, footer)
        if i != len(CATEGORIES):
            elements.append(PageBreak())
    doc.build(elements)


if __name__ == "__main__":
    out = "/sessions/beautiful-adoring-curie/mnt/50-pdf差分検出ツール/samples"
    make(out + "/table_before.pdf", "(2026年4月版)", after=False)
    make(out + "/table_after.pdf",  "(2026年5月版)", after=True)
    print("OK: 20-page table_before.pdf / table_after.pdf")
