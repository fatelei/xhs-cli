import { waitUntil } from './browser.js';

// The platform renders its footer into a closed shadow root. CDP can inspect it
// without replacing components or altering the application's publishing logic.
export function findButtons(root, label) {
  const result = [];
  const children = node => [...node.children || [], ...node.shadowRoots || []];
  const text = node => (node.nodeValue || '') + children(node).map(text).join('');
  function visit(node) {
    if (node.nodeName === 'BUTTON' && text(node).trim() === label) result.push(node);
    for (const child of children(node)) visit(child);
  }
  visit(root); return result;
}

export async function footerButton(context, page, label, timeout) {
  const cdp = await context.newCDPSession(page);
  let node;
  await waitUntil(async () => {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const matches = findButtons(root, label);
    if (matches.length > 1) throw Error(`${label}按钮不唯一，请检查页面`);
    node = matches[0]; return !!node;
  }, timeout, `未找到${label}按钮`);
  return {
    async isEnabled() {
      const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: node.backendNodeId });
      try {
        const { result, exceptionDetails } = await cdp.send('Runtime.callFunctionOn', {
          objectId: object.objectId, returnByValue: true,
          functionDeclaration: `function() {const r=this.getBoundingClientRect();return this.isConnected && !this.disabled && this.getAttribute('aria-disabled')!=='true' && this.getAttribute('aria-busy')!=='true' && r.width>0 && r.height>0;}`,
        });
        if (exceptionDetails) throw Error('无法读取发布按钮状态');
        return result.value === true;
      } finally { await cdp.send('Runtime.releaseObject', { objectId: object.objectId }); }
    },
    async click() {
      if (!await this.isEnabled()) throw Error('发布按钮尚未就绪');
      await cdp.send('DOM.scrollIntoViewIfNeeded', { backendNodeId: node.backendNodeId });
      const { model } = await cdp.send('DOM.getBoxModel', { backendNodeId: node.backendNodeId });
      const q = model.content;
      const x = (q[0] + q[2] + q[4] + q[6]) / 4;
      const y = (q[1] + q[3] + q[5] + q[7]) / 4;
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    },
  };
}
