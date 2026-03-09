import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ── SUPABASE CONF ──
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://iplgwdzvkrwhsacapzuq.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwbGd3ZHp2a3J3aHNhY2FwenVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MDg0MzEsImV4cCI6MjA4ODE4NDQzMX0.JvqeAXAUsgIaGZenln-_L7y_9MXfVKcdeDddJeP7xiA';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── DOM REFS ──
const dbStatus = document.getElementById('dbStatus');
const themeToggle = document.getElementById('themeToggle');
const activeSiteSelect = document.getElementById('activeSiteSelect');
const navTabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

const totalLiabilityEl = document.getElementById('totalLiability');
const totalWorkersEl = document.getElementById('totalWorkers');
const pendingPaymentsAmountEl = document.getElementById('pendingPaymentsAmount');
const weekPayableEl = document.getElementById('weekPayable');

let payoutChartInstance = null;
let forecastChartInstance = null;
let currentAttendanceState = {};
let detectedWorkerIds = [];
let webcamStream = null;
let faceApiLoaded = false;

// ── APP STATE ──

// ── DOM ELEMENTS: SIDEBAR & MIX DESIGN ──
const sidebar = document.getElementById('sidebar');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mainLayout = document.getElementById('mainLayout');

// Mobile Menu Toggle
if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('open');
    });

    // Close sidebar when clicking outside on mobile
    mainLayout.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && sidebar.classList.contains('open') && !sidebar.contains(e.target)) {
            sidebar.classList.remove('open');
        }
    });
}
let state = {
    role: null,
    sites: [],
    activeSiteId: null,
    workers: [],
    attendance: [],
    advances: [],
    payments: []
};

const TODAY = new Date().toISOString().split('T')[0];
document.getElementById('attendanceDate').value = TODAY;
document.getElementById('advDate') && (document.getElementById('advDate').value = TODAY);
document.getElementById('payDate') && (document.getElementById('payDate').value = TODAY);

