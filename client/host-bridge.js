// evalScript 래퍼. 모든 호스트 호출은 여기를 거친다 (spec §7).
const LMHost = (() => {
  const cs = new CSInterface();
  const extPath = cs.getSystemPath(SystemPath.EXTENSION).replace(/\\/g, '/');

  function raw(script) {
    return new Promise(resolve => cs.evalScript(script, resolve));
  }

  function parse(fn, r) {
    if (r === 'EvalScript error.') throw new Error(fn + ': host script error');
    if (r === undefined || r === '' || r === 'undefined' || r === 'null') return null;
    let v;
    try { v = JSON.parse(r); } catch (e) { throw new Error(fn + ': bad host result: ' + String(r).slice(0, 200)); }
    if (v && typeof v === 'object' && v.error) throw new Error(fn + ': ' + v.error);
    return v;
  }

  async function load() {
    const r = await raw(`$.evalFile(File(${JSON.stringify(extPath + '/host/host.jsx')}))`);
    if (r !== 'LM loaded') throw new Error('host.jsx load failed: ' + r);
    return parse('ping', await raw('LM.ping()'));
  }

  function call(fn, arg) {
    const script = arg === undefined ? `LM.${fn}()` : `LM.${fn}(${JSON.stringify(JSON.stringify(arg))})`;
    return raw(script).then(r => parse(fn, r));
  }

  async function onEvents(handler) {
    const ids = await call('eventIds');
    const ev = new CSEvent('com.adobe.PhotoshopRegisterEvent', 'APPLICATION');
    ev.extensionId = cs.getExtensionID();
    ev.data = Object.keys(ids).map(k => ids[k]).join(',');
    cs.dispatchEvent(ev);
    cs.addEventListener('com.adobe.PhotoshopJSONCallback' + cs.getExtensionID(), handler);
  }

  return { cs, extPath, load, call, onEvents };
})();
