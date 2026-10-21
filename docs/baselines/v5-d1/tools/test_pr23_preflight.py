"""离线测试只读核对器；不访问GitHub、不合并仓库。"""
import unittest,json,tempfile,subprocess,sys,io
from pathlib import Path
from unittest.mock import patch
from contextlib import redirect_stdout
import pr23_preflight as p
class PreflightTests(unittest.TestCase):
 def test_origin(self):
  self.assertTrue(p.origin_matches('git@github.com:Bill-Billion/jingjing.git'))
  self.assertTrue(p.origin_matches('https://github.com/Bill-Billion/jingjing.git'))
  self.assertFalse(p.origin_matches('https://example.org/Bill-Billion/jingjing'))
  self.assertFalse(p.origin_matches('https://github.com/Bill-Billion/wrong'))
 def simulate(self,mode):
  def fake(args,cwd,allowed=(0,)):
   out='';code=0
   if args[:4]==['git','remote','get-url','origin']:out='https://github.com/Bill-Billion/jingjing.git'
   elif args[:3]==['git','status','--porcelain']:out=' M local-file' if mode=='dirty' else ''
   elif args[:3]==['git','merge-base','--is-ancestor']:code=1 if mode=='missing_ancestor' else 0
   elif args[:2]==['gh','api']:
    if args[-1].endswith('/pulls/23'):
     out=json.dumps({'state':'open','draft':True,'merged':False,'mergeable':True,'head':{'sha':'0'*40 if mode=='head_changed' else p.HEAD,'ref':'core/full-flow-acceptance-20261005'},'base':{'ref':'main' if mode=='wrong_target' else 'integration','sha':p.BASE}})
    else:out=json.dumps({'object':{'sha':p.MAIN if args[-1].endswith('/main') else ('1'*40 if mode=='base_changed' else p.BASE)}})
   elif args[:3]==['gh','pr','checks']:out=json.dumps([{'name':'check','state':'SUCCESS','bucket':'fail' if mode=='red' else 'pass','workflow':'unit','link':'https://github.com/example'}])
   # Ensure no remote mutation commands are used.
   self.assertNotIn('merge',args[1:3]);self.assertNotIn('ready',args[1:3]);self.assertNotIn('push',args[1:3]);self.assertNotIn('reset',args[1:3])
   return subprocess.CompletedProcess(args,code,stdout=out,stderr='')
  with tempfile.TemporaryDirectory() as d:
   out=Path(d)/'report.json'
   with patch.object(p,'run',side_effect=fake),patch.object(sys,'argv',['check','--repo-dir',d,'--output',str(out)]),redirect_stdout(io.StringIO()):rc=p.main()
   return rc,json.loads(out.read_text())
 def test_consistent_is_not_merge(self):
  rc,r=self.simulate('ok');self.assertEqual(rc,0);self.assertFalse(r['merge_executed']);self.assertTrue(r['draft']);self.assertTrue(r['human_checks_remaining'])
 def test_changed_head_blocks(self):self.assertEqual(self.simulate('head_changed')[0],2)
 def test_changed_base_blocks(self):self.assertEqual(self.simulate('base_changed')[0],2)
 def test_red_checks_block(self):self.assertEqual(self.simulate('red')[0],2)
 def test_missing_ancestor_blocks(self):self.assertEqual(self.simulate('missing_ancestor')[0],2)
 def test_target_blocks(self):self.assertEqual(self.simulate('wrong_target')[0],2)
 def test_dirty_preserved_warns(self):
  rc,r=self.simulate('dirty');self.assertEqual(rc,0);self.assertTrue(r['warnings']);self.assertTrue(r['working_tree_dirty'])
if __name__=='__main__':unittest.main()