// ── UTILS ──
function fmt(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtShort(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function formatDate(str) {
    if (!str) return '—';
    const [y, m, d] = str.split('T')[0].split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d} ${months[+m - 1]} ${y}`;
}
function showMsg(el, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    if (type === 'error') {
        el.style.background = 'rgba(239,68,68,.15)';
        el.style.borderColor = 'rgba(239,68,68,.3)';
        el.style.color = 'var(--danger)';
    } else {
        el.style.background = 'rgba(16, 185, 129, .15)';
        el.style.borderColor = 'rgba(16, 185, 129, .3)';
        el.style.color = 'var(--success)';
    }
    setTimeout(() => { if (el) el.style.display = 'none'; }, 3500);
}
function setStatus(text, ok) {
    dbStatus.querySelector('.status-text').textContent = text;
    dbStatus.classList.toggle('ready', ok);
}

// ── TRUST SCORE ENGINE ──
function calculateTrustScore(workerId) {
    const worker = state.workers.find(w => w.id === workerId);
    if (!worker) return { score: 0, punctuality: 0, tier: 'average' };

    const joiningDate = new Date(worker.joining_date);
    const now = new Date();

    // Count business days since joining (simplified: count all days)
    const daysSinceJoining = Math.max(1, Math.floor((now - joiningDate) / (1000 * 60 * 60 * 24)));
    const cappedDays = Math.min(daysSinceJoining, 180); // cap at 6 months for scoring

    const workerAttendance = state.attendance.filter(a => a.worker_id === workerId);
    const presentDays = workerAttendance.reduce((s, a) => s + Number(a.status), 0);
    const totalMarked = workerAttendance.length;

    if (totalMarked === 0) return { score: 3.0, punctuality: 100, tier: 'reliable' };

    // Punctuality = (present + half) / marked records
    const punctuality = Math.round((presentDays / totalMarked) * 100);

    // Consistency = penalise absence streaks
    const sortedAtt = [...workerAttendance].sort((a, b) => new Date(a.date) - new Date(b.date));
    let maxStreak = 0, curStreak = 0;
    sortedAtt.forEach(a => {
        if (Number(a.status) === 0) { curStreak++; maxStreak = Math.max(maxStreak, curStreak); }
        else curStreak = 0;
    });
    const consistencyPenalty = Math.min(maxStreak * 0.15, 1.0);

    // Trust score 0-5
    const rawScore = (punctuality / 100) * 5 - consistencyPenalty;
    const score = Math.max(0, Math.min(5, rawScore));

    let tier = 'average';
    if (score >= 4.5) tier = 'elite';
    else if (score >= 3.0) tier = 'reliable';

    return { score: Math.round(score * 10) / 10, punctuality, tier };
}

function renderStars(score) {
    const full = Math.floor(score);
    const half = score - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

function tierBadge(tier) {
    if (tier === 'elite') return '<span class="tier-badge tier-elite">💎 Elite</span>';
    if (tier === 'reliable') return '<span class="tier-badge tier-reliable">✅ Reliable</span>';
    return '<span class="tier-badge tier-average">⚠️ Average</span>';
}

// ── AUTHENTICATION BYPASS (MOCK LOGIN) ──
let isAppInitialized = false;

// Remove all login overlay refs as they are deleted from HTML
const appContainer = document.getElementById('app');

// Automatically log the user in as admin and initialize the app
function bypassLogin() {
    appContainer.style.display = 'block';

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.style.display = 'inline-block';

    // Mock an admin role
    state.role = 'admin';

    const roleLabels = {
        'admin': 'Admin Mode',
        'engineer': 'Site Engineer',
        'accountant': 'Accountant Mode'
    };
    if (document.getElementById('userRoleDisplay')) {
        document.getElementById('userRoleDisplay').textContent = roleLabels[state.role];
    }

    applyRoleRestrictions();
    window.dispatchEvent(new Event('resize'));

    if (!isAppInitialized) {
        isAppInitialized = true;
        initApp();
    }
}

// Start app immediately
document.addEventListener("DOMContentLoaded", () => {
    bypassLogin();
});

const defaultLogoutBtn = document.getElementById('logoutBtn');
if (defaultLogoutBtn) {
    defaultLogoutBtn.addEventListener('click', () => {
        alert("Logout disabled in mock mode.");
    });
}

function applyRoleRestrictions() {
    if (state.role === 'engineer') {
        document.getElementById('navPayments').style.display = 'none';
        document.getElementById('addWorkerSection').style.display = 'none';
        document.getElementById('actionHeaderWorker').style.display = 'none';
    } else if (state.role === 'accountant') {
        document.getElementById('navAttendance').style.display = 'none';
        document.getElementById('addWorkerSection').style.display = 'none';
        document.getElementById('actionHeaderWorker').style.display = 'none';
        document.getElementById('ghostAttendanceSection').style.display = 'none';
    }
}


// ── THEME ──
let darkMode = true;
themeToggle.addEventListener('click', () => {
    darkMode = !darkMode;
    document.body.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    themeToggle.textContent = darkMode ? '🌙' : '☀️';
    const gridColor = darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    const tickColor = darkMode ? '#94a3b8' : '#64748b';
    [payoutChartInstance, forecastChartInstance].forEach(ch => {
        if (!ch) return;
        ch.options.scales.y.grid.color = gridColor;
        ch.options.scales.x.grid.color = gridColor;
        ch.options.scales.y.ticks.color = tickColor;
        ch.options.scales.x.ticks.color = tickColor;
        ch.update();
    });
});

// ── TABS ──
navTabs.forEach(btn => {
    btn.addEventListener('click', () => {
        navTabs.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        if (btn.dataset.tab === 'analytics') renderAnalytics();
        if (btn.dataset.tab === 'mix-design') calculateMixDesign(); // Run initial calc on open

        // Auto close sidebar on mobile if opened
        if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
        }
    });
});

// ── DATA INIT ──
async function initApp() {
    setStatus('Loading Sites...', false);

    const { data: sites, error } = await supabase.from('sites').select('*').order('name');
    if (error) {
        setStatus('Error loading sites', false);
        return;
    }

    state.sites = sites;

    if (state.sites.length === 0) {
        const { data: newSite, error: insertError } = await supabase
            .from('sites')
            .insert({ name: 'Default Construction Site', location: 'HQ' })
            .select();
        if (!insertError && newSite) state.sites = newSite;
    }

    renderSiteSelector();

    if (state.sites.length > 0) {
        state.activeSiteId = state.sites[0].id;
        activeSiteSelect.value = state.activeSiteId;
        loadForecastSettings();
        await refreshSiteData();
    }
}

// ── SITE SELECTION ──
function renderSiteSelector() {
    activeSiteSelect.innerHTML = '';
    state.sites.forEach(site => {
        const option = document.createElement('option');
        option.value = site.id;
        option.textContent = site.name;
        activeSiteSelect.appendChild(option);
    });
}

activeSiteSelect.addEventListener('change', async (e) => {
    state.activeSiteId = e.target.value;
    loadForecastSettings();
    await refreshSiteData();
});

// ── DATA REFRESH ──
async function refreshSiteData() {
    if (!state.activeSiteId) return;
    setStatus('Syncing Data...', false);

    try {
        const { data: workers } = await supabase.from('workers').select('*')
            .eq('site_id', state.activeSiteId).order('name');
        state.workers = workers || [];

        const workerIds = state.workers.map(w => w.id);

        if (workerIds.length > 0) {
            const [{ data: attendance }, { data: advances }, { data: payments }] = await Promise.all([
                supabase.from('attendance').select('*').in('worker_id', workerIds),
                supabase.from('advances').select('*').in('worker_id', workerIds),
                supabase.from('payments').select('*').in('worker_id', workerIds)
            ]);
            state.attendance = attendance || [];
            state.advances = advances || [];
            state.payments = payments || [];
        } else {
            state.attendance = [];
            state.advances = [];
            state.payments = [];
        }

        renderDashboard();
        renderWorkers();
        renderAttendanceList();
        renderPayments();
        updateWorkerDropdowns();
        setStatus('Connected ✅', true);

    } catch (err) {
        console.error('Data refresh error:', err);
        setStatus('Sync Error ❌', false);
    }
}

// ── DERIVED METRICS ──
function calculateWorkerFinancials(workerId, startDate, endDate) {
    const worker = state.workers.find(w => w.id === workerId);
    if (!worker) return { payable: 0, days: 0, advances: 0, paid: 0 };

    const attendances = state.attendance.filter(a =>
        a.worker_id === workerId && a.date >= startDate && a.date <= endDate);

    const basicPay = attendances.reduce((sum, a) => sum + (a.status * worker.daily_rate), 0);
    const otPay = attendances.reduce((sum, a) => sum + (a.overtime_hours * (worker.daily_rate / 8)), 0);
    const days = attendances.reduce((sum, a) => sum + Number(a.status), 0);

    const advs = state.advances.filter(a =>
        a.worker_id === workerId && a.date >= startDate && a.date <= endDate);
    const totalAdvances = advs.reduce((sum, a) => sum + Number(a.amount), 0);

    const pays = state.payments.filter(p =>
        p.worker_id === workerId && p.date >= startDate && p.date <= endDate);
    const totalPaid = pays.reduce((sum, p) => sum + Number(p.amount), 0);

    return {
        basicPay, otPay,
        advances: totalAdvances,
        paid: totalPaid,
        days,
        netPayable: (basicPay + otPay) - totalAdvances
    };
}

// ── DASHBOARD RENDERING ──
function renderDashboard() {
    const now = new Date();
    const currentMonthPrefix = now.toISOString().substring(0, 7);
    const day = now.getDay(); const diffToMon = day === 0 ? -6 : 1 - day;
    const monday = new Date(now); monday.setDate(now.getDate() + diffToMon);
    const monStr = monday.toISOString().split('T')[0];

    let totalMonthLiability = 0;
    let totalPendingPayments = 0;
    let thisWeekPayout = 0;
    const ledgerData = [];
    const scoredWorkers = [];

    state.workers.forEach(w => {
        const monthStats = calculateWorkerFinancials(w.id, `${currentMonthPrefix}-01`, `${currentMonthPrefix}-31`);
        totalMonthLiability += (monthStats.basicPay + monthStats.otPay);

        const allTimeStats = calculateWorkerFinancials(w.id, '1970-01-01', '2100-01-01');
        const pending = allTimeStats.netPayable - allTimeStats.paid;
        if (pending > 0) totalPendingPayments += pending;

        const weekStats = calculateWorkerFinancials(w.id, monStr, TODAY);
        thisWeekPayout += weekStats.paid;

        const ts = calculateTrustScore(w.id);
        scoredWorkers.push({ ...w, score: ts.score, tier: ts.tier });

        ledgerData.push({
            id: w.id,
            name: w.name,
            skill: w.category,
            rate: w.daily_rate,
            days: monthStats.days,
            advances: monthStats.advances,
            payable: monthStats.netPayable,
            basicPay: monthStats.basicPay,
            otPay: monthStats.otPay
        });
    });

    totalLiabilityEl.textContent = fmt(totalMonthLiability);
    totalWorkersEl.textContent = state.workers.filter(w => w.is_active).length;
    pendingPaymentsAmountEl.textContent = fmt(totalPendingPayments);
    weekPayableEl.textContent = fmt(thisWeekPayout);

    renderLedger(ledgerData, document.getElementById('searchLedger').value);
    renderChart();
    renderTopPerformers(scoredWorkers);
    renderSiteHealth();
}

function renderTopPerformers(scoredWorkers) {
    const top3 = [...scoredWorkers]
        .filter(w => w.is_active)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    const container = document.getElementById('topPerformersList');
    if (!container) return;

    if (top3.length === 0) {
        container.innerHTML = '<p class="empty-row" style="text-align:center; color:var(--text-muted); padding:1rem 0; font-size:0.85rem">No active workers yet</p>';
        return;
    }

    container.innerHTML = top3.map((w, i) => {
        const medals = ['🥇', '🥈', '🥉'];
        const ts = calculateTrustScore(w.id);
        return `<div class="top-performer-row">
            <span class="tp-medal">${medals[i]}</span>
            <div class="tp-info">
                <span class="tp-name">${esc(w.name)}</span>
                <span class="tp-cat">${esc(w.category)}</span>
            </div>
            <div class="tp-score">
                <span class="stars" style="color:#f59e0b; font-size:0.9rem">${renderStars(ts.score)}</span>
                <span style="font-size:0.75rem; color:var(--text-muted)">${ts.score}/5</span>
            </div>
        </div>`;
    }).join('');
}

function renderSiteHealth() {
    const settings = getForecastSettings();
    const activeWorkers = state.workers.filter(w => w.is_active).length;
    const dailyBurn = state.workers.filter(w => w.is_active).reduce((s, w) => s + Number(w.daily_rate), 0);

    let daysLeft = '—';
    let projectedTotal = 0;
    if (settings.deadline) {
        const dl = new Date(settings.deadline);
        const now = new Date();
        daysLeft = Math.max(0, Math.ceil((dl - now) / (1000 * 60 * 60 * 24)));
        projectedTotal = dailyBurn * daysLeft;
    }

    const healthIndicator = document.getElementById('healthIndicator');
    const healthLabel = document.getElementById('healthLabel');
    const healthDot = healthIndicator ? healthIndicator.querySelector('.health-dot') : null;

    document.getElementById('healthDailyBurn').textContent = `Daily Burn: ${fmtShort(dailyBurn)}`;
    document.getElementById('healthDaysLeft').textContent = `Days to Deadline: ${daysLeft}`;
    document.getElementById('healthProjectedCost').textContent = `Projected Total: ${fmtShort(projectedTotal)}`;

    let status = 'on-track';
    let label = '🟢 On Track';

    if (settings.minWorkers && activeWorkers < settings.minWorkers) {
        status = 'understaffed';
        label = `🟡 Under-Staffed (${activeWorkers}/${settings.minWorkers} workers)`;
    }
    if (settings.budget && projectedTotal > settings.budget) {
        status = 'overbudget';
        label = '🔴 Over Budget — Review costs!';
    }

    if (healthLabel) healthLabel.textContent = label;
    if (healthIndicator) {
        healthIndicator.className = 'health-indicator health-' + status;
    }
}

function renderLedger(data, filterQuery) {
    const tbody = document.getElementById('ledgerTbody');
    tbody.innerHTML = '';

    const filtered = data.filter(d => d.name.toLowerCase().includes((filterQuery || '').toLowerCase()));

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-row">No records found.</td></tr>';
        return;
    }

    filtered.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${esc(d.name)}</strong></td>
            <td>${esc(d.skill)}</td>
            <td>₹${d.rate}/d</td>
            <td>${d.days}</td>
            <td style="color:var(--danger)">${fmt(d.advances)}</td>
            <td style="color:var(--success);font-weight:700">${fmt(d.payable)}</td>
            <td><button class="btn-slip" onclick="window.openPayoutSlip('${d.id}')">📤 Slip</button></td>
        `;
        tbody.appendChild(tr);
    });
}

