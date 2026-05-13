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
    const safeName = file.originalname
      .toLowerCase()
      .replace(/\s+/g, '-')      // remove spaces
      .replace(/[^a-z0-9.-]/g, ''); // removes special characters

    cb(null, Date.now() + '-' + safeName);
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
      .filter(s => (s.paymentMethod || '').toLowerCase() !== 'credit')
      .reduce((sum, s) => sum + (Number(s.quantity) * Number(s.buyingPrice)), 0);

    const totalStockItems = all.reduce(
      (sum, s) => sum + Number(s.quantity || 0),
      0
    );

    const lowStockItems = all.filter(
      s => Number(s.quantity || 0) <= 50
    );

    const suppliers = new Set(all.map(s => s.supplierName)).size;

    res.render('stock-dashboard', {
      stats: {
        inventoryValue,
        totalStockItems,
        suppliers,
        lowStockItems: lowStockItems.length
      },
      lowStockItems
    });

  } catch (error) {
    console.log(error);
    res.status(500).send("Dashboard error");
  }
});
/* =========================
   INVENTORY + CREDIT TABLE PAGE
========================= */
router.get('/store/inventory', async (req, res) => {
  try {

    const allStocks = await Stock.find().sort({ createdAt: -1 });

    const stocks = allStocks.filter(s => s.paymentMethod !== 'Credit');
    const credits = allStocks.filter(s => s.paymentMethod === 'Credit');

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
router.get('/store/add-stock', isManager, (req, res) => {

  res.render('stock-form');

});


router.post('/store/add-stock', isManager, upload.single('itemImage'), async (req, res) => {
  try {

    const {
      itemName,
      quantity,
      buyingPrice,
      sellingPrice,
      supplierName,
      supplierContact,
      deliveryDate,
      paymentMethod
    } = req.body;

    const totalValue = Number(quantity) * Number(buyingPrice);

    /* ================= BUSINESS RULE =================
       Selling price must be greater than buying price
    =================================================== */
    if (Number(sellingPrice) <= Number(buyingPrice)) {
      return res.status(400).send("Selling price must be greater than buying price");
    }

    const stock = new Stock({
      itemName,
      quantity,
      buyingPrice,
      sellingPrice,
      supplierName,
      supplierContact,
      deliveryDate,
      paymentMethod,
      itemImage: req.file ? req.file.filename : null,
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
router.get('/store/inventory/edit/:id', async (req, res) => {
  try {

    const stock = await Stock.findById(req.params.id);

    // FETCH ALL ITEMS
    const items = await Stock.find();

    res.render('edit-stock', {
      stock,
      items
    });

  } catch (error) {
    console.log(error);
    res.redirect('/store/inventory');
  }
});

router.post('/store/inventory/edit/:id', async (req, res) => {
  try {

    await Stock.findByIdAndUpdate(req.params.id, req.body);

    res.redirect('/store/inventory');

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