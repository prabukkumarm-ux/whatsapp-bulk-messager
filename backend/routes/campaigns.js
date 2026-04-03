const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const waManager = require('../whatsappClient');

// Multer config for media uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', '..', 'data', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${uuidv4().slice(0, 8)}`;
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf|mp4/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext || mime);
  }
});

// GET /api/campaigns
router.get('/', (req, res) => {
  const data = db.readDB();
  const campaigns = [...data.campaigns].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100);
  res.json({ campaigns });
});

// GET /api/campaigns/stats
router.get('/stats', (req, res) => {
  const data = db.readDB();
  const total = data.campaigns.length;
  const completed = data.campaigns.filter(c => c.status === 'completed').length;
  const totalSent = data.campaigns.reduce((acc, c) => acc + (c.sent_count || 0), 0);
  const totalContacts = data.contacts.length;
  const totalGroups = data.contact_groups.length;
  const recentCampaigns = [...data.campaigns].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

  res.json({
    totalCampaigns: total,
    completedCampaigns: completed,
    totalMessagesSent: totalSent,
    totalContacts: totalContacts,
    totalGroups: totalGroups,
    recentCampaigns
  });
});

// GET /api/campaigns/:id
router.get('/:id', (req, res) => {
  const data = db.readDB();
  const campaign = data.campaigns.find(c => c.id === req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  const logs = data.campaign_logs.filter(l => l.campaign_id === req.params.id)
                  .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at)).slice(0, 200);
  res.json({ campaign, logs });
});

// POST /api/campaigns - Create campaign
router.post('/', upload.array('media', 10), (req, res) => {
  const { name, message, contact_ids, group_ids, delay_seconds, scheduled_at } = req.body;
  if (!name || !message) return res.status(400).json({ error: 'Name and message required' });

  const data = db.readDB();
  
  // Gather contacts
  let contacts = [];
  if (contact_ids) {
    const ids = JSON.parse(contact_ids);
    if (ids.length) {
      contacts = data.contacts.filter(c => ids.includes(c.id));
    }
  }
  if (group_ids) {
    const gIds = JSON.parse(group_ids);
    for (const gId of gIds) {
      const groupContacts = data.contacts.filter(c => c.group_id === gId);
      contacts = [...contacts, ...groupContacts];
    }
  }

  // Deduplicate by phone
  const seen = new Set();
  contacts = contacts.filter(c => {
    if (seen.has(c.phone)) return false;
    seen.add(c.phone);
    return true;
  });

  // Limit to 100
  if (contacts.length > 100) contacts = contacts.slice(0, 100);

  if (!contacts.length) return res.status(400).json({ error: 'No contacts selected' });

  // Media files
  const mediaFiles = (req.files || []).map(f => ({
    path: f.path,
    originalname: f.originalname,
    mimetype: f.mimetype,
    size: f.size
  }));

  const id = uuidv4();
  const contactsJson = JSON.stringify(contacts.map(c => ({ id: c.id, name: c.name, phone: c.phone })));
  
  const campaign = {
    id, name, message, media_files: JSON.stringify(mediaFiles),
    status: 'draft', total_contacts: contacts.length,
    sent_count: 0, failed_count: 0, delay_seconds: parseInt(delay_seconds) || 3,
    scheduled_at: scheduled_at || null, created_at: new Date().toISOString()
  };

  db.updateDB(d => {
    d.campaigns.push(campaign);
  });

  // Store contacts list in campaign (temp approach)
  const campaignDir = path.join(__dirname, '..', '..', 'data', 'campaigns');
  if (!fs.existsSync(campaignDir)) fs.mkdirSync(campaignDir, { recursive: true });
  fs.writeFileSync(path.join(campaignDir, `${id}_contacts.json`), contactsJson);

  res.json({ success: true, id, total_contacts: contacts.length });
});

// POST /api/campaigns/:id/send - Start sending
router.post('/:id/send', async (req, res) => {
  const data = db.readDB();
  const campaignIdx = data.campaigns.findIndex(c => c.id === req.params.id);
  if (campaignIdx === -1) return res.status(404).json({ error: 'Campaign not found' });
  const campaign = data.campaigns[campaignIdx];
  if (campaign.status === 'running') return res.status(400).json({ error: 'Campaign already running' });

  if (waManager.status !== 'ready') {
    return res.status(400).json({ error: 'WhatsApp not connected. Please scan QR code first.' });
  }

  // Load contacts
  const contactsFile = path.join(__dirname, '..', '..', 'data', 'campaigns', `${campaign.id}_contacts.json`);
  if (!fs.existsSync(contactsFile)) return res.status(400).json({ error: 'Campaign contacts not found' });
  const contacts = JSON.parse(fs.readFileSync(contactsFile, 'utf-8'));

  // Update status
  db.updateDB(d => {
    const c = d.campaigns.find(x => x.id === req.params.id);
    if (c) {
      c.status = 'running'; c.started_at = new Date().toISOString();
      c.sent_count = 0; c.failed_count = 0;
    }
  });

  res.json({ success: true, message: 'Campaign started', total: contacts.length });

  // Run campaign asynchronously
  runCampaign(campaign.id, contacts, campaign.message, campaign.media_files, campaign.delay_seconds);
});

async function runCampaign(id, contacts, messageString, mediaString, delaySeconds) {
  const mediaFiles = JSON.parse(mediaString || '[]');
  const delay = (delaySeconds || 3) * 1000;

  let sent = 0, failed = 0;

  for (const contact of contacts) {
    // Check if campaign was cancelled
    let currentData = db.readDB();
    let currentCamp = currentData.campaigns.find(c => c.id === id);
    if (!currentCamp || currentCamp.status === 'cancelled') break;

    try {
      await waManager.sendMessage(contact.phone, messageString, mediaFiles);
      sent++;
      db.updateDB(d => {
        const c = d.campaigns.find(x => x.id === id);
        if (c) c.sent_count = sent;
        d.campaign_logs.push({
          id: uuidv4(), campaign_id: id, contact_name: contact.name, phone: contact.phone, status: 'sent', error: null, sent_at: new Date().toISOString()
        });
      });
    } catch (err) {
      failed++;
      db.updateDB(d => {
        const c = d.campaigns.find(x => x.id === id);
        if (c) c.failed_count = failed;
        d.campaign_logs.push({
          id: uuidv4(), campaign_id: id, contact_name: contact.name, phone: contact.phone, status: 'failed', error: err.message, sent_at: new Date().toISOString()
        });
      });
    }

    // Delay between messages
    if (contacts.indexOf(contact) < contacts.length - 1) {
      await sleep(delay);
    }
  }

  currentData = db.readDB();
  currentCamp = currentData.campaigns.find(c => c.id === id);
  if (currentCamp && currentCamp.status !== 'cancelled') {
    db.updateDB(d => {
      const c = d.campaigns.find(x => x.id === id);
      if (c) { c.status = 'completed'; c.completed_at = new Date().toISOString(); }
    });
  }
}

// POST /api/campaigns/:id/cancel
router.post('/:id/cancel', (req, res) => {
  db.updateDB(d => {
    const c = d.campaigns.find(x => x.id === req.params.id);
    if (c) c.status = 'cancelled';
  });
  res.json({ success: true });
});

// DELETE /api/campaigns/:id
router.delete('/:id', (req, res) => {
  db.updateDB(d => {
    d.campaign_logs = d.campaign_logs.filter(l => l.campaign_id !== req.params.id);
    d.campaigns = d.campaigns.filter(c => c.id !== req.params.id);
  });
  res.json({ success: true });
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = router;
