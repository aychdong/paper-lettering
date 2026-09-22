import copy,sys,unittest,tempfile,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_quality_review import score,verify_images
class BlindReviewTests(unittest.TestCase):
    def setUp(self):
        self.key=dict(version=2,evaluationId='frozen',cases={str(i):{'A':'baseline','B':'creative'} for i in range(12)})
        self.votes=dict(version=2,evaluationId='frozen',votes={str(i):dict(copy='B',layout='B',critical='none') for i in range(12)})
    def test_gate_needs_twelve_explicit_complete_votes(self):
        self.assertEqual(score(self.votes,self.key)['gate'],'passed');del self.votes['votes']['11']['critical'];self.assertNotEqual(score(self.votes,self.key)['gate'],'passed')
    def test_critical_error_is_attributed_to_its_version(self):
        self.votes['votes']['0']['critical']='A';self.assertEqual(score(self.votes,self.key)['gate'],'passed');self.votes['votes']['0']['critical']='B';self.assertEqual(score(self.votes,self.key)['criticalCreativeCases'],1);self.assertNotEqual(score(self.votes,self.key)['gate'],'passed')
    def test_ties_do_not_count_as_copy_wins(self):
        for i in range(5):self.votes['votes'][str(i)]['copy']='tie'
        r=score(self.votes,self.key);self.assertEqual(r['copyWins'],7);self.assertNotEqual(r['gate'],'passed')
    def test_votes_for_other_images_are_rejected(self):
        self.votes['evaluationId']='other'
        with self.assertRaises(ValueError):score(self.votes,self.key)
    def test_breakdown_distinguishes_losses_ties_and_neither(self):
        self.votes['votes']['0']['copy']='A';self.votes['votes']['1']['copy']='tie';self.votes['votes']['2']['copy']='neither'
        self.assertEqual(score(self.votes,self.key)['breakdown']['copy'],dict(creative=9,baseline=1,tie=1,neither=1,pending=0))
    def test_unknown_case_and_option_rejected(self):
        self.votes['votes']['other']={}
        with self.assertRaises(ValueError):score(self.votes,self.key)
        del self.votes['votes']['other'];self.votes['votes']['0']['layout']='creative'
        with self.assertRaises(ValueError):score(self.votes,self.key)
    def test_changed_images_and_unsafe_paths_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder);(p/'a.png').write_bytes(b'original');key={'imageHashes':{'a.png':hashlib.sha256(b'original').hexdigest()}};verify_images(key,p)
            (p/'a.png').write_bytes(b'changed')
            with self.assertRaises(ValueError):verify_images(key,p)
            with self.assertRaises(ValueError):verify_images({'imageHashes':{'../a.png':'ignored'}},p)
    def test_revealed_cases_cannot_pass_a_new_blind_gate(self):
        self.key['purpose']='feedback-regression'
        self.assertEqual(score(self.votes,self.key)['gate'],'not_applicable_regression')
if __name__=='__main__':unittest.main()
