const express = require('express');
const router = express.Router();
const Sales = require("../models/Sales");
const Stock = require("../models/Stock");
const Registration = require('../models/Registration');


/* =========================
   ADMIN DASHBOARD
========================= */
router.get('/admin', async (req, res) => {
  try {
    let stats = {
      salesRevenue: 0,
      inventoryValue: 0
    };

    const salesAgg = await Sales.aggregate([
      { $group: { _id: null, grandTotal: { $sum: "$total" } } }
    ]);

    stats.salesRevenue = salesAgg.length ? salesAgg[0].grandTotal : 0;

    const inventoryAgg = await Stock.aggregate([
      { $group: { _id: null, grandExpenditure: { $sum: "$totalValue" } } }
    ]);

    stats.inventoryValue = inventoryAgg.length ? inventoryAgg[0].grandExpenditure : 0;

    res.render('admin-dashboard', { stats });

  } catch (error) {
    console.log(error.message);
    res.status(500).send('Error in loading data');
  }
});


/* =========================
   REPORTS
========================= */
router.get('/admin/reports', (req, res) => {
  res.render('admin-reports');
});


/* =========================
   CUSTOMER DEPOSITS (FIXED)
========================= */
router.get('/admin/deposits', async (req, res) => {
  try {
    const items = await Stock.find({ quantity: { $gt: 0 } });

    res.render('credit-sales-form', {
      items: items || []
    });

  } catch (error) {
    console.log(error);
    res.render('credit-sales-form', {
      items: []
    });
  }
});


/* =========================
   STOCK REPORTS
========================= */
router.get('/admin/stock-reports', (req, res) => {
  res.render('stock-reports');
});


/* =========================
   CUSTOMER DEPOSITS TABLE
========================= */
router.get('/admin/deposit-details', (req, res) => {
  res.render('credit-sales-list');
});


/* =========================
   CREDIT REPORTS
========================= */
router.get('/admin/credit-reports', (req, res) => {
  res.render('credit-reports');
});


/* =========================
   USER MANAGEMENT
========================= */
router.get('/admin/users', (req, res) => {
  res.render('system-users');
});


/* =========================
   SYSTEM SETTINGS
========================= */
router.get('/admin/settings', (req, res) => {
  res.render('settings');
});


/* =========================
   TRANSPORT RULES
========================= */
router.get('/admin/transport-rules', (req, res) => {
  res.render('transport-rules');
});

module.exports = router;