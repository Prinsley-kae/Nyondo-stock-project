const express = require('express');
const router = express.Router();
const multer = require('multer');
const Stock = require('../models/Stock');
const { isManager, isManagerOrAdmin } = require('../middleware/auth');

/* ==========================================================================
   MULTER IMAGE CONFIGURATION
   ========================================================================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads'),
  filename: (req, file, cb) => {
    const safeName = file.originalname.toLowerCase().replace(/[^a-z0-9.-]/g, '');
    cb(null, Date.now() + '-' + safeName);
  }
});
const upload = multer({ storage });

/* ==========================================================================
   HELPER: PHONE SANITIZER
   ========================================================================== */
const sanitizePhone = (phone) => {
  if (!phone) return 'N/A';
  let clean = phone.toString().replace(/\D/g, '');
  if (clean.startsWith('256') && clean.length === 12) return '+' + clean;
  if (clean.startsWith('0') && clean.length === 10) return '+256' + clean.substring(1);
  if (clean.length === 9 && (clean.startsWith('7') || clean.startsWith('4'))) return '+256' + clean;
  return phone; 
};

/* ==========================================================================
   DASHBOARD ROUTE
   ========================================================================== */
router.get('/store', isManager, async (req, res) => {
  try {
    const all = await Stock.find();
    const inventoryValue = all
      .filter(s => (s.paymentMethod || '').toLowerCase() !== 'credit')
      .reduce((sum, s) => sum + (Number(s.currentQuantity) || 0) * (Number(s.buyingPrice) || 0), 0);
    const totalCurrentQuantity = all.reduce((sum, s) => sum + (Number(s.currentQuantity) || 0), 0);
    const lowStockItems = all.filter(s => Number(s.currentQuantity || 0) <= 100);
    const suppliers = new Set(all.map(s => s.companyName || s.supplierName).filter(Boolean)).size;
    const projectedProfit = all
      .filter(s => (s.paymentMethod || '').toLowerCase() !== 'credit')
      .reduce((sum, s) => {
        const profitPerItem = (Number(s.sellingPrice) || 0) - (Number(s.buyingPrice) || 0);
        return sum + ((Number(s.currentQuantity) || 0) * profitPerItem);
      }, 0);

    res.render('stock-dashboard', {
      currentPath: '/store',
      stats: { inventoryValue, totalCurrentQuantity, suppliers, projectedProfit, lowStockItems: lowStockItems.length },
      lowStockItems,
      user: req.user
    });
  } catch (error) {
    res.status(500).send("Dashboard error: " + error.message);
  }
});

/* ==========================================================================
   INVENTORY & CREDITS
   ========================================================================== */
router.get('/store/inventory', isManager, async (req, res) => {
  const stocks = await Stock.find({ paymentMethod: { $ne: 'credit' } }).sort({ createdAt: -1 });
  const soldStocks = stocks.filter(s => (s.originalQuantity > s.currentQuantity));
  res.render('stock-list', { stocks, soldStocks, user: req.user });
});

router.get('/store/credits', isManager, async (req, res) => {
  const credits = await Stock.find({ paymentMethod: 'credit' }).sort({ createdAt: -1 });
  res.render('supplier-credits', { credits, user: req.user });
});

/* ==========================================================================
   ADD / EDIT / DELETE STOCK
   ========================================================================== */
router.get('/store/add-stock', isManager, (req, res) => {
  res.render('stock-form', { user: req.user });
});

router.post('/store/add-stock', isManager, upload.single('itemImage'), async (req, res) => {
  try {
    const qty = Number(req.body.quantity) || 0;
    const price = Number(req.body.buyingPrice) || 0;
    const stock = new Stock({
      ...req.body,
      batchId: req.body.batchId || `BATCH-${Date.now().toString().slice(-6)}`,
      supplierContact: sanitizePhone(req.body.supplierContact),
      originalQuantity: qty,
      currentQuantity: qty,
      totalValue: qty * price,
      itemImage: req.file ? req.file.filename : null
    });
    await stock.save();
    res.redirect(`/store/receipts/intake/${stock._id}`);
  } catch (error) {
    res.status(500).send('Error saving stock: ' + error.message);
  }
});

