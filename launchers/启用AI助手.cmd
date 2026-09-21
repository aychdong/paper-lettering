@echo off
chcp 65001 >nul
cd /d "%~dp0"
py -3 ai/bridge.py --html "纸上文字.html" --open
pause
