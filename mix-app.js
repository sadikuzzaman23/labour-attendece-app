/**
 * MixMaster Pro — Wizard Flow Controller v3
 * Step-by-step onboarding · Desktop Layout
 */
'use strict';

// ─── STATE ─────────────────────────────────────────────
let currentStep = 1;
const TOTAL_STEPS = 5;
let currentResults = null;
let pieChart = null;
let validationDebounce = null;

// ─── TEST CASE DATA ────────────────────────────────────
const TEST_CASES = {
    1: { grade: 'M25', exposure: 'Mild', siteControl: 'Good', slump: 75, placement: 'Manual', cementGrade: 'OPC43', wc_manual: 0.50, sg_cement: 3.15, sg_admix: 1.21, sg_ca: 2.72, sg_fa: 2.65, faZone: 'zone_2', admixDosagePct: 1.0, admixReductionPct: 20, expected: { fck: 31.60, water: 148.80, cement: 300, ca: 1253.8, fa: 748.7 } },
    2: { grade: 'M30', exposure: 'Moderate', siteControl: 'Good', slump: 100, placement: 'Pump', cementGrade: 'OPC43', wc_manual: 0.45, sg_cement: 3.15, sg_admix: 1.21, sg_ca: 2.72, sg_fa: 2.65, faZone: 'zone_3', admixDosagePct: 1.2, admixReductionPct: 25, expected: { fck: 38.25, water: 143.69, cement: 319.31, ca: 1180.2, fa: 815.7 } },
    3: { grade: 'M40', exposure: 'Moderate', siteControl: 'Good', slump: 180, placement: 'Pump', cementGrade: 'OPC43', wc_manual: 0.35, sg_cement: 2.93, sg_admix: 1.21, sg_ca: 2.72, sg_fa: 2.65, faZone: 'zone_3', admixDosagePct: 1.2, admixReductionPct: 25, expected: { fck: 48.25, water: 156.24, cement: 446.4, ca: 1110.3, fa: 712.2 } }
};

