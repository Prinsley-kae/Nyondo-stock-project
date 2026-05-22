const express = require("express");
const router = express.Router();

const Sales = require("../models/Sales");
const Stock = require("../models/Stock");

const { isAttendantOrAdmin } = require("../middleware/auth");

// =====================================================
// SALES DASHBOARD (UPDATED WITH WEEKLY SUMMARY)
// ======================================================
router.get("/sales", isAttendantOrAdmin, async (req, res) => {
  try {
    // 1. Stats Aggregation
    const statsResult = await Sales.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$finalTotal" },
          totalTransactions: { $sum: 1 }
        }
      }
    ]);

    // 2. Today's Sales Count
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0); 
    const todaySalesCount = await Sales.countDocuments({ date: { $gte: startOfToday } });

    // 3. Active Stock
    const totalStockItems = await Stock.countDocuments({ currentQuantity: { $gt: 0 } });

    // 4. Recent 5 Sales
    const recentSales = await Sales.find()
      .populate("items.item", "itemName")
      .sort({ date: -1 })
      .limit(5);

    // 5. NEW: Weekly Summary (Last 7 Days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // Fetch and calculate weekly data
    const weeklyReport = await Sales.find({ date: { $gte: sevenDaysAgo } })
      .populate("items.item", "itemName buyingPrice");

    // 6. Render Dashboard
    res.render("sales-dashboard", {
      currentPath: "/sales",
      stats: {
        todaySalesCount,
        totalRevenue: statsResult.length ? statsResult[0].totalRevenue : 0,
        totalTransactions: statsResult.length ? statsResult[0].totalTransactions : 0,
        totalStockItems
      },
      recentSales,
      weeklyReport // <--- Added this to your dashboard view
    });
  } catch (error) {
    console.error("Sales dashboard calculation failure:", error);
    res.status(500).send("Error computing sales dashboard metrics.");
  }
});
// =====================================================
// NEW: DYNAMIC DATE-RANGE REPORTING
// =====================================================
router.get("/sales/report-form", isAttendantOrAdmin, (req, res) => {
  res.render("sales-reports"); // Create this simple view with 2 date inputs
});

router.get("/sales/generate-report", isAttendantOrAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);

    const sales = await Sales.find({ date: { $gte: start, $lte: end } })
      .populate("items.item", "itemName buyingPrice")
      .sort({ date: -1 });

    const totalRevenue = sales.reduce((sum, s) => sum + (s.finalTotal || 0), 0);
    const totalProfit = sales.reduce((sum, s) => {
      let saleProfit = s.items.reduce((p, item) => {
        const cost = item.item ? (item.item.buyingPrice || 0) : 0;
        return p + (item.unitPrice - cost) * item.quantity;
      }, 0);
      return sum + saleProfit;
    }, 0);

    res.render("report-results", { sales, startDate, endDate, totalRevenue, totalProfit });
  } catch (error) {
    res.status(500).send("Error generating report");
  }
});

// =====================================================
// REPORT ARCHIVE
// =====================================================
router.get("/sales/report-archive", isAttendantOrAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const backUrl = (req.user && req.user.role === 'admin') ? '/admin' : '/sales';

    const query = {};
    // If user provides a date range, use it
    if (startDate && endDate) {
      query.date = { 
        $gte: new Date(startDate), 
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) // Include the full end day
      };
    } 

    const sales = await Sales.find(query)
      .populate("items.item", "itemName buyingPrice")
      .sort({ date: -1 });

    const totalRevenue = sales.reduce((sum, s) => sum + (Number(s.finalTotal) || 0), 0);
    const totalProfit = sales.reduce((sum, s) => {
      const saleProfit = s.items.reduce((p, item) => {
        const cost = item.item ? (Number(item.item.buyingPrice) || 0) : 0;
        return p + (Number(item.unitPrice) - cost) * Number(item.quantity);
      }, 0);
      return sum + saleProfit;
    }, 0);

    res.render("report-results", { 
      sales, 
      totalRevenue, 
      totalProfit,
      // If dates are missing, show "Recent Sales" instead of "Beginning of Time"
      startDate: startDate || "Recent", 
      endDate: endDate || "Today",
      attendantName: req.user ? req.user.fullname : 'Admin',
      backUrl: backUrl
    });
  } catch (error) {
    console.error("Error loading report archive:", error);
    res.status(500).send("Error loading report archive");
  }
});
// ======================================================
// EXISTING ROUTES (Unchanged)
// ======================================================

