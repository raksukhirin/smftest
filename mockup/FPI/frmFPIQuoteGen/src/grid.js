/* grid.js — panel 3: charge grid, take-lower working, source popovers,
   inline sell override (ManualReason per D6), optional local charges, rebate box. */
window.QG = window.QG || {};
window.QG.grid = (function () {
    'use strict';

    const { $, el, esc, money, qty, round } = QG.utils;
    const { state } = QG.state;

    const MODE_PILL = { MARKUP: 'pill-markup', STD_SELL: 'pill-std', PASS: 'pill-pass' };

    /* ---------------- source popover ---------------- */

    function showSource(anchor, line) {
        const s = line.source;
        const pop = $('#srcPop');
        let html = '<div class="px-3 py-2 border-b border-slate-200 font-semibold flex items-center gap-1.5">';
        if (s.kind === 'RATE') {
            html += '<span class="pill pill-teal">Rate KB · Tier 1</span><span class="font-mono">' + esc(s.rateNo) + '</span>';
        } else if (s.kind === 'TARIFF') {
            html += '<span class="pill pill-info">Local Tariff</span><span class="font-mono">' + esc(s.tariffId) + '</span>';
        } else {
            html += '<span class="pill pill-warn">History · Tier 2</span>';
        }
        html += '</div><div class="px-3 py-2 space-y-1 text-[11px] text-slate-600">';

        const row = (k, v) => '<div class="flex gap-2"><span class="w-24 shrink-0 text-slate-400">' + k + '</span><span class="flex-1">' + v + '</span></div>';
        html += row('Charge', '<span class="font-mono">' + esc(line.subSysName + '/' + line.jobClass + '/' + line.expCode) + '</span>');
        if (s.rateChargeId) html += row('RateChargeId', '<span class="font-mono">' + esc(s.rateChargeId) + '</span>');
        if (s.tariffId) html += row('TariffId', '<span class="font-mono">' + esc(s.tariffId) + '</span>');
        html += row('Basis', esc(line.basis) + (line.containerType ? ' · ' + esc(line.containerType) : ''));
        html += row('ทุน/หน่วย', money(line.costUnit, 2) + ' ' + esc(line.currency) +
            (line.currency !== 'THB' ? ' <span class="text-slate-400">× FX ' + money(line.fxRate, 4) + '</span>' : ''));
        html += row('PricingMode', '<span class="pill ' + MODE_PILL[line.pricingMode] + '">' + esc(line.pricingMode) + '</span>');
        html += row('ราคาขายมาจาก', esc(line.sellVia));
        if (s.validFrom) html += row('Validity', '<span class="font-mono">' + esc(s.validFrom) + ' → ' + esc(s.validTo) + '</span>');
        if (s.ref) html += row('SourceRef', esc(s.ref));
        if (s.remark) html += row('Remark', esc(s.remark));
        if (line.overridden) {
            html += '<div class="mt-1 pt-1 border-t border-slate-100">' +
                row('<span class="text-pink-600">Override</span>', '<span class="text-pink-700">' + esc(line.overrideReason) + '</span>') + '</div>';
        }
        html += '</div>';
        pop.innerHTML = html;

        const r = anchor.getBoundingClientRect();
        pop.classList.remove('hidden');
        const top = Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 60);
        pop.style.top = Math.max(8, top) + 'px';
        pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 340)) + 'px';
    }

    function hideSource() { $('#srcPop').classList.add('hidden'); }

    /* ---------------- take-lower working row ---------------- */

    function workRow(line) {
        const tr = el('tr', 'work-row');
        const td = el('td');
        td.colSpan = 9;
        const parts = line.work.map(c => {
            const cls = c.chosen ? 'win' : 'lose';
            return '<span class="' + cls + '">' + esc(c.label) + ' = ' + money(c.total, 0) + '</span>';
        });
        td.innerHTML = '<b>Take-lower (D7)</b> · เทียบ ' + parts.join(' &nbsp;|&nbsp; ') +
            ' &nbsp;→&nbsp; <span class="win">ใช้ ' + money(line.work.find(c => c.chosen).total, 0) + ' ' + esc(line.currency) + '</span>';
        tr.appendChild(td);
        return tr;
    }

    /* ---------------- rows ---------------- */

    function sellCell(line, onOverride) {
        const wrap = el('div', 'flex items-center justify-end gap-1');
        if (line.costOnly) {
            wrap.appendChild(el('span', 'text-slate-300', '—'));
            return wrap;
        }
        const inp = el('input', 'cell-inp');
        inp.type = 'number'; inp.step = '0.01'; inp.value = round(line.sellUnit, 2);
        inp.onchange = () => {
            const v = parseFloat(inp.value);
            if (!isFinite(v) || v < 0) { inp.value = round(line.sellUnit, 2); return; }
            if (Math.abs(v - line.sellUnit) < 0.005) return;
            onOverride(line, v, () => { inp.value = round(line.sellUnit, 2); });
        };
        wrap.appendChild(inp);
        if (line.overridden) {
            const b = el('span', 'pill pill-override', '●');
            b.title = 'Override: ' + line.overrideReason;
            wrap.appendChild(b);
        }
        return wrap;
    }

    function lineRow(line, onOverride) {
        const tr = el('tr');
        const td = (cls, html) => { const d = el('td', cls, html); tr.appendChild(d); return d; };

        td('text-slate-400', String(line.seqNo));

        const nameCell = td('');
        nameCell.innerHTML = '<div class="font-medium text-slate-700">' + esc(line.chargeName) + '</div>' +
            '<div class="text-[10px] text-slate-400 font-mono">' + esc(line.expCode) +
            (line.containerType ? ' · ' + esc(line.containerType) : '') + '</div>';

        td('text-[10px] text-slate-500 font-mono', esc(line.basis.replace('PER_', '')));
        td('num', qty(line.qty));

        const costCell = td('num');
        costCell.innerHTML = money(line.costUnit, 2) +
            (line.currency !== 'THB'
                ? ' <span class="text-[10px] ' + (line.badFx ? 'text-rose-600 font-bold' : 'text-slate-400') + '">' +
                  esc(line.currency) + (line.badFx ? ' FX=0!' : '') + '</span>'
                : '');

        const modeCell = td('');
        modeCell.innerHTML = line.policyMissing
            ? '<span class="pill pill-danger" title="ไม่มีแถวใน FPI_ChargePolicy">ไม่มี Policy</span>'
            : '<span class="pill ' + MODE_PILL[line.pricingMode] + '" title="' + esc(line.sellVia) + '">' + esc(line.pricingMode) + '</span>';

        const sc = td('num');
        sc.appendChild(sellCell(line, onOverride));

        td('num font-medium ' + (line.costOnly ? 'text-slate-300' : 'text-slate-800'),
            line.costOnly ? '—' : money(line.sellTHB, 2));

        const srcCell = td('');
        const link = el('span', 'src-link', esc(line.source.rateChargeId || line.source.tariffId || 'HISTORY'));
        link.onclick = e => { e.stopPropagation(); showSource(link, line); };
        srcCell.appendChild(link);

        return tr;
    }

    /* ---------------- optional local charges (tariff add-ons) ---------------- */

    function renderAddons(lane, opt, onToggle) {
        const box = $('#addonBox');
        const list = $('#addonList');
        const ship = state.shipment;
        const used = new Set(opt.lines.map(l => l.expCode));

        const avail = QG.state.db.localChargeTariff.filter(t =>
            t.status === 'CONFIRMED' &&
            QG.utils.inRange(ship.asOf, t.validFrom, t.validTo) &&
            (t.mode === 'ALL' || t.mode === ship.mode) &&
            (t.portCode == null || t.portCode === ship.pol) &&
            (t.serviceType == null || t.serviceType === ship.serviceType) &&
            !used.has(t.expCode) &&
            // a tariff that resolves to qty 0 does not apply to this shipment
            // (e.g. THC2 is a 20GP charge — never offer it on a 40HQ-only booking)
            QG.engine.qtyFor(t.basis, t.containerType, ship) > 0
        );

        box.classList.toggle('hidden', !avail.length);
        list.innerHTML = '';
        avail.forEach(t => {
            const key = lane.pod + '|' + t.tariffId;
            const pol = QG.state.policy(t.subSysName, t.jobClass, t.expCode);
            const sell = QG.engine.sellUnitFor(pol, t.amount, t, opt._rule);
            const row = el('label', 'flex items-center gap-2 text-[11px] cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5');
            const cb = el('input', 'accent-teal-700');
            cb.type = 'checkbox';
            cb.checked = !!state.addons[key];
            cb.onchange = () => onToggle(key, cb.checked);
            row.appendChild(cb);
            row.appendChild(el('span', 'font-mono text-slate-500 w-16', esc(t.expCode)));
            row.appendChild(el('span', 'flex-1 text-slate-600', esc(t.chargeName)));
            row.appendChild(el('span', 'pill ' + MODE_PILL[pol ? pol.pricingMode : 'PASS'], esc(pol ? pol.pricingMode : 'PASS')));
            row.appendChild(el('span', 'tabular text-slate-500', 'ทุน ' + money(t.amount, 0)));
            row.appendChild(el('span', 'tabular font-semibold text-slate-700 w-20 text-right', 'ขาย ' + money(sell.value, 0)));
            list.appendChild(row);
        });
    }

    /* ---------------- rebate / cost-only ---------------- */

    function renderRebates(lines) {
        const box = $('#rebateBox');
        const list = $('#rebateList');
        const reb = lines.filter(l => l.costOnly);
        box.classList.toggle('hidden', !reb.length);
        list.innerHTML = '';
        reb.forEach(l => {
            const row = el('div', 'flex items-center gap-2 text-[11px] px-1');
            row.appendChild(el('span', 'font-mono text-slate-500 w-16', esc(l.expCode)));
            row.appendChild(el('span', 'flex-1 text-slate-600', esc(l.chargeName)));
            row.appendChild(el('span', 'pill pill-rebate', 'IsRebate'));
            row.appendChild(el('span', 'tabular text-slate-500', qty(l.qty) + ' × ' + money(l.costUnit, 2) + ' ' + esc(l.currency)));
            row.appendChild(el('span', 'tabular font-semibold text-amber-700 w-24 text-right', money(l.costTHB, 2) + ' THB'));
            list.appendChild(row);
        });
    }

    /* ---------------- entry point ---------------- */

    function render(lane, opt, handlers) {
        const body = $('#chargeBody');
        body.innerHTML = '';

        if (!opt) {
            $('#gridSubtitle').textContent = '—';
            body.innerHTML = '<tr><td colspan="9" class="py-8 text-center text-slate-400">ไม่มี Rate ที่เลือกได้ใน lane นี้</td></tr>';
            $('#addonBox').classList.add('hidden');
            $('#rebateBox').classList.add('hidden');
            return;
        }

        $('#gridSubtitle').innerHTML = esc(state.shipment.pol + ' → ' + lane.pod) +
            ' · <span class="font-mono">' + esc(opt.rate.rateNo) + '</span> · ' + esc(opt.rate.carrierName);

        const sellLines = opt.lines.filter(l => !l.costOnly);
        if (!sellLines.length) {
            body.innerHTML = '<tr><td colspan="9" class="py-8 text-center text-slate-400">ไม่มีบรรทัดที่ตรงกับ shipment นี้ (เช็ค container mix / น้ำหนัก)</td></tr>';
        }
        sellLines.forEach(l => {
            body.appendChild(lineRow(l, handlers.onOverride));
            if (l.work && l.work.length > 1) body.appendChild(workRow(l));
        });

        renderAddons(lane, opt, handlers.onToggleAddon);
        renderRebates(opt.lines);
    }

    function init() {
        document.addEventListener('click', e => {
            if (!e.target.closest || (!e.target.closest('#srcPop') && !e.target.classList.contains('src-link'))) hideSource();
        });
        window.addEventListener('scroll', hideSource, true);
    }

    return { init, render, hideSource, MODE_PILL };
})();