// ─── WIZARD NAVIGATION ─────────────────────────────────
function goNext() {
    const errs = validateStep(currentStep);
    if (errs.length) { errs.forEach(e => showToast('warn', '⚠', e)); return; }
    if (currentStep >= TOTAL_STEPS) return;
    currentStep++;
    showStep(currentStep);
}
function goBack() {
    if (currentStep <= 1) return;
    currentStep--;
    showStep(currentStep);
}
function showStep(n) {
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('step-' + n);
    if (el) el.classList.add('active');
    updateProgress(n);
    updateSidebarSteps(n);
    updateSidebarSummary();
    // Build review grid on step 5
    if (n === 5) buildReviewGrid();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showResultsPage() {
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
    const rp = document.getElementById('results-page');
    if (rp) rp.classList.add('active');
    updateProgress(6); // past last step = full bar
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Setup ERP Save Button dynamically
    if (!document.getElementById('btn-save-erp')) {
        const btnSaveErp = document.createElement('button');
        btnSaveErp.id = 'btn-save-erp';
        btnSaveErp.className = 'btn-primary';
        btnSaveErp.style.marginTop = '10px';
        btnSaveErp.innerHTML = '💾 Save to ERP Database';

        btnSaveErp.onclick = async () => {
            if (!window.state || !window.state.activeSiteId) {
                showToast('error', '🚨', 'No active site selected in ERP!');
                return;
            }
            if (!window.supabase) {
                showToast('error', '🚨', 'Supabase client not loaded.');
                return;
            }
            btnSaveErp.disabled = true;
            btnSaveErp.textContent = '⏳ Saving...';

            try {
                const r = currentResults;
                const inp = readInputs();
                const payload = {
                    site_id: window.state.activeSiteId,
                    project_name: document.getElementById('proj-name').value || '',
                    designed_by: document.getElementById('proj-engineer').value || '',
                    date: new Date().toISOString(),
                    grade: inp.grade,
                    exposure: inp.exposure,
                    slump: inp.slump,
                    placement: inp.placement,
                    fck_target: r.S1.fck_target,
                    wc_adopted: r.S2.wc_adopted,
                    cement_grade: inp.cementGrade,
                    vol_cement: r.S6.volCement,
                    vol_water: r.S6.volWater,
                    vol_admix: r.S6.volAdmix,
                    vol_ca: r.S6.volCA,
                    vol_fa: r.S6.volFA,
                    mass_cement: r.S4.cement_adopted,
                    mass_water: r.S3.actualWater,
                    mass_admix: r.S6.massAdmix,
                    mass_ca: r.S6.massCA,
                    mass_fa: r.S6.massFA
                };

                const { error } = await window.supabase.from('mix_designs_pro').insert([payload]);
                if (error) throw error;
                showToast('ok', '✅', 'Saved successfully to ERP Database.');
                btnSaveErp.textContent = '✓ Saved';
            } catch (e) {
                showToast('error', '❌', 'Failed to save: ' + e.message);
                btnSaveErp.disabled = false;
                btnSaveErp.textContent = '💾 Save to ERP Database';
            }
        };
        const actionBar = document.querySelector('.r-action-bar');
        if (actionBar) actionBar.appendChild(btnSaveErp);
    } else {
        const btn = document.getElementById('btn-save-erp');
        btn.disabled = false;
        btn.innerHTML = '💾 Save to ERP Database';
    }
}

function backToWizard() {
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
    showStep(currentStep < 1 ? 5 : currentStep);
}

function updateProgress(n) {
    const pct = n > TOTAL_STEPS ? 100 : Math.round(((n - 1) / TOTAL_STEPS) * 100);
    document.getElementById('progress-fill').style.width = pct + '%';
}

function updateSidebarSteps(n) {
    const items = document.querySelectorAll('#sidebar-steps .ss-item');
    items.forEach((item, idx) => {
        const sn = idx + 1;
        item.classList.remove('active', 'done');
        if (sn < n) item.classList.add('done');
        else if (sn === n) item.classList.add('active');
    });
}

// ─── STEP VALIDATION ───────────────────────────────────
function validateStep(n) {
    const errs = [];
    if (n === 1) {
        if (!document.getElementById('fck').value) errs.push('Please select a concrete grade.');
        if (!document.getElementById('exposure').value) errs.push('Please select an exposure condition.');
    }
    if (n === 2) {
        if (!document.getElementById('slump').value) errs.push('Please set a target slump value.');
    }
    if (n === 3) {
        const wc = parseFloat(document.getElementById('wc_manual').value);
        if (!wc || wc < 0.25 || wc > 0.70) errs.push('Please enter a valid W/C ratio (0.25–0.70) from IS 10262 Figure-1.');
    }
    return errs;
}

// ─── SIDEBAR SUMMARY ───────────────────────────────────
function updateSidebarSummary() {
    const g = v => document.getElementById(v)?.value;
    const fck = g('fck') || '—';
    const exp = g('exposure') || '—';
    const sl = g('slump') || '—';
    const wc = g('wc_manual') || '—';
    const pl = document.querySelector('input[name="placement"]:checked')?.value || '—';

    document.getElementById('sum-grade').innerHTML = 'Grade: <strong>' + fck + '</strong>';
    document.getElementById('sum-exposure').innerHTML = 'Exposure: <strong>' + exp + '</strong>';
    document.getElementById('sum-slump').innerHTML = 'Slump: <strong>' + sl + ' mm</strong>';
    document.getElementById('sum-wc').innerHTML = 'W/C: <strong>' + wc + '</strong>';
    document.getElementById('sum-placement').innerHTML = 'Method: <strong>' + pl + '</strong>';
}

// ─── SLUMP SYNC ────────────────────────────────────────
function syncSlump(val) {
    document.getElementById('slump').value = val;
    document.getElementById('slump-display').textContent = val + ' mm';
    updateSidebarSummary();
}

// ─── W/C STATUS ────────────────────────────────────────
function updateWCStatus() {
    const wc = parseFloat(document.getElementById('wc_manual').value);
    const exp = document.getElementById('exposure').value;
    const lim = IS456_EXPOSURE[exp];
    const el = document.getElementById('wc-status');
    if (!el) return;
    if (!wc) { el.textContent = 'Enter the W/C value from the IS 10262 Figure-1 chart.'; el.className = 'wc-status'; return; }
    if (!lim) { el.textContent = `W/C = ${wc} entered.`; el.className = 'wc-status'; return; }
    if (wc <= lim.maxWC) {
        el.textContent = `✓ W/C = ${wc} — within IS 456 limit of ${lim.maxWC} for ${exp} exposure.`;
        el.className = 'wc-status ok';
    } else {
        el.textContent = `⚠ W/C = ${wc} exceeds IS 456 limit of ${lim.maxWC}. Will be capped to ${lim.maxWC}.`;
        el.className = 'wc-status warn';
    }
    updateSidebarSummary();
}

// ─── EXPOSURE BANNER ───────────────────────────────────
function updateExposureBanner() {
    const exp = document.getElementById('exposure').value;
    const lim = IS456_EXPOSURE[exp];
    const banner = document.getElementById('exposure-limits');
    if (!banner) return;
    if (!lim || !exp) { banner.style.display = 'none'; return; }
    banner.style.display = 'flex';
    document.getElementById('exposure-label').textContent = exp;
    document.getElementById('lim-cement').textContent = lim.minCement;
    document.getElementById('lim-wc').textContent = lim.maxWC.toFixed(2);
}

// ─── READ INPUTS ───────────────────────────────────────
function readInputs() {
    const g = id => document.getElementById(id);
    return {
        grade: g('fck').value || 'M30',
        exposure: g('exposure').value || 'Moderate',
        siteControl: document.querySelector('input[name="site_control"]:checked')?.value || 'Good',
        slump: parseFloat(g('slump').value) || 100,
        placement: document.querySelector('input[name="placement"]:checked')?.value || 'Pump',
        cementGrade: document.querySelector('input[name="cement_grade"]:checked')?.value || 'OPC43',
        wc_manual: parseFloat(g('wc_manual')?.value) || 0.45,
        sg_cement: parseFloat(g('sg_cement').value) || 3.15,
        sg_admix: parseFloat(g('sg_admix').value) || 1.21,
        sg_ca: parseFloat(g('sg_ca').value) || 2.72,
        sg_fa: parseFloat(g('sg_fa').value) || 2.65,
        faZone: g('fa_zone').value || 'zone_3',
        admixDosagePct: parseFloat(g('admix_dosage').value) || 1.2,
        admixReductionPct: parseFloat(g('admix_reduction').value) || 25,
    };
}

// ─── REVIEW GRID (Step 5) ──────────────────────────────
function buildReviewGrid() {
    const inp = readInputs();
    const lim = IS456_EXPOSURE[inp.exposure] || {};
    const wcWarn = inp.wc_manual > (lim.maxWC || 1);

    const items = [
        { label: 'Grade', val: inp.grade, sub: 'Characteristic strength' },
        { label: 'Exposure', val: inp.exposure, sub: 'IS 456 Table-3' },
        { label: 'Site Control', val: inp.siteControl, sub: 'Std deviation modifier' },
        { label: 'Target Slump', val: inp.slump + ' mm', sub: `${Math.max(0, inp.slump <= 75 ? 0 : Math.floor((inp.slump - 75) / 25))} steps above 50mm` },
        { label: 'Placement', val: inp.placement, sub: inp.placement === 'Pump' ? 'CA reduced 10%' : 'No CA reduction' },
        { label: 'Cement Grade', val: inp.cementGrade, sub: 'For IS 10262 chart' },
        { label: 'W/C Ratio', val: inp.wc_manual, sub: lim.maxWC ? `IS 456 max: ${lim.maxWC}` : 'From IS 10262 Fig-1', warn: wcWarn },
        { label: 'Admixture', val: inp.admixDosagePct + '%', sub: `${inp.admixReductionPct}% water reduction` },
        { label: 'FA Zone', val: inp.faZone.replace('_', ' '), sub: 'IS 383 grading zone' },
        { label: 'SG Cement', val: inp.sg_cement, sub: 'Specific gravity' },
        { label: 'SG CA / FA', val: `${inp.sg_ca} / ${inp.sg_fa}`, sub: 'Coarse / Fine agg.' },
        { label: 'SG Admixture', val: inp.sg_admix, sub: 'Superplasticizer' },
    ];

    document.getElementById('review-grid').innerHTML = items.map(it =>
        `<div class="rv-card${it.warn ? ' warn-card' : ''}">
       <div class="rv-label">${it.label}</div>
       <div class="rv-val">${it.val}</div>
       <div class="rv-sub">${it.sub}</div>
     </div>`
    ).join('');
}

// ─── GENERATE REPORT ──────────────────────────────────
function generateReport() {
    const errs = validateStep(3).concat(validateStep(1)); // ensure key steps are valid
    if (errs.length) { errs.forEach(e => showToast('warn', '⚠', e)); return; }

    const overlay = document.getElementById('analysis-overlay');
    overlay.classList.add('active');

    const steps = [
        { id: 'ast-1', d: 400 }, { id: 'ast-2', d: 900 }, { id: 'ast-3', d: 1400 },
        { id: 'ast-4', d: 1900 }, { id: 'ast-5', d: 2400 }, { id: 'ast-6', d: 2900 },
        { id: 'ast-7', d: 3300 },
    ];
    steps.forEach(s => document.getElementById(s.id)?.classList.remove('active'));
    steps.forEach(s => setTimeout(() => document.getElementById(s.id)?.classList.add('active'), s.d));

    setTimeout(() => {
        try {
            const inputs = readInputs();
            const r = runMixDesign(inputs);
            currentResults = r;

            populateResultsPage(r, inputs);
            overlay.classList.remove('active');
            showResultsPage();

            // Post-calculation validations
            const { S2, S4, S5 } = r;
            const lim = IS456_EXPOSURE[inputs.exposure] || {};
            if (S4.cement_adopted > 450)
                showToast('warn', '⚠', `Cement ${S4.cement_adopted.toFixed(0)} kg/m³ > 450 — IS 456 advises considering Fly Ash/GGBS.`);
            if (S2.wc_adopted < S2.wc_chart)
                showToast('info', '🔒', `W/C capped: ${S2.wc_chart} → ${S2.wc_adopted} (IS 456 Table-5 limit for ${inputs.exposure} exposure).`);
            if (S4.cement_calc < lim.minCement && S4.cement_adopted === lim.minCement)
                showToast('info', '🧱', `Cement raised from ${S4.cement_calc} to ${lim.minCement} kg/m³ to meet IS 456 minimum.`);
            if (S5.lowFAWarning)
                showToast('info', '📊', S5.lowFAWarning);

        } catch (e) {
            overlay.classList.remove('active');
            showToast('error', '🚨', 'Calculation error: ' + e.message);
            console.error(e);
        }
    }, 3800);
}

// ─── POPULATE RESULTS PAGE ─────────────────────────────
function populateResultsPage(r, inputs) {
    const { S1, S2, S3, S4, S5, S6 } = r;

    // Grade pill
    document.getElementById('r-grade-pill').textContent = inputs.grade;

    // Summary cards
    document.getElementById('res-fck').textContent = S1.fck_target;
    document.getElementById('res-wc').textContent = S2.wc_adopted;
    document.getElementById('res-water').textContent = S3.actualWater;
    document.getElementById('res-cement').textContent = S4.cement_adopted.toFixed(1);
    document.getElementById('res-ca').textContent = S6.massCA;
    document.getElementById('res-fa').textContent = S6.massFA;

    // Ratio
    document.getElementById('ratio-display').textContent = `1 : ${S2.wc_adopted} : ${S6.ratioFA} : ${S6.ratioCA}`;

    // Table
    const rows = [
        ['⬜ Cement', S4.cement_adopted.toFixed(1), S6.volCement.toFixed(4), '1.000'],
        ['💧 Water', S3.actualWater.toFixed(1), S6.volWater.toFixed(4), S6.ratioW],
        ['⚗ Admixture', S6.massAdmix.toFixed(2), S6.volAdmix.toFixed(4), (S6.massAdmix / S4.cement_adopted).toFixed(3)],
        ['🪨 Coarse Agg', S6.massCA.toFixed(1), S6.volCA.toFixed(4), S6.ratioCA],
        ['🏖 Fine Agg', S6.massFA.toFixed(1), S6.volFA.toFixed(4), S6.ratioFA],
        ['💨 Air (1% – 20mm)', '—', S6.volAir.toFixed(4), '—'],
        ['<strong>Σ Volume Check</strong>', '—',
            `<strong style="color:var(--ok)">${S6.volSumCheck} m³</strong>`,
            `<span style="color:var(--ok); font-size:11px">✓ = 1.000 m³</span>`],
    ];
    document.getElementById('results-tbody').innerHTML = rows.map(([m, k, v, rt]) =>
        `<tr><td>${m}</td><td><strong>${k}</strong></td><td>${v}</td><td>${rt}</td></tr>`
    ).join('');

    // Pie chart
    buildPieChart(S6);

    // Accordion
    buildAccordion(r);
}

// ─── PIE CHART ─────────────────────────────────────────
function buildPieChart(S6) {
    if (pieChart) { pieChart.destroy(); pieChart = null; }
    const ctx = document.getElementById('mix-pie-chart');
    if (!ctx) return;
    pieChart = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Cement', 'Water', 'Admixture', 'Coarse Agg', 'Fine Agg', 'Air'],
            datasets: [{
                data: [S6.volCement, S6.volWater, S6.volAdmix, S6.volCA, S6.volFA, S6.volAir],
                backgroundColor: ['#E8D5C4', '#5b8dd9', '#9575CD', '#795548', '#D4A574', '#CFD8DC'],
                borderColor: 'rgba(255,255,255,.9)', borderWidth: 2, hoverOffset: 10
            }]
        },
        options: {
            responsive: true, cutout: '56%',
            animation: { animateRotate: true, duration: 900 },
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: "'Roboto Mono',monospace", size: 10 }, padding: 10, usePointStyle: true } },
                tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${(ctx.parsed * 100).toFixed(2)}%` } }
            }
        }
    });
}

// ─── STEP ACCORDION ────────────────────────────────────
function buildAccordion(r) {
    const { S1, S2, S3, S4, S5, S6 } = r;
    const steps = [
        {
            num: '01', title: "Target Mean Strength (f'ck)", result: `${S1.fck_target} N/mm²`,
            formula: `f'ck = Max(fck+1.65×S, fck+X)<br>S=${S1.S} N/mm²  |  X=${S1.X}`,
            rows: [['fck (characteristic)', `${S1.fck_char} N/mm²`], ['Case I: ' + S1.fck_char + '+1.65×' + S1.S, S1.caseI + ' N/mm²'], ['Case II: ' + S1.fck_char + '+' + S1.X, S1.caseII + ' N/mm²'], ['Governing', S1.governs], ["Adopted f'ck", S1.fck_target + ' N/mm²']]
        },
        {
            num: '02', title: 'Free W/C Ratio', result: `W/C = ${S2.wc_adopted}`,
            formula: `W/C from IS 10262 Figure-1 → capped by IS 456 Table-5`,
            rows: [['W/C from chart', S2.wc_chart], ['IS 456 max W/C', S2.wc_max_is456], ['Adopted (Min of above)', S2.wc_adopted], ['Limiting factor', S2.limitingFactor]]
        },
        {
            num: '03', title: 'Water Content', result: `${S3.actualWater} kg/m³`,
            formula: `Base=${S3.baseWater} kg | Steps=${S3.slumpSteps}×25mm → +${S3.increasePercent}% | Admix −${S3.admixReductionPct}%`,
            rows: [['Base water (20mm, 50mm slump)', S3.baseWater + ' kg'], ['Slump steps above 50mm', S3.slumpSteps + ' × 25mm = +' + S3.increasePercent + '%'], ['After slump adj.', S3.adjustedWater + ' kg'], ['After admix reduction', S3.actualWater + ' kg']]
        },
        {
            num: '04', title: 'Cement Content', result: `${S4.cement_adopted.toFixed(1)} kg/m³`,
            formula: `Cement = Water / W/C  →  IS 456 min check`,
            rows: [['Calculated (W/W-C)', S4.cement_calc + ' kg'], ['IS 456 min', S4.minCement + ' kg'], ['Adopted', S4.cement_adopted.toFixed(1) + ' kg']]
        },
        {
            num: '05', title: 'Aggregate Proportions', result: `CA=${(S5.finalCA * 100).toFixed(1)}%`,
            formula: `Base CA (Zone,W/C=0.50) → W/C correction → Pump correction`,
            rows: [['Base CA Vol (Zone)', S5.baseCA], ['W/C correction', '+' + S5.wcCorrection.toFixed(4)], ['Corrected CA', S5.correctedCA.toFixed(4)], ['Pump reduction', '-' + S5.pumpReduction.toFixed(4)], ['Final CA fraction', S5.finalCA.toFixed(4)], ['Final FA fraction', S5.finalFA.toFixed(4)]]
        },
        {
            num: '06', title: 'Absolute Volume → Final Masses', result: `CA=${S6.massCA} | FA=${S6.massFA} kg`,
            formula: `Vol = Mass/(SG×1000) | TotalAgg = 1−(Vc+Vw+Va+Vair)`,
            rows: [['Vol Cement', S6.volCement + ' m³'], ['Vol Water', S6.volWater + ' m³'], ['Vol Admixture', S6.volAdmix + ' m³'], ['Air (1%)', S6.volAir + ' m³'], ['Total Agg Vol', S6.totalAggVol + ' m³'], ['Mass CA', S6.massCA + ' kg/m³'], ['Mass FA', S6.massFA + ' kg/m³']]
        }
    ];

    document.getElementById('steps-accordion').innerHTML = steps.map(s => `
    <div class="step-item">
      <div class="step-header-acc" onclick="toggleAcc('${s.num}')">
        <div class="step-num">${s.num}</div>
        <div class="step-title-acc">${s.title}</div>
        <div class="step-result-acc">${s.result}</div>
        <div class="step-chevron" id="chev-${s.num}">▼</div>
      </div>
      <div class="step-body-acc" id="sb-${s.num}">
        <div class="formula-block">${s.formula}</div>
        <table class="derivation-table">
          ${s.rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
        </table>
      </div>
    </div>`).join('');

    // Open step 01 by default
    document.getElementById('sb-01')?.classList.add('open');
}

