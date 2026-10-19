import { chromium } from 'playwright';
import { mkdir, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const ORIGIN = 'https://creator.xiaohongshu.com';

export async function browserSession(o) {
  let browser, context;
  const headless=o.headless??(o.command!=='login'&&!o.headed);
  if (o.cdp) {
    const url = new URL(o.cdp);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw Error('--cdp 只允许本机地址');
    browser = await chromium.connectOverCDP(o.cdp);
    context = browser.contexts()[0];
  } else {
    const profile = resolve(o.profile || join(homedir(), '.xhs-cli', 'browser'));
    await mkdir(profile, { recursive: true, mode: 0o700 });
    await chmod(profile, 0o700);
    context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless });
  }
  const page = await context.newPage();
  page.setDefaultTimeout(o.timeout);
  return { context, page, headless, async close() {
    if (browser) { await page.close(); await browser.close(); }
    else await context.close();
  }};
}

export async function navigate(page, path) {
  await page.goto(ORIGIN + path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.readyState === 'complete');
  if (new URL(page.url()).pathname.includes('/login')) throw Error('尚未登录，请先执行 xhs login');
}

// Record responses triggered by the real application: preserve its request signing,
// pagination and account-dependent permission handling without inventing API parameters.
export function collect(page, matches) {
  const records = [], pending = new Set(), errors = [], recordIndexes = new Map();
  const listener = response => {
    const url = new URL(response.url());
    if (url.hostname !== 'creator.xiaohongshu.com' || !matches(url.pathname, url, response)) return;
    const task = (async () => {
      try {
        const data = await response.json();
        if (!response.ok() || data.success === false || (typeof data.code === 'number' && data.code !== 0 && data.code !== 200)) {
          errors.push({ path: url.pathname, status: response.status(), code: data.code, message: data.msg || data.message });
        } else {
          // Scroll observers and tab switches can issue an identical page twice.
          // Keep one response per notes page; retain distinct statistics queries.
          const key = url.pathname === '/api/galaxy/v2/creator/note/user/posted'
            ? `${url.pathname}:${data.data?.page}:${JSON.stringify(data.data?.notes?.map(note=>note.id))}`
            : `${url.href}:${response.request?.().postData?.() || ''}`;
          const record = { path: url.pathname, data };
          if(recordIndexes.has(key)) records[recordIndexes.get(key)] = record;
          else {recordIndexes.set(key,records.length);records.push(record);}
        }
      } catch { errors.push({ path: url.pathname, status: response.status(), message: '响应不是 JSON' }); }
    })();
    pending.add(task); task.finally(() => pending.delete(task));
  };
  page.on('response', listener);
  return { records, async finish() {
    page.off('response', listener);
    await Promise.all([...pending]);
    if (!records.length) throw Error(`没有获取到有效数据：${JSON.stringify(errors)}。请确认登录和数据权限，页面接口可能已变化。`);
    return { records, errors };
  }};
}

export async function waitUntil(check, timeout, message) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise(r => setTimeout(r, 250));
  }
  throw Error(message);
}
