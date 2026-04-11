/**
 * Dynamic Blueprint Estimator — FIXED
 * Fixes:
 *  - canvas refs are resolved inside init(), not at parse time
 *  - all button event listeners verified after DOM ready
 *  - tab activation handled via MutationObserver + click delegation
 *  - toggle buttons (Long/Short/CentreLine) all correctly wired
 */

(function () {
    'use strict';

    // ── STATE ──────────────────────────────────────────
    var S = {
        roomL: 5, roomW: 4,
        trenchB: 0.9, trenchH: 1.2,
        wallThick: 0.3, wallH: 3,
        footings: [],
        deductions: [],
        showLong: true, showShort: true,
        clL: 5, clW: 4,
        clTrenchB: 0.9, clTrenchH: 1.2, clTjunc: 0,
        clFootB: 0.6, clFootH: 0.3,
        clWallB: 0.3, clWallH: 3,
    };

    // Canvas refs — resolved inside init()
    var canvas = null, ctx = null;
    var clCanvas = null, clCtx = null;
    var hoveredWall = null;
    var currentDragType = null, currentDragLen = 0.9, currentDragHt = 2.1;
    var footingIdx = 0;

    // ── DOM helper ────────────────────────────────────
    function $id(id) { return document.getElementById(id); }
    function numVal(id) { var el = $id(id); return el ? (parseFloat(el.value) || 0) : 0; }

    // ── TOOLTIP ───────────────────────────────────────
    var tooltip = null;
    function ensureTooltip() {
        if (tooltip) return;
        tooltip = document.createElement('div');
        tooltip.className = 'est-tooltip';
        tooltip.innerHTML =
            '<div class="est-tooltip-tag">FORMULA</div>' +
            '<div class="est-tooltip-formula" id="tt-formula"></div>' +
            '<div class="est-tooltip-logic" id="tt-logic"></div>';
        document.body.appendChild(tooltip);
    }
    function showTooltip(el, formula, logic) {
        ensureTooltip();
        $id('tt-formula').textContent = formula;
        $id('tt-logic').textContent = logic;
        tooltip.classList.add('visible');
        var r = el.getBoundingClientRect();
        var left = r.left;
        if (left + 310 > window.innerWidth) left = window.innerWidth - 316;
        tooltip.style.top  = (r.bottom + 8) + 'px';
        tooltip.style.left = left + 'px';
    }
    function hideTooltip() { if (tooltip) tooltip.classList.remove('visible'); }

    // ── READ STATE ────────────────────────────────────
    function readSL() {
        S.roomL     = numVal('e-room-l');
        S.roomW     = numVal('e-room-w');
        S.trenchB   = numVal('e-trench-b');
        S.trenchH   = numVal('e-trench-h');
        S.wallThick = numVal('e-wall-thick');
        S.wallH     = numVal('e-wall-h');
        S.footings  = [];
        document.querySelectorAll('.e-foot-item').forEach(function(row) {
            var inp = row.querySelectorAll('input');
            S.footings.push({ b: parseFloat(inp[0].value)||0, h: parseFloat(inp[1].value)||0 });
        });
    }
    function readCL() {
        S.clL       = numVal('cl-room-l');
        S.clW       = numVal('cl-room-w');
        S.clTrenchB = numVal('cl-trench-b');
        S.clTrenchH = numVal('cl-trench-h');
        S.clTjunc   = numVal('cl-tjunc2');
        S.clFootB   = numVal('cl-foot-b');
        S.clFootH   = numVal('cl-foot-h');
        S.clWallB   = numVal('cl-wall-b');
        S.clWallH   = numVal('cl-wall-h');
    }

    // ── CANVAS: SL BLUEPRINT ──────────────────────────
    function resizeSL() {
        if (!canvas) return;
        var wrap = $id('e-canvas-container');
        if (wrap) canvas.width = Math.max(100, wrap.clientWidth - 32);
    }

    function drawSL() {
        if (!ctx || !canvas) return;
        resizeSL();
        var W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        var L = S.roomL, Rm = S.roomW, B = S.trenchB, T = S.wallThick;
        if (!L || !Rm || W < 50) return;

        // Hide hint
        var hint = $id('e-drop-hint');
        if (hint) hint.classList.add('hidden');

        var pad = 70;
        var sc  = Math.min((W - pad*2) / (L + B*2), (H - pad*2) / (Rm + B*2), 60);
        var cx  = W/2, cy = H/2;
        var pL  = L*sc, pW = Rm*sc;
        var bPx = B*sc, tPx = T*sc;
        var rx  = cx - pL/2, ry = cy - pW/2;

        // Trench outline (amber dashed)
        ctx.save();
        ctx.setLineDash([4,3]);
        ctx.strokeStyle = 'rgba(245,158,11,0.5)';
        ctx.lineWidth   = 1.5;
        ctx.strokeRect(rx - bPx, ry - bPx, pL + bPx*2, pW + bPx*2);
        ctx.restore();

        // Long walls (top & bottom) — Green, Out-to-Out
        if (S.showLong) {
            ctx.save();
            var isHov = hoveredWall === 'long';
            ctx.fillStyle   = isHov ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.18)';
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth   = 2.5;
            // Top
            ctx.beginPath(); ctx.roundRect(rx - bPx, ry - bPx, pL + bPx*2, bPx, 3); ctx.fill(); ctx.stroke();
            // Bottom
            ctx.beginPath(); ctx.roundRect(rx - bPx, ry + pW, pL + bPx*2, bPx, 3); ctx.fill(); ctx.stroke();
            ctx.restore();

            var effL = (L + B).toFixed(2);
            ctx.save();
            ctx.fillStyle = '#10b981';
            ctx.font = 'bold 11px Outfit,sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Long Wall: ' + effL + ' m (+' + B + 'm each side)', cx, ry - bPx - 14);
            ctx.restore();
        }

        // Short walls (left & right) — Blue, In-to-In
        if (S.showShort) {
            ctx.save();
            var isHovS = hoveredWall === 'short';
            ctx.fillStyle   = isHovS ? 'rgba(96,165,250,0.35)' : 'rgba(96,165,250,0.18)';
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth   = 2.5;
            // Left
            ctx.beginPath(); ctx.roundRect(rx, ry, bPx, pW, 3); ctx.fill(); ctx.stroke();
            // Right
            ctx.beginPath(); ctx.roundRect(rx + pL - bPx, ry, bPx, pW, 3); ctx.fill(); ctx.stroke();
            ctx.restore();

            var effS = Math.max(0, Rm - B).toFixed(2);
            ctx.save();
            ctx.fillStyle = '#60a5fa';
            ctx.font = 'bold 11px Outfit,sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('Short: ' + effS + ' m (-' + B + 'm)', rx - 10, cy);
            ctx.restore();
        }

        // Centre line (purple dashed)
        ctx.save();
        ctx.setLineDash([5,4]);
        ctx.strokeStyle = 'rgba(129,140,248,0.7)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rx, ry, pL, pW);
        ctx.restore();

        // Superstructure inner wall
        if (tPx > 0) {
            ctx.save();
            ctx.setLineDash([3,3]);
            ctx.strokeStyle = 'rgba(99,102,241,0.35)';
            ctx.lineWidth = 1;
            ctx.strokeRect(rx + tPx, ry + tPx, pL - tPx*2, pW - tPx*2);
            ctx.restore();
        }

        // Dim labels
        drawDim(rx, ry - bPx - 28, rx + pL, ry - bPx - 28, L + ' m');
        drawDim(rx - bPx - 28, ry, rx - bPx - 28, ry + pW, Rm + ' m');

        // Deductions
        S.deductions.forEach(function(d) {
            var dPxL = (d.len || 0.9) * sc;
            var dx, dy, dw, dh;
            if (d.wall === 'long') {
                dx = cx - dPxL/2; dy = ry - bPx; dw = dPxL; dh = bPx;
            } else {
                dx = rx; dy = cy - dPxL/2; dw = bPx; dh = dPxL;
            }
            ctx.save();
            ctx.fillStyle   = 'rgba(239,68,68,0.65)';
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth   = 1.5;
            ctx.fillRect(dx, dy, dw, dh);
            ctx.strokeRect(dx, dy, dw, dh);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Outfit,sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(d.type ? d.type[0] : 'D', dx + dw/2, dy + dh/2 + 4);
            ctx.restore();
        });

        // Room label
        ctx.save();
        ctx.fillStyle = 'rgba(148,163,184,0.55)';
        ctx.font = '11px Outfit,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(L + 'm × ' + Rm + 'm', cx, cy + 5);
        ctx.restore();
    }

    function drawDim(x1, y1, x2, y2, label) {
        if (!ctx) return;
        ctx.save();
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 1;
        ctx.setLineDash([2,3]);
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#818cf8';
        ctx.font = '11px Outfit,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, (x1+x2)/2, (y1+y2)/2 - 8);
        ctx.restore();
    }

    // ── CANVAS: CENTRE LINE ────────────────────────────
    function resizeCL() {
        if (!clCanvas) return;
        var wrap = $id('cl-canvas-container');
        if (wrap) clCanvas.width = Math.max(100, wrap.clientWidth - 32);
    }

    function clPreview() {
        var L = numVal('cl-room-l') || S.clL;
        var W = numVal('cl-room-w') || S.clW;
        var B = numVal('cl-wall-b') || S.clWallB;
        var Lcc = L - B/2;
        var Wcc = W - B/2;
        var d1 = $id('cl-lcc-display'), d2 = $id('cl-wcc-display');
        if (d1) d1.textContent = Lcc.toFixed(3) + ' m';
        if (d2) d2.textContent = Wcc.toFixed(3) + ' m';
        return { Lcc: Lcc, Wcc: Wcc };
    }

    function drawCL() {
        if (!clCtx || !clCanvas) return;
        resizeCL();
        var W = clCanvas.width, H = clCanvas.height;
        clCtx.clearRect(0, 0, W, H);

        readCL();
        var res = clPreview();
        var Lcc = res.Lcc, Wcc = res.Wcc;
        var L = S.clL, Rm = S.clW;
        if (!L || !Rm || W < 50) return;

        var pad = 70;
        var sc  = Math.min((W-pad*2)/L, (H-pad*2)/Rm, 60);
        var cx  = W/2, cy = H/2;
        var pL  = L*sc, pW = Rm*sc;
        var Bpx = S.clWallB * sc;
        var rx  = cx - pL/2, ry = cy - pW/2;

        // Outer wall
        clCtx.save();
        clCtx.strokeStyle = 'rgba(99,102,241,0.35)';
        clCtx.lineWidth = Math.max(1, Bpx);
        clCtx.strokeRect(rx, ry, pL, pW);
        clCtx.restore();

        // Centre-line (bright purple dashed)
        var cL = Lcc*sc, cW = Wcc*sc;
        clCtx.save();
        clCtx.setLineDash([6,4]);
        clCtx.strokeStyle = '#818cf8';
        clCtx.lineWidth = 2;
        clCtx.strokeRect(cx - cL/2, cy - cW/2, cL, cW);
        clCtx.restore();

        // Labels
        clCtx.save();
        clCtx.fillStyle = '#818cf8';
        clCtx.font = 'bold 11px Outfit,sans-serif';
        clCtx.textAlign = 'center';
        clCtx.fillText('Lcc = ' + Lcc.toFixed(3) + ' m', cx, cy - cW/2 - 14);
        clCtx.textAlign = 'right';
        clCtx.fillText('Wcc = ' + Wcc.toFixed(3) + ' m', rx - 10, cy);
        clCtx.restore();

        clCtx.save();
        clCtx.fillStyle = 'rgba(148,163,184,0.5)';
        clCtx.font = '11px Outfit,sans-serif';
        clCtx.textAlign = 'center';
        clCtx.fillText(L + 'm × ' + Rm + 'm (wall ' + S.clWallB + 'm)', cx, cy + 6);
        clCtx.restore();
    }

    // ── LIVE UPDATE ───────────────────────────────────
    function liveUpdateSL() {
        readSL();
        var lcc = $id('est-lcc-val'), wcc = $id('est-wcc-val');
        if (lcc) lcc.textContent = (S.roomL + S.trenchB).toFixed(2);
        if (wcc) wcc.textContent = Math.max(0, S.roomW - S.trenchB).toFixed(2);
        drawSL();
    }
    window.estLiveUpdate = liveUpdateSL;

    // ── FOOTING STEPS ─────────────────────────────────
    function addFootingRow(b, h) {
        b = b || 0.6; h = h || 0.3;
        var list = $id('e-footing-list');
        if (!list) return;
        var div = document.createElement('div');
        div.className = 'est-footing-item e-foot-item';
        div.innerHTML =
            '<input type="number" value="' + b + '" step="0.05" min="0.05" placeholder="Width (m)">' +
            '<input type="number" value="' + h + '" step="0.05" min="0.05" placeholder="Height (m)">' +
            '<button class="est-del-btn" onclick="this.parentElement.remove(); window.estLiveUpdate && window.estLiveUpdate();">✕</button>';
        list.appendChild(div);
        div.querySelectorAll('input').forEach(function(inp) {
            inp.addEventListener('input', liveUpdateSL);
        });
    }

    // ── DEDUCTIONS ────────────────────────────────────
    function setupDragDrop() {
        document.querySelectorAll('.est-ded-item[draggable]').forEach(function(item) {
            item.addEventListener('dragstart', function(e) {
                currentDragType = item.dataset.type;
                currentDragLen  = parseFloat(item.dataset.len) || 0.9;
                currentDragHt   = parseFloat(item.dataset.ht)  || 2.1;
                e.dataTransfer.effectAllowed = 'copy';
            });
        });

        var ctnr = $id('e-canvas-container');
        if (!ctnr) return;

        ctnr.addEventListener('dragover', function(e) {
            e.preventDefault();
            ctnr.classList.add('drag-over');
        });
        ctnr.addEventListener('dragleave', function() { ctnr.classList.remove('drag-over'); });
        ctnr.addEventListener('drop', function(e) {
            e.preventDefault();
            ctnr.classList.remove('drag-over');
            if (!canvas) return;

            var r  = canvas.getBoundingClientRect();
            var dx = e.clientX - r.left;
            var dy = e.clientY - r.top;
            var W  = canvas.width, H = canvas.height;
            var L  = S.roomL, Rm = S.roomW;
            var sc = Math.min((W-140)/(L+S.trenchB*2), (H-140)/(Rm+S.trenchB*2), 60);
            var cx = W/2, cy = H/2;
            var pL = L*sc, pW = Rm*sc;
            var ratioX = Math.abs(dx - cx) / (pL/2);
            var ratioY = Math.abs(dy - cy) / (pW/2);
            var wall = ratioY > ratioX ? 'long' : 'short';

            addDeductionRow(currentDragType, currentDragLen, S.wallThick || 0.3, currentDragHt, wall);
            liveUpdateSL();
        });
    }

    function addDeductionRow(type, len, b, ht, wall) {
        var list = $id('e-ded-list');
        if (!list) return;
        var placeholder = list.querySelector('div[style]');
        if (placeholder) placeholder.remove();

        var icon = type && type[0] === 'D' ? '🚪' : type && type[0] === 'W' ? '🪟' : '🔲';
        var div = document.createElement('div');
        div.className = 'est-ded-row';
        div.innerHTML =
            '<span class="est-ded-label">' + icon + ' ' + (type||'Opening') + '</span>' +
            '<input type="number" value="' + len + '" step="0.1" min="0.1" placeholder="L(m)" title="Opening Length">' +
            '<input type="number" value="' + b   + '" step="0.05" min="0.05" placeholder="B(m)" title="Wall thickness">' +
            '<input type="number" value="' + ht  + '" step="0.1" min="0.1"  placeholder="H(m)" title="Opening Height">' +
            '<button class="est-del-btn" title="Remove">✕</button>';

        div.querySelector('.est-del-btn').addEventListener('click', function() {
            div.remove(); syncDed(); liveUpdateSL();
        });
        div.querySelectorAll('input').forEach(function(inp) {
            inp.addEventListener('input', function() { syncDed(); liveUpdateSL(); });
        });
        list.appendChild(div);

        S.deductions.push({ type: type, len: len, b: b, ht: ht, wall: wall || 'long' });
    }

    function syncDed() {
        S.deductions = [];
        document.querySelectorAll('.est-ded-row').forEach(function(row) {
            var label = row.querySelector('.est-ded-label');
            var inps  = row.querySelectorAll('input');
            var txt   = label ? label.textContent.trim() : '';
            var parts = txt.split(' ');
            var type  = parts.length > 1 ? parts[1] : 'Opening';
            S.deductions.push({
                type: type,
                len:  parseFloat(inps[0] && inps[0].value) || 0,
                b:    parseFloat(inps[1] && inps[1].value) || 0,
                ht:   parseFloat(inps[2] && inps[2].value) || 0,
                wall: 'long'
            });
        });
    }

    // ── MEASUREMENT SHEET: SL ─────────────────────────
    function makeRow(item, nos, l, b, h, qty, rowClass, formula, logic) {
        var qStr = qty.toFixed(3);
        return '<tr class="' + rowClass + '">' +
            '<td>' + item + '</td>' +
            '<td>' + nos + '</td>' +
            '<td>' + l.toFixed(3) + '</td>' +
            '<td>' + b.toFixed(3) + '</td>' +
            '<td>' + h.toFixed(3) + '</td>' +
            '<td class="est-qty-cell" data-formula="' + encodeURIComponent(formula) + '" data-logic="' + encodeURIComponent(logic) + '">' + qStr + '</td>' +
            '</tr>';
    }

    function makeDedRow(item, nos, l, b, h, qty, formula, logic) {
        var qStr = (-qty).toFixed(3);
        return '<tr class="est-row-deduction">' +
            '<td>(-) ' + item + '</td>' +
            '<td>' + nos + '</td>' +
            '<td>' + l.toFixed(3) + '</td>' +
            '<td>' + b.toFixed(3) + '</td>' +
            '<td>' + h.toFixed(3) + '</td>' +
            '<td class="est-qty-cell" data-formula="' + encodeURIComponent(formula) + '" data-logic="' + encodeURIComponent(logic) + '">' + qStr + '</td>' +
            '</tr>';
    }

    function generateSL() {
        readSL(); syncDed();
        var L = S.roomL, Rm = S.roomW, B = S.trenchB, D = S.trenchH;
        var T = S.wallThick, H = S.wallH;
        if (!L || !Rm) return;

        var effL_ex = L + B, effS_ex = Math.max(0, Rm - B);
        var effL_ss = L + T, effS_ss = Math.max(0, Rm - T);

        var excL = 2 * effL_ex * B * D;
        var excS = 2 * effS_ex * B * D;
        var totalExc = excL + excS;

        var totalFoot = 0, footRows = '';
        S.footings.forEach(function(f, i) {
            if (!f.b || !f.h) return;
            var eL = L + f.b, eS = Math.max(0, Rm - f.b);
            var qL = 2 * eL * f.b * f.h, qS = 2 * eS * f.b * f.h;
            totalFoot += qL + qS;
            footRows += makeRow('Footing Step '+(i+1)+' (Long)', 2, eL, f.b, f.h, qL, 'est-row-footing',
                '2 × ('+ L+'+'+f.b+') × '+f.b+' × '+f.h+' = '+qL.toFixed(3),
                'Nos × (Lcc + B) × B × H');
            footRows += makeRow('Footing Step '+(i+1)+' (Short)', 2, eS, f.b, f.h, qS, 'est-row-footing',
                '2 × ('+Rm+'-'+f.b+') × '+f.b+' × '+f.h+' = '+qS.toFixed(3),
                'Nos × (Wcc - B) × B × H');
        });

        var ssL = 2 * effL_ss * T * H, ssS = 2 * effS_ss * T * H;
        var totalDed = 0, dedRows = '';
        S.deductions.forEach(function(d) {
            var q = d.len * T * d.ht;
            totalDed += q;
            dedRows += makeDedRow(d.type+' ('+d.wall+' wall)', 1, d.len, T, d.ht, q,
                '1 × '+d.len+' × '+T+' × '+d.ht+' = '+q.toFixed(3),
                'Nos × Opening Length × Wall Thickness × Opening Height');
        });
        var totalSS = ssL + ssS - totalDed;

        $id('kpi-exc').textContent   = totalExc.toFixed(3);
        $id('kpi-foot').textContent  = totalFoot.toFixed(3);
        $id('kpi-super').textContent = totalSS.toFixed(3);

        var hdrs = ['Item','Nos','L (m)','B (m)','H (m)','Qty (m³)'];
        var html = '<table class="est-results-table"><thead><tr>' + hdrs.map(function(h){return '<th>'+h+'</th>';}).join('') + '</tr></thead><tbody>';
        html += '<tr><td colspan="6" class="est-section-divider">🏗️ A — EXCAVATION</td></tr>';
        html += makeRow('Excavation (Long)', 2, effL_ex, B, D, excL, 'est-row-long',
            '2 × ('+L+'+'+B+') × '+B+' × '+D+' = '+excL.toFixed(3), 'Nos × (Lcc + B) × B × D');
        html += makeRow('Excavation (Short)', 2, effS_ex, B, D, excS, 'est-row-short',
            '2 × ('+Rm+'-'+B+') × '+B+' × '+D+' = '+excS.toFixed(3), 'Nos × (Wcc - B) × B × D');
        if (footRows) {
            html += '<tr><td colspan="6" class="est-section-divider">⬛ B — FOOTINGS</td></tr>';
            html += footRows;
        }
        html += '<tr><td colspan="6" class="est-section-divider">🧱 C — SUPERSTRUCTURE</td></tr>';
        html += makeRow('Brickwork (Long)', 2, effL_ss, T, H, ssL, 'est-row-long',
            '2 × ('+L+'+'+T+') × '+T+' × '+H+' = '+ssL.toFixed(3), 'Nos × (Lcc + T) × T × H');
        html += makeRow('Brickwork (Short)', 2, effS_ss, T, H, ssS, 'est-row-short',
            '2 × ('+Rm+'-'+T+') × '+T+' × '+H+' = '+ssS.toFixed(3), 'Nos × (Wcc - T) × T × H');
        if (dedRows) {
            html += '<tr><td colspan="6" class="est-section-divider deduction-divider">➖ D — DEDUCTIONS</td></tr>';
            html += dedRows;
        }
        html += '</tbody><tfoot>';
        html += '<tr><td colspan="5" style="font-weight:700;color:#f59e0b;">Total Excavation</td><td class="est-tfoot-total">'+totalExc.toFixed(3)+' m³</td></tr>';
        if (totalFoot) html += '<tr><td colspan="5" style="font-weight:700;color:#10b981;">Total Footing</td><td class="est-tfoot-total">'+totalFoot.toFixed(3)+' m³</td></tr>';
        if (totalDed)  html += '<tr><td colspan="5" style="font-weight:700;color:#ef4444;">Total Deductions</td><td class="est-tfoot-deduction">- '+totalDed.toFixed(3)+' m³</td></tr>';
        html += '<tr><td colspan="5" style="font-weight:700;color:#818cf8;">Net Brickwork</td><td class="est-tfoot-total">'+totalSS.toFixed(3)+' m³</td></tr>';
        html += '</tfoot></table>';

        var body = $id('e-results-body');
        if (body) { body.innerHTML = html; attachQtyHover(); }
    }

    // ── MEASUREMENT SHEET: CL ─────────────────────────
    function generateCL() {
        readCL();
        var res = clPreview();
        var Lcc = res.Lcc, Wcc = res.Wcc;
        var B = S.clTrenchB, D = S.clTrenchH, Tj = S.clTjunc;
        var Fb = S.clFootB, Fh = S.clFootH;
        var T  = S.clWallB, H  = S.clWallH;

        var totalCL = 2*(Lcc + Wcc) - Tj*B;
        var excVol  = totalCL * B * D;
        var footVol = totalCL * Fb * Fh;
        var bwVol   = totalCL * T * H;

        $id('cl-kpi-exc').textContent   = excVol.toFixed(3);
        $id('cl-kpi-foot').textContent  = footVol.toFixed(3);
        $id('cl-kpi-super').textContent = bwVol.toFixed(3);

        var hdrs = ['Item','Nos','L (m)','B (m)','H (m)','Qty (m³)'];
        var html = '<table class="est-results-table"><thead><tr>' + hdrs.map(function(h){return '<th>'+h+'</th>';}).join('') + '</tr></thead><tbody>';
        html += '<tr><td colspan="6" class="est-section-divider">📐 Centre Line — CL = '+totalCL.toFixed(3)+' m</td></tr>';
        html += makeRow('Excavation', 1, totalCL, B, D, excVol, 'est-row-long',
            totalCL.toFixed(3)+' × '+B+' × '+D+' = '+excVol.toFixed(3), 'CL = 2(Lcc + Wcc) - Tj×B');
        html += makeRow('Footing', 1, totalCL, Fb, Fh, footVol, 'est-row-footing',
            totalCL.toFixed(3)+' × '+Fb+' × '+Fh+' = '+footVol.toFixed(3), 'CL × Footing Width × Height');
        html += makeRow('Brickwork', 1, totalCL, T, H, bwVol, 'est-row-long',
            totalCL.toFixed(3)+' × '+T+' × '+H+' = '+bwVol.toFixed(3), 'CL × Wall Thickness × Wall Height');
        html += '</tbody><tfoot>';
        html += '<tr><td colspan="5" style="font-weight:700;color:#f59e0b;">Total Excavation</td><td class="est-tfoot-total">'+excVol.toFixed(3)+' m³</td></tr>';
        html += '<tr><td colspan="5" style="font-weight:700;color:#10b981;">Total Footing</td><td class="est-tfoot-total">'+footVol.toFixed(3)+' m³</td></tr>';
        html += '<tr><td colspan="5" style="font-weight:700;color:#818cf8;">Net Brickwork</td><td class="est-tfoot-total">'+bwVol.toFixed(3)+' m³</td></tr>';
        html += '</tfoot></table>';

        var body = $id('cl-results-body');
        if (body) { body.innerHTML = html; attachQtyHover(); }
        drawCL();
    }

    // ── FORMULA HOVER ────────────────────────────────
    function attachQtyHover() {
        document.querySelectorAll('.est-qty-cell[data-formula]').forEach(function(cell) {
            cell.addEventListener('mouseenter', function() {
                showTooltip(this,
                    decodeURIComponent(this.dataset.formula || ''),
                    decodeURIComponent(this.dataset.logic   || '')
                );
            });
            cell.addEventListener('mouseleave', hideTooltip);
        });
    }

    // ── METHOD TOGGLE (Short&Long Wall ↔ Centre Line) ─
    function setupMethodToggle() {
        var btnSL   = $id('est-btn-sl'),   btnCL   = $id('est-btn-cl');
        var panelSL = $id('est-panel-sl'), panelCL = $id('est-panel-cl');
        if (!btnSL || !btnCL || !panelSL || !panelCL) {
            console.warn('[Estimator] Method toggle buttons not found');
            return;
        }
        btnSL.addEventListener('click', function() {
            btnSL.classList.add('active');
            btnCL.classList.remove('active');
            panelSL.style.display = '';
            panelCL.style.display = 'none';
            setTimeout(function() { resizeSL(); liveUpdateSL(); }, 80);
        });
        btnCL.addEventListener('click', function() {
            btnCL.classList.add('active');
            btnSL.classList.remove('active');
            panelCL.style.display = '';
            panelSL.style.display = 'none';
            setTimeout(function() { resizeCL(); drawCL(); }, 80);
        });
    }

    // ── LONG / SHORT WALL HIGHLIGHT TOGGLES ───────────
    function setupHighlightToggles() {
        var btnLong  = $id('hl-long-btn');
        var btnShort = $id('hl-short-btn');
        if (!btnLong || !btnShort) {
            console.warn('[Estimator] Highlight toggle buttons not found');
            return;
        }
        btnLong.addEventListener('click', function() {
            S.showLong = !S.showLong;
            btnLong.classList.toggle('active', S.showLong);
            drawSL();
        });
        btnShort.addEventListener('click', function() {
            S.showShort = !S.showShort;
            btnShort.classList.toggle('active', S.showShort);
            drawSL();
        });
    }

    // ── CANVAS HOVER ──────────────────────────────────
    function setupCanvasHover() {
        if (!canvas) return;
        canvas.addEventListener('mousemove', function(e) {
            var r  = canvas.getBoundingClientRect();
            var mx = (e.clientX - r.left) * (canvas.width / r.width);
            var my = (e.clientY - r.top)  * (canvas.height / r.height);
            var W  = canvas.width, H = canvas.height;
            if (!S.roomL || !S.roomW || W < 50) return;
            var sc = Math.min((W-140)/(S.roomL+S.trenchB*2), (H-140)/(S.roomW+S.trenchB*2), 60);
            var cx = W/2, cy = H/2;
            var pL = S.roomL*sc, pW = S.roomW*sc;
            var rxRatio = Math.abs(mx - cx) / (pL/2 + 10);
            var ryRatio = Math.abs(my - cy) / (pW/2 + 10);
            var prev = hoveredWall;
            hoveredWall = ryRatio > rxRatio ? 'long' : 'short';
            if (hoveredWall !== prev) drawSL();
        });
        canvas.addEventListener('mouseleave', function() { hoveredWall = null; drawSL(); });
    }

    // ── INPUT LISTENERS ───────────────────────────────
    function setupSLInputs() {
        ['e-room-l','e-room-w','e-trench-b','e-trench-h','e-wall-thick','e-wall-h'].forEach(function(id) {
            var inp = $id(id);
            if (inp) inp.addEventListener('input', liveUpdateSL);
        });
    }

    function setupCLInputs() {
        ['cl-room-l','cl-room-w','cl-wall-b','cl-trench-b','cl-trench-h','cl-tjunc2','cl-foot-b','cl-foot-h','cl-wall-h'].forEach(function(id) {
            var inp = $id(id);
            if (inp) inp.addEventListener('input', function() { readCL(); clPreview(); drawCL(); });
        });
    }

    // ── MAIN INIT ─────────────────────────────────────
    function init() {
        // Resolve canvas refs NOW (inside init, after DOM is ready)
        canvas   = $id('est-blueprint-canvas');
        ctx      = canvas ? canvas.getContext('2d') : null;
        clCanvas = $id('cl-blueprint-canvas');
        clCtx    = clCanvas ? clCanvas.getContext('2d') : null;

        ensureTooltip();
        setupMethodToggle();
        setupHighlightToggles();
        setupDragDrop();
        setupCanvasHover();
        setupSLInputs();
        setupCLInputs();

        // Footing add button
        var addBtn = $id('e-add-footing');
        if (addBtn) addBtn.addEventListener('click', function() { addFootingRow(); liveUpdateSL(); });

        // Calculate buttons
        var calcSL = $id('e-calc-btn');
        if (calcSL) calcSL.addEventListener('click', function() { generateSL(); drawSL(); });

        var calcCL = $id('cl-calc-btn');
        if (calcCL) calcCL.addEventListener('click', generateCL);

        // Re-init canvas when estimate tab is clicked (it was hidden, canvas.width was 0)
        document.addEventListener('click', function(e) {
            var btn = e.target.closest('.tab-btn[data-tab="estimate-calculator"]');
            if (btn) {
                // Wait for the tab to become visible, then resize and draw
                setTimeout(function() {
                    canvas   = $id('est-blueprint-canvas');
                    ctx      = canvas ? canvas.getContext('2d') : null;
                    clCanvas = $id('cl-blueprint-canvas');
                    clCtx    = clCanvas ? clCanvas.getContext('2d') : null;

                    // Re-wire highlight buttons in case DOM was re-rendered
                    setupHighlightToggles();
                    setupMethodToggle();

                    resizeSL();
                    liveUpdateSL();
                    clPreview();
                }, 150);
            }
        });

        // Also watch NavEstimateCalculator button specifically
        var navBtn = $id('navEstimateCalculator');
        if (navBtn) {
            navBtn.addEventListener('click', function() {
                setTimeout(function() {
                    resizeSL();
                    liveUpdateSL();
                }, 150);
            });
        }

        // Initial draw attempt (canvas may have zero width if tab is hidden — that's OK)
        setTimeout(function() {
            resizeSL();
            liveUpdateSL();
            clPreview();
        }, 200);

        // Window resize
        window.addEventListener('resize', function() {
            var panelSL = $id('est-panel-sl');
            if (panelSL && panelSL.style.display !== 'none') {
                resizeSL(); drawSL();
            } else {
                resizeCL(); drawCL();
            }
        });
    }

    // Run after DOM is fully ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
