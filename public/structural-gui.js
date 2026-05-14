/**
 * 🖥️ Structural Designer GUI Handler
 * Connects the UI layout to deterministic computation solvers.
 */

(function() {
    let currentMode = "beam"; // "beam", "column", "slab"

    function drawSlabVisual(Lx, Ly, isTwoWay) {
        const canvas = document.getElementById('sgLoadCanvas');
        const container = document.getElementById('sgCanvasContainer');
        if (!canvas) return;

        container.style.display = "block";
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Normalize scaling
        const maxSpan = Math.max(Lx, Ly);
        const padding = 20;
        const scale = (canvas.width - padding * 2) / maxSpan;
        
        let w = Lx * scale;
        let h = Ly * scale;

        // If Ly is long, it might overflow height, let's auto-fit to container
        if (h > canvas.height - padding * 2) {
            const scaleH = (canvas.height - padding * 2) / Ly;
            w = Lx * scaleH;
            h = Ly * scaleH;
        }

        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const startX = cx - w / 2;
        const startY = cy - h / 2;

        // Draw slab outline
        ctx.fillStyle = "rgba(99, 102, 241, 0.1)";
        ctx.strokeStyle = "var(--accent)";
        ctx.lineWidth = 2;
        ctx.fillRect(startX, startY, w, h);
        ctx.strokeRect(startX, startY, w, h);

        ctx.fillStyle = "var(--text-primary)";
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`Lx = ${Lx}m`, cx, startY - 5);
        
        ctx.save();
        ctx.translate(startX - 5, cy);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(`Ly = ${Ly}m`, 0, 0);
        ctx.restore();

        // Draw Yield Lines
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.setLineDash([5, 5]);
        ctx.beginPath();

        if (isTwoWay) {
            // Two way - 45 degree yield lines
            // Intersection point depth is w/2 (if Lx is short)
            const angleDepth = w / 2;
            
            ctx.moveTo(startX, startY);
            ctx.lineTo(startX + angleDepth, startY + angleDepth);
            
            ctx.moveTo(startX + w, startY);
            ctx.lineTo(startX + w - angleDepth, startY + angleDepth);

            ctx.moveTo(startX, startY + h);
            ctx.lineTo(startX + angleDepth, startY + h - angleDepth);

            ctx.moveTo(startX + w, startY + h);
            ctx.lineTo(startX + w - angleDepth, startY + h - angleDepth);

            ctx.moveTo(startX + angleDepth, startY + angleDepth);
            ctx.lineTo(startX + angleDepth, startY + h - angleDepth);

            ctx.moveTo(startX + w - angleDepth, startY + angleDepth);
            ctx.lineTo(startX + w - angleDepth, startY + h - angleDepth);

        } else {
            // One way - Load travels only along Lx to the Ly supports
            ctx.moveTo(cx, startY);
            ctx.lineTo(cx, startY + h);
            
            // Draw arrows pointing left/right
            ctx.setLineDash([]);
            ctx.strokeStyle = "var(--success)";
            const drawArrow = (x, y, dir) => {
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + dir * 20, y);
                ctx.lineTo(x + dir * 20 - dir * 5, y - 5);
                ctx.moveTo(x + dir * 20, y);
                ctx.lineTo(x + dir * 20 - dir * 5, y + 5);
                ctx.stroke();
            };
            drawArrow(cx - 10, cy, -1);
            drawArrow(cx + 10, cy, 1);
        }

        ctx.stroke();
        ctx.setLineDash([]);
    }

    function init() {
        const btnBeam = document.getElementById('guiModeBeam');
        const btnCol = document.getElementById('guiModeColumn');
        const btnSlab = document.getElementById('guiModeSlab');
        const btnContext = document.getElementById('guiModeContext');
        
        const beamGroup = document.getElementById('sgBeamOnlyGroup');
        const slabGroup = document.getElementById('sgSlabGroup');
        const contextGroup = document.getElementById('sgContextGroup');
        const generalDims = document.getElementById('sgGeneralDims');
        const canvasContainer = document.getElementById('sgCanvasContainer');

        const labelLoad = document.getElementById('sgLabelLoad');
        const labelRes1 = document.getElementById('sgResLabel1');
        const computeBtn = document.getElementById('btnRunManualCalc');

        if (!btnBeam || !btnCol) return; 

        function resetTabs() {
            [btnBeam, btnCol, btnSlab, btnContext].forEach(b => {
                if(b) { b.style.background = "transparent"; b.style.color = "inherit"; b.classList.remove('active'); }
            });
            beamGroup.style.display = "none";
            slabGroup.style.display = "none";
            contextGroup.style.display = "none";
            generalDims.style.display = "grid";
            if(canvasContainer) canvasContainer.style.display = "none";
        }

        // --- Mode Toggles ---
        btnBeam.addEventListener('click', (e) => {
            e.preventDefault();
            currentMode = "beam";
            resetTabs();
            btnBeam.classList.add('active', 'btn-outline'); 
            btnBeam.style.background = "var(--accent)";
            btnBeam.style.color = "white";
            
            beamGroup.style.display = "block";
            labelLoad.innerHTML = "Working Load (UDL) [kN/m]";
            labelRes1.innerText = "Factored Moment (Mu)";
        });

        btnCol.addEventListener('click', (e) => {
            e.preventDefault();
            currentMode = "column";
            resetTabs();
            btnCol.style.background = "var(--accent)";
            btnCol.style.color = "white";
            
            labelLoad.innerHTML = "Working Axial Load [kN]";
            labelRes1.innerText = "Factored Load (Pu)";
        });

        if (btnSlab) {
            btnSlab.addEventListener('click', (e) => {
                e.preventDefault();
                currentMode = "slab";
                resetTabs();
                btnSlab.style.background = "var(--accent)";
                btnSlab.style.color = "white";
                
                slabGroup.style.display = "grid";
                generalDims.style.display = "none"; // Hide standard b, D
                
                labelLoad.innerHTML = "Working Total Load [kN/m²]";
                labelRes1.innerText = "Moment (Mu_x)";
            });
        }

        if (btnContext) {
            btnContext.addEventListener('click', (e) => {
                e.preventDefault();
                currentMode = "context";
                resetTabs();
                btnContext.style.background = "linear-gradient(135deg, var(--accent), #8b5cf6)";
                btnContext.style.color = "white";
                
                contextGroup.style.display = "flex";
                generalDims.style.display = "none";
                beamGroup.style.display = "none";
                
                labelRes1.innerText = "Cascading Result";
            });
        }

        // Trigger beam initially
        btnBeam.click();

        // --- Run Computation ---
        computeBtn.addEventListener('click', () => {
            const solver = window.StructuralCore;
            if (!solver) return alert("Structural Core Engine offline!");

            let result = null;
            const promptDiv = document.getElementById('sgResultPrompt');
            const reportDiv = document.getElementById('sgResultReport');
            
            promptDiv.style.display = "none";
            reportDiv.style.display = "block";
            if(canvasContainer) canvasContainer.style.display = "none"; // Hide until drawn

            const resVal1 = document.getElementById('sgResVal1');
            const resVal2 = document.getElementById('sgResVal2');
            const recMain = document.getElementById('sgRecMain');
            const recSub = document.getElementById('sgRecSub');
            const hdr = document.getElementById('sgReportHeader');
            const hdrText = document.getElementById('sgStatusText');
            const hdrIcon = document.getElementById('sgStatusIcon');

            const load = parseFloat(document.getElementById('sgLoad').value);
            const fck = parseFloat(document.getElementById('sgFck').value);
            const fy = parseFloat(document.getElementById('sgFy').value);

            if (currentMode === "beam") {
                const b = parseFloat(document.getElementById('sgWidth').value);
                const D = parseFloat(document.getElementById('sgDepth').value);
                const span = parseFloat(document.getElementById('sgSpan').value);
                const w_factored = load * 1.5;
                result = solver.designBeam(b, D, span, w_factored, fck, fy);

                if (result.safe === false && !result.type) {
                    hdr.style.background = "rgba(239,68,68,0.15)";
                    hdrText.innerText = "Section Failed / Overstressed";
                    hdrIcon.innerText = "❌";
                    resVal1.innerText = "CRITICAL";
                    resVal2.innerText = "RESIZE";
                    recMain.innerText = "Inadequate Depth";
                    recSub.innerText = "Concrete crushes in compression.";
                } else {
                    hdr.style.background = "rgba(16,185,129,0.15)";
                    hdrText.innerText = result.safe ? "Singly Reinforced Safe" : "Doubly Reinforced Required";
                    hdrIcon.innerText = "✅";
                    resVal1.innerHTML = `${result.Mu_kNm} <small>kNm</small>`;
                    resVal2.innerHTML = `${result.Ast_required} <small>mm²</small>`;
                    recMain.innerHTML = `<strong>${result.reinforcement.count} bars × #${result.reinforcement.dia}mm</strong>`;
                    recSub.innerText = `Provided Area: ${result.reinforcement.areaProvided} mm² (At Bottom)`;

                    document.getElementById('sgMathBreakdown').innerHTML = `
                        • Effective Depth (d) = D - cover = ${result.d_mm} mm<br>
                        • Factored Moment (Mu) = 1.5 * (w * L² / 8) = ${result.Mu_kNm} kNm<br>
                        • Limiting Moment (Mulim) = ${result.Mulim_kNm} kNm<br>
                        • Ast Min Check = 0.85 * b * d / fy = ${result.Ast_min} mm²<br>
                        • Status: ${result.type}
                    `;
                }

            } else if (currentMode === "column") {
                const b = parseFloat(document.getElementById('sgWidth').value);
                const D = parseFloat(document.getElementById('sgDepth').value);
                result = solver.designColumnAxial(load, fck, fy, b, D);

                if (!result.isSafe) {
                    hdr.style.background = "rgba(239,68,68,0.15)";
                    hdrText.innerText = "Section Too Small";
                    hdrIcon.innerText = "⚠️";
                } else {
                    hdr.style.background = "rgba(16,185,129,0.15)";
                    hdrText.innerText = "Column Safe Under Axis Load";
                    hdrIcon.innerText = "✅";
                }

                resVal1.innerHTML = `${result.Pu_kN} <small>kN</small>`;
                resVal2.innerHTML = `${result.requiredSteel} <small>mm²</small>`;
                recMain.innerHTML = `<strong>${result.reinforcement.count} bars × #${result.reinforcement.dia}mm</strong>`;
                recSub.innerText = `Links: ${result.spacingRecommendation.linkDia} @ ${result.spacingRecommendation.linkSpacing}`;

                const grossArea = b * D;
                document.getElementById('sgMathBreakdown').innerHTML = `
                    • Factored Load (Pu) = 1.5 * Load = ${result.Pu_kN} kN<br>
                    • Gross Area (Ag) = b * D = ${grossArea} mm²<br>
                    • Formula: Pu = 0.4*fck*Ac + 0.67*fy*Asc<br>
                    • Req Steel Area (Asc) = ${result.requiredSteel} mm²<br>
                    • Reinforcement Percentage = ${((parseFloat(result.requiredSteel) / grossArea)*100).toFixed(2)}%
                `;

            } else if (currentMode === "slab") {
                const Lx = parseFloat(document.getElementById('sgLx').value);
                const Ly = parseFloat(document.getElementById('sgLy').value);
                const factoredLoad = load * 1.5;
                
                result = solver.designSlab(Lx, Ly, factoredLoad, fck, fy, 150); // Hardcoded 150mm slab for demo
                
                if (!result.safeDepth) {
                    hdr.style.background = "rgba(239,68,68,0.15)";
                    hdrText.innerText = "Depth (150mm) Inadequate for Moment";
                    hdrIcon.innerText = "❌";
                } else {
                    hdr.style.background = "rgba(16,185,129,0.15)";
                    hdrText.innerText = result.type + " (Safe)";
                    hdrIcon.innerText = "✅";
                }

                resVal1.innerHTML = `${result.Mu_x_kNm} <small>kNm</small>`;
                resVal2.innerHTML = `${result.Ast_x_req} <small>mm²/m</small>`;
                recMain.innerHTML = `<strong>${result.reinforcement_main}</strong>`;
                recSub.innerText = `Ratio Ly/Lx: ${result.ratio} (${result.type})`;

                document.getElementById('sgMathBreakdown').innerHTML = `
                    • Ratio (Ly/Lx) = ${result.ratio}<br>
                    • Load Transfer: ${result.type}<br>
                    • Max Moment (Mux) = ${result.Mu_x_kNm} kNm<br>
                    • Min Steel Check = ${result.Ast_min} mm²/m<br>
                    • Design Basis: IS 456 Annex D coefficients / Strip Method
                `;

                // Render Canvas
                drawSlabVisual(result.loadPathVisualData.Lx, result.loadPathVisualData.Ly, result.loadPathVisualData.isTwoWay);
                
            } else if (currentMode === "context") {
                const usage = document.getElementById('sgUsage').value;
                const Lx = parseFloat(document.getElementById('sgCtxLx').value);
                const Ly = parseFloat(document.getElementById('sgCtxLy').value);
                const thick = parseFloat(document.getElementById('sgCtxThick').value);

                // 1. Context Builder
                const ctxData = solver.buildContext(usage, thick);
                
                // 2. Load Path Gen
                const pathData = solver.generateLoadPath(ctxData.factoredLoad_Slab, Lx, Ly, Ly/Lx <= 2.0);
                
                // 3. Beam Optimizer
                const optBeam = solver.optimizeBeam(Ly, parseFloat(pathData.equivalentBeamUDL_kNm) / 1.5, fck, fy, 230);
                
                // 4. Column Sizer
                const colSize = solver.designColumnAxial(parseFloat(pathData.beamEndReaction_kN) / 1.5, fck, fy, 300, 300);

                hdr.style.background = "rgba(139, 92, 246, 0.15)";
                hdrText.innerText = "Full Load Path Cascaded Successfully";
                hdrIcon.innerText = "🚀";

                resVal1.innerHTML = `${pathData.beamEndReaction_kN} <small>kN</small>`;
                resVal1.previousElementSibling.innerText = "Max Column Reaction";
                
                resVal2.innerHTML = `${optBeam.D} <small>mm</small>`;
                resVal2.previousElementSibling.innerText = "Optimized Beam Depth";

                recMain.innerHTML = `<strong>Tributary Slab -> Beam -> Column</strong>`;
                recSub.innerText = "See detailed computational tree below.";

                document.getElementById('sgMathBreakdown').innerHTML = `
                    <div style="margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                        <strong style="color:var(--accent-light);">1. Data Homogenizer (IS 875)</strong><br>
                        • Usage: ${usage.toUpperCase()} -> Live Load = ${ctxData.liveLoad_IS875} kN/m²<br>
                        • Dead Load (Slab ${thick}mm + Finishes) = ${ctxData.deadLoad_Slab} kN/m²<br>
                        • <strong>Factored Slab Load</strong> = ${ctxData.factoredLoad_Slab} kN/m²
                    </div>
                    <div style="margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                        <strong style="color:var(--accent-light);">2. Load Path Generator</strong><br>
                        • Slab dimensions: ${Lx}m x ${Ly}m (${Ly/Lx <= 2.0 ? 'Two-Way' : 'One-Way'})<br>
                        • Equivalent Beam UDL = ${pathData.equivalentBeamUDL_kNm} kN/m<br>
                        • End Reaction sent to Column = <strong>${pathData.beamEndReaction_kN} kN</strong>
                    </div>
                    <div style="margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                        <strong style="color:var(--accent-light);">3. Beam Optimizer (Limit State)</strong><br>
                        • Span: ${Ly}m, Width: 230mm<br>
                        • Loop executed. Safest optimized depth: <strong>${optBeam.D} mm</strong><br>
                        • Steel: ${optBeam.reinforcement.count} bars of #${optBeam.reinforcement.dia}mm
                    </div>
                    <div>
                        <strong style="color:var(--accent-light);">4. Column Capacity Tool</strong><br>
                        • Size tested: 300x300<br>
                        • Pu (Factored) = ${colSize.Pu_kN} kN<br>
                        • Required Steel = ${colSize.requiredSteel} mm²<br>
                        • Code Validation = ${colSize.validation.passed ? 'PASSED' : 'FAILED'}
                    </div>
                `;
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        setTimeout(init, 500);
    }
})();
