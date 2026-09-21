import copy,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_quality_review import score
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
if __name__=='__main__':unittest.main()
