"""Login setup must use official sign-in and preserve existing authentication."""
import contextlib,importlib.util,io,sys,unittest
from pathlib import Path
from unittest.mock import patch,Mock
AI=Path(__file__).resolve().parents[1]/'tools/lettering/ai'
sys.path.insert(0,str(AI))
spec=importlib.util.spec_from_file_location('lettering_setup',AI/'setup.py')
setup=importlib.util.module_from_spec(spec);spec.loader.exec_module(setup)

class LoginSetupTests(unittest.TestCase):
    def run_setup(self,states,args=()):
        with patch.object(sys,'argv',['setup.py',*args]),patch.object(setup,'executable',return_value='codex'),patch.object(setup,'status',side_effect=states),patch.object(setup.subprocess,'run',return_value=Mock(returncode=0)) as login,contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
            code=setup.main()
        return code,login
    def test_existing_chatgpt_never_reauthenticates(self):
        code,login=self.run_setup([{'loggedIn':True}],['--login'])
        self.assertEqual(code,0);login.assert_not_called()
    def test_diagnostic_does_not_start_login(self):
        code,login=self.run_setup([{'loggedIn':False,'message':'Please sign in'}])
        self.assertEqual(code,1);login.assert_not_called()
    def test_other_authentication_is_preserved(self):
        code,login=self.run_setup([{'loggedIn':False,'authType':'apiKey'}],['--login'])
        self.assertEqual(code,1);login.assert_not_called()
    def test_signed_out_uses_official_flow_and_checks_result(self):
        code,login=self.run_setup([{'loggedIn':False},{'loggedIn':True}],['--login'])
        self.assertEqual(code,0);login.assert_called_once_with(['codex','login'],check=False)
    def test_incomplete_login_is_not_reported_as_success(self):
        code,login=self.run_setup([{'loggedIn':False},{'loggedIn':False,'message':'Sign-in incomplete'}],['--login'])
        self.assertEqual(code,1);login.assert_called_once()
if __name__=='__main__':unittest.main()