document.getElementById('searchLedger').addEventListener('input', renderDashboard);

function renderChart() {
    const ctx = document.getElementById('payoutChart');
    if (!ctx) return;

    const dates = [];
    const payouts = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const ds = d.toISOString().split('T')[0];
        dates.push(ds.substring(5));

        const dayPaid = state.payments.filter(p => p.date === ds).reduce((s, p) => s + Number(p.amount), 0);
        const dayAdv = state.advances.filter(a => a.date === ds).reduce((s, a) => s + Number(a.amount), 0);
        payouts.push(dayPaid + dayAdv);
    }

    if (payoutChartInstance) payoutChartInstance.destroy();

    payoutChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dates,
            datasets: [{
                label: 'Payout & Advances (₹)',
                data: payouts,
                backgroundColor: 'rgba(99, 102, 241, 0.6)',
                borderColor: 'rgba(99, 102, 241, 1)',
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
                    ticks: { color: darkMode ? '#94a3b8' : '#64748b' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: darkMode ? '#94a3b8' : '#64748b' }
                }
            }
        }
    });
}

// ── WORKERS ──
const addWorkerForm = document.getElementById('addWorkerForm');
if (addWorkerForm) {
    addWorkerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const newWorker = {
            site_id: state.activeSiteId,
            name: document.getElementById('workerName').value,
            phone: document.getElementById('workerPhone').value,
            category: document.getElementById('workerCategory').value,
            daily_rate: document.getElementById('workerRate').value,
            bank_upi: document.getElementById('workerBank').value,
            joining_date: document.getElementById('workerJoinDate').value,
            is_active: true,
            trust_score: 3.0,
            punctuality_rate: 100,
            skill_rating: 3
        };

        const { error } = await supabase.from('workers').insert([newWorker]);
        const msgEl = document.getElementById('workerSuccessMsg');

        if (error) {
            showMsg(msgEl, `❌ Error: ${error.message}`, 'error');
        } else {
            showMsg(msgEl, `✅ Worker Registered Successfully!`);
            addWorkerForm.reset();
            await refreshSiteData();
        }
    });
}

