import { test } from 'node:test';
import assert from 'node:assert/strict';
import { options, publication } from '../src/options.js';

test('keeps repeated images and explicit submission separate', () => {
  const o = options(['publish', '--image', 'a.png', '--image', 'b.png', '--submit']);
  assert.deepEqual(o.image, ['a.png', 'b.png']);
  assert.equal(o.submit, true);
  assert.equal(options(['publish']).submit, undefined);
});
test('rejects invalid timeout and pagination', () => {
  for (const args of [['--timeout', 'NaN'], ['--timeout', '-1'], ['--pages', '1.5'], ['--pages', '0']]) assert.throws(() => options(args));
});
test('defaults to headless except interactive login; allows explicit visible debugging',()=>{
  for(const command of ['notes','stats','comments','account','publish'])assert.equal(options([command]).headless,true);
  assert.equal(options(['login']).headless,false);
  assert.equal(options(['notes','--headed']).headless,false);
  assert.equal(options(['notes','--headless']).headless,true);
  assert.throws(()=>options(['login','--headless']),/扫码/);
  assert.throws(()=>options(['notes','--headed','--headless']),/不能同时/);
});
test('text inference preserves unicode', async () => {
  const draft = await publication({ title: '测试', body: '你好🌍' });
  assert.equal(draft.type, 'text'); assert.equal(draft.body, '你好🌍');
});
test('rejects ambiguous or unsupported publishing input before opening browser', async () => {
  for (const o of [
    { type: 'audio' }, { type: 'image' }, { type: 'video', video: 'a.mp4', image: ['a.png'] },
    { type: 'audio', audio: 'a.mp3', cover:'a.png', video:'a.mp4' },
    { body:'字'.repeat(1001) }, { image:Array(19).fill('a.png') },
    { type: 'text', image: ['a.png'] }, { body: '', title: '' },
    { body: 'x', 'body-file': 'a.txt' },
  ]) await assert.rejects(publication({ title: '测试', body: '正文', ...o }));
});
