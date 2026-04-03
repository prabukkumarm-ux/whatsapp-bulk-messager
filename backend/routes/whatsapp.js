const express = require('express');
const router = express.Router();
const waManager = require('../whatsappClient');

// GET /api/whatsapp/status
router.get('/status', (req, res) => {
  res.json(waManager.getStatus());
});

// POST /api/whatsapp/connect
router.post('/connect', (req, res) => {
  const current = waManager.getStatus();
  if (current.status === 'ready') {
    return res.json({ success: true, message: 'Already connected' });
  }
  waManager.initialize();
  res.json({ success: true, message: 'Connecting...' });
});

// POST /api/whatsapp/disconnect
router.post('/disconnect', async (req, res) => {
  await waManager.logout();
  res.json({ success: true, message: 'Disconnected and session cleared' });
});

// GET /api/whatsapp/qr - SSE stream for QR updates
router.get('/qr-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current status immediately
  const current = waManager.getStatus();
  res.write(`data: ${JSON.stringify(current)}\n\n`);

  // 💓 Heartbeat to keep Render connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 20000); 

  const onQR = (qr) => res.write(`data: ${JSON.stringify({ status: 'qr', qr })}\n\n`);
  const onReady = (info) => res.write(`data: ${JSON.stringify({ status: 'ready', info })}\n\n`);
  const onDisconnected = () => res.write(`data: ${JSON.stringify({ status: 'disconnected' })}\n\n`);
  const onLoading = (data) => res.write(`data: ${JSON.stringify({ status: 'connecting', ...data })}\n\n`);
  const onAuth = () => res.write(`data: ${JSON.stringify({ status: 'connecting' })}\n\n`);

  waManager.on('qr', onQR);
  waManager.on('ready', onReady);
  waManager.on('disconnected', onDisconnected);
  waManager.on('loading', onLoading);
  waManager.on('authenticated', onAuth);

  req.on('close', () => {
    clearInterval(heartbeat);
    waManager.off('qr', onQR);
    waManager.off('ready', onReady);
    waManager.off('disconnected', onDisconnected);
    waManager.off('loading', onLoading);
    waManager.off('authenticated', onAuth);
  });
});

module.exports = router;
