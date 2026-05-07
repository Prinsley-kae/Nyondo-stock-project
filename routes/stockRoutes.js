const express = require('express');
const router = express.Router();
const multer = require('multer');

const Stock = require('../models/Stock');
const { isManager } = require('../middleware/auth');


/* =========================
   MULTER CONFIG
========================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });


/* =========================
   DASHBOARD
========================= */
router.get('/store', async (req, res) => {
  try {

    const all = await Stock.find();

    const inventoryValue = all
      .filter(s => s.paymentMethod !== 'credit')
      .reduce((sum, s) => sum + (s.quantity * s.buyingPrice), 0);

    const creditValue = all
      .filter(s => s.paymentMethod === 'credit')
      .reduce((sum, s) => sum + (s.quantity * s.buyingPrice), 0);

    res.render('stock-dashboard', {
      stats: {
        inventoryValue,
        creditValue
      }
    });

  } catch (error) {
    console.log(error.message);
    res.status(500).send('Dashboard error');
  }
});


/* =========================
   INVENTORY + CREDIT TABLE PAGE
========================= */
router.get('/store/inventory', async (req, res) => {
  try {

    const allStocks = await Stock.find().sort({ createdAt: -1 });

    const stocks = allStocks.filter(s => s.paymentMethod !== 'credit');
    const credits = allStocks.filter(s => s.paymentMethod === 'credit');

    res.render('stock-list', {
      stocks,
      credits
    });

  } catch (error) {
    console.log(error);

    res.render('stock-list', {
      stocks: [],
      credits: []
    });
  }
});


/* =========================
   ADD STOCK (SAME FORM)
========================= */
router.post('/store/add-stock', isManager, upload.single('itemImage'), async (req, res) => {
  try {

    const {
      itemName,
      category,
      quantity,
      buyingPrice,
      sellingPrice,
      supplier,
      supplierContact,
      
      deliveryDate,
      paymentMethod
    } = req.body;

    const itemImage = req.file ? req.file.path : null;

    const totalValue = Number(quantity) * Number(buyingPrice);

    /* ================= BUSINESS RULE =================
       Selling price must be greater than buying price
    =================================================== */
    if (Number(sellingPrice) <= Number(buyingPrice)) {
      return res.status(400).send("Selling price must be greater than buying price");
    }

    const stock = new Stock({
      itemName,
      category,
      quantity,
      buyingPrice,
      sellingPrice,
      supplier,
      supplierContact,
      deliveryDate,
      paymentMethod,
      itemImage,
      totalValue
    });

    await stock.save();

    res.redirect('/store/inventory');

  } catch (error) {
    console.log(error);
    res.status(500).send('Error saving stock');
  }
});


/* =========================
   VIEW SINGLE ITEM
========================= */
router.get('/store/inventory/:id', async (req, res) => {
  try {
    const stock = await Stock.findById(req.params.id);
    res.render('stock-details', { stock });

  } catch (error) {
    console.log(error);
    res.redirect('/store/inventory');
  }
});


/* =========================
   DELETE ITEM
========================= */
router.post('/store/inventory/delete/:id', async (req, res) => {
  try {
    await Stock.findByIdAndDelete(req.params.id);
    res.redirect('/store/inventory');

  } catch (error) {
    console.log(error);
    res.redirect('/store/inventory');
  }
});


module.exports = router;