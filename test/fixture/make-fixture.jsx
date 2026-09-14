// Builds the LayerMemorier fixture document. Run via tools/ps-eval.ps1 (host preloaded).
// Returns JSON: {"psdPath": "..."}
(function () {
  var OUT = LM_FIXTURE_OUT; // set by the caller before evalFile, forward slashes
  while (app.documents.length) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
  var doc = app.documents.add(240, 160, 72, 'fixture', NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
  var initial = doc.artLayers[0];

  function fillCell(layer, col, row, r, g, b) {
    doc.activeLayer = layer;
    var x = col * 40, y = row * 40;
    doc.selection.select([[x, y], [x + 40, y], [x + 40, y + 40], [x, y + 40]]);
    var c = new SolidColor(); c.rgb.red = r; c.rgb.green = g; c.rgb.blue = b;
    doc.selection.fill(c);
    doc.selection.deselect();
  }
  function addLayer(name, col, row, r, g, b, parent) {
    var layer = (parent || doc).artLayers.add();
    layer.name = name;
    fillCell(layer, col, row, r, g, b);
    return layer;
  }

  // Layers are added bottom-up so that the panel order (top-down) matches the table in the plan.
  addLayer('BG', 4, 1, 255, 255, 255);
  var h = addLayer('H', 3, 1, 0, 0, 0);
  var g = doc.layerSets.add(); g.name = 'G';
  addLayer('GB', 2, 1, 128, 0, 255, g);
  addLayer('GA', 1, 1, 255, 128, 0, g);
  addLayer('N2', 0, 1, 128, 128, 128);
  addLayer('N1', 5, 0, 255, 0, 255);
  addLayer('B2', 4, 0, 0, 255, 255);
  addLayer('B1', 3, 0, 255, 255, 0);
  addLayer('B0', 2, 0, 0, 0, 255);
  addLayer('A1', 1, 0, 0, 255, 0);
  addLayer('A0', 0, 0, 255, 0, 0);
  h.visible = false;
  initial.remove();

  var file = new File(OUT);
  if (!file.parent.exists) file.parent.create();
  var opts = new PhotoshopSaveOptions();
  doc.saveAs(file, opts, false, Extension.LOWERCASE);
  return JSON.stringify({ psdPath: file.fsName });
})();
