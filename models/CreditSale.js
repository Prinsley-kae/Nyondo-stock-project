const mongoose = require('mongoose');

const CreditSaleSchema = new mongoose.Schema({

  customerName: {
    type: String,
    required: true,
    trim: true
  },

  customerAddress: {
    type: String,
    required: true,
    trim: true
  },

  customerContact: {
    type: String,
    required: true,
    trim: true
  },

  nin: {
    type: String,
    required: true, 
    trim: true
  },

  //  Changed from single object properties to an array to accept multiple items
  items: {
    type: [{
      item: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Stock',
        required: true
      },
      quantity: {
        type: Number,
        required: true,
        min: [1, 'Quantity cannot be less than 1']
      }
    }],
    required: true,
    validate: [v => Array.isArray(v) && v.length > 0, 'At least one item must be added to the transaction profile']
  },

  paymentType: {
    type: String,
    enum: ['credit', 'partial'],
    default: 'credit',
    required: true
  },

  amountPaid: {
    type: Number,
    required: true,
    default: 0,
    min: [0, 'Amount paid cannot be a negative value']
  },

  notes: {
    type: String,
    required: true, 
    trim: true
  },

  totalAmount: {
    type: Number,
    required: true,
    min: [0, 'Total sale evaluation profile value cannot be negative']
  },

  balance: {
    type: Number,
    required: true,
    min: [0, 'Outstanding credit balance cannot be negative']
  },

  status: {
    type: String,
    enum: ['pending', 'partial', 'cleared'],
    default: 'pending',
    required: true
  },

  // Tracks whether the store handles transit or customer uses own means
  deliveryMethod: {
    type: String,
    enum: ['delivery', 'self-pick'],
    default: 'delivery',
    required: true
  },

  //  Added missing logistics metrics so MongoDB doesn't drop them on save
  distance: {
    type: Number,
    required: true,
    default: 0,
    min: [0, 'Distance metrics cannot run into negative figures']
  },

  transportFee: {
    type: Number,
    required: true,
    default: 0,
    min: [0, 'Transport cost value allocations cannot be negative values']
  },

  date: {
    type: Date,
    default: Date.now,
    required: true
  },

  admin: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Registration',
    required: true 
  }
  
});

module.exports = mongoose.model('CreditSale', CreditSaleSchema);