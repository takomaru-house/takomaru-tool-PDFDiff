# ライセンス調査レポート — PDF Diff Checker

調査日: 2026-05-13

---

## 結論

**商用利用・GitHub公開ともに問題なし。**
使用しているすべての外部ライブラリは許可型ライセンス（Apache 2.0 / SIL OFL）であり、
コピーレフト（GPL等）は含まれていない。

---

## 使用ライブラリ一覧

| ライブラリ | バージョン | 提供元 | ライセンス | 商用利用 | 帰属表示義務 | 読込方式 |
|---|---|---|---|---|---|---|
| PDF.js | 3.11.174 | Mozilla Foundation | Apache 2.0 | ✅ OK | 不要（推奨） | CDN (cdnjs) |
| Cormorant Garamond | — | Christian Thalmann | SIL OFL 1.1 | ✅ OK | 不要 | Google Fonts CDN |
| Noto Serif JP | — | Google / Adobe | SIL OFL 1.1 | ✅ OK | 不要 | Google Fonts CDN |
| Noto Sans JP | — | Google / Adobe | SIL OFL 1.1 | ✅ OK | 不要 | Google Fonts CDN |
| JetBrains Mono | — | JetBrains | SIL OFL 1.1 | ✅ OK | 不要 | Google Fonts CDN |

---

## 各ライセンスの概要

### Apache License 2.0（PDF.js）

- 商用利用・改変・再配布・特許利用 すべて許可
- 義務: ライセンス文・著作権表示の保持（コードを改変して再配布する場合）
- 本ツールは PDF.js を **改変なし・CDN読込** で使用しているため、表示義務は実質的に発生しない
- ただし NOTICE ファイルや帰属表示を docs や README に記載することが推奨される

### SIL Open Font License 1.1（Google Fonts 4書体）

- フォントの使用・埋め込み・商用利用 すべて許可
- 唯一の制約: フォント単体を有償で販売することの禁止（本ツールでは該当しない）
- Webフォントとして読み込むだけであれば義務なし

---

## 注意点：Google Fonts CDN

本ツールは起動時に `fonts.googleapis.com` へリクエストを送信してフォントを取得する。
これによりユーザーの IP アドレスが Google に記録される可能性がある。

| 懸念 | 対応方針 |
|---|---|
| GDPR / プライバシー | index.html の利用案内にCDN利用を明記する |
| オフライン環境 | フォントが読み込まれなくても代替フォント（serif / system-ui）で動作する |
| 完全オフライン化 | フォントファイルをダウンロードして自己ホストすれば解決（現状は不採用） |

---

## 本プロジェクトのソースコードのライセンスについて

現時点で `LICENSE` ファイルが存在しない。GitHub で公開する場合は、以下のいずれかの追加を推奨する。

| 選択肢 | 特徴 |
|---|---|
| **MIT License** | 最もシンプル。商用利用・改変・再配布すべて許可。帰属表示のみ必要 |
| **Apache 2.0** | MITより手厚い特許条項あり。PDF.jsと同じライセンスで統一感がある |
| **著作権のみ（All Rights Reserved）** | 公開はするが再利用を許可しない場合 |

---

## 帰属表示（クレジット）推奨文

HP・README・エクスポートレポート等に記載する場合の例：

```
Powered by PDF.js (Mozilla Foundation, Apache License 2.0)
Fonts: Cormorant Garamond, Noto Serif JP, Noto Sans JP, JetBrains Mono
       via Google Fonts (SIL Open Font License 1.1)
```

---

## HP上への追記推奨項目

1. **ブラウザ完結処理**: 選択したPDFはブラウザ内のみで処理され、外部サーバーへ送信されない
2. **Google Fonts CDN**: フォント読込のためGoogleサーバーへのリクエストが発生する
3. **免責事項**: 本ツールは現状のまま提供される。利用により生じた損害について責任を負わない
4. **クレジット**: PDF.js (Apache 2.0)、Google Fonts (SIL OFL 1.1)
