import {readFile} from 'node:fs/promises';
import {browserSession,navigate} from '../src/browser.js';
const session=await browserSession({timeout:30000});
try{
 const page=session.page;
 page.on('response',async r=>{if(/comment/.test(new URL(r.url()).pathname)){try{const j=await r.json();console.log(JSON.stringify({url:r.url(),status:r.status(),body:j}));}catch{}}});
 await navigate(page,'/new/note-manager');
 console.log(JSON.stringify({creatorText:(await page.locator('body').innerText()).slice(0,2000),links:await page.locator('a').evaluateAll(xs=>xs.map(x=>({text:x.textContent,url:x.href})).filter(x=>/comment|explore|interact/.test(x.url)))}));
 const data=JSON.parse(await readFile('/private/tmp/xhs-pagination-final.json','utf8'));
 const note=data.records.flatMap(x=>x.data.data.notes).find(n=>n.comments_count>0);
 if(!note)throw Error('没有带评论的测试笔记');
 await page.goto(`https://www.xiaohongshu.com/explore/${note.id}?xsec_token=${encodeURIComponent(note.xsec_token)}&xsec_source=pc_note`);
 await page.waitForTimeout(5000);
 console.log(JSON.stringify({webUrl:page.url(),text:(await page.locator('body').innerText()).slice(-6000),scripts:await page.locator('script[src]').evaluateAll(xs=>xs.map(x=>x.src))}));
}finally{await session.close();}
