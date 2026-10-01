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
        // A lone Background layer has no 'Clr ' key; reading it threw and broke the whole list.
        color: d.hasKey(cid('Clr ')) ? typeIDToStringID(d.getEnumerationValue(cid('Clr '))) : 'none'
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

  function normPath(p) { return String(p).replace(/\\/g, '/').toLowerCase(); }

  // Guard for the write path: the panel says which document it believes it is
  // writing to. Without this a stale panel view (document switched inside the
  // 200ms debounce, or a failed refresh) would replace document B's lm:data
  // with document A's combos, which are keyed to A's layer ids.
  function checkExpectedDoc(expect) {
    var d = app.activeDocument;
    var p = null;
    try { p = d.fullName.fsName; } catch (e) { p = null; }
    if (expect.path) {
      if (p && normPath(p) === normPath(expect.path)) return;
      throw new Error('active document changed: panel expected "' + expect.path + '" but Photoshop has "' + (p ? p : d.name) + '"');
    }
    if (expect.name && String(expect.name) !== String(d.name)) {
      throw new Error('active document changed: panel expected "' + expect.name + '" but Photoshop has "' + d.name + '"');
    }
  }

  LM.writeDocData = wrap(function (a) {
    if (!hasDoc()) throw new Error('no document');
    // Two accepted shapes: the plain document data, or the envelope
    // { doc: {name, path}, data: {...} } the panel sends. Only the stored
    // "data" part ever reaches XMP, so readDocData is unaffected.
    var data = a;
    if (a && a.doc && a.data) {
      checkExpectedDoc(a.doc);
      data = a.data;
    }
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

  // Pre-flight for the export tab (spec section 9): create the output folder
  // once and prove it is writable, so a bad path fails with one message before
  // any job starts instead of once per variation.
  LM.ensureDestination = wrap(function (a) {
    if (!a || !a.path) throw new Error('no destination path');
    var folder = new Folder(a.path);
    ensureFolder(folder);
    var probe = new File(folder.fsName + '/lm_write_test.tmp');
    if (!probe.open('w')) throw new Error('cannot write in folder: ' + folder.fsName);
    probe.close();
    probe.remove();
    return { ok: true };
  });

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
      if (!target.exists) throw new Error('save failed, file not found: ' + target.fsName);
      return;
    }
    if (target.exists) target.remove();
    saveForWebPng24(target);
    if (!target.exists) throw new Error('save failed, file not found: ' + target.fsName);
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

  // ---- preview (combos spec section 6.3) ----

  var pendingVisibility = null;

  LM._runVisibility = function () {
    setVisibleMany(pendingVisibility.on, true);
    setVisibleMany(pendingVisibility.off, false);
  };

  // One history step per call so the artist can step back over a preview.
  // History name is "LayerMemorier <preview in Korean>", escaped to keep this file ASCII.
  LM.applyVisibility = wrap(function (a) {
    if (!hasDoc()) throw new Error('no document');
    // Same guard as writeDocData: layer ids repeat across documents, so a panel
    // that still believes another document is active must not touch this one.
    if (a && a.doc) checkExpectedDoc(a.doc);
    var hasOn = a && a.on && a.on.length;
    var hasOff = a && a.off && a.off.length;
    if (!hasOn && !hasOff) return { ok: true };
    pendingVisibility = { on: a.on || [], off: a.off || [] };
    try {
      app.activeDocument.suspendHistory('LayerMemorier \uBBF8\uB9AC\uBCF4\uAE30', 'LM._runVisibility()');
    } finally {
      pendingVisibility = null;
    }
    return { ok: true };
  });

  // Keys match the panel's docKey: full path when saved, otherwise the name.
  LM.getOpenDocKeys = wrap(function () {
    var keys = [];
    for (var i = 0; i < app.documents.length; i++) {
      var d = app.documents[i];
      var p = null;
      try { p = d.fullName.fsName; } catch (e) { p = null; }
      keys.push(p || d.name);
    }
    return keys;
  });
})();

'LM loaded';
