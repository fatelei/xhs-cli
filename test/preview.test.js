import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {savePreview} from '../src/publish.js';
test('headless preview saves an artifact and returns without submitting or waiting on stdin',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xhs-preview-test-'));
 try{
  const path=join(dir,'nested','preview.png');
  const page={screenshot:async args=>{assert.equal(args.fullPage,true);await writeFile(args.path,'test screenshot');}};
  const result=await savePreview(page,{type:'text',title:'预览'},{preview:path});
  assert.equal(result.submitted,false);assert.equal(result.preview_path,path);
  assert.equal((await stat(path)).mode&0o777,0o600);
 }finally{await rm(dir,{recursive:true,force:true});}
});