router.post('/store/inventory/edit/:id', isManager, upload.single('itemImage'), async (req, res) => {
  try {
    const updateData = { ...req.body, supplierContact: sanitizePhone(req.body.supplierContact) };
    if (req.file) updateData.itemImage = req.file.filename;
    await Stock.findByIdAndUpdate(req.params.id, updateData);
    res.redirect('/store/inventory');
  } catch (error) { res.status(500).send('Error updating stock'); }
});

router.post('/store/inventory/delete/:id', isManager, async (req, res) => {
  try {
    const item = await Stock.findById(req.params.id);
    const isCredit = item && item.paymentMethod === 'credit';
    await Stock.findByIdAndDelete(req.params.id);
    res.redirect(isCredit ? '/store/credits' : '/store/inventory');
  } catch (error) { res.redirect('/store/inventory'); }
});

/* ==========================================================================
   PAYMENT & REPORTS
   ========================================================================== */
// 1. PAY & CLEAR DEBT (Updates status and redirects to Voucher)
router.post('/store/credits/pay/:id', isManager, async (req, res) => {
  try {
    const updatedItem = await Stock.findByIdAndUpdate(
      req.params.id, 
      { 
        paymentMethod: 'cash', 
        paymentDate: new Date(), 
        voucherId: 'VCH-' + Date.now().toString().slice(-6) 
      }, 
      { new: true }
    );
    
    // Redirect to the voucher view for printing
    res.redirect(`/store/voucher/${updatedItem._id}`);
  } catch (error) { 
    res.status(500).send("Error clearing debt: " + error.message); 
  }
});

// 2. VIEW VOUCHER PAGE (The page that shows the 'PAID' status and details)
router.get('/store/voucher/:id', isManager, async (req, res) => {
  try {
    const item = await Stock.findById(req.params.id);
    if (!item) return res.status(404).send("Voucher not found");
    res.render('print-clearance', { item, user: req.user });
  } catch (error) {
    res.status(500).send("Error loading voucher.");
  }
});

// 3. PAYMENT HISTORY (Displays all items where paymentMethod is 'cash')
router.get('/store/payment-history', isManager, async (req, res) => {
  try {
    // Only fetch items that have been paid (cash)
    const paidItems = await Stock.find({ paymentMethod: 'cash' }).sort({ paymentDate: -1 });
    res.render('payment-history', { paidItems, user: req.user });
  } catch (error) {
    res.status(500).send("Error loading history.");
  }
});

// 4. DELETE PAYMENT RECORD
router.post('/store/delete-payment/:id', isManager, async (req, res) => {
  try {
    // Optional: Only allow deletion if it's a payment record
    await Stock.findByIdAndDelete(req.params.id);
    res.redirect('/store/payment-history');
  } catch (error) {
    res.status(500).send("Error deleting record.");
  }
});

router.get("/admin/stock-report", isManagerOrAdmin, async (req, res) => {
  const items = await Stock.find();
  let csv = "Item Name,Buying Price,Quantity,Total\n";
  items.forEach(i => csv += `"${i.itemName}","${i.buyingPrice}","${i.currentQuantity}","${i.totalValue}"\n`);
  res.setHeader('Content-Disposition', 'attachment; filename="Inventory_Report.csv"');
  res.send("\uFEFF" + csv);
});

router.get("/admin/credit-report", isManagerOrAdmin, async (req, res) => {
  const credits = await Stock.find({ paymentMethod: 'credit' });
  let csv = "Item Name,Supplier,Amount Owed\n";
  credits.forEach(i => csv += `"${i.itemName}","${i.supplierName}","${i.buyingPrice * i.currentQuantity}"\n`);
  res.send("\uFEFF" + csv);
});

router.get('/store/receipts/intake/:id', isManager, async (req, res) => {
  const item = await Stock.findById(req.params.id);
  res.render('print-intake', { item, user: req.user });
});

module.exports = router;