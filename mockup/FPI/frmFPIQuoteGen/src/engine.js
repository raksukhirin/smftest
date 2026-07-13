/* engine.js — FPI Pricing Engine.
   Implements FPI_Design_v0.3 §5 (rate selection, take-lower, suggested sell price)
   and the §6.2 margin formula applied as a *preview* at quote time (D1: the real
   gate is at Confirm Booking).

   Golden test: customer C-BRAVO, as-of 2026-07-05, THLCH → DEHAM + NLRTM, 2 × 40HQ,
   picking R-0001 / R-0002 reproduces quotations.json QSE26080001 line for line.
   See README.md → "Golden test". */
window.QG = window.QG || {};
window.QG.engine = (function () {
    'use strict';

    const { round, inRange } = QG.utils;

    /** Categories whose cost comes from the local tariff, not the carrier's rate sheet.
        Local charges are port/country charges — they do not vary by carrier. */
    const LOCAL_CATEGORIES = ['ORIGIN', 'DEST', 'CUSTOMS', 'TRUCKING'];

    /** IATA volumetric divisor (cm³ per kg). */
    const AIR_DIVISOR = 6000;

    /* ================================================================
       Rate candidate selection — §5.1 / D6
       ================================================================ */

    const RANK = {
        1: 'Contract ของลูกค้ารายนี้',
        2: 'Contract ของบริษัท',
        3: 'Spot / Carrier quote',
        4: 'Contract ของลูกค้ารายอื่น'
    };

    function rankOf(rate, customerNo) {
        if (rate.rateSource === 'CONTRACT') {
            if (rate.customerNo == null) return 2;
            return rate.customerNo === customerNo ? 1 : 4;
        }
        return 3;
    }

    /** Why a rate cannot be used as-of the quote date. null = usable. */
    function inactiveReason(rate, asOf) {
        if (rate.status === 'SUPERSEDED') return 'SUPERSEDED';
        if (rate.status === 'EXPIRED') return 'EXPIRED';
        if (rate.status === 'DRAFT') return 'DRAFT';
        if (asOf < rate.validFrom) return 'NOT_YET_VALID';
        if (asOf > rate.validTo) return 'EXPIRED';
        return null;
    }

    /** Walk SupersededBy until an active rate is found (§4.3, max depth 10). */
    function resolveChain(rate, asOf) {
        const chain = [rate.rateId];
        let cur = rate;
        for (let i = 0; i < 10; i++) {
            if (!inactiveReason(cur, asOf)) return { rate: cur, chain, exhausted: false };
            if (!cur.supersededBy) break;
            const next = QG.state.rate(cur.supersededBy);
            if (!next || chain.indexOf(next.rateId) !== -1) break;   // missing / loop guard
            chain.push(next.rateId);
            cur = next;
        }
        return { rate: inactiveReason(cur, asOf) ? null : cur, chain, exhausted: true };
    }

    /* ================================================================
       Quantity per Basis
       ================================================================ */

    function totalContainers(shipment) {
        return Object.values(shipment.containers || {}).reduce((a, b) => a + b, 0);
    }

    function qtyFor(basis, containerType, shipment) {
        switch (basis) {
            case 'PER_CNTR':
                return containerType
                    ? ((shipment.containers || {})[containerType] || 0)
                    : totalContainers(shipment);
            case 'PER_BL':
            case 'PER_SHPT':
            case 'PER_SET':
                return 1;
            case 'PER_KG':
                return shipment.chargeableKg || 0;
            case 'PER_CBM':
                return shipment.cbm || 0;
            case 'PER_WM':
                return Math.max((shipment.grossKg || 0) / 1000, shipment.cbm || 0);
            case 'PCT_OF_FREIGHT':
                return 1;    // resolved after the freight subtotal is known
            default:
                return 0;
        }
    }

    /** Chargeable weight = max(gross, volumetric). */
    function chargeableWeight(shipment) {
        const vol = (shipment.cbm || 0) * 1e6 / AIR_DIVISOR;
        return Math.max(shipment.grossKg || 0, vol);
    }

    /* ================================================================
       Cost source resolution — RateCharge vs LocalChargeTariff
       ================================================================ */

    /** Specificity score so the narrowest matching tariff wins. */
    function tariffScore(t) {
        return (t.portCode ? 8 : 0) + (t.carrierNo ? 4 : 0) +
               (t.serviceType ? 2 : 0) + (t.mode !== 'ALL' ? 1 : 0);
    }

    function findTariff(rc, rate, shipment) {
        const side = shipment.jobClass === 'EX' ? 'ORIGIN' : 'DEST';
        const hits = QG.state.db.localChargeTariff.filter(t =>
            t.subSysName === rc.subSysName &&
            t.jobClass === rc.jobClass &&
            t.expCode === rc.expCode &&
            t.status === 'CONFIRMED' &&
            inRange(shipment.asOf, t.validFrom, t.validTo) &&
            (t.side == null || t.side === side) &&
            (t.portCode == null || t.portCode === shipment.pol) &&
            (t.mode === 'ALL' || t.mode === shipment.mode) &&
            (t.serviceType == null || t.serviceType === shipment.serviceType) &&
            (t.carrierNo == null || t.carrierNo === rate.carrierNo) &&
            (t.containerType == null || t.containerType === rc.containerType)
        );
        hits.sort((a, b) => tariffScore(b) - tariffScore(a));
        return hits[0] || null;
    }

    /**
     * Cost for one charge line.
     * Local charges (ORIGIN/DEST/CUSTOMS/TRUCKING) prefer FPI_LocalChargeTariff;
     * carrier-specific charges (FREIGHT/SURCHARGE/REBATE) always come from FPI_RateCharge.
     * This is what makes BLFEE cost 1,200 (LT-0002) rather than the 1,500 sitting on the
     * rate sheet — matching FPI_QuoteRateRef in quotations.json.
     */
    function resolveCost(rc, rate, shipment) {
        if (LOCAL_CATEGORIES.indexOf(rc.category) !== -1) {
            const t = findTariff(rc, rate, shipment);
            if (t) {
                return {
                    unit: t.amount, currency: t.currencyCode, tariff: t,
                    source: { kind: 'TARIFF', tariffId: t.tariffId, ref: t.sourceRef, remark: t.remark,
                              validFrom: t.validFrom, validTo: t.validTo }
                };
            }
        }
        return {
            unit: rc.amount, currency: rc.currencyCode, tariff: null,
            source: { kind: 'RATE', rateChargeId: rc.rateChargeId, rateNo: rate.rateNo,
                      ref: rate.sourceRef, validFrom: rate.validFrom, validTo: rate.validTo }
        };
    }

    /* ================================================================
       Suggested sell price — §5.3 / D5
       ================================================================ */

    function sellUnitFor(pol, costUnit, tariff, rule) {
        const mode = pol ? pol.pricingMode : 'PASS';
        switch (mode) {
            case 'MARKUP':
                return { value: round(costUnit * (1 + rule.suggestMarkupPct / 100), 2), via: 'MARKUP +' + rule.suggestMarkupPct + '%' };
            case 'STD_SELL':
                // 1. OPITEMSUB customer price layer — not modelled in the mockup dataset
                // 2. FPI_LocalChargeTariff.StdSellAmount
                if (tariff && tariff.stdSellAmount != null) {
                    return { value: tariff.stdSellAmount, via: 'StdSellAmount (' + tariff.tariffId + ')' };
                }
                // 3. fallback = cost
                return { value: costUnit, via: 'STD_SELL fallback → ทุน (ไม่มี StdSellAmount)' };
            case 'PASS':
            default:
                return { value: costUnit, via: 'PASS → ขายเท่าทุน' };
        }
    }

    /* ================================================================
       Air weight break + take-lower — §5.2 / D7
       ================================================================ */

    /**
     * Given the FREIGHT rows that carry a WeightBreakKg, choose the cheapest lawful charge.
     *   normal = max(MIN, W × rate(break W falls into))
     *   take-lower also tries B.from × rate(B) for every break B above W
     * Returns { chosen, candidates } — candidates are kept for the "working" row in the UI.
     */
    function takeLower(breakRows, W, enabled) {
        const minRow = breakRows.find(r => r.weightBreakKg === 0) || null;
        const tiers = breakRows.filter(r => r.weightBreakKg > 0)
                               .sort((a, b) => a.weightBreakKg - b.weightBreakKg);
        const applicable = tiers.filter(t => W >= t.weightBreakKg).pop() || null;

        const candidates = [];
        if (applicable) {
            const total = W * applicable.amount;
            const minAmt = minRow ? minRow.amount : 0;
            if (total >= minAmt) {
                candidates.push({ kind: 'BREAK', row: applicable, qty: W, unit: applicable.amount, total,
                                  label: W + ' kg × ' + applicable.amount + ' (break +' + applicable.weightBreakKg + ')' });
            } else if (minRow) {
                candidates.push({ kind: 'MIN', row: minRow, qty: 1, unit: minRow.amount, total: minAmt,
                                  label: 'MIN เหมา (สูงกว่า ' + W + ' kg × ' + applicable.amount + ')' });
            }
        } else if (minRow) {
            candidates.push({ kind: 'MIN', row: minRow, qty: 1, unit: minRow.amount, total: minRow.amount,
                              label: 'MIN เหมา (น้ำหนักต่ำกว่า break แรก)' });
        }

        if (enabled) {
            tiers.filter(t => t.weightBreakKg > W).forEach(t => {
                candidates.push({ kind: 'BUMP', row: t, qty: t.weightBreakKg, unit: t.amount,
                                  total: t.weightBreakKg * t.amount,
                                  label: 'ดันเป็น ' + t.weightBreakKg + ' kg × ' + t.amount + ' (break +' + t.weightBreakKg + ')' });
            });
        }

        if (!candidates.length) return null;
        const chosen = candidates.reduce((a, b) => (b.total < a.total ? b : a));
        chosen.chosen = true;
        return { chosen, candidates };
    }

    /* ================================================================
       Price one lane option
       ================================================================ */

    function priceOption(rate, shipment, rule) {
        const charges = QG.state.chargesOf(rate.rateId);
        const fx = cur => (cur === 'THB' ? 1 : (shipment.fx[cur] != null ? shipment.fx[cur] : 0));
        const lines = [];
        const notes = [];

        // --- Air: collapse the weight-break FREIGHT rows into a single line ---
        const breakRows = charges.filter(c => c.category === 'FREIGHT' && c.weightBreakKg != null);
        const plainRows = charges.filter(c => breakRows.indexOf(c) === -1);

        if (breakRows.length) {
            const W = shipment.chargeableKg;
            const tl = takeLower(breakRows, W, rate.takeLowerEnabled);
            if (tl) {
                const rc = tl.chosen.row;
                const pol = QG.state.policy(rc.subSysName, rc.jobClass, rc.expCode);
                const cost = resolveCost(rc, rate, shipment);
                const sell = sellUnitFor(pol, tl.chosen.unit, cost.tariff, rule);
                lines.push(makeLine(rc, pol, {
                    qty: tl.chosen.qty, costUnit: tl.chosen.unit, currency: cost.currency,
                    source: cost.source, sell, fxRate: fx(cost.currency),
                    work: tl.candidates,
                    chargeName: rc.chargeName + (tl.chosen.kind === 'BUMP' ? ' — ดันน้ำหนัก' : '')
                }));
                if (tl.chosen.kind === 'BUMP') {
                    const normal = tl.candidates.find(c => c.kind !== 'BUMP');
                    if (normal) {
                        notes.push({ level: 'info', text:
                            'Take-lower (D7): น้ำหนักคิดค่าระวาง ' + W + ' kg — คิดตามปกติได้ ' +
                            round(normal.total, 2).toLocaleString() + ' ' + cost.currency +
                            ' แต่ดันเป็น ' + tl.chosen.qty + ' kg ได้ ' + round(tl.chosen.total, 2).toLocaleString() +
                            ' ' + cost.currency + ' → ประหยัด ' +
                            round(normal.total - tl.chosen.total, 2).toLocaleString() + ' ' + cost.currency });
                    }
                }
            }
        }

        // --- Everything else ---
        let freightCostTHB = 0;
        plainRows.forEach(rc => {
            if (rc.basis === 'PCT_OF_FREIGHT') return;      // second pass
            const q = qtyFor(rc.basis, rc.containerType, shipment);
            if (q <= 0) return;                             // charge does not apply to this shipment
            const pol = QG.state.policy(rc.subSysName, rc.jobClass, rc.expCode);
            const cost = resolveCost(rc, rate, shipment);
            const sell = sellUnitFor(pol, cost.unit, cost.tariff, rule);
            const line = makeLine(rc, pol, {
                qty: q, costUnit: cost.unit, currency: cost.currency,
                source: cost.source, sell, fxRate: fx(cost.currency)
            });
            lines.push(line);
            if (rc.category === 'FREIGHT') freightCostTHB += line.costTHB;
        });

        plainRows.filter(rc => rc.basis === 'PCT_OF_FREIGHT').forEach(rc => {
            const pol = QG.state.policy(rc.subSysName, rc.jobClass, rc.expCode);
            const costTHB = freightCostTHB * rc.amount / 100;
            const sell = sellUnitFor(pol, costTHB, null, rule);
            lines.push(makeLine(rc, pol, {
                qty: 1, costUnit: costTHB, currency: 'THB',
                source: { kind: 'RATE', rateChargeId: rc.rateChargeId, rateNo: rate.rateNo, ref: rate.sourceRef },
                sell, fxRate: 1
            }));
        });

        lines.forEach((l, i) => { l.seqNo = i + 1; });
        return { rate, lines, notes };
    }

    function makeLine(rc, pol, o) {
        const isRebate = !!(pol && pol.isRebate) || rc.category === 'REBATE';
        const costTHB = o.qty * o.costUnit * o.fxRate;
        const sellTHB = isRebate ? 0 : o.qty * o.sell.value * o.fxRate;
        return {
            key: rc.rateChargeId,
            seqNo: rc.seqNo,
            subSysName: rc.subSysName, jobClass: rc.jobClass, expCode: rc.expCode,
            chargeName: o.chargeName || rc.chargeName,
            category: rc.category, basis: rc.basis, containerType: rc.containerType,
            qty: o.qty,
            costUnit: o.costUnit,
            currency: o.currency,
            fxRate: o.fxRate,
            costTHB,
            pricingMode: pol ? pol.pricingMode : 'PASS',
            policyMissing: !pol,
            sellUnit: o.sell.value,
            sellVia: o.sell.via,
            sellTHB,
            isRebate,
            costOnly: isRebate,
            source: o.source,
            work: o.work || null,
            overridden: false,
            overrideReason: null,
            badFx: o.currency !== 'THB' && !(o.fxRate > 0)
        };
    }

    /** Re-derive THB totals after an inline sell-price override. */
    function applyOverride(line, sellUnit, reason) {
        line.sellUnit = sellUnit;
        line.sellTHB = line.costOnly ? 0 : line.qty * sellUnit * line.fxRate;
        line.overridden = true;
        line.overrideReason = reason;
        return line;
    }

    /* ================================================================
       Margin — §6.2 formula, previewed at quote time (D1)
       ================================================================ */

    function margin(lines, rule) {
        const sold = lines.filter(l => !l.costOnly).reduce((s, l) => s + l.sellTHB, 0);
        const cost = lines.reduce((s, l) => s + l.costTHB, 0);
        const kb   = lines.filter(l => l.isRebate).reduce((s, l) => s + l.costTHB, 0);
        const badFxLines = lines.filter(l => l.badFx).length;

        const m = sold - cost + kb;
        const base = sold + kb;
        const pct = base !== 0 ? m * 100 / base : null;

        let verdict, why;
        if (!lines.length) {
            verdict = 'BLOCKED'; why = 'ไม่มีบรรทัด Bill/Cost (fail-closed §6.2)';
        } else if (badFxLines) {
            verdict = 'BLOCKED'; why = badFxLines + ' บรรทัดสกุลต่างประเทศที่ FX = 0 (BadFx)';
        } else if (pct == null) {
            verdict = 'BLOCKED'; why = 'ฐานคำนวณ = 0';
        } else if (pct >= rule.minMarginPct && m >= rule.minProfitTHB) {
            verdict = 'PASS'; why = 'ผ่านเกณฑ์ ' + rule.ruleId;
        } else {
            const fails = [];
            if (pct < rule.minMarginPct) fails.push('Margin% < ' + rule.minMarginPct + '%');
            if (m < rule.minProfitTHB) fails.push('กำไร < ' + rule.minProfitTHB.toLocaleString() + ' THB');
            verdict = 'BELOW'; why = fails.join(' และ ');
        }
        return { sold, cost, kb, margin: m, pct, verdict, why, badFxLines };
    }

    /* ================================================================
       Good / Better / Best — computed from real cost + transit, never hardcoded
       ================================================================ */

    function tagGBB(opts) {
        opts.forEach(o => { o.gbb = null; });
        // GBB compares real carrier rates only — a Tier 2 history option is not a purchasable rate
        const act = opts.filter(o => o.active && o.margin && !o.margin.badFxLines && !o.historyOption);
        if (act.length < 2) return opts;

        const cost = o => o.margin.cost;
        const tt   = o => o.rate.transitDaysMax || 999;

        const best = act.reduce((a, b) => (cost(b) < cost(a) ? b : a));
        best.gbb = { key: 'best', label: 'Best value', hint: 'ทุน all-in ต่ำสุด' };

        const rest1 = act.filter(o => o !== best);
        const good = rest1.reduce((a, b) => {
            if (tt(b) !== tt(a)) return tt(b) < tt(a) ? b : a;
            return (b.rate.freeTimeDest || 0) > (a.rate.freeTimeDest || 0) ? b : a;
        }, rest1[0]);
        // only crown "fastest" if it actually beats Best on transit
        if (good && tt(good) < tt(best)) good.gbb = { key: 'good', label: 'Fastest', hint: 'transit สั้นสุด / free time ดีสุด' };

        const rest2 = act.filter(o => !o.gbb);
        if (rest2.length) {
            const cs = act.map(cost), ts = act.map(tt);
            const cMin = Math.min.apply(null, cs), cMax = Math.max.apply(null, cs);
            const tMin = Math.min.apply(null, ts), tMax = Math.max.apply(null, ts);
            const norm = (v, lo, hi) => (hi === lo ? 0 : (v - lo) / (hi - lo));
            const score = o => 0.5 * norm(cost(o), cMin, cMax) + 0.5 * norm(tt(o), tMin, tMax);
            const better = rest2.reduce((a, b) => (score(b) < score(a) ? b : a));
            better.gbb = { key: 'better', label: 'Balanced', hint: 'สมดุลทุน/transit (50:50)' };
        }
        return opts;
    }

    /* ================================================================
       Build every lane option for the shipment
       ================================================================ */

    function buildLane(pod, shipment, rule) {
        const all = QG.state.db.rateHeaders.filter(r =>
            r.mode === shipment.mode &&
            r.jobClass === shipment.jobClass &&
            r.serviceType === shipment.serviceType &&
            r.pol === shipment.pol &&
            r.pod === pod
        );

        const opts = all.map(rate => {
            const reason = inactiveReason(rate, shipment.asOf);
            const priced = priceOption(rate, shipment, rule);
            const opt = {
                rate,
                rateId: rate.rateId,
                active: !reason,
                inactiveReason: reason,
                rank: rankOf(rate, shipment.customerNo),
                rankLabel: RANK[rankOf(rate, shipment.customerNo)],
                lines: priced.lines,
                notes: priced.notes,
                margin: margin(priced.lines, rule),
                chain: null,
                chainDelta: null
            };
            if (reason === 'SUPERSEDED') {
                const res = resolveChain(rate, shipment.asOf);
                opt.chain = res;
                if (res.rate) {
                    const succ = priceOption(res.rate, shipment, rule);
                    const succM = margin(succ.lines, rule);
                    opt.chainDelta = succM.cost - opt.margin.cost;
                    opt.chainTargetNo = res.rate.rateNo;
                }
            }
            return opt;
        });

        // §5.1 ordering: contract-first, then cheapest
        opts.sort((a, b) => {
            if (a.active !== b.active) return a.active ? -1 : 1;
            if (a.rank !== b.rank) return a.rank - b.rank;
            return a.margin.cost - b.margin.cost;
        });

        tagGBB(opts);
        const recommended = opts.find(o => o.active) || null;
        if (recommended) recommended.recommended = true;

        return {
            pod,
            candidates: opts,
            activeCount: opts.filter(o => o.active).length,
            recommendedRateId: recommended ? recommended.rateId : null,
            selectedRateId: recommended ? recommended.rateId : null
        };
    }

    /* ================================================================
       Tier 2 — build a quote option from history (§5.4 / D11)
       Indicative only: figures are per-shipment THB from vFPI_LaneHistory,
       every line is flagged historyBased and can never be auto-filled as a
       confirmed cost. The whole option demands a ManualReason.
       ================================================================ */

    function buildHistoryOption(pod, shipment, rule, picks) {
        const h = QG.history.lookup(shipment.pol, pod);
        const costByCode = {};
        h.cost.forEach(c => { costByCode[c.expCode] = c; });

        const lines = (picks || []).map((code, i) => {
            const sell = h.sell.find(s => s.expCode === code);
            if (!sell) return null;
            const cost = costByCode[code] || null;
            const sellUnit = sell.lastUnitTHB;
            const costUnit = cost ? cost.lastUnitTHB : 0;
            return {
                key: 'HIST-' + code,
                seqNo: i + 1,
                subSysName: shipment.mode === 'AIR' ? 'AF' : 'SF',
                jobClass: shipment.jobClass,
                expCode: code,
                chargeName: code + ' — อิงประวัติ',
                category: 'OTHER', basis: 'PER_SHPT', containerType: null,
                qty: 1, costUnit, currency: 'THB', fxRate: 1,
                costTHB: costUnit,
                pricingMode: 'STD_SELL', policyMissing: false,
                sellUnit, sellVia: 'อิงประวัติ (ล่าสุด ' + sell.lastDate + ')',
                sellTHB: sellUnit,
                isRebate: false, costOnly: false,
                source: {
                    kind: 'HISTORY', reliability: sell.reliability,
                    jobNo: sell.lastJobNo, lastDate: sell.lastDate,
                    ref: sell.count + ' ครั้ง · median ' + sell.medianUnitTHB.toLocaleString() +
                         (cost ? '' : ' · ไม่มีประวัติต้นทุน (Margin สูงเกินจริง)')
                },
                work: null, overridden: false, overrideReason: null,
                badFx: false, historyBased: true
            };
        }).filter(Boolean);

        const pseudo = {
            rateId: 'HIST-' + pod, rateNo: 'อิงประวัติ',
            carrierName: 'ราคาอ้างอิงจากประวัติ (Tier 2)',
            routing: null, transitDaysMin: null, transitDaysMax: null, freeTimeDest: null,
            validFrom: null, validTo: null, status: 'HISTORY',
            rateSource: 'HISTORY', customerNo: null
        };
        return {
            rate: pseudo, rateId: pseudo.rateId,
            active: true, inactiveReason: null,
            rank: 5, rankLabel: 'อิงประวัติ (Tier 2 · Indicative)',
            lines, notes: [], margin: margin(lines, rule),
            chain: null, chainDelta: null, historyOption: true
        };
    }

    return {
        LOCAL_CATEGORIES, RANK, AIR_DIVISOR,
        rankOf, inactiveReason, resolveChain,
        qtyFor, chargeableWeight, totalContainers,
        findTariff, resolveCost, sellUnitFor, takeLower,
        priceOption, applyOverride, margin, tagGBB, buildLane, buildHistoryOption
    };
})();
