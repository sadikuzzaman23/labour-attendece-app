class BeamGraphics {
    constructor(canvasId, type) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.type = type; // 'beam', 'sfd', 'bmd'
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        // Adjust canvas internal resolution to match display size to prevent blurring
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width - 48; // accounting for padding
        this.canvas.height = this.type === 'beam' ? 200 : 250;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    getScale(totalLength) {
        // Leave 10% padding on each side
        const padding = this.canvas.width * 0.1;
        const drawableWidth = this.canvas.width - 2 * padding;
        const scale = drawableWidth / (totalLength || 10);
        return { padding, scale };
    }

    drawBeam(spans, nodes, loads) {
        this.clear();
        if (spans.length === 0) return;

        let totalLength = spans.reduce((sum, s) => sum + s.length, 0);
        const { padding, scale } = this.getScale(totalLength);
        const y = this.canvas.height / 2;

        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = '#94a3b8';

        // Draw beam line
        this.ctx.beginPath();
        this.ctx.moveTo(padding, y);
        this.ctx.lineTo(padding + totalLength * scale, y);
        this.ctx.stroke();

        // Draw nodes/supports
        let currentX = padding;
        nodes.forEach((node, i) => {
            this.drawSupport(node.type, currentX, y);
            
            // Draw node label
            this.ctx.fillStyle = '#f8fafc';
            this.ctx.font = '12px Inter';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`Node ${String.fromCharCode(65 + i)}`, currentX, y + 40);
            
            if (i < spans.length) {
                currentX += spans[i].length * scale;
            }
        });

        // Draw loads
        this.drawLoads(loads, spans, padding, scale, y);
    }

    drawSupport(type, x, y) {
        this.ctx.fillStyle = '#3b82f6';
        this.ctx.strokeStyle = '#3b82f6';
        this.ctx.lineWidth = 2;

        if (type === 'fixed') {
            this.ctx.beginPath();
            this.ctx.moveTo(x, y - 20);
            this.ctx.lineTo(x, y + 20);
            this.ctx.stroke();
            // Hatches
            for (let i = -15; i <= 15; i += 5) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, y + i);
                this.ctx.lineTo(x - 10, y + i + 10);
                this.ctx.stroke();
            }
        } else if (type === 'pinned') {
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x - 10, y + 20);
            this.ctx.lineTo(x + 10, y + 20);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        } else if (type === 'roller') {
            this.ctx.beginPath();
            this.ctx.arc(x, y + 10, 8, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(x - 15, y + 20);
            this.ctx.lineTo(x + 15, y + 20);
            this.ctx.stroke();
        }
        // free end has no graphics
    }

    drawLoads(loads, spans, padding, scale, y) {
        this.ctx.fillStyle = '#ef4444';
        this.ctx.strokeStyle = '#ef4444';
        
        loads.forEach(load => {
            // Find start X of span
            let spanStartX = padding;
            let spanLen = 0;
            for (let s of spans) {
                if (s.id === load.spanId) {
                    spanLen = s.length;
                    break;
                }
                spanStartX += s.length * scale;
            }

            if (load.type === 'point') {
                const lx = spanStartX + load.pos * scale;
                this.drawArrow(lx, y - 40, lx, y - 5, load.mag + ' kN');
            } else if (load.type === 'udl') {
                const startX = spanStartX;
                const endX = spanStartX + spanLen * scale;
                
                this.ctx.beginPath();
                this.ctx.moveTo(startX, y - 30);
                this.ctx.lineTo(endX, y - 30);
                this.ctx.stroke();

                for (let x = startX; x <= endX; x += 15) {
                    this.drawArrow(x, y - 30, x, y - 5);
                }
                
                this.ctx.textAlign = 'center';
                this.ctx.fillText(load.mag + ' kN/m', (startX + endX)/2, y - 40);
            }
        });
    }

    drawArrow(fromx, fromy, tox, toy, label = null) {
        const headlen = 8; // length of head in pixels
        const dx = tox - fromx;
        const dy = toy - fromy;
        const angle = Math.atan2(dy, dx);
        
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(fromx, fromy);
        this.ctx.lineTo(tox, toy);
        this.ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
        this.ctx.moveTo(tox, toy);
        this.ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
        this.ctx.stroke();

        if (label) {
            this.ctx.font = '12px Inter';
            this.ctx.fillText(label, fromx, fromy - 5);
        }
    }

    drawDiagram(data, maxVal, totalLength, colorStr) {
        this.clear();
        if (!data || data.length === 0 || totalLength === 0) return;

        const { padding, scale } = this.getScale(totalLength);
        const yAxis = this.canvas.height / 2;
        const maxDrawHeight = this.canvas.height * 0.4;
        
        const yScale = maxVal === 0 ? 1 : maxDrawHeight / maxVal;

        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = colorStr;
        this.ctx.fillStyle = colorStr.replace('1)', '0.3)'); // Add transparency for fill

        // Base line
        this.ctx.beginPath();
        this.ctx.moveTo(padding, yAxis);
        this.ctx.lineTo(padding + totalLength * scale, yAxis);
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = '#475569';
        this.ctx.stroke();

        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = colorStr;

        // Draw path
        this.ctx.beginPath();
        this.ctx.moveTo(padding, yAxis);

        data.forEach(p => {
            const x = padding + p.x * scale;
            const y = yAxis - (this.type === 'bmd' ? -p.m : p.v) * yScale; 
            // Note: Inverse BMD convention used commonly (sagging positive down). If p.m is sagging positive, we invert y.
            this.ctx.lineTo(x, y);
        });

        this.ctx.lineTo(padding + totalLength * scale, yAxis);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        // Max values annotation
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.font = '12px Inter';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`Max: ${maxVal.toFixed(2)}`, this.canvas.width / 2, 20);
    }
}
