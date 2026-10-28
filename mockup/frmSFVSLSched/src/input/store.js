/* store.js — data + CRUD for the Voyage Entry screen. window.VSI.store
 * Edits the same relational model as the search screen (voyages / voyagePorts /
 * cutOffs against carriers / vessels / ports / serviceLanes). Persists to its
 * OWN localStorage key so it never disturbs the read-only search mockup.
 */
window.VSI = window.VSI || {};
window.VSI.store = (function () {
    'use strict';
    const KEY = 'sfVoyage.input.v1';
    let data = null;

    async function load() {
        const saved = localStorage.getItem(KEY);
        if (saved) { data = JSON.parse(saved); return; }
        let seed;
        if (window.SEED_DATA) seed = window.SEED_DATA;
        else { const r = await fetch('data.json', { cache:'no-store' }); seed = await r.json(); }
        data = JSON.parse(JSON.stringify(seed));
        ensureArrays();
    }
    function ensureArrays() {
        ['carriers','ports','serviceLanes','vessels','voyages','voyagePorts','cutOffs']
            .forEach(k => { if (!Array.isArray(data[k])) data[k] = []; });
    }
    function persist() { localStorage.setItem(KEY, JSON.stringify(data)); }
    function resetSeed() { localStorage.removeItem(KEY); }

    // ---- masters ----
    const carriers     = () => data.carriers;
    const vessels      = () => data.vessels;
    const ports        = () => data.ports;
    const serviceLanes = () => data.serviceLanes;
    const carrierById  = id => data.carriers.find(c => c.carrierId === id);
    const vesselById   = id => data.vessels.find(v => v.vesselId === id);
    const portById     = id => data.ports.find(p => p.portId === id);

    // ---- vessel master CRUD (frmSFVessel v2) ----
    function newVesselId() { return uid('VES-NEW-', id => !!vesselById(id)); }
    function vesselUsed(id) { return data.voyages.some(v => v.vesselId === id); }   // delete guard (UseVessel)
    function saveVessel(v) {
        const i = data.vessels.findIndex(x => x.vesselId === v.vesselId);
        if (i >= 0) data.vessels[i] = v; else data.vessels.push(v);
        persist();
    }
    function removeVessel(id) {
        data.vessels = data.vessels.filter(x => x.vesselId !== id);
        persist();
    }

    // ---- carrier / business-file CRUD (SMBUSINESS instance, VENDCLASS='SEALINE') ----
    function newCarrierId() { return uid('CAR-NEW-', id => !!carrierById(id)); }
    function carrierUsed(id) {                                  // referenced by a vessel or a voyage
        return data.vessels.some(v => v.carrierId === id) || data.voyages.some(v => v.carrierId === id);
    }
    function saveCarrier(c) {
        const i = data.carriers.findIndex(x => x.carrierId === c.carrierId);
        if (i >= 0) data.carriers[i] = c; else data.carriers.push(c);
        persist();
    }
    function removeCarrier(id) {
        data.carriers = data.carriers.filter(x => x.carrierId !== id);
        persist();
    }

    // ---- port CRUD (OPPORT instance, PORTTYPE='SF') ----
    function newPortId() { return uid('PORT-NEW-', id => !!portById(id)); }
    function portUsed(id) {                                     // referenced by a voyage POL/POD or a rotation call
        return data.voyages.some(v => v.polPortId === id || v.podPortId === id)
            || data.voyagePorts.some(p => p.portId === id);
    }
    function savePort(p) {
        const i = data.ports.findIndex(x => x.portId === p.portId);
        if (i >= 0) data.ports[i] = p; else data.ports.push(p);
        persist();
    }
    function removePort(id) {
        data.ports = data.ports.filter(x => x.portId !== id);
        persist();
    }

    // ---- voyages ----
    const voyages    = () => data.voyages;
    const getVoyage  = id => data.voyages.find(v => v.voyageId === id);
    const portsOf    = id => data.voyagePorts.filter(p => p.voyageId === id).sort((a,b)=>a.sequenceNo-b.sequenceNo);
    const cutoffsOf  = id => data.cutOffs.filter(c => c.voyageId === id);

    function uid(prefix, existsFn) {
        let n = 1, id;
        do { id = `${prefix}${String(n++).padStart(3,'0')}`; } while (existsFn(id));
        return id;
    }
    function newVoyageId() { return uid('VOY-NEW-', id => !!getVoyage(id)); }

    /** A working draft: deep-cloned voyage + its ports + cut-offs. */
    function draftOf(voyageId) {
        const v = getVoyage(voyageId);
        if (!v) return null;
        return JSON.parse(JSON.stringify({ voyage: v, ports: portsOf(voyageId), cutoffs: cutoffsOf(voyageId) }));
    }
    function blankDraft() {
        const id = newVoyageId();
        return {
            isNew: true,
            voyage: { voyageId:id, vesselId:'', carrierId:'', serviceLaneId:'', voyageNo:'',
                      direction:'Export', polPortId:'', podPortId:'', etd:null, eta:null,
                      transitDays:0, bookingStatus:'Open', scheduleStatus:'On Schedule' },
            ports: [], cutoffs: []
        };
    }

    /** Commit a draft back into data (replace voyage + its children). */
    function commit(draft) {
        const id = draft.voyage.voyageId;
        // voyage
        const vi = data.voyages.findIndex(v => v.voyageId === id);
        if (vi >= 0) data.voyages[vi] = draft.voyage; else data.voyages.push(draft.voyage);
        // children: drop old, insert new
        data.voyagePorts = data.voyagePorts.filter(p => p.voyageId !== id).concat(draft.ports);
        data.cutOffs     = data.cutOffs.filter(c => c.voyageId !== id).concat(draft.cutoffs);
        persist();
    }
    function remove(voyageId) {
        data.voyages     = data.voyages.filter(v => v.voyageId !== voyageId);
        data.voyagePorts = data.voyagePorts.filter(p => p.voyageId !== voyageId);
        data.cutOffs     = data.cutOffs.filter(c => c.voyageId !== voyageId);
        persist();
    }
    const exportData = () => JSON.stringify(data, null, 2);

    return {
        load, persist, resetSeed, exportData,
        carriers, vessels, ports, serviceLanes, carrierById, vesselById, portById,
        newVesselId, vesselUsed, saveVessel, removeVessel,
        newCarrierId, carrierUsed, saveCarrier, removeCarrier,
        newPortId, portUsed, savePort, removePort,
        voyages, getVoyage, portsOf, cutoffsOf,
        newVoyageId, draftOf, blankDraft, commit, remove
    };
}());