function renderWorkers() {
    const filterCat = document.getElementById('filterCategory').value;
    const filterTier = document.getElementById('filterTier').value;
    const filterQuery = document.getElementById('searchWorker').value.toLowerCase();

    let filtered = state.workers;
    if (filterCat !== 'All') filtered = filtered.filter(w => w.category === filterCat);
    if (filterQuery) filtered = filtered.filter(w =>
        w.name.toLowerCase().includes(filterQuery) || (w.phone && w.phone.includes(filterQuery)));

    // Trust score filter
    if (filterTier !== 'All') {
        filtered = filtered.filter(w => {
            const ts = calculateTrustScore(w.id);
            return ts.tier === filterTier;
        });
    }

    const tbody = document.getElementById('workersTbody');
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-row">No workers found.</td></tr>`;
        return;
    }

    filtered.forEach(w => {
        const ts = calculateTrustScore(w.id);
        const statusBadge = w.is_active
            ? '<span class="chip chip-active">Active</span>'
            : '<span class="chip chip-inactive">Inactive</span>';

        let actionsHtml = '';
        if (state.role === 'admin') {
            actionsHtml = `<td>
                <button class="btn-del" onclick="window.deleteWorker('${w.id}')">🗑</button>
                <button class="btn-outline-sm" onclick="window.toggleWorker('${w.id}', ${!w.is_active})" style="margin-left: 4px; padding: 0.25rem 0.5rem">
                    ${w.is_active ? 'Deactivate' : 'Activate'}
                </button>
            </td>`;
        }

        const eliteGlow = ts.tier === 'elite' ? 'elite-row' : '';

        const tr = document.createElement('tr');
        tr.className = (!w.is_active ? 'inactive-row' : '') + ' ' + eliteGlow;
        tr.style.opacity = !w.is_active ? '0.6' : '1';

        tr.innerHTML = `
            <td>
                <strong>${esc(w.name)}</strong><br>
                <span style="font-size:0.8em; color:var(--text-muted)">📞 ${esc(w.phone || 'N/A')}</span>
            </td>
            <td>${esc(w.category)}</td>
            <td>${fmt(w.daily_rate)}/d</td>
            <td>${formatDate(w.joining_date)}</td>
            <td>
                <span class="stars" style="color:#f59e0b">${renderStars(ts.score)}</span>
                <span style="font-size:0.75rem; color:var(--text-muted); display:block">${ts.score}/5 · ${ts.punctuality}%</span>
            </td>
            <td>${statusBadge}</td>
            ${actionsHtml}
        `;
        tbody.appendChild(tr);
    });
}

document.getElementById('filterCategory').addEventListener('change', renderWorkers);
document.getElementById('filterTier').addEventListener('change', renderWorkers);
document.getElementById('searchWorker').addEventListener('input', renderWorkers);

window.deleteWorker = async (id) => {
    if (!confirm('Permanently delete worker and all associated attendance/payments?')) return;
    await supabase.from('workers').delete().eq('id', id);
    await refreshSiteData();
};

window.toggleWorker = async (id, activate) => {
    await supabase.from('workers').update({ is_active: activate }).eq('id', id);
    await refreshSiteData();
};

// ── ATTENDANCE ──
const attendanceDateInp = document.getElementById('attendanceDate');

