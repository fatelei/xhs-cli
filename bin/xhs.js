#!/usr/bin/env node
import { options, publication } from '../src/options.js';
import { browserSession, navigate, collect, waitUntil, ORIGIN } from '../src/browser.js';
import { publish } from '../src/publish.js';
import {comments,parseNote} from '../src/comments.js';

const help = `xhs — 小红书创作平台 CLI（浏览器会话）
  login                      打开独立 Chrome，手动登录
  notes [--pages 1]           逐页确认后读取自己的已发布笔记，输出 JSON
  stats NOTE_ID              读取单篇笔记数据，输出原始指标 JSON
  comments NOTE_ID_OR_URL     读取评论正文、昵称、时间、点赞数
          [--cursor CURSOR | --reply-cursor CURSOR --root-comment-id ID]
          [--xsec-token TOKEN]；每次运行只请求一页
  account                    读取账号统计
  publish --title 标题 --body 正文 [--image FILE ... | --video FILE | --audio FILE --cover FILE]
          [--type text|image|video|article|audio] [--submit] [--preview FILE.png]
  types                      查看已发现的类型与验证状态
登录：login --site creator|web（完整评论需要主站web登录）
通用：--profile DIR --cdp http://127.0.0.1:9222 --timeout 60
默认无头运行；--headed 显示窗口；login 始终显示窗口以便扫码。
发布默认保存预览截图并退出；--submit 才提交。text 会生成文字图片后按图文发布。
当前适配基于 2026-10-14 实际页面；真实提交成功尚未验收。`;

async function main() {
  const o = options(process.argv.slice(2));
  if (o.help || !o.command) return console.log(help);
  if (o.command === 'types') return console.log(JSON.stringify({
    image: '图片上传与编辑已实测；最多18张', video: '视频上传至发布前预览已实测',
    text: '本地转成文字图片，上传至发布前预览已实测', article: '长文编辑、排版、生成配图至发布前预览已实测',
    audio: '音频及封面上传至发布前预览已实测；需 --audio 和 --cover，10分钟至2小时，最大1GB',
  }, null, 2));
  if (!['login', 'notes', 'stats', 'account', 'publish','comments'].includes(o.command)) throw Error('未知命令，使用 --help');
  if(o.command==='comments'){
    const note=parseNote(o.id);
    if(!note.token&&!o['xsec-token'])throw Error('请使用带 xsec_token 的笔记链接，或提供 --xsec-token');
    if(o.replies)throw Error('每次只请求一页；请根据输出的 reply_cursor 使用 --reply-cursor 和 --root-comment-id');
    if(o.pages!==1)throw Error('comments 每次只请求一页；请传入输出中的 --cursor 继续');
    if(Boolean(o['reply-cursor'])!==Boolean(o['root-comment-id']))throw Error('--reply-cursor 和 --root-comment-id 必须同时提供');
    if(o.cursor&&o['reply-cursor'])throw Error('--cursor 和 --reply-cursor 不能同时使用');
  }
  if (o.command === 'stats' && !/^[a-f0-9]{24}$/i.test(o.id || '')) throw Error('stats 需要 24 位笔记 ID');
  const draft = o.command === 'publish' ? await publication(o) : null;
  const session = await browserSession(o);
  const { page } = session;
  try {
    if (o.command === 'login') {
      const web=o.site==='web';
      await page.goto(web?'https://www.xiaohongshu.com/explore':ORIGIN + '/login');
      console.error(`请在 Chrome 中完成${web?'小红书主站':'创作平台'}登录。`);
      if(web)await waitUntil(async()=>page.getByRole('link',{name:'我',exact:true}).first().isVisible(),600000,'主站登录等待超时');
      else await page.waitForURL(url => url.origin === ORIGIN && !url.pathname.includes('/login'), { timeout: 600000 });
      console.log(JSON.stringify({ loggedIn: true })); return;
    }
    if(o.command==='comments') {console.log(JSON.stringify(await comments(session,o),null,2));return;}
    if (draft) { console.log(JSON.stringify(await publish(session, draft, o), null, 2)); return; }
    const capture = collect(page, (path, url, response) => o.command === 'notes'
      ? path === '/api/galaxy/v2/creator/note/user/posted' && (() => {
        let tab = url.searchParams.get('tab');
        if (tab === null) { try { tab = response.request().postDataJSON()?.tab; } catch {} }
        return String(tab) === '1';
      })()
      : path.startsWith('/api/galaxy/') && /(?:datacenter|note_detail|latest_note_data)/.test(path));
    const route = o.command === 'notes' ? '/new/note-manager'
      : o.command === 'stats' ? `/statistics/note-detail?noteId=${o.id}` : '/statistics/account';
    await navigate(page, route);
    if (o.command === 'notes') {
      await page.getByText('已发布', { exact: true }).first().click();
      await waitUntil(() => capture.records.length > 0, o.timeout, '没有收到笔记列表响应');
      const readline=await import('node:readline/promises');
      const rl=process.stdin.isTTY?readline.createInterface({input:process.stdin,output:process.stderr}):null;
      try {
        for (let n = 1; n < o.pages; n++) {
          const last=capture.records.at(-1)?.data.data;
          if (last?.page === -1) break;
          if(!rl){console.error('已停止在当前页；需要继续读取笔记时请在交互式终端运行。');break;}
          console.error(`已读取 ${capture.records.length} 页笔记列表。`);
          if((await rl.question('按 Enter 手动加载下一页笔记，输入 q 停止：')).trim().toLowerCase()==='q')break;
          const count = capture.records.length;
          await page.evaluate(() => { const el = document.querySelector('#notes-request'); if (el) el.scrollIntoView(); else window.scrollTo(0, document.body.scrollHeight); });
          try { await waitUntil(() => capture.records.length > count, 5000, '没有更多分页'); } catch { break; }
        }
      } finally { rl?.close(); }
    } else {
      await waitUntil(() => capture.records.length > 0, o.timeout, '没有收到统计响应，请检查账号数据权限');
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }
    console.log(JSON.stringify(await capture.finish(), null, 2));
  } finally { await session.close(); }
}
main().catch(error => { console.error(`xhs: ${error.message}`); process.exitCode = 1; });
