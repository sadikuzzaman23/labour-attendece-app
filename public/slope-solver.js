// Linear Equation Solver using Gaussian Elimination
function solveLinearSystem(A, B) {
    const n = B.length;
    let x = new Array(n).fill(0);
    let matrix = [];
    for (let i = 0; i < n; i++) {
        matrix.push([...A[i], B[i]]);
    }

    for (let i = 0; i < n; i++) {
        // Find pivot
        let maxEl = Math.abs(matrix[i][i]);
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(matrix[k][i]) > maxEl) {
                maxEl = Math.abs(matrix[k][i]);
                maxRow = k;
            }
        }

        // Swap maximum row with current row
        let tmp = matrix[maxRow];
        matrix[maxRow] = matrix[i];
        matrix[i] = tmp;

        // Make all rows below this one 0 in current column
        for (let k = i + 1; k < n; k++) {
            let c = -matrix[k][i] / matrix[i][i];
            for (let j = i; j < n + 1; j++) {
                if (i === j) {
                    matrix[k][j] = 0;
                } else {
                    matrix[k][j] += c * matrix[i][j];
                }
            }
        }
    }

    // Solve equation Ax=b for an upper triangular matrix
    for (let i = n - 1; i >= 0; i--) {
        if(Math.abs(matrix[i][i]) < 1e-10) {
            return null; // Singular matrix (unstable structure)
        }
        x[i] = matrix[i][n] / matrix[i][i];
        for (let k = i - 1; k >= 0; k--) {
            matrix[k][n] -= matrix[k][i] * x[i];
        }
    }
    return x;
}

class BeamSolver {
    constructor(spans, nodes, loads) {
        this.spans = spans; // [{id, length, EI}]
        this.nodes = nodes; // [{id, type}]
        this.loads = loads; // [{spanId, type, mag, pos}]
        this.steps = [];    // For student mode
        this.results = null;
    }

    addStep(title, content) {
        this.steps.push({ title, content });
    }

