// SMF Approval Workflow mockup — vanilla JS. State lives in localStorage (key AF_STATE); Reset re-seeds from data.js.
(function () {
    var KEY = 'AF_STATE_v1', ME = window.AF_ME, NOW = window.AF_NOW, STEPS = window.AF_STEPS, MODS = window.AF_MODULES;
    var $ = function (s) { return document.querySelector(s); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

    // Inside SMFDash.Web (window.SMF = bridge to the read-only DB queries) the data comes from the approval tables (see liveLoad at the end);
    // in a plain browser the demo data below is used. WF = steps per 'module|doctype' (live only).
    var live = null, WF = null;
    var data;
    try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { data = null; }
    if (!data) data = JSON.parse(JSON.stringify(window.AF_SEED));
    if (window.SMF) data = [];   // never show the demo requests as if they were real while the DB is being read
    function save() { if (live) return; try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
    var NOTE = function () { return live ? ' (preview only - not written to the DB)' : ''; };

    var st = { page: 'approval', view: 'inbox', tStatus: 'active', tOwner: 'all', tGroup: 'risk', mod: 'SE', tab: 'pending', q: '', step: 'all', mine: 'mine', late: false, sel: {}, open: null, dt: 'all', tdt: '' };

    /* ---------- helpers ---------- */
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function fmt(iso) { if (!iso) return '—'; var d = new Date(iso); return ('0' + d.getDate()).slice(-2) + ' ' + MON[d.getMonth()] + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
    function ago(iso) {
        if (!iso) return '';
        var m = Math.round((NOW - new Date(iso)) / 60000);
        return m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago';
    }
    function steps(r) { return (WF && WF[r.module + '|' + r.type]) || STEPS; }
    function step(r) { return steps(r)[r.step - 1] || { no: r.step, name: 'Step ' + r.step, approver: '—' }; }
    function isDone(r, s) { return r.doneSet ? r.doneSet.indexOf(s) >= 0 : s <= r.doneSteps; }
    function doneN(r) { return r.doneSet ? r.doneSet.length : r.doneSteps; }
    function canAct(r) { if (r.status !== 'Wait') return false; var s = step(r); return s.approvers ? s.approvers.indexOf(ME) >= 0 : s.approver === ME; }
    function isLate(r) { return r.status === 'Wait' && r.deadline && new Date(r.deadline + 'T23:59') < NOW; }
    function pct(r) { return Math.round(doneN(r) / steps(r).length * 100); }
    function byId(id) { return data.filter(function (r) { return r.id === id; })[0]; }
    function statusChip(r) {
        if (r.status === 'Approved') return '<span class="chip c-ok">Approved</span>';
        if (r.status === 'Rejected') return '<span class="chip c-bad">Rejected</span>';
        return '<span class="chip c-wait">Wait</span>' + (canAct(r) ? '' : '<div class="sub mt-0.5">for ' + esc(step(r).approver) + '</div>');
    }
    function toast(msg, undo) {
        var t = $('#toast'); t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button id="undo">UNDO</button>' : ''); t.classList.remove('hidden');
        if (undo) $('#undo').onclick = function () { undo(); t.classList.add('hidden'); };
        clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.add('hidden'); }, 6000);
    }

    /* ---------- actions ---------- */
    function decide(r, action, remark) {
        var before = JSON.stringify(r);
        r.status = action;
        if (action === 'Approved') { if (r.doneSet) { if (r.doneSet.indexOf(r.step) < 0) r.doneSet.push(r.step); } else r.doneSteps = r.step; }
        r.history.push({ step: r.step, action: action, by: ME, at: NOW.toISOString().slice(0, 16), remark: remark || '' });
        delete st.sel[r.id]; save();
        return function undo() { Object.assign(r, JSON.parse(before)); save(); render(); };
    }
    function approveMany(ids) {
        var undos = ids.map(function (id) { return decide(byId(id), 'Approved', ''); });
        toast(ids.length + ' request(s) approved' + NOTE(), function () { undos.forEach(function (u) { u(); }); });
        render();
    }

    /* ---------- list ---------- */
    function inMod(r) { return r.module === st.mod && (st.dt === 'all' || r.type === st.dt); }
    function hay(r) { return (r.doc + ' ' + r.sum.shipper + ' ' + r.sum.consignee + ' ' + (r.sum.customer || '') + ' ' + r.requestedBy + ' ' + r.remark).toLowerCase(); }
    function visible() {
        var q = st.q.toLowerCase();
        return data.filter(function (r) {
            if (!inMod(r)) return false;
            if (st.tab === 'pending' && r.status !== 'Wait') return false;
            if (st.tab === 'approved' && r.status !== 'Approved') return false;
            if (st.tab === 'rejected' && r.status !== 'Rejected') return false;
            if (st.step !== 'all' && (live ? step(r).name : String(r.step)) !== st.step) return false;
            if (st.mine === 'mine' && st.tab === 'pending' && !canAct(r)) return false;
            if (st.late && !isLate(r)) return false;
            if (q && hay(r).indexOf(q) < 0) return false;
            return true;
        }).sort(live ? function (a, b) { return b.reqNo - a.reqNo || b.id - a.id; } : function (a, b) { return new Date(b.requestedAt) - new Date(a.requestedAt); });   // live: newest REQNO first
    }

    // live only: document types of the selected module (each has its own workflow)
    function typesOf(mod) { var t = {}; data.forEach(function (r) { if (r.module === mod) t[r.type] = 1; }); return Object.keys(t).sort(); }

    function rowHtml(r) {
        var act = canAct(r);
        return '<div class="row ' + (st.sel[r.id] ? 'sel' : '') + '" data-id="' + r.id + '">' +
            '<div class="ck">' + (act ? '<input type="checkbox" data-ck="' + r.id + '"' + (st.sel[r.id] ? ' checked' : '') + '>' : '') + '</div>' +
            '<div class="c-doc"><div class="docno">' + esc(r.doc) + '</div><div class="sub">' + esc(r.type) + ' · ' + esc(r.requestedBy) + '</div></div>' +
            '<div class="c-st">' + statusChip(r) + '</div>' +
            '<div class="c-date"><div class="text-xs">' + fmt(r.requestedAt) + '</div><div class="sub">' + ago(r.requestedAt) +
                (isLate(r) ? ' · <span class="chip c-late">overdue</span>' : r.deadline ? ' · due ' + esc(r.deadline.slice(5)) : '') + '</div></div>' +
            '<div class="c-step"><div class="step-name">' + String(r.step).padStart(2, '0') + ' ' + esc(step(r).name) + '</div>' +
                '<div class="sub truncate">' + esc(r.remark || (r.sum.shipper || r.sum.consignee ? r.sum.shipper + ' → ' + r.sum.consignee : r.sum.customer || r.sum.jobType)) + '</div></div>' +
            '<div class="c-file"><span class="files ' + (r.files.length ? '' : 'none') + '">' + (r.files.length ? '📎 ' + r.files.length + (r.files.length > 1 ? ' FILES' : ' FILE') : 'NO FILE') + '</span></div>' +
            '<div class="c-act">' + (act ? '<span class="quick"><button class="a" data-q="A" data-id="' + r.id + '">APP.</button><button class="r" data-q="R" data-id="' + r.id + '">REJ.</button></span>' : '') + '</div>' +
            '</div>';
    }

    function renderList() {
        var rows = visible(), tabs = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']];
        var m = data.filter(inMod);
        var cnt = { pending: m.filter(function (r) { return r.status === 'Wait'; }).length, approved: m.filter(function (r) { return r.status === 'Approved'; }).length,
                    rejected: m.filter(function (r) { return r.status === 'Rejected'; }).length, all: m.length };
        $('#tabs').innerHTML = tabs.map(function (t) { return '<button class="tab ' + (st.tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '<span class="c">' + cnt[t[0]] + '</span></button>'; }).join('');
        var mod = MODS.filter(function (x) { return x.id === st.mod; })[0] || { name: st.mod };
        var mineN = m.filter(function (r) { return canAct(r); }).length;
        $('#listTitle').textContent = mod.name + ' — Approval Requests';
        $('#listSub').textContent = mineN + ' waiting for you · ' + cnt.pending + ' pending in total';
        var stepOpts;
        if (live) {   // steps of the chosen document type (all types of the module when "All types"), listed by name
            var nm = {}, order = []; typesOf(st.mod).forEach(function (t) { if (st.dt === 'all' || st.dt === t) (WF[st.mod + '|' + t] || []).forEach(function (s) { if (!nm[s.name]) { nm[s.name] = 1; order.push(s.name); } }); });
            stepOpts = order.map(function (n) { return '<option value="' + esc(n) + '"' + (st.step === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
            $('#fDoc').innerHTML = '<option value="all">All types</option>' + typesOf(st.mod).map(function (t) { return '<option value="' + esc(t) + '"' + (st.dt === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('');
        } else stepOpts = STEPS.map(function (s) { return '<option value="' + s.no + '"' + (st.step === String(s.no) ? ' selected' : '') + '>' + String(s.no).padStart(2, '0') + ' ' + s.name + '</option>'; }).join('');
        $('#fStep').innerHTML = '<option value="all">All working steps</option>' + stepOpts;
        $('#fMine').value = st.mine; $('#fLate').checked = st.late;

        var head = '<div class="row head"><div></div><div>Docno</div><div>Status</div><div>Requested</div><div>Working step / remark</div><div>Attached</div><div></div></div>';
        $('#list').innerHTML = rows.length ? head + rows.map(rowHtml).join('') : '<div class="empty">No requests match.</div>';

        var n = Object.keys(st.sel).length; $('#bulk').classList.toggle('hidden', !n); $('#bulkN').textContent = n;
    }

    function renderNav() {
        $('#modNav').innerHTML = MODS.map(function (x) {
            var n = data.filter(function (r) { return r.module === x.id && canAct(r); }).length;
            return '<button class="nav-i ' + (st.page !== 'alerts' && st.mod === x.id ? 'on' : '') + '" data-mod="' + x.id + '"><span>' + x.icon + '</span>' + x.name + '<span class="n ' + (n ? '' : 'z') + '">' + n + '</span></button>';
        }).join('');
    }


    /* ---------- Timeline Mgt ---------- */
    var SLA_WARN = 24, SLA_LATE = 48;   // hours a request may wait at one step before it is "at risk" / "stalled"
    function lastAt(r, stepNo, action) { var t = null; r.history.forEach(function (h) { if (h.step === stepNo && h.action === action) t = h.at; }); return t; }
    function ageH(r) { return (NOW - new Date(lastAt(r, r.step, 'Requested') || r.requestedAt)) / 3600000; }
    function ageTxt(h) { return h < 1 ? '<1h' : h < 48 ? Math.round(h) + 'h' : (h / 24).toFixed(1) + 'd'; }
    function risk(r) {
        if (r.status === 'Rejected') return 'rej';
        if (r.status === 'Approved') return doneN(r) >= steps(r).length ? 'done' : 'ok';
        var a = ageH(r);
        return isLate(r) || a >= SLA_LATE ? 'late' : a >= SLA_WARN ? 'warn' : 'ok';
    }
    var RISK_NAME = { late: 'Stalled / overdue', warn: 'At risk', ok: 'On track', rej: 'Rejected', done: 'Completed' };

    // live: the matrix has one column per step of ONE document type; a document appears once (its newest request, the list is REQNO DESC)
    function tlSteps() { return live ? (WF[st.mod + '|' + st.tdt] || []) : STEPS; }
    function tlRows() {
        var q = st.q.toLowerCase(), seen = {};
        return data.filter(function (r) {
            if (r.module !== st.mod) return false;
            if (live) { if (r.type !== st.tdt || seen[r.doc]) return false; seen[r.doc] = 1; }
            var k = risk(r);
            if (st.tStatus === 'active' && (k === 'rej' || k === 'done')) return false;
            if (st.tStatus === 'risk' && k !== 'warn' && k !== 'late') return false;
            if (st.tStatus === 'rej' && k !== 'rej') return false;
            if (st.tStatus === 'done' && k !== 'done') return false;
            if (st.tOwner !== 'all' && (r.status !== 'Wait' || step(r).approver !== st.tOwner)) return false;
            if (q && hay(r).indexOf(q) < 0) return false;
            return true;
        });
    }

    function tlCell(r, s) {
        var sp = steps(r)[s - 1], req = lastAt(r, s, 'Requested'), app = lastAt(r, s, 'Approved'), rej = lastAt(r, s, 'Rejected');
        var cls = 'todo', txt = '', tip = String(s).padStart(2, '0') + ' ' + sp.name + ' \u00b7 approver ' + sp.approver;
        var c = r.cells && r.cells[s];   // live: every step of the document has its own request
        if (c && c.status === 'Wait') {
            var h = (NOW - new Date(c.at)) / 3600000, k = h >= SLA_LATE ? 'late' : h >= SLA_WARN ? 'warn' : 'ok';
            return '<div class="tc cur ' + k + '" title="' + esc(tip + ' \u00b7 waiting ' + ageTxt(h) + ' since ' + fmt(c.at)) + '">' + ageTxt(h) + '</div>';
        }
        if (c && c.status === 'Rejected') return '<div class="tc rej" title="' + esc(tip + ' \u00b7 rejected') + '">\u2715</div>';
        if (isDone(r, s)) { cls = 'done'; txt = '\u2713'; tip += app ? ' \u00b7 approved ' + fmt(app) + (req ? ' (took ' + ageTxt((new Date(app) - new Date(req)) / 3600000) + ')' : '') : ''; }
        else if (s === r.step && r.status === 'Rejected') { cls = 'rej'; txt = '\u2715'; tip += ' \u00b7 rejected ' + fmt(rej); }
        else if (s === r.step && r.status === 'Wait') { cls = 'cur ' + risk(r); txt = ageTxt(ageH(r)); tip += ' \u00b7 waiting ' + ageTxt(ageH(r)) + ' since ' + fmt(req); }
        return '<div class="tc ' + cls + '" title="' + esc(tip) + '">' + txt + '</div>';
    }

    function tlRow(r) {
        var k = risk(r), cells = '';
        for (var s = 1; s <= steps(r).length; s++) cells += tlCell(r, s);
        var wait = r.status === 'Wait' ? '<span class="chip ' + (k === 'late' ? 'c-late' : k === 'warn' ? 'c-wait' : 'c-ok') + '">' + ageTxt(ageH(r)) + '</span>' : '<span class="sub">\u2014</span>';
        var owner = r.status === 'Wait' ? esc(step(r).approver) + (step(r).approver === ME ? ' <span class="chip c-wait">you</span>' : '') : '<span class="sub">\u2014</span>';
        return '<div class="tl-row ' + (st.open === r.id ? 'sel' : '') + '" data-id="' + r.id + '">' +
            '<div><div class="docno">' + esc(r.doc) + '</div><div class="sub">' + esc(r.type) + '</div></div>' +
            '<div class="text-xs">' + fmt(r.requestedAt) + '<div class="sub">' + esc(r.requestedBy) + '</div></div>' +
            '<div class="text-xs">' + esc(r.sum.jobType) + '<div class="sub">' + esc(r.sum.sale) + '</div></div>' +
            cells +
            '<div class="flex items-center gap-1.5"><div class="pbar flex-1"><i style="width:' + pct(r) + '%"></i></div><b class="text-[11px] w-8 text-right">' + pct(r) + '%</b></div>' +
            '<div>' + wait + '</div><div class="text-xs">' + owner + '</div></div>';
    }

    function renderTimeline() {
        var mod = MODS.filter(function (x) { return x.id === st.mod; })[0] || { name: st.mod };
        if (live) {   // matrix = one document type; default Sale Booking, else the first type of the module
            var ts = typesOf(st.mod);
            if (ts.indexOf(st.tdt) < 0) st.tdt = ts.indexOf('Sale Booking') >= 0 ? 'Sale Booking' : (ts[0] || '');
            $('#tDoc').innerHTML = ts.map(function (t) { return '<option value="' + esc(t) + '"' + (st.tdt === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('');
        }
        var TS = tlSteps();
        var all = data.filter(function (r) { return r.module === st.mod && (!live || r.type === st.tdt); });
        if (live) { var seenD = {}; all = all.filter(function (r) { return seenD[r.doc] ? false : (seenD[r.doc] = 1); }); }
        var cnt = { ok: 0, warn: 0, late: 0, rej: 0, done: 0 };
        all.forEach(function (r) { cnt[risk(r)]++; });
        var active = cnt.ok + cnt.warn + cnt.late;
        var done = all.filter(function (r) { return risk(r) === 'done'; });
        var cyc = done.length ? done.reduce(function (a, r) { return a + (new Date(r.history[r.history.length - 1].at) - new Date(r.requestedAt)) / 86400000; }, 0) / done.length : 0;
        $('#listTitle').textContent = mod.name + ' \u2014 Timeline Management';
        $('#listSub').textContent = 'SLA: at risk after ' + SLA_WARN + ' h, stalled after ' + SLA_LATE + ' h at one step (or past deadline) \u00b7 ' + (live ? 'now ' : 'demo clock ') + fmt(NOW);

        var owners = {}; all.forEach(function (r) { if (r.status === 'Wait') owners[step(r).approver] = 1; });
        $('#tOwner').innerHTML = '<option value="all">All owners</option>' + Object.keys(owners).sort().map(function (o) { return '<option value="' + o + '"' + (st.tOwner === o ? ' selected' : '') + '>Owner: ' + o + '</option>'; }).join('');
        $('#tStatus').value = st.tStatus; $('#tGroup').value = st.tGroup;

        var kpi = [['active', 'In progress', active, 'k-ind'], ['active', 'On track', cnt.ok, 'k-ok'], ['risk', 'At risk', cnt.warn, 'k-warn'], ['risk', 'Stalled / overdue', cnt.late, 'k-bad'],
                   ['rej', 'Rejected', cnt.rej, 'k-bad'], ['done', 'Completed', cnt.done, 'k-mute']];
        var kpiHtml = '<div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 mb-3">' + kpi.map(function (k) {
            return '<button class="kpi ' + k[3] + '" data-tstatus="' + k[0] + '"><span class="kl">' + k[1] + '</span><span class="kv2">' + k[2] + '</span></button>';
        }).join('') + '<div class="kpi k-plain"><span class="kl">Avg cycle time</span><span class="kv2">' + (done.length ? cyc.toFixed(1) + ' d' : '\u2014') + '</span></div></div>';

        // WIP row: how many requests currently wait at each step (shows the bottleneck)
        var wip = TS.map(function (sp) {
            var rs = all.filter(function (r) { var c = r.cells && r.cells[sp.no]; return r.status === 'Wait' && (c ? c.status === 'Wait' : r.step === sp.no); });
            var worst = rs.reduce(function (a, r) { var k = risk(r); return k === 'late' ? 'late' : (k === 'warn' && a !== 'late') ? 'warn' : a; }, 'ok');
            return '<div class="wip ' + (rs.length ? 'w-' + worst : '') + '" title="' + String(sp.no).padStart(2, '0') + ' ' + esc(sp.name) + ' \u00b7 approver ' + sp.approver + ' \u00b7 ' + rs.length + ' waiting">' + (rs.length || '') + '</div>';
        }).join('');
        var heads = TS.map(function (sp) { return '<div class="th-s" title="' + String(sp.no).padStart(2, '0') + ' ' + esc(sp.name) + ' \u00b7 approver ' + sp.approver + '">' + sp.no + '</div>'; }).join('');

        var rows = tlRows(), groups = [];
        rows.sort(function (a, b) { return (b.status === 'Wait' ? ageH(b) : -1) - (a.status === 'Wait' ? ageH(a) : -1) || new Date(b.requestedAt) - new Date(a.requestedAt); });
        if (st.tGroup === 'risk') ['late', 'warn', 'ok', 'rej', 'done'].forEach(function (k) { groups.push([RISK_NAME[k], rows.filter(function (r) { return risk(r) === k; }), k]); });
        else if (st.tGroup === 'job') { var jt = {}; rows.forEach(function (r) { (jt[r.sum.jobType] = jt[r.sum.jobType] || []).push(r); }); Object.keys(jt).sort().forEach(function (j) { groups.push([j, jt[j], '']); }); }
        else groups.push(['', rows, '']);

        var body = groups.filter(function (g) { return g[1].length; }).map(function (g) {
            return (g[0] ? '<div class="tl-group ' + (g[2] ? 'g-' + g[2] : '') + '">' + esc(g[0]) + ' <span>' + g[1].length + '</span></div>' : '') + g[1].map(tlRow).join('');
        }).join('') || '<div class="empty">No documents match.</div>';

        var legend = '<div class="legend"><span><i class="tc done"></i>Approved</span><span><i class="tc cur ok"></i>Waiting (age)</span><span><i class="tc cur warn"></i>At risk</span>' +
            '<span><i class="tc cur late"></i>Stalled</span><span><i class="tc rej"></i>Rejected</span><span><i class="tc todo"></i>Not started</span></div>';

        $('#list').innerHTML = kpiHtml + '<div class="tl-wrap" style="--n:' + TS.length + '"><div class="tl-grid tl-head"><div>Document</div><div>Requested</div><div>Job type</div>' + heads + '<div>Progress</div><div>Waiting</div><div>Owner</div></div>' +
            '<div class="tl-grid tl-wipr"><div class="wip-l">Waiting at step \u2192</div>' + wip + '</div>' + body + '</div>' + legend;
    }

    function exportCsv() {
        var rows = [['Docno', 'Job type', 'Requested', 'Requested by', 'Status', 'Risk', 'Current step', 'Owner', 'Waiting (h)', 'Progress %']];
        tlRows().forEach(function (r) { rows.push([r.doc, r.sum.jobType, r.requestedAt, r.requestedBy, r.status, RISK_NAME[risk(r)], String(r.step).padStart(2, '0') + ' ' + step(r).name, r.status === 'Wait' ? step(r).approver : '', r.status === 'Wait' ? ageH(r).toFixed(1) : '', pct(r)]); });
        var csv = rows.map(function (a) { return a.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' })); a.download = 'timeline.csv'; a.click();
    }

    /* ---------- detail ---------- */
    function renderDetail() {
        var el = $('#detail'), r = st.open && byId(st.open);
        if (!r) { el.classList.add('hidden'); return; }
        el.classList.remove('hidden');
        var cur = step(r), act = canAct(r);
        var stepper = steps(r).map(function (s) {
            var c = r.cells && r.cells[s.no];
            var cls = c ? (c.status === 'Approved' ? 'done' : c.status === 'Rejected' ? 'rej' : 'cur')
                : isDone(r, s.no) ? 'done' : s.no === r.step ? (r.status === 'Rejected' ? 'rej' : r.status === 'Approved' ? 'done' : 'cur') : '';
            return '<div class="st ' + cls + '"><div class="dot">' + (cls === 'done' ? '✓' : cls === 'rej' ? '✕' : s.no) + '</div><span>' + esc(s.name) + '</span></div>';
        }).join('');
        var hist = r.history.slice().reverse().map(function (h) {
            var c = h.action === 'Approved' ? 'ok' : h.action === 'Rejected' ? 'bad' : 'req';
            return '<div class="' + c + '"><b>' + esc(h.action) + '</b> · ' + String(h.step).padStart(2, '0') + ' ' + esc((steps(r)[h.step - 1] || { name: '' }).name) +
                '<div class="sub">' + esc(h.by) + ' · ' + fmt(h.at) + '</div>' + (h.remark ? '<div class="mt-0.5">“' + esc(h.remark) + '”</div>' : '') + '</div>';
        }).join('');
        var files = r.files.length ? r.files.map(function (f) {
            return '<a href="#" class="file" data-file="' + esc(f.name) + '"><span class="ic">' + (/\.pdf$/i.test(f.name) ? '📄' : /\.xlsx?$/i.test(f.name) ? '📊' : '🖼️') + '</span><span class="flex-1 truncate">' + esc(f.name) + '</span><span class="sub">' + f.kb + ' KB</span><span class="text-indigo-600 font-semibold">View</span></a>';
        }).join('') : '<div class="sub">No attachments</div>';

        var foot;
        if (act) foot = '<textarea id="remark" rows="2" class="field w-full mb-2" placeholder="Remark (required when rejecting)"></textarea>' +
            '<div id="remarkErr" class="text-xs text-red-600 mb-1 hidden">Please enter a reason before rejecting.</div>' +
            '<div class="flex gap-2"><button id="dApprove" class="btn-ok flex-1">✓ Approve</button><button id="dReject" class="btn-bad flex-1">✕ Reject</button></div>';
        else foot = '<div class="text-sm text-slate-600">' + (r.status === 'Wait' ? '⏳ Waiting for <b>' + esc(cur.approver) + '</b> to approve step ' + cur.no + ' — you can view only.' :
            r.status === 'Approved' ? '✅ Approved' : '❌ Rejected') + '</div>';

        el.innerHTML =
            '<div class="px-4 py-3 border-b border-slate-200 flex items-start gap-2"><div class="flex-1 min-w-0"><div class="text-[11px] text-slate-500">' + esc(r.type) + ' · ' + (MODS.filter(function (x) { return x.id === r.module; })[0].name) + '</div>' +
                '<div class="text-lg font-semibold truncate">' + esc(r.doc) + '</div></div>' + statusChip(r) + '<button id="dClose" class="btn-ghost !px-2" aria-label="Close">✕</button></div>' +
            '<div class="d-body">' +
                '<div class="flex items-center justify-between text-xs mb-1"><span class="text-slate-500">Progress</span><b>' + pct(r) + '%</b></div><div class="pbar"><i style="width:' + pct(r) + '%"></i></div>' +
                '<div class="sect">Workflow</div><div class="stepper">' + stepper + '</div>' +
                '<div class="sect">This request</div><div class="rounded-lg border border-slate-200 p-3">' +
                    '<div class="step-name text-base">' + String(cur.no).padStart(2, '0') + ' ' + esc(cur.name) + '</div>' +
                    '<dl class="kv mt-2"><dt>Requested by</dt><dd>' + esc(r.requestedBy) + ' · ' + fmt(r.requestedAt) + '</dd><dt>Approver</dt><dd>' + esc(cur.approver) + '</dd>' +
                    '<dt>Deadline</dt><dd>' + (r.deadline ? esc(r.deadline) + (isLate(r) ? ' <span class="chip c-late">overdue</span>' : '') : '—') + '</dd><dt>Remark</dt><dd>' + (esc(r.remark) || '—') + '</dd></dl></div>' +
                '<div class="sect">Attachments</div>' + files +
                '<div class="sect">Document</div><dl class="kv"><dt>Shipper</dt><dd>' + esc(r.sum.shipper) + '</dd><dt>Consignee</dt><dd>' + esc(r.sum.consignee) + '</dd>' +
                    '<dt>Route</dt><dd>' + esc(r.sum.pol) + ' → ' + esc(r.sum.pod) + '</dd><dt>Job type</dt><dd>' + esc(r.sum.jobType) + '</dd><dt>Sale</dt><dd>' + esc(r.sum.sale) + '</dd>' +
                    (live ? '<dt>Customer</dt><dd>' + esc(r.sum.customer) + '</dd><dt>Vendor</dt><dd>' + esc(r.sum.vendor) + '</dd><dt>Job No</dt><dd>' + esc(r.sum.jobNo) + '</dd>' : '') + '</dl>' +
                    (live ? '<div class="sub mt-1">Mockup (not in the DB yet): deadline · attachments · shipper / consignee / route</div>' : '') +
                '<div class="sect">History</div><div class="hist">' + hist + '</div>' +
            '</div><div class="d-foot">' + foot + '</div>';

        $('#dClose').onclick = function () { st.open = null; render(); };
        if (act) {
            $('#dApprove').onclick = function () { var u = decide(r, 'Approved', $('#remark').value.trim()); toast(r.doc + ' approved' + NOTE(), u); render(); };
            $('#dReject').onclick = function () {
                var v = $('#remark').value.trim();
                if (!v) { $('#remarkErr').classList.remove('hidden'); $('#remark').focus(); return; }
                var u = decide(r, 'Rejected', v); toast(r.doc + ' rejected' + NOTE(), u); render();
            };
        }
    }

    function render() {
        var al = st.page === 'alerts';
        $('#alertsPage').classList.toggle('hidden', !al); $('#apprPage').classList.toggle('hidden', al); $('#navAlerts').classList.toggle('on', al);
        if (al) { $('#detail').classList.add('hidden'); renderNav(); window.AFAlerts.render(); return; }
        var tl = st.view === 'timeline';
        $('#tabs').classList.toggle('hidden', tl); $('#inboxF').classList.toggle('hidden', tl); $('#tlF').classList.toggle('hidden', !tl);
        if (tl) $('#bulk').classList.add('hidden');
        document.querySelectorAll('#viewSw button').forEach(function (b) { b.classList.toggle('on', b.dataset.view === st.view); });
        renderNav(); if (tl) renderTimeline(); else renderList(); renderDetail();
    }

    /* ---------- events ---------- */
    document.addEventListener('click', function (e) {
        var t;
        if ((t = e.target.closest('[data-view]'))) { st.view = t.dataset.view; st.open = null; return render(); }
        if ((t = e.target.closest('[data-tstatus]'))) { st.tStatus = t.dataset.tstatus; return render(); }
        if ((t = e.target.closest('.tl-row[data-id]'))) { st.open = +t.dataset.id; return render(); }
        if ((t = e.target.closest('#navAlerts'))) { st.page = 'alerts'; $('#side').classList.remove('open'); $('#scrim').classList.add('hidden'); return render(); }
        if ((t = e.target.closest('[data-mod]'))) { st.page = 'approval'; st.mod = t.dataset.mod; st.dt = 'all'; st.step = 'all'; st.open = null; st.sel = {}; $('#side').classList.remove('open'); $('#scrim').classList.add('hidden'); return render(); }
        if ((t = e.target.closest('[data-tab]'))) { st.tab = t.dataset.tab; st.sel = {}; return render(); }
        if ((t = e.target.closest('[data-ck]'))) { if (t.checked) st.sel[t.dataset.ck] = 1; else delete st.sel[t.dataset.ck]; e.stopPropagation(); return renderList(); }
        if ((t = e.target.closest('[data-q]'))) {
            var r = byId(+t.dataset.id);
            if (t.dataset.q === 'A') { var u = decide(r, 'Approved', ''); toast(r.doc + ' approved' + NOTE(), u); render(); }
            else { st.open = r.id; render(); setTimeout(function () { var rm = $('#remark'); if (rm) { rm.focus(); $('#remarkErr').classList.remove('hidden'); } }, 0); }
            return;
        }
        if ((t = e.target.closest('[data-file]'))) { e.preventDefault(); return toast('Preview of ' + t.dataset.file + ' (mockup)'); }
        if ((t = e.target.closest('.row[data-id]'))) { st.open = +t.dataset.id; return render(); }
    });
    $('#q').oninput = function () { st.q = this.value; if (st.view === 'timeline') renderTimeline(); else renderList(); };
    $('#fStep').onchange = function () { st.step = this.value; renderList(); };
    $('#fDoc').onchange = function () { st.dt = this.value; st.step = 'all'; st.open = null; render(); };
    $('#tDoc').onchange = function () { st.tdt = this.value; st.open = null; render(); };
    $('#fMine').onchange = function () { st.mine = this.value; renderList(); };
    $('#fLate').onchange = function () { st.late = this.checked; renderList(); };
    $('#tStatus').onchange = function () { st.tStatus = this.value; render(); };
    $('#tOwner').onchange = function () { st.tOwner = this.value; render(); };
    $('#tGroup').onchange = function () { st.tGroup = this.value; render(); };
    $('#tExport').onclick = exportCsv;
    $('#btnRefresh').onclick = function () { if (window.SMF) liveLoad(); else render(); };
    $('#bulkApprove').onclick = function () { approveMany(Object.keys(st.sel).map(Number)); };
    $('#bulkClear').onclick = function () { st.sel = {}; renderList(); };
    $('#btnReset').onclick = function () { if (window.SMF) { liveLoad(); return; } data = JSON.parse(JSON.stringify(window.AF_SEED)); st.open = null; st.sel = {}; save(); render(); toast('Demo data re-seeded'); };
    $('#btnMenu').onclick = function () { $('#side').classList.add('open'); $('#scrim').classList.remove('hidden'); };
    $('#scrim').onclick = function () { $('#side').classList.remove('open'); $('#scrim').classList.add('hidden'); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && st.open) { st.open = null; render(); } });

    /* ---------- live data (SMFDash.Web only) ----------
       menu = TCMENU (SUB_SYSNAME<>0), steps = TCSTEP (+ approvers TCGROUPAUTH), requests = TCDETAIL newest REQNO first joined to TCHEAD.
       Request status: ACTSTATUS01-03 hold the same value once decided (Wait / Approved / Rejected). Not in the DB yet, left empty: deadline, attachments, shipper/consignee/route. */
    function iconOf(m) { m = String(m || ''); return /ferry/.test(m) ? '🚢' : /takeoff/.test(m) ? '✈️' : /landing/.test(m) ? '🛬' : /upload/.test(m) ? '📤' : /download/.test(m) ? '📥' : /truck/.test(m) ? '🚚' : '🧾'; }
    function statusOf(lv) {
        var s = lv.map(function (x) { return x.status; }).filter(function (v) { return v; });
        return s.indexOf('Rejected') >= 0 ? 'Rejected' : s.length && s.every(function (v) { return v === 'Approved'; }) ? 'Approved' : 'Wait';
    }
    function liveLoad() {
        if (!window.SMF) return;
        Promise.all([SMF.call('info'), SMF.call('menu'), SMF.call('workflow'), SMF.call('approvals')]).then(function (a) {
            var info = a[0], menu = a[1], wf = a[2], ap = a[3];
            ME = info.user || ME; NOW = new Date();
            MODS = menu.items.map(function (m) { return { id: m.id, name: m.name, icon: iconOf(m.icon) }; });
            WF = {}; var idx = {};
            wf.steps.forEach(function (s) {
                var k = s.mod + '|' + s.type, list = WF[k] = WF[k] || [];
                var us = s.approvers.map(function (x) { return x.user; }).filter(function (u, i, arr) { return u && arr.indexOf(u) === i; });
                list.push({ no: list.length + 1, id: s.id, name: s.name, approvers: us, approver: us.join(' / ') || '—' });
                (idx[k] = idx[k] || {})[s.id] = list.length;
            });
            var cells = {}, skipped = 0, rows = [];
            ap.rows.forEach(function (x) {   // rows arrive REQNO DESC: the first request of a document+step is its newest
                var k = x.mod + '|' + x.type, no = idx[k] && idx[k][x.stepId];
                if (!no) { skipped++; return; }
                var status = statusOf(x.levels), dk = k + '|' + x.doc;
                var c = cells[dk] = cells[dk] || {};
                if (!c[no]) c[no] = { status: status, at: x.at };
                rows.push({ x: x, no: no, status: status, dk: dk });
            });
            data = rows.map(function (o) {
                var x = o.x, c = cells[o.dk], done = [];
                Object.keys(c).forEach(function (s) { if (c[s].status === 'Approved') done.push(+s); });
                var hist = [{ step: o.no, action: 'Requested', by: x.by, at: x.at, remark: x.remark }];
                var seenH = {};
                x.levels.forEach(function (l) {
                    if ((l.status !== 'Approved' && l.status !== 'Rejected') || seenH[l.status + l.by + l.at]) return;
                    seenH[l.status + l.by + l.at] = 1;
                    hist.push({ step: o.no, action: l.status, by: l.by, at: l.at || x.at, remark: l.status === 'Rejected' ? x.rejectComment : '' });
                });
                return { id: x.id, reqNo: x.reqNo, doc: x.doc, module: x.mod, type: x.type, step: o.no, status: o.status, requestedBy: x.by, requestedAt: x.at,
                         deadline: '', remark: o.status === 'Rejected' && x.rejectComment ? x.rejectComment : x.remark, files: [],
                         sum: { shipper: '', consignee: '', pol: '', pod: '', jobType: x.jobType, sale: x.sale, customer: x.customer, vendor: x.vendor, jobNo: x.jobNo },
                         history: hist, doneSet: done, cells: c };
            });
            live = { target: ap.target, skipped: skipped };
            if (!MODS.some(function (m) { return m.id === st.mod; }) && MODS.length) st.mod = MODS[0].id;
            ['fDoc', 'tDoc'].forEach(function (id) { $('#' + id).classList.remove('hidden'); });
            $('#otherNav').classList.add('hidden');
            var tag = $('#srcTag'); tag.textContent = '[LIVE]'; tag.className = 'text-emerald-600'; tag.title = ap.target + (skipped ? ' · ' + skipped + ' request(s) with an unknown step not shown' : '');
            $('#meName').textContent = 'Signed in as ' + ME;
            render();
        }).catch(function (e) {
            live = null; WF = null; data = JSON.parse(JSON.stringify(window.AF_SEED));
            var tag = $('#srcTag'); tag.textContent = '[DEMO]'; tag.className = 'text-amber-600'; tag.title = e.message;
            render(); toast('Could not read the approval tables - showing demo data. ' + e.message);
        });
    }

    $('#meName').textContent = 'Signed in as ' + ME;
    render();
    liveLoad();
})();
