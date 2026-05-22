const mongoose = require('mongoose');

const TransportRuleSchema = new mongoose.Schema({
  // The distance limit (in KM) under which delivery can be free
  freeRadius: { 
    type: Number, 
    required: true,
    default: 10 
  },
  // The minimum order cost (in UGX) required to qualify for free delivery
  minOrder: { 
    type: Number, 
    required: true,
    default: 500000 
  },
  // The fallback flat delivery charge (in UGX) if conditions aren't met
  deliveryFee: { 
    type: Number, 
    required: true,
    default: 30000 
  }
}, { 
  // Automatically manages 'createdAt' and 'updatedAt' fields for audit logs
  timestamps: true 
});

module.exports = mongoose.model('TransportRule', TransportRuleSchema);