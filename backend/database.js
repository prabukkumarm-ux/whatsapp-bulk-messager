const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'wablast.json');

const defaultData = {
  contacts: [],
  contact_groups: [],
  templates: [],
  campaigns: [],
  campaign_logs: []
};

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function readDB() {
  if (!fs.existsSync(DB_PATH)) return defaultData;
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (err) {
    return defaultData;
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function updateDB(callback) {
  const data = readDB();
  callback(data);
  writeDB(data);
}

module.exports = { readDB, writeDB, updateDB };