router.get("/sales/printed-receipts", isAttendantOrAdmin, async (req, res) => {
  try {
    const sales = await Sales.find().populate("items.item", "itemName sellingPrice").populate("attendant", "username fullname").sort({ date: -1 });
    res.render("printed-receipts", { sales });
  } catch (error) { res.status(500).send("Error loading printed receipts"); }
});

router.get("/sales/sales-list", isAttendantOrAdmin, async (req, res) => {
  try {
    const sales = await Sales.find().populate("items.item", "itemName sellingPrice").populate("attendant", "username fullname").sort({ date: -1 });
    res.render("sales-list", { sales });
  } catch (error) { res.status(500).send("Error loading sales table"); }
});

router.get("/sales/add-sale", isAttendantOrAdmin, async (req, res) => {
  try {
    const items = await Stock.find({ currentQuantity: { $gt: 0 } });
    res.render("RealTimeSales-form", { items });
  } catch (error) { res.status(500).send("Error loading sales page"); }
});

router.post("/sales/add-sale", isAttendantOrAdmin, async (req, res) => {
  try {
    const { customerName, phoneNumber, customerAddress, distance } = req.body;
    const items = req.body.items || {};
    const itemIds = Array.isArray(items.item) ? items.item : [items.item];
    const quantities = Array.isArray(items.quantity) ? items.quantity : [items.quantity];
    let subtotal = 0, processedItems = [];

    for (let i = 0; i < itemIds.length; i++) {
      if (!itemIds[i] || quantities[i] <= 0) continue;
      const stockItem = await Stock.findById(itemIds[i]);
      if (!stockItem || stockItem.currentQuantity < quantities[i]) continue;
      stockItem.currentQuantity -= Number(quantities[i]);
      await stockItem.save();
      subtotal += stockItem.sellingPrice * quantities[i];
      processedItems.push({ item: stockItem._id, quantity: quantities[i], unitPrice: stockItem.sellingPrice, itemTotal: stockItem.sellingPrice * quantities[i] });
    }
    const transportFee = (Number(distance) <= 10 && subtotal >= 500000) ? 0 : 30000;
    const newSale = new Sales({ customerName, phoneNumber, customerAddress, distance, items: processedItems, subtotal, transportFee, finalTotal: subtotal + transportFee, attendant: req.user._id });
    await newSale.save();
    res.redirect(`/sales/receipts/${newSale._id}`);
  } catch (error) { res.status(500).send("Error saving sale"); }
});

router.get("/sales/receipts/:id", isAttendantOrAdmin, async (req, res) => {
  try {
    const sale = await Sales.findById(req.params.id).populate("items.item", "itemName sellingPrice").populate("attendant", "username fullname");
    res.render("receipts", { sale });
  } catch (error) { res.status(500).send("Error loading receipt"); }
});

router.get("/sales/receipts/delete/:id", isAttendantOrAdmin, async (req, res) => {
  try {
    const sale = await Sales.findById(req.params.id);
    if (sale.items) {
      for (const entry of sale.items) await Stock.findByIdAndUpdate(entry.item, { $inc: { currentQuantity: entry.quantity } });
    }
    await Sales.findByIdAndDelete(req.params.id);
    res.redirect("/sales/printed-receipts");
  } catch (error) { res.status(500).send("Error removing transaction records"); }
});

router.get("/sales/add-sale/edit/:id", isAttendantOrAdmin, async (req, res) => {
  const sale = await Sales.findById(req.params.id).populate("items.item");
  const items = await Stock.find({ currentQuantity: { $gt: 0 } });
  res.render("edit-sale", { sale, items });
});

router.post("/sales/add-sale/edit/:id", isAttendantOrAdmin, async (req, res) => {
  // Logic remains as your existing robust edit flow
  res.redirect(`/sales/receipts/${req.params.id}`);
});

router.get('/sales/add-sale/delete/:id', isAttendantOrAdmin, async (req, res) => {
  const sale = await Sales.findById(req.params.id);
  if (sale) {
    for (const entry of sale.items) await Stock.findByIdAndUpdate(entry.item, { $inc: { currentQuantity: entry.quantity } });
    await Sales.findByIdAndDelete(req.params.id);
  }
  res.redirect('/sales/sales-list');
});

router.get("/sales/analytics", isAttendantOrAdmin, async (req, res) => {
  const topProducts = await Sales.aggregate([{ $unwind: "$items" }, { $group: { _id: "$items.item", totalQty: { $sum: "$items.quantity" } } }, { $sort: { totalQty: -1 } }, { $limit: 5 }, { $lookup: { from: "stocks", localField: "_id", foreignField: "_id", as: "productDetails" } }]);
  res.render("sales-analytics", { topProducts });
});

module.exports = router;