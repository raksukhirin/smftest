// DEMO seed — layout only. Step names beyond 01-03 and all approver names are placeholders until the real tables are given.
window.AF_NOW = new Date('2026-10-27T15:00:00');
window.AF_ME = 'TEST';
window.AF_MODULES = [
  { id: 'SE', name: 'Sea Export', icon: '🚢' },
  { id: 'SI', name: 'Sea Import', icon: '🚢' },
  { id: 'AE', name: 'Air Export', icon: '✈️' },
  { id: 'AI', name: 'Air Import', icon: '✈️' }
];
// Workflow template of a Sale Booking (13 columns in the current web timeline). Approver = who must approve that step.
window.AF_STEPS = [
  ['Vessel Booking', 'TEST'], ['Job Order', 'JACK'], ['Advance Expense', 'TEST'], ['Booking Confirm', 'JACK'],
  ['Container Pickup', 'TEST'], ['Customs Clearance', 'JACK'], ['Loading', 'TEST'], ['B/L Draft', 'JACK'],
  ['B/L Release', 'TEST'], ['Invoice', 'JACK'], ['Payment', 'TEST'], ['Closing', 'JACK'], ['Archive', 'TEST']
].map(function (s, i) { return { no: i + 1, name: s[0], approver: s[1] }; });

