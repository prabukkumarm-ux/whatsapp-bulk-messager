// ── CAMPAIGNS PAGE ───────────────────────────
async function loadCampaignsPage() {
  const el = $('page-campaigns');
  el.innerHTML = `<div class="toolbar"><div class="section-title">All Campaigns</div><div class="spacer"></div><button class="btn btn-primary" onclick="navigate('compose')">＋ New Campaign</button></div><div id="campaigns-list"><div style="text-align:center;padding:40px;color:var(--text-muted)">Loading…</div></div>`;
  const data = await api('/api/campaigns');
  const list = $('campaigns-list');
  if (!data.campaigns || !data.campaigns.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><h3>No campaigns yet</h3><p>Create your first bulk message campaign</p><button class="btn btn-primary" onclick="navigate('compose')">Create Campaign</button></div>`;
    return;
  }
  list.innerHTML = `<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Name</th><th>Status</th><th>Total</th><th>Sent</th><th>Failed</th><th>Delay</th><th>Created</th><th>Actions</th></tr></thead>
    <tbody>${data.campaigns.map(c => `
      <tr>
        <td>${c.name}</td>
        <td>${statusBadge(c.status)}</td>
        <td>${fmt(c.total_contacts)}</td>
        <td><span class="text-green font-bold">${fmt(c.sent_count)}</span></td>
        <td>${c.failed_count > 0 ? `<span style="color:#ef4444">${fmt(c.failed_count)}</span>` : '<span style="color:var(--text-muted)">0</span>'}</td>
        <td class="text-sm text-muted">${c.delay_seconds}s</td>
        <td class="text-sm text-muted">${timeAgo(c.created_at)}</td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-sm btn-secondary" onclick="viewCampaign('${c.id}')">View</button>
            ${c.status === 'draft' ? `<button class="btn btn-sm btn-primary" onclick="sendCampaign('${c.id}')">Send</button>` : ''}
            ${c.status === 'running' ? `<button class="btn btn-sm btn-danger" onclick="cancelCampaign('${c.id}')">Cancel</button>` : ''}
            <button class="btn btn-sm btn-danger btn-icon" onclick="deleteCampaign('${c.id}')" title="Delete">🗑</button>
          </div>
        </td>
      </tr>`).join('')}
    </tbody>
  </table></div></div>`;

  // Auto-refresh if any running
  if (data.campaigns.some(c => c.status === 'running')) {
    setTimeout(loadCampaignsPage, 4000);
  }
}

async function viewCampaign(id) {
  const data = await api(`/api/campaigns/${id}`);
  const c = data.campaign;
  const pct = c.total_contacts > 0 ? Math.round(((c.sent_count + c.failed_count) / c.total_contacts) * 100) : 0;
  showModal(`📋 ${c.name}`, `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px">
      <div style="background:var(--bg-input);border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:24px;font-weight:700;color:var(--wa-green)">${fmt(c.sent_count)}</div>
        <div style="font-size:12px;color:var(--text-muted)">Sent</div>
      </div>
      <div style="background:var(--bg-input);border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:24px;font-weight:700;color:#ef4444">${fmt(c.failed_count)}</div>
        <div style="font-size:12px;color:var(--text-muted)">Failed</div>
      </div>
    </div>
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;color:var(--text-secondary)">
        <span>Progress</span><span>${pct}% (${c.sent_count + c.failed_count} / ${c.total_contacts})</span>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
    </div>
    <div style="background:var(--bg-input);border-radius:10px;padding:14px;margin-bottom:16px">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Message</div>
      <div style="font-size:13px;color:var(--text-primary);white-space:pre-wrap">${c.message}</div>
    </div>
    <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">Delivery Log (last 20)</div>
    <div style="max-height:220px;overflow-y:auto">
      ${data.logs.slice(0, 20).map(l => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <span>${l.status === 'sent' ? '✅' : '❌'}</span>
          <span style="flex:1;font-size:13px;color:var(--text-primary)">${l.contact_name || l.phone}</span>
          <span style="font-size:12px;color:var(--text-muted)">${l.phone}</span>
        </div>`).join('') || '<div style="text-align:center;padding:20px;color:var(--text-muted)">No logs yet</div>'}
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`
  );
}

async function sendCampaign(id) {
  if (waStatus !== 'ready') {
    toast('WhatsApp not connected! Please connect first.', 'error');
    navigate('connect');
    return;
  }
  if (!confirm('Start sending this campaign now?')) return;
  const r = await api(`/api/campaigns/${id}/send`, { method: 'POST' });
  if (r.success) { toast(`🚀 Campaign started! Sending to ${r.total} contacts.`, 'success'); loadCampaignsPage(); }
  else toast(r.error || 'Failed to start campaign', 'error');
}

async function cancelCampaign(id) {
  if (!confirm('Cancel this campaign?')) return;
  await api(`/api/campaigns/${id}/cancel`, { method: 'POST' });
  toast('Campaign cancelled', 'warning');
  loadCampaignsPage();
}

async function deleteCampaign(id) {
  if (!confirm('Delete this campaign permanently?')) return;
  await api(`/api/campaigns/${id}`, { method: 'DELETE' });
  toast('Campaign deleted', 'info');
  loadCampaignsPage();
}

// ── COMPOSE PAGE ─────────────────────────────
let selectedContactIds = new Set();
let selectedGroupIds = new Set();
let mediaFiles = [];

async function loadComposePage() {
  const el = $('page-compose');
  el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">Loading…</div>`;

  const [contactsData, groupsData, templatesData] = await Promise.all([
    api('/api/contacts'), api('/api/contacts/groups/all'), api('/api/templates')
  ]);

  selectedContactIds = new Set();
  selectedGroupIds = new Set();
  mediaFiles = [];

  el.innerHTML = `
  <div class="compose-grid">
    <div>
      <!-- Campaign Details -->
      <div class="card mb-4" style="margin-bottom:20px">
        <div class="card-header"><span class="card-title">📋 Campaign Details</span></div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">Campaign Name <span class="required">*</span></label>
            <input class="form-control" id="cp-name" placeholder="e.g. Diwali Sale Offer 2024" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Delay Between Messages</label>
              <select class="form-control" id="cp-delay">
                <option value="2">2 seconds (Fast)</option>
                <option value="3" selected>3 seconds (Recommended)</option>
                <option value="5">5 seconds (Safe)</option>
                <option value="8">8 seconds (Very Safe)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Use Template</label>
              <select class="form-control" id="cp-template" onchange="applyTemplate(this.value)">
                <option value="">— Select Template —</option>
                ${templatesData.templates.map(t => `<option value="${t.message}">${t.title}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Message -->
      <div class="card mb-4" style="margin-bottom:20px">
        <div class="card-header"><span class="card-title">✍️ Message</span></div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">Message Text <span class="required">*</span></label>
            <textarea class="form-control" id="cp-message" placeholder="Type your WhatsApp message here…&#10;&#10;Supports *bold*, _italic_, ~strikethrough~" oninput="updatePreview();updateCharCount()"></textarea>
            <div class="char-counter"><span id="char-count">0</span> / 4096 characters</div>
          </div>

          <!-- Emoji shortcuts -->
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
            ${['👋','🎉','🛒','💰','🔥','📞','⏰','✅','🎁','📣'].map(e => `<button type="button" style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:5px 8px;cursor:pointer;font-size:16px;color:white" onclick="insertEmoji('${e}')">${e}</button>`).join('')}
          </div>

          <!-- Media Upload -->
          <label class="form-label">Attach Media (Images/PDFs — max 10 files)</label>
          <div class="file-drop" id="file-drop" onclick="$('media-input').click()" ondragover="e=>{e.preventDefault();$('file-drop').classList.add('drag-over')}" ondragleave="$('file-drop').classList.remove('drag-over')" ondrop="handleDrop(event)">
            <div class="file-drop-icon">📎</div>
            <div class="file-drop-text"><strong>Click to upload</strong> or drag & drop</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">JPG, PNG, GIF, WebP, PDF — Max 16MB each</div>
            <input type="file" id="media-input" multiple accept="image/*,.pdf" onchange="handleMediaFiles(this.files)" />
          </div>
          <div class="file-preview-grid" id="file-preview"></div>
        </div>
      </div>

      <!-- Contacts Selector -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">👥 Select Recipients</span>
          <span style="font-size:12px;color:var(--text-muted)">Max 100</span>
        </div>
        <div class="card-body">
          <!-- Groups -->
          ${groupsData.groups.length ? `
          <div style="margin-bottom:16px">
            <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">Select by Group</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              ${groupsData.groups.map(g => `
                <button type="button" class="group-pill" id="gpill-${g.id}" data-id="${g.id}" data-count="${g.contact_count}"
                  style="background:var(--bg-input);border:1px solid var(--border);border-radius:30px;padding:7px 14px;cursor:pointer;font-size:13px;color:var(--text-secondary);transition:all 0.2s;display:flex;align-items:center;gap:6px"
                  onclick="toggleGroup('${g.id}', ${g.contact_count})">
                  <span class="group-dot" style="background:${g.color}"></span>
                  ${g.name} <span style="color:var(--text-muted)">(${g.contact_count})</span>
                </button>`).join('')}
            </div>
          </div>` : ''}

          <!-- Individual contacts -->
          <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">Or Select Individual Contacts</div>
          <div style="margin-bottom:10px">
            <input class="form-control" style="max-width:300px" placeholder="🔍  Search contacts…" oninput="filterContactPicker(this.value)" />
          </div>
          <div class="contacts-selector">
            <div class="contacts-selector-header">
              <span>Contacts</span>
              <div style="display:flex;align-items:center;gap:8px">
                <span class="contacts-selector-count" id="sel-count">0</span>
                <button class="btn btn-sm btn-secondary" onclick="selectAllContacts()">All</button>
                <button class="btn btn-sm btn-secondary" onclick="clearAllContacts()">Clear</button>
              </div>
            </div>
            <div class="contacts-selector-list" id="contact-picker">
              ${contactsData.contacts.length ? contactsData.contacts.map(c => `
                <div class="contact-check-item" data-name="${c.name.toLowerCase()}" data-phone="${c.phone}">
                  <input type="checkbox" id="cp-c-${c.id}" value="${c.id}" onchange="toggleContact('${c.id}', this.checked)" />
                  <label for="cp-c-${c.id}" style="flex:1;cursor:pointer">
                    <div style="font-size:13.5px;font-weight:500;color:var(--text-primary)">${c.name}</div>
                    <div style="font-size:12px;color:var(--text-muted)">${c.phone}</div>
                  </label>
                </div>`).join('') : `<div style="text-align:center;padding:30px;color:var(--text-muted)">No contacts. <a href="#" onclick="navigate('contacts')" style="color:var(--wa-green)">Add contacts first →</a></div>`}
            </div>
          </div>
          <div style="margin-top:10px;font-size:12px;color:var(--text-muted)">⚠️ Maximum 100 recipients per campaign.</div>
        </div>
      </div>

      <div style="margin-top:20px;display:flex;gap:12px">
        <button class="btn btn-primary btn-lg" onclick="submitCampaign()">🚀 Create & Send Campaign</button>
        <button class="btn btn-secondary btn-lg" onclick="saveDraftCampaign()">💾 Save as Draft</button>
      </div>
    </div>

    <!-- Preview Panel -->
    <div>
      <div class="preview-phone">
        <div class="preview-phone-bar">
          <svg width="18" height="18" fill="white" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          <span class="preview-phone-bar-name">Customer</span>
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.15)"/><path d="M8 12h8M12 8v8" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <div class="preview-phone-chat">
          <div style="font-size:11px;text-align:center;color:#8696a0;margin-bottom:10px">TODAY</div>
          <div class="preview-bubble" id="preview-text">Your message will appear here…</div>
          <div class="preview-bubble-time">12:00 PM ✓✓</div>
          <div id="preview-media"></div>
        </div>
        <div style="padding:12px 16px;border-top:1px solid var(--border)">
          <div style="font-size:12px;color:var(--text-muted);text-align:center" id="sel-summary">0 recipients selected</div>
        </div>
      </div>
      <div style="margin-top:14px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">📊 Estimated Send Time</div>
        <div id="est-time" style="font-size:15px;font-weight:700;color:var(--text-primary)">—</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Based on delay setting</div>
      </div>
    </div>
  </div>`;
}

function applyTemplate(msg) {
  if (!msg) return;
  const ta = $('cp-message');
  ta.value = msg;
  updatePreview(); updateCharCount();
}

function insertEmoji(e) {
  const ta = $('cp-message');
  const pos = ta.selectionStart;
  ta.value = ta.value.slice(0, pos) + e + ta.value.slice(pos);
  ta.selectionStart = ta.selectionEnd = pos + e.length;
  ta.focus();
  updatePreview(); updateCharCount();
}

function updateCharCount() {
  const len = ($('cp-message')?.value || '').length;
  const el = $('char-count');
  if (el) { el.textContent = len; el.style.color = len > 3800 ? '#ef4444' : 'var(--text-muted)'; }
}

function updatePreview() {
  const msg = $('cp-message')?.value || '';
  const el = $('preview-text');
  if (el) el.textContent = msg || 'Your message will appear here…';
  updateEstTime();
}

function updateEstTime() {
  const total = selectedContactIds.size + (getGroupContactCount());
  const delay = parseInt($('cp-delay')?.value || 3);
  const secs = total * delay;
  const el = $('est-time');
  if (!el) return;
  if (total === 0) { el.textContent = '—'; return; }
  if (secs < 60) el.textContent = `~${secs}s for ${total} contacts`;
  else el.textContent = `~${Math.ceil(secs / 60)}min for ${total} contacts`;

  const ss = $('sel-summary');
  if (ss) ss.textContent = `${Math.min(total, 100)} recipients selected`;
  const sc = $('sel-count');
  if (sc) sc.textContent = Math.min(total, 100);
}

function getGroupContactCount() {
  let count = 0;
  selectedGroupIds.forEach(id => {
    const pill = document.querySelector(`[data-id="${id}"]`);
    if (pill) count += parseInt(pill.dataset.count || 0);
  });
  return count;
}

function toggleContact(id, checked) {
  if (checked) selectedContactIds.add(id); else selectedContactIds.delete(id);
  updateEstTime();
}

function toggleGroup(id, count) {
  const pill = $(`gpill-${id}`);
  if (selectedGroupIds.has(id)) {
    selectedGroupIds.delete(id);
    if (pill) { pill.style.background = 'var(--bg-input)'; pill.style.borderColor = 'var(--border)'; pill.style.color = 'var(--text-secondary)'; }
  } else {
    selectedGroupIds.add(id);
    if (pill) { pill.style.background = 'var(--wa-green-dim)'; pill.style.borderColor = 'rgba(37,211,102,0.4)'; pill.style.color = 'var(--wa-green)'; }
  }
  updateEstTime();
}

function selectAllContacts() {
  document.querySelectorAll('#contact-picker input[type=checkbox]').forEach(cb => {
    cb.checked = true; selectedContactIds.add(cb.value);
  });
  updateEstTime();
}
function clearAllContacts() {
  document.querySelectorAll('#contact-picker input[type=checkbox]').forEach(cb => {
    cb.checked = false;
  });
  selectedContactIds.clear(); selectedGroupIds.clear();
  document.querySelectorAll('.group-pill').forEach(p => {
    p.style.background = 'var(--bg-input)'; p.style.borderColor = 'var(--border)'; p.style.color = 'var(--text-secondary)';
  });
  updateEstTime();
}

function filterContactPicker(q) {
  document.querySelectorAll('#contact-picker .contact-check-item').forEach(item => {
    const match = item.dataset.name.includes(q.toLowerCase()) || item.dataset.phone.includes(q);
    item.style.display = match ? 'flex' : 'none';
  });
}

function handleMediaFiles(files) {
  for (const file of Array.from(files)) {
    if (mediaFiles.length >= 10) { toast('Maximum 10 media files allowed', 'warning'); break; }
    mediaFiles.push(file);
  }
  renderMediaPreview();
}

function handleDrop(e) {
  e.preventDefault();
  $('file-drop').classList.remove('drag-over');
  handleMediaFiles(e.dataTransfer.files);
}

function renderMediaPreview() {
  const grid = $('file-preview');
  if (!grid) return;
  grid.innerHTML = mediaFiles.map((f, i) => {
    const isImg = f.type.startsWith('image/');
    return `<div class="file-preview-item">
      ${isImg ? `<img src="${URL.createObjectURL(f)}" alt="preview"/>` : `<span class="file-type">📄</span>`}
      <button class="file-remove" onclick="removeMedia(${i})">✕</button>
    </div>`;
  }).join('');

  const pm = $('preview-media');
  if (pm) pm.innerHTML = mediaFiles.length ? `<div style="background:rgba(37,211,102,0.1);border-radius:8px;padding:8px;margin-top:6px;font-size:12px;color:var(--wa-green)">📎 ${mediaFiles.length} file(s) attached</div>` : '';
}

function removeMedia(i) { mediaFiles.splice(i, 1); renderMediaPreview(); }

async function submitCampaign(draft = false) {
  const name = $('cp-name')?.value?.trim();
  const message = $('cp-message')?.value?.trim();
  if (!name) { toast('Please enter a campaign name', 'warning'); return; }
  if (!message) { toast('Please enter a message', 'warning'); return; }

  const totalSel = selectedContactIds.size + getGroupContactCount();
  if (totalSel === 0) { toast('Please select at least one contact or group', 'warning'); return; }

  if (!draft && waStatus !== 'ready') {
    toast('WhatsApp not connected! Connect first or save as draft.', 'error'); navigate('connect'); return;
  }

  const formData = new FormData();
  formData.append('name', name);
  formData.append('message', message);
  formData.append('contact_ids', JSON.stringify([...selectedContactIds]));
  formData.append('group_ids', JSON.stringify([...selectedGroupIds]));
  formData.append('delay_seconds', $('cp-delay')?.value || '3');
  formData.append('status', draft ? 'draft' : 'ready');
  mediaFiles.forEach(f => formData.append('media', f));

  const res = await fetch('/api/campaigns', { 
    method: 'POST', 
    body: formData,
    headers: {
      ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
    }
  });
  const data = await res.json();
  if (!data.success) { toast(data.error || 'Failed to create campaign', 'error'); return; }

  toast(`Campaign created! ${data.total} contacts.`, 'success');

  if (!draft) {
    const send = await api(`/api/campaigns/${data.id}/send`, { 
      method: 'POST',
      body: JSON.stringify({ contacts: data.contacts })
    });
    if (send.success) { toast(`🚀 Sending to ${send.total || data.total} contacts!`, 'success'); navigate('campaigns'); }
    else toast(send.error || 'Failed to start sending', 'error');
  } else {
    navigate('campaigns');
  }
}

function saveDraftCampaign() { submitCampaign(true); }
