import { browserSession,navigate } from '../src/browser.js';
const session=await browserSession({timeout:30000});
try {
  const page=session.page;
  await navigate(page,'/publish/publish?from=menu&target=image');
  await page.getByText(/^草稿箱\(\d+\)$/).click();
  await page.waitForTimeout(1500);
  console.log(await page.locator('body').innerText());
  console.log(JSON.stringify(await page.getByText(/CLI.*草稿/).evaluateAll(xs=>xs.slice(0,3).map(x=>x.parentElement.parentElement.parentElement.outerHTML))));
}finally{await session.close();}