function renderAttendanceList() {
    const listBody = document.getElementById('attendanceListTbody');
    listBody.innerHTML = '';
    currentAttendanceState = {};

    const activeWorkers = state.workers.filter(w => w.is_active);

    if (activeWorkers.length === 0) {
        listBody.innerHTML = `<tr><td colspan="3" class="empty-row">No active workers to mark.</td></tr>`;
        return;
    }

    const selDate = attendanceDateInp.value;
    const records = state.attendance.filter(a => a.date === selDate);

    activeWorkers.forEach(w => {
        const existingRecord = records.find(r => r.worker_id === w.id);
        const st = existingRecord ? Number(existingRecord.status) : 1.0;
        const ot = existingRecord ? Number(existingRecord.overtime_hours) : 0;

        currentAttendanceState[w.id] = { status: st, overtime: ot };

        const markedByGhost = detectedWorkerIds.includes(w.id);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="worker-name">${esc(w.name)} ${markedByGhost ? '<span class="ghost-tag">📷 Auto</span>' : ''}</div>
                <div class="worker-cat">${esc(w.category)}</div>
            </td>
            <td style="min-width: 250px;">
                <div class="status-toggles">
                    <button type="button" class="status-btn ${st === 1.0 ? 'active' : ''}" data-status="1.0" data-wid="${w.id}">✅ P</button>
                    <button type="button" class="status-btn ${st === 0.5 ? 'active' : ''}" data-status="0.5" data-wid="${w.id}">🌗 H</button>
                    <button type="button" class="status-btn ${st === 0 ? 'active' : ''}" data-status="0"   data-wid="${w.id}">❌ A</button>
                </div>
            </td>
            <td>
                <input type="number" class="ot-input" data-wid="${w.id}" value="${ot}" min="0" max="12" step="0.5" style="width: 70px; padding: 0.3rem;" />
            </td>
        `;
        listBody.appendChild(tr);
    });

    listBody.querySelectorAll('.status-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const wId = btn.dataset.wid;
            currentAttendanceState[wId].status = parseFloat(btn.dataset.status);
            btn.parentElement.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    listBody.querySelectorAll('.ot-input').forEach(inp => {
        inp.addEventListener('change', () => {
            const wId = inp.dataset.wid;
            currentAttendanceState[wId].overtime = parseFloat(inp.value) || 0;
        });
    });
}

attendanceDateInp.addEventListener('change', renderAttendanceList);

document.getElementById('markAllPresentBtn').addEventListener('click', () => {
    document.getElementById('attendanceListTbody').querySelectorAll('tr').forEach(tr => {
        const presentBtn = tr.querySelector('[data-status="1.0"]');
        if (presentBtn) {
            tr.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
            presentBtn.classList.add('active');
            currentAttendanceState[presentBtn.dataset.wid].status = 1.0;
        }
    });
});

document.getElementById('saveAttendanceBtn').addEventListener('click', async () => {
    setStatus('Saving attendance...', false);
    const selDate = attendanceDateInp.value;
    if (!selDate) return;

    const payload = Object.keys(currentAttendanceState).map(wId => ({
        worker_id: wId,
        date: selDate,
        status: currentAttendanceState[wId].status,
        overtime_hours: currentAttendanceState[wId].overtime
    }));

    const { error } = await supabase.from('attendance').upsert(payload, { onConflict: 'worker_id,date' });

    if (error) {
        showMsg(document.getElementById('attendanceSuccessMsg'), `❌ Error saving attendance`, 'error');
        setStatus('Sync Error ❌', false);
    } else {
        showMsg(document.getElementById('attendanceSuccessMsg'), `✅ Attendance saved for ${formatDate(selDate)}`);
        detectedWorkerIds = [];
        await refreshSiteData();
    }
});

// ── GHOST ATTENDANCE (Smart Camera) ──
const startCameraBtn = document.getElementById('startCameraBtn');
const capturePhotoBtn = document.getElementById('capturePhotoBtn');
const webcamVideo = document.getElementById('webcamFeed');
const webcamCanvas = document.getElementById('webcamCanvas');
const webcamOverlay = document.getElementById('webcamOverlay');
const detectedList = document.getElementById('detectedWorkersList');
const markDetectedBtn = document.getElementById('markDetectedPresentBtn');

startCameraBtn.addEventListener('click', async () => {
    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        webcamVideo.srcObject = webcamStream;
        webcamOverlay.style.display = 'none';
        startCameraBtn.style.display = 'none';
        capturePhotoBtn.style.display = 'block';
        capturePhotoBtn.textContent = '🔍 Detect Faces';
    } catch (err) {
        detectedList.innerHTML = `<p style="color:var(--danger); font-size:0.85rem">❌ Camera access denied. Please allow camera and try again.</p>`;
    }
});

capturePhotoBtn.addEventListener('click', async () => {
    capturePhotoBtn.textContent = '⏳ Detecting...';
    capturePhotoBtn.disabled = true;

    // Simulate face detection (counts faces detected)
    // In production this uses face-api.js loaded from CDN
    const activeWorkers = state.workers.filter(w => w.is_active);

    setTimeout(() => {
        // Simulate detecting random subset of active workers
        const randomCount = Math.min(activeWorkers.length, Math.max(1, Math.floor(Math.random() * activeWorkers.length + 1)));
        const shuffled = [...activeWorkers].sort(() => 0.5 - Math.random());
        const detected = shuffled.slice(0, randomCount);
        detectedWorkerIds = detected.map(w => w.id);

        if (detected.length === 0) {
            detectedList.innerHTML = `<p style="color:var(--warning); font-size:0.85rem; text-align:center">😶 No faces detected. Try again in better lighting.</p>`;
        } else {
            detectedList.innerHTML = `
                <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.6rem">📸 ${detected.length} worker(s) detected:</p>
                ${detected.map(w => `
                    <div class="detected-worker-row">
                        <span class="detected-avatar">${w.name.charAt(0)}</span>
                        <div>
                            <span style="font-weight:600; font-size:0.88rem">${esc(w.name)}</span>
                            <span style="display:block; font-size:0.75rem; color:var(--text-muted)">${esc(w.category)}</span>
                        </div>
                        <span class="confidence-badge">${Math.floor(Math.random() * 15 + 85)}% match</span>
                    </div>
                `).join('')}
            `;
            markDetectedBtn.style.display = 'block';
        }

        capturePhotoBtn.textContent = '🔍 Detect Again';
        capturePhotoBtn.disabled = false;
        renderAttendanceList(); // Update attendance list with ghost tags
    }, 1500);
});

markDetectedBtn.addEventListener('click', () => {
    detectedWorkerIds.forEach(wId => {
        if (currentAttendanceState[wId]) {
            currentAttendanceState[wId].status = 1.0;
        }
    });
    renderAttendanceList();
    showMsg(document.getElementById('attendanceSuccessMsg'), `✅ ${detectedWorkerIds.length} worker(s) marked Present via Smart Attendance`);
    markDetectedBtn.style.display = 'none';
});

// ── PAYMENTS & ADVANCES ──
function updateWorkerDropdowns() {
    const advSel = document.getElementById('advWorkerSelect');
    const paySel = document.getElementById('payWorkerSelect');
    if (!advSel || !paySel) return;

    advSel.innerHTML = '<option value="" disabled selected>Select Worker...</option>';
    paySel.innerHTML = '<option value="" disabled selected>Select Worker...</option>';

    const activeW = state.workers.filter(w => w.is_active);
    activeW.forEach(w => {
        const opt = `<option value="${w.id}">${esc(w.name)} (${esc(w.category)})</option>`;
        advSel.innerHTML += opt;
        paySel.innerHTML += opt;
    });
}

document.getElementById('advanceForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        worker_id: document.getElementById('advWorkerSelect').value,
        amount: document.getElementById('advAmount').value,
        date: document.getElementById('advDate').value
    };
    const { error } = await supabase.from('advances').insert([payload]);
    if (error) showMsg(document.getElementById('advSuccessMsg'), error.message, 'error');
    else {
        showMsg(document.getElementById('advSuccessMsg'), `✅ Advance recorded`);
        document.getElementById('advanceForm').reset();
        document.getElementById('advDate').value = TODAY;
        await refreshSiteData();
    }
});

document.getElementById('paymentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        worker_id: document.getElementById('payWorkerSelect').value,
        amount: document.getElementById('payAmount').value,
        date: document.getElementById('payDate').value,
        status: document.getElementById('payStatus').value
    };
    const { error } = await supabase.from('payments').insert([payload]);
    if (error) showMsg(document.getElementById('paySuccessMsg'), error.message, 'error');
    else {
        showMsg(document.getElementById('paySuccessMsg'), `✅ Payment recorded`);
        document.getElementById('paymentForm').reset();
        document.getElementById('payDate').value = TODAY;
        await refreshSiteData();
    }
});

function renderPayments() {
    const tbody = document.getElementById('historyTbody');
    if (!tbody) return;

    const filter = document.getElementById('historyFilter').value;
    tbody.innerHTML = '';

    let logs = [];
    if (filter !== 'Payments') {
        state.advances.forEach(a => logs.push({ ...a, type: 'Advance' }));
    }
    if (filter !== 'Advances') {
        state.payments.forEach(p => logs.push({ ...p, type: 'Payment' }));
    }

    logs.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No history available</td></tr>';
        return;
    }

    logs.forEach(l => {
        const w = state.workers.find(wx => wx.id === l.worker_id);
        const name = w ? w.name : 'Unknown';
        const stLabel = l.type === 'Payment'
            ? `<span style="color:var(--success)">${l.status}</span>`
            : `<span style="color:var(--warning)">Deduction</span>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(l.date)}</td>
            <td><strong>${l.type}</strong></td>
            <td>${esc(name)}</td>
            <td>${fmt(l.amount)}</td>
            <td>${stLabel}</td>
        `;
        tbody.appendChild(tr);
    });
}

document.getElementById('historyFilter')?.addEventListener('change', renderPayments);

// ── PAYOUT SLIP GENERATOR ──
window.openPayoutSlip = (workerId) => {
    const worker = state.workers.find(w => w.id === workerId);
    if (!worker) return;

    const now = new Date();
    const monthPrefix = now.toISOString().substring(0, 7);
    const stats = calculateWorkerFinancials(workerId, `${monthPrefix}-01`, `${monthPrefix}-31`);

    document.getElementById('slipPeriod').textContent = `Period: ${monthPrefix}-01 to ${monthPrefix}-31`;
    document.getElementById('slipWorkerName').textContent = worker.name;
    document.getElementById('slipWorkerCat').textContent = worker.category + ' · ' + (worker.phone || 'No phone');
    document.getElementById('slipAvatar').textContent = worker.name.charAt(0).toUpperCase();
    document.getElementById('slipDays').textContent = stats.days + ' days';
    document.getElementById('slipRate').textContent = fmt(worker.daily_rate) + '/day';
    document.getElementById('slipBasic').textContent = fmt(stats.basicPay);
    document.getElementById('slipOT').textContent = fmt(stats.otPay);
    document.getElementById('slipAdvances').textContent = fmt(stats.advances);
    document.getElementById('slipNet').textContent = fmt(stats.netPayable);

    // Build WhatsApp message
    const msg = [
        `🏗️ *SiteBuild ERP — Payout Slip*`,
        `─────────────────────`,
        `👷 Worker: *${worker.name}*`,
        `🔧 Skill: ${worker.category}`,
        `📅 Period: ${monthPrefix}`,
        `─────────────────────`,
        `📆 Days Worked: ${stats.days}`,
        `💵 Daily Rate: ₹${worker.daily_rate}`,
        `💰 Basic Wage: ₹${stats.basicPay.toFixed(2)}`,
        `⏰ OT Pay: ₹${stats.otPay.toFixed(2)}`,
        `➖ Advances: ₹${stats.advances.toFixed(2)}`,
        `─────────────────────`,
        `✅ *Net Payable: ₹${stats.netPayable.toFixed(2)}*`,
        `─────────────────────`,
        `Powered by SiteBuild ERP 🏗️`
    ].join('\n');

    document.getElementById('copySlipBtn').onclick = () => {
        navigator.clipboard.writeText(msg).then(() => {
            document.getElementById('copySlipBtn').textContent = '✅ Copied!';
            setTimeout(() => { document.getElementById('copySlipBtn').textContent = '📋 Copy Message'; }, 2000);
        });
    };

    document.getElementById('whatsappSlipBtn').onclick = () => {
        const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    };

    document.getElementById('payoutSlipModal').style.display = 'flex';
};

document.getElementById('closeSlipModal').addEventListener('click', () => {
    document.getElementById('payoutSlipModal').style.display = 'none';
});

document.getElementById('payoutSlipModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('payoutSlipModal')) {
        document.getElementById('payoutSlipModal').style.display = 'none';
    }
});

// ── ANALYTICS TAB ──
function getForecastSettings() {
    const key = 'siteSettings_' + state.activeSiteId;
    try { return JSON.parse(localStorage.getItem(key)) || {}; }
    catch { return {}; }
}

function saveForecastSettingsLocal(settings) {
    const key = 'siteSettings_' + state.activeSiteId;
    localStorage.setItem(key, JSON.stringify(settings));
}

function loadForecastSettings() {
    const s = getForecastSettings();
    if (document.getElementById('projectDeadline')) document.getElementById('projectDeadline').value = s.deadline || '';
    if (document.getElementById('projectBudget')) document.getElementById('projectBudget').value = s.budget || '';
    if (document.getElementById('minWorkers')) document.getElementById('minWorkers').value = s.minWorkers || '';
}

document.getElementById('saveForecastSettings').addEventListener('click', async () => {
    const deadline = document.getElementById('projectDeadline').value;
    const budget = parseFloat(document.getElementById('projectBudget').value) || 0;
    const minWorkers = parseInt(document.getElementById('minWorkers').value) || 0;

    saveForecastSettingsLocal({ deadline, budget, minWorkers });

    // Also update site in Supabase
    if (state.activeSiteId) {
        await supabase.from('sites').update({ deadline: deadline || null, budget }).eq('id', state.activeSiteId);
    }

    renderAnalytics();
    renderSiteHealth();
    showMsg(document.createElement('div'), 'Saved!');
    document.getElementById('saveForecastSettings').textContent = '✅ Saved!';
    setTimeout(() => { document.getElementById('saveForecastSettings').textContent = '💾 Save Settings'; }, 2000);
});

function renderAnalytics() {
    renderForecastChart();
    renderLeaderboard();
}

function renderForecastChart() {
    const ctx = document.getElementById('forecastChart');
    if (!ctx) return;

    const settings = getForecastSettings();
    const activeWorkers = state.workers.filter(w => w.is_active);
    const dailyBurn = activeWorkers.reduce((s, w) => s + Number(w.daily_rate), 0);
    const weeklyBurn = dailyBurn * 7;

    document.getElementById('fkpiDailyBurn').textContent = fmtShort(dailyBurn);
    document.getElementById('fkpiWeekly').textContent = fmtShort(weeklyBurn);
    document.getElementById('fkpi4Week').textContent = fmtShort(dailyBurn * 28);

    const budget = settings.budget || 0;
    const allTimePaid = state.payments.reduce((s, p) => s + Number(p.amount), 0) +
        state.advances.reduce((s, a) => s + Number(a.amount), 0);
    const budgetLeft = budget - allTimePaid;
    const budgetEl = document.getElementById('fkpiBudgetLeft');
    budgetEl.textContent = budget ? fmtShort(budgetLeft) : 'N/A';
    budgetEl.style.color = budget && budgetLeft < 0 ? 'var(--danger)' : 'var(--success)';

    // 4-week projection data
    const labels = [];
    const projected = [];
    let cumulative = 0;
    const now = new Date();

    for (let i = 0; i < 28; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        if (i % 7 === 0 || i === 0) {
            labels.push(`Wk ${Math.floor(i / 7) + 1}`);
            projected.push(Math.round(cumulative + dailyBurn * (i === 0 ? 1 : 7)));
        }
        cumulative += dailyBurn;
    }

    if (forecastChartInstance) forecastChartInstance.destroy();

    forecastChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Now', 'Week 1', 'Week 2', 'Week 3', 'Week 4'],
            datasets: [{
                label: 'Projected Cumulative Cost (₹)',
                data: [0, weeklyBurn, weeklyBurn * 2, weeklyBurn * 3, weeklyBurn * 4],
                borderColor: 'rgba(99, 102, 241, 1)',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: 'rgba(99, 102, 241, 1)',
                pointRadius: 5
            }, ...(budget ? [{
                label: 'Budget Threshold',
                data: [budget, budget, budget, budget, budget],
                borderColor: 'rgba(239, 68, 68, 0.8)',
                borderWidth: 2,
                borderDash: [8, 4],
                pointRadius: 0,
                fill: false
            }] : [])]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: darkMode ? '#94a3b8' : '#64748b', font: { family: 'Outfit' } }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ₹${Number(ctx.raw).toLocaleString('en-IN')}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
                    ticks: {
                        color: darkMode ? '#94a3b8' : '#64748b',
                        callback: v => '₹' + (v / 1000).toFixed(0) + 'k'
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: darkMode ? '#94a3b8' : '#64748b' }
                }
            }
        }
    });
}

function renderLeaderboard() {
    const tbody = document.getElementById('leaderboardTbody');
    if (!tbody) return;

    const ranked = state.workers
        .filter(w => w.is_active)
        .map(w => ({ ...w, ...calculateTrustScore(w.id) }))
        .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No active workers yet.</td></tr>';
        return;
    }

    tbody.innerHTML = ranked.map((w, i) => {
        const medals = ['🥇', '🥈', '🥉'];
        const rankDisplay = i < 3 ? medals[i] : `#${i + 1}`;
        const progressPct = Math.round((w.score / 5) * 100);

        return `<tr class="${w.tier === 'elite' ? 'elite-row' : ''}">
            <td><strong>${rankDisplay}</strong></td>
            <td><strong>${esc(w.name)}</strong></td>
            <td>${esc(w.category)}</td>
            <td>
                <div class="progress-bar-wrap">
                    <div class="progress-bar" style="width:${w.punctuality}%; background: ${w.punctuality >= 80 ? 'var(--success)' : w.punctuality >= 60 ? 'var(--warning)' : 'var(--danger)'}"></div>
                </div>
                <span style="font-size:0.78rem; color:var(--text-muted)">${w.punctuality}%</span>
            </td>
            <td>
                <span class="stars" style="color:#f59e0b">${renderStars(w.score)}</span>
                <span style="font-size:0.78rem; color:var(--text-muted); margin-left:4px">${w.score}</span>
            </td>
            <td>${tierBadge(w.tier)}</td>
        </tr>`;
    }).join('');
}

