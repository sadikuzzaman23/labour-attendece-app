/**
 * Dynamic Blueprint Estimator
 * Implements:
 *  1. Real-time 2D Canvas blueprint with colour-coded Long/Short walls
 *  2. Level-sync sidebar (Foundation → Footings → Superstructure)
 *  3. Drag-and-drop Deduction engine (Door / Window / Vent)
 *  4. Formula Transparency tooltip on hover
 *  5. Centre Line method with Lcc/Wcc preview
 */

(function () {
    'use strict';

    // ── STATE ──────────────────────────────────────────
    const S = {
        roomL: 5, roomW: 4,
        trenchB: 0.9, trenchH: 1.2,
        wallThick: 0.3, wallH: 3,
        footings: [],           // [{b, h}]
        deductions: [],         // [{type, len, ht, wall:'long'|'short'}]
        showLong: true, showShort: true,
        // Centre Line
        clL: 5, clW: 4,
        clTrenchB: 0.9, clTrenchH: 1.2, clTjunc: 0,
        clFootB: 0.6, clFootH: 0.3,
        clWallB: 0.3, clWallH: 3,
    };

    let currentDragType = null, currentDragLen = 0, currentDragHt = 0;
    let hoveredWall = null; // 'long' | 'short' | null

    // ── TOOLTIP ───────────────────────────────────────
    const tooltip = document.createElement('div');
    tooltip.className = 'est-tooltip';
    tooltip.innerHTML = '<div class="est-tooltip-tag">FORMULA</div><div class="est-tooltip-formula" id="tt-formula"></div><div class="est-tooltip-logic" id="tt-logic"></div>';
    document.body.appendChild(tooltip);

    function showTooltip(el, formula, logic) {
        document.getElementById('tt-formula').textContent = formula;
        document.getElementById('tt-logic').textContent = logic;
        tooltip.classList.add('visible');
        updateTooltipPos(el);
    }
    function hideTooltip() { tooltip.classList.remove('visible'); }
    function updateTooltipPos(el) {
        const r = el.getBoundingClientRect();
        let top = r.bottom + 8;
        let left = r.left;
        if (left + 310 > window.innerWidth) left = window.innerWidth - 316;
        tooltip.style.top = top + 'px';
        tooltip.style.left = left + 'px';
    }

    // ── DOM HELPERS ───────────────────────────────────
    function v(id) { return parseFloat(document.getElementById(id)?.value) || 0; }
    function el(id) { return document.getElementById(id); }

    // ── INPUTS: READ STATE ────────────────────────────
    function readSLState() {
        S.roomL     = v('e-room-l');
        S.roomW     = v('e-room-w');
        S.trenchB   = v('e-trench-b');
        S.trenchH   = v('e-trench-h');
        S.wallThick = v('e-wall-thick');
        S.wallH     = v('e-wall-h');
        S.footings  = [];
        document.querySelectorAll('.e-foot-item').forEach(row => {
            const inputs = row.querySelectorAll('input');
            S.footings.push({ b: parseFloat(inputs[0].value)||0, h: parseFloat(inputs[1].value)||0 });
        });
    }
    function readCLState() {
        S.clL       = v('cl-room-l');
        S.clW       = v('cl-room-w');
        S.clTrenchB = v('cl-trench-b');
        S.clTrenchH = v('cl-trench-h');
        S.clTjunc   = v('cl-tjunc2');
        S.clFootB   = v('cl-foot-b');
        S.clFootH   = v('cl-foot-h');
        S.clWallB   = v('cl-wall-b');
        S.clWallH   = v('cl-wall-h');
    }

    // ── CANVAS: SHORT & LONG WALL ─────────────────────
    const canvas   = el('est-blueprint-canvas');
    const ctx      = canvas ? canvas.getContext('2d') : null;

    function resizeSLCanvas() {
        if (!canvas) return;
        const wrap = el('e-canvas-container');
        if (!wrap) return;
        canvas.width = wrap.clientWidth - 32;
    }

    function drawSLBlueprint() {
        if (!ctx || !canvas) return;
        resizeSLCanvas();
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const L = S.roomL, Rm = S.roomW;
        if (!L || !Rm) return;

        // Hide hint
        const hint = el('e-drop-hint');
        if (hint) hint.classList.add('hidden');

        // Scale to fit canvas with 60px padding
        const pad = 70;
        const scaleX = (W - pad * 2) / (L + S.trenchB * 2);
        const scaleY = (H - pad * 2) / (Rm + S.trenchB * 2);
        const sc = Math.min(scaleX, scaleY, 60);

        const cx = W / 2, cy = H / 2;
        const roomPxL = L * sc, roomPxW = Rm * sc;
        const trenchPx = S.trenchB * sc;
        const wallPx   = S.wallThick * sc;

        const rx = cx - roomPxL / 2, ry = cy - roomPxW / 2;

        // Draw trench footprint (amber, dashed)
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(245,158,11,0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rx - trenchPx, ry - trenchPx, roomPxL + trenchPx * 2, roomPxW + trenchPx * 2);
        ctx.restore();

        // Dimension text helper
        const drawDim = (x1, y1, x2, y2, label, color='#94a3b8') => {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.setLineDash([2,3]);
            ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = color;
            ctx.font = '11px Outfit,sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(label, (x1+x2)/2, (y1+y2)/2 - 8);
            ctx.restore();
        };

        // Long walls = top & bottom -> OUT-to-OUT (green)
        const longLen = L + S.trenchB * 2; // effective display
        const effL_ex = L + S.trenchB; // Lcc + B formula
        if (S.showLong) {
            ctx.save();
            // Top wall
            const isHovL = hoveredWall === 'long';
            ctx.fillStyle = isHovL ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.18)';
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2.5;
            // Top long wall rect
            ctx.beginPath();
            ctx.roundRect(rx - trenchPx, ry - trenchPx, roomPxL + trenchPx * 2, trenchPx, 3);
            ctx.fill(); ctx.stroke();
            // Bottom long wall rect
            ctx.beginPath();
            ctx.roundRect(rx - trenchPx, ry + roomPxW, roomPxL + trenchPx * 2, trenchPx, 3);
            ctx.fill(); ctx.stroke();
            ctx.restore();

            // Long wall label
            ctx.save();
            ctx.fillStyle = '#10b981';
            ctx.font = 'bold 11px Outfit,sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`Long Wall: ${effL_ex.toFixed(2)} m (+${S.trenchB}m each side)`, cx, ry - trenchPx - 14);
            ctx.restore();
        }

        // Short walls = left & right -> IN-to-IN (blue)
        const effS_ex = Rm - S.trenchB;
        if (S.showShort) {
            ctx.save();
            const isHovS = hoveredWall === 'short';
            ctx.fillStyle = isHovS ? 'rgba(96,165,250,0.35)' : 'rgba(96,165,250,0.18)';
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = 2.5;
            // Left short wall (inner)
            ctx.beginPath();
            ctx.roundRect(rx, ry, trenchPx, roomPxW, 3);
            ctx.fill(); ctx.stroke();
            // Right short wall
            ctx.beginPath();
            ctx.roundRect(rx + roomPxL - trenchPx, ry, trenchPx, roomPxW, 3);
            ctx.fill(); ctx.stroke();
            ctx.restore();

            // Short wall label
            ctx.save();
            ctx.fillStyle = '#60a5fa';
            ctx.font = 'bold 11px Outfit,sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`Short: ${effS_ex.toFixed(2)} m (-${S.trenchB}m each side)`, rx - 10, cy);
            ctx.restore();
        }

        // Centre-line (dashed purple)
        ctx.save();
        ctx.setLineDash([5,4]);
        ctx.strokeStyle = 'rgba(129,140,248,0.7)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rx, ry, roomPxL, roomPxW);
        ctx.restore();

        // Superstructure wall outline
        if (S.wallThick) {
            ctx.save();
            ctx.setLineDash([3,3]);
            ctx.strokeStyle = 'rgba(99,102,241,0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(rx + wallPx, ry + wallPx, roomPxL - wallPx*2, roomPxW - wallPx*2);
            ctx.restore();
        }

        // Dimension room arrows
        drawDim(rx, ry - trenchPx - 28, rx + roomPxL, ry - trenchPx - 28, `${L} m`, '#818cf8');
        drawDim(rx - trenchPx - 28, ry, rx - trenchPx - 28, ry + roomPxW, `${Rm} m`, '#818cf8');

        // Deductions on canvas
        S.deductions.forEach(d => {
            const dPxL = d.len * sc;
            let dx, dy, dw, dh;
            if (d.wall === 'long') {
                // Place on top wall
                dx = cx - dPxL / 2;
                dy = ry - trenchPx;
                dw = dPxL;
                dh = trenchPx;
            } else {
                // Place on left wall
                dx = rx;
                dy = cy - dPxL / 2;
                dw = trenchPx;
                dh = dPxL;
            }
            ctx.save();
            ctx.fillStyle = 'rgba(239,68,68,0.65)';
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1.5;
            ctx.fillRect(dx, dy, dw, dh);
            ctx.strokeRect(dx, dy, dw, dh);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Outfit,sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(d.type[0], dx + dw/2, dy + dh/2 + 4);
            ctx.restore();
        });

        // Room label in centre
        ctx.save();
        ctx.fillStyle = 'rgba(148,163,184,0.5)';
        ctx.font = '11px Outfit,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${L}m × ${Rm}m`, cx, cy + 5);
        ctx.restore();
    }

    // ── CANVAS: CENTRE LINE ────────────────────────────
    const clCanvas = el('cl-blueprint-canvas');
    const clCtx    = clCanvas ? clCanvas.getContext('2d') : null;

    function resizeCLCanvas() {
        if (!clCanvas) return;
        const wrap = el('cl-canvas-container');
        if (!wrap) return;
        clCanvas.width = wrap.clientWidth - 32;
    }

    function updateCLPreview() {
        const L = S.clL, W = S.clW, B = S.clWallB;
        const Lcc = L - B / 2;
        const Wcc = W - B / 2;
        if (el('cl-lcc-display')) el('cl-lcc-display').textContent = Lcc.toFixed(3) + ' m';
        if (el('cl-wcc-display')) el('cl-wcc-display').textContent = Wcc.toFixed(3) + ' m';
        return { Lcc, Wcc };
    }

    function drawCLBlueprint() {
        if (!clCtx || !clCanvas) return;
        resizeCLCanvas();
        const W = clCanvas.width, H = clCanvas.height;
        clCtx.clearRect(0, 0, W, H);

        readCLState();
        const { Lcc, Wcc } = updateCLPreview();
        const L = S.clL, Rm = S.clW;
        if (!L || !Rm) return;

        const pad = 70;
        const sc  = Math.min((W - pad*2) / L, (H - pad*2) / Rm, 60);
        const cx  = W/2, cy = H/2;
        const pL  = L * sc, pW = Rm * sc;
        const Bpx = S.clWallB * sc;

        const rx = cx - pL/2, ry = cy - pW/2;

        // Wall outline
        clCtx.save();
        clCtx.fillStyle = 'rgba(99,102,241,0.1)';
        clCtx.strokeStyle = 'rgba(99,102,241,0.35)';
        clCtx.lineWidth = Bpx > 0 ? Bpx : 2;
        clCtx.strokeRect(rx, ry, pL, pW);
        clCtx.restore();

        // Centre-line (bright)
        const cL = Lcc * sc, cW = Wcc * sc;
        clCtx.save();
        clCtx.setLineDash([6,4]);
        clCtx.strokeStyle = '#818cf8';
        clCtx.lineWidth = 2;
        clCtx.strokeRect(cx - cL/2, cy - cW/2, cL, cW);
        clCtx.restore();

        // Annotations
        clCtx.save();
        clCtx.fillStyle = '#818cf8';
        clCtx.font = 'bold 11px Outfit,sans-serif';
        clCtx.textAlign = 'center';
        clCtx.fillText(`Lcc = ${Lcc.toFixed(3)} m`, cx, cy - cW/2 - 14);
        clCtx.textAlign = 'right';
        clCtx.fillText(`Wcc = ${Wcc.toFixed(3)} m`, rx - 10, cy);
        clCtx.restore();

        // Room label
        clCtx.save();
        clCtx.fillStyle = 'rgba(148,163,184,0.5)';
        clCtx.font = '11px Outfit,sans-serif';
        clCtx.textAlign = 'center';
        clCtx.fillText(`${L}m × ${Rm}m (wall ${S.clWallB}m)`, cx, cy + 6);
        clCtx.restore();
    }

    // ── MEASUREMENT SHEET: SHORT & LONG WALL ──────────
    function makeTbl(headers) {
        return `<table class="est-results-table">
            <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
            <tbody id="e-tbl-body"></tbody>
            <tfoot id="e-tbl-foot"></tfoot>
        </table>`;
    }

    function rowHtml(item, nos, l, b, h, qty, rowClass, formula, logic) {
        const fmtQ = qty.toFixed(3);
        return `<tr class="${rowClass}">
            <td>${item}</td>
            <td>${nos}</td>
            <td>${l.toFixed(3)}</td>
            <td>${b.toFixed(3)}</td>
            <td>${h.toFixed(3)}</td>
            <td class="est-qty-cell" data-formula="${encodeURIComponent(formula)}" data-logic="${encodeURIComponent(logic)}">${fmtQ}</td>
        </tr>`;
    }

    function deductionRowHtml(item, nos, l, b, h, qty, formula, logic) {
        const fmtQ = (-qty).toFixed(3);
        return `<tr class="est-row-deduction">
            <td>(-) ${item}</td>
            <td>${nos}</td>
            <td>${l.toFixed(3)}</td>
            <td>${b.toFixed(3)}</td>
            <td>${h.toFixed(3)}</td>
            <td class="est-qty-cell" data-formula="${encodeURIComponent(formula)}" data-logic="${encodeURIComponent(logic)}">${fmtQ}</td>
        </tr>`;
    }

    function generateSLSheet() {
        readSLState();
        const L = S.roomL, Rm = S.roomW, B = S.trenchB, D = S.trenchH;
        const T = S.wallThick, H = S.wallH;
        if (!L || !Rm) return;

        // Long & Short wall effective lengths (Excavation)
        const effL_ex  = L + B;      // out-to-out long wall = Lcc + B
        const effS_ex  = Rm - B;     // in-to-in short wall = Wcc - B

        // Long & Short wall effective lengths (Superstructure)
        const effL_ss  = L + T;
        const effS_ss  = Rm - T;

        // KPIs
        const totalExcL = 2 * effL_ex * B * D;
        const totalExcS = 2 * Math.max(0, effS_ex) * B * D;
        const totalExc  = totalExcL + totalExcS;

        let totalFoot = 0;
        let footRows  = '';
        S.footings.forEach((f, i) => {
            if (!f.b || !f.h) return;
            const effL_f = L + f.b;
            const effS_f = Math.max(0, Rm - f.b);
            const qL = 2 * effL_f * f.b * f.h;
            const qS = 2 * effS_f * f.b * f.h;
            const q  = qL + qS;
            totalFoot += q;
            footRows += rowHtml(`Footing Step ${i+1} (Long)`, 2, effL_f, f.b, f.h, qL, 'est-row-footing',
                `2 × (${L} + ${f.b}) × ${f.b} × ${f.h} = ${qL.toFixed(3)}`,
                `Nos × (Lcc + B) × B × H (Long Wall Method)`);
            footRows += rowHtml(`Footing Step ${i+1} (Short)`, 2, effS_f, f.b, f.h, qS, 'est-row-footing',
                `2 × (${Rm} - ${f.b}) × ${f.b} × ${f.h} = ${qS.toFixed(3)}`,
                `Nos × (Wcc - B) × B × H (Short Wall Method)`);
        });

        const totalSSL = 2 * effL_ss * T * H;
        const totalSSS = 2 * Math.max(0, effS_ss) * T * H;
        let   totalSS  = totalSSL + totalSSS;

        // Deductions
        let totalDed = 0;
        let dedRows  = '';
        S.deductions.forEach(d => {
            const wallB = T; // always deduct with superstructure wall thickness
            const q = 1 * d.len * wallB * d.ht;
            totalDed += q;
            dedRows += deductionRowHtml(`${d.type} (${d.wall} wall)`, 1, d.len, wallB, d.ht, q,
                `1 × ${d.len} × ${wallB} × ${d.ht} = ${q.toFixed(3)}`,
                `Nos × Opening Length × Wall Thickness × Opening Height`);
        });
        totalSS -= totalDed;

        // Update KPIs
        el('kpi-exc').textContent   = totalExc.toFixed(3);
        el('kpi-foot').textContent  = totalFoot.toFixed(3);
        el('kpi-super').textContent = totalSS.toFixed(3);

        // Attach formula data to KPIs
        el('kpi-exc').dataset.formula  = `2×(${L}+${B})×${B}×${D} + 2×(${Rm}-${B})×${B}×${D}`;
        el('kpi-exc').dataset.logic    = `Long: 2×(Lcc+B)×B×D  |  Short: 2×(Wcc-B)×B×D`;

        // Build table HTML
        const headers = ['Item','Nos','L (m)','B (m)','H (m)','Qty (m³)'];
        let html = '<table class="est-results-table"><thead><tr>' + headers.map(h=>`<th>${h}</th>`).join('') + '</tr></thead><tbody>';

        // Excavation section
        html += `<tr><td colspan="6" class="est-section-divider">🏗️ A — EXCAVATION (Trench)</td></tr>`;
        html += rowHtml('Excavation (Long)', 2, effL_ex, B, D, totalExcL, 'est-row-long',
            `2 × (${L} + ${B}) × ${B} × ${D} = ${totalExcL.toFixed(3)}`,
            `Nos × (Lcc + B) × Trench Width × Trench Depth`);
        html += rowHtml('Excavation (Short)', 2, Math.max(0,effS_ex), B, D, totalExcS, 'est-row-short',
            `2 × (${Rm} - ${B}) × ${B} × ${D} = ${totalExcS.toFixed(3)}`,
            `Nos × (Wcc - B) × Trench Width × Trench Depth`);

        // Footings
        if (footRows) {
            html += `<tr><td colspan="6" class="est-section-divider">⬛ B — FOOTINGS</td></tr>`;
            html += footRows;
        }

        // Superstructure
        html += `<tr><td colspan="6" class="est-section-divider">🧱 C — SUPERSTRUCTURE Brickwork</td></tr>`;
        html += rowHtml('Brickwork (Long)', 2, effL_ss, T, H, totalSSL, 'est-row-long',
            `2 × (${L} + ${T}) × ${T} × ${H} = ${totalSSL.toFixed(3)}`,
            `Nos × (Lcc + T) × Wall Thickness × Wall Height`);
        html += rowHtml('Brickwork (Short)', 2, Math.max(0,effS_ss), T, H, totalSSS, 'est-row-short',
            `2 × (${Rm} - ${T}) × ${T} × ${H} = ${totalSSS.toFixed(3)}`,
            `Nos × (Wcc - T) × Wall Thickness × Wall Height`);

        // Deductions
        if (dedRows) {
            html += `<tr><td colspan="6" class="est-section-divider deduction-divider">➖ D — DEDUCTIONS (Openings)</td></tr>`;
            html += dedRows;
        }

        html += '</tbody><tfoot>';
        html += `<tr><td colspan="5" style="font-weight:700;color:#f59e0b;">Total Excavation</td><td class="est-tfoot-total">${totalExc.toFixed(3)} m³</td></tr>`;
        if (totalFoot) html += `<tr><td colspan="5" style="font-weight:700;color:#10b981;">Total Footing Volume</td><td class="est-tfoot-total">${totalFoot.toFixed(3)} m³</td></tr>`;
        if (totalDed)  html += `<tr><td colspan="5" style="font-weight:700;color:#ef4444;">Total Deductions</td><td class="est-tfoot-deduction">- ${totalDed.toFixed(3)} m³</td></tr>`;
        html += `<tr><td colspan="5" style="font-weight:700;color:#818cf8;">Net Brickwork</td><td class="est-tfoot-total">${totalSS.toFixed(3)} m³</td></tr>`;
        html += '</tfoot></table>';

        el('e-results-body').innerHTML = html;
        attachQtyCellHover();
    }

    // ── MEASUREMENT SHEET: CENTRE LINE ────────────────
    function generateCLSheet() {
        readCLState();
        const { Lcc, Wcc } = updateCLPreview();
        const B  = S.clTrenchB, D = S.clTrenchH, Tj = S.clTjunc;
        const Fb = S.clFootB,   Fh = S.clFootH;
        const T  = S.clWallB,   H  = S.clWallH;

        const totalCL = 2 * (Lcc + Wcc) - Tj * B;
        const excVol  = totalCL * B * D;
        const footVol = totalCL * Fb * Fh;
        const bwVol   = totalCL * T * H;

        el('cl-kpi-exc').textContent   = excVol.toFixed(3);
        el('cl-kpi-foot').textContent  = footVol.toFixed(3);
        el('cl-kpi-super').textContent = bwVol.toFixed(3);

        const headers = ['Item','Nos','L (m)','B (m)','H (m)','Qty (m³)'];
        let html = '<table class="est-results-table"><thead><tr>' + headers.map(h=>`<th>${h}</th>`).join('') + '</tr></thead><tbody>';

        html += `<tr><td colspan="6" class="est-section-divider">📐 Centre Line Method — Total CL = ${totalCL.toFixed(3)} m</td></tr>`;
        html += rowHtml('Excavation', 1, totalCL, B, D, excVol, 'est-row-long',
            `${totalCL.toFixed(3)} × ${B} × ${D} = ${excVol.toFixed(3)}`,
            `CL = 2(Lcc + Wcc) - T_junctions × B`);
        html += rowHtml('Footing', 1, totalCL, Fb, Fh, footVol, 'est-row-footing',
            `${totalCL.toFixed(3)} × ${Fb} × ${Fh} = ${footVol.toFixed(3)}`,
            `Total CL × Footing Width × Footing Height`);
        html += rowHtml('Brickwork (SS)', 1, totalCL, T, H, bwVol, 'est-row-long',
            `${totalCL.toFixed(3)} × ${T} × ${H} = ${bwVol.toFixed(3)}`,
            `Total CL × Wall Thickness × Wall Height`);

        html += '</tbody><tfoot>';
        html += `<tr><td colspan="5" style="font-weight:700;color:#f59e0b;">Total Excavation</td><td class="est-tfoot-total">${excVol.toFixed(3)} m³</td></tr>`;
        html += `<tr><td colspan="5" style="font-weight:700;color:#10b981;">Total Footing</td><td class="est-tfoot-total">${footVol.toFixed(3)} m³</td></tr>`;
        html += `<tr><td colspan="5" style="font-weight:700;color:#818cf8;">Net Brickwork</td><td class="est-tfoot-total">${bwVol.toFixed(3)} m³</td></tr>`;
        html += '</tfoot></table>';

        el('cl-results-body').innerHTML = html;
        attachQtyCellHover();
        drawCLBlueprint();
    }

    // ── HOVER FORMULA TOOLTIP ─────────────────────────
    function attachQtyCellHover() {
        document.querySelectorAll('.est-qty-cell[data-formula]').forEach(cell => {
            cell.addEventListener('mouseenter', function(e) {
                const formula = decodeURIComponent(this.dataset.formula || '');
                const logic   = decodeURIComponent(this.dataset.logic   || '');
                showTooltip(this, formula, logic);
            });
            cell.addEventListener('mousemove', function(e) { updateTooltipPos(this); });
            cell.addEventListener('mouseleave', hideTooltip);
        });
        // KPI cards
        [el('kpi-exc')].forEach(kpiEl => {
            if (!kpiEl) return;
            kpiEl.addEventListener('mouseenter', function() {
                showTooltip(this, this.dataset.formula || 'N/A', this.dataset.logic || '');
            });
            kpiEl.addEventListener('mouseleave', hideTooltip);
        });
    }

    // ── FOOTING STEPS ─────────────────────────────────
    let footingIdx = 0;
    function addFootingRow(b = 0.6, h = 0.3) {
        const list = el('e-footing-list');
        if (!list) return;
        const idx = footingIdx++;
        const div = document.createElement('div');
        div.className = 'est-footing-item e-foot-item';
        div.dataset.idx = idx;
        div.innerHTML = `
            <input type="number" value="${b}" step="0.05" min="0.05" placeholder="Width (m)">
            <input type="number" value="${h}" step="0.05" min="0.05" placeholder="Height (m)">
            <button class="est-del-btn" onclick="this.parentElement.remove(); estLiveUpdate();">✕</button>
        `;
        list.appendChild(div);
        div.querySelectorAll('input').forEach(i => i.addEventListener('input', estLiveUpdate));
    }

    // ── DEDUCTIONS: DRAG & DROP ────────────────────────
    function setupDragDrop() {
        // Source items
        document.querySelectorAll('.est-ded-item[draggable]').forEach(item => {
            item.addEventListener('dragstart', e => {
                currentDragType = item.dataset.type;
                currentDragLen  = parseFloat(item.dataset.len) || 0.9;
                currentDragHt   = parseFloat(item.dataset.ht)  || 2.1;
                e.dataTransfer.effectAllowed = 'copy';
            });
        });

        // Drop on canvas
        const ctnr = el('e-canvas-container');
        if (!ctnr) return;
        ctnr.addEventListener('dragover', e => {
            e.preventDefault();
            ctnr.classList.add('drag-over');
        });
        ctnr.addEventListener('dragleave', () => ctnr.classList.remove('drag-over'));
        ctnr.addEventListener('drop', e => {
            e.preventDefault();
            ctnr.classList.remove('drag-over');

            // Determine which wall was dropped on
            readSLState();
            const canvRect = canvas.getBoundingClientRect();
            const dropX    = e.clientX - canvRect.left;
            const dropY    = e.clientY - canvRect.top;

            const W = canvas.width, H = canvas.height;
            const L = S.roomL, Rm = S.roomW;
            const pad = 70;
            const sc  = Math.min((W-pad*2)/(L+S.trenchB*2), (H-pad*2)/(Rm+S.trenchB*2), 60);
            const cx  = W/2, cy = H/2;
            const pL  = L*sc, pW = Rm*sc;

            // Horizontal centre vs vertical centre → long or short
            const ratioX = Math.abs(dropX - cx) / (pL/2);
            const ratioY = Math.abs(dropY - cy) / (pW/2);
            const wall = ratioY > ratioX ? 'long' : 'short';

            addDeductionRow(currentDragType, currentDragLen, S.wallThick, currentDragHt, wall);
            estLiveUpdate();
        });
    }

    function addDeductionRow(type, len, b, ht, wall) {
        const list = el('e-ded-list');
        if (!list) return;
        // Remove placeholder
        const placeholder = list.querySelector('div[style]');
        if (placeholder) placeholder.remove();

        const idx = Date.now();
        const div = document.createElement('div');
        div.className = 'est-ded-row';
        div.innerHTML = `
            <span class="est-ded-label">${type[0] === 'D' ? '🚪' : type[0] === 'W' ? '🪟' : '🔲'} ${type}</span>
            <input type="number" value="${len}"  step="0.1" min="0.1" placeholder="L(m)" title="Opening Length">
            <input type="number" value="${b}"    step="0.05" min="0.05" placeholder="B(m)" title="Wall thickness">
            <input type="number" value="${ht}"   step="0.1" min="0.1"  placeholder="H(m)" title="Opening Height">
            <button class="est-del-btn" title="Remove">✕</button>
        `;
        div.querySelector('.est-del-btn').addEventListener('click', () => { div.remove(); syncDeductions(); estLiveUpdate(); });
        div.querySelectorAll('input').forEach(i => i.addEventListener('input', () => { syncDeductions(); estLiveUpdate(); }));
        list.appendChild(div);

        // Store wall info
        S.deductions.push({ type, len, b, ht, wall });
    }

    function syncDeductions() {
        S.deductions = [];
        document.querySelectorAll('.est-ded-row').forEach(row => {
            const spans  = row.querySelector('.est-ded-label').textContent.trim();
            const inputs = row.querySelectorAll('input');
            const type   = spans.split(' ')[1];
            S.deductions.push({
                type,
                len: parseFloat(inputs[0].value) || 0,
                b:   parseFloat(inputs[1].value) || 0,
                ht:  parseFloat(inputs[2].value) || 0,
                wall: 'long'
            });
        });
    }

    // ── LIVE UPDATE ON INPUT CHANGE ────────────────────
    function estLiveUpdate() {
        readSLState();
        // update cl preview bar
        const B = S.trenchB, L = S.roomL, Rm = S.roomW;
        if (el('est-lcc-val')) el('est-lcc-val').textContent = (L + B).toFixed(2);
        if (el('est-wcc-val')) el('est-wcc-val').textContent = Math.max(0, Rm - B).toFixed(2);
        drawSLBlueprint();
    }
    window.estLiveUpdate = estLiveUpdate;

    // ── METHOD TOGGLE ─────────────────────────────────
    function setupMethodToggle() {
        const btnSL = el('est-btn-sl'), btnCL = el('est-btn-cl');
        const panelSL = el('est-panel-sl'), panelCL = el('est-panel-cl');
        if (!btnSL || !btnCL) return;
        btnSL.addEventListener('click', () => {
            btnSL.classList.add('active'); btnCL.classList.remove('active');
            panelSL.style.display = ''; panelCL.style.display = 'none';
            setTimeout(() => { resizeSLCanvas(); estLiveUpdate(); }, 60);
        });
        btnCL.addEventListener('click', () => {
            btnCL.classList.add('active'); btnSL.classList.remove('active');
            panelCL.style.display = ''; panelSL.style.display = 'none';
            setTimeout(() => { resizeCLCanvas(); drawCLBlueprint(); }, 60);
        });
    }

    // ── HIGHLIGHT TOGGLES ─────────────────────────────
    function setupHighlightToggles() {
        const btnLong  = el('hl-long-btn');
        const btnShort = el('hl-short-btn');
        if (btnLong)  btnLong.addEventListener('click', () => {
            S.showLong = !S.showLong;
            btnLong.classList.toggle('active', S.showLong);
            drawSLBlueprint();
        });
        if (btnShort) btnShort.addEventListener('click', () => {
            S.showShort = !S.showShort;
            btnShort.classList.toggle('active', S.showShort);
            drawSLBlueprint();
        });
    }

    // ── CANVAS HOVER (DETECT WALL) ─────────────────────
    function setupCanvasHover() {
        if (!canvas) return;
        canvas.addEventListener('mousemove', e => {
            const r  = canvas.getBoundingClientRect();
            const mx = (e.clientX - r.left) * (canvas.width / r.width);
            const my = (e.clientY - r.top)  * (canvas.height / r.height);
            const W  = canvas.width, H = canvas.height;
            const L  = S.roomL, Rm = S.roomW;
            if (!L || !Rm) return;
            const sc = Math.min((W-140)/(L+S.trenchB*2), (H-140)/(Rm+S.trenchB*2), 60);
            const cx = W/2, cy = H/2;
            const pL = L*sc, pW = Rm*sc;
            const ratioX = Math.abs(mx - cx) / (pL/2 + 10);
            const ratioY = Math.abs(my - cy) / (pW/2 + 10);
            const prev = hoveredWall;
            hoveredWall = ratioY > ratioX ? 'long' : 'short';
            if (hoveredWall !== prev) drawSLBlueprint();
        });
        canvas.addEventListener('mouseleave', () => { hoveredWall = null; drawSLBlueprint(); });
    }

    // ── CENTRE LINE: LIVE PREVIEW ─────────────────────
    function setupCLLiveUpdate() {
        ['cl-room-l','cl-room-w','cl-wall-b'].forEach(id => {
            const inp = el(id);
            if (!inp) return;
            inp.addEventListener('input', () => { readCLState(); updateCLPreview(); drawCLBlueprint(); });
        });
        ['cl-trench-b','cl-trench-h','cl-tjunc2','cl-foot-b','cl-foot-h','cl-wall-h'].forEach(id => {
            const inp = el(id);
            if (!inp) return;
            inp.addEventListener('input', drawCLBlueprint);
        });
    }

    // ── LIVE UPDATE LISTENERS ─────────────────────────
    function setupSLLiveInputs() {
        ['e-room-l','e-room-w','e-trench-b','e-trench-h','e-wall-thick','e-wall-h'].forEach(id => {
            const inp = el(id);
            if (inp) inp.addEventListener('input', estLiveUpdate);
        });
    }

    // ── INIT ──────────────────────────────────────────
    function init() {
        setupMethodToggle();
        setupHighlightToggles();
        setupDragDrop();
        setupCanvasHover();
        setupSLLiveInputs();
        setupCLLiveUpdate();

        // Add footing button
        const addFootBtn = el('e-add-footing');
        if (addFootBtn) addFootBtn.addEventListener('click', () => { addFootingRow(); estLiveUpdate(); });

        // Calculate buttons
        const calcBtn = el('e-calc-btn');
        if (calcBtn) calcBtn.addEventListener('click', () => { readSLState(); syncDeductions(); generateSLSheet(); drawSLBlueprint(); });

        const clBtn = el('cl-calc-btn');
        if (clBtn) clBtn.addEventListener('click', generateCLSheet);

        // Initial draw
        setTimeout(() => {
            resizeSLCanvas();
            estLiveUpdate();
            updateCLPreview();
        }, 100);

        // Resize
        window.addEventListener('resize', () => {
            const slActive = el('est-panel-sl')?.style.display !== 'none';
            if (slActive) { resizeSLCanvas(); drawSLBlueprint(); }
            else { resizeCLCanvas(); drawCLBlueprint(); }
        });

        // Re-draw when tab becomes visible
        document.querySelectorAll('.tab-btn[data-tab="estimate-calculator"]').forEach(btn => {
            btn.addEventListener('click', () => {
                setTimeout(() => { resizeSLCanvas(); estLiveUpdate(); }, 120);
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
