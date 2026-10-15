const mongoose = require('mongoose');

const revokedTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // TTL index in MongoDB: document expires at expiresAt
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('RevokedToken', revokedTokenSchema);
