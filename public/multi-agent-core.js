/**
 * 🧠 Multi-Agent Orchestration System v2.0
 * 10-Agent Civil Engineering OS with anti-hallucination enforcement.
 */
const MultiAgentSystem = {

    agents: {
        MASTER_ORCHESTRATOR:    { name: "Master Orchestrator",     icon: "🎯" },
        STRUCTURAL_ENGINEER:    { name: "Structural Engineer",     icon: "🏗️" },
        QUANTITY_SURVEYOR:      { name: "Quantity Surveyor",       icon: "📋" },
        ARCHITECT_DESIGNER:     { name: "Architect Designer",      icon: "🏠" },
        STRUCTURAL_AUDITOR:     { name: "Structural Auditor",      icon: "🛡️" },
        FOUNDATION_ENGINEER:    { name: "Foundation Engineer",     icon: "⛏️" },
        DRAWING_CAD_AGENT:      { name: "CAD & Drawing Agent",     icon: "📐" },
        REPORT_GENERATOR:       { name: "Report Generator",        icon: "📊" },
        SITE_EXECUTION_AGENT:   { name: "Site Execution Agent",    icon: "🚧" },
        CODE_VALIDATION_AGENT:  { name: "IS Code Validator",       icon: "✅" },
    },

    // Intent patterns: [regex, agentKey, mode, paramExtractor]
    intentTable: [
        // Full building / cascade
        [/design\s+(a\s+)?g\+?\d+|full\s+building|complete\s+design|load\s+path|slab\s+to\s+column/i,
            'MASTER_ORCHESTRATOR', 'cascade_design', q => {
                const floors = parseInt(q.match(/g\+?(\d+)/i)?.[1]) || 2;
                const usage = /office|commercial/i.test(q) ? 'office' : /industrial/i.test(q) ? 'industrial_light' : 'residential';
                return { floors, usage };
            }],
        // Slab
        [/design\s+slab|slab\s+design|slab\s+calculation|slab\s+for|reinforcement.*slab/i,
            'STRUCTURAL_ENGINEER', 'slab', q => {
                const nums = q.match(/(\d+\.?\d*)\s*[x*×]\s*(\d+\.?\d*)/i);
                const Lx = parseFloat(nums?.[1]) || parseFloat(q.match(/(\d+\.?\d*)\s*m/)?.[1]) || 4;
                const Ly = parseFloat(nums?.[2]) || 5;
                const thickness = parseInt(q.match(/thick\w*\s*[:=]?\s*(\d+)/i)?.[1]) || 125;
                return { Lx, Ly, thickness };
            }],
        // Beam
        [/design\s+beam|beam\s+design|beam\s+calc/i,
            'STRUCTURAL_ENGINEER', 'beam', q => ({
                b: parseInt(q.match(/width\s*[:=]?\s*(\d+)/i)?.[1]) || 230,
                D: parseInt(q.match(/depth\s*[:=]?\s*(\d+)/i)?.[1]) || 450,
                span: parseFloat(q.match(/span\s*[:=]?\s*([\d.]+)/i)?.[1]) || 5,
                load: parseFloat(q.match(/load\s*[:=]?\s*([\d.]+)/i)?.[1]) || 25,
            })],
        // Optimize beam
        [/optimize\s+beam/i, 'STRUCTURAL_ENGINEER', 'optimize_beam', q => ({
            span: parseFloat(q.match(/span\s*[:=]?\s*([\d.]+)/i)?.[1]) || 5,
            load: parseFloat(q.match(/load\s*[:=]?\s*([\d.]+)/i)?.[1]) || 25,
        })],
        // Column
        [/design\s+column|column\s+design|column\s+calc/i,
            'STRUCTURAL_ENGINEER', 'column', q => ({
                b: parseInt(q.match(/(\d+)\s*x\s*(\d+)/i)?.[1]) || 300,
                D: parseInt(q.match(/(\d+)\s*x\s*(\d+)/i)?.[2]) || 300,
                load: parseFloat(q.match(/load\s*[:=]?\s*([\d.]+)/i)?.[1]) || 500,
            })],
        // Footing
        [/design\s+footing|footing\s+design|footing\s+calc|foundation\s+design/i,
            'FOUNDATION_ENGINEER', 'footing', q => ({
                load: parseFloat(q.match(/load\s*[:=]?\s*([\d.]+)/i)?.[1]) || 500,
                SBC: parseFloat(q.match(/sbc\s*[:=]?\s*([\d.]+)/i)?.[1]) || 200,
            })],
        // Staircase
        [/design\s+stair|stair\s*case|stair\s+calc/i,
            'STRUCTURAL_ENGINEER', 'staircase', q => ({
                floorHeight: parseFloat(q.match(/height\s*[:=]?\s*([\d.]+)/i)?.[1]) || 3.0,
                width: parseFloat(q.match(/width\s*[:=]?\s*([\d.]+)/i)?.[1]) || 1.2,
            })],
        // Seismic
        [/seismic|earthquake|base\s+shear|is\s*1893/i,
            'STRUCTURAL_ENGINEER', 'seismic', q => ({
                zone: parseInt(q.match(/zone\s*[:=]?\s*(\d)/i)?.[1]) || 3,
            })],
        // BOQ / Quantity
        [/boq|quantity|how\s+much\s+(cement|steel|concrete)|material\s+estimate|bags/i,
            'QUANTITY_SURVEYOR', 'boq', q => ({
                component: q.match(/(slab|beam|column|footing|all)/i)?.[1] || 'all',
            })],
        // Audit / Safety
        [/audit|check\s+safety|is\s+(this|it)\s+safe|verify|validate/i,
            'STRUCTURAL_AUDITOR', 'audit', () => ({})],
        // Project setup
        [/set\s+project|project\s+setup|new\s+project|define\s+project/i,
            'MASTER_ORCHESTRATOR', 'project_setup', q => {
                const floors = parseInt(q.match(/g\+?(\d+)/i)?.[1] || q.match(/(\d+)\s*floor/i)?.[1]) || null;
                const spanX = parseFloat(q.match(/(\d+\.?\d*)\s*[x*]\s*(\d+\.?\d*)/)?.[1]) || null;
                const spanY = parseFloat(q.match(/(\d+\.?\d*)\s*[x*]\s*(\d+\.?\d*)/)?.[2]) || null;
                return { floors, spanX, spanY };
            }],
        // Report
        [/generate\s+report|full\s+report|summary\s+report|calculation\s+sheet/i,
            'REPORT_GENERATOR', 'report', () => ({})],
        // Project status
        [/project\s+status|what.*project|current\s+project|memory\s+status/i,
            'MASTER_ORCHESTRATOR', 'status', () => ({})],
        // Mix design (keep existing)
        [/mix\s+design|concrete\s+mix|m\d{2}\s+mix/i,
            'QUANTITY_SURVEYOR', 'mix', () => ({ triggerTool: 'calculateMix' })],
    ],

    // ── MAIN ROUTER ──
    async routeRequest(query) {
        const q = query.toLowerCase();

        for (const [pattern, agentKey, mode, extractor] of this.intentTable) {
            if (pattern.test(q)) {
                const params = extractor(q);
                return this.executeAgent(agentKey, mode, params);
            }
        }
        return null; // Falls through to LLM
    },

    // ── AGENT EXECUTOR ──
    executeAgent(agentKey, mode, params) {
        const agent = this.agents[agentKey];
        const solver = window.StructuralCore;
        const memory = window.ProjectMemory;

        try {
            // PROJECT SETUP
            if (mode === 'project_setup') return this.handleProjectSetup(params);
            if (mode === 'status') return this.handleProjectStatus();
            if (mode === 'report') return this.handleReport();
            if (mode === 'audit') return this.handleAudit();
            if (mode === 'boq') return this.handleBOQ(params);
            if (mode === 'cascade_design') return this.handleCascade(params);

            // Mix trigger
            if (mode === 'mix') {
                return { responder: agent.name, output: "Opening Mix Design module...", triggerTool: "calculateMix" };
            }

            // STRUCTURAL CALCULATIONS (deterministic only)
            if (!solver) return { responder: agent.name, output: "ERR: StructuralCore engine offline." };

            return this.executeStructural(agent, mode, params, solver, memory);
        } catch (e) {
            return { responder: agent.name, output: `Error: ${e.message}` };
        }
    },

    // ── STRUCTURAL ENGINE ──
    executeStructural(agent, mode, params, solver, memory) {
        let result, summary;
        const fck = memory?.get('concreteFck') || 20;
        const fy = memory?.get('steelFy') || 415;

        if (mode === 'slab') {
            const ctx = solver.buildContext(memory?.get('usageType') || 'residential', params.thickness);
            result = solver.designSlab(params.Lx, params.Ly, ctx.factoredLoad_Slab, fck, fy, params.thickness);
            memory?.storeResult('slab', result, agent.name);

            summary = `IS 456 SLAB DESIGN REPORT\n` +
                `Type: ${result.type} (Ly/Lx: ${result.ratio})\n` +
                `Moments: Mux = ${result.Mu_x_kNm} kNm, Muy = ${result.Mu_y_kNm} kNm\n` +
                `Main Steel: ${result.reinforcement_main}\n` +
                `Dist Steel: ${result.reinforcement_dist || 'N/A'}\n` +
                `Safety: ${result.safeDepth ? 'SAFE' : 'INCREASE DEPTH'}\n` +
                `Validation: ${result.validation?.passed ? 'All checks passed' : 'Issues: ' + (result.validation?.violations?.join(', ') || 'None')}`;

            this.triggerSlabUI(params, ctx);
        }
        else if (mode === 'beam') {
            result = solver.designBeam(params.b, params.D, params.span, params.load * 1.5, fck, fy);
            memory?.storeResult('beam_x', result, agent.name);
            summary = `IS 456 BEAM REPORT\n` +
                `Type: ${result.type}\nAst: ${result.Ast_required?.toFixed(2)} mm2\n` +
                `Steel: ${result.reinforcement.count} x #${result.reinforcement.dia}mm\n` +
                `Validation: ${result.validation?.passed ? 'Passed' : result.validation?.violations?.join(', ')}`;
        }
        else if (mode === 'optimize_beam') {
            result = solver.optimizeBeam(params.span, params.load, fck, fy);
            summary = `OPTIMIZED BEAM\nDepth: ${result.D}mm\n` +
                `Steel: ${result.reinforcement?.count} x #${result.reinforcement?.dia}mm\n` +
                `Note: ${result.optimizerNote || 'Done'}`;
        }
        else if (mode === 'column') {
            result = solver.designColumnAxial(params.load, fck, fy, params.b, params.D);
            memory?.storeResult('column', result, agent.name);
            summary = `IS 456 COLUMN REPORT\nPu: ${result.Pu} kN\n` +
                `Status: ${result.safe ? 'SAFE' : result.message}\n` +
                `Steel: ${result.reinforcement.count} x #${result.reinforcement.dia}mm\n` +
                `Ties: ${result.linkDia} @ ${result.linkSpacing}`;
        }
        else if (mode === 'footing') {
            result = solver.designFooting(params.load, params.SBC || 200, fck, fy);
            memory?.storeResult('footing', result, agent.name);
            summary = `FOOTING DESIGN\nArea: ${result.Area_req_m2} m2\n` +
                `Size: ${result.Provided_Size_m}\nDepth: ${result.Depth_Provided_mm}mm`;
        }
        else if (mode === 'staircase') {
            if (solver.designStaircase) {
                result = solver.designStaircase(params.floorHeight, params.width, fck, fy);
                memory?.storeResult('staircase', result, agent.name);
                summary = `STAIRCASE DESIGN\nRisers: ${result.risers} x ${result.riseHeight}mm\n` +
                    `Tread: ${result.tread}mm\nWaist: ${result.waistSlab}mm\n` +
                    `Main Steel: ${result.reinforcement_main}\nDist Steel: ${result.reinforcement_dist}`;
            } else {
                summary = "Staircase engine under development.";
            }
        }
        else if (mode === 'seismic') {
            if (solver.seismicBaseShear) {
                const W = memory?.get('buildingWeight') || 5000;
                result = solver.seismicBaseShear(params.zone, 1.0, memory?.get('soilType') || 'medium', W);
                summary = `IS 1893 SEISMIC ANALYSIS\nZone: ${params.zone}\nBase Shear (Vb): ${result.Vb} kN\n` +
                    `Ah: ${result.Ah}\nSa/g: ${result.Sa_by_g}`;
            } else {
                summary = "Seismic engine under development.";
            }
        }
        else {
            return { responder: agent.name, output: "Unknown structural mode." };
        }

        return { responder: agent.name, output: summary, rawCalculations: result };
    },

    // ── CASCADE: Full Building Design ──
    handleCascade(params) {
        const solver = window.StructuralCore;
        const memory = window.ProjectMemory;
        if (!solver || !memory) return { responder: "Master Orchestrator", output: "System engines offline." };

        const usage = params.usage || 'residential';
        const floors = params.floors || 2;
        const fck = memory.get('concreteFck') || 20;
        const fy = memory.get('steelFy') || 415;
        const Lx = memory.get('columnSpacingX') || 4;
        const Ly = memory.get('columnSpacingY') || 5;
        const thick = memory.get('slabThickness') || 150;

        memory.setMultiple({ buildingType: usage, floors, usageType: usage, columnSpacingX: Lx, columnSpacingY: Ly, slabThickness: thick }, 'Cascade Init');

        // Step 1: Context
        const ctx = solver.buildContext(usage, thick);
        // Step 2: Load path
        const path = solver.generateLoadPath(ctx.factoredLoad_Slab, Lx, Ly, Ly / Lx <= 2);
        // Step 3: Slab
        const slab = solver.designSlab(Lx, Ly, ctx.factoredLoad_Slab, fck, fy, thick);
        memory.storeResult('slab', slab, 'Structural Engineer');
        // Step 4: Beam
        const beamLoad = parseFloat(path.equivalentBeamUDL_kNm);
        const beam = solver.optimizeBeam(Ly, beamLoad / 1.5, fck, fy);
        memory.storeResult('beam_x', beam, 'Structural Engineer');
        // Step 5: Column
        const colLoad = parseFloat(path.beamEndReaction_kN) * floors;
        const col = solver.designColumnAxial(colLoad / 1.5, fck, fy, 300, 300);
        memory.storeResult('column', col, 'Structural Engineer');
        // Step 6: Footing
        const footing = solver.designFooting(colLoad / 1.5, memory.get('SBC') || 200, fck, fy);
        memory.storeResult('footing', footing, 'Foundation Engineer');

        const report =
            `FULL G+${floors} ${usage.toUpperCase()} DESIGN CASCADE\n` +
            `Span: ${Lx}m x ${Ly}m | M${fck} | Fe${fy}\n\n` +
            `[1] SLAB: ${slab.type} | Main: ${slab.reinforcement_main} | ${slab.safeDepth ? 'SAFE' : 'UNSAFE'}\n` +
            `[2] BEAM: Depth ${beam.D}mm | ${beam.reinforcement?.count}x#${beam.reinforcement?.dia}mm\n` +
            `[3] COLUMN: 300x300 | ${col.reinforcement.count}x#${col.reinforcement.dia}mm | ${col.safe ? 'SAFE' : 'UNSAFE'}\n` +
            `[4] FOOTING: ${footing.Provided_Size_m} | Depth ${footing.Depth_Provided_mm}mm\n\n` +
            `All values from deterministic IS 456 engine. Zero LLM fabrication.`;

        return { responder: "Master Orchestrator", output: report };
    },

    // ── PROJECT SETUP ──
    handleProjectSetup(params) {
        const memory = window.ProjectMemory;
        if (!memory) return { responder: "Master Orchestrator", output: "ProjectMemory offline." };

        const updates = {};
        if (params.floors) updates.floors = params.floors;
        if (params.spanX) { updates.columnSpacingX = params.spanX; updates.columnSpacingY = params.spanY || params.spanX; }
        if (Object.keys(updates).length > 0) memory.setMultiple(updates, 'Project Setup');

        const missing = memory.getMissingCritical();
        const summary = memory.getProjectSummary();
        let out = `Project updated. ${summary.parametersSet} params active.`;
        if (missing.length > 0) out += `\nStill needed: ${missing.join(', ')}`;
        return { responder: "Master Orchestrator", output: out };
    },

    // ── STATUS ──
    handleProjectStatus() {
        const memory = window.ProjectMemory;
        if (!memory) return { responder: "Master Orchestrator", output: "No project memory." };
        const s = memory.getProjectSummary();
        return { responder: "Master Orchestrator",
            output: `${s.projectName} | ${s.buildingType} | ${s.floors}\n` +
                `Span: ${s.span} | Materials: ${s.materials}\n` +
                `SBC: ${s.SBC} | Zone: ${s.seismicZone}\n` +
                `Params: ${s.parametersSet} | Warnings: ${s.warnings} (${s.criticalWarnings} critical)\n` +
                `Stale: ${s.staleComponents.length > 0 ? s.staleComponents.join(', ') : 'None'}`
        };
    },

    // ── AUDIT ──
    handleAudit() {
        const memory = window.ProjectMemory;
        if (!memory) return { responder: "Structural Auditor", output: "No memory to audit." };

        const warnings = [];
        const results = memory.calculationResults;

        if (results.slab?.result && !results.slab.result.safeDepth) warnings.push("SLAB: Depth inadequate (fails L/d check)");
        if (results.beam_x?.result && !results.beam_x.result.safe) warnings.push("BEAM: Overstressed section");
        if (results.column?.result && !results.column.result.safe) warnings.push("COLUMN: Exceeds capacity");
        if (results.slab?.result?.validation && !results.slab.result.validation.passed)
            warnings.push("SLAB CODE: " + results.slab.result.validation.violations.join(', '));
        if (results.beam_x?.result?.validation && !results.beam_x.result.validation.passed)
            warnings.push("BEAM CODE: " + results.beam_x.result.validation.violations.join(', '));

        const stale = [...memory.staleComponents];
        if (stale.length > 0) warnings.push(`Stale components need recalc: ${stale.join(', ')}`);

        if (warnings.length === 0) {
            return { responder: "Structural Auditor", output: "AUDIT PASSED. All computed components are within IS 456 limits. No critical warnings." };
        }
        return { responder: "Structural Auditor", output: `AUDIT REPORT: ${warnings.length} issue(s) found:\n${warnings.map((w, i) => `${i + 1}. ${w}`).join('\n')}` };
    },

    // ── BOQ ──
    handleBOQ(params) {
        const memory = window.ProjectMemory;
        const results = memory?.calculationResults;
        if (!results) return { responder: "Quantity Surveyor", output: "No calculations available for BOQ." };

        const items = [];
        const floors = memory.get('floors') || 1;
        const Lx = memory.get('columnSpacingX') || 4;
        const Ly = memory.get('columnSpacingY') || 5;
        const thick = memory.get('slabThickness') || 150;

        // Slab concrete
        const slabVol = (Lx * Ly * thick / 1000) * (floors + 1);
        items.push(`Slab Concrete: ${slabVol.toFixed(2)} m3 (${Math.ceil(slabVol / 0.035 * 8)} bags cement approx)`);

        // Beam concrete (if available)
        if (results.beam_x?.result) {
            const b = results.beam_x.result.b || 230;
            const D = results.beam_x.result.D || 450;
            const beamVol = (b / 1000) * (D / 1000) * Ly * 2 * (floors + 1); // 2 beams per panel
            items.push(`Beam Concrete: ${beamVol.toFixed(2)} m3`);
        }

        // Column concrete
        if (results.column?.result) {
            const cB = results.column.result.b || 300;
            const cD = results.column.result.D || 300;
            const fh = memory.get('floorHeight') || 3.0;
            const colVol = (cB / 1000) * (cD / 1000) * fh * 4 * (floors + 1); // 4 cols
            items.push(`Column Concrete: ${colVol.toFixed(2)} m3`);
        }

        if (items.length === 0) return { responder: "Quantity Surveyor", output: "Run structural design first to generate BOQ." };

        return { responder: "Quantity Surveyor", output: `BOQ ESTIMATE (Approx):\n${items.join('\n')}\n\nNote: Derived from actual computed geometry, not LLM estimates.` };
    },

    // ── REPORT ──
    handleReport() {
        const memory = window.ProjectMemory;
        if (!memory) return { responder: "Report Generator", output: "No data." };

        const s = memory.getProjectSummary();
        const results = memory.calculationResults;
        let report = `ENGINEERING SUMMARY REPORT\n${'='.repeat(40)}\n`;
        report += `Project: ${s.projectName}\nType: ${s.buildingType} | ${s.floors}\nSpan: ${s.span} | ${s.materials}\n\n`;

        if (results.slab?.result) report += `SLAB: ${results.slab.result.type} | ${results.slab.result.reinforcement_main}\n`;
        if (results.beam_x?.result) report += `BEAM: ${results.beam_x.result.reinforcement?.count}x#${results.beam_x.result.reinforcement?.dia}mm\n`;
        if (results.column?.result) report += `COLUMN: ${results.column.result.reinforcement?.count}x#${results.column.result.reinforcement?.dia}mm\n`;
        if (results.footing?.result) report += `FOOTING: ${results.footing.result.Provided_Size_m}\n`;

        report += `\nGenerated: ${new Date().toLocaleString()}\nEngine: StructuralCore v1.0 | IS 456:2000`;
        return { responder: "Report Generator", output: report };
    },

    // ── UI Trigger for Slab ──
    triggerSlabUI(params, ctx) {
        setTimeout(() => {
            const slabBtn = document.getElementById('guiModeSlab');
            if (slabBtn) slabBtn.click();
            const lxIn = document.getElementById('sgLx');
            const lyIn = document.getElementById('sgLy');
            const loadIn = document.getElementById('sgLoad');
            if (lxIn) lxIn.value = params.Lx;
            if (lyIn) lyIn.value = params.Ly;
            if (loadIn) loadIn.value = ctx.totalServiceLoad_Slab.toFixed(2);
            const calcBtn = document.getElementById('btnRunManualCalc');
            if (calcBtn) calcBtn.click();
        }, 500);
    },
};

window.MultiAgentSystem = MultiAgentSystem;
console.log("🧠 Multi-Agent System v2.0 Online — 10 Agents Active.");
