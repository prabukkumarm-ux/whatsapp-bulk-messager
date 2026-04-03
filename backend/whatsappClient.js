const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

class WhatsAppManager extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.status = 'disconnected'; // disconnected | qr | connecting | ready
    this.qrData = null;
    this.info = null;
  }

  initialize() {
    if (this.client) {
      this.destroy();
    }

    const sessionDir = path.join(__dirname, '..', 'data', 'session');

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: sessionDir }),
      puppeteer: {
        headless: 'new', // Much more stable on Windows 💻
        executablePath: process.env.CHROME_PATH || undefined, 
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        timeout: 90000 // Give it 90 seconds to wake up ⏳
      },
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1015694857-alpha.html'
      }
    });

    console.log('🚀 Starting WhatsApp Puppeteer browser...');

    this.client.on('qr', async (qr) => {
      console.log('📱 QR Code received');
      this.status = 'qr';
      try {
        this.qrData = await qrcode.toDataURL(qr);
      } catch (err) {
        this.qrData = qr;
      }
      this.emit('qr', this.qrData);
    });

    this.client.on('loading_screen', (percent, message) => {
      console.log(`⏳ Loading: ${percent}% - ${message}`);
      this.status = 'connecting';
      this.emit('loading', { percent, message });
    });

    this.client.on('authenticated', () => {
      console.log('✅ WhatsApp Authenticated');
      this.status = 'connecting';
      this.qrData = null;
      this.emit('authenticated');
    });

    this.client.on('ready', () => {
      console.log('🟢 WhatsApp Client Ready!');
      this.status = 'ready';
      this.info = this.client.info;
      this.emit('ready', this.info);
    });

    this.client.on('disconnected', (reason) => {
      console.log('🔴 WhatsApp Disconnected:', reason);
      this.status = 'disconnected';
      this.info = null;
      this.qrData = null;
      this.emit('disconnected', reason);
    });

    this.client.on('auth_failure', (msg) => {
      console.error('❌ Auth Failure:', msg);
      this.status = 'disconnected';
      this.emit('auth_failure', msg);
    });

    this.status = 'connecting';
    this.client.initialize().catch(err => {
      console.error('Client init error:', err);
      this.status = 'disconnected';
      this.emit('error', err);
    });
  }

  async destroy() {
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (e) {}
      this.client = null;
    }
    this.status = 'disconnected';
    this.qrData = null;
    this.info = null;
  }

  async logout() {
    if (this.client) {
      try {
        await this.client.logout();
      } catch (e) {}
    }
    // Delete session
    const sessionDir = path.join(__dirname, '..', 'data', 'session');
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    await this.destroy();
  }

  getStatus() {
    return {
      status: this.status,
      qr: this.qrData,
      info: this.info ? {
        name: this.info.pushname,
        phone: this.info.wid?.user,
        platform: this.info.platform
      } : null
    };
  }

  async sendMessage(phone, message, mediaFiles = []) {
    if (this.status !== 'ready') {
      throw new Error('WhatsApp not connected');
    }

    // Format phone number
    const formatted = this.formatPhone(phone);
    const chatId = `${formatted}@c.us`;

    // Check if number exists on WhatsApp
    const isRegistered = await this.client.isRegisteredUser(chatId);
    if (!isRegistered) {
      throw new Error(`Number ${phone} is not on WhatsApp`);
    }

    // Send media files first (if any)
    if (mediaFiles && mediaFiles.length > 0) {
      for (const file of mediaFiles) {
        if (fs.existsSync(file.path)) {
          const media = MessageMedia.fromFilePath(file.path);
          await this.client.sendMessage(chatId, media, {
            caption: mediaFiles.indexOf(file) === 0 ? message : ''
          });
          await this.sleep(500);
        }
      }
    } else {
      // Send text only
      await this.client.sendMessage(chatId, message);
    }

    return true;
  }

  formatPhone(phone) {
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    // If starts with 0, remove it and add country code
    if (cleaned.startsWith('0')) {
      cleaned = '91' + cleaned.slice(1); // Default India
    }
    // If no country code (10 digits), add India (+91)
    if (cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }
    return cleaned;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const waManager = new WhatsAppManager();
module.exports = waManager;
