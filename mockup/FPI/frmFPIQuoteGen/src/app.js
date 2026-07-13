/* app.js — bootstrap + the recompute pipeline.
   recompute()  rebuild every lane from the engine, preserving selections/overrides
   rerender()   redraw the panels from the current state (no re-pricing) */
window.QG = window.QG || {};
window.QG.app = (function () {
    'use strict';

    const { $, esc, money } = QG.utils;
    const { state } = QG.state;

    let _rule = null;

    /* ---------------- reason modal ---------------- */

    function askReason(title, desc, current) {
        return new Promise(resolve => {
            const m = $('#reasonModal');
            $('#reasonTitle').textContent = title;
            $('#reasonDesc').innerHTML = desc;
            $('#reasonText').value = current || '';
            $('#reasonErr').classList.add('hidden');
            m.classList.remove('hidden');
            setTimeout(() => $('#reasonText').focus(), 0);

            const done = val => {
                m.classList.add('hidden');
                $('#reasonOk').onclick = null;
                $('#reasonCancel').onclick = null;
                resolve(val);
            };
            $('#reasonOk').onclick = () => {
                const v = $('#reasonText').value.trim();
                if (v.length < 5) { $('#reasonErr').classList.remove('hidden'); return; }
                done(v);
            };
            $('#reasonCancel').onclick = () => done(null);
        });
    }

    /* ---------------- rebuild ---------------- */

    function recompute() {
        const ship = QG.input.buildShipment();
        state.shipment = ship;

        const cust = QG.state.customer(ship.customerNo);
        _rule = QG.state.marginRule(cust, ship);

        const prevSel = {};
        state.lanes.forEach(l => { prevSel[l.pod] = l.selectedRateId; });

        state.lanes = ship.pods.map(pod => {
            const lane = QG.engine.buildLane(pod, ship, _rule);
            // keep the user's pick when it is still a candidate
            if (prevSel[pod] && lane.candidates.some(o => o.rateId === prevSel[pod])) {
                lane.selectedRateId = prevSel[pod];
            }
            return lane;
        });
        if (state.activeLaneIdx >= state.lanes.length) state.activeLaneIdx = 0;

        state.lanes.forEach(lane => injectHistoryOption(lane));
        state.lanes.forEach(lane => applyLaneMutations(lane));
        rerender();
    }

    /** If the user picked Tier 2 history figures for a lane, add a synthetic option
        and select it when no real active rate exists (D11 fallback). */
    function injectHistoryOption(lane) {
        const picks = state.historyPicks[lane.pod];
        if (!picks || !picks.length) return;
        const opt = QG.engine.buildHistoryOption(lane.pod, state.shipment, _rule, picks);
        if (!opt.lines.length) return;
        lane.candidates.push(opt);
        if (!lane.activeCount) {
            lane.selectedRateId = opt.rateId;      // no carrier rate → history is the working option
        }
    }

    /** Re-apply add-ons and sell overrides on top of freshly-priced lines. */
    function applyLaneMutations(lane) {
        lane.candidates.forEach(opt => {
            opt._rule = _rule;

            // 1. optional local-charge add-ons (tariff lines the rate sheet does not carry)
            Object.keys(state.addons).forEach(key => {
                if (!state.addons[key]) return;
                const parts = key.split('|');
                if (parts[0] !== lane.pod) return;
                const t = QG.state.db.localChargeTariff.find(x => x.tariffId === parts[1]);
                if (!t || opt.lines.some(l => l.expCode === t.expCode)) return;
                opt.lines.push(addonLine(t, opt.rate));
            });

            // 2. inline sell overrides
            opt.lines.forEach(l => {
                const ov = state.overrides[lane.pod + '|' + opt.rateId + '|' + l.key];
                if (ov) QG.engine.applyOverride(l, ov.sellUnit, ov.reason);
            });

            opt.lines.forEach((l, i) => { l.seqNo = i + 1; });
            opt.margin = QG.engine.margin(opt.lines, _rule);
        });
        QG.engine.tagGBB(lane.candidates);
    }

    function addonLine(t, rate) {
        const ship = state.shipment;
        const pol = QG.state.policy(t.subSysName, t.jobClass, t.expCode);
        const sell = QG.engine.sellUnitFor(pol, t.amount, t, _rule);
        const q = QG.engine.qtyFor(t.basis, t.containerType, ship);
        const fx = t.currencyCode === 'THB' ? 1 : (ship.fx[t.currencyCode] || 0);
        const isRebate = !!(pol && pol.isRebate);
        return {
            key: t.tariffId, seqNo: 99,
            subSysName: t.subSysName, jobClass: t.jobClass, expCode: t.expCode,
            chargeName: t.chargeName, category: 'CUSTOMS', basis: t.basis, containerType: t.containerType,
            qty: q, costUnit: t.amount, currency: t.currencyCode, fxRate: fx,
            costTHB: q * t.amount * fx,
            pricingMode: pol ? pol.pricingMode : 'PASS', policyMissing: !pol,
            sellUnit: sell.value, sellVia: sell.via,
            sellTHB: isRebate ? 0 : q * sell.value * fx,
            isRebate, costOnly: isRebate,
            source: { kind: 'TARIFF', tariffId: t.tariffId, ref: t.sourceRef, remark: t.remark,
                      validFrom: t.validFrom, validTo: t.validTo },
            work: null, overridden: false, overrideReason: null,
            badFx: t.currencyCode !== 'THB' && !(fx > 0)
        };
    }

    /* ---------------- render ---------------- */

    function rerender() {
        QG.options.render(onSelectRate);
        const lane = state.lanes[state.activeLaneIdx];
        const opt = lane ? lane.candidates.find(o => o.rateId === lane.selectedRateId) : null;

        QG.grid.render(lane, opt, { onOverride: onOverride, onToggleAddon: onToggleAddon });
        if (lane) QG.margin.renderAlerts(lane, opt, _rule);
        QG.margin.render(_rule);
        renderHistory(lane, opt);
    }

    function renderHistory(lane, opt) {
        const card = $('#historyCard');
        const body = $('#historyBody');
        if (!lane) { card.classList.add('hidden'); return; }

        const h = QG.history.lookup(state.shipment.pol, lane.pod);
        const show = !opt || !opt.active || !lane.activeCount;
        if (!show || (!h.sell.length && !h.cost.length)) { card.classList.add('hidden'); return; }
        card.classList.remove('hidden');

        if (!h.sell.length && !h.cost.length) {
            body.innerHTML = '<p class="text-xs text-slate-400">ไม่มีประวัติใน lane นี้</p>';
            return;
        }

        const picks = state.historyPicks[lane.pod] || [];

        const tbl = (rows, pickable) => rows.length
            ? '<table class="w-full text-[11px]"><thead><tr class="text-slate-400 text-left border-b border-slate-100">' +
              '<th class="py-1 font-medium">ExpCode</th><th class="font-medium text-right">ครั้ง</th>' +
              '<th class="font-medium text-right">ล่าสุด/หน่วย</th><th class="font-medium text-right">Median</th>' +
              '<th class="font-medium">วันที่</th><th class="font-medium">แหล่ง</th>' +
              (pickable ? '<th class="font-medium text-right">ใช้</th>' : '') + '</tr></thead><tbody>' +
              rows.map(r => {
                  const on = picks.indexOf(r.expCode) !== -1;
                  return '<tr class="border-b border-slate-50' + (on ? ' bg-amber-50' : '') + '"><td class="py-1 font-mono">' + esc(r.expCode) + '</td>' +
                  '<td class="text-right tabular">' + r.count + '</td>' +
                  '<td class="text-right tabular font-medium">' + money(r.lastUnitTHB, 2) + '</td>' +
                  '<td class="text-right tabular text-slate-500">' + money(r.medianUnitTHB, 2) + '</td>' +
                  '<td class="font-mono text-slate-500">' + esc(r.lastDate || '—') + '</td>' +
                  '<td><span class="pill pill-info">' + esc(r.reliability) + '</span> ' +
                  '<span class="text-[10px] text-slate-400 font-mono">' + esc(r.lastJobNo) + '</span></td>' +
                  (pickable
                    ? '<td class="text-right"><button data-hpick="' + esc(r.expCode) + '" class="text-[10px] font-medium ' +
                      (on ? 'text-rose-600' : 'text-teal-700') + ' hover:underline">' + (on ? '✕ เอาออก' : '＋ ใช้') + '</button></td>'
                    : '') + '</tr>';
              }).join('') +
              '</tbody></table>'
            : '<p class="text-[11px] text-slate-400">—</p>';

        body.innerHTML =
            '<div class="alert alert-warn mb-2"><span>⚠</span><span>ข้อมูลชั้น <b>Tier 2 (Indicative)</b> — ' +
            'ห้าม Auto-fill เป็น Cost ยืนยัน (D11). ถ้านำไปใช้ ต้องกรอกมือพร้อมเหตุผล และธง “อิงประวัติ” จะติดไปถึง Booking</span></div>' +
            (picks.length
                ? '<div class="alert alert-info mb-2"><span>✎</span><span>สร้างใบเสนอราคาจากประวัติ <b>' + picks.length + '</b> บรรทัด' +
                  (state.historyReason[lane.pod] ? ' — <b>' + esc(state.historyReason[lane.pod]) + '</b>' : '') +
                  ' <button id="histClear" class="ml-1 text-rose-600 hover:underline">ล้างทั้งหมด</button></span></div>'
                : '') +
            '<div class="text-[11px] font-semibold text-slate-600 mb-1">ราคาขายที่เคยเรียกเก็บ (JOB_SELL) — เลือกมาสร้างใบเสนอราคา</div>' + tbl(h.sell, true) +
            '<div class="text-[11px] font-semibold text-slate-600 mt-3 mb-1">ต้นทุนที่เคยจ่ายจริง (JOB_COST) — ใช้ประเมิน Margin</div>' + tbl(h.cost, false) +
            '<div class="mt-2 text-[10px] text-slate-400">อ้างอิง ' + h.sampleRows + ' บรรทัดใน lane นี้' +
            (h.outliersOnLane.length ? ' · <span class="text-amber-600">ตัด outlier ' + h.outliersOnLane.length + ' บรรทัด</span>' : '') +
            (h.noLaneCount ? ' · <span class="text-amber-600">' + h.noLaneCount + ' บรรทัดในระบบไม่มี Port (Job เก่า) — ไม่ถูกนำมาเฉลี่ย</span>' : '') +
            '</div>';

        body.querySelectorAll('[data-hpick]').forEach(btn => {
            btn.onclick = () => onHistoryPick(lane.pod, btn.getAttribute('data-hpick'));
        });
        const clr = $('#histClear');
        if (clr) clr.onclick = () => {
            delete state.historyPicks[lane.pod];
            delete state.historyReason[lane.pod];
            recompute();
        };
    }

    /** Toggle one history ExpCode into/out of the quote. First pick asks for the reason (D11). */
    async function onHistoryPick(pod, code) {
        const cur = state.historyPicks[pod] || [];
        const idx = cur.indexOf(code);
        if (idx !== -1) {
            cur.splice(idx, 1);
            if (!cur.length) { delete state.historyPicks[pod]; delete state.historyReason[pod]; }
            else state.historyPicks[pod] = cur;
            recompute();
            return;
        }
        if (!cur.length) {
            const reason = await askReason(
                'สร้างใบเสนอราคาจากประวัติ — ต้องระบุเหตุผล (D11)',
                'Lane <b>' + esc(state.shipment.pol) + ' → ' + esc(pod) + '</b> ไม่มี Rate ใน Rate KB. ' +
                'ราคาที่นำมาจาก <b>vFPI_LaneHistory (Tier 2 · Indicative)</b> — ' +
                'ธง “อิงประวัติ” + เหตุผลนี้จะติดไปถึง Booking และ<b>ห้าม</b>ถูกใช้ Auto-fill เป็น Cost ยืนยัน',
                state.historyReason[pod]);
            if (!reason) return;
            state.historyReason[pod] = reason;
        }
        state.historyPicks[pod] = cur.concat(code);
        recompute();
    }

    /* ---------------- interactions ---------------- */

    async function onSelectRate(laneIdx, rateId, opt) {
        const lane = state.lanes[laneIdx];
        state.activeLaneIdx = laneIdx;

        // history option carries its own reason captured when the figures were picked
        if (opt.historyOption) { lane.selectedRateId = rateId; rerender(); return; }

        const needsReason = !opt.active || opt.rank === 4 || rateId !== lane.recommendedRateId;
        if (needsReason) {
            const why = [];
            if (opt.rank === 4) why.push('เป็น Contract ของ <b>' + esc(opt.rate.customerNo) + '</b> ไม่ใช่ของลูกค้ารายนี้');
            if (!opt.active) why.push('อยู่ในสถานะ <b>' + esc(QG.options.INACTIVE_LABEL[opt.inactiveReason]) + '</b> ณ ' + esc(state.shipment.asOf));
            if (rateId !== lane.recommendedRateId && lane.recommendedRateId) {
                const rec = lane.candidates.find(o => o.rateId === lane.recommendedRateId);
                why.push('ระบบแนะนำ <b class="font-mono">' + esc(rec.rate.rateNo) + '</b> (' + esc(rec.rankLabel) + ') ตาม §5.1');
            }
            const key = lane.pod + '|' + rateId;
            const reason = await askReason(
                'เลือกข้ามลำดับ — ต้องระบุเหตุผล (D6)',
                'Rate <b class="font-mono">' + esc(opt.rate.rateNo) + '</b>: ' + why.join(' · ') +
                '<br><br>เหตุผลนี้จะถูกบันทึกลง <code>FPI_QuoteRateRef.ManualReason</code> และติดไปถึง Booking',
                state.rateReason[key]);
            if (!reason) return;               // cancelled → keep previous selection
            state.rateReason[key] = reason;
        }

        lane.selectedRateId = rateId;
        rerender();
    }

    async function onOverride(line, newSell, revert) {
        const lane = state.lanes[state.activeLaneIdx];
        const key = lane.pod + '|' + lane.selectedRateId + '|' + line.key;
        const engineSell = line.overridden
            ? (state.overrides[key] ? state.overrides[key]._engineSell : line.sellUnit)
            : line.sellUnit;

        const reason = await askReason(
            'แก้ราคาขาย — ต้องระบุเหตุผล (D6)',
            '<b>' + esc(line.chargeName) + '</b> (' + esc(line.expCode) + ')<br>' +
            'ราคาแนะนำจากเอนจิน: <b>' + money(engineSell, 2) + '</b> (' + esc(line.sellVia) + ')<br>' +
            'ราคาที่กรอก: <b class="text-pink-700">' + money(newSell, 2) + '</b> ' +
            '(' + (newSell >= engineSell ? '+' : '') + money(newSell - engineSell, 2) + ')',
            state.overrides[key] ? state.overrides[key].reason : '');

        if (!reason) { revert(); return; }
        state.overrides[key] = { sellUnit: newSell, reason, _engineSell: engineSell };
        recompute();
    }

    function onToggleAddon(key, on) {
        if (on) state.addons[key] = true; else delete state.addons[key];
        recompute();
    }

    /* ---------------- boot ---------------- */

    async function boot() {
        await QG.state.load();
        $('#statRates').textContent = QG.state.db.rateHeaders.length;
        $('#statPolicy').textContent = QG.state.db.chargePolicy.length;
        $('#statSource').textContent = state.source;

        QG.grid.init();
        QG.input.init(recompute);

        $('#genBtn').onclick = () => {
            state.overrides = {}; state.addons = {}; state.rateReason = {};
            state.historyPicks = {}; state.historyReason = {};
            state.lanes = [];
            recompute();
        };
        $('#exportBtn').onclick = QG.print.exportJson;
        $('#printBtn').onclick = QG.print.open;

        $('#scenarioSel').onchange = e => {
            const sc = QG.state.SCENARIOS.find(s => s.id === e.target.value);
            if (!sc) return;
            state.overrides = {}; state.addons = {}; state.rateReason = {};
            state.historyPicks = {}; state.historyReason = {}; state.lanes = [];
            state.activeLaneIdx = 0;
            const pick = QG.input.applyScenario(sc);
            recompute();
            if (pick) {
                state.lanes.forEach(lane => {
                    const want = pick[lane.pod];
                    if (want && lane.candidates.some(o => o.rateId === want)) {
                        lane.selectedRateId = want;
                        if (want !== lane.recommendedRateId) {
                            state.rateReason[lane.pod + '|' + want] = 'ตั้งค่าโดย scenario ' + sc.id + ' — ' + sc.note;
                        }
                    }
                });
                rerender();
            }
        };

        recompute();
    }

    return { boot, recompute, rerender, askReason };
})();

document.addEventListener('DOMContentLoaded', () => QG.app.boot());
