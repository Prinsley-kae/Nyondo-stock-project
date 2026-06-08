const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },

  filename: {
    type: String,
    required: true,
  },

  category: { 
    type: String, 
    default: 'Sales' 
  },

  startDate:Date,
  endDate:Date,

  generatedBy: {
    type: String,
    required: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Report', reportSchema);