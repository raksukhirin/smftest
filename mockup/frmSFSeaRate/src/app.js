/* app.js — Entry point. Loaded as a plain script after all modules.
 *
 * Boot sequence:
 *   1. Load seed data (data.json or window.SEED_DATA from data.js)
 *   2. Initialize each subsystem in dependency order
 *   3. Wire cross-module callbacks (avoids circular references)
 *   4. Run initial search → render master grid
 *
 * Detail pane is hidden on first paint; opens only via DblClick on a row.
 */
window.RC = window.RC || {};
window.RC.app = (function () {
    'use strict';
    const { $ } = RC.utils;

    async function boot() {
        try {
            await RC.state.loadSeed();
        } catch (e) {
            alert('Cannot load seed data — make sure data.js is loaded, or serve via http://. ' + e.message);
            return;
        }

        // Wire cross-module callbacks before any init() runs
        RC.masterGrid.setHandlers({
            onDblClick: RC.detail.open,
            onSelect:   RC.detail.onMasterRowSelected
        });

        RC.detail.init();
        RC.lookup.init();
        RC.search.init({ onAddNew: RC.crud.addNewRate });
        RC.masterGrid.initKeyboardNav();
        initTopBar();
        initDetailActions();

        RC.search.runSearch();
    }

    function initTopBar() {
        $('#exportBtn').onclick = exportJson;
        $('#resetBtn').onclick  = async () => {
            if (!await RC.ui.confirmDialog({ title: 'Reset seed data?', msg: 'ทุกการแก้ไขใน mockup จะหายไป' })) return;
            RC.state.resetSeed();
            RC.search.runSearch();
            RC.ui.showToast('Reset to seed');
        };
        $('#newBtn').onclick     = () => RC.crud.addNewRate();
        $('#addRateBtn').onclick = () => RC.crud.addNewRate();
    }

    function initDetailActions() {
        $('#saveBtn').onclick      = RC.crud.saveDetail;
        $('#deleteBtn').onclick    = RC.crud.deleteDetail;
        $('#copyBtn').onclick      = RC.crud.copyDetail;
        $('#addCostBtn').onclick   = RC.subRate.addCostLine;
        $('#loadCodeBtn').onclick  = RC.subRate.loadCode;
        $('#applyTotalBtn').onclick = () => RC.subRate.applyToTotal(RC.detail.populate);
    }

    function exportJson() {
        const blob = new Blob([JSON.stringify(RC.state.state.data, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'data.json'; a.click();
        URL.revokeObjectURL(url);
        RC.ui.showToast('Exported data.json');
    }

    document.addEventListener('DOMContentLoaded', boot);

    return { boot };
}());
