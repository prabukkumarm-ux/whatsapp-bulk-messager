// ── CONTACTS PAGE ────────────────────────────
let allContacts = [];
let allGroups = [];

async function loadContactsPage() {
  const el = $('page-contacts');
  el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">Loading…</div>`;
  const [cd, gd] = await Promise.all([api('/api/contacts'), api('/api/contacts/groups/all')]);
  allContacts = cd.contacts || [];
  allGroups = gd.groups || [];
  renderContactsPage();
}

function renderContactsPage() {
  const el = $('page-contacts');
  el.innerHTML = `
    <div class="toolbar">
      <div class="search-bar">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input id="contact-search" placeholder="Search contacts…" oninput="filterContacts(this.value)" />
      </div>
      <div class="spacer"></div>
      <button class="btn btn-secondary" onclick="showImportCSV()">📥 Import CSV</button>
      <button class="btn btn-secondary" onclick="showGroupModal()">📁 New Group</button>
      <button class="btn btn-primary" onclick="showAddContact()">＋ Add Contact</button>
    </div>

    <!-- Groups -->
    ${allGroups.length ? `
    <div style="margin-bottom:20px">
      <div class="section-title" style="margin-bottom:10px">Groups</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${allGroups.map(g => `
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:10px;min-width:150px">
            <span class="group-dot" style="background:${g.color};width:12px;height:12px"></span>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${g.name}</div>
              <div style="font-size:11px;color:var(--text-muted)">${g.contact_count} contacts</div>
            </div>
            <button class="btn btn-sm btn-danger btn-icon" onclick="deleteGroup('${g.id}')" title="Delete group">🗑</button>
          </div>`).join('')}
      </div>
    </div>` : ''}

    <!-- Contacts Table -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">All Contacts <span style="color:var(--text-muted);font-size:13px">(${allContacts.length})</span></span>
        <div class="flex gap-2">
          <select class="form-control" style="width:auto;padding:6px 10px;font-size:13px" onchange="filterByGroup(this.value)">
            <option value="">All Groups</option>
            ${allGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="table-wrap" id="contacts-table-wrap">
        ${renderContactsTable(allContacts)}
      </div>
    </div>`;
}