function toggleAcc(num) {
    const b = document.getElementById('sb-' + num);
    const c = document.getElementById('chev-' + num);
    if (!b) return;
    const open = b.classList.toggle('open');
    if (c) c.style.transform = open ? 'rotate(180deg)' : '';
}

// ─── VALIDATIONS ───────────────────────────────────────
function runValidations(r, inputs) {
    clearTimeout(validationDebounce);
    validationDebounce = setTimeout(() => {
        const { S2, S4 } = r;
        const lim = IS456_EXPOSURE[inputs.exposure];
        if (!lim) return;
        if (S4.cement_adopted > 450) showToast('warn', '⚠', `Cement >${S4.cement_adopted.toFixed(1)} kg/m³ — IS 456 advises considering Fly Ash or GGBS.`);
        if (S2.wc_adopted > lim.maxWC) showToast('error', '🚨', `W/C ${S2.wc_chart} exceeded IS 456 limit of ${lim.maxWC}. Adopted value = ${S2.wc_adopted}.`);
        if (S4.cement_calc < lim.minCement && S4.cement_adopted === lim.minCement)
            showToast('info', '🧱', `Cement raised from ${S4.cement_calc} to ${lim.minCement} kg/m³ to meet IS 456 minimum.`);
    }, 600);
}

// ─── TOAST ─────────────────────────────────────────────
function showToast(type, icon, msg) {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${msg}</span>`;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 9000);
}

// ─── LOAD TEST CASE ────────────────────────────────────
function loadTestCase(num) {
    const tc = TEST_CASES[num];
    if (!tc) return;

    document.getElementById('fck').value = tc.grade;
    sel('.grade-btn', b => b.classList.toggle('active', b.dataset.val === tc.grade));

    document.getElementById('exposure').value = tc.exposure;
    updateExposureBanner();

    radio('site_control', tc.siteControl);
    syncSlump(tc.slump);
    document.getElementById('slump-range').value = tc.slump;
    radio('placement', tc.placement);
    radio('cement_grade', tc.cementGrade);

    document.getElementById('wc_manual').value = tc.wc_manual;
    updateWCStatus();

    document.getElementById('sg_cement').value = tc.sg_cement;
    document.getElementById('sg_admix').value = tc.sg_admix;
    document.getElementById('sg_ca').value = tc.sg_ca;
    document.getElementById('sg_fa').value = tc.sg_fa;
    document.getElementById('fa_zone').value = tc.faZone;
    document.getElementById('admix_dosage').value = tc.admixDosagePct;
    document.getElementById('admix_reduction').value = tc.admixReductionPct;

    // FA zone radio
    document.querySelectorAll('input[name="fa_zone_r"]').forEach(r => {
        r.checked = r.value === tc.faZone;
        r.closest('.zone-card')?.classList.toggle('active', r.value === tc.faZone);
    });

    updateSidebarSummary();
    currentStep = 1;
    showStep(1);

    showToast('ok', '✅', `Loaded ${tc.label || ('TC-' + num)}. Expected: f'ck=${tc.expected.fck} | C≈${tc.expected.cement} | W≈${tc.expected.water} | CA≈${tc.expected.ca} | FA≈${tc.expected.fa} kg/m³`);
    showToast('info', '📐', 'Inputs loaded — proceed through each step and click Generate Report.');
}

