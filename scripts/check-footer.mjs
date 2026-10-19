import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { footerButton } from '../src/footer.js';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const context=await browser.newContext(), page=await context.newPage();
  await page.setContent('<div id="host"></div>');
  await page.evaluate(()=>{
    const root=document.querySelector('#host').attachShadow({mode:'closed'});
    window.testButton=document.createElement('button');
    testButton.textContent='发布';testButton.disabled=true;
    window.testClicks=0;testButton.onclick=()=>window.testClicks++;
    root.append(testButton);
  });
  const button=await footerButton(context,page,'发布',1000);
  assert.equal(await button.isEnabled(),false);
  await assert.rejects(button.click(),/尚未就绪/);
  await page.evaluate(()=>testButton.disabled=false);
  assert.equal(await button.isEnabled(),true);
  await button.click();
  assert.equal(await page.evaluate(()=>window.testClicks),1);
  console.log('Closed shadow footer: disabled guard and real mouse click passed.');
}finally{await browser.close();}
