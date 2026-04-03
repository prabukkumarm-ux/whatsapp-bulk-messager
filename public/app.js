/* =============================================
   WaBlast Pro — Frontend SPA
   ============================================= */

const API = '';

// ── Utility helpers ──────────────────────────
const $ = id => document.getElementById(id);
const qs = sel => document.querySelector(sel);
const fmt = n => Number(n || 0).toLocaleString();

function toast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-msg">${msg}</span>`;
  $('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function showModal(title, bodyHTML, footerHTML = '') {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = bodyHTML;
  $('modal-footer').innerHTML = footerHTML;
  $('modal-overlay').classList.add('open');
}
function closeModal() { $('modal-overlay').classList.remove('open'); }
$('modal-close').addEventListener('click', closeModal);
$('modal-overlay').addEventListener('click', e => { if (e.target === $('modal-overlay')) closeModal(); });

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  return res.json();
}

function statusBadge(status) {
  const map = {
    draft: 'badge-gray', running: 'badge-blue', completed: 'badge-green',
    failed: 'badge-red', cancelled: 'badge-orange'
  };
  return `<span class="badge ${map[status] || 'badge-gray'}">${status}</span>`;
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Navigation ───────────────────────────────
let currentPage = 'dashboard';
const pages = ['dashboard', 'connect', 'campaigns', 'compose', 'contacts', 'templates'];
const pageTitles = {
  dashboard: 'Dashboard', connect: 'Connect WhatsApp',
  campaigns: 'Campaigns', compose: 'New Campaign',
  contacts: 'Contacts', templates: 'Message Templates'
};

function navigate(page) {
  if (!pages.includes(page)) return;
  pages.forEach(p => {
    $(`page-${p}`).classList.remove('active');
    $(`nav-${p}`)?.classList.remove('active');
  });
  $(`page-${page}`).classList.add('active');
  $(`nav-${page}`)?.classList.add('active');
  $('page-title').textContent = pageTitles[page];
  currentPage = page;
  loadPage(page);
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigate(item.dataset.page);
  });
});

$('menu-toggle').addEventListener('click', () => {
  $('sidebar').classList.toggle('open');
});

function loadPage(page) {
  if (page === 'dashboard') loadDashboard();
  else if (page === 'connect') loadConnectPage();
  else if (page === 'campaigns') loadCampaignsPage();
  else if (page === 'compose') loadComposePage();
  else if (page === 'contacts') loadContactsPage();
  else if (page === 'templates') loadTemplatesPage();
}

// ── WhatsApp Status Polling ──────────────────
let waStatus = 'disconnected';
let waInfo = null;
let sseSource = null;

function connectSSE() {
  if (sseSource) sseSource.close();
  sseSource = new EventSource('/api/whatsapp/qr-stream');
  sseSource.onmessage = e => {
    const data = JSON.parse(e.data);
    updateWAStatus(data);
  };
  sseSource.onerror = () => {
    setTimeout(connectSSE, 3000);
  };
}

function updateWAStatus(data) {
  waStatus = data.status;
  waInfo = data.info || null;

  const dot = $('status-dot');
  const txt = $('status-text');
  const chipDot = $('chip-dot');
  const chipTxt = $('chip-text');
  const badge = $('connect-badge');
  const connInfo = $('connected-info');

  dot.className = 'status-dot';
  chipDot.className = 'chip-dot';

  if (data.status === 'ready') {
    dot.classList.add('connected');
    chipDot.classList.add('connected');
    txt.textContent = 'Connected';
    chipTxt.textContent = waInfo?.name ? `📱 ${waInfo.name}` : 'Connected';
    badge && (badge.style.display = 'none');
    connInfo.style.display = 'flex';
    $('ci-name').textContent = waInfo?.name || 'WhatsApp';
    $('ci-phone').textContent = waInfo?.phone ? `+${waInfo.phone}` : '';
  } else if (data.status === 'qr') {
    dot.classList.add('qr');
    txt.textContent = 'Scan QR';
    chipTxt.textContent = 'Scan QR Code';
    badge && (badge.style.display = 'flex');
    connInfo.style.display = 'none';
    if (currentPage === 'connect') updateQRDisplay(data.qr);
  } else if (data.status === 'connecting') {
    dot.classList.add('connecting');
    txt.textContent = 'Connecting…';
    chipTxt.textContent = 'Connecting…';
    connInfo.style.display = 'none';
  } else {
    txt.textContent = 'Disconnected';
    chipTxt.textContent = 'Disconnected';
    badge && (badge.style.display = 'flex');
    connInfo.style.display = 'none';
  }

  if (currentPage === 'connect') refreshConnectPage(data);
}

