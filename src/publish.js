import { mkdtemp, rm, mkdir, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { navigate, waitUntil } from './browser.js';
import { footerButton } from './footer.js';

const escape = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function textCards(context, draft, folder) {
  const card = await context.newPage();
  const files = [];
  try {
    await card.setViewportSize({ width: 1080, height: 1440 });
    // Fixed amount per card keeps long body text from being silently clipped.
    const chars = Array.from(draft.body);
    for (let start = 0; start < chars.length; start += 220) {
      const file = join(folder, `text-${files.length + 1}.png`);
      await card.setContent(`<html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:90px;background:#fff8ee;color:#292621;font-family:system-ui}h1{font-size:62px;line-height:1.4}p{font-size:43px;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>${escape(draft.title)}</h1><p>${escape(chars.slice(start, start + 220).join(''))}</p></html>`);
      if (await card.evaluate(() => document.documentElement.scrollHeight > 1440)) throw Error('文字卡片超出画布，请减少换行或改用 --type article');
      await card.screenshot({ path: file }); files.push(file);
    }
    return files;
  } finally { await card.close(); }
}

async function oneVisible(locator, label) {
  const visible = locator.filter({ visible: true });
  await visible.first().waitFor({ state: 'visible' });
  if (await visible.count() !== 1) throw Error(`${label}不唯一，页面结构已变化，请手动检查`);
  return visible;
}

export async function savePreview(page,draft,o){
  const path=resolve(o.preview||join('exports','previews',`${Date.now()}-${randomUUID()}.png`));
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  await page.screenshot({path,fullPage:true,type:'png'});
  await chmod(path,0o600);
  return {submitted:false,type:draft.type,title:draft.title,preview_path:path};
}

export async function publish({ context, page, headless }, draft, o) {
  let folder;
  try {
    let files = draft.files;
    if (draft.type === 'text') {
      folder = await mkdtemp(join(tmpdir(), 'xhs-text-'));
      files = await textCards(context, draft, folder);
    }
    const target = ['video', 'article', 'audio'].includes(draft.type) ? draft.type : 'image';
    await navigate(page, `/publish/publish?from=menu&target=${target}`);
    if (draft.type === 'article') {
      await page.getByRole('button', { name: '新的创作', exact: true }).click();
      // The article editor hydrates after its title input mounts, replacing the
      // initial title model. Wait for the editor before writing the title.
      const editor = await oneVisible(page.locator('[contenteditable=true]'), '长文编辑器');
      await editor.fill(draft.body);
      const articleTitle = page.getByPlaceholder('输入标题', { exact: true });
      await articleTitle.fill(draft.title);
      await articleTitle.press('Tab');
      await page.getByRole('button', { name: '一键排版', exact: true }).click();
      await page.getByRole('button', { name: '下一步', exact: true }).click({timeout:o.timeout});
    } else if (draft.type === 'audio') {
      const close = page.locator('.podcast-collection-tip .close-btn');
      await page.getByRole('button', { name: '上传音频', exact: true }).waitFor();
      if (await close.isVisible()) await close.click();
      await page.getByRole('button', { name: '上传音频', exact: true }).click();
      await page.locator('input[type=file][accept*=".mp3"]').setInputFiles(files[0]);
      await page.locator('input[type=file][accept*=".jpg"]').setInputFiles(files[1]);
      const next = page.getByRole('button', { name: '去发布', exact: true });
      await waitUntil(()=>next.isEnabled(),o.timeout,'音频或封面上传尚未完成，请核对时长、格式与文件大小');
      await next.click();
    } else {
      const input = page.locator('input[type=file]');
      await waitUntil(async () => await input.count() > 0, o.timeout, '未找到上传控件');
      // Choose by the advertised accept attribute, never upload to an arbitrary input.
      let chosen;
      for (let i = 0; i < await input.count(); i++) {
        const candidate = input.nth(i);
        const accept = await candidate.getAttribute('accept') || '';
        if (target === 'video' ? /video|mp4|mov/i.test(accept) : /image|png|jpg|jpeg|webp/i.test(accept)) {
          if (chosen) throw Error('存在多个匹配的上传控件，请手动检查页面');
          chosen = candidate;
        }
      }
      if (!chosen) throw Error('没有与媒体类型匹配的上传控件，页面可能已变化');
      await chosen.setInputFiles(files);
    }
    const title = await oneVisible(page.locator('input[placeholder*="标题"], textarea[placeholder*="标题"]'), '标题框');
    const hint=page.getByRole('button',{name:'我知道了',exact:true});
    if(await hint.isVisible()) await hint.click();
    await title.fill(draft.title);
    const body = await oneVisible(page.locator('[contenteditable=true]'), '正文编辑器');
    if (draft.type !== 'article') await body.fill(draft.body);
    const button = await footerButton(context, page, '发布', o.timeout);
    await waitUntil(() => button.isEnabled(), o.timeout, '上传/处理未完成，发布按钮不可用');
    if (!o.submit) {
      if(o.onPreview) {await o.onPreview(page);return {submitted:false,type:draft.type,title:draft.title};}
      if(headless||o.preview) return savePreview(page,draft,o);
      console.error('内容已填入浏览器供预览。检查后在终端按 Enter 关闭浏览器；本次不会自动发布。');
      if (!process.stdin.isTTY) throw Error('预览模式需要交互终端；仅明确提交时使用 --submit');
      await new Promise(resolve => { process.stdin.resume(); process.stdin.once('data', () => { process.stdin.pause(); resolve(); }); });
      return { submitted: false, type: draft.type, title: draft.title };
    }
    // Wait for UI confirmation instead of assuming a button click is a successful post.
    await button.click();
    try {
      await page.getByText(/发布成功/).first().waitFor({ state: 'visible', timeout: o.timeout });
    } catch {
      throw Error('已点击发布，但未确认成功；请到笔记管理核实，避免重复提交');
    }
    return { submitted: true, type: draft.type, title: draft.title, url: page.url() };
  } finally { if (folder) await rm(folder, { recursive: true, force: true }); }
}
