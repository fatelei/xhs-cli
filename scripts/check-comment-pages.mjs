import {readFile} from 'node:fs/promises';
import {browserSession} from '../src/browser.js';
const session=await browserSession({timeout:30000});
try{
 const page=session.page;
 const data=JSON.parse(await readFile('/private/tmp/xhs-pagination-final.json','utf8'));
 const note=data.records.flatMap(x=>x.data.data.notes).find(n=>n.id==='6ac599120000000014039541');
 page.on('response',async r=>{const url=new URL(r.url());if(url.pathname.includes('/comment/'))try{const b=await r.json();console.log(JSON.stringify({path:url.pathname,cursor:url.searchParams.get('cursor'),status:r.status(),code:b.code,success:b.success,msg:b.msg,count:b.data?.comments?.length,next:b.data?.cursor,more:b.data?.has_more}));}catch{}});
 await page.goto(`https://www.xiaohongshu.com/explore/${note.id}?xsec_token=${encodeURIComponent(note.xsec_token)}&xsec_source=pc_note`);
 await page.waitForTimeout(3000);
 console.log(JSON.stringify({url:new URL(page.url()).pathname,scrolls:await page.locator('*').evaluateAll(xs=>xs.filter(x=>x.scrollHeight>x.clientHeight+100&&x.clientHeight>100).map(x=>({tag:x.tagName,class:x.className,height:x.clientHeight,scrollHeight:x.scrollHeight}))),buttons:(await page.locator('body').innerText()).slice(-1200)}));
 await page.evaluate(()=>{const el=document.querySelector('.note-scroller');if(el)el.scrollTop=el.scrollHeight;});
 await page.waitForTimeout(3000);
 console.log(JSON.stringify({url:new URL(page.url()).pathname,text:(await page.locator('body').innerText()).slice(-1000)}));
}finally{await session.close();}
