/**
 * 🧠 PROJECT MEMORY ENGINE
 * Persistent, dependency-aware engineering state for the Jarvis ERP System.
 * When any parameter changes, all dependent calculations are auto-invalidated.
 * Standards: IS 456:2000 | IS 875:1987 | IS 1893:2016
 */

const ProjectMemory = {

    VERSION: '1.0.0',

    // ── DEPENDENCY GRAPH ──
    // If key changes → these calculation modules become stale
    DEPENDENCIES: {
        columnSpacingX:  ['slab', 'beam_x', 'beam_y', 'column', 'footing', 'boq', 'seismic'],
        columnSpacingY:  ['slab', 'beam_x', 'beam_y', 'column', 'footing', 'boq', 'seismic'],
        slabThickness:   ['slab', 'beam_x', 'beam_y', 'column', 'footing', 'boq'],
        floorHeight:     ['column', 'seismic', 'wind'],
        floors:          ['column', 'footing', 'seismic', 'wind', 'boq'],
        concreteFck:     ['slab', 'beam_x', 'beam_y', 'column', 'footing'],
        steelFy:         ['slab', 'beam_x', 'beam_y', 'column', 'footing'],
        liveLoad:        ['slab', 'beam_x', 'beam_y', 'column', 'footing', 'seismic'],
        usageType:       ['liveLoad', 'slab', 'beam_x', 'beam_y'],
        SBC:             ['footing'],
        soilType:        ['footing', 'seismic'],
        seismicZone:     ['seismic', 'column', 'footing'],
        buildingType:    ['liveLoad', 'usageType', 'importanceFactor'],
        beamWidth:       ['beam_x', 'beam_y', 'boq'],
        beamDepth:       ['beam_x', 'beam_y', 'boq'],
        columnSizeX:     ['column', 'footing', 'boq'],
        columnSizeY:     ['column', 'footing', 'boq'],
    },

    // ── LIVE DATA STORE ──
    data: {},

    // ── CALCULATION RESULT CACHE ──
    calculationResults: {
        context: null,
        slab: null,
        beam_x: null,
        beam_y: null,
        column: null,
        footing: null,
        staircase: null,
        seismic: null,
        wind: null,
        boq: null,
        audit: null,
    },

    staleComponents: new Set(),
    revisionLog: [],
    warningsLog: [],

    // ── INIT ──
    init() {
        this.load();
        console.log(`🧠 ProjectMemory v${this.VERSION} Online. Active params: ${Object.keys(this.data).filter(k => this.data[k] !== null).length}`);
        return this;
    },

    // ── SET (with cascade) ──
    set(key, value, reason = 'User Input') {
        const oldValue = this.data[key];
        if (oldValue === value) return this;

        this.data[key] = value;
        this.addRevision(`${key}: [${oldValue ?? 'unset'}] → [${value}]`, reason);

        const deps = this.DEPENDENCIES[key] || [];
        deps.forEach(dep => {
            this.staleComponents.add(dep);
            if (this.calculationResults[dep]) {
                this.calculationResults[dep] = null;
            }
        });

        if (deps.length > 0) {
            console.warn(`🔄 ProjectMemory: '${key}' changed → Stale: [${deps.join(', ')}]`);
            window.dispatchEvent(new CustomEvent('projectMemoryUpdate', {
                detail: { changedKey: key, affectedComponents: deps, newValue: value }
            }));
        }

        this.save();
        return this;
    },

    setMultiple(params, reason = 'Batch Input') {
        Object.entries(params).forEach(([k, v]) => this.set(k, v, reason));
        return this;
    },

    get(key) { return this.data[key] ?? null; },
    getAll() { return { ...this.data }; },
    isStale(component) { return this.staleComponents.has(component); },
    clearStale(component) { this.staleComponents.delete(component); },

    // ── RESULT STORAGE ──
    storeResult(component, result, agentName = 'System') {
        this.calculationResults[component] = {
            result,
            timestamp: new Date().toISOString(),
            agent: agentName,
            inputSnapshot: { ...this.data },
        };
        this.clearStale(component);
        this.save();
        return this;
    },

    getResult(component) {
        return this.calculationResults[component]?.result ?? null;
    },

    // ── WARNINGS ──
    addWarning(message, severity = 'WARNING', component = 'SYSTEM') {
        const entry = {
            id: `W${Date.now()}`,
            timestamp: new Date().toISOString(),
            severity,
            component,
            message,
        };
        this.warningsLog.push(entry);
        if (severity === 'CRITICAL') {
            console.error(`🚨 [${component}] CRITICAL: ${message}`);
        }
        this.save();
        return entry;
    },

    getWarnings(severity = null) {
        return severity ? this.warningsLog.filter(w => w.severity === severity) : this.warningsLog;
    },

    clearWarnings(component = null) {
        this.warningsLog = component
            ? this.warningsLog.filter(w => w.component !== component)
            : [];
        this.save();
    },

    // ── REVISIONS ──
    addRevision(change, reason) {
        this.revisionLog.push({ timestamp: new Date().toISOString(), change, reason });
        if (this.revisionLog.length > 100) this.revisionLog.shift();
    },

    // ── PROJECT SUMMARY ──
    getProjectSummary() {
        const d = this.data;
        return {
            projectName:       d.projectName || 'Unnamed Project',
            buildingType:      d.buildingType || 'Not Set',
            floors:            d.floors != null ? `G+${d.floors}` : 'Not Set',
            span:              d.columnSpacingX ? `${d.columnSpacingX}m × ${d.columnSpacingY || d.columnSpacingX}m` : 'Not Set',
            materials:         d.concreteFck ? `M${d.concreteFck} | Fe${d.steelFy || 415}` : 'Not Set',
            usage:             d.usageType || 'Not Set',
            SBC:               d.SBC ? `${d.SBC} kN/m²` : 'Not Set',
            seismicZone:       d.seismicZone || 'Not Set',
            parametersSet:     Object.keys(d).filter(k => d[k] !== null).length,
            staleComponents:   [...this.staleComponents],
            warnings:          this.warningsLog.length,
            criticalWarnings:  this.warningsLog.filter(w => w.severity === 'CRITICAL').length,
        };
    },

    getMissingCritical() {
        const critical = ['buildingType', 'floors', 'columnSpacingX', 'concreteFck', 'steelFy'];
        return critical.filter(k => !this.data[k] && this.data[k] !== 0);
    },

    getContextForLLM() {
        const s = this.getProjectSummary();
        const stale = this.staleComponents.size > 0
            ? `\n⚠️ Stale (needs recalc): ${[...this.staleComponents].join(', ')}`
            : '';
        const warn = this.warningsLog.filter(w => w.severity === 'CRITICAL').length > 0
            ? `\n🚨 ${this.warningsLog.filter(w => w.severity === 'CRITICAL').length} CRITICAL warnings active.`
            : '';
        return `PROJECT: ${s.projectName} | Type: ${s.buildingType} | ${s.floors} floors | Span: ${s.span} | Materials: ${s.materials} | Zone: ${s.seismicZone} | SBC: ${s.SBC}${stale}${warn}`;
    },

    // ── PERSISTENCE ──
    save() {
        try {
            localStorage.setItem('jarvis_project_memory', JSON.stringify({
                data: this.data,
                calculationResults: this.calculationResults,
                revisionLog: this.revisionLog.slice(-50),
                warningsLog: this.warningsLog.slice(-30),
            }));
        } catch (e) { console.warn('ProjectMemory: Save failed', e); }
    },

    load() {
        try {
            const raw = localStorage.getItem('jarvis_project_memory');
            if (raw) {
                const state = JSON.parse(raw);
                this.data = state.data || {};
                this.calculationResults = { ...this.calculationResults, ...(state.calculationResults || {}) };
                this.revisionLog = state.revisionLog || [];
                this.warningsLog = state.warningsLog || [];
            } else {
                this.data = {};
            }
        } catch (e) {
            console.warn('ProjectMemory: Load failed. Starting fresh.');
            this.data = {};
        }
    },

    reset(keepMaterials = false) {
        const backup = keepMaterials
            ? { concreteFck: this.data.concreteFck, steelFy: this.data.steelFy }
            : {};
        this.data = { ...backup };
        Object.keys(this.calculationResults).forEach(k => { this.calculationResults[k] = null; });
        this.staleComponents = new Set();
        this.warningsLog = [];
        this.addRevision('Full project reset', 'User Command');
        this.save();
        console.log('🔄 ProjectMemory: Reset.');
    },

    exportJSON() {
        return JSON.stringify({
            exportDate: new Date().toISOString(),
            summary: this.getProjectSummary(),
            data: this.data,
            results: this.calculationResults,
            warnings: this.warningsLog,
            revisions: this.revisionLog,
        }, null, 2);
    },
};

window.ProjectMemory = ProjectMemory;
ProjectMemory.init();
