/**
 * 🧠 Multi-Agent System Orchestrator
 * Coordinates intents between Senior Engineer, SA, and specialized tooling.
 */

const MultiAgentSystem = {
    
    // --- AGENT CONFIGURATION & SYSTEM PROMPTS ---
    agents: {
        SENIOR_ORCHESTRATOR: {
            name: "Senior Civil Engineer (Orchestrator)",
            persona: `You are the Senior Managing Civil Engineer. Your job is to examine the user request.
If it involves integrity, safety, load path, steel, or concrete strengths, you delegage to 'STRUCTURAL_AUDITOR'.
If it involves money, quantities of material, or daily burn rate, you delegate to 'QUANTITY_SURVEYOR'.
Always present answers derived from agent logic authoritatively.`,
        },
        STRUCTURAL_AUDITOR: {
            name: "Structural Auditor",
            persona: `You are an Elite Structural Auditor. You NEVER guess engineering constants. 
You are programmed with strict adherence to IS 456:2000 and IS 875.
You must utilize 'StructuralCore' compute methods to evaluate beam or column dimensions and return deterministic answers containing specific bar diameters and safety checks.`,
        },
        QUANTITY_SURVEYOR: {
            name: "Quantity Surveyor",
            persona: `You are the Cost & Material Specialist. You track efficiency, cement bags, steel weights, and labour liquidity.`
        }
    },

    /**
     * Advanced Intent Triage Engine
     * Maps semantic keywords directly to Specialized Sub-Agents & Automated Workflows.
     */
    async routeRequest(query) {
        const q = query.toLowerCase();

        // --- 🏗️ SCENARIO A: Full Load Path & Context (IS-456/IS-875 Automation) ---
        if (q.includes('load path') || q.includes('full design') || q.includes('slab to column')) {
            const usage = q.includes('office') ? 'office' : (q.includes('industrial') ? 'industrial_light' : 'residential');
            return this.executeStructuralAuditor("load_path", { usage, slabThick: 150, spanX: 4, spanY: 5 });
        }

        // --- 🏗️ SCENARIO B: Beam Optimization ---
        if (q.includes('optimize beam') || (q.includes('design beam') && q.includes('optimize'))) {
            const span = parseFloat(q.match(/span\s*[:\s=]*([\d.]+)/)?.[1]) || 5.0;
            const load = parseFloat(q.match(/load\s*[:\s=]*([\d.]+)/)?.[1]) || 25.0; 
            return this.executeStructuralAuditor("optimize_beam", { span, load });
        }

        // --- 🏗️ SCENARIO C: Direct Component Design ---
        if (q.includes('design beam') || q.includes('beam calculation') || q.includes('column design') || q.includes('footing')) {
            const b = parseFloat(q.match(/width\s*[:\s=]*(\d+)/)?.[1]) || 230; 
            const D = parseFloat(q.match(/(depth|height)\s*[:\s=]*(\d+)/)?.[2] || q.match(/depth\s*[:\s=]*(\d+)/)?.[1]) || 450; 
            const span = parseFloat(q.match(/span\s*[:\s=]*([\d.]+)/)?.[1]) || 5.0;
            const load = parseFloat(q.match(/load\s*[:\s=]*([\d.]+)/)?.[1]) || 25.0; 

            if (q.includes('beam')) return this.executeStructuralAuditor("beam", { b, D, span, load });
            else if (q.includes('column')) return this.executeStructuralAuditor("column", { b, D, load });
            else if (q.includes('footing')) return this.executeStructuralAuditor("footing", { load });
            
            return {
                responder: this.agents.STRUCTURAL_AUDITOR.name,
                output: "I require specific parameters to initiate an IS-456 deterministic solver pass. (Example: 'Design beam width 230 depth 450 span 5')"
            };
        }

        // --- 📋 SCENARIO D: Quantity / BOQ Requests ---
        if (q.includes('bags') || q.includes('mix') || q.includes('how much cement')) {
            return {
                 responder: this.agents.QUANTITY_SURVEYOR.name,
                 output: "Switching task focus to Material Consumption Ledger. Analyzing...",
                 triggerTool: "calculateMix"
            };
        }

        return null;
    },

    /**
     * The Deterministic Execution Sandbox for SA Agent
     */
    executeStructuralAuditor(mode, params) {
        const solver = window.StructuralCore;
        if (!solver) return { responder: this.agents.STRUCTURAL_AUDITOR.name, output: "ERR: 'StructuralCore' missing." };

        let result = null;
        let summary = "";

        try {
            if (mode === "load_path") {
                const ctx = solver.buildContext(params.usage, params.slabThick);
                const path = solver.generateLoadPath(ctx.factoredLoad_Slab, params.spanX, params.spanY, true);
                
                summary = `✅ **STRUCTURAL CONTEXT & LOAD PATH GENERATED**\n` +
                          `• **Usage**: ${ctx.usageDetected.toUpperCase()} (Live Load assigned: ${ctx.liveLoad_IS875} kN/m² per IS 875)\n` +
                          `• **Slab Total Load**: ${ctx.totalServiceLoad_Slab} kN/m² (Factored: ${ctx.factoredLoad_Slab} kN/m²)\n` +
                          `• **Beam Equivalent UDL**: ${path.equivalentBeamUDL_kNm} kN/m\n` +
                          `• **Column Point Reaction**: ${path.beamEndReaction_kN} kN\n` +
                          `*Next step: Passing ${path.beamEndReaction_kN} kN to ColumnDesigner.*`;
            }
            else if (mode === "optimize_beam") {
                result = solver.optimizeBeam(params.span, params.load, 20, 415);
                summary = `⚡ **OPTIMIZED BEAM DESIGN**\n` +
                          `• **Final Depth (D)**: ${result.D} mm\n` +
                          `• **Validation Status**: ${result.validation.passed ? "PASSED ✅" : "FAILED ❌"}\n` +
                          `• **Optimizer Note**: ${result.optimizerNote}\n` +
                          `• **Reinforcement**: ${result.reinforcement.count} bars of #${result.reinforcement.dia}mm.`;
            }
            else if (mode === "beam") {
                result = solver.designBeam(params.b, params.D, params.span, params.load, 20, 415);
                summary = `✅ **IS 456 BEAM REPORT**\n` +
                          `• Type: ${result.type}\n` +
                          `• Ast Req: ${result.Ast_required.toFixed(2)} mm²\n` +
                          `• Reinforcement: **${result.reinforcement.count} - #${result.reinforcement.dia}mm**\n` +
                          `• **Code Validator**: ${result.validation.passed ? "All checks passed." : "Violations found: " + result.validation.violations.join(', ')}`;
            } 
            else if (mode === "column") {
                result = solver.designColumnAxial(params.load, 20, 415, params.b, params.D);
                summary = `✅ **IS 456 COLUMN REPORT**\n` +
                          `• Factored Load (Pu): ${result.Pu} kN\n` +
                          `• Status: ${result.safe ? "SAFE" : "NOT SAFE. " + result.message}\n` +
                          `• Reinforcement: **${result.reinforcement.count} - #${result.reinforcement.dia}mm**\n` +
                          `• Lateral Ties: ${result.linkDia} @ ${result.linkSpacing}\n` +
                          `• **Code Validator**: ${result.validation.passed ? "All checks passed." : "Violations found: " + result.validation.violations.join(', ')}`;
            }
            else if (mode === "footing") {
                result = solver.designFooting(params.load, 200, 20, 415); // Assume 200 kN/m2 SBC
                summary = `✅ **FOOTING SIZING**\n` +
                          `• Area Req: ${result.Area_req_m2} m²\n` +
                          `• Size Provided: **${result.Provided_Size_m}**\n` +
                          `• Min Depth for Punching: **${result.Depth_Provided_mm} mm**\n` +
                          `• Status: ${result.Status}`;
            }

            return { responder: this.agents.STRUCTURAL_AUDITOR.name, output: summary, rawCalculations: result };
        } catch (e) {
            return { responder: this.agents.STRUCTURAL_AUDITOR.name, output: "Error executing structural tools: " + e.message };
        }
    }
};

// Inject into global scope for ERP Assistant hook
window.MultiAgentSystem = MultiAgentSystem;
console.log("🧠 Multi-Agent Ecosystem Online and Connected to Solver Libraries.");
