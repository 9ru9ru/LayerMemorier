// LayerMemorier host script (ExtendScript, ES3, ASCII only).
// Every LM.* function takes a JSON string (or nothing) and returns a JSON string.
//@include "json2.js"

var LM = LM || {};

(function () {
  function cid(s) { return app.charIDToTypeID(s); }
  function sid(s) { return app.stringIDToTypeID(s); }

  function fail(e) {
    var msg = (e && e.message) ? e.message : String(e);
    if (e && e.line) msg += ' (line ' + e.line + ')';
    return JSON.stringify({ error: msg });
  }

  // wrap(fn): parse JSON arg, call fn, stringify result. Strings are returned as-is.
  function wrap(fn) {
    return function (json) {
      try {
        var arg = (json === undefined || json === null || json === '') ? undefined : JSON.parse(json);
        var r = fn(arg);
        if (typeof r === 'string') return r;
        return JSON.stringify(r === undefined ? null : r);
      } catch (e) {
        return fail(e);
      }
    };
  }

  function hasDoc() { return app.documents.length > 0; }
  function hasBackground() {
    try { return app.activeDocument.backgroundLayer != null; } catch (e) { return false; }
  }

  LM._cid = cid;
  LM._sid = sid;
  LM._wrap = wrap;
  LM._hasDoc = hasDoc;
  LM._hasBackground = hasBackground;

  LM.ping = wrap(function () {
    return { pong: true, version: app.version };
  });

  LM.getDocInfo = wrap(function () {
    if (!hasDoc()) return null;
    var d = app.activeDocument;
    var p = null;
    try { p = d.fullName.fsName; } catch (e) { p = null; }
    return {
      name: d.name,
      path: p,
      width: d.width.as('px'),
      height: d.height.as('px'),
      saved: d.saved
    };
  });

  LM.eventIds = wrap(function () {
    return {
      select: cid('slct'),
      make: cid('Mk  '),
      del: cid('Dlt '),
      show: cid('Shw '),
      hide: cid('Hd  '),
      move: cid('move'),
      docActivate: sid('documentAfterActivate'),
      close: cid('Cls ')
    };
  });
})();

'LM loaded';
