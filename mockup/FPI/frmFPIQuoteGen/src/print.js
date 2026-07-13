/* print.js — customer-facing quotation + the FPI_QuoteRateRef export.
   The printed doc shows sell prices only; cost, margin and rebate stay internal (D2). */
window.QG = window.QG || {};
window.QG.print = (function () {
    'use strict';

    const { esc, money, qty, download } = QG.utils;
    const { state } = QG.state;

    /** Letterhead name on the printed quotation. Placeholder — swap for the real entity at hand-off. */
    const COMPANY_NAME = 'DEMO FREIGHT CORP CO., LTD.';

    /** Shape the on-screen quote into the JSON the backend would persist
        (AFQHEAD + AFQDETAIL + FPI_QuoteRateRef — see mapping.md). */
    function toQuotationJson() {
        const ship = state.shipment;
        const cust = QG.state.customer(ship.customerNo);
        return {
            docNo: '(generated on save)',
            revNo: 0,
            docDate: ship.asOf,
            customerNo: ship.customerNo,
            custName: cust ? cust.customerName : null,
            incoterm: ship.incoterm,
            validFrom: ship.validFrom,
            validTo: ship.validTo,
            docStat: 'Open',
            saleName: cust ? cust.salesOwner : null,
            options: state.lanes.map((lane, i) => {
                const opt = lane.candidates.find(o => o.rateId === lane.selectedRateId);
                if (!opt) return { optionNo: i + 1, pol: ship.pol, pod: lane.pod, lines: [], note: 'no rate selected' };
                const reason = opt.historyOption
                    ? state.historyReason[lane.pod] || null
                    : state.rateReason[lane.pod + '|' + opt.rateId] || null;
                return {
                    optionNo: i + 1,
                    rateId: opt.historyOption ? null : opt.rate.rateId,
                    pol: ship.pol,
                    pod: lane.pod,
                    carrierName: opt.rate.carrierName,
                    transitDays: opt.historyOption ? null : opt.rate.transitDaysMin + '-' + opt.rate.transitDaysMax,
                    sourceTier: opt.historyOption ? 'HISTORY' : 'RATE_KB',
                    manualReason: reason,
                    lines: opt.lines.filter(l => !l.costOnly).map(l => ({
                        seqNo: l.seqNo,
                        expCode: l.expCode,
                        desc: l.chargeName,
                        qty: l.qty,
                        currency: l.currency,
                        sellUnitPrice: QG.utils.round(l.sellUnit, 2),
                        // FPI_QuoteRateRef — cost snapshot for the estimated-margin view
                        rateRef: Object.assign(
                            l.historyBased
                                ? { historyRef: true, reliability: l.source.reliability, jobNo: l.source.jobNo, lastDate: l.source.lastDate }
                                : l.source.rateChargeId ? { rateChargeId: l.source.rateChargeId } : { tariffId: l.source.tariffId },
                            {
                                costRefAmount: l.costUnit,
                                costRefCurrency: l.currency,
                                costRefFxToTHB: l.fxRate,
                                manualReason: l.overrideReason || null
                            })
                    }))
                };
            })
        };
    }

    function exportJson() {
        download('quotation-draft.json', JSON.stringify(toQuotationJson(), null, 2));
    }

    /* ---------------- printable HTML ---------------- */

    function buildHtml() {
        const ship = state.shipment;
        const cust = QG.state.customer(ship.customerNo);
        const shipDesc = ship.mode === 'AIR'
            ? 'Chargeable weight ' + money(ship.chargeableKg, 1) + ' kg'
            : Object.keys(ship.containers).map(k => ship.containers[k] + ' × ' + k).join(', ');

        let body = '';
        state.lanes.forEach((lane, i) => {
            const opt = lane.candidates.find(o => o.rateId === lane.selectedRateId);
            if (!opt) return;
            const lines = opt.lines.filter(l => !l.costOnly);
            const total = lines.reduce((s, l) => s + l.sellTHB, 0);

            const meta = opt.historyOption
                ? esc(opt.rate.carrierName) + ' · indicative — subject to carrier confirmation'
                : esc(opt.rate.carrierName) +
                  (opt.rate.routing ? ' · ' + esc(opt.rate.routing) : '') +
                  ' · Transit ' + opt.rate.transitDaysMin + '–' + opt.rate.transitDaysMax + ' days' +
                  (opt.rate.freeTimeDest ? ' · Free time ' + opt.rate.freeTimeDest + ' days at destination' : '');
            body += '<section class="opt"><h3>Option ' + (i + 1) + ' — ' + esc(ship.pol) + ' → ' + esc(lane.pod) + '</h3>' +
                '<div class="meta">' + meta + '</div>' +
                '<table><thead><tr><th>#</th><th>Description</th><th>Basis</th><th class="r">Qty</th>' +
                '<th class="r">Unit price</th><th>Cur</th><th class="r">Amount (THB)</th></tr></thead><tbody>';
            lines.forEach(l => {
                body += '<tr><td>' + l.seqNo + '</td><td>' + esc(l.chargeName) + '</td>' +
                    '<td class="sm">' + esc(l.basis.replace('PER_', 'per ').toLowerCase()) + '</td>' +
                    '<td class="r">' + qty(l.qty) + '</td>' +
                    '<td class="r">' + money(l.sellUnit, 2) + '</td>' +
                    '<td>' + esc(l.currency) + '</td>' +
                    '<td class="r">' + money(l.sellTHB, 2) + '</td></tr>';
            });
            body += '</tbody><tfoot><tr><td colspan="6" class="r">Total (THB)</td>' +
                '<td class="r"><b>' + money(total, 2) + '</b></td></tr></tfoot></table></section>';
        });

        return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
            '<title>Quotation — ' + esc(ship.customerNo) + '</title>' +
            '<link rel="stylesheet" href="print.css"></head><body>' +
            '<header><div class="brand">' + esc(COMPANY_NAME) + '</div>' +
            '<div class="doc">QUOTATION <span class="draft">DRAFT</span></div></header>' +
            '<table class="hdr"><tr>' +
            '<td><span>Customer</span>' + esc(cust ? cust.customerName : ship.customerNo) + '</td>' +
            '<td><span>Date</span>' + esc(ship.asOf) + '</td>' +
            '<td><span>Incoterm</span>' + esc(ship.incoterm) + '</td></tr><tr>' +
            '<td><span>Shipment</span>' + esc(shipDesc) + '</td>' +
            '<td><span>Validity</span>' + esc(ship.validFrom) + ' → ' + esc(ship.validTo) + '</td>' +
            '<td><span>Sales</span>' + esc(cust ? cust.salesOwner : '') + '</td></tr></table>' +
            body +
            '<footer><p>Rates are subject to space and equipment availability. Local charges at destination are for the account of consignee unless otherwise stated.</p>' +
            '<p>ใบเสนอราคานี้มีผลถึง ' + esc(ship.validTo) + ' — จองได้หลาย shipment ตลอดช่วง Validity (D2)</p>' +
            '<p class="tiny">FPI mockup — ราคาขายเท่านั้น ต้นทุน/Margin เป็นข้อมูลภายใน ไม่พิมพ์ลงเอกสารลูกค้า</p></footer>' +
            '</body></html>';
    }

    function open() {
        const w = window.open('', '_blank');
        if (!w) { alert('เบราว์เซอร์บล็อก popup — อนุญาต popup แล้วลองใหม่'); return; }
        w.document.write(buildHtml());
        w.document.close();
        // print.css is fetched relative to the opener's directory
        const link = w.document.querySelector('link[rel=stylesheet]');
        if (link) link.href = new URL('print.css', window.location.href).href;
    }

    return { open, exportJson, toQuotationJson, buildHtml };
})();
