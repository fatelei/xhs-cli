// Read-only editor inspection for maintaining selectors. Never fills or submits a post.
import { browserSession, navigate } from '../src/browser.js';
const session = await browserSession({ timeout: 30000 });
try {
  for (const target of process.argv.length > 2 ? process.argv.slice(2) : ['image', 'video', 'article', 'audio']) {
    session.page = await session.context.newPage();
    session.page.setDefaultTimeout(30000);
    await navigate(session.page, `/publish/publish?from=menu&target=${target}`);
    await session.page.waitForTimeout(2500);
    if (target === 'article') {
      await session.page.getByRole('button', { name: '新的创作', exact: true }).click();
      await session.page.waitForTimeout(1500);
      await session.page.getByPlaceholder('输入标题', { exact: true }).fill('CLI 联调草稿');
      await session.page.locator('[contenteditable=true]').fill('用于验证长文编辑器的临时草稿，未发布。');
      await session.page.getByRole('button', { name: '一键排版', exact: true }).click();
      await session.page.getByText('下一步', { exact: true }).first().waitFor({state:'visible',timeout:30000}).catch(()=>{});
      await session.page.getByRole('button',{name:'下一步',exact:true}).click();
      await session.page.waitForTimeout(3000);
    }
    if (target === 'audio') {
      const close = session.page.locator('.podcast-collection-tip .close-btn');
      if (await close.isVisible()) await close.click();
      await session.page.getByRole('button', { name: '上传音频', exact: true }).click();
      await session.page.waitForTimeout(1000);
    }
    console.log(JSON.stringify({ target, url: session.page.url(), state: await session.page.evaluate(() => ({
      text: document.body.innerText.slice(0, 9000),
      inputs: [...document.querySelectorAll('input,textarea,[contenteditable=true]')].map(x => ({ tag: x.tagName, type: x.type, placeholder: x.placeholder, accept: x.accept, class: x.className })),
      buttons: [...document.querySelectorAll('button')].map(x => ({ text: x.innerText, disabled: x.disabled })),
    })) }));
  }
} finally { await session.close(); }
