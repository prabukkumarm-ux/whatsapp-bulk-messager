const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const waManager = require('../whatsappClient');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', '..', 'data', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// GET /api/campaigns
router.get('/', (req, res) => {
  const data = db.readDB();
  const campaigns = [...data.campaigns].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ campaigns: campaigns.slice(0, 50) });
});

// GET /api/campaigns/stats
router.get('/stats', (req, res) => {
  const data = db.readDB();
  const totalMessagesSent = data.campaigns.reduce((acc, c) => acc + (c.sent_count || 0), 0);
  const totalCampaigns = data.campaigns.length;
  const completedCampaigns = data.campaigns.filter(c => c.status === 'completed').length;
  const totalContacts = data.contacts.length;
  const totalGroups = data.contact_groups.length;
  const recentCampaigns = [...data.campaigns].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

  res.json({ totalMessagesSent, totalCampaigns, completedCampaigns, totalContacts, totalGroups, recentCampaigns });
});

// POST /api/campaigns
router.post('/', upload.array('media', 10), (req, res) => {
  try {
    const { name, message, contact_ids, group_ids, delay_seconds, status } = req.body;
    const data = db.readDB();
    let contacts = [];
    if (contact_ids) {
      const ids = JSON.parse(contact_ids);
      contacts = data.contacts.filter(c => ids.includes(c.id));
    }
    if (group_ids) {
      const gIds = JSON.parse(group_ids);
      const gc = data.contacts.filter(c => gIds.includes(c.group_id));
      contacts = [...contacts, ...gc];
    }
    const unique = Array.from(new Set(contacts.map(c => c.phone))).map(p => contacts.find(c => c.phone === p)).slice(0, 500);

    const mediaList = (req.files || []).map(f => ({ path: f.path, originalname: f.originalname, mimetype: f.mimetype }));
    const campaignId = uuidv4();
    const campaign = { 
      id: campaignId, 
      name, 
      message, 
      media_files: JSON.stringify(mediaList), 
      total_contacts: unique.length, 
      contacts: JSON.stringify(unique.map(u => ({ name: u.name, phone: u.phone }))),
      sent_count: 0, 
      failed_count: 0, 
      delay_seconds: parseInt(delay_seconds) || 3, 
      status: status || 'draft', 
      created_at: new Date().toISOString() 
    };
    
    db.updateDB(d => { d.campaigns.push(campaign); });
    res.json({ success: true, id: campaignId, total: unique.length, contacts: unique.map(u => ({ name: u.name, phone: u.phone })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/campaigns/:id
router.get('/:id', (req, res) => {
  const data = db.readDB();
  const campaign = data.campaigns.find(c => c.id === req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  const logs = data.campaign_logs.filter(l => l.campaign_id === req.params.id);
  res.json({ campaign, logs });
});

// DELETE /api/campaigns/:id
router.delete('/:id', (req, res) => {
  db.updateDB(d => {
    d.campaigns = d.campaigns.filter(c => c.id !== req.params.id);
    d.campaign_logs = d.campaign_logs.filter(l => l.campaign_id !== req.params.id);
  });
  res.json({ success: true });
});

// POST /api/campaigns/:id/cancel
router.post('/:id/cancel', (req, res) => {
  db.updateDB(d => {
    const i = d.campaigns.findIndex(c => c.id === req.params.id);
    if (i !== -1) d.campaigns[i].status = 'cancelled';
  });
  res.json({ success: true });
});

// POST /api/campaigns/:id/send
router.post('/:id/send', (req, res) => {
  const data = db.readDB();
  const campIndex = data.campaigns.findIndex(c => c.id === req.params.id);
  if (campIndex === -1) return res.status(404).json({ error: 'Campaign not found' });
  
  const campaign = data.campaigns[campIndex];
  let contacts = req.body.contacts;
  
  if (!contacts || !contacts.length) {
    contacts = JSON.parse(campaign.contacts || '[]');
  }
  
  if (!contacts || !contacts.length) return res.status(400).json({ error: 'No contacts provided' });

  db.updateDB(d => {
    const i = d.campaigns.findIndex(c => c.id === req.params.id);
    if (i !== -1) { d.campaigns[i].status = 'running'; d.campaigns[i].started_at = new Date().toISOString(); }
  });
  res.json({ success: true, message: 'Campaign started' });
  runCampaign(req.params.id, contacts);
});

async function runCampaign(id, contacts) {
  const data = db.readDB();
  const campIndex = data.campaigns.findIndex(c => c.id === id);
  if (campIndex === -1) return;
  const campaign = data.campaigns[campIndex];
  const mediaFiles = JSON.parse(campaign.media_files || '[]');
  const delay = (campaign.delay_seconds || 3) * 1000;

  for (const c of contacts) {
    const d = db.readDB();
    const curCamp = d.campaigns.find(cam => cam.id === id);
    if (!curCamp || curCamp.status === 'cancelled') break;

    try {
      await waManager.sendMessage(c.phone, curCamp.message, mediaFiles);
      db.updateDB(d => {
        const idx = d.campaigns.findIndex(cam => cam.id === id);
        if (idx !== -1) d.campaigns[idx].sent_count++;
        d.campaign_logs.push({ campaign_id: id, contact_name: c.name, phone: c.phone, status: 'sent', sent_at: new Date().toISOString() });
      });
    } catch (err) {
      db.updateDB(d => {
        const idx = d.campaigns.findIndex(cam => cam.id === id);
        if (idx !== -1) d.campaigns[idx].failed_count++;
        d.campaign_logs.push({ campaign_id: id, contact_name: c.name, phone: c.phone, status: 'failed', error: err.message, sent_at: new Date().toISOString() });
      });
    }
    if (contacts.indexOf(c) < contacts.length - 1) await new Promise(r => setTimeout(r, delay));
  }
  db.updateDB(d => {
    const idx = d.campaigns.findIndex(cam => cam.id === id);
    if (idx !== -1) { d.campaigns[idx].status = 'completed'; d.campaigns[idx].completed_at = new Date().toISOString(); }
  });
}

module.exports = router;
