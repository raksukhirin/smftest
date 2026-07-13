/* input.js — panel 1: shipment input + demo scenario loader. */
window.QG = window.QG || {};
window.QG.input = (function () {
    'use strict';

    const { $, $$, el, esc, round, money, todayISO } = QG.utils;

    const CNTR_TYPES = ['20GP', '40GP', '40HQ', '45G1', 'RF20', 'RF40'];
    const SERVICE_BY_MODE = { SEA: ['FCL', 'LCL'], AIR: ['AIRGEN', 'AIRCON'] };

    let _onChange = () => {};
    let podRows = ['DEHAM'];
    let cntr = { '40HQ': 2 };
    let fx = { USD: 36.5 };

    /* ---------- master lists derived from the dataset ---------- */

    function allPorts() {
        const s = new Set();
        QG.state.db.rateHeaders.forEach(r => { s.add(r.pol); s.add(r.pod); });
        QG.state.db.laneHistory.forEach(r => { if (r.loadPort) s.add(r.loadPort); if (r.disPort) s.add(r.disPort); });
        return Array.from(s).sort();
    }

    function foreignCurrencies() {
        const s = new Set();
        QG.state.db.rateCharges.forEach(c => { if (c.currencyCode !== 'THB') s.add(c.currencyCode); });
        QG.state.db.localChargeTariff.forEach(c => { if (c.currencyCode !== 'THB') s.add(c.currencyCode); });
        return Array.from(s).sort();
    }

    /* ---------- render sub-widgets ---------- */

    function renderPods() {
        const box = $('#podList');
        box.innerHTML = '';
        const ports = allPorts();
        podRows.forEach((pod, i) => {
            const row = el('div', 'flex gap-1');
            const sel = el('select', 'inp');
            ports.forEach(p => {
                const o = el('option', null, p);
                o.value = p;
                if (p === pod) o.selected = true;
                sel.appendChild(o);
            });
            sel.onchange = () => { podRows[i] = sel.value; _onChange(); };
            row.appendChild(sel);
            if (podRows.length > 1) {
                const rm = el('button', 'px-2 text-slate-400 hover:text-rose-600 text-sm', '✕');
                rm.title = 'ลบปลายทาง';
                rm.onclick = () => { podRows.splice(i, 1); renderPods(); _onChange(); };
                row.appendChild(rm);
            }
            box.appendChild(row);
        });
    }

    function renderContainers() {
        const box = $('#cntrRows');
        box.innerHTML = '';
        CNTR_TYPES.forEach(t => {
            const row = el('div', 'flex items-center gap-2');
            row.appendChild(el('span', 'w-14 text-xs text-slate-600 font-mono', t));
            const inp = el('input', 'inp tabular-nums flex-1');
            inp.type = 'number'; inp.min = '0'; inp.step = '1';
            inp.value = cntr[t] || 0;
            inp.oninput = () => {
                const v = parseInt(inp.value, 10) || 0;
                if (v > 0) cntr[t] = v; else delete cntr[t];
                _onChange();
            };
            row.appendChild(inp);
            box.appendChild(row);
        });
    }

    function renderFx() {
        const box = $('#fxRows');
        box.innerHTML = '';
        foreignCurrencies().forEach(c => {
            const row = el('div', 'flex items-center gap-2');
            row.appendChild(el('span', 'w-14 text-xs text-slate-600 font-mono', c));
            const inp = el('input', 'inp tabular-nums flex-1');
            inp.type = 'number'; inp.min = '0'; inp.step = '0.01';
            inp.value = fx[c] != null ? fx[c] : 0;
            inp.oninput = () => { fx[c] = parseFloat(inp.value) || 0; _onChange(); };
            if (!(fx[c] > 0)) inp.classList.add('border-rose-400');
            row.appendChild(inp);
            box.appendChild(row);
        });
    }

    function renderService() {
        const mode = $('#inMode').value;
        const sel = $('#inService');
        const prev = sel.value;
        sel.innerHTML = '';
        SERVICE_BY_MODE[mode].forEach(s => {
            const o = el('option', null, s); o.value = s;
            sel.appendChild(o);
        });
        if (SERVICE_BY_MODE[mode].indexOf(prev) !== -1) sel.value = prev;
        $('#seaBox').classList.toggle('hidden', mode !== 'SEA');
        $('#airBox').classList.toggle('hidden', mode !== 'AIR');
    }

    function renderCustomerChips() {
        const c = QG.state.customer($('#inCustomer').value);
        const chips = $('#custChips');
        chips.innerHTML = '';
        if (!c) return;
        chips.appendChild(el('span', 'pill pill-teal', 'Tier ' + esc(c.tier)));
        chips.appendChild(el('span', 'pill pill-muted', esc(c.industry)));
        if (c.creditTermDays) chips.appendChild(el('span', 'pill pill-muted', 'Credit ' + c.creditTermDays + 'd'));
        if (c.specialRequirement) chips.appendChild(el('span', 'pill pill-warn', esc(c.specialRequirement)));

        const rule = QG.state.marginRule(c, buildShipment());
        const parts = [
            '<b>' + esc(rule.ruleId) + '</b>',
            'markup <b>' + rule.suggestMarkupPct + '%</b>',
            'min margin <b>' + rule.minMarginPct + '%</b>',
            'min profit <b>' + rule.minProfitTHB.toLocaleString() + '</b>'
        ];
        let html = parts.join(' · ');
        if (rule._overriddenBy) html += ' <span class="pill pill-override">override จาก CustomerProfile</span>';
        if (rule._outOfValidity) html += ' <span class="pill pill-danger">ไม่มี Rule ใดอยู่ในช่วง Validity ณ วันนี้</span>';
        $('#ruleChip').innerHTML = html;
    }

    function renderAirCalc() {
        const gross = parseFloat($('#inGrossKg').value) || 0;
        const cbm = parseFloat($('#inCbm').value) || 0;
        const vol = cbm * 1e6 / QG.engine.AIR_DIVISOR;
        $('#airVolKg').textContent = money(vol, 1) + ' kg';
        $('#airChgKg').textContent = money(Math.max(gross, vol), 1) + ' kg';
    }

    /* ---------- the shipment object every other module reads ---------- */

    function buildShipment() {
        const mode = $('#inMode').value;
        const gross = parseFloat($('#inGrossKg').value) || 0;
        const cbm = parseFloat($('#inCbm').value) || 0;
        const s = {
            customerNo: $('#inCustomer').value,
            asOf: $('#inAsOf').value || todayISO(),
            mode,
            jobClass: $('#inJobClass').value,
            serviceType: $('#inService').value,
            incoterm: $('#inIncoterm').value,
            pol: $('#inPol').value,
            pods: podRows.slice(),
            containers: mode === 'SEA' ? Object.assign({}, cntr) : {},
            grossKg: mode === 'AIR' ? gross : 0,
            cbm: mode === 'AIR' ? cbm : 0,
            validFrom: $('#inValidFrom').value,
            validTo: $('#inValidTo').value,
            showInactive: $('#inShowInactive').checked,
            fx: Object.assign({}, fx)
        };
        s.chargeableKg = mode === 'AIR' ? round(QG.engine.chargeableWeight(s), 1) : 0;
        return s;
    }

    /* ---------- scenario loader ---------- */

    function applyScenario(sc) {
        const s = sc.shipment;
        $('#inCustomer').value = s.customerNo;
        $('#inAsOf').value = s.asOf;
        $('#inMode').value = s.mode;
        renderService();
        $('#inJobClass').value = s.jobClass;
        $('#inService').value = s.serviceType;
        $('#inIncoterm').value = s.incoterm;
        $('#inPol').value = s.pol;
        $('#inValidFrom').value = s.validFrom;
        $('#inValidTo').value = s.validTo;
        $('#inShowInactive').checked = !!s.showInactive;
        $('#inGrossKg').value = s.grossKg || 0;
        $('#inCbm').value = s.cbm || 0;
        podRows = s.pods.slice();
        cntr = Object.assign({}, s.containers);
        fx = Object.assign({ USD: 36.5 }, s.fx);
        renderPods(); renderContainers(); renderFx(); renderAirCalc(); renderCustomerChips();
        return sc.pick || null;
    }

    /* ---------- init ---------- */

    function init(onChange) {
        _onChange = onChange;

        const cs = $('#inCustomer');
        QG.state.db.customerProfiles.forEach(c => {
            const o = el('option', null, esc(c.customerNo + ' — ' + c.customerName));
            o.value = c.customerNo;
            cs.appendChild(o);
        });
        cs.value = 'C-BRAVO';

        const pol = $('#inPol');
        allPorts().forEach(p => { const o = el('option', null, p); o.value = p; pol.appendChild(o); });
        pol.value = 'THLCH';

        const sc = $('#scenarioSel');
        QG.state.SCENARIOS.forEach(s => {
            const o = el('option', null, esc(s.label)); o.value = s.id; sc.appendChild(o);
        });

        $('#inAsOf').value = '2026-07-05';
        $('#inValidFrom').value = '2026-07-05';
        $('#inValidTo').value = '2026-09-30';

        renderService();
        renderPods(); renderContainers(); renderFx(); renderAirCalc(); renderCustomerChips();

        $('#inMode').onchange = () => { renderService(); _onChange(); };
        ['#inCustomer', '#inAsOf', '#inJobClass', '#inService', '#inIncoterm', '#inPol',
         '#inValidFrom', '#inValidTo', '#inShowInactive'].forEach(sel => {
            $(sel).onchange = () => { renderCustomerChips(); _onChange(); };
        });
        ['#inGrossKg', '#inCbm'].forEach(sel => {
            $(sel).oninput = () => { renderAirCalc(); _onChange(); };
        });
        $('#addPodBtn').onclick = () => {
            const ports = allPorts();
            const next = ports.find(p => podRows.indexOf(p) === -1 && p !== $('#inPol').value) || ports[0];
            podRows.push(next); renderPods(); _onChange();
        };
    }

    return { init, buildShipment, applyScenario, renderCustomerChips, CNTR_TYPES };
})();