    solve() {
        this.steps = [];
        const numNodes = this.nodes.length;
        const numSpans = this.spans.length;

        // Step 1: Calculate Fixed End Moments (FEM)
        let FEM = new Array(numSpans).fill(0).map(() => ({ L: 0, R: 0 }));
        this.addStep("Step 1", "Calculate Fixed End Moments (FEM) for each span.");
        
        let femDetails = "";
        this.spans.forEach((span, i) => {
            const spanLoads = this.loads.filter(l => l.spanId === span.id);
            const L = span.length;
            let M_AB = 0;
            let M_BA = 0;
            
            spanLoads.forEach(load => {
                if (load.type === 'point') {
                    const P = load.mag;
                    // Clamp 'a' strictly within (0, L) to prevent negative 'b' → garbage FEM
                    const a = Math.min(Math.max(load.pos, 0.001), L - 0.001);
                    const b = L - a;
                    const mab = -((P * a * b * b) / (L * L));
                    const mba = ((P * a * a * b) / (L * L));
                    M_AB += mab;
                    M_BA += mba;
                    femDetails += `Span ${i+1} Point Load (P=${P}kN, a=${a.toFixed(2)}m, b=${b.toFixed(2)}m, L=${L}m):\n  FEM_AB = -Pab²/L² = ${mab.toFixed(2)} kNm\n  FEM_BA = +Pa²b/L² = ${mba.toFixed(2)} kNm\n`;
                } else if (load.type === 'udl') {
                    const w = load.mag;
                    const mab = -(w * L * L) / 12;
                    const mba = (w * L * L) / 12;
                    M_AB += mab;
                    M_BA += mba;
                    femDetails += `Span ${i+1} UDL: FEM_AB = -wL²/12 = ${mab.toFixed(2)} kNm. FEM_BA = wL²/12 = ${mba.toFixed(2)} kNm.\n`;
                }
            });
            if (spanLoads.length === 0) {
                femDetails += `Span ${i+1} has no load: FEM_AB = 0, FEM_BA = 0.\n`;
            }
            FEM[i].L = M_AB;
            FEM[i].R = M_BA;
        });
        if (femDetails) this.addStep("FEM Calculations", femDetails);

        // Map unknowns (Rotations Theta)
        // Fixed = 0 rotation. Pinned/Roller = unknown.
        let unknownsMap = []; // index of unknown corresponding to node
        let numUnknowns = 0;
        let boundaryConds = "";
        for (let i = 0; i < numNodes; i++) {
            if (this.nodes[i].type === 'fixed') {
                unknownsMap[i] = -1; // known as 0
                boundaryConds += `Node ${String.fromCharCode(65 + i)} is Fixed. θ${String.fromCharCode(65 + i)} = 0.\n`;
            } else {
                unknownsMap[i] = numUnknowns++;
                boundaryConds += `Node ${String.fromCharCode(65 + i)} is ${this.nodes[i].type}. θ${String.fromCharCode(65 + i)} is unknown.\n`;
            }
        }
        this.addStep("Step 2", "Identify Boundary Conditions:\n" + boundaryConds);

        // Slope Deflection Equations Formulation
        // M_ij = FEM_ij + (2EI/L) * (2*Th_i + Th_j)
        this.addStep("Step 3", "Formulate Slope Deflection Equations and Joint Equilibrium (ΣM = 0).");
        
        let A = Array(numUnknowns).fill(0).map(() => Array(numUnknowns).fill(0));
        let B = Array(numUnknowns).fill(0);
        let eqDetails = "";

        for (let i = 0; i < numNodes; i++) {
            const uIdx = unknownsMap[i];
            if (uIdx === -1) continue; // Fixed support, no equilibrium equation needed

            let constTerm = 0;
            
            // Check left span (span ending at node i)
            if (i > 0) {
                let spanIdx = i - 1;
                let L = this.spans[spanIdx].length;
                let EI = this.spans[spanIdx].EI || 1; // Default EI = 1
                let K = (2 * EI) / L;
                
                // M_{i, i-1} = FEM_R + K * (2 * Th_i + Th_{i-1})
                constTerm += FEM[spanIdx].R;
                
                A[uIdx][uIdx] += 2 * K; // coefficient of Th_i
                
                const leftUIdx = unknownsMap[i-1];
                if (leftUIdx !== -1) {
                    A[uIdx][leftUIdx] += K; // coefficient of Th_{i-1}
                }
            }
            
            // Check right span (span starting at node i)
            if (i < numNodes - 1) {
                let spanIdx = i;
                let L = this.spans[spanIdx].length;
                let EI = this.spans[spanIdx].EI || 1;
                let K = (2 * EI) / L;
                
                // M_{i, i+1} = FEM_L + K * (2 * Th_i + Th_{i+1})
                constTerm += FEM[spanIdx].L;
                
                A[uIdx][uIdx] += 2 * K; // coefficient of Th_i
                
                const rightUIdx = unknownsMap[i+1];
                if (rightUIdx !== -1) {
                    A[uIdx][rightUIdx] += K; // coefficient of Th_{i+1}
                }
            }

            B[uIdx] = -constTerm; // Move constants to RHS
            
            eqDetails += `ΣM at Node ${String.fromCharCode(65 + i)} = 0 => Equation ${uIdx+1} assembled.\n`;
        }
        
        if (numUnknowns > 0) {
            this.addStep("Equilibrium Equations Setup", eqDetails);
        } else {
            this.addStep("Equilibrium", "All nodes are fixed, no unknown rotations.");
        }

        // Solve System
        let thetas = new Array(numNodes).fill(0);
        if (numUnknowns > 0) {
            let x = solveLinearSystem(A, B);
            if (!x) {
                this.addStep("Error", "Structure is unstable or invalid support conditions.");
                return null;
            }
            let thetaOutput = "";
            for (let i = 0; i < numNodes; i++) {
                if (unknownsMap[i] !== -1) {
                    thetas[i] = x[unknownsMap[i]];
                    thetaOutput += `θ${String.fromCharCode(65 + i)} = ${thetas[i].toFixed(4)} / EI\n`;
                }
            }
            this.addStep("Step 4", "Solve equations for Rotations (θ):\n" + thetaOutput);
        }

        // Calculate Final End Moments
        let finalMoments = new Array(numSpans).fill(0).map(() => ({ L: 0, R: 0 }));
        let momentDetails = "";
        
        for (let i = 0; i < numSpans; i++) {
            let L = this.spans[i].length;
            let EI = this.spans[i].EI || 1;
            let K = (2 * EI) / L;
            let Th_A = thetas[i];
            let Th_B = thetas[i+1];
            
            finalMoments[i].L = FEM[i].L + K * (2 * Th_A + Th_B);
            finalMoments[i].R = FEM[i].R + K * (2 * Th_B + Th_A);
            
            momentDetails += `Span ${i+1}: M_AB = ${finalMoments[i].L.toFixed(2)} kNm, M_BA = ${finalMoments[i].R.toFixed(2)} kNm\n`;
        }
        this.addStep("Step 5", "Calculate Final End Moments using Slope Deflection Equation:\n" + momentDetails);

        // Generate Reactions and Diagram Data
        this.results = this.generateDiagramData(finalMoments);
        this.addStep("Step 6", "Calculate Support Reactions (using Statics).");
        
        return this.results;
    }

