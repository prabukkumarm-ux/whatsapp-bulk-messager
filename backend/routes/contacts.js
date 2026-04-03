const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { parse } = require('csv-parse/sync');
const multer = require('multer');
const db = require('../database');

const upload = multer({ storage: multer.memoryStorage() });

// GET /api/contacts
router.get('/', (req, res) => {
  const { group_id, search } = req.query;
  const data = db.readDB();
  let contacts = data.contacts;
  
  if (group_id) contacts = contacts.filter(c => c.group_id === group_id);
  if (search) {
    const s = search.toLowerCase();
    contacts = contacts.filter(c => (c.name || '').toLowerCase().includes(s) || (c.phone || '').includes(s));
  }
  
  contacts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  const groupMap = {};
  data.contact_groups.forEach(g => { groupMap[g.id] = g; });
  
  const mapped = contacts.map(c => ({
    ...c,
    group_name: c.group_id && groupMap[c.group_id] ? groupMap[c.group_id].name : null,
    group_color: c.group_id && groupMap[c.group_id] ? groupMap[c.group_id].color : null
  }));

  res.json({ contacts: mapped, total: mapped.length });
});

// POST /api/contacts
router.post('/', (req, res) => {
  const { name, phone, group_id, notes } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });

  const contact = { id: uuidv4(), name: name.trim(), phone: phone.replace(/\D/g, ''), group_id: group_id || null, notes: notes || null, created_at: new Date().toISOString() };
  db.updateDB(data => { data.contacts.push(contact); });
  res.json({ success: true, contact });
});

// DELETE /api/contacts/:id
router.delete('/:id', (req, res) => {
  db.updateDB(data => { data.contacts = data.contacts.filter(c => c.id !== req.params.id); });
  res.json({ success: true });
});

// POST /api/contacts/bulk-delete
router.post('/bulk-delete', (req, res) => {
  const { ids } = req.body;
  db.updateDB(data => { data.contacts = data.contacts.filter(c => !ids.includes(c.id)); });
  res.json({ success: true });
});

// --- GROUPS ---
router.get('/groups/all', (req, res) => {
  const data = db.readDB();
  const groups = data.contact_groups.map(g => {
    const count = data.contacts.filter(c => c.group_id === g.id).length;
    return { ...g, contact_count: count };
  });
  groups.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ groups });
});

router.post('/groups', (req, res) => {
  const { name, description, color } = req.body;
  const id = uuidv4();
  db.updateDB(data => { data.contact_groups.push({ id, name, description, color: color || '#25d366', created_at: new Date().toISOString() }); });
  res.json({ success: true, id });
});

router.delete('/groups/:id', (req, res) => {
  db.updateDB(data => {
    data.contacts.forEach(c => { if (c.group_id === req.params.id) c.group_id = null; });
    data.contact_groups = data.contact_groups.filter(g => g.id !== req.params.id);
  });
  res.json({ success: true });
});

// POST /api/contacts/import-text
router.post('/import-text', (req, res) => {
  const { text, group_id } = req.body;
  if (!text) return res.status(400).json({ error: 'No text' });

  let imported = 0, hasCheckedHeader = false;
  const lines = text.trim().split(/\n/);

  db.updateDB(data => {
    const existingPhones = new Set(data.contacts.map(c => c.phone));
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      let rawName = '', rawPhone = '';
      const parts = trimmed.split(/\t|,| {2,}/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) { rawName = parts[0]; rawPhone = parts[parts.length - 1]; }
      else if (parts.length === 1) { rawPhone = parts[0]; rawName = 'Unknown'; }

      if (!rawPhone) continue;

      let name = rawName, phone = rawPhone;
      const pDigits = phone.replace(/\D/g, ''), nDigits = name.replace(/\D/g, '');
      if (nDigits.length >= 8 && pDigits.length < 5) [name, phone] = [phone, name];

      const cleanPhone = phone.replace(/\D/g, '');
      if (!cleanPhone || cleanPhone.length < 8) continue;

      if (!hasCheckedHeader) {
        hasCheckedHeader = true;
        if (name.toLowerCase() === 'name' || phone.toLowerCase().includes('phone')) continue;
      }

      if (existingPhones.has(cleanPhone)) continue; 
      data.contacts.push({ id: uuidv4(), name: name || 'Unknown', phone: cleanPhone, group_id: group_id || null, created_at: new Date().toISOString() });
      existingPhones.add(cleanPhone);
      imported++;
    }
  });
  res.json({ success: true, imported });
});

module.exports = router;
