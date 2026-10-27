// DEMO input for the Alerts page. In production each item is the HTML body that SQL Server (Database Mail style) produces
// for one alert; `subject` is the mail subject. The page parses the first <table> and the <h1>/<h2> text, so any similar HTML works.
(function () {
  function mk(h1, h2, heads, rows) {
    return '<html><body><h1>' + h1 + '</h1>' + (h2 ? '<h2>' + h2 + '</h2>' : '') +
      '<table border="0" cellpadding="3"><tr>' + heads.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></body></html>';
  }
  var INV = ['TYPE', 'DEPT', 'JOB NO', 'INV. NO', 'INV. DATE', 'INV. AMT.', 'BY USER'];
  var unbill = [
    ['AF', 'EX', 'AAE24010001', 'INAAE24010011', '10-01-2024', '166,108.94', 'TANAPONG'],
    ['AF', 'EX', 'AAE25060027', 'INAAE25070008', '11-07-2025', '144,497.08', 'AILADA'],
    ['AF', 'EX', 'PAE25090005', 'INAAE25100028', '14-11-2025', '300,056.80', 'KRONGKARN']
  ];
  window.AF_ALERT_HTML = [
    { file: 'alert_unbill.html', subject: 'Un-Bill Placement Invoice Listing',
      html: mk('Invoice ที่ออกเกิน <span>7</span> วัน , สถานะ : ยังไม่วางบิล', '(เฉพาะ Invoice ที่มีเครดิต)', INV, unbill) },
    { file: 'alert_unappoint.html', subject: 'Un-Appoint Invoice Listing',
      html: mk('Invoice ที่ออกเกิน <span>7</span> วัน , สถานะ : ยังไม่นัดรับชำระ', '(ไม่มี Appoint Date)', INV, unbill.concat([
        ['AF', 'EX', 'PAE25120003', 'INAAE25120017', '16-12-2025', '1,484.00', 'SIRISIN'],
        ['AF', 'EX', 'PAE25120002', 'INAAE25120018', '16-12-2025', '1,484.00', 'SIRISIN']])) },
    { file: 'alert_cash.html', subject: 'Invoice เงินสด : ที่ค้างชำระเกิน 3 วัน',
      html: mk('Invoice เงินสด : ที่ค้างชำระเกิน <span>3</span> วัน', '(เงินสด : คือไม่ให้ credit)',
        ['TYPE', 'DEPT', 'JOB NO', 'INV. NO', 'INV. DATE', 'TOTAL DAYS', 'INV. AMT.', 'BY USER'], [
        ['AF', 'IM', 'AI26010031', 'INAI26010053', '23-01-2026', '18', '18,924.78', 'KAMOLCHANOK'],
        ['SF', 'EX', 'ASE20120950', 'INASE20121532', '31-12-2020', '1867', '3,103.00', 'BOONYAPORN'],
        ['SF', 'EX', 'PSE21080090', 'INASE21080277', '07-08-2021', '1648', '2,925.00', 'SIRADA'],
        ['SF', 'EX', 'PSE21070108', 'INASE21080278', '07-08-2021', '1648', '1,830.00', 'SIRADA'],
        ['SF', 'EX', 'PSE21070107', 'INASE21080279', '07-08-2021', '1648', '1,830.00', 'SIRADA'],
        ['SF', 'EX', 'PSE21070106', 'INASE21080280', '07-08-2021', '1648', '1,830.00', 'SIRADA']]) },
    { file: 'alert_deposit.html', subject: 'Job ค้างรับคืนค่า Deposit',
      html: mk('Job ค้างรับคืนค่า <span>Deposit</span> เฉพาะที่จ่ายแล้วเกิน <span>15</span> วัน', '',
        ['JOBNO', 'INV. NUMBER', 'INV. DATE', 'AMOUNT', 'USER', 'REMARK'], [
        ['CI26010330', 'VICI26010751', '23-01-2026', '1,500.00', 'SONGPORN', ''],
        ['CI26010267', 'VICI26010680', '21-01-2026', '10,000.00', 'PREEYAPORN', ''],
        ['CI26010265', 'VICI26010676', '21-01-2026', '10,000.00', 'PREEYAPORN', ''],
        ['CI26010266', 'VICI26010678', '21-01-2026', '10,000.00', 'PREEYAPORN', ''],
        ['CI26010219', 'VICI26010464', '16-01-2026', '2,000.00', 'PREEYAPORN', ''],
        ['CI26010118', 'VICI26010367', '14-01-2026', '8,000.00', 'PREEYAPORN', '']]) },
    { file: 'alert_paid_noinv.html', subject: 'Paid job with no invoice',
      html: mk('Job Period more than 3 days : PV has been issue but no billing has been issued yet.', '',
        ['TYPE', 'DEPT', 'JOBNO', 'PERIOD', 'ORIGIN', 'DEST.', 'USER', 'PAID AMT.'], [
        ['SF', 'IM', 'PSI26010016', '28-01-2026', 'CNDLC', 'THLCH', 'ANN', '6,950.00']]) },
    { file: 'alert_oversea.html', subject: 'Outstanding Oversea by job period',
      html: mk('Oversea ค้างรับที่มี ETD/ETA/FLT เกิน<span>30</span>วัน', '(SE=ETD , SI=ETA , AIR=FLT)',
        ['AGENT', 'TYPE', 'DEPT', 'JOB NO', 'INV. NO', 'JOB PERIOD', 'TOTAL DAYS', 'INV. AMT.', 'BY USER'], [
        ['Aacier Limited', 'SF', 'EX', 'ASE25080593', 'OCNASE2500218', '22-08-2025', '170', '-6,600.00', 'JUNYA'],
        ['Aacier Limited', 'SF', 'EX', 'ASE25090514', 'OCNASE2500280', '05-10-2025', '126', '-2,237.90', 'JUNYA'],
        ['Aacier Limited', 'SF', 'EX', 'ASE25100377', 'OCNASE2500281', '20-10-2025', '111', '-1,306.00', 'JUNYA'],
        ['Aacier Private', 'SF', 'EX', 'ASE25100379', 'OCNASE2500282', '03-11-2025', '97', '-1,311.20', 'JUNYA'],
        ['Aacier Limited', 'SF', 'EX', 'ASE25110300', 'OCNASE2500306', '14-11-2025', '86', '-651.39', 'JUNYA'],
        ['Aacier Limited', 'SF', 'EX', 'ASE25110322', 'OCNASE2500307', '14-11-2025', '86', '-2,931.26', 'JUNYA'],
        ['Aacier Limited', 'SF', 'EX', 'ASE25110423', 'OCNASE2500310', '26-11-2025', '74', '-4,568.20', 'JUNYA'],
        ['Aacier Holding', 'SF', 'EX', 'ASE25120074', 'OCNASE2500315', '08-12-2025', '62', '-2,574.40', 'JUNYA']]) },
    { file: 'alert_dutytax.html', subject: 'Job ค้างรับคืนค่า Duty Tax',
      html: mk('Job ค้างรับคืนค่า <span>Duty Tax</span> เฉพาะที่จ่ายแล้วเกิน <span>7</span> วัน', '',
        ['JOBNO', 'INV. NUMBER', 'INV. DATE', 'AMOUNT', 'USER', 'REMARK'], [
        ['CI26010271', 'VICI26020045', '02-02-2026', '1,356.00', 'WORANAN', ''],
        ['CI26020047', 'VICI26020080', '02-02-2026', '38,639.00', 'SONGPORN', ''],
        ['CI26010245', 'VICI26020108', '02-02-2026', '29,956.00', 'PAKJIRA', ''],
        ['CI26010181', 'VICI26020006', '02-02-2026', '17,961.00', 'SONGPORN', '']]) }
  ];
})();