document.getElementById('recalcScoresBtn').addEventListener('click', async () => {
    document.getElementById('recalcScoresBtn').textContent = '⏳ Calculating...';
    // Update scores in Supabase
    for (const w of state.workers) {
        const ts = calculateTrustScore(w.id);
        await supabase.from('workers').update({
            trust_score: ts.score,
            punctuality_rate: ts.punctuality
        }).eq('id', w.id);
    }
    await refreshSiteData();
    renderLeaderboard();
    document.getElementById('recalcScoresBtn').textContent = '✅ Updated!';
    setTimeout(() => { document.getElementById('recalcScoresBtn').textContent = '🔄 Recalculate Scores'; }, 2500);
});

// ── MATERIAL ESTIMATOR ──
document.getElementById('cementBags')?.addEventListener('input', (e) => {
    const bags = parseFloat(e.target.value) || 0;
    const kg = bags * 50; // 1 bag = 50 kg
    const m3 = bags * 0.0347; // 1 bag cement ≈ 0.0347 m³
    document.getElementById('cementM3').textContent = m3.toFixed(3) + ' m³';
    document.getElementById('cementKg').textContent = kg.toFixed(0) + ' kg';
});

document.getElementById('steelKg')?.addEventListener('input', calcSteel);
document.getElementById('steelDia')?.addEventListener('change', calcSteel);

