@echo off
REM PDF差分検出ツール (モックアップ) をローカルサーバーで起動するバッチ
REM Pythonがインストールされている必要があります

cd /d "%~dp0"
echo ローカルサーバーを起動します。
echo ブラウザで http://localhost:8765/ を開いてください。
echo (終了するには Ctrl+C を押します)
python -m http.server 8765
pause