// helpers
function sel(q, fn) { document.querySelectorAll(q).forEach(fn) }
function radio(name, val) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(r => {
        r.checked = r.value === val;
        r.closest('.opt-card')?.classList.toggle('active', r.value === val);
    });
}

// ─── RESET ─────────────────────────────────────────────
function resetAll() {
    // Clear grade
    document.getElementById('fck').value = '';
    sel('.grade-btn', b => b.classList.remove('active'));
    // Clear exposure
    document.getElementById('exposure').value = '';
    document.getElementById('exposure-limits').style.display = 'none';
    // Clear W/C
    document.getElementById('wc_manual').value = '';
    const ws = document.getElementById('wc-status');
    if (ws) { ws.textContent = 'Enter the W/C value from the IS 10262 Figure-1 chart.'; ws.className = 'wc-status'; }
    // Slump
    syncSlump(100);
    document.getElementById('slump-range').value = 100;
    // Destroy chart
    if (pieChart) { pieChart.destroy(); pieChart = null; }
    currentResults = null;
    currentStep = 1;
    showStep(1);
    document.getElementById('toast-container').innerHTML = '';
    showToast('ok', '⟳', 'Calculator reset. Ready for a new design.');
}

// ─── GRADE BUTTONS ─────────────────────────────────────
function bindGradeButtons() {
    sel('.grade-btn', btn => btn.addEventListener('click', () => {
        sel('.grade-btn', b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('fck').value = btn.dataset.val;
        updateSidebarSummary();
    }));
}

// ─── OPT CARDS ─────────────────────────────────────────
function bindOptCards() {
    sel('.opt-card', card => card.addEventListener('click', () => {
        const radio = card.querySelector('input[type="radio"]');
        if (!radio) return;
        document.querySelectorAll(`input[name="${radio.name}"]`).forEach(r => {
            r.closest('.opt-card')?.classList.remove('active');
        });
        radio.checked = true;
        card.classList.add('active');
        updateSidebarSummary();
    }));
}

// ─── ZONE CARDS ────────────────────────────────────────
function bindZoneCards() {
    sel('.zone-card', card => card.addEventListener('click', () => {
        const r = card.querySelector('input[type="radio"]');
        if (!r) return;
        sel('.zone-card', c => c.classList.remove('active'));
        r.checked = true;
        card.classList.add('active');
        document.getElementById('fa_zone').value = r.value;
    }));
}

// ─── PDF EXPORT ────────────────────────────────────────
function exportPDF() {
    if (!currentResults) { showToast('warn', '⚠', 'Generate a report first!'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const r = currentResults;
    const inp = r.inputs;
    const Brown = [62, 39, 35];

    doc.setFillColor(...Brown); doc.rect(0, 0, 210, 22, 'F');
    doc.setTextColor(255, 143, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text('MixMaster Pro', 14, 10);
    doc.setFontSize(7); doc.setTextColor(200, 187, 180);
    doc.text('IS 10262:2019 Concrete Mix Design Report', 14, 16);
    doc.setTextColor(255, 255, 255);
    doc.text(`${inp.grade} | ${inp.exposure}`, 196, 10, { align: 'right' });

    let y = 30;
    doc.setTextColor(...Brown); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Project: ${document.getElementById('proj-name').value || '—'}`, 14, y);
    doc.text(`By: ${document.getElementById('proj-engineer').value || '—'}`, 110, y);
    doc.text(`Date: ${document.getElementById('proj-date').value || new Date().toLocaleDateString('en-IN')}`, 175, y, { align: 'right' });
    y += 8;

    doc.autoTable({
        startY: y,
        head: [['Step', 'Result']],
        body: [
            ["1. Target f'ck", `Max(${r.S1.caseI}, ${r.S1.caseII}) = ${r.S1.fck_target} N/mm²`],
            ['2. W/C Ratio', `Chart: ${r.S2.wc_chart} → Adopted: ${r.S2.wc_adopted}`],
            ['3. Water', `${r.S3.baseWater} + ${r.S3.increasePercent}% − ${r.S3.admixReductionPct}% = ${r.S3.actualWater} kg`],
            ['4. Cement', `${r.S3.actualWater}/${r.S2.wc_adopted} = ${r.S4.cement_adopted.toFixed(1)} kg`],
            ['5. CA Fraction', `${r.S5.finalCA.toFixed(4)} | FA: ${r.S5.finalFA.toFixed(4)}`],
            ['6. Final masses', `CA=${r.S6.massCA} kg | FA=${r.S6.massFA} kg`],
        ],
        headStyles: { fillColor: Brown, textColor: [255, 143, 0] },
        bodyStyles: { fontSize: 8 }, theme: 'grid', margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 6;

    doc.autoTable({
        startY: y,
        head: [['Material', 'kg/m³', 'm³', 'Ratio']],
        body: [
            ['Cement', r.S4.cement_adopted.toFixed(1), r.S6.volCement.toFixed(4), '1.000'],
            ['Water', r.S3.actualWater.toFixed(1), r.S6.volWater.toFixed(4), r.S6.ratioW],
            ['Admixture', r.S6.massAdmix.toFixed(2), r.S6.volAdmix.toFixed(4), (r.S6.massAdmix / r.S4.cement_adopted).toFixed(3)],
            ['Coarse Agg', r.S6.massCA.toFixed(1), r.S6.volCA.toFixed(4), r.S6.ratioCA],
            ['Fine Agg', r.S6.massFA.toFixed(1), r.S6.volFA.toFixed(4), r.S6.ratioFA],
        ],
        headStyles: { fillColor: Brown, textColor: [255, 143, 0] },
        bodyStyles: { fontSize: 8 }, theme: 'grid', margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;

    doc.setFillColor(...Brown);
    doc.roundedRect(14, y, 182, 14, 3, 3, 'F');
    doc.setTextColor(255, 143, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(`C : W : FA : CA = 1 : ${r.S6.ratioW} : ${r.S6.ratioFA} : ${r.S6.ratioCA}`, 105, y + 9, { align: 'center' });

    const pH = doc.internal.pageSize.getHeight();
    doc.setFillColor(...Brown); doc.rect(0, pH - 10, 210, 10, 'F');
    doc.setTextColor(200, 187, 180); doc.setFontSize(7);
    doc.text('MixMaster Pro · IS 10262:2019', 14, pH - 4);
    doc.save(`MixDesign_${inp.grade}.pdf`);
    showToast('ok', '📄', 'PDF downloaded!');
}

// ─── INIT ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    bindGradeButtons();
    bindOptCards();
    bindZoneCards();

    // Date
    document.getElementById('proj-date').value = new Date().toISOString().split('T')[0];

    // Exposure change
    document.getElementById('exposure')?.addEventListener('change', () => {
        updateExposureBanner();
        updateWCStatus();
    });

    // Always start on step 1
    currentStep = 1;
    showStep(1);
});
