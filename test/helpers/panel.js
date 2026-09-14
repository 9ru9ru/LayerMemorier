'use strict';
const fs = require('fs');
const path = require('path');
const CDP = require('chrome-remote-interface');

const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(ROOT, 'test', 'out', 'shots');

async function connect(port = 8092) {
  let targets;
  try {
    targets = await CDP.List({ port });
  } catch (e) {
    throw new Error('panel not reachable on port ' + port + ' (is Photoshop open with the panel loaded?): ' + e.message);
  }
  const target = targets.find(t => /index\.html/.test(t.url)) || targets[0];
  if (!target) throw new Error('panel target not found on port ' + port + ' (is the panel open in Photoshop?)');
  const client = await CDP({ port, target });
  try {
    await client.Page.enable();
    await client.Runtime.enable();
  } catch (e) {
    await client.close();
    throw e;
  }
  return {
    async eval(expression, timeoutMs = 20000) {
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('panel eval timed out after ' + timeoutMs + 'ms: ' + expression.slice(0, 100)));
        }, timeoutMs);
      });
      try {
        const r = await Promise.race([
          client.Runtime.evaluate({ expression, returnByValue: true, awaitPromise: true }),
          timeout,
        ]);
        if (r.exceptionDetails) {
          const ex = r.exceptionDetails.exception;
          throw new Error('panel eval failed: ' + (ex && ex.description ? ex.description : r.exceptionDetails.text));
        }
        return r.result.value;
      } finally {
        clearTimeout(timer);
      }
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