function renderContactsTable(contacts) {
  if (!contacts.length) return `<div class="empty-state"><div class="empty-icon">👥</div><h3>No contacts yet</h3><p>Add contacts manually or import from CSV</p></div>`;
  return `<table>
    <thead><tr><th>Name</th><th>Phone</th><th>Group</th><th>Notes</th><th>Added</th><th>Actions</th></tr></thead>
    <tbody>${contacts.map(c => `
      <tr>
        <td><div style="display:flex;align-items:center;gap:8px"><span style="width:32px;height:32px;border-radius:50%;background:var(--bg-input);display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:var(--wa-green)">${c.name.charAt(0).toUpperCase()}</span>${c.name}</div></td>
        <td style="font-family:monospace;font-size:13px">${c.phone}</td>
        <td>${c.group_name ? `<span class="badge" style="background:${c.group_color}22;color:${c.group_color}">${c.group_name}</span>` : '<span class="text-muted text-sm">—</span>'}</td>
        <td class="text-sm text-muted">${c.notes || '—'}</td>
        <td class="text-sm text-muted">${timeAgo(c.created_at)}</td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-sm btn-secondary" onclick="showEditContact(${JSON.stringify(c).replace(/"/g,'&quot;')})">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteContact('${c.id}','${c.name}')">Delete</button>
          </div>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function filterContacts(q) {
  const filtered = allContacts.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q));
  $('contacts-table-wrap').innerHTML = renderContactsTable(filtered);
}

function filterByGroup(gid) {
  const filtered = gid ? allContacts.filter(c => c.group_id === gid) : allContacts;
  $('contacts-table-wrap').innerHTML = renderContactsTable(filtered);
}

function showAddContact() {
  showModal('Add Contact', `
    <div class="form-group"><label class="form-label">Name <span class="required">*</span></label><input class="form-control" id="m-name" placeholder="Full name" /></div>
    <div class="form-group"><label class="form-label">Phone Number <span class="required">*</span></label><input class="form-control" id="m-phone" placeholder="e.g. 9876543210 or +919876543210" /></div>
    <div class="form-group"><label class="form-label">Group</label>
      <select class="form-control" id="m-group">
        <option value="">— No Group —</option>
        ${allGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label class="form-label">Notes</label><input class="form-control" id="m-notes" placeholder="Optional note" /></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="addContact()">Add Contact</button>`
  );
}

async function addContact() {
  const name = $('m-name').value.trim();
  const phone = $('m-phone').value.trim();
  if (!name || !phone) { toast('Name and phone required', 'warning'); return; }
  const r = await api('/api/contacts', { method: 'POST', body: JSON.stringify({ name, phone, group_id: $('m-group').value, notes: $('m-notes').value }) });
  if (r.success) { toast('Contact added!', 'success'); closeModal(); loadContactsPage(); }
  else toast(r.error || 'Failed', 'error');
}

function showEditContact(c) {
  showModal('Edit Contact', `
    <div class="form-group"><label class="form-label">Name</label><input class="form-control" id="e-name" value="${c.name}" /></div>
    <div class="form-group"><label class="form-label">Phone</label><input class="form-control" id="e-phone" value="${c.phone}" /></div>
    <div class="form-group"><label class="form-label">Group</label>
      <select class="form-control" id="e-group">
        <option value="">— No Group —</option>
        ${allGroups.map(g => `<option value="${g.id}" ${g.id === c.group_id ? 'selected' : ''}>${g.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label class="form-label">Notes</label><input class="form-control" id="e-notes" value="${c.notes || ''}" /></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="updateContact('${c.id}')">Save Changes</button>`
  );
}

async function updateContact(id) {
  const r = await api(`/api/contacts/${id}`, { method: 'PUT', body: JSON.stringify({ name: $('e-name').value, phone: $('e-phone').value, group_id: $('e-group').value, notes: $('e-notes').value }) });
  if (r.success) { toast('Contact updated!', 'success'); closeModal(); loadContactsPage(); }
  else toast('Failed to update', 'error');
}

async function deleteContact(id, name) {
  if (!confirm(`Delete contact "${name}"?`)) return;
  await api(`/api/contacts/${id}`, { method: 'DELETE' });
  toast('Contact deleted', 'info'); loadContactsPage();
}

async function deleteGroup(id) {
  if (!confirm('Delete this group? Contacts will be unassigned.')) return;
  await api(`/api/contacts/groups/${id}`, { method: 'DELETE' });
  toast('Group deleted', 'info'); loadContactsPage();
}

function showGroupModal() {
  const colors = ['#25d366','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#ec4899','#06b6d4'];
  showModal('Create Group', `
    <div class="form-group"><label class="form-label">Group Name <span class="required">*</span></label><input class="form-control" id="g-name" placeholder="e.g. Premium Customers" /></div>
    <div class="form-group"><label class="form-label">Description</label><input class="form-control" id="g-desc" placeholder="Optional" /></div>
    <div class="form-group"><label class="form-label">Color</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
        ${colors.map((c, i) => `<label style="cursor:pointer"><input type="radio" name="g-color" value="${c}" ${i===0?'checked':''} style="display:none"/><span style="display:block;width:28px;height:28px;border-radius:50%;background:${c};border:3px solid ${i===0?'white':'transparent'}"></span></label>`).join('')}
      </div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="createGroup()">Create Group</button>`
  );
}

async function createGroup() {
  const name = $('g-name').value.trim();
  if (!name) { toast('Group name required', 'warning'); return; }
  const color = document.querySelector('input[name=g-color]:checked')?.value || '#25d366';
  const r = await api('/api/contacts/groups', { method: 'POST', body: JSON.stringify({ name, description: $('g-desc').value, color }) });
  if (r.success) { toast('Group created!', 'success'); closeModal(); loadContactsPage(); }
}

window.switchImportTab = function(type) {
  if (type === 'file') {
    $('tab-file').classList.add('active'); $('tab-paste').classList.remove('active');
    $('import-file-area').style.display = 'block'; $('import-paste-area').style.display = 'none';
  } else {
    $('tab-paste').classList.add('active'); $('tab-file').classList.remove('active');
    $('import-paste-area').style.display = 'block'; $('import-file-area').style.display = 'none';
  }
}

function showImportCSV() {
  showModal('Import Contacts', `
    <div class="tabs" style="margin-bottom:16px auto;display:flex;justify-content:center;background:var(--bg-input);padding:4px;border-radius:10px;width:fit-content;">
      <button class="tab active" id="tab-file" onclick="switchImportTab('file')">📂 Upload File</button>
      <button class="tab" id="tab-paste" onclick="switchImportTab('paste')">📋 Copy & Paste</button>
    </div>

    <div style="background:var(--bg-input);border-radius:10px;padding:12px;margin-bottom:16px;font-size:13px;color:var(--text-secondary);text-align:center">
      We expect two columns: <strong style="color:var(--text-primary)">Name</strong> and <strong style="color:var(--text-primary)">Phone</strong>
    </div>

    <div class="form-group"><label class="form-label">Assign to Group (optional)</label>
      <select class="form-control" id="csv-group">
        <option value="">— No Group —</option>
        ${allGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
      </select>
    </div>

    <div id="import-file-area">
      <div class="form-group"><label class="form-label">Excel or CSV File <span class="required">*</span></label>
        <input type="file" class="form-control" id="csv-file" accept=".csv,.txt,.xlsx,.xls" />
      </div>
    </div>

    <div id="import-paste-area" style="display:none">
      <div class="form-group"><label class="form-label">Paste from Google Sheets / Excel <span class="required">*</span></label>
        <textarea class="form-control" id="paste-text" style="min-height:160px;white-space:pre" placeholder="Rahul Sharma   9876543210&#10;Priya Patel    9876543211"></textarea>
      </div>
    </div>
    `,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="importCSV()">Import Contacts</button>`
  );
}

async function importCSV() {
  const isPaste = $('tab-paste').classList.contains('active');
  const group_id = $('csv-group').value || '';
  
  if (isPaste) {
    const text = $('paste-text').value;
    if (!text.trim()) { toast('Please paste your contacts', 'warning'); return; }
    
    const r = await api('/api/contacts/import-text', { method: 'POST', body: JSON.stringify({ text, group_id }) });
    if (r.success) { toast(`✅ Imported ${r.imported} contacts${r.failed ? `, ${r.failed} rows skipped` : ''}`, 'success'); closeModal(); loadContactsPage(); }
    else toast(r.error || 'Import failed', 'error');
    
  } else {
    const file = $('csv-file').files[0];
    if (!file) { toast('Please select an Excel or CSV file', 'warning'); return; }
    const form = new FormData();
    form.append('file', file);
    form.append('group_id', group_id);
    const r = await fetch('/api/contacts/import-csv', { method: 'POST', body: form }).then(x => x.json());
    if (r.success) { toast(`✅ Imported ${r.imported} contacts${r.failed ? `, ${r.failed} failed` : ''}`, 'success'); closeModal(); loadContactsPage(); }
    else toast(r.error || 'Import failed', 'error');
  }
}

// ── TEMPLATES PAGE ───────────────────────────
async function loadTemplatesPage() {
  const el = $('page-templates');
  el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">Loading…</div>`;
  const data = await api('/api/templates');
  const cats = [...new Set(data.templates.map(t => t.category))];

  el.innerHTML = `
    <div class="toolbar">
      <div class="section-title">Message Templates</div>
      <div class="spacer"></div>
      <button class="btn btn-primary" onclick="showAddTemplate()">＋ New Template</button>
    </div>
    ${!data.templates.length ? `<div class="empty-state"><div class="empty-icon">📝</div><h3>No templates yet</h3><p>Create reusable message templates to save time</p><button class="btn btn-primary" onclick="showAddTemplate()">Create Template</button></div>` :
    `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">
      ${data.templates.map(t => `
        <div class="card" style="transition:all 0.2s" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
          <div class="card-body">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
              <div>
                <div style="font-size:15px;font-weight:700;color:var(--text-primary)">${t.title}</div>
                <span class="badge badge-blue" style="margin-top:5px">${t.category}</span>
              </div>
              <div class="flex gap-2">
                <button class="btn btn-sm btn-secondary" onclick="showEditTemplate(${JSON.stringify(t).replace(/"/g,'&quot;')})">Edit</button>
                <button class="btn btn-sm btn-danger btn-icon" onclick="deleteTemplate('${t.id}')">🗑</button>
              </div>
            </div>
            <div style="background:var(--bg-input);border-radius:10px;padding:12px;font-size:13px;color:var(--text-secondary);white-space:pre-wrap;max-height:100px;overflow:hidden;line-height:1.6">${t.message}</div>
            <button class="btn btn-outline-green btn-sm w-full" style="margin-top:12px;width:100%;justify-content:center" onclick="copyTemplate('${encodeURIComponent(t.message)}')">📋 Copy Message</button>
          </div>
        </div>`).join('')}
    </div>`}`;
}

function showAddTemplate() {
  showModal('New Template', `
    <div class="form-group"><label class="form-label">Title <span class="required">*</span></label><input class="form-control" id="t-title" placeholder="e.g. Festival Offer" /></div>
    <div class="form-group"><label class="form-label">Category</label>
      <select class="form-control" id="t-cat">
        <option value="general">General</option>
        <option value="offer">Offer/Sale</option>
        <option value="reminder">Reminder</option>
        <option value="greeting">Greeting</option>
        <option value="follow-up">Follow-up</option>
        <option value="advertisement">Advertisement</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Message <span class="required">*</span></label>
      <textarea class="form-control" id="t-msg" style="min-height:150px" placeholder="Write your template message here…&#10;&#10;Tip: Use *bold*, _italic_ for formatting"></textarea>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="addTemplate()">Save Template</button>`
  );
}

async function addTemplate() {
  const title = $('t-title').value.trim();
  const message = $('t-msg').value.trim();
  if (!title || !message) { toast('Title and message required', 'warning'); return; }
  const r = await api('/api/templates', { method: 'POST', body: JSON.stringify({ title, message, category: $('t-cat').value }) });
  if (r.success) { toast('Template saved!', 'success'); closeModal(); loadTemplatesPage(); }
}

function showEditTemplate(t) {
  showModal('Edit Template', `
    <div class="form-group"><label class="form-label">Title</label><input class="form-control" id="et-title" value="${t.title}" /></div>
    <div class="form-group"><label class="form-label">Category</label>
      <select class="form-control" id="et-cat">
        ${['general','offer','reminder','greeting','follow-up','advertisement'].map(c => `<option value="${c}" ${c===t.category?'selected':''}>${c}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label class="form-label">Message</label>
      <textarea class="form-control" id="et-msg" style="min-height:150px">${t.message}</textarea>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="updateTemplate('${t.id}')">Save Changes</button>`
  );
}

async function updateTemplate(id) {
  const r = await api(`/api/templates/${id}`, { method: 'PUT', body: JSON.stringify({ title: $('et-title').value, message: $('et-msg').value, category: $('et-cat').value }) });
  if (r.success) { toast('Template updated!', 'success'); closeModal(); loadTemplatesPage(); }
}

async function deleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  await api(`/api/templates/${id}`, { method: 'DELETE' });
  toast('Template deleted', 'info'); loadTemplatesPage();
}

function copyTemplate(encoded) {
  navigator.clipboard.writeText(decodeURIComponent(encoded));
  toast('Message copied to clipboard!', 'success');
}

// ── INIT ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  connectSSE();
  navigate('dashboard');

  // Preload connect page trigger on status badge click
  $('wa-status-badge').addEventListener('click', () => navigate('connect'));
  $('wa-chip').addEventListener('click', () => navigate('connect'));
});
