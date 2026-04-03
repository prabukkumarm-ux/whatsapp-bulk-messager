const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database');

// GET /api/templates
router.get('/', (req, res) => {
  const data = db.readDB();
  const templates = [...data.templates].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ templates });
});

// POST /api/templates
router.post('/', (req, res) => {
  const { title, message, category } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Title and message required' });
  const id = uuidv4();
  
  db.updateDB(data => {
    data.templates.push({
      id, title, message, category: category || 'general', created_at: new Date().toISOString()
    });
  });
  
  res.json({ success: true, id });
});

// PUT /api/templates/:id
router.put('/:id', (req, res) => {
  const { title, message, category } = req.body;
  
  db.updateDB(data => {
    const idx = data.templates.findIndex(t => t.id === req.params.id);
    if (idx !== -1) {
      data.templates[idx] = { ...data.templates[idx], title, message, category: category || 'general' };
    }
  });
  res.json({ success: true });
});

// DELETE /api/templates/:id
router.delete('/:id', (req, res) => {
  db.updateDB(data => {
    data.templates = data.templates.filter(t => t.id !== req.params.id);
  });
  res.json({ success: true });
});

module.exports = router;
