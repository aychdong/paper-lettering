"""Text-policy invariants, not model wording or aesthetic judgments."""
import copy,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/lettering/ai'))
from design_contract import prompt,validate_response,settings
class CopyTests(unittest.TestCase):
    def setUp(self):
        layer=dict(text='冬阳落肩\n与你望远',font='gf-longcang',size=.05,weight=400,thickness=.02,slant=0,x=.65,y=.1,rotation=0,direction='vertical',align='left',tracking=.1,lineHeight=1.6,color='#635243',effect='ink')
        self.response=dict(colors=[dict(hex='#635243',name='墨色',reason='纸色协调') for _ in range(3)],designs=[dict(name='方案',reason='留白',layers=[copy.deepcopy(layer)]) for _ in range(2)])
        self.request=dict(mode='design',copyMode='compose',placement='right',preference='写一句冬日短诗',layers=[dict(text='并肩看远方')])
    def test_composition_can_replace_and_break_lines(self):self.assertIs(validate_response(self.response,self.request),self.response)
    def test_preserve_rejects_rewrite_even_when_preference_requests_it(self):
        self.request['copyMode']='preserve'
        with self.assertRaisesRegex(ValueError,'改动了原文'):validate_response(self.response,self.request)
    def test_preserve_allows_reflow_and_reordering_but_not_punctuation_changes(self):
        self.request.update(copyMode='preserve',layers=[dict(text='冬阳落肩，与你望远'),dict(text='备用',hidden=True)])
        for d in self.response['designs']:d['layers'][0]['text']='冬阳落肩，\n与你望远'
        validate_response(self.response,self.request)
        self.response['designs'][0]['layers'][0]['text']='冬阳落肩\n与你望远'
        with self.assertRaises(ValueError):validate_response(self.response,self.request)
    def test_legacy_request_defaults_to_preserve(self):
        del self.request['copyMode'];self.assertEqual(settings(self.request)[1],'preserve')
        with self.assertRaises(ValueError):validate_response(self.response,self.request)
    def test_invalid_mode_and_empty_copy_are_rejected(self):
        for key,value in [('mode','unknown'),('copyMode','unknown'),('placement','unknown'),('preference',None)]:
            request={**self.request,key:value}
            with self.assertRaises(ValueError):prompt(request)
        self.response['designs'][0]['layers'][0]['text']=' \n '
        with self.assertRaises(ValueError):validate_response(self.response,self.request)
    def test_preserve_empty_and_long_inputs_fail_before_model_call(self):
        for layers in [[],[dict(text='字'*121)],[dict(text=str(i)) for i in range(5)]]:
            with self.assertRaises(ValueError):prompt({**self.request,'copyMode':'preserve','layers':layers})
    def test_line_height_is_checked_and_palette_cannot_change_copy(self):
        self.response['designs'][0]['layers'][0]['lineHeight']=float('nan')
        with self.assertRaises(ValueError):validate_response(self.response,self.request)
        self.response['designs'][0]['layers'][0]['lineHeight']=1.6
        with self.assertRaises(ValueError):validate_response(self.response,{**self.request,'mode':'palette'})
        self.response['designs']=[];validate_response(self.response,{**self.request,'mode':'palette'})
if __name__=='__main__':unittest.main()
