// Uploads synthetic fixtures to an unpublished editor. Never clicks publish.
import { browserSession, navigate } from '../src/browser.js';
const session = await browserSession({ timeout: 60000 });
try {
  for (const type of process.argv.length>2?process.argv.slice(2):['image', 'video']) {
    const page = await session.context.newPage();
    page.setDefaultTimeout(60000);
    if (type === 'image') {
      await page.setViewportSize({width:720,height:960});
      await page.setContent('<body style="background:#eee8df;padding:60px;font:32px system-ui">CLI editor verification — unpublished</body>');
      await page.screenshot({path:'/private/tmp/xhs-cli-check.png'});
    }
    await navigate(page, `/publish/publish?from=menu&target=${type}`);
    await page.locator('input[type=file]').setInputFiles(`/private/tmp/xhs-cli-check.${type==='image'?'png':'mp4'}`);
    await page.locator('input[placeholder*="标题"],textarea[placeholder*="标题"]').first().waitFor({state:'visible'});
    await page.waitForTimeout(type==='video'?10000:2000);
    const hint=page.getByRole('button',{name:'我知道了',exact:true});
    if(await hint.isVisible()) await hint.click();
    await page.locator('input[placeholder*="标题"]').fill('CLI 临时验证草稿');
    await page.locator('[contenteditable=true]').fill('仅验证编辑器和上传，未发布。');
    await page.waitForTimeout(3000);
    await page.screenshot({path:`/private/tmp/xhs-${type}-editor.png`});
    const cdp=await session.context.newCDPSession(page);
    const doc=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
    const matches=[];
    function walk(node,parents=[]) {if(node.nodeValue?.trim()==='发布') matches.push({node,parents:parents.slice(-3).map(x=>({nodeName:x.nodeName,nodeId:x.nodeId,attributes:x.attributes,shadowRootType:x.shadowRootType}))});for(const child of [...node.children||[],...node.shadowRoots||[]])walk(child,[...parents,node]);}
    walk(doc.root);console.log(JSON.stringify({type,closedMatches:matches}));
    console.log(JSON.stringify({type,buttonRoleCount:await page.getByRole('button',{name:'发布',exact:true}).count(),publishTextCount:await page.getByText('发布',{exact:true}).count(),allButtons:await page.locator('button').allTextContents(),frames:await Promise.all(page.frames().map(async f=>({url:f.url(),text:(await f.locator('body').innerText().catch(()=>'' )).slice(-800)})))}));
    console.log(JSON.stringify({type,state:await page.evaluate(()=>({
      text:document.body.innerText.slice(0,10000),
      fields:[...document.querySelectorAll('input,textarea,[contenteditable=true]')].map(x=>({tag:x.tagName,type:x.type,placeholder:x.placeholder,class:x.className})),
      buttons:[...document.querySelectorAll('button')].map(x=>({text:x.innerText,disabled:x.disabled})),
      frames:[...document.querySelectorAll('iframe')].map(x=>x.src),
      publishNodes:[...document.querySelectorAll('body *')].filter(x=>x.children.length===0&&/^(发布|暂存离开|存草稿|保存草稿)$/.test(x.textContent.trim())).map(x=>x.outerHTML),
    }))}));
  }
} finally {await session.close();}