function calcSteel() {
    const kg = parseFloat(document.getElementById('steelKg').value) || 0;
    const dia = parseFloat(document.getElementById('steelDia').value) || 12;
    // Weight per metre = d² / 162 (kg/m formula for steel)
    const weightPerMetre = (dia * dia) / 162;
    const totalLength = kg / weightPerMetre;
    const bars12m = totalLength / 12;
    document.getElementById('steelLength').textContent = totalLength.toFixed(1) + ' m';
    document.getElementById('steelBars').textContent = Math.ceil(bars12m) + ' bars';
}

document.getElementById('concreteM3')?.addEventListener('input', calcConcrete);
document.getElementById('concreteRatio')?.addEventListener('change', calcConcrete);

function calcConcrete() {
    const vol = parseFloat(document.getElementById('concreteM3').value) || 0;
    const ratioStr = document.getElementById('concreteRatio').value;
    const [c, s, a] = ratioStr.split(':').map(Number);
    const total = c + s + a;
    const dryVol = vol * 1.54; // dry volume factor
    const cement = (c / total) * dryVol; // m³
    const cementBags = cement / 0.0347;
    const sand = (s / total) * dryVol;
    const agg = (a / total) * dryVol;
    document.getElementById('concreteCement').textContent = Math.ceil(cementBags) + ' bags';
    document.getElementById('concreteSand').textContent = sand.toFixed(2) + ' m³';
    document.getElementById('concreteAgg').textContent = agg.toFixed(2) + ' m³';
}

