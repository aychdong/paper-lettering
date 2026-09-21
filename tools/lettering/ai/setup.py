#!/usr/bin/env python3
"""Check this user's official Codex installation; optionally start its own login flow."""
import argparse,subprocess,sys
from codex_client import executable,status

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--login',action='store_true',help='If signed out, open the official Codex browser login')
    args=parser.parse_args()
    print('正在检查本机 Codex 和登录状态…',flush=True)
    try:
        binary=executable();state=status()
        if state.get('loggedIn'):
            print('已连接你在本机登录的 ChatGPT。现在双击「启用AI助手」即可。')
            return 0
        if not args.login:
            print(state['message']+'。运行 python3 ai/setup.py --login 开始登录。')
            return 1
        if state.get('authType'):
            print('检测到其他认证方式。请自行运行 codex login 选择 ChatGPT；本工具不会替换已有认证或退出账号。')
            return 1
        print('即将通过官方 Codex 打开登录页面，请在浏览器中登录自己的 ChatGPT。纸上文字不收集密码。',flush=True)
        result=subprocess.run([binary,'login'],check=False)
        if result.returncode:return result.returncode
        state=status()
        if not state.get('loggedIn'):raise RuntimeError(state['message'])
        print('连接完成。现在双击「启用AI助手」，页面会自动连接。')
        return 0
    except (OSError,RuntimeError,TimeoutError) as error:
        print(str(error)+'\n官方安装说明：https://learn.chatgpt.com/docs/codex/cli\n安装并登录后重试；离线示例、排版和导出仍可使用。',file=sys.stderr)
        return 1
if __name__=='__main__':sys.exit(main())
