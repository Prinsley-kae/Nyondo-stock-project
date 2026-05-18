const express = require('express');
const router = express.Router();
const multer = require('multer');

const Stock = require('../models/Stock');
const { isManager } = require('../middleware/auth');

/* ==========================================================================
   MULTER IMAGE CONFIGURATION
   ========================================================================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads');
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname
      .toLowerCase()
      .replace(/\s+/g, '-')          // Replace spaces with hyphens
      .replace(/[^a-z0-9.-]/g, ''); // Strip non-alphanumeric characters except dots/hyphens
    cb(null, Date.now() + '-' + safeName);
  }
});

const upload = multer({ storage });

/* ==========================================================================
   DASHBOARD ROUTE
   ========================================================================== */
router.get('/store', async (req, res) => {
  try {
    const all = await Stock.find();

    // Corrected to safely handle any case combinations for payment methods
    const inventoryValue = all
      .filter(s => (s.paymentMethod || '').toLowerCase() !== 'credit')
      .reduce((sum, s) => sum + (Number(s.quantity || 0) * Number(s.buyingPrice || 0)), 0);

    const totalStockItems = all.reduce(
      (sum, s) => sum + Number(s.quantity || 0),
      0
    );

    const lowStockItems = all.filter(
      s => Number(s.quantity || 0) <= 50
    );

    const suppliers = new Set(all.map(s => s.supplierName).filter(Boolean)).size;

    // Fixed template target name to match: store-dashboard.pug
    res.render('store-dashboard', {
      currentPath: '/store',
      stats: {
        inventoryValue,
        totalStockItems,
        suppliers,
        lowStockItems: lowStockItems.length
      },
      lowStockItems
    });

  } catch (error) {
    console.error("Dashboard error details:", error);
    res.status(500).send("Dashboard error");
  }
});

/* ==========================================================================
   INVENTORY & CREDIT TABLES ROUTE
   ========================================================================== */
router.get('/store/inventory', async (req, res) => {
  try {
    const allStocks = await Stock.find().sort({ createdAt: -1 });

    // FIXED Case Inconsistency: Convert strings to lowercase to ensure absolute matching accuracy
    const stocks = allStocks.filter(s => (s.paymentMethod || '').toLowerCase() !== 'credit');
    const credits = allStocks.filter(s => (s.paymentMethod || '').toLowerCase() === 'credit');

    // Fixed template target name to match: inventory.pug
    res.render('stock-list', {
      currentPath: '/store/inventory',
      stocks,
      credits
    });

  } catch (error) {
    console.error("Inventory rendering error:", error);
    res.render('inventory', {
      currentPath: '/store/inventory',
      stocks: [],
      credits: []
    });
  }
});

/* ==========================================================================
   ADD STOCK FUNCTIONALITY
   ========================================================================== */
router.get('/store/add-stock', isManager, (req, res) => {
  // Fixed template target name to match: add-stock.pug
  res.render('add-stock', {
    currentPath: '/store/add-stock'
  });
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
      quantity: Number(quantity),
      buyingPrice: Number(buyingPrice),
      sellingPrice: Number(sellingPrice),
      supplierName,
      supplierContact,
      deliveryDate: deliveryDate || new Date(),
      paymentMethod: (paymentMethod || 'cash_at_hand').toLowerCase(), // Normalize inputs to lowercase
      itemImage: req.file ? req.file.filename : null,
      totalValue
    });

    await stock.save();
    res.redirect('/store/inventory');

  } catch (error) {
    console.error("Error creating stock instance:", error);
    res.status(500).send('Error saving stock');
  }
});

/* ==========================================================================
   EDIT STOCK MODIFICATIONS
   ========================================================================== */
router.get('/store/inventory/edit/:id', async (req, res) => {
  try {
    const stock = await Stock.findById(req.params.id);
    const items = await Stock.find();

    res.render('edit-stock', {
      currentPath: '/store/inventory',
      stock,
      items
    });

  } catch (error) {
    console.error("Edit page load error:", error);
    res.redirect('/store/inventory');
  }
});

router.post('/store/inventory/edit/:id', async (req, res) => {
  try {
    const { quantity, buyingPrice } = req.body;
    
    // Recalculate total value on updates dynamically
    if (quantity && buyingPrice) {
      req.body.totalValue = Number(quantity) * Number(buyingPrice);
    }

    await Stock.findByIdAndUpdate(req.params.id, req.body, { runValidators: true });
    res.redirect('/store/inventory');

  } catch (error) {
    console.error("Update request execution error:", error);
    res.redirect('/store/inventory');
  }
});

/* ==========================================================================
   DELETE PERMANENT RECORD REMOVAL
   ========================================================================== */
router.post('/store/inventory/delete/:id', async (req, res) => {
  try {
    await Stock.findByIdAndDelete(req.params.id);
    res.redirect('/store/inventory');
  } catch (error) {
    console.error("Deletion lifecycle failure error:", error);
    res.redirect('/store/inventory');
  }
});

module.exports = router;