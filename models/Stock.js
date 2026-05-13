const mongoose = require("mongoose");

const StockSchema = new mongoose.Schema({
  supplierName: {
    type: String,
    trim: true,
    required: true
  },

  itemName: {
    type: String,
    required: true,
    trim: true
  },

  buyingPrice: {
    type: Number,
    required: true
  },

  sellingPrice: {
    type: Number,
    required: true
  },

  quantity: {
    type: Number,
    required: true
  },

  totalValue: {
    type: Number,
    required:true
  },

  supplierContact: {
    type: String,
    required: true
  },

  deliveryDate: {
    type: Date,
    default: Date.now
  },

  paymentMethod: {
  type: String,
  required: true
},

  itemImage: {
    type: String
  }
});

module.exports = mongoose.model("Stock", StockSchema);