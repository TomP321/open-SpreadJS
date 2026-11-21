// Plain browser JavaScript — no bundler, no modules. Everything comes from
// the window.GC global that the script tags above establish (docs/MIGRATION.md § 2).
(function () {
  'use strict';

  var host = document.getElementById('sheet');
  var workbook = new GC.Spread.Sheets.Workbook(host, { sheetCount: 1 });
  var sheet = workbook.getActiveSheet();

  sheet.suspendPaint();
  sheet.name('Script');
  sheet.setColumnWidth(0, 150);
  sheet.setColumnWidth(1, 110);
  sheet.setValue(0, 0, 'Region');
  sheet.setValue(0, 1, 'Units');
  sheet.setValue(1, 0, 'North');
  sheet.setValue(1, 1, 1200);
  sheet.setValue(2, 0, 'South');
  sheet.setValue(2, 1, 900);
  sheet.setValue(3, 0, 'West');
  sheet.setValue(3, 1, 1530);
  sheet.setValue(4, 0, 'Total');
  sheet.setFormula(4, 1, '=SUM(B2:B4)');
  sheet.setFormatter(1, 1, '#,##0');
  sheet.setFormatter(4, 1, '#,##0');
  var style = new GC.Spread.Sheets.Style();
  style.font = 'bold 13px sans-serif';
  sheet.setStyle(4, 0, style);
  sheet.setStyle(4, 1, style);
  sheet.charts.add('UnitsChart', GC.Spread.Sheets.Charts.ChartType.columnClustered, 420, 8, 460, 280, 'A1:B4');
  sheet.resumePaint();

  // The IO plugin (second script tag) patched Workbook.prototype.import/export.
  var status = document.getElementById('status');
  document.getElementById('export').addEventListener('click', function () {
    workbook.export(
      function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'script-tag-umd.xlsx';
        a.click();
        URL.revokeObjectURL(url);
        status.textContent = 'exported';
      },
      function (error) {
        status.textContent = 'export failed: ' + error;
      },
      { fileType: GC.Spread.Sheets.FileType.excel },
    );
  });
  document.getElementById('import').addEventListener('change', function (event) {
    var file = event.target.files[0];
    if (!file) return;
    workbook.import(
      file,
      function () {
        status.textContent = 'imported ' + file.name;
      },
      function (error) {
        status.textContent = 'import failed: ' + error;
      },
      { fileType: GC.Spread.Sheets.FileType.excel },
    );
  });
})();
