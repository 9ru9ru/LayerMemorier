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
      close: cid('Cls '),
      set: cid('setd')
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

  // Visibility changes on the original go into one history step (export and preview).
  function applyVisibilityAs(name, on, off) {
    var hasOn = on && on.length;
    var hasOff = off && off.length;
    if (!hasOn && !hasOff) return;
    pendingVisibility = { on: on || [], off: off || [] };
    try {
      app.activeDocument.suspendHistory(name, 'LM._runVisibility()');
    } finally {
      pendingVisibility = null;
    }
  }

  // Older callers send no output: transparent PNG-24 on the fast path, as before.
  var LEGACY_OUTPUT = {
    format: 'png24', trim: 'none', scale: 100, padding: 0, letterCase: 'keep', overwrite: true,
    png24: { transparency: true, interlaced: false, matte: 'white' }
  };

  function matteRgb(matte) {
    if (matte === 'white') return { r: 255, g: 255, b: 255 };
    if (matte === 'black') return { r: 0, g: 0, b: 0 };
    if (matte === 'gray') return { r: 127, g: 127, b: 127 };
    if (matte === 'background' || matte === 'foreground') {
      var c = (matte === 'background' ? app.backgroundColor : app.foregroundColor).rgb;
      return { r: Math.round(c.red), g: Math.round(c.green), b: Math.round(c.blue) };
    }
    return null;
  }

  function putMatte(d, matte) {
    var c = matteRgb(matte);
    d.putBoolean(cid('Mtt '), c !== null);
    if (c) {
      d.putInteger(cid('MttR'), c.r);
      d.putInteger(cid('MttG'), c.g);
      d.putInteger(cid('MttB'), c.b);
    }
  }

  function runSaveForWeb(d2, file) {
    d2.putBoolean(cid('SHTM'), false);
    d2.putBoolean(cid('SImg'), true);
    d2.putBoolean(cid('SSSO'), false);
    d2.putList(cid('SSLt'), new ActionList());
    d2.putBoolean(cid('DIDr'), false);
    d2.putPath(cid('In  '), file);
    var desc = new ActionDescriptor();
    desc.putObject(cid('Usng'), sid('SaveForWeb'), d2);
    executeAction(cid('Expr'), desc, DialogModes.NO);
  }

  function sfwPng24(file, o) {
    var d2 = new ActionDescriptor();
    d2.putEnumerated(cid('Op  '), cid('SWOp'), cid('OpSa'));
    d2.putEnumerated(cid('Fmt '), cid('IRFm'), cid('PN24'));
    d2.putBoolean(cid('Intr'), o.interlaced);
    d2.putBoolean(cid('Trns'), o.transparency);
    putMatte(d2, o.matte);
    runSaveForWeb(d2, file);
  }

  var PNG8_REDUCTION = { perceptual: 'Prcp', selective: 'Sltv', adaptive: 'Adpt', restrictive: 'Web ',
    blackWhite: 'FlBs', grayscale: 'FlBs', mac: 'FlBs', windows: 'FlBs' };
  var PNG8_PALETTE = { blackWhite: 'Black & White', grayscale: 'Grayscale', mac: 'Mac OS', windows: 'Windows' };
  var DITHER = { none: 'None', diffusion: 'Dfsn', pattern: 'Ptrn', noise: 'BNoi' };

  // Same keys as exportPng8AM in the reference script (Export Layers To Files Fast).
  function sfwPng8(file, o) {
    var d2 = new ActionDescriptor();
    d2.putEnumerated(cid('Op  '), cid('SWOp'), cid('OpSa'));
    d2.putEnumerated(cid('Fmt '), cid('IRFm'), cid('PNG8'));
    d2.putBoolean(cid('Intr'), o.interlaced);
    d2.putEnumerated(cid('RedA'), cid('IRRd'), cid(PNG8_REDUCTION[o.reduction]));
    if (PNG8_PALETTE[o.reduction]) d2.putString(cid('FBPl'), PNG8_PALETTE[o.reduction]);
    d2.putBoolean(cid('RChT'), false);
    d2.putBoolean(cid('RChV'), false);
    d2.putBoolean(cid('AuRd'), false);
    d2.putInteger(cid('NCol'), o.colors);
    d2.putEnumerated(cid('Dthr'), cid('IRDt'), cid(DITHER[o.dither]));
    d2.putInteger(cid('DthA'), o.ditherAmount);
    d2.putInteger(cid('DChS'), 0);
    d2.putInteger(cid('DCUI'), 0);
    d2.putBoolean(cid('DChT'), false);
    d2.putBoolean(cid('DChV'), false);
    d2.putInteger(cid('WebS'), 0);
    d2.putEnumerated(cid('TDth'), cid('IRDt'), cid(DITHER[o.transparencyDither]));
    d2.putInteger(cid('TDtA'), o.transparencyDitherAmount);
    d2.putBoolean(cid('Trns'), o.transparency);
    putMatte(d2, o.matte);
    runSaveForWeb(d2, file);
  }

  function sfwJpg(doc, file, o) {
    var opts = new ExportOptionsSaveForWeb();
    opts.format = SaveDocumentType.JPEG;
    opts.quality = o.quality;
    opts.optimized = o.optimized;
    opts.interlaced = o.progressive;
    opts.includeProfile = o.icc;
    var c = matteRgb(o.matte);
    if (c) {
      var m = new RGBColor();
      m.red = c.r;
      m.green = c.g;
      m.blue = c.b;
      opts.matteColor = m;
    }
    doc.exportDocument(file, ExportType.SAVEFORWEB, opts);
  }

  var JPEG_MATTE = { none: 'NONE', white: 'WHITE', black: 'BLACK', gray: 'SEMIGRAY', background: 'BACKGROUND', foreground: 'FOREGROUND' };

  function saveAsJpg(doc, file, o, ext) {
    var j = new JPEGSaveOptions();
    j.quality = Math.round(o.quality * 12 / 100);
    j.embedColorProfile = o.icc;
    j.matte = MatteType[JPEG_MATTE[o.matte]];
    if (o.progressive) {
      j.formatOptions = FormatOptions.PROGRESSIVE;
      j.scans = 3;
    } else {
      j.formatOptions = o.optimized ? FormatOptions.OPTIMIZEDBASELINE : FormatOptions.STANDARDBASELINE;
    }
    doc.saveAs(file, j, true, ext);
  }

  function extensionCase(o) {
    return o.letterCase === 'upper' ? Extension.UPPERCASE : Extension.LOWERCASE;
  }

  function tooBigForWeb(doc) {
    return doc.width.as('px') > 8192 || doc.height.as('px') > 8192;
  }

  // PNG-24 / PNG-8 / JPG through Save for Web on the active document `doc`,
  // with the 8192px fallbacks of export spec section 5.3.
  function saveWeb(doc, file, o) {
    var big = tooBigForWeb(doc);
    if (o.format === 'png8') {
      if (big) throw new Error('LM_PNG8_TOO_LARGE');
      sfwPng8(file, o.png8);
    } else if (o.format === 'jpg') {
      if (big) saveAsJpg(doc, file, o.jpg, extensionCase(o));
      else sfwJpg(doc, file, o.jpg);
    } else if (big) {
      var p = new PNGSaveOptions();
      p.compression = 6;
      p.interlaced = o.png24.interlaced;
      doc.saveAs(file, p, true, extensionCase(o));
    } else {
      sfwPng24(file, o.png24);
    }
  }

  // Save under a plain temporary name in the target folder and replace the target only
  // after the save succeeded: a failing job keeps the previous export (review I1), and
  // Save for Web never sees the real name (2026-10-02 probe: it turned spaces into hyphens).
  function saveReplacing(target, save) {
    var name = File.decode(target.name);
    var dot = name.lastIndexOf('.');
    var tmp = new File(target.parent.fsName + '/lm_tmp_save' + (dot >= 0 ? name.substring(dot).toLowerCase() : ''));
    var removedTarget = false;
    if (tmp.exists) tmp.remove();
    try {
      save(tmp);
      if (!tmp.exists) throw new Error('save failed, file not found: ' + tmp.fsName);
      if (target.exists) {
        if (!target.remove()) throw new Error('cannot replace the existing file: ' + target.fsName);
        removedTarget = true;
      }
      if (!tmp.rename(name)) throw new Error('rename failed: ' + tmp.fsName + ' -> ' + name);
    } catch (e) {
      // Keep the new file as a recovery copy if the old one is already gone.
      if (!removedTarget && tmp.exists) tmp.remove();
      throw e;
    }
  }

  // Overwrite off: "name (2).ext", "name (3).ext", ... (export spec 5.1 step 2).
  function targetFile(path, overwrite) {
    var f = new File(path);
    if (overwrite || !f.exists) return f;
    var slash = path.lastIndexOf('/');
    var dot = path.lastIndexOf('.');
    var stem = dot > slash ? path.substring(0, dot) : path;
    var ext = dot > slash ? path.substring(dot) : '';
    for (var n = 2; n <= 9999; n++) {
      var c = new File(stem + ' (' + n + ')' + ext);
      if (!c.exists) return c;
    }
    throw new Error('LM_NAME_EXHAUSTED');
  }

  function px(v) {
    return new UnitValue(v, 'px');
  }

  // Content area of the single merged layer of a duplicate; null when empty.
  function contentBounds(d) {
    var b = d.activeLayer.bounds;
    var r = { left: b[0].as('px'), top: b[1].as('px'), right: b[2].as('px'), bottom: b[3].as('px') };
    return (r.right - r.left <= 0 || r.bottom - r.top <= 0) ? null : r;
  }

  function cropTo(d, r) {
    d.crop([px(r.left), px(r.top), px(r.right), px(r.bottom)]);
  }

  // TGA/BMP keep transparency only through an alpha channel. 2026-10-02 probe:
  // a 32-bit TGA saved without one came out opaque white.
  function addAlphaFromTransparency(d) {
    var ch = d.channels.add();
    ch.name = 'Alpha 1';
    try {
      if (d.activeLayer.isBackgroundLayer) {
        d.selection.selectAll();
      } else {
        var ref = new ActionReference();
        ref.putProperty(cid('Chnl'), cid('fsel'));
        var desc = new ActionDescriptor();
        desc.putReference(cid('null'), ref);
        var to = new ActionReference();
        to.putEnumerated(cid('Chnl'), cid('Chnl'), cid('Trsp'));
        desc.putReference(cid('T   '), to);
        executeAction(cid('setd'), desc, DialogModes.NO);
      }
      d.selection.store(ch);
    } catch (e) {
      // Nothing to select (empty layer): the new channel stays black = fully transparent.
    }
    try { d.selection.deselect(); } catch (e2) {}
    d.activeChannels = d.componentChannels;
  }

  var TIFF_ENCODING = { none: 'NONE', lzw: 'TIFFLZW', zip: 'TIFFZIP', jpg: 'JPEG' };

  function saveTif(d, file, o, ext) {
    var t = new TiffSaveOptions();
    t.imageCompression = TIFFEncoding[TIFF_ENCODING[o.compression]];
    if (o.compression === 'jpg') t.jpegQuality = Math.round(o.quality * 12 / 100);
    t.alphaChannels = o.alpha;
    t.transparency = o.transparency;
    t.embedColorProfile = o.icc;
    t.layers = false;
    d.saveAs(file, t, true, ext);
  }

  function saveTga(d, file, o, ext) {
    var alpha = o.depth === 32 && o.alpha;
    if (alpha) addAlphaFromTransparency(d);
    var t = new TargaSaveOptions();
    t.resolution = o.depth === 16 ? TargaBitsPerPixels.SIXTEEN : o.depth === 24 ? TargaBitsPerPixels.TWENTYFOUR : TargaBitsPerPixels.THIRTYTWO;
    t.alphaChannels = alpha;
    t.rleCompression = o.rle;
    d.saveAs(file, t, true, ext);
  }

  function saveBmp(d, file, o, ext) {
    var alpha = o.depth === 32 && o.alpha;
    if (alpha) addAlphaFromTransparency(d);
    var b = new BMPSaveOptions();
    b.depth = o.depth === 16 ? BMPDepthType.SIXTEEN : o.depth === 24 ? BMPDepthType.TWENTYFOUR : BMPDepthType.THIRTYTWO;
    b.alphaChannels = alpha;
    // RLE exists only for 4/8-bit BMP; 32-bit + RLE failed with a "file format module"
    // error (2026-10-02). Our depths are 16/24/32, so it is always off.
    b.rleCompression = false;
    b.flipRowOrder = o.flipRowOrder;
    b.osType = OperatingSystem.WINDOWS;
    d.saveAs(file, b, true, ext);
  }

  function savePsd(d, file, ext) {
    var p = new PhotoshopSaveOptions();
    p.layers = false;
    p.alphaChannels = false;
    d.saveAs(file, p, true, ext);
  }

  function saveByFormat(d, file, o) {
    var ext = extensionCase(o);
    if (o.format === 'tif') return saveTif(d, file, o.tif, ext);
    if (o.format === 'tga') return saveTga(d, file, o.tga, ext);
    if (o.format === 'bmp') return saveBmp(d, file, o.bmp, ext);
    if (o.format === 'psd') return savePsd(d, file, ext);
    return saveWeb(d, file, o);
  }

  // Runs fn(dup) on a merged duplicate of doc in pixel units, then always closes
  // the duplicate and makes doc active again (export spec 5.1 step 4-6).
  function withMergedDuplicate(doc, name, fn) {
    var units = app.preferences.rulerUnits;
    var dup = null;
    app.preferences.rulerUnits = Units.PIXELS;
    try {
      dup = doc.duplicate(name, true);
      return fn(dup);
    } finally {
      if (dup) {
        try { dup.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {}
      }
      app.activeDocument = doc;
      app.preferences.rulerUnits = units;
    }
  }

  function saveCopy(doc, file, o, crop) {
    withMergedDuplicate(doc, 'lm_export_tmp', function (dup) {
      if (crop) {
        cropTo(dup, crop);
      } else if (o.trim === 'each') {
        var b = contentBounds(dup);
        if (!b) throw new Error('LM_EMPTY');
        cropTo(dup, b);
      }
      if (o.scale !== 100) {
        dup.resizeImage(
          px(Math.max(1, Math.round(dup.width.as('px') * o.scale / 100))),
          px(Math.max(1, Math.round(dup.height.as('px') * o.scale / 100))),
          undefined, ResampleMethod.BICUBICSHARPER);
      }
      if (o.padding > 0) {
        dup.resizeCanvas(px(dup.width.as('px') + 2 * o.padding), px(dup.height.as('px') + 2 * o.padding), AnchorPosition.MIDDLECENTER);
      }
      saveByFormat(dup, file, o);
    });
  }

  // The panel names the document it is exporting. If the artist clicked another
  // document tab between two calls, switch back to it instead of touching the other
  // one (layer ids repeat across documents). Review M9.
  function activateExpected(expect) {
    if (!expect) return;
    for (var i = 0; i < app.documents.length; i++) {
      var d = app.documents[i];
      var p = null;
      try { p = d.fullName.fsName; } catch (e) { p = null; }
      var same = expect.path ? (p && normPath(p) === normPath(expect.path)) : (!p && String(d.name) === String(expect.name));
      if (same) {
        if (app.activeDocument !== d) app.activeDocument = d;
        return;
      }
    }
    throw new Error('document closed: panel expected "' + (expect.path || expect.name) + '"');
  }

  // Modal error dialogs (e.g. "the file is locked") would stop the panel and COM until
  // someone clicks OK. With dialogs off the error is thrown and reported for that job only.
  function withoutDialogs(fn) {
    var saved = app.displayDialogs;
    app.displayDialogs = DialogModes.NO;
    try {
      return fn();
    } finally {
      app.displayDialogs = saved;
    }
  }

  // Content area of one variation (export spec 5.2); null when empty.
  LM.measureBounds = wrap(function (a) {
    if (!hasDoc()) throw new Error('no document');
    activateExpected(a.doc);
    var doc = app.activeDocument;
    return withoutDialogs(function () {
      applyVisibilityAs('LayerMemorier export', a.on, a.off);
      return { bounds: withMergedDuplicate(doc, 'lm_measure_tmp', contentBounds) };
    });
  });

  LM.exportBegin = wrap(function (a) {
    if (!hasDoc()) throw new Error('no document');
    activateExpected(a.doc);
    snapshot = [];
    for (var i = 0; i < a.layerIds.length; i++) {
      snapshot.push({ id: a.layerIds[i], visible: visibilityOf(a.layerIds[i]) });
    }
    return { ok: true };
  });

  LM.exportOne = wrap(function (job) {
    if (!hasDoc()) throw new Error('no document');
    activateExpected(job.doc);
    var doc = app.activeDocument;
    var o = job.output || LEGACY_OUTPUT;
    var fast = job.output ? job.fast === true : true;
    return withoutDialogs(function () {
      applyVisibilityAs('LayerMemorier export', job.on, job.off);
      var target = targetFile(job.path, o.overwrite);
      ensureFolder(target.parent);
      saveReplacing(target, function (tmp) {
        if (fast) saveWeb(doc, tmp, o);
        else saveCopy(doc, tmp, o, job.crop || null);
      });
      if (!target.exists) throw new Error('save failed, file not found: ' + target.fsName);
      return { ok: true, path: String(target.fsName).replace(/\\/g, '/') };
    });
  });

  LM.exportEnd = wrap(function (a) {
    if (a) activateExpected(a.doc);
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
    applyVisibilityAs('LayerMemorier \uBBF8\uB9AC\uBCF4\uAE30', a && a.on, a && a.off);
    return { ok: true };
  });

  // ---- panel preview (independent preview spec 5.2) ----

  var previewCleaned = false;

  function previewFolder() {
    var f = new Folder(Folder.temp.fsName + '/LayerMemorier');
    if (!f.exists) f.create();
    return f;
  }

  var PREVIEW_STEP = 'LayerMemorier preview';

  function currentHistoryRef() {
    var r = new ActionReference();
    r.putProperty(cid('HstS'), cid('CrnH'));
    return r;
  }

  // Redo steps the artist could still use: history states after the current one,
  // except a greyed step this preview left behind (fallback in dropPreviewStep).
  // Rendering would throw them away, so refuse instead.
  function hasRedo() {
    var d = executeActionGet(currentHistoryRef());
    var index = d.getInteger(cid('ItmI'));
    var count = d.getInteger(cid('Cnt '));
    for (var i = index + 1; i <= count; i++) {
      var r = new ActionReference();
      r.putIndex(cid('HstS'), i);
      if (executeActionGet(r).getString(cid('Nm  ')) !== PREVIEW_STEP) return true;
    }
    return false;
  }

  // Remove the preview's own history step. Deleting it (when it is the current state)
  // leaves no greyed redo step behind; stepping back to `saved` would leave one.
  // When the preview made no step (nothing to change), the current state is the
  // artist's and must not be deleted.
  function dropPreviewStep(doc, saved) {
    try {
      if (executeActionGet(currentHistoryRef()).getString(cid('Nm  ')) === PREVIEW_STEP) {
        var desc = new ActionDescriptor();
        desc.putReference(cid('null'), currentHistoryRef());
        executeAction(cid('Dlt '), desc, DialogModes.NO);
        return;
      }
    } catch (e) {
      // fall back below
    }
    doc.activeHistoryState = saved;
  }

  // Merged picture of one variation, at most maxSize px on the long side, as a temp PNG.
  // The visibility change is one history step that is deleted afterwards, so the
  // document and its history look untouched.
  LM.renderPreview = wrap(function (a) {
    if (!hasDoc()) throw new Error('no document');
    activateExpected(a.doc);
    var doc = app.activeDocument;
    var started = new Date().getTime();
    var folder = previewFolder();
    if (!previewCleaned) {
      var old = folder.getFiles('preview_*.png');
      for (var i = 0; i < old.length; i++) {
        try { old[i].remove(); } catch (e) {}
      }
      previewCleaned = true;
    }
    if (hasRedo()) throw new Error('LM_REDO_PENDING');
    var file = new File(folder.fsName + '/preview_' + started + '.png');
    var size = null;
    var saved = doc.activeHistoryState;
    withoutDialogs(function () {
      try {
        applyVisibilityAs(PREVIEW_STEP, a.on, a.off);
        withMergedDuplicate(doc, 'lm_preview_tmp', function (dup) {
          var w = dup.width.as('px');
          var h = dup.height.as('px');
          var k = Math.min(1, a.maxSize / Math.max(w, h));
          if (k < 1) {
            dup.resizeImage(px(Math.max(1, Math.round(w * k))), px(Math.max(1, Math.round(h * k))), undefined, ResampleMethod.BICUBICSHARPER);
          }
          sfwPng24(file, { interlaced: false, transparency: true, matte: 'none' });
          size = { width: dup.width.as('px'), height: dup.height.as('px') };
        });
      } finally {
        dropPreviewStep(doc, saved);
      }
    });
    if (!file.exists) throw new Error('preview save failed, file not found: ' + file.fsName);
    return { path: String(file.fsName).replace(/\\/g, '/'), width: size.width, height: size.height, ms: new Date().getTime() - started };
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
