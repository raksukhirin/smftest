/* app.js — Entry point. Loaded via `<script type="module">`.
 *
 * Boot sequence:
 *   1. Load seed data (data.json or window.SEED_DATA)
 *   2. Initialize each subsystem
 *   3. Wire cross-module callbacks (avoid circular imports)
 *   4. Run initial search → render master grid
 *
 * Detail pane is hidden on first paint; opens only via DblClick.
 */

import { $ }           from './utils.js';
import { state, loadSeed, persist, resetSeed } from './state.js';
import { showToast, confirmDialog } from './ui.js';
import { setHandlers as setMasterHandlers, initKeyboardNav } from './master-grid.js';
import { init as initDetail, open as openDetail, populate as populateDetailForm, onMasterRowSelected } from './detail.js';
import { init as initLookup }    from './lookup.js';
import { init as initSearch, runSearch } from './search.js';
import { addCostLine, applyToTotal, loadCode } from './sub-rate.js';
import { addNewRate, copyDetail, saveDetail, deleteDetail } from './crud.js';

async function boot() {
    try {
        await loadSeed();
    } catch (e) {
        alert('Cannot load seed data — serve via http:// (run "python -m http.server 8765" in this folder). ' + e.message);
        return;
    }

    // Wire cross-module callbacks first so init() functions can rely on them
    setMasterHandlers({
        onDblClick: openDetail,
        onSelect:   onMasterRowSelected
    });

    // Init subsystems
    initDetail();
    initLookup();
    initSearch({ onAddNew: addNewRate });
    initKeyboardNav();
    initTopBar();
    initDetailActions();

    runSearch();
}

/* Top-bar buttons: Export JSON / Reset Seed / + New Rate. */
function initTopBar() {
    $('#exportBtn').onclick = exportJson;
    $('#resetBtn').onclick  = async () => {
        if (!await confirmDialog({ title: 'Reset seed data?', msg: 'ทุกการแก้ไขใน mockup จะหายไป' })) return;
        resetSeed();
        runSearch();
        showToast('Reset to seed');
    };
    $('#newBtn').onclick     = () => addNewRate();
    $('#addRateBtn').onclick = () => addNewRate();
}

/* Detail-pane footer buttons (Save / Delete / Copy / Apply / Load Code / Add Line). */
function initDetailActions() {
    $('#saveBtn').onclick      = saveDetail;
    $('#deleteBtn').onclick    = deleteDetail;
    $('#copyBtn').onclick      = copyDetail;
    $('#addCostBtn').onclick   = addCostLine;
    $('#loadCodeBtn').onclick  = loadCode;
    $('#applyTotalBtn').onclick = () => applyToTotal(populateDetailForm);
}

function exportJson() {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'data.json'; a.click();
    URL.revokeObjectURL(url);
    showToast('Exported data.json');
}

document.addEventListener('DOMContentLoaded', boot);