(function () {
  var F = function (n, kb) { return { name: n, kb: kb }; };
  function H(step, action, by, at, remark) { return { step: step, action: action, by: by, at: at, remark: remark || '' }; }
  function R(id, doc, mod, step, status, by, at, deadline, remark, files, sum, hist, done) {
    return { id: id, doc: doc, module: mod, type: 'Sale Booking', step: step, status: status, requestedBy: by, requestedAt: at,
             deadline: deadline, remark: remark, files: files, sum: sum, history: hist, doneSteps: done };
  }
  var S1 = { shipper: '2B XX SUPPLY CO.,LTD.', consignee: '9INC. INTERNATIONAL CO., LTD', pol: 'LAEM CHABANG', pod: 'SINGAPORE', jobType: 'DIRECT-FCL', sale: 'WWW' };
  var S2 = { shipper: 'THAI FOODS CO.', consignee: 'ORIENT TRADING LLC', pol: 'LAEM CHABANG', pod: 'LOS ANGELES', jobType: 'DIRECT-FCL', sale: 'TTT' };
  var S3 = { shipper: 'SIAM PARTS LTD.', consignee: 'EURO LOGISTICS GMBH', pol: 'BANGKOK', pod: 'HAMBURG', jobType: 'CONSOL-LCL', sale: 'WWW' };
  var S4 = { shipper: 'NOVA RETAIL', consignee: 'PACIFIC IMPORTS', pol: 'LAEM CHABANG', pod: 'SHANGHAI', jobType: 'DIRECT-FCL', sale: 'TTT' };
  window.AF_SEED = [
    R(1, 'TESTBYBOSS008', 'SE', 1, 'Wait', 'ADMIN', '2026-10-27T13:47', '2026-10-28', '', [F('BSE24060007.PDF', 412)], S1,
      [H(1, 'Requested', 'ADMIN', '2026-10-27T13:47', 'Please approve vessel booking')], 0),
    R(2, 'BSE26060001', 'SE', 1, 'Wait', 'ADMIN', '2026-10-27T11:20', '', 'TEST', [F('Booking-Request.PDF', 233), F('Rate-Confirm.PDF', 118)], S2,
      [H(1, 'Requested', 'ADMIN', '2026-10-27T11:20', 'TEST')], 0),
    R(3, '@22122025', 'SE', 2, 'Wait', 'JACK', '2026-10-26T16:05', '2026-10-27', 'Job order for Dec shipment', [F('JobOrder-22122025.PDF', 301), F('PO-4471.PDF', 96)], S3,
      [H(1, 'Requested', 'JACK', '2026-10-24T09:10'), H(1, 'Approved', 'TEST', '2026-10-24T14:30', 'OK'), H(2, 'Requested', 'JACK', '2026-10-26T16:05', 'Job order for Dec shipment')], 1),
    R(4, 'TESTBYBOSS007', 'SE', 1, 'Wait', 'ADMIN', '2026-10-26T10:00', '2026-10-26', '', [F('Booking.PDF', 188)], S1,
      [H(1, 'Requested', 'ADMIN', '2026-10-26T10:00')], 0),
    R(5, 'BSE18100003', 'SE', 3, 'Wait', 'JACK', '2026-10-25T17:40', '', 'Advance for THC + CFS', [F('Advance-Exp.XLSX', 54), F('Quotation.PDF', 410)], S4,
      [H(1, 'Approved', 'TEST', '2026-10-20T10:00', 'OK'), H(2, 'Approved', 'JACK', '2026-10-22T09:00'), H(3, 'Requested', 'JACK', '2026-10-25T17:40', 'Advance for THC + CFS')], 2),
    R(6, 'THD1194603', 'SE', 1, 'Wait', 'SUDA', '2026-10-25T09:15', '', '', [], S2,
      [H(1, 'Requested', 'SUDA', '2026-10-25T09:15')], 0),
    R(7, 'TEST2208C', 'SE', 1, 'Wait', 'ADMIN', '2026-10-24T14:00', '', 'Six documents attached', [F('BL-copy.PDF', 520), F('Inv.PDF', 211), F('PL.PDF', 175), F('COO.PDF', 90), F('MSDS.PDF', 330), F('Photo.JPG', 1800)], S4,
      [H(1, 'Requested', 'ADMIN', '2026-10-24T14:00')], 0),
    R(8, 'AE26100012', 'AE', 2, 'Wait', 'SUDA', '2026-10-27T08:30', '2026-10-28', 'Urgent - flight Thursday', [F('AWB-draft.PDF', 140)], { shipper: 'SIAM PARTS LTD.', consignee: 'FRANKFURT AUTOPARTS', pol: 'BKK', pod: 'FRA', jobType: 'AIR-EXPORT', sale: 'TTT' },
      [H(1, 'Approved', 'TEST', '2026-10-26T15:00'), H(2, 'Requested', 'SUDA', '2026-10-27T08:30', 'Urgent - flight Thursday')], 1),
    R(9, 'SI26100007', 'SI', 1, 'Wait', 'JACK', '2026-10-26T13:00', '', '', [F('DO-request.PDF', 77)], { shipper: 'GLOBAL SOURCING CO.', consignee: 'ABC TRADING', pol: 'SHANGHAI', pod: 'LAEM CHABANG', jobType: 'DIRECT-FCL', sale: 'WWW' },
      [H(1, 'Requested', 'JACK', '2026-10-26T13:00')], 0),
    R(10, 'TEST2109999', 'SE', 5, 'Wait', 'JACK', '2026-10-26T09:00', '', 'Pickup 29 Oct', [F('Pickup-order.PDF', 66)], S1,
      [H(1, 'Approved', 'TEST', '2026-10-12T10:00', 'test by boss'), H(2, 'Approved', 'JACK', '2026-10-14T09:00'), H(3, 'Approved', 'TEST', '2026-10-16T11:00'), H(4, 'Approved', 'JACK', '2026-10-20T10:00'), H(5, 'Requested', 'JACK', '2026-10-26T09:00', 'Pickup 29 Oct')], 4),
    R(11, 'BSE25050001', 'SE', 2, 'Approved', 'ADMIN', '2026-10-23T10:00', '', '', [F('JobOrder.PDF', 210)], S3,
      [H(1, 'Approved', 'TEST', '2026-10-22T10:00'), H(2, 'Requested', 'ADMIN', '2026-10-23T10:00'), H(2, 'Approved', 'JACK', '2026-10-23T15:20', 'Approved')], 2),
    R(12, 'BSE22060001', 'SE', 1, 'Rejected', 'ADMIN', '2026-10-22T10:00', '', '', [F('Booking.PDF', 190)], S2,
      [H(1, 'Requested', 'ADMIN', '2026-10-22T10:00'), H(1, 'Rejected', 'TEST', '2026-10-22T16:40', 'Rate not confirmed by carrier - please resubmit')], 0)
  ];
})();
