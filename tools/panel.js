'use strict';
// 사용법: node tools/panel.js shot <label> | node tools/panel.js eval "<js>" | node tools/panel.js reload
const { connect } = require('../test/helpers/panel');

(async () => {
  const [cmd, arg] = process.argv.slice(2);
  const p = await connect();
  try {
    if (cmd === 'shot') console.log(await p.shot(arg || 'panel'));
    else if (cmd === 'eval') console.log(JSON.stringify(await p.eval(arg), null, 2));
    else if (cmd === 'reload') { await p.reload(); console.log('reloaded'); }
    else console.log('usage: shot <label> | eval "<js>" | reload');
  } finally {
    p.close();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
