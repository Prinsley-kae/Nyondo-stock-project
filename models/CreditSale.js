const mongoose = require('mongoose');

const CreditSaleSchema = new mongoose.Schema({

  customerName: {
    type: String,
    required: true,
    trim: true
  },

  customerAddress: {
    type: String,
    required: true
  },

  customerContact: {
    type: String,
    required: true
  },

  nin: {
    type: String,
    default: null
  },

  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Stock',
    required: true
  },

  quantity: {
    type: Number,
    required: true
  },

  paymentType: {
    type: String,
    enum: ['credit', 'partial'],
    default: 'credit'
  },

  amountPaid: {
    type: Number,
    default: 0
  },

  notes: {
    type: String
  },

  totalAmount: {
    type: Number,
    required: true
  },

  balance: {
    type: Number,
    required: true
  },

  status: {
    type: String,
    enum: ['pending', 'partial', 'cleared'],
    default: 'pending'
  },

  date: {
    type: Date,
    default: Date.now
  }

});

module.exports = mongoose.model('CreditSale', CreditSaleSchema);