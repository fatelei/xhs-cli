// Local integration check: no network, account data, uploads or publication.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {browserSession} from '../src/browser.js';
import {savePreview} from '../src/publish.js';
const dir=await mkdtemp(join(tmpdir(),'xhs-headless-check-'));
let session;
try{
 session=await browserSession({profile:join(dir,'browser'),timeout:10000,command:'publish'});
 const cdp=await session.context.newCDPSession(session.page);
 const {userAgent}=await cdp.send('Browser.getVersion');
 assert.match(userAgent,/HeadlessChrome/,'Chrome must actually launch in headless mode');
 await session.page.setContent('<html><body><h1>Local headless preview</h1></body></html>');
 const result=await savePreview(session.page,{type:'text',title:'Local preview'},{preview:join(dir,'preview.png')});
 assert.equal(result.submitted,false);
 const bytes=await readFile(result.preview_path);
 assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 console.log('Actual HeadlessChrome and real PNG preview passed.');
}finally{
 if(session)await session.close();
 await rm(dir,{recursive:true,force:true});
}
