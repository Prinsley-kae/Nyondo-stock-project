const mongoose = require("mongoose");

const SaleSchema = new mongoose.Schema({
  customerName: {
    type: String,
    trim: true,
    required: true
  },

  phoneNumber: {
    type: String,
    trim: true,
    required: true
  },

  customerAddress: {
    type: String,
    required: [true, "Customer address is required"]
  },

  distance: {
    type: Number,
    required: true
  },

  // MULTIPLE ITEMS
  items: [
    {
      item: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Stock",
        required: true
      },

      quantity: {
        type: Number,
        required: true,
        min: 1
      },

      unitPrice: {
        type: Number,
        required: true
      },

      itemTotal: {
        type: Number,
        required: true
      }
    }
  ],

  subtotal: {
    type: Number,
    required: true
  },

  transportFee: {
    type: Number,
    default: 0
  },

  finalTotal: {
    type: Number,
    required: true
  },

  attendant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Registration",
    required: true
  },

  date: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Sale", SaleSchema);