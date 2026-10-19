import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { stat, readFile } from 'node:fs/promises';

export function options(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    help: { type: 'boolean', short: 'h' }, title: { type: 'string' },
    body: { type: 'string' }, 'body-file': { type: 'string' },
    image: { type: 'string', multiple: true }, video: { type: 'string' },
    audio: { type: 'string' }, cover: { type: 'string' },
    type: { type: 'string' }, submit: { type: 'boolean' },
    cdp: { type: 'string' }, profile: { type: 'string' },
    headed:{type:'boolean'},headless:{type:'boolean'},preview:{type:'string'},
    site: {type:'string',default:'creator'}, 'xsec-token':{type:'string'}, replies:{type:'boolean'},
    cursor:{type:'string'},'reply-cursor':{type:'string'},'root-comment-id':{type:'string'},
    timeout: { type: 'string', default: '60' }, pages: { type: 'string', default: '1' },
  }});
  const timeout = Number(values.timeout) * 1000;
  const pages = Number(values.pages);
  const command=positionals[0];
  if(values.headed&&values.headless)throw Error('--headed 和 --headless 不能同时使用');
  if(command==='login'&&values.headless)throw Error('login 需要可见浏览器扫码；其他命令默认无头运行');
  if(!['creator','web'].includes(values.site))throw Error('--site 必须为 creator 或 web');
  if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 600000) throw Error('--timeout 必须为 1–600 秒');
  if (!Number.isInteger(pages) || pages < 1 || pages > 100) throw Error('--pages 必须为 1–100');
  return { ...values,headless:command!=='login'&&!values.headed,timeout,pages,command,id:positionals[1] };
}

export async function publication(o) {
  if (o.body !== undefined && o['body-file']) throw Error('--body 和 --body-file 只能选一个');
  const body = o['body-file'] ? await readFile(o['body-file'], 'utf8') : o.body || '';
  const type = o.type || (o.audio ? 'audio' : o.video ? 'video' : o.image?.length ? 'image' : 'text');
  if (!['image', 'video', 'text', 'article', 'audio'].includes(type)) throw Error('类型仅支持 image/video/text/article/audio');
  if (!o.title?.trim() || !body.trim()) throw Error('请提供 --title 和 --body/--body-file');
  if (type !== 'article' && [...o.title].length > 20) throw Error('标题请限制在 20 字以内');
  if (type !== 'article' && [...body].length > 1000) throw Error('正文请限制在 1000 字以内；长文使用 --type article');
  if (type === 'image' && (!o.image?.length || o.video || o.audio)) throw Error('图文必须有 --image，不能混合其他媒体');
  if (o.image?.length > 18) throw Error('图文最多 18 张图片');
  if (type === 'video' && (!o.video || o.image?.length || o.audio)) throw Error('视频必须有 --video，不能混合其他媒体');
  if (type === 'audio' && (!o.audio || !o.cover || o.image?.length || o.video)) throw Error('播客必须有 --audio 和 --cover，不能混合其他媒体');
  if (o.cover && type !== 'audio') throw Error('--cover 当前仅用于播客封面');
  if (['text', 'article'].includes(type) && (o.image?.length || o.video || o.audio)) throw Error('文字类型不能同时指定媒体');
  const files = (type === 'audio' ? [o.audio, o.cover] : type === 'video' ? [o.video] : o.image || []).map(x => resolve(x));
  for (const file of files) if (!(await stat(file)).isFile()) throw Error(`不是文件: ${file}`);
  return { type, title: o.title, body, files };
}
