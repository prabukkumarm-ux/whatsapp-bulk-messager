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
  
  if (group_id) {
    contacts = contacts.filter(c => c.group_id === group_id);
  }
  if (search) {
    const s = search.toLowerCase();
    contacts = contacts.filter(c => c.name.toLowerCase().includes(s) || c.phone.includes(s));
  }
  
  // Sort desc by created_at
  contacts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  // Join groups
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
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });

  const id = uuidv4();
  const contact = {
    id, name, phone: phone.trim(), group_id: group_id || null, notes: notes || null, created_at: new Date().toISOString()
  };
  
  db.updateDB(data => {
    data.contacts.push(contact);
  });
  
  res.json({ success: true, contact });
});

// PUT /api/contacts/:id
router.put('/:id', (req, res) => {
  const { name, phone, group_id, notes } = req.body;
  db.updateDB(data => {
    const i = data.contacts.findIndex(c => c.id === req.params.id);
    if (i !== -1) {
      data.contacts[i] = { ...data.contacts[i], name, phone, group_id: group_id || null, notes: notes || null };
    }
  });
  res.json({ success: true });
});

// DELETE /api/contacts/:id
router.delete('/:id', (req, res) => {
  db.updateDB(data => {
    data.contacts = data.contacts.filter(c => c.id !== req.params.id);
  });
  res.json({ success: true });
});

// DELETE /api/contacts/bulk
router.post('/bulk-delete', (req, res) => {
  const { ids } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided' });
  
  db.updateDB(data => {
    data.contacts = data.contacts.filter(c => !ids.includes(c.id));
  });
  res.json({ success: true, deleted: ids.length });
});

// POST /api/contacts/import-csv
router.post('/import-csv', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    let records = [];
    const filename = req.file.originalname.toLowerCase();

    if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      // Parse Excel
      const xlsx = require('xlsx');
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      records = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    } else {
      // Parse CSV
      const content = req.file.buffer.toString('utf-8');
      records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
    }

    const { group_id } = req.body;
    let imported = 0;
    let failed = 0;
    const errors = [];

    db.updateDB(data => {
      const existingPhones = new Set(data.contacts.map(c => c.phone));
      for (const r of records) {
        const name = r.name || r.Name || r.NAME;
        const phone = r.phone || r.Phone || r.PHONE || r.mobile || r.Mobile;
        
        if (!name || !phone) { 
          failed++; errors.push(`Row missing name/phone: ${JSON.stringify(r)}`); continue; 
        }
        
        const pStr = phone.toString().trim();
        if (existingPhones.has(pStr)) continue; // IGNORE duplicates roughly
        
        data.contacts.push({
          id: uuidv4(),
          name: name.trim(),
          phone: pStr,
          group_id: group_id || null,
          created_at: new Date().toISOString()
        });
        existingPhones.add(pStr);
        imported++;
      }
    });

    res.json({ success: true, imported, failed, errors: errors.slice(0, 5) });
  } catch (err) {
    res.status(400).json({ error: 'Invalid CSV file: ' + err.message });
  }
});

// POST /api/contacts/import-text
router.post('/import-text', (req, res) => {
  const { text, group_id } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided' });

  let imported = 0, failed = 0, errors = [];
  const lines = text.trim().split(/\r?\n/);

  db.updateDB(data => {
    const existingPhones = new Set(data.contacts.map(c => c.phone));
    let hasCheckedHeader = false;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      let rawName = '', rawPhone = '';
      
      if (trimmedLine.includes('\t')) {
        const parts = trimmedLine.split('\t').map(s => s.trim()).filter(Boolean);
        if (parts.length >= 2) { rawName = parts[0]; rawPhone = parts[parts.length - 1]; }
        else if (parts.length === 1) { rawPhone = parts[0]; rawName = 'Unknown'; }
      } else if (trimmedLine.includes(',')) {
        const parts = trimmedLine.split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length >= 2) { rawName = parts[0]; rawPhone = parts[parts.length - 1]; }
      } else {
        const match = trimmedLine.match(/^(.*?)\s+([\+\d\-\(\)\s]{8,})$/);
        if (match) { rawName = match[1].trim(); rawPhone = match[2].trim(); }
        else {
          const parts = trimmedLine.split(/\s+/).filter(Boolean);
          if (parts.length >= 2) { rawPhone = parts.pop(); rawName = parts.join(' '); }
          else if (parts.length === 1) { rawPhone = parts[0]; rawName = 'Unknown'; }
        }
      }

      if (!rawPhone) { failed++; continue; }

      // SMART DETECTION: If Name looks like a phone and Phone looks like a name, swap them
      let name = rawName;
      let phone = rawPhone;
      
      const phoneDigits = phone.replace(/\D/g, '');
      const nameDigits = name.replace(/\D/g, '');

      // If name has many digits and phone has none or few, swap
      if (nameDigits.length >= 8 && phoneDigits.length < 5) {
        let temp = name;
        name = phone;
        phone = temp;
      }

      const finalPhone = phone.replace(/\D/g, ''); // Ensure ONLY digits are stored

      if (!finalPhone) { 
        failed++; 
        errors.push(`Row has no valid phone: ${trimmedLine}`); 
        continue; 
      }

      // Skip header row if copied
      if (!hasCheckedHeader) {
        hasCheckedHeader = true;
        if (name.toLowerCase() === 'name' || phone.toLowerCase().includes('phone') || isNaN(finalPhone)) continue;
      }

      if (existingPhones.has(finalPhone)) continue; 

      data.contacts.push({
        id: uuidv4(),
        name: name || 'Unknown',
        phone: finalPhone,
        group_id: group_id || null,
        created_at: new Date().toISOString()
      });
      existingPhones.add(finalPhone);
      imported++;
    }
  });

  res.json({ success: true, imported, failed, errors: errors.slice(0, 5) });
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
  if (!name) return res.status(400).json({ error: 'Group name required' });
  const id = uuidv4();
  
  db.updateDB(data => {
    data.contact_groups.push({
      id, name, description: description || null, color: color || '#25d366', created_at: new Date().toISOString()
    });
  });
  
  res.json({ success: true, id });
});

router.delete('/groups/:id', (req, res) => {
  db.updateDB(data => {
    data.contacts.forEach(c => {
      if (c.group_id === req.params.id) c.group_id = null;
    });
    data.contact_groups = data.contact_groups.filter(g => g.id !== req.params.id);
  });
  res.json({ success: true });
});

module.exports = router;
