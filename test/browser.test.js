import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collect } from '../src/browser.js';

const response = (host, data, status = 200) => ({
  url: () => `https://${host}/api/galaxy/test`, json: async () => data,
  ok: () => status === 200, status: () => status,
});
test('capture ignores other origins and reports partial errors', async () => {
  const page = new EventEmitter(), c = collect(page, () => true);
  page.emit('response', response('example.com', { private: 'ignore' }));
  page.emit('response', response('creator.xiaohongshu.com', { code: 0, data: { views: 10 } }));
  page.emit('response', response('creator.xiaohongshu.com', { code: -1, message: 'no permission' }));
  const result = await c.finish();
  assert.equal(result.records.length, 1); assert.equal(result.errors.length, 1);
  assert.equal(page.listenerCount('response'), 0);
});
test('an expired login or malformed response is never reported as successful data', async () => {
  const page = new EventEmitter(), c = collect(page, () => true);
  page.emit('response', response('creator.xiaohongshu.com', { code: -100, message: 'login required' }, 401));
  await assert.rejects(c.finish(), /login required/);
});
test('repeated application requests do not duplicate a notes page', async()=>{
  const page=new EventEmitter(),c=collect(page,()=>true);
  for(const ids of [['a','b'],['a','b'],['c']]) {
    const r=response('creator.xiaohongshu.com',{code:0,data:{page:ids[0]==='a'?1:-1,notes:ids.map(id=>({id}))}});
    r.url=()=> 'https://creator.xiaohongshu.com/api/galaxy/v2/creator/note/user/posted';
    page.emit('response',r);
  }
  assert.equal((await c.finish()).records.length,2);
});
