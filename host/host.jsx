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

  // ---- layers (ActionManager) ----

  LM.getLayers = wrap(function () {
    if (!hasDoc()) return [];
    var ref = new ActionReference();
    ref.putEnumerated(cid('Dcmn'), cid('Ordn'), cid('Trgt'));
    var count = executeActionGet(ref).getInteger(cid('NmbL'));
    var from = hasBackground() ? 0 : 1;
    var out = [];
    var stack = [];
    for (var i = count; i >= from; i--) {
      var r = new ActionReference();
      r.putIndex(cid('Lyr '), i);
      var d = executeActionGet(r);
      var section = typeIDToStringID(d.getEnumerationValue(sid('layerSection')));
      if (section === 'layerSectionEnd') { stack.pop(); continue; }
      var item = {
        id: d.getInteger(sid('layerID')),
        name: d.getString(cid('Nm  ')),
        kind: section === 'layerSectionStart' ? 'group' : 'layer',
        visible: d.getBoolean(cid('Vsbl')),
        depth: stack.length,
        parentId: stack.length ? stack[stack.length - 1] : null,
        color: typeIDToStringID(d.getEnumerationValue(cid('Clr ')))
      };
      out.push(item);
      if (item.kind === 'group') stack.push(item.id);
    }
    return out;
  });

  LM.getSelectedLayerIds = wrap(function () {
    if (!hasDoc()) return [];
    var ref = new ActionReference();
    ref.putProperty(cid('Prpr'), sid('targetLayers'));
    ref.putEnumerated(cid('Dcmn'), cid('Ordn'), cid('Trgt'));
    var desc = executeActionGet(ref);
    if (!desc.hasKey(sid('targetLayers'))) return [];
    var list = desc.getList(sid('targetLayers'));
    var offset = hasBackground() ? 0 : 1;
    var ids = [];
    for (var i = 0; i < list.count; i++) {
      var idx = list.getReference(i).getIndex() + offset;
      var r = new ActionReference();
      r.putIndex(cid('Lyr '), idx);
      ids.push(executeActionGet(r).getInteger(sid('layerID')));
    }
    return ids;
  });

  LM.selectLayers = wrap(function (ids) {
    if (!hasDoc() || !ids || !ids.length) return { ok: true };
    for (var i = 0; i < ids.length; i++) {
      var ref = new ActionReference();
      ref.putIdentifier(cid('Lyr '), ids[i]);
      var desc = new ActionDescriptor();
      desc.putReference(cid('null'), ref);
      if (i > 0) desc.putEnumerated(sid('selectionModifier'), sid('selectionModifierType'), sid('addToSelection'));
      desc.putBoolean(cid('MkVs'), false);
      executeAction(cid('slct'), desc, DialogModes.NO);
    }
    return { ok: true };
  });

  LM.setLayerColor = wrap(function (a) {
    if (!hasDoc()) throw new Error('no document');
    // The 'setd' action ignores a putIdentifier target for the 'Clr ' (layer
    // color tag) property and always applies to the active layer instead, so
    // the layer must be selected first and the set targeted at Ordn/Trgt.
    var sref = new ActionReference();
    sref.putIdentifier(cid('Lyr '), a.id);
    var sdesc = new ActionDescriptor();
    sdesc.putReference(cid('null'), sref);
    executeAction(cid('slct'), sdesc, DialogModes.NO);

    var ref = new ActionReference();
    ref.putEnumerated(cid('Lyr '), cid('Ordn'), cid('Trgt'));
    var desc = new ActionDescriptor();
    desc.putReference(cid('null'), ref);
    var props = new ActionDescriptor();
    props.putEnumerated(cid('Clr '), cid('Clr '), sid(a.color));
    desc.putObject(cid('T   '), cid('Lyr '), props);
    executeAction(cid('setd'), desc, DialogModes.NO);
    return { ok: true };
  });

  // ---- document data in XMP ----

  var NS = 'http://layermemorier.local/1.0/';

  function xmpLib() {
    if (ExternalObject.AdobeXMPScript === undefined) {
      ExternalObject.AdobeXMPScript = new ExternalObject('lib:AdobeXMPScript');
    }
    XMPMeta.registerNamespace(NS, 'lm');
  }

  function readXmp() {
    var raw = app.activeDocument.xmpMetadata.rawData;
    return (raw && raw.length) ? new XMPMeta(raw) : new XMPMeta();
  }

  LM.readDocData = wrap(function () {
    if (!hasDoc()) return null;
    xmpLib();
    var prop = readXmp().getProperty(NS, 'data');
    if (!prop || !prop.value) return null;
    return String(prop.value);
  });

  LM.writeDocData = wrap(function (data) {
    if (!hasDoc()) throw new Error('no document');
    xmpLib();
    var xmp = readXmp();
    xmp.setProperty(NS, 'data', JSON.stringify(data));
    app.activeDocument.xmpMetadata.rawData = xmp.serialize();
    return { ok: true };
  });

  // ---- export ----

  var snapshot = null;
  var currentJob = null;

  function visibilityOf(id) {
    var r = new ActionReference();
    r.putIdentifier(cid('Lyr '), id);
    return executeActionGet(r).getBoolean(cid('Vsbl'));
  }

  function setVisibleMany(ids, on) {
    if (!ids || !ids.length) return;
    var list = new ActionList();
    for (var i = 0; i < ids.length; i++) {
      var r = new ActionReference();
      r.putIdentifier(cid('Lyr '), ids[i]);
      list.putReference(r);
    }
    var desc = new ActionDescriptor();
    desc.putList(cid('null'), list);
    executeAction(cid(on ? 'Shw ' : 'Hd  '), desc, DialogModes.NO);
  }

  function ensureFolder(folder) {
    if (!folder || folder.exists) return;
    ensureFolder(folder.parent);
    if (!folder.create()) throw new Error('cannot create folder: ' + folder.fsName);
  }

  function saveForWebPng24(file) {
    var desc = new ActionDescriptor();
    var d2 = new ActionDescriptor();
    d2.putEnumerated(cid('Op  '), cid('SWOp'), cid('OpSa'));
    d2.putEnumerated(cid('Fmt '), cid('IRFm'), cid('PN24'));
    d2.putBoolean(cid('Intr'), false);
    d2.putBoolean(cid('Trns'), true);
    d2.putBoolean(cid('Mtt '), true);
    d2.putInteger(cid('MttR'), 255);
    d2.putInteger(cid('MttG'), 255);
    d2.putInteger(cid('MttB'), 255);
    d2.putBoolean(cid('SHTM'), false);
    d2.putBoolean(cid('SImg'), true);
    d2.putBoolean(cid('SSSO'), false);
    d2.putList(cid('SSLt'), new ActionList());
    d2.putBoolean(cid('DIDr'), false);
    d2.putPath(cid('In  '), file);
    desc.putObject(cid('Usng'), sid('SaveForWeb'), d2);
    executeAction(cid('Expr'), desc, DialogModes.NO);
  }

  function savePng(target) {
    var doc = app.activeDocument;
    if (doc.width.as('px') > 8192 || doc.height.as('px') > 8192) {
      var opts = new PNGSaveOptions();
      opts.compression = 6;
      opts.interlaced = false;
      doc.saveAs(target, opts, true, Extension.LOWERCASE);
      return;
    }
    if (target.exists) target.remove();
    saveForWebPng24(target);
  }

  LM._runJob = function () {
    var job = currentJob;
    setVisibleMany(job.on, true);
    setVisibleMany(job.off, false);
    var target = new File(job.path);
    ensureFolder(target.parent);
    savePng(target);
  };

  LM.exportBegin = wrap(function (a) {
    if (!hasDoc()) throw new Error('no document');
    snapshot = [];
    for (var i = 0; i < a.layerIds.length; i++) {
      snapshot.push({ id: a.layerIds[i], visible: visibilityOf(a.layerIds[i]) });
    }
    return { ok: true };
  });

  LM.exportOne = wrap(function (job) {
    if (!hasDoc()) throw new Error('no document');
    currentJob = job;
    try {
      app.activeDocument.suspendHistory('LayerMemorier export', 'LM._runJob()');
    } finally {
      currentJob = null;
    }
    return { ok: true };
  });

  LM.exportEnd = wrap(function () {
    if (!snapshot) return { ok: true };
    var on = [], off = [];
    for (var i = 0; i < snapshot.length; i++) {
      (snapshot[i].visible ? on : off).push(snapshot[i].id);
    }
    setVisibleMany(on, true);
    setVisibleMany(off, false);
    snapshot = null;
    return { ok: true };
  });
})();

'LM loaded';
