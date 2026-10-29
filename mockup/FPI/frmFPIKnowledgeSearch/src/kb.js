/* kb.js — the "AI" of the Knowledge Search: a transparent rule-based intent
   matcher over the FPI dataset. Every answer carries citations (RateNo / doc no /
   date) and marks its tier — Tier 1 = Rate KB (authoritative), Tier 2 = history
   (indicative, never auto-fill · D11).

   This is deliberately deterministic so the mockup needs no LLM. The seam for a
   real model is KB.query() — swap the classifier/handlers for an LLM+tools call
   that returns the same { title, html, citations, tier, followups } shape, and the
   UI does not change. Reuses RM.alerts + BG.profit + BG.autofill + BG.state. */
window.KB = window.KB || {};
window.KB.engine = (function () {
    'use strict';

    const U = BG.utils;
    const { esc, money, round, todayISO } = U;

    /* ---------------- dataset (own loader; shares db with BG engines) ---------------- */

    const DATA_FILES = ['charge_policy', 'customer_profiles', 'lane_history', 'local_charge_tariff',
        'margin_rules', 'rate_charges', 'rate_headers', 'quotations', 'bookings'];
    const camel = s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const db = {};
    let source = 'embedded';

    async function load() {
        try {
            const parts = await Promise.all(DATA_FILES.map(f =>
                fetch('../data/' + f + '.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })));
            DATA_FILES.forEach((f, i) => { db[camel(f)] = parts[i]; });
            source = '../data/*.json';
        } catch (_) {
            Object.assign(db, QG.seed);   // ../frmFPIQuoteGen/data.js — has all 9 files
            source = 'data.js (embedded)';
        }
        Object.assign(BG.state.db, db);   // let BG.profit / marginRule / autofill see the same data
        return db;
    }

    /* ---------------- entity dictionaries ---------------- */

    const PORTS = {
        THLCH: ['laem chabang', 'แหลมฉบัง', 'lch'], THBKK: ['bangkok', 'กรุงเทพ', 'บางกอก', 'bkk'],
        DEHAM: ['hamburg', 'ฮัมบูร์ก', 'ham'], NLRTM: ['rotterdam', 'รอตเตอร์ดาม', 'rtm'],
        SGSIN: ['singapore', 'สิงคโปร์', 'sin'], USLAX: ['los angeles', 'แอลเอ', 'lax', 'la'],
        JPYOK: ['yokohama', 'โยโกฮามา', 'yok'], AUMEL: ['melbourne', 'เมลเบิร์น', 'mel'],
        CNDLC: ['dalian', 'ต้าเหลียน'], CNSZX: ['shenzhen', 'เซินเจิ้น'], CNSHA: ['shanghai', 'เซี่ยงไฮ้']
    };
    const CARRIERS = {
        HLC001: ['hapag', 'hlc', 'hapag-lloyd'], ONE001: ['one', 'ocean network'],
        MSK001: ['maersk'], EMC001: ['evergreen', 'emc'], TG001: ['thai airways', 'tg', 'การบินไทย']
    };
    const CUST = {
        'C-ALPHA': ['alpha', 'อัลฟา'], 'C-BRAVO': ['bravo', 'บราโว'],
        'C-NOVA': ['nova', 'โนวา'], 'C-STRAT': ['strategic', 'strat', 'สแตรท']
    };

    function matchDict(qLower, dict) {
        const hits = [];
        Object.keys(dict).forEach(code => {
            if (qLower.indexOf(code.toLowerCase()) !== -1 || dict[code].some(n => qLower.indexOf(n) !== -1)) hits.push(code);
        });
        return hits;
    }

    function extract(q) {
        const low = q.toLowerCase();
        const upTokens = (q.match(/\b[A-Z]{4,6}\b/g) || []);
        const ports = Array.from(new Set(matchDict(low, PORTS).concat(upTokens.filter(t => PORTS[t]))));
        return {
            ports,
            carriers: matchDict(low, CARRIERS),
            customers: Array.from(new Set(matchDict(low, CUST).concat(upTokens.filter(t => CUST[t])))),
            docs: (q.match(/\b(FR-\d{4}-\d{5}|QSE\d+|BSE\d+|R-\d{4})\b/gi) || []).map(s => s.toUpperCase()),
            mode: /\bair\b|อากาศ|เครื่องบิน/.test(low) ? 'AIR' : /\bsea\b|เรือ|ทะเล/.test(low) ? 'SEA' : null,
            service: /\bfcl\b/.test(low) ? 'FCL' : /\blcl\b/.test(low) ? 'LCL' : null,
            low
        };
    }

    /* ---------------- citation helpers ---------------- */

    const cite = (tier, label, ref, date, note) => ({ tier, label, ref, date: date || null, note: note || null });

    /* ---------------- intent classification ---------------- */

    function classify(low, e) {
        if (e.docs.some(d => /^FR-|^R-/.test(d))) return 'rate_lookup';
        if (e.docs.some(d => /^QSE/.test(d))) return 'quote_lookup';
        if (e.docs.some(d => /^BSE/.test(d))) return 'booking_lookup';
        if (/หมดอายุ|expir|ใกล้หมด|alert|เตือน/.test(low)) return 'expiry';
        if (/ถูกสุด|ถูกที่สุด|cheapest|เทียบ|compare|ดีสุด/.test(low)) return 'compare';
        if (/เคยจ่าย|เคยขาย|ประวัติ|history|จ่ายจริง|เคยคิด|ราคาเก่า/.test(low)) return 'history';
        if (/margin|มาร์จิ้น|บวก|กี่ *%|markup|กำไร|ควรบวก/.test(low)) return 'margin_reco';
        if (/เสี่ยง|risk|rate ตาย|rate หมด|quote.*rate/.test(low)) return 'at_risk';
        if (/rate|เรท|ราคา|มี.*ไหม|available|freight|ค่าระวาง/.test(low)) return 'rate_availability';
        return 'unknown';
    }

    /* ---------------- handlers ---------------- */

    function laneRates(e, asOf) {
        return db.rateHeaders.filter(r =>
            (!e.ports.length || (e.ports.indexOf(r.pol) !== -1 || e.ports.indexOf(r.pod) !== -1)) &&
            (e.ports.length < 2 || (e.ports.indexOf(r.pol) !== -1 && e.ports.indexOf(r.pod) !== -1)) &&
            (!e.mode || r.mode === e.mode) &&
            (!e.service || r.serviceType === e.service) &&
            (!e.carriers.length || e.carriers.indexOf(r.carrierNo) !== -1));
    }

    function h_rate_availability(q, e, asOf) {
        const rates = laneRates(e, asOf);
        const laneTxt = e.ports.length >= 2 ? e.ports[0] + ' → ' + e.ports[1] : (e.ports[0] || 'ทุก lane');
        if (!rates.length) {
            return {
                title: 'ไม่พบ Rate ใน Rate KB', tier: 'NONE',
                html: '<p>ไม่มี Rate (Tier 1) สำหรับ <b>' + esc(laneTxt) + '</b>' +
                    (e.mode ? ' · ' + e.mode : '') + (e.service ? ' · ' + e.service : '') + '</p>' +
                    '<p class="hint">ลองดู "ราคาอ้างอิงจากประวัติ" (Tier 2) — ถามว่า “lane นี้เคยจ่ายเท่าไหร่”</p>',
                citations: [], followups: ['lane นี้เคยจ่ายเท่าไหร่', 'rate ไหนใกล้หมดอายุ']
            };
        }
        const rows = rates.map(r => {
            const active = RM.alerts.isActive(r, asOf);
            const d2e = RM.alerts.daysToExpiry(r, asOf);
            const frt = firstFreight(r.rateId);
            return '<tr><td class="font-mono">' + esc(r.rateNo) + '</td>' +
                '<td>' + esc(r.pol + '→' + r.pod) + '</td><td>' + esc(r.carrierName) + '</td>' +
                '<td>' + (frt ? money(frt.amount, 0) + ' ' + frt.currency : '—') + '</td>' +
                '<td><span class="pill st-' + esc(r.status) + '">' + esc(r.status) + '</span>' +
                (active ? ' <span class="hint">เหลือ ' + d2e + 'ว.</span>' : '') + '</td></tr>';
        }).join('');
        return {
            title: 'พบ ' + rates.length + ' Rate — ' + esc(laneTxt), tier: 'TIER1',
            html: '<table class="ans"><thead><tr><th>RateNo</th><th>Lane</th><th>Carrier</th><th>Freight</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>',
            citations: rates.map(r => cite('TIER1', 'Rate KB', r.rateNo, r.validFrom + '→' + r.validTo,
                r.rateSource + (r.sourceRef ? ' · ' + r.sourceRef : ''))),
            followups: [laneTxt + ' rate ไหนถูกสุด', laneTxt + ' เคยจ่ายเท่าไหร่']
        };
    }

    function h_compare(q, e, asOf) {
        const rates = laneRates(e, asOf).filter(r => RM.alerts.isActive(r, asOf));
        if (rates.length < 1) return h_rate_availability(q, e, asOf);
        const withCost = rates.map(r => {
            const f = firstFreight(r.rateId);
            const thb = f ? f.amount * (f.currency === 'THB' ? 1 : 36.5) : Infinity;
            return { r, f, thb };
        }).sort((a, b) => a.thb - b.thb);
        const best = withCost[0];
        const rows = withCost.map((x, i) => '<tr' + (i === 0 ? ' class="best"' : '') + '><td class="font-mono">' + esc(x.r.rateNo) +
            (i === 0 ? ' <span class="pill pill-ok">ถูกสุด</span>' : '') + '</td><td>' + esc(x.r.carrierName) + '</td>' +
            '<td>' + (x.f ? money(x.f.amount, 0) + ' ' + x.f.currency : '—') + '</td>' +
            '<td>' + (x.r.transitDaysMin || '?') + '–' + (x.r.transitDaysMax || '?') + 'ว.</td>' +
            '<td>' + (x.r.freeTimeDest ? x.r.freeTimeDest + 'ว.' : '—') + '</td></tr>').join('');
        return {
            title: 'เทียบ Rate — ถูกสุดคือ ' + esc(best.r.rateNo) + ' (' + esc(best.r.carrierName) + ')', tier: 'TIER1',
            html: '<table class="ans"><thead><tr><th>RateNo</th><th>Carrier</th><th>Freight</th><th>Transit</th><th>Free time</th></tr></thead><tbody>' + rows + '</tbody></table>' +
                '<p class="hint">* เทียบ freight เป็น THB โดยสมมติ USD×36.5 เพื่อจัดอันดับ — ราคาจริงใช้ FX ณ วันจอง</p>',
            citations: withCost.map(x => cite('TIER1', 'Rate KB', x.r.rateNo, x.r.validFrom + '→' + x.r.validTo, x.r.rateSource)),
            followups: [best.r.rateNo]
        };
    }

    function h_history(q, e, asOf) {
        const hist = KB.history.lookup(e.ports[0], e.ports[1]);
        const laneTxt = (e.ports[0] || '?') + ' → ' + (e.ports[1] || '?');
        if (!hist.sell.length && !hist.cost.length) {
            return { title: 'ไม่มีประวัติใน lane นี้', tier: 'NONE',
                html: '<p>ไม่พบประวัติจริง (Tier 2) สำหรับ <b>' + esc(laneTxt) + '</b></p>',
                citations: [], followups: ['THLCH SGSIN เคยจ่ายเท่าไหร่'] };
        }
        const tbl = (rows, label) => rows.length ? '<div class="mini-lbl">' + label + '</div><table class="ans"><thead><tr><th>Charge</th><th>ล่าสุด/หน่วย</th><th>Median</th><th>ครั้ง</th><th>แหล่ง</th></tr></thead><tbody>' +
            rows.map(r => '<tr><td class="font-mono">' + esc(r.expCode) + '</td><td>' + money(r.lastUnitTHB, 2) + '</td>' +
                '<td class="hint">' + money(r.medianUnitTHB, 2) + '</td><td>' + r.count + '</td>' +
                '<td><span class="pill pill-info">' + esc(r.reliability) + '</span></td></tr>').join('') + '</tbody></table>' : '';
        return {
            title: 'ราคาอ้างอิงจากประวัติ (Tier 2) — ' + esc(laneTxt), tier: 'TIER2',
            html: '<div class="alert alert-warn"><span>⚠</span><span><b>Indicative เท่านั้น (D11)</b> — ห้าม Auto-fill เป็น Cost ยืนยัน ถ้าใช้ต้องกรอกมือ + เหตุผล</span></div>' +
                tbl(hist.sell, 'เคยเรียกเก็บ (JOB_SELL)') + tbl(hist.cost, 'เคยจ่ายจริง (JOB_COST)') +
                (hist.outliersOnLane.length ? '<p class="hint">ตัด outlier ' + hist.outliersOnLane.length + ' บรรทัด</p>' : '') +
                (hist.noLaneCount ? '<p class="hint">' + hist.noLaneCount + ' บรรทัดในระบบไม่มี Port — ไม่ถูกเฉลี่ย</p>' : ''),
            citations: hist.sell.concat(hist.cost).map(r => cite('TIER2', 'ประวัติ (' + r.reliability + ')', r.lastJobNo, r.lastDate, r.count + ' ครั้ง')),
            followups: [laneTxt + ' มี rate ไหม']
        };
    }

    function h_margin_reco(q, e, asOf) {
        if (!e.customers.length) {
            return { title: 'ระบุลูกค้าก่อน', tier: 'NONE',
                html: '<p>ถามว่า “ลูกค้ารายไหน” — เลือกได้:</p>',
                citations: [], followups: db.customerProfiles.map(c => c.customerNo + ' ควรบวก margin เท่าไหร่') };
        }
        const cust = db.customerProfiles.find(c => c.customerNo === e.customers[0]);
        const rule = BG.state.marginRule({ jobClass: 'EX', shipper: cust.customerNo, loadPort: null, finalPort: null });
        return {
            title: 'เกณฑ์ Margin ของ ' + esc(cust.customerName), tier: 'TIER1',
            html: '<div class="kv">' +
                '<div>ลูกค้า</div><div>' + esc(cust.customerName) + ' <span class="pill pill-muted">Tier ' + esc(cust.tier) + '</span></div>' +
                '<div>Markup แนะนำ</div><div><b>' + rule.suggestMarkupPct + '%</b></div>' +
                '<div>Margin ขั้นต่ำ</div><div><b>' + rule.minMarginPct + '%</b>' + (rule._overriddenBy ? ' <span class="pill pill-info">override จาก CustomerProfile</span>' : '') + '</div>' +
                '<div>กำไรขั้นต่ำ</div><div>' + money(rule.minProfitTHB, 0) + ' THB</div>' +
                '</div><p class="hint">เกณฑ์ใช้ตอนเคาะ Margin ที่ Booking (D1) — Markup ใช้ตั้งราคาแนะนำใน Quotation</p>',
            citations: [cite('TIER1', 'MarginRule', rule.ruleId, null, rule.ruleName),
                cite('TIER1', 'CustomerProfile', cust.customerNo, null, 'Tier ' + cust.tier +
                    (cust.marginOverridePct != null ? ' · override ' + cust.marginOverridePct + '%' : ''))],
            followups: [cust.customerNo + ' เคยจอง lane ไหน']
        };
    }

    function h_expiry(q, e, asOf) {
        const scan = RM.alerts.scan(db.rateHeaders, asOf);
        const all = [].concat(
            scan.EXPIRED.map(x => ['EXPIRED', x]), scan.EXPIRING_7D.map(x => ['EXPIRING_7D', x]),
            scan.STALE_DRAFT_30D.map(x => ['STALE_DRAFT_30D', x]), scan.NO_SOURCE_REF.map(x => ['NO_SOURCE_REF', x]));
        if (!all.length) return { title: 'ไม่มี Rate ที่ต้องเตือน', tier: 'TIER1', html: '<p>ทุก Rate ปกติ ณ ' + esc(asOf) + '</p>', citations: [], followups: [] };
        const rows = all.map(([t, x]) => '<tr><td class="font-mono">' + esc(x.rate.rateNo) + '</td><td>' + esc(x.rate.pol + '→' + x.rate.pod) + '</td>' +
            '<td><span class="pill pill-warn">' + esc(t) + '</span></td><td class="font-mono hint">→' + esc(x.rate.validTo) + '</td></tr>').join('');
        return {
            title: 'Rate ที่ต้องเตือน ' + all.length + ' ใบ (ณ ' + esc(asOf) + ')', tier: 'TIER1',
            html: '<table class="ans"><thead><tr><th>RateNo</th><th>Lane</th><th>Alert</th><th>Valid ถึง</th></tr></thead><tbody>' + rows + '</tbody></table>',
            citations: all.map(([t, x]) => cite('TIER1', 'Rate KB', x.rate.rateNo, x.rate.validTo, t)),
            followups: []
        };
    }

    function h_at_risk(q, e, asOf) {
        const risk = KB.dashRisk ? KB.dashRisk(asOf) : [];
        if (!risk.length) return { title: 'ไม่มี Quote ที่ Rate ตาย', tier: 'TIER1', html: '<p>ทุก Quotation Active มี Rate รองรับ ณ ' + esc(asOf) + '</p>', citations: [], followups: [] };
        const rows = risk.map(x => '<tr><td class="font-mono">' + esc(x.quote.docNo) + '</td><td>' + esc(x.option.pol + '→' + x.option.pod) + '</td>' +
            '<td class="font-mono">' + esc(x.rate.rateNo) + ' <span class="pill st-' + esc(x.rate.status) + '">' + esc(x.reason) + '</span></td>' +
            '<td>' + (x.currentRate ? '<span class="delta-up">+' + money(x.deltaTHB || 0, 0) + ' THB/ตู้</span>' : '<span class="pill pill-danger">ไม่มีตัวแทน</span>') + '</td></tr>').join('');
        return {
            title: 'Quote เสี่ยง (Rate ต้นทางตาย) ' + risk.length + ' รายการ', tier: 'TIER1',
            html: '<table class="ans"><thead><tr><th>Quote</th><th>Lane</th><th>Rate ที่เสนอ</th><th>Δ ทุน</th></tr></thead><tbody>' + rows + '</tbody></table>',
            citations: risk.map(x => cite('TIER1', 'Quote/Rate', x.quote.docNo + ' · ' + x.rate.rateNo, x.quote.validTo, x.reason)),
            followups: []
        };
    }

    function h_rate_lookup(q, e, asOf) {
        const ref = e.docs.find(d => /^FR-|^R-/.test(d));
        const r = db.rateHeaders.find(x => x.rateNo === ref || x.rateId === ref);
        if (!r) return unknown(q);
        const active = RM.alerts.isActive(r, asOf);
        const charges = db.rateCharges.filter(c => c.rateId === r.rateId);
        return {
            title: 'Rate ' + esc(r.rateNo), tier: 'TIER1',
            html: '<div class="kv"><div>Lane</div><div>' + esc(r.pol + ' → ' + r.pod) + '</div>' +
                '<div>Carrier</div><div>' + esc(r.carrierName) + '</div>' +
                '<div>Status</div><div><span class="pill st-' + esc(r.status) + '">' + esc(r.status) + '</span>' + (active ? ' <span class="pill pill-ok">Active</span>' : '') + '</div>' +
                '<div>Validity</div><div class="font-mono">' + esc(r.validFrom + ' → ' + r.validTo) + '</div>' +
                '<div>Source</div><div>' + esc(r.rateSource) + (r.sourceRef ? ' · ' + esc(r.sourceRef) : '') + '</div>' +
                '<div>Charges</div><div>' + charges.length + ' บรรทัด</div></div>',
            citations: [cite('TIER1', 'Rate KB', r.rateNo, r.validFrom + '→' + r.validTo, r.sourceRef || r.rateSource)],
            followups: [r.pol + ' ' + r.pod + ' rate ไหนถูกสุด']
        };
    }

    function h_booking_lookup(q, e, asOf) {
        const ref = e.docs.find(d => /^BSE/.test(d));
        const b = db.bookings.find(x => x.docNo === ref);
        if (!b) return unknown(q);
        const p = BG.profit.bookProfit(b);
        const v = BG.profit.evaluate(p, BG.state.marginRule(b), null);
        return {
            title: 'Booking ' + esc(b.docNo) + ' — ' + v.result, tier: 'TIER1',
            html: '<div class="kv"><div>Lane</div><div>' + esc(b.loadPort + ' → ' + b.finalPort) + '</div>' +
                '<div>ลูกค้า</div><div>' + esc(b.shipper) + '</div>' +
                '<div>Sold / Cost</div><div>' + money(p.rtSold, 0) + ' / ' + money(p.rtCost, 0) + '</div>' +
                '<div>Margin</div><div><b>' + money(v.margin, 0) + '</b> (' + round(v.marginPct, 2) + '%)</div>' +
                '<div>ผล Gate</div><div><span class="pill pill-' + (v.result === 'PASS' ? 'ok' : v.result === 'BLOCKED' ? 'danger' : 'warn') + '">' + v.result + '</span></div></div>' +
                '<p class="hint">' + esc(v.detail) + '</p>',
            citations: [cite('TIER1', 'Booking (vFPI_BookProfit)', b.docNo, b.docDate, b.refQtNo ? 'อ้าง ' + b.refQtNo : null)],
            followups: []
        };
    }

    function h_quote_lookup(q, e, asOf) {
        const ref = e.docs.find(d => /^QSE/.test(d));
        const qt = db.quotations.find(x => x.docNo === ref);
        if (!qt) return unknown(q);
        const opts = qt.options.map(o => '<tr><td>opt ' + o.optionNo + '</td><td>' + esc(o.pol + '→' + o.pod) + '</td><td>' + esc(o.carrierName) + '</td><td class="font-mono">' + esc(o.rateId || '—') + '</td></tr>').join('');
        return {
            title: 'Quotation ' + esc(qt.docNo), tier: 'TIER1',
            html: '<div class="kv"><div>ลูกค้า</div><div>' + esc(qt.custName || qt.customerNo) + '</div>' +
                '<div>Validity</div><div class="font-mono">' + esc(qt.validFrom + ' → ' + qt.validTo) + '</div>' +
                '<div>สถานะ</div><div>' + esc(qt.docStat) + '</div></div>' +
                '<table class="ans mt"><thead><tr><th>Option</th><th>Lane</th><th>Carrier</th><th>Rate</th></tr></thead><tbody>' + opts + '</tbody></table>',
            citations: [cite('TIER1', 'Quotation', qt.docNo, qt.docDate, 'valid ถึง ' + qt.validTo)],
            followups: ['quote ไหน rate ตายแล้ว']
        };
    }

    function unknown(q) {
        return {
            title: 'ยังตอบไม่ได้', tier: 'NONE',
            html: '<p>ลองถามแนวนี้ (mockup รองรับ intent เหล่านี้):</p>',
            citations: [], followups: [
                'มี rate FCL Laem Chabang ไป Hamburg ไหม', 'C-BRAVO ควรบวก margin เท่าไหร่',
                'THLCH SGSIN เคยจ่ายเท่าไหร่', 'rate ไหนใกล้หมดอายุ', 'quote ไหน rate ตายแล้ว', 'BSE26090004 margin เท่าไหร่'
            ]
        };
    }

    /* ---------------- public: query ---------------- */

    const HANDLERS = {
        rate_availability: h_rate_availability, compare: h_compare, history: h_history,
        margin_reco: h_margin_reco, expiry: h_expiry, at_risk: h_at_risk,
        rate_lookup: h_rate_lookup, booking_lookup: h_booking_lookup, quote_lookup: h_quote_lookup
    };

    function query(q, asOf) {
        const e = extract(q);
        const intent = classify(e.low, e);
        const handler = HANDLERS[intent] || unknown;
        const res = handler(q, e, asOf || todayISO());
        res.intent = intent;
        res.entities = e;
        return res;
    }

    function firstFreight(rateId) {
        const c = db.rateCharges.find(x => x.rateId === rateId && x.category === 'FREIGHT');
        return c ? { amount: c.amount, currency: c.currencyCode } : null;
    }

    return { load, query, extract, classify, db: () => db, source: () => source, firstFreight };
})();
