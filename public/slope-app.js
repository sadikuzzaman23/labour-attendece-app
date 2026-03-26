// Global State
let appState = {
    spans: [{ id: 'span-1', length: 10, EI: 1 }],
    nodes: [{ id: 'node-1', type: 'fixed' }, { id: 'node-2', type: 'fixed' }],
    loads: [],
    studentMode: true
};

// Graphics Instances
window.beamGfx = null;
window.sfdGfx = null;
window.bmdGfx = null;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Graphics
    window.beamGfx = new BeamGraphics('sd-beam-canvas', 'beam');
    window.sfdGfx = new BeamGraphics('sd-sfd-canvas', 'sfd');
    window.bmdGfx = new BeamGraphics('sd-bmd-canvas', 'bmd');

    // DOM Elements
    const studentToggle = document.getElementById('sd-student-mode');
    const addSpanBtn = document.getElementById('sd-add-span');
    const removeSpanBtn = document.getElementById('sd-remove-span');
    const addLoadBtn = document.getElementById('sd-add-load');
    const analyzeBtn = document.getElementById('sd-analyze');
    const resetBtn = document.getElementById('sd-reset');
    const modal = document.getElementById('sd-load-modal');
    const saveLoadBtn = document.getElementById('sd-save-load');
    const cancelLoadBtn = document.getElementById('sd-cancel-load');

    // Initialization
    updateLists();
    drawAll();

    // Event Listeners
    studentToggle.addEventListener('change', (e) => {
        appState.studentMode = e.target.checked;
        const solutionPanel = document.getElementById('sd-solution-panel');
        if (!appState.studentMode) {
            solutionPanel.style.display = 'none';
        } else if (appState.lastResults) {
            solutionPanel.style.display = 'block';
        }
    });

    addSpanBtn.addEventListener('click', () => {
        const newId = appState.spans.length + 1;
        appState.spans.push({ id: `span-${newId}`, length: 5, EI: 1 });
        appState.nodes.push({ id: `node-${newId + 1}`, type: 'fixed' });
        updateLists();
        drawAll();
        clearResults();
    });

    removeSpanBtn.addEventListener('click', () => {
        if (appState.spans.length > 1) {
            const poppedSpan = appState.spans.pop();
            appState.nodes.pop();
            // Remove loads associated with popped span
            appState.loads = appState.loads.filter(l => l.spanId !== poppedSpan.id);
            updateLists();
            drawAll();
            clearResults();
        }
    });

    addLoadBtn.addEventListener('click', () => {
        // Populate span dropdown
        const spanSelect = document.getElementById('sd-load-span-select');
        spanSelect.innerHTML = appState.spans.map((s, i) =>
            `<option value="${s.id}">Span ${i+1}  (Node ${String.fromCharCode(65+i)} → Node ${String.fromCharCode(66+i)},  L = ${s.length} m)</option>`
        ).join('');

        // Reset form defaults: midspan position, clear max constraint
        const firstSpan = appState.spans[0];
        const posInput  = document.getElementById('sd-load-pos');
        posInput.removeAttribute('min');
        posInput.removeAttribute('max');
        posInput.value = (firstSpan.length / 2).toFixed(1);
        posInput.placeholder = `e.g. ${(firstSpan.length / 2).toFixed(1)}`;

        // Reset magnitude label
        document.getElementById('sd-mag-label').textContent = 'Magnitude (kN)';
        document.getElementById('sd-load-type-select').value = 'point';
        document.getElementById('sd-pos-group').style.display = 'block';

        // Update hint
        _updatePosHint(firstSpan);
        modal.style.display = 'flex';
    });

    // When span selection changes → update position hint and default
    document.getElementById('sd-load-span-select').addEventListener('change', (e) => {
        const span = appState.spans.find(s => s.id === e.target.value);
        if (!span) return;
        const posInput = document.getElementById('sd-load-pos');
        posInput.removeAttribute('min');
        posInput.removeAttribute('max');
        posInput.value = (span.length / 2).toFixed(1);
        posInput.placeholder = `e.g. ${(span.length / 2).toFixed(1)}`;
        _updatePosHint(span);
    });

    // Load type change → update magnitude label and toggle position field
    document.getElementById('sd-load-type-select').addEventListener('change', (e) => {
        const type = e.target.value;
        const posGroup  = document.getElementById('sd-pos-group');
        const magLabel  = document.getElementById('sd-mag-label');
        if (type === 'udl') {
            posGroup.style.display = 'none';
            magLabel.textContent = 'Intensity (kN/m)';
        } else if (type === 'moment') {
            posGroup.style.display = 'block';
            magLabel.textContent = 'Moment Magnitude (kNm)';
        } else {
            posGroup.style.display = 'block';
            magLabel.textContent = 'Magnitude (kN)';
        }
    });

    cancelLoadBtn.addEventListener('click', () => modal.style.display = 'none');

    saveLoadBtn.addEventListener('click', () => {
        const spanId = document.getElementById('sd-load-span-select').value;
        const type   = document.getElementById('sd-load-type-select').value;
        const mag    = parseFloat(document.getElementById('sd-load-mag').value);
        const pos    = parseFloat(document.getElementById('sd-load-pos').value);

        // --- Magnitude validation ---
        if (isNaN(mag) || mag <= 0) {
            return alert('❌ Invalid magnitude.\nMagnitude must be a positive number (e.g. 30 kN).');
        }

        // --- Position validation for point load and moment ---
        if (type !== 'udl') {
            const targetSpan = appState.spans.find(s => s.id === spanId);
            const L = targetSpan ? targetSpan.length : null;

            if (isNaN(pos)) {
                return alert('❌ Invalid position.\nPlease enter a numeric distance from Node A.');
            }
            if (pos < 0) {
                return alert(`❌ Invalid load position: ${pos} m\nPosition cannot be negative.\nEnter a value greater than 0.`);
            }
            if (pos === 0) {
                return alert(`❌ Invalid load position: 0 m\nA point load exactly at Node A creates a zero-length lever arm.\nEnter a small positive value like 0.1 m.`);
            }
            if (pos >= L) {
                return alert(`❌ Load position exceeds span length.\nYou entered: ${pos} m\nSpan length (L): ${L} m\n\nThe position must be strictly less than ${L} m.`);
            }
        }

        // Store load: { spanId, type, magnitude, position (x from Node A) }
        appState.loads.push({ spanId, type, mag, pos });
        modal.style.display = 'none';
        updateLists();
        drawAll();
        clearResults();
    });

    // Helper: update the hint text under position input
    function _updatePosHint(span) {
        const hint  = document.getElementById('sd-pos-hint'); // This might not exist in my HTML, let's fix
        const label = document.getElementById('sd-pos-label');
        // if (hint)  hint.textContent  = `Valid range: 0 < x < ${span.length} m  (span length = ${span.length} m)`;
        if (label) label.textContent = `Distance from Left Support (m)`;
    }

    resetBtn.addEventListener('click', () => {
        appState = {
            spans: [{ id: 'span-1', length: 10, EI: 1 }],
            nodes: [{ id: 'node-1', type: 'fixed' }, { id: 'node-2', type: 'fixed' }],
            loads: [],
            studentMode: document.getElementById('sd-student-mode').checked
        };
        updateLists();
        drawAll();
        clearResults();
    });

    analyzeBtn.addEventListener('click', () => {
        const solver = new BeamSolver(appState.spans, appState.nodes, appState.loads);
        const results = solver.solve();
        if (results) {
            appState.lastResults = results;
            renderDiagrams(results);
            renderSolution(results.steps);
        } else {
            alert('Analysis failed. Check boundary conditions (unstable structure).');
        }
    });
});

