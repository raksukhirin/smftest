/* app.js — Entry point. Loaded last, after every module.
 *
 * Boot sequence:
 *   1. Load seed (data.js → window.SEED_DATA, or fetch data.json over http://)
 *   2. Wire cross-module callbacks (avoids circular references)
 *   3. init() each subsystem
 *   4. Run the initial search → paint the grid
 * The detail pane stays hidden until a row is double-clicked or +New is pressed.
 */
window.VS = window.VS || {};
window.VS.app = (function () {
    'use strict';
    const { $ } = VS.utils;

    async function boot() {
        try {
            await VS.state.loadSeed();
        } catch (e) {
            alert('Cannot load seed data — make sure data.js is loaded, or serve via http://. ' + e.message);
            return;
        }

        VS.grid.setHandlers({
            onDblClick: VS.detail.open,
            onSelect:   VS.detail.onRowSelected
        });

        VS.detail.init();
        VS.lookup.init();
        VS.search.init({ onAddNew: VS.crud.addNew });
        VS.grid.initKeyboardNav();
        initTopBar();
        initDetailActions();

        VS.search.runSearch();
    }

    function initTopBar() {
        $('#exportBtn').onclick = exportJson;
        $('#newBtn').onclick    = () => VS.crud.addNew();
        $('#resetBtn').onclick  = async () => {
            if (!await VS.ui.confirmDialog({ title: 'Reset seed data?', msg: 'ทุกการแก้ไขใน mockup จะหายไป' })) return;
            VS.state.resetSeed();
            VS.detail.hide();
            VS.search.refreshMasters();
            VS.search.runSearch();
            VS.ui.showToast('Reset to seed');
        };
    }

    function initDetailActions() {
        $('#saveBtn').onclick   = VS.crud.save;
        $('#deleteBtn').onclick = VS.crud.remove;
        $('#copyBtn').onclick   = VS.crud.copy;
    }

    function exportJson() {
        const blob = new Blob([JSON.stringify(VS.state.state.data, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'data.json'; a.click();
        URL.revokeObjectURL(url);
        VS.ui.showToast('Exported data.json');
    }

    document.addEventListener('DOMContentLoaded', boot);
    return { boot };
}());