    generateDiagramData(finalMoments) {
        const numSpans = this.spans.length;
        const resolution = 50; // Points per span for smooth curves
        let sfdData = [];
        let bmdData = [];
        let absMaxShear = 0;
        let absMaxMoment = 0;
        let reactions = new Array(this.nodes.length).fill(0);

        let currentX = 0;

        for (let i = 0; i < numSpans; i++) {
            const span = this.spans[i];
            const L = span.length;
            const M_L = finalMoments[i].L;
            const M_R = finalMoments[i].R;
            
            // Simply supported shear reactions
            let V_L_ss = 0;
            let V_R_ss = 0;
            
            const spanLoads = this.loads.filter(l => l.spanId === span.id);
            spanLoads.forEach(load => {
                if (load.type === 'point') {
                    V_L_ss += load.mag * (L - load.pos) / L;
                    V_R_ss += load.mag * load.pos / L;
                } else if (load.type === 'udl') {
                    V_L_ss += load.mag * L / 2;
                    V_R_ss += load.mag * L / 2;
                }
            });

            // Moment effect on shear
            const V_moment_effect = (M_L + M_R) / L; 
            
            const V_L = V_L_ss - V_moment_effect;
            const V_R = -(V_R_ss + V_moment_effect); // Convention: right face shear

            reactions[i] += V_L;
            reactions[i+1] -= V_R;

            // Compute data points along span
            for(let j=0; j<=resolution; j++) {
                let x = (j / resolution) * L;
                // Accumulate shear and moment from left
                let Vx = V_L;
                let Mx = -M_L + V_L * x; // using convention where anti-clockwise M_L is negative on left face? Actually slope deflection convention: clockwise is positive.
                // Let's standardise BMD: sagging positive. (M_L clockwise is positive end moment => sagging? No, clockwise on left face means hogging).
                // If M_L is clockwise (positive), it causes hogging (negative moment). So bending moment at x=0 is -M_L.
                
                spanLoads.forEach(load => {
                    if (load.type === 'point' && x > load.pos) {
                        Vx -= load.mag;
                        Mx -= load.mag * (x - load.pos);
                    } else if (load.type === 'udl') {
                        Vx -= load.mag * x;
                        Mx -= load.mag * x * (x / 2);
                    }
                });

                let globalX = currentX + x;
                sfdData.push({ x: globalX, v: Vx });
                bmdData.push({ x: globalX, m: Mx });

                if (Math.abs(Vx) > absMaxShear) absMaxShear = Math.abs(Vx);
                if (Math.abs(Mx) > absMaxMoment) absMaxMoment = Math.abs(Mx);
            }
            currentX += L;
        }

        return {
            sfd: sfdData,
            bmd: bmdData,
            reactions: reactions,
            endMoments: finalMoments,
            maxShear: absMaxShear,
            maxMoment: absMaxMoment,
            totalLength: currentX,
            steps: this.steps
        };
    }
}
