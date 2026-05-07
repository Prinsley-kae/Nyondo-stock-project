const mongoose = require("mongoose");

const StockSchema = new mongoose.Schema({
  supplier: {
    type: String,
    trim: true,
    required: true
  },

  itemName: {
    type: String,
    required: true,
    trim: true
  },

  category: {
    type: String,
    trim: true,
    required: true
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
  },

  supplierContact: {
    type: String,
    required: true
  },

  deliveryDate: {
    type: Date,
    default: Date.now
  },



  itemImage: {
    type: String
  }
});

module.exports = mongoose.model("Stock", StockSchema);