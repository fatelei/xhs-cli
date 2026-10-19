// End-to-end checks stop before publishing. May create platform autosaved drafts.
import { browserSession } from '../src/browser.js';
import { publish } from '../src/publish.js';
const session = await browserSession({timeout:90000});
try {
  for(const type of process.argv.length>2?process.argv.slice(2):['text','video','article','audio']) {
    session.page=await session.context.newPage();
    session.page.setDefaultTimeout(90000);
    const files=type==='video'?['/private/tmp/xhs-cli-check.mp4']:type==='audio'?['/private/tmp/xhs-cli-check.mp3','/private/tmp/xhs-cli-check.png']:[];
    let result;
    try { result=await publish(session,{type,title:'CLI 验证草稿',body:'仅验证上传与编辑流程，不会发布。',files},{timeout:90000,onPreview:async page=>{
      console.log(JSON.stringify({type,preview:true,title:await page.locator('input[placeholder*="标题"]').inputValue()}));
    }}); } catch(error) {console.log(JSON.stringify({type,error:error.message,text:await session.page.locator('body').innerText(),buttons:await session.page.locator('button').allTextContents()}));throw error;}
    console.log(JSON.stringify(result));
  }
}finally{await session.close();}
