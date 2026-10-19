import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findButtons } from '../src/footer.js';
test('finds actual publish button inside closed shadow root without matching navigation label', () => {
  const button={nodeName:'BUTTON',backendNodeId:42,children:[{nodeName:'SPAN',children:[{nodeName:'#text',nodeValue:'发布'}]}]};
  const root={nodeName:'HTML',children:[{nodeName:'DIV',children:[{nodeValue:'发布笔记'}]}, {nodeName:'X-FOOTER',shadowRoots:[{nodeName:'#document-fragment',shadowRootType:'closed',children:[button]}]}]};
  assert.deepEqual(findButtons(root,'发布'),[button]);
  assert.deepEqual(findButtons(root,'删除'),[]);
});
