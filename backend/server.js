const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 4040;
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'wa-secret-key-789';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Public Assets
app.use(express.static(path.join(__dirname, '..', 'public')));
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Generic Auth 🗝️🏠
const auth = (req, res, next) => {
  let token = req.query.token;
  if (!token && req.headers['authorization']) {
    token = req.headers['authorization'].replace('Bearer ', '');
  }

  if (!token) return res.status(401).json({ error: 'Please login' });
  
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) { 
    console.error('Auth Error:', err.message);
    res.status(401).json({ error: 'Session expired' }); 
  }
};

// --- AUTH ROUTES ---
app.post('/api/auth/login', (req, res) => {
  if (req.body.password === ADMIN_PASS) {
    const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ success: true, token });
  }
  res.status(401).json({ error: 'Wrong password' });
});

// Use authentication for all data routes
app.use('/api/whatsapp', auth, require('./routes/whatsapp'));
app.use('/api/contacts', auth, require('./routes/contacts'));
app.use('/api/campaigns', auth, require('./routes/campaigns'));
app.use('/api/templates', auth, require('./routes/templates'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║         🚀  WaBlast Pro  is Running!         ║');
  console.log(`║   http://localhost:${PORT}                       ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
