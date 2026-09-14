'use strict';
const fs = require('fs');
const path = require('path');
const CDP = require('chrome-remote-interface');

const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(ROOT, 'test', 'out', 'shots');

async function connect(port = 8092) {
  const targets = await CDP.List({ port });
  const target = targets.find(t => /index\.html/.test(t.url)) || targets[0];
  if (!target) throw new Error('panel target not found on port ' + port + ' (is the panel open in Photoshop?)');
  const client = await CDP({ port, target });
  await client.Page.enable();
  await client.Runtime.enable();
  return {
    async eval(expression) {
      const r = await client.Runtime.evaluate({ expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        const ex = r.exceptionDetails.exception;
        throw new Error('panel eval failed: ' + (ex && ex.description ? ex.description : r.exceptionDetails.text));
      }
      return r.result.value;
    },
    async shot(label) {
      fs.mkdirSync(SHOTS, { recursive: true });
      const { data } = await client.Page.captureScreenshot({ format: 'png' });
      const file = path.join(SHOTS, label + '.png');
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    async reload(waitMs = 1500) {
      await client.Page.reload();
      await new Promise(r => setTimeout(r, waitMs));
    },
    close: () => client.close(),
  };
}

module.exports = { connect, SHOTS };
