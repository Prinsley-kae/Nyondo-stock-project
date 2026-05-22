const mongoose = require("mongoose");

const StockSchema = new mongoose.Schema(
  {
    // Added Batch ID for grouping items
    batchId: {
      type: String,
      index: true, // Speeds up searches for specific batches
    },

    supplierName: {
      type: String,
      trim: true,
      required: true,
    },

    companyName: {
      type: String,
      trim: true,
      required: true,
    },

    itemName: {
      type: String,
      required: true,
      trim: true,
    },

    buyingPrice: {
      type: Number,
      required: true,
    },

    sellingPrice: {
      type: Number,
      required: true,
    },

    originalQuantity: {
      type: Number,
      required: true,
    },

    currentQuantity: {
      type: Number,
      required: true,
    },

    totalValue: {
      type: Number,
      required: true,
    },

    supplierContact: {
      type: String,
      required: true,
    },

    deliveryDate: {
      type: Date,
      default: Date.now,
    },

    paymentMethod: {
      type: String,
      enum: ["cash_at_hand", "credit", "cash"],
      default: "cash_at_hand",
    },

    paymentDate: {
      type: Date,
    },

    voucherId: {
      type: String,
    },

    itemImage: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Stock", StockSchema);