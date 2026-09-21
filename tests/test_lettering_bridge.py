"""Loopback security and the native launch transport regression."""
import json,stat,sys,tempfile,threading,unittest,urllib.error,urllib.request
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/lettering/ai'))
from bridge import Bridge
class StartupTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.html=Path(self.temp.name)/'纸上文字.html';self.html.write_text('<html>test</html>')
        self.server=Bridge(self.html);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.url='http://127.0.0.1:'+str(self.server.server_port)
    def tearDown(self):self.server.shutdown();self.server.server_close();self.temp.cleanup()
    def request(self,path,headers):
        try:
            with urllib.request.urlopen(urllib.request.Request(self.url+path,headers=headers),timeout=3) as response:return response.status,json.loads(response.read())
        except urllib.error.HTTPError as error:return error.code,json.loads(error.read())
    def test_bootstrap(self):
        page=self.server.bootstrap(self.temp.name)
        self.assertEqual(stat.S_IMODE(page.stat().st_mode),0o600)
        text=page.read_text();target=text.split('location.replace(',1)[1].split(');</script>',1)[0]
        self.assertEqual(json.loads(target),self.server.url());self.assertEqual(self.html.read_text(),'<html>test</html>')
    def test_ping_requires_capability(self):
        self.assertEqual(self.request('/ping',{})[0],403)
        code,body=self.request('/ping',{'Authorization':'Bearer '+self.server.token,'Origin':'null'})
        self.assertEqual((code,body),(200,{'alive':True}))
    def test_reject_foreign_origin_and_host(self):
        headers={'Authorization':'Bearer '+self.server.token,'Origin':'https://example.com'}
        self.assertEqual(self.request('/ping',headers)[0],403)
        headers.update(Origin='null',Host='example.com');self.assertEqual(self.request('/ping',headers)[0],403)
    def test_no_file_serving(self):
        self.assertEqual(self.request('/../../etc/passwd',{'Authorization':'Bearer '+self.server.token})[0],404)
if __name__=='__main__':unittest.main()