function updateLists() {
    // Spans List
    const spansList = document.getElementById('sd-spans-list');
    spansList.innerHTML = appState.spans.map((span, i) => `
        <div class="list-card">
            <div class="list-card-header">Span ${i+1}</div>
            <div class="list-card-body">
                Length: <input type="number" step="0.5" value="${span.length}" onchange="updateSpanLength(${i}, this.value)"> m
            </div>
        </div>
    `).join('');

    // Nodes List
    const nodesList = document.getElementById('sd-nodes-list');
    nodesList.innerHTML = appState.nodes.map((node, i) => `
        <div class="list-card">
            <div class="list-card-header">Node ${String.fromCharCode(65 + i)}</div>
            <div class="list-card-body">
                Type: 
                <select onchange="updateNodeType(${i}, this.value)">
                    <option value="fixed" ${node.type === 'fixed' ? 'selected' : ''}>Fixed</option>
                    <option value="pinned" ${node.type === 'pinned' ? 'selected' : ''}>Pinned</option>
                    <option value="roller" ${node.type === 'roller' ? 'selected' : ''}>Roller</option>
                    <option value="free" ${node.type === 'free' ? 'selected' : ''}>Free</option>
                </select>
            </div>
        </div>
    `).join('');

    // Loads List
    const loadsList = document.getElementById('sd-loads-list');
    if (appState.loads.length === 0) {
        loadsList.innerHTML = '<div style="color:var(--text-muted);font-size:0.9rem;">No loads added.</div>';
    } else {
        loadsList.innerHTML = appState.loads.map((load, i) => {
            const spanIdx = appState.spans.findIndex(s => s.id === load.spanId) + 1;
            const desc = load.type === 'udl' ? `${load.mag}kN/m on Span ${spanIdx}` : `${load.mag}kN at ${load.pos}m on Span ${spanIdx}`;
            return `
                <div class="list-card">
                    <div class="list-card-header">Load ${i+1} <button class="icon-btn" onclick="removeLoad(${i})">✖</button></div>
                    <div class="list-card-body">${desc}</div>
                </div>
            `;
        }).join('');
    }
}

window.updateSpanLength = function(idx, val) {
    appState.spans[idx].length = parseFloat(val) || 1;
    drawAll();
    clearResults();
}

window.updateNodeType = function(idx, val) {
    appState.nodes[idx].type = val;
    drawAll();
    clearResults();
}

window.removeLoad = function(idx) {
    appState.loads.splice(idx, 1);
    updateLists();
    drawAll();
    clearResults();
}

window.drawAll = function() {
    window.beamGfx.drawBeam(appState.spans, appState.nodes, appState.loads);
}

function clearResults() {
    window.sfdGfx.clear();
    window.bmdGfx.clear();
    appState.lastResults = null;
    document.getElementById('sd-solution-panel').style.display = 'none';
}

function renderDiagrams(results) {
    window.sfdGfx.drawDiagram(results.sfd, results.maxShear, results.totalLength, 'rgba(239, 68, 68, 1)'); // Red for shear
    window.bmdGfx.drawDiagram(results.bmd, results.maxMoment, results.totalLength, 'rgba(59, 130, 246, 1)'); // Blue for BMD
}

function renderSolution(steps) {
    const content = document.getElementById('sd-solution-content');
    content.innerHTML = steps.map(step => `
        <div class="step-card">
            <h4>${step.title}</h4>
            <pre>${step.content}</pre>
        </div>
    `).join('');
    
    if (appState.studentMode) {
        document.getElementById('sd-solution-panel').style.display = 'block';
    }
}