// ── DASHBOARD ────────────────────────────────
async function loadDashboard() {
  const el = $('page-dashboard');
  el.innerHTML = `<div class="empty-state"><div class="spinner" style="width:36px;height:36px;border:3px solid #1e2d45;border-top-color:#25d366;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 12px"></div><p>Loading dashboard…</p></div>`;
  const data = await api('/api/campaigns/stats');
  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card" style="--color-a:#25d366;--color-b:#128c7e">
        <div class="stat-icon" style="background:rgba(37,211,102,0.12)">📬</div>
        <div class="stat-value">${fmt(data.totalMessagesSent)}</div>
        <div class="stat-label">Messages Sent</div>
      </div>
      <div class="stat-card" style="--color-a:#3b82f6;--color-b:#6366f1">
        <div class="stat-icon" style="background:rgba(59,130,246,0.12)">📋</div>
        <div class="stat-value">${fmt(data.totalCampaigns)}</div>
        <div class="stat-label">Total Campaigns</div>
      </div>
      <div class="stat-card" style="--color-a:#8b5cf6;--color-b:#ec4899">
        <div class="stat-icon" style="background:rgba(139,92,246,0.12)">👥</div>
        <div class="stat-value">${fmt(data.totalContacts)}</div>
        <div class="stat-label">Total Contacts</div>
      </div>
      <div class="stat-card" style="--color-a:#f59e0b;--color-b:#ef4444">
        <div class="stat-icon" style="background:rgba(245,158,11,0.12)">✅</div>
        <div class="stat-value">${fmt(data.completedCampaigns)}</div>
        <div class="stat-label">Completed</div>
      </div>
    </div>

    <div class="section-header">
      <span class="section-title">Recent Campaigns</span>
      <button class="btn btn-sm btn-outline-green" onclick="navigate('campaigns')">View All</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Campaign</th><th>Status</th><th>Sent</th><th>Failed</th><th>Created</th></tr></thead>
          <tbody>
            ${data.recentCampaigns.length ? data.recentCampaigns.map(c => `
              <tr>
                <td>${c.name}</td>
                <td>${statusBadge(c.status)}</td>
                <td><span class="text-green">${fmt(c.sent_count)}</span></td>
                <td>${c.failed_count > 0 ? `<span style="color:#ef4444">${c.failed_count}</span>` : '0'}</td>
                <td class="text-sm text-muted">${timeAgo(c.created_at)}</td>
              </tr>`).join('') : `<tr><td colspan="5"><div class="empty-state" style="padding:30px"><div class="empty-icon">📭</div><p>No campaigns yet. <a href="#" onclick="navigate('compose')" style="color:var(--wa-green)">Create one →</a></p></div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div style="margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:18px">
      <div class="card" style="cursor:pointer" onclick="navigate('compose')">
        <div class="card-body" style="text-align:center;padding:28px">
          <div style="font-size:36px;margin-bottom:10px">🚀</div>
          <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:4px">New Campaign</div>
          <div style="font-size:13px;color:var(--text-muted)">Send bulk WhatsApp messages</div>
        </div>
      </div>
      <div class="card" style="cursor:pointer" onclick="navigate('contacts')">
        <div class="card-body" style="text-align:center;padding:28px">
          <div style="font-size:36px;margin-bottom:10px">👥</div>
          <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:4px">Manage Contacts</div>
          <div style="font-size:13px;color:var(--text-muted)">${fmt(data.totalGroups)} groups · ${fmt(data.totalContacts)} contacts</div>
        </div>
      </div>
    </div>`;
}

// ── CONNECT PAGE ─────────────────────────────
let currentQR = null;

function loadConnectPage() {
  refreshConnectPage({ status: waStatus, qr: currentQR, info: waInfo });
}

function updateQRDisplay(qr) {
  currentQR = qr;
  const frame = $('qr-image-frame');
  if (frame && qr) {
    frame.innerHTML = `<img src="${qr}" alt="WhatsApp QR Code" style="width:100%;height:100%"/>`;
  }
}

function refreshConnectPage(data) {
  const el = $('page-connect');
  if (data.status === 'ready') {
    el.innerHTML = `
      <div class="connect-wrapper">
        <div class="qr-card">
          <div style="font-size:56px;margin-bottom:16px">🟢</div>
          <div class="qr-title">WhatsApp Connected!</div>
          <div class="qr-subtitle">Your WhatsApp is active and ready to send messages.</div>
          ${data.info ? `
            <div style="background:var(--wa-green-dim);border:1px solid rgba(37,211,102,0.2);border-radius:12px;padding:16px 20px;margin:20px 0;text-align:left">
              <div style="font-size:13px;color:var(--text-muted);margin-bottom:6px">Connected As</div>
              <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${data.info.name || 'Unknown'}</div>
              <div style="font-size:14px;color:var(--wa-green)">+${data.info.phone || ''}</div>
            </div>` : ''}
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <button class="btn btn-primary btn-lg" onclick="navigate('compose')">🚀 Start Campaign</button>
            <button class="btn btn-danger" onclick="disconnectWA()">Disconnect</button>
          </div>
        </div>
      </div>`;
  } else if (data.status === 'qr') {
    el.innerHTML = `
      <div class="connect-wrapper">
        <div class="qr-card">
          <div class="qr-title">Scan QR Code</div>
          <div class="qr-subtitle">Open WhatsApp on your phone → Linked Devices → Link a Device</div>
          <div class="qr-frame"><div id="qr-image-frame">${data.qr ? `<img src="${data.qr}" style="width:100%;height:100%"/>` : '<div class="qr-placeholder"><div class="spinner"></div><span style="font-size:12px">Generating QR…</span></div>'}</div></div>
          <p style="font-size:12px;color:var(--text-muted);margin-top:8px">QR refreshes automatically. Keep this page open.</p>
        </div>
        ${connectStepsHTML()}
      </div>`;
    currentQR = data.qr;
  } else if (data.status === 'connecting') {
    el.innerHTML = `
      <div class="connect-wrapper">
        <div class="qr-card">
          <div style="font-size:48px;margin-bottom:16px">⏳</div>
          <div class="qr-title">Connecting…</div>
          <div class="qr-subtitle">Please wait while WhatsApp initializes. This may take up to 30 seconds.</div>
          <div class="qr-frame"><div class="qr-placeholder"><div class="spinner"></div><span style="font-size:12px">Initializing…</span></div></div>
        </div>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="connect-wrapper">
        <div class="qr-card">
          <div style="font-size:56px;margin-bottom:16px">📱</div>
          <div class="qr-title">Connect WhatsApp</div>
          <div class="qr-subtitle">Link your WhatsApp account to start sending bulk messages to your customers.</div>
          <button class="btn btn-primary btn-lg" style="margin-bottom:20px" onclick="connectWA()">
            🔗 Connect WhatsApp Now
          </button>
          <p style="font-size:12px;color:var(--text-muted)">Uses WhatsApp Web — free, no API key needed</p>
        </div>
        ${connectStepsHTML()}
      </div>`;
  }
}

function connectStepsHTML() {
  return `
    <div class="qr-steps">
      <div class="qr-steps-title">📋 How to Connect</div>
      <div class="qr-step"><span class="qr-step-num">1</span>Open WhatsApp on your phone</div>
      <div class="qr-step"><span class="qr-step-num">2</span>Tap <strong>⋮ Menu → Linked Devices</strong></div>
      <div class="qr-step"><span class="qr-step-num">3</span>Tap <strong>"Link a Device"</strong></div>
      <div class="qr-step"><span class="qr-step-num">4</span>Scan the QR code shown above</div>
      <div class="qr-step"><span class="qr-step-num">5</span>Wait for the green "Connected" screen 🟢</div>
    </div>`;
}

async function connectWA() {
  await api('/api/whatsapp/connect', { method: 'POST' });
  toast('Connecting to WhatsApp…', 'info');
  refreshConnectPage({ status: 'connecting' });
}

async function disconnectWA() {
  if (!confirm('Disconnect WhatsApp? Your session will be cleared.')) return;
  await api('/api/whatsapp/disconnect', { method: 'POST' });
  toast('WhatsApp disconnected', 'warning');
}
