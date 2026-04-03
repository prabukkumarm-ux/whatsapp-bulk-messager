const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  group_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactGroup', default: null },
  notes: String,
  created_at: { type: Date, default: Date.now }
});

const ContactGroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  color: { type: String, default: '#25d366' },
  created_at: { type: Date, default: Date.now }
});

const TemplateSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  category: { type: String, default: 'general' },
  created_at: { type: Date, default: Date.now }
});

const CampaignSchema = new mongoose.Schema({
  name: { type: String, required: true },
  message: { type: String, required: true },
  media_files: { type: String, default: '[]' },
  status: { type: String, default: 'draft' }, // draft, running, completed, cancelled
  total_contacts: { type: Number, default: 0 },
  sent_count: { type: Number, default: 0 },
  failed_count: { type: Number, default: 0 },
  delay_seconds: { type: Number, default: 3 },
  scheduled_at: Date,
  started_at: Date,
  completed_at: Date,
  created_at: { type: Date, default: Date.now }
});

const CampaignLogSchema = new mongoose.Schema({
  campaign_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  contact_name: String,
  phone: String,
  status: String, // sent, failed
  error: String,
  sent_at: { type: Date, default: Date.now }
});

module.exports = {
  Contact: mongoose.model('Contact', ContactSchema),
  ContactGroup: mongoose.model('ContactGroup', ContactGroupSchema),
  Template: mongoose.model('Template', TemplateSchema),
  Campaign: mongoose.model('Campaign', CampaignSchema),
  CampaignLog: mongoose.model('CampaignLog', CampaignLogSchema)
};
