// Alerts page — turns the HTML reports produced by SQL (one <table> + <h1>/<h2> each) into cards and sortable tables.
// Sources: window.AF_ALERT_HTML (demo) and files loaded from the "Load HTML" button / drag & drop. Nothing is sent anywhere.
(function () {
    var NOW = window.AF_NOW || new Date();
    var $ = function (s) { return document.querySelector(s); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // known alerts (matched on the mail subject, then on the heading) -> short label + icon
    var CAT = [
        [/un-?bill|วางบิล/i, { short: 'Un-Bill', icon: '🧾' }],
        [/appoint|นัดรับ/i, { short: 'Un-Appoint', icon: '📅' }],
        [/เงินสด|cash/i, { short: 'Cash overdue', icon: '💵' }],
        [/deposit/i, { short: 'Deposit refund', icon: '🔁' }],
        [/duty ?tax/i, { short: 'Duty Tax refund', icon: '🏛️' }],
        [/no invoice|paid job/i, { short: 'Paid, no invoice', icon: '📄' }],
        [/oversea/i, { short: 'Overseas outstanding', icon: '🌏' }]
    ];

    var sources = [], items = [], st = { sel: 0, q: '', user: 'all', sort: null, group: false };

    /* ---------- parsing ---------- */
    function dateOf(s) { var m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; }
    function fmtDate(s) { var d = dateOf(s); return d ? ('0' + d.getDate()).slice(-2) + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() : s; }
    function num(s) { return parseFloat(String(s).replace(/,/g, '')); }
    function money(n) { return (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function ageTxt(d) { return d >= 730 ? (d / 365).toFixed(1) + ' y' : d >= 60 ? Math.round(d / 30) + ' mo' : d + ' d'; }
    function title(s) { return s.charAt(0) + s.slice(1).toLowerCase(); }
    function sevOf(d) { return d >= 90 ? 'bad' : d >= 30 ? 'warn' : 'info'; }

    function parse(src) {
        var doc = new DOMParser().parseFromString(src.html, 'text/html');
        var table = doc.querySelector('table');
        if (!table) return null;
        var h1 = doc.querySelector('h1'), h2 = doc.querySelector('h2,h3');
        var rows = [].map.call(table.querySelectorAll('tr'), function (tr) { return [].map.call(tr.children, function (c) { return c.textContent.replace(/\s+/g, ' ').trim(); }); })
            .filter(function (r) { return r.length; });
        var head = rows.shift() || [];
        // drop columns that are empty in every row (e.g. REMARK)
        var keep = head.map(function (h, i) { return rows.some(function (r) { return (r[i] || '') !== ''; }); });
        head = head.filter(function (h, i) { return keep[i]; });
        rows = rows.map(function (r) { return r.filter(function (c, i) { return keep[i]; }); });

        var cols = head.map(function (h, i) {
            var hu = h.toUpperCase(), vals = rows.map(function (r) { return r[i] || ''; }).filter(Boolean), kind = 'text';
            if (vals.length && vals.every(function (v) { return dateOf(v); })) kind = 'date';
            else if (vals.length && vals.every(function (v) { return /^-?[\d,]+(\.\d+)?$/.test(v); })) kind = /AMT|AMOUNT/.test(hu) ? 'money' : /DAYS/.test(hu) ? 'days' : 'num';
            else if (/USER/.test(hu)) kind = 'user';
            else if (/JOB ?NO|JOBNO/.test(hu)) kind = 'job';
            else if (/INV\. ?(NO|NUMBER)/.test(hu)) kind = 'inv';
            return { name: h, kind: kind };
        });

        // no "days" column -> derive an AGE column from the first date column
        var dayIdx = cols.map(function (c) { return c.kind; }).indexOf('days');
        if (dayIdx < 0) {
            var di = cols.map(function (c) { return c.kind; }).indexOf('date');
            if (di >= 0) {
                cols.push({ name: 'AGE', kind: 'age', derived: true });
                rows.forEach(function (r) { var d = dateOf(r[di]); r.push(d ? String(Math.max(0, Math.floor((NOW - d) / 86400000))) : ''); });
                dayIdx = cols.length - 1;
            }
        }
        var kinds = cols.map(function (c) { return c.kind; });
        var mi = kinds.indexOf('money'), ui = kinds.indexOf('user');
        var subject = src.subject || (doc.title || '');
        var heading = h1 ? h1.textContent.replace(/\s+/g, ' ').trim() : '';
        var text = subject + ' ' + heading, cat = { short: subject || heading || src.file, icon: '🔔' };
        CAT.some(function (c) { if (c[0].test(text)) { cat = c[1]; return true; } return false; });
        var maxDays = dayIdx >= 0 ? Math.max.apply(null, rows.map(function (r) { return num(r[dayIdx]) || 0; }).concat([0])) : 0;
        var total = mi >= 0 ? rows.reduce(function (a, r) { return a + (num(r[mi]) || 0); }, 0) : null;
        return {
            file: src.file, title: subject || heading, heading: heading, note: h2 ? h2.textContent.trim() : '', cat: cat, cols: cols, rows: rows, html: src.html,
            mi: mi, ui: ui, di: dayIdx, total: total, maxDays: maxDays,
            sev: rows.length === 0 ? 'ok' : dayIdx >= 0 ? sevOf(maxDays) : 'warn'
        };
    }

    function rebuild() {
        items = sources.map(parse).filter(Boolean);
        if (st.sel >= items.length) st.sel = 0;
        var n = items.reduce(function (a, i) { return a + i.rows.length; }, 0), b = $('#alertN');
        if (b) { b.textContent = n; b.classList.toggle('z', n === 0); }
    }

    /* ---------- rendering ---------- */
    function cell(a, c, v, i) {
        if (v === '' || v == null) return '<span class="text-slate-300">—</span>';
        switch (c.kind) {
            case 'job': case 'inv': return '<span class="mono cp" data-copy="' + esc(v) + '" title="Click to copy">' + esc(v) + '</span>';
            case 'date': return '<span class="text-slate-700">' + fmtDate(v) + '</span>';
            case 'money': return '<span class="' + (num(v) < 0 ? 'neg' : '') + '">' + money(num(v)) + '</span>';
            case 'days': return '<span class="dchip d-' + sevOf(num(v)) + '">' + num(v).toLocaleString('en-US') + ' d</span>';
            case 'age': return '<span class="dchip d-' + sevOf(num(v)) + '">' + ageTxt(num(v)) + '</span>';
            case 'user': return '<span class="av">' + esc(v.charAt(0)) + '</span>' + esc(title(v));
            default: return esc(v);
        }
    }

    function filtered(a) {
        var q = st.q.toLowerCase(), rows = a.rows.filter(function (r) {
            if (st.user !== 'all' && (a.ui < 0 || r[a.ui] !== st.user)) return false;
            return !q || r.join(' ').toLowerCase().indexOf(q) >= 0;
        });
        if (st.sort && st.sort.i < a.cols.length) {
            var i = st.sort.i, k = a.cols[i].kind, dir = st.sort.dir;
            rows = rows.slice().sort(function (x, y) {
                var p = x[i], q2 = y[i];
                if (k === 'money' || k === 'num' || k === 'days' || k === 'age') { p = num(p) || 0; q2 = num(q2) || 0; }
                else if (k === 'date') { p = +dateOf(p) || 0; q2 = +dateOf(q2) || 0; }
                return (p < q2 ? -1 : p > q2 ? 1 : 0) * dir;
            });
        }
        return rows;
    }

    function tableHtml(a, rows) {
        var head = a.cols.map(function (c, i) {
            var right = c.kind === 'money' || c.kind === 'num', on = st.sort && st.sort.i === i;
            return '<th data-sort="' + i + '" class="' + (right ? 'r' : '') + (on ? ' on' : '') + '">' + esc(c.name) + (on ? (st.sort.dir > 0 ? ' ▲' : ' ▼') : '') + '</th>';
        }).join('');
        function tr(r) {
            return '<tr>' + a.cols.map(function (c, i) { return '<td class="' + (c.kind === 'money' || c.kind === 'num' ? 'r' : '') + '">' + cell(a, c, r[i], i) + '</td>'; }).join('') + '</tr>';
        }
        var body = '';
        if (st.group && a.ui >= 0) {
            var g = {}; rows.forEach(function (r) { (g[r[a.ui]] = g[r[a.ui]] || []).push(r); });
            Object.keys(g).sort().forEach(function (u) {
                var sub = a.mi >= 0 ? g[u].reduce(function (s, r) { return s + (num(r[a.mi]) || 0); }, 0) : null;
                body += '<tr class="grp"><td colspan="' + a.cols.length + '"><span class="av">' + esc(u.charAt(0)) + '</span><b>' + esc(title(u)) + '</b> · ' + g[u].length + ' item(s)' + (sub != null ? ' · ฿ ' + money(sub) : '') + '</td></tr>' + g[u].map(tr).join('');
            });
        } else body = rows.map(tr).join('');
        var tot = a.mi >= 0 ? rows.reduce(function (s, r) { return s + (num(r[a.mi]) || 0); }, 0) : null;
        var foot = '<tr class="tot">' + a.cols.map(function (c, i) {
            return '<td class="' + (c.kind === 'money' ? 'r' : '') + '">' + (i === 0 ? rows.length + ' item(s)' : i === a.mi ? '฿ ' + money(tot) : '') + '</td>';
        }).join('') + '</tr>';
        return '<div class="al-scroll"><table class="al-tbl"><thead><tr>' + head + '</tr></thead><tbody>' + (rows.length ? body : '<tr><td colspan="' + a.cols.length + '" class="empty">Nothing to show</td></tr>') + '</tbody><tfoot>' + foot + '</tfoot></table></div>';
    }

    function render() {
        var page = $('#alertsPage'); if (!page) return;
        var focus = document.activeElement && document.activeElement.id === 'alQ' ? document.activeElement.selectionStart : -1;
        var totalRows = items.reduce(function (a, i) { return a + i.rows.length; }, 0);
        var cards = items.map(function (a, i) {
            var sub = (a.total != null ? '฿ ' + money(a.total) : '') + (a.rows.length && a.di >= 0 ? (a.total != null ? ' · ' : '') + 'oldest ' + (a.cols[a.di].kind === 'age' ? ageTxt(a.maxDays) : a.maxDays + ' d') : '');
            return '<button class="al-card sev-' + a.sev + (i === st.sel ? ' sel' : '') + '" data-al="' + i + '"><span class="al-ic">' + a.cat.icon + '</span><span class="al-b">' +
                '<span class="al-t">' + esc(a.cat.short) + '</span><span class="al-n">' + a.rows.length + '</span><span class="al-s">' + (a.rows.length ? esc(sub) : 'All clear ✓') + '</span></span></button>';
        }).join('');

        var a = items[st.sel], detail = '<div class="empty">No alert reports loaded. Use “Load HTML…”.</div>';
        if (a) {
            var rows = filtered(a), users = {};
            if (a.ui >= 0) a.rows.forEach(function (r) { users[r[a.ui]] = (users[r[a.ui]] || 0) + 1; });
            var chips = a.ui >= 0 ? '<button class="uchip' + (st.user === 'all' ? ' on' : '') + '" data-user="all">All <b>' + a.rows.length + '</b></button>' +
                Object.keys(users).sort().map(function (u) { return '<button class="uchip' + (st.user === u ? ' on' : '') + '" data-user="' + esc(u) + '"><span class="av s">' + esc(u.charAt(0)) + '</span>' + esc(title(u)) + ' <b>' + users[u] + '</b></button>'; }).join('') : '';
            detail = '<div class="flex items-start justify-between gap-3 flex-wrap"><div class="min-w-0"><div class="text-lg font-semibold">' + a.cat.icon + ' ' + esc(a.title) + '</div>' +
                '<div class="text-sm text-slate-600 mt-0.5">' + esc(a.heading) + (a.note ? ' <span class="text-slate-400">' + esc(a.note) + '</span>' : '') + '</div>' +
                '<div class="text-[11px] text-slate-400 mt-1">Source: ' + esc(a.file) + ' · ' + a.rows.length + ' item(s)' + (a.total != null ? ' · ฿ ' + money(a.total) : '') + '</div></div>' +
                '<div class="flex gap-2 flex-wrap"><button class="btn-secondary" id="alCsv">⬇ CSV</button><button class="btn-secondary" id="alOpen">↗ Original HTML</button></div></div>' +
                '<div class="flex flex-wrap items-center gap-2 mt-3 mb-2"><input id="alQ" class="field w-56" placeholder="Search in this alert …" value="' + esc(st.q) + '">' +
                (a.ui >= 0 ? '<label class="text-xs text-slate-500 flex items-center gap-1 ml-1"><input id="alGroup" type="checkbox"' + (st.group ? ' checked' : '') + '> Group by user</label>' : '') + '</div>' +
                (chips ? '<div class="flex flex-wrap gap-1.5 mb-3">' + chips + '</div>' : '') + tableHtml(a, rows);
        }
        page.innerHTML =
            '<div class="flex items-end justify-between gap-3 flex-wrap mb-3"><div><h1 class="text-xl font-semibold">Alerts</h1>' +
            '<p class="text-xs text-slate-500">' + items.length + ' report(s) from SQL · ' + totalRows + ' item(s) need attention · demo clock ' + NOW.getDate() + ' ' + MON[NOW.getMonth()] + ' ' + NOW.getFullYear() + '</p></div>' +
            '<div class="flex gap-2"><label class="btn-secondary cursor-pointer">⬆ Load HTML…<input id="alFile" type="file" accept=".html,.htm" multiple hidden></label><button id="alReset" class="btn-ghost">↺ Demo data</button></div></div>' +
            '<div class="al-cards">' + cards + '</div><div class="card mt-3">' + detail + '</div>' +
            '<div class="text-[11px] text-slate-400 mt-2">Tip: drop one or more .html files on this page to preview real SQL output. Click a Job / Invoice number to copy it.</div>';
        if (focus >= 0) { var q = $('#alQ'); if (q) { q.focus(); q.setSelectionRange(focus, focus); } }
    }

    /* ---------- actions ---------- */
    function csv() {
        var a = items[st.sel]; if (!a) return;
        var lines = [a.cols.map(function (c) { return c.name; })].concat(filtered(a));
        var text = lines.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
        var l = document.createElement('a'); l.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' })); l.download = (a.file || 'alert').replace(/\.html?$/i, '') + '.csv'; l.click();
    }
    function addFiles(files) {
        [].forEach.call(files, function (f) {
            var r = new FileReader();
            r.onload = function () {
                var s = { file: f.name, subject: '', html: String(r.result) }, i = -1;
                sources.forEach(function (x, k) { if (x.file === f.name) i = k; });
                if (i >= 0) sources[i] = s; else sources.push(s);
                rebuild(); st.sel = i >= 0 ? i : sources.length - 1; st.q = ''; st.user = 'all'; st.sort = null; render();
            };
            r.readAsText(f);
        });
    }

    document.addEventListener('click', function (e) {
        var page = $('#alertsPage'); if (!page || !page.contains(e.target)) return;
        var t;
        if ((t = e.target.closest('[data-al]'))) { st.sel = +t.dataset.al; st.q = ''; st.user = 'all'; st.sort = null; return render(); }
        if ((t = e.target.closest('[data-user]'))) { st.user = t.dataset.user; return render(); }
        if ((t = e.target.closest('[data-sort]'))) { var i = +t.dataset.sort; st.sort = st.sort && st.sort.i === i ? { i: i, dir: -st.sort.dir } : { i: i, dir: 1 }; return render(); }
        if ((t = e.target.closest('[data-copy]'))) { try { navigator.clipboard.writeText(t.dataset.copy); } catch (x) {} t.classList.add('copied'); setTimeout(function () { t.classList.remove('copied'); }, 700); return; }
        if (e.target.closest('#alCsv')) return csv();
        if (e.target.closest('#alOpen')) { var a = items[st.sel]; if (a) window.open(URL.createObjectURL(new Blob([a.html], { type: 'text/html' })), '_blank'); return; }
        if (e.target.closest('#alReset')) { sources = window.AF_ALERT_HTML.slice(); rebuild(); st.sel = 0; st.q = ''; st.user = 'all'; return render(); }
    });
    document.addEventListener('input', function (e) { if (e.target.id === 'alQ') { st.q = e.target.value; render(); } });
    document.addEventListener('change', function (e) {
        if (e.target.id === 'alGroup') { st.group = e.target.checked; render(); }
        if (e.target.id === 'alFile') addFiles(e.target.files);
    });
    document.addEventListener('dragover', function (e) { var p = $('#alertsPage'); if (p && !p.classList.contains('hidden')) e.preventDefault(); });
    document.addEventListener('drop', function (e) { var p = $('#alertsPage'); if (p && !p.classList.contains('hidden') && e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });

    sources = (window.AF_ALERT_HTML || []).slice();
    rebuild();
    window.AFAlerts = { render: render };
})();