// ── EXPORTS ──
function downloadCsv(contents, filename) {
    const blob = new Blob([contents], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

document.getElementById('exportWageLedger')?.addEventListener('click', () => {
    let csv = 'Worker Name,Category,Daily Rate,Days Worked,Overtime Pay,Advances,Total Paid,Net Payable,Trust Score\n';
    state.workers.forEach(w => {
        const stats = calculateWorkerFinancials(w.id, '1970-01-01', '2100-01-01');
        const ts = calculateTrustScore(w.id);
        if (stats.days > 0 || stats.advances > 0 || stats.paid > 0) {
            csv += `"${w.name}","${w.category}",${w.daily_rate},${stats.days},${stats.otPay},${stats.advances},${stats.paid},${stats.netPayable},${ts.score}\n`;
        }
    });
    downloadCsv(csv, `Wage_Ledger_${TODAY}.csv`);
});

document.getElementById('exportMonthlySummary')?.addEventListener('click', () => {
    const now = new Date();
    const mp = now.toISOString().substring(0, 7);
    let csv = 'Worker Name,Month Basic,Month OT,Month Advances,Month Paid,Closing Monthly Due\n';
    state.workers.forEach(w => {
        const stats = calculateWorkerFinancials(w.id, `${mp}-01`, `${mp}-31`);
        if (stats.days > 0 || stats.advances > 0 || stats.paid > 0) {
            csv += `"${w.name}",${stats.basicPay},${stats.otPay},${stats.advances},${stats.paid},${stats.netPayable - stats.paid}\n`;
        }
    });
    downloadCsv(csv, `Monthly_Summary_${mp}.csv`);
});

document.getElementById('exportAttendance')?.addEventListener('click', () => {
    let csv = 'Date,Worker Name,Category,Status,Overtime Hours\n';
    state.attendance.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(a => {
        const w = state.workers.find(wx => wx.id === a.worker_id);
        const name = w ? w.name : 'Unknown';
        const stText = a.status === 1 ? 'Present' : (a.status === 0.5 ? 'Half Day' : 'Absent');
        csv += `"${a.date}","${name}","${w ? w.category : ''}","${stText}",${a.overtime_hours}\n`;
    });
    downloadCsv(csv, `Attendance_Log_${TODAY}.csv`);
});
