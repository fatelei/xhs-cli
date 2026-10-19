// Only for removing fixtures created during this recorded integration session.
import {browserSession,navigate,waitUntil} from '../src/browser.js';
const allowed=new Set(['CLI 验证草稿','CLI 临时验证草稿','CLI 联调草稿','暂无笔记标题']);
const session=await browserSession({timeout:15000});
let removed=0;
try{
  const page=session.page;
  await navigate(page,'/publish/publish?from=menu&target=image');
  await page.getByText(/^草稿箱\(\d+\)$/).click();
  for(const kind of ['视频笔记','图文笔记','长文笔记']){
    await page.getByText(new RegExp(`^${kind}\\(\\d+\\)$`)).click();
    await page.waitForTimeout(600);
    while(await page.locator('.draft-item').count()){
      const card=page.locator('.draft-item').first();
      const title=(await card.locator('.draft-title-text').innerText()).trim();
      const time=await card.locator('.draft-time').innerText();
      if(!allowed.has(title)||!time.includes('2026-10-14'))throw Error('遇到非本次联调草稿，停止清理');
      const id=await card.getAttribute('data-draft-id');
      await card.getByText('删除',{exact:true}).click();
      const confirm=page.getByRole('button',{name:/^(删除|确定|确认删除)$/});
      await confirm.first().waitFor({state:'visible',timeout:3000}).catch(()=>{});
      if(await confirm.count()===1)await confirm.click();
      else {console.log(JSON.stringify({dialog:await page.locator('body').innerText()}));throw Error('删除确认控件不唯一，停止');}
      await waitUntil(async()=>await page.locator(`[data-draft-id="${id}"]`).count()===0,5000,'草稿删除未确认');
      removed++;
    }
  }
  console.log(JSON.stringify({removed,remaining:await page.getByText(/^草稿箱\(\d+\)$/).innerText()}));
}finally{await session.close();}
