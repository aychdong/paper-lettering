#!/usr/bin/env python3
"""Loopback-only, capability-protected AI bridge. It never serves arbitrary local files."""
import argparse, datetime, hashlib, hmac, json, os, secrets, subprocess, sys, tempfile, threading, time, urllib.parse, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from codex_client import Client,status
from design_contract import SCHEMA,preview,prompt,validate
class Bridge(ThreadingHTTPServer):
    daemon_threads=True
    def __init__(self,html,port=0):
        super().__init__(('127.0.0.1',port),Handler);self.token=secrets.token_urlsafe(32);self.html=Path(html).resolve();self.last_use=time.monotonic();self.jobs={};self.busy=threading.Lock()
    def url(self):return self.html.as_uri()+'#'+urllib.parse.urlencode({'bridge':'http://127.0.0.1:'+str(self.server_port),'token':self.token})
    def bootstrap(self,folder):
        # LaunchServices drops fragments from file URLs. Open a plain local file,
        # then let the browser navigate with the capability intact.
        page=Path(folder)/'start.html'
        target=json.dumps(self.url()).replace('<','\\u003c')
        page.write_text('<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>正在打开纸上文字</title><p>正在打开纸上文字并连接 AI…</p><script>location.replace('+target+');</script>',encoding='utf-8')
        page.chmod(0o600)
        return page
    def phase(self,job,message):self.jobs[job]={'state':'running','phase':message}
    def advise(self,payload,job):
        try:
            raw=preview(payload)
            with tempfile.TemporaryDirectory(prefix='paper-lettering-advice-') as temp:
                image=Path(temp)/'preview.png';image.write_bytes(raw)
                self.phase(job,'正在连接现有 ChatGPT 登录')
                with Client(temp) as client:result=client.advise(prompt(payload),image,SCHEMA,Path(temp),progress=lambda message:self.phase(job,message))
            self.phase(job,'正在检查方案并准备预览')
            data=validate(result['data']);self.jobs[job]={'state':'complete','result':{'type':'paper-lettering-advice','version':1,'imageSHA256':payload.get('imageSHA256'),'previewSHA256':hashlib.sha256(raw).hexdigest(),'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'model':result.get('model'),'colors':data['colors'],'designs':data['designs'],'usage':result.get('usage'),'toolEvents':result.get('toolEvents',[])}}
        except Exception as e:self.jobs[job]={'state':'failed','error':str(e)[:1500]}
        finally:self.last_use=time.monotonic();self.busy.release()
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def allowed(self):
        host=self.headers.get('Host','');expected='127.0.0.1:'+str(self.server.server_port)
        origin=self.headers.get('Origin')
        return host==expected and origin in [None,'null',f'http://{expected}'] and hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+self.server.token)
    def reply(self,code,data):
        b=json.dumps(data,ensure_ascii=False).encode();self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(b)));self.send_header('Cache-Control','no-store');self.send_header('Access-Control-Allow-Origin','null');self.send_header('Vary','Origin');self.end_headers();self.wfile.write(b)
    def do_OPTIONS(self):
        if self.headers.get('Host')!='127.0.0.1:'+str(self.server.server_port) or self.headers.get('Origin')!='null':return self.reply(403,{'error':'Origin rejected'})
        self.send_response(204);self.send_header('Access-Control-Allow-Origin','null');self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS');self.send_header('Access-Control-Allow-Headers','Authorization,Content-Type');self.send_header('Access-Control-Allow-Private-Network','true');self.end_headers()
    def do_GET(self):
        if not self.allowed():return self.reply(403,{'error':'Local capability required'})
        self.server.last_use=time.monotonic()
        if self.path=='/ping':return self.reply(200,{'alive':True})
        if self.path=='/status':
            try:return self.reply(200,status())
            except Exception as e:return self.reply(200,{'installed':False,'loggedIn':False,'message':str(e)[:1000]})
        if self.path.startswith('/jobs/'):
            job=self.path.rsplit('/',1)[-1];return self.reply(200,self.server.jobs.get(job,{'state':'missing'}))
        self.reply(404,{'error':'Unknown endpoint'})
    def do_POST(self):
        if not self.allowed():return self.reply(403,{'error':'Local capability required'})
        if self.path!='/advice':return self.reply(404,{'error':'Unknown endpoint'})
        if not self.headers.get('Content-Type','').startswith('application/json'):return self.reply(415,{'error':'JSON required'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=14_000_000:raise ValueError('Request is too large')
            payload=json.loads(self.rfile.read(size));preview(payload);prompt(payload)
            if not self.server.busy.acquire(blocking=False):return self.reply(409,{'error':'已有 AI 请求正在处理，请稍候。'})
            # Keep a bounded in-memory history; projects receive explicit copies of chosen advice.
            if len(self.server.jobs)>=20:self.server.jobs.pop(next(iter(self.server.jobs)))
            job=secrets.token_urlsafe(12);self.server.phase(job,'已收到请求，正在准备画面');threading.Thread(target=self.server.advise,args=(payload,job),daemon=True).start();self.reply(202,{'job':job})
        except (ValueError,KeyError,TypeError) as e:self.reply(400,{'error':str(e)})
def main():
    p=argparse.ArgumentParser();p.add_argument('--html',type=Path,required=True);p.add_argument('--open',action='store_true');p.add_argument('--port',type=int,default=0);a=p.parse_args()
    if not a.html.is_file():raise SystemExit('Editor HTML not found')
    server=Bridge(a.html,a.port)
    launch_dir=tempfile.TemporaryDirectory(prefix='paper-lettering-launch-') if a.open else None
    threading.Thread(target=server.serve_forever,daemon=True).start()
    if a.open:
        launch_page=server.bootstrap(launch_dir.name)
        if sys.platform=='darwin' and Path('/Applications/Google Chrome.app').exists():subprocess.run(['/usr/bin/open','-a','Google Chrome',str(launch_page)],check=True)
        elif not webbrowser.open(launch_page.as_uri()):raise RuntimeError('无法打开浏览器，请手动打开启动页。')
        print('READY',flush=True)
    else:print(server.url(),flush=True)
    stopped=threading.Event()
    def idle():
        while True:
            time.sleep(30)
            if not server.busy.locked() and time.monotonic()-server.last_use>900:stopped.set();return
    threading.Thread(target=idle,daemon=True).start()
    try:stopped.wait()
    except KeyboardInterrupt:pass
    finally:
        server.shutdown();server.server_close()
        if launch_dir:launch_dir.cleanup()
if __name__=='__main__':main()
