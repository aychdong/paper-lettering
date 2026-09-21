#!/bin/zsh
cd -- "${0:A:h}"
if ! command -v python3 >/dev/null; then
  print "请先安装 Python 3.9+，详见 AI-CONNECTION.md"
else
  python3 ai/bridge.py --html 纸上文字.html --open
fi
print "按回车关闭窗口"
read -r
