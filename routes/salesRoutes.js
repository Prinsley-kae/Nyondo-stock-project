const express = require("express");
const router = express.Router();

const Sales = require("../models/Sales");
const Stock = require("../models/Stock");

const { isAttendantOrAdmin } = require("../middleware/auth");


// ======================================================
// SALES DASHBOARD
// ======================================================
router.get("/sales", isAttendantOrAdmin, (req, res) => {
  res.render("sales-dashboard");
});


// ======================================================
// PRINTED RECEIPTS
// ======================================================
router.get("/sales/printed-receipts", isAttendantOrAdmin, async (req, res) => {
  try {

    const sales = await Sales.find()
      .populate("items.item", "itemName sellingPrice")
      .populate("attendant", "username")
      .sort({ date: -1 });

    res.render("printed-receipts", { sales });

  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading printed receipts");
  }
});


// ======================================================
// SALES LIST
// ======================================================
router.get("/sales/sales-list", isAttendantOrAdmin, async (req, res) => {
  try {

    const sales = await Sales.find()
      .populate("items.item", "itemName sellingPrice")
      .populate("attendant", "username")
      .sort({ date: -1 });

    res.render("sales-list", { sales });

  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading sales table");
  }
});


// ======================================================
// ADD SALE PAGE
// ======================================================
router.get("/sales/add-sale", isAttendantOrAdmin, async (req, res) => {
  try {

    const items = await Stock.find({
      quantity: { $gt: 0 }
    });

    res.render("RealTimeSales-form", { items });

  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading sales page");
  }
});


// ======================================================
// CREATE SALE
// ======================================================
router.post("/sales/add-sale", isAttendantOrAdmin, async (req, res) => {
  try {

    const {
      customerName,
      phoneNumber,
      customerAddress,
      distance
    } = req.body;

    // ================= NORMALIZE ITEMS =================
    let itemsInput = req.body.items || [];

    if (!Array.isArray(itemsInput)) {
      itemsInput = Object.values(itemsInput);
    }

    let subtotal = 0;
    let processedItems = [];

    // ================= PROCESS ITEMS =================
    for (const row of itemsInput) {

      const itemId = row.item;
      const qty = Number(row.quantity);

      if (!itemId || qty <= 0) continue;

      const stockItem = await Stock.findById(itemId);

      if (!stockItem) continue;

      // ================= STOCK CHECK =================
      if (stockItem.quantity < qty) {
        return res
          .status(400)
          .send(`Insufficient stock for ${stockItem.itemName}`);
      }

      // ================= ITEM TOTAL =================
      const itemTotal = stockItem.sellingPrice * qty;

      // ================= REDUCE STOCK =================
      stockItem.quantity -= qty;
      await stockItem.save();

      // ================= GRAND SUBTOTAL =================
      subtotal += itemTotal;

      // ================= SAVE ITEM =================
      processedItems.push({
        item: stockItem._id,
        quantity: qty,
        unitPrice: stockItem.sellingPrice,
        itemTotal
      });
    }

    // ================= EMPTY ITEMS CHECK =================
    if (processedItems.length === 0) {
      return res.status(400).send("No valid items selected for sale");
    }

    // ================= TRANSPORT LOGIC =================
    let transportFee = 30000;

    if (Number(distance) <= 10 && subtotal >= 500000) {
      transportFee = 0;
    }

    // ================= FINAL TOTAL =================
    const finalTotal = subtotal + transportFee;

    // ================= SAVE SALE =================
    const newSale = new Sales({
      customerName,
      phoneNumber,
      customerAddress,
      distance: Number(distance),

      items: processedItems,

      subtotal,
      transportFee,
      finalTotal,

      attendant: req.user._id
    });

    await newSale.save();

    res.redirect(`/sales/receipts/${newSale._id}`);

  } catch (error) {
    console.error(error);
    res.status(500).send("Error saving sale");
  }
});


// ======================================================
// SINGLE RECEIPT
// ======================================================
router.get("/sales/receipts/:id", async (req, res) => {
  try {

    const sale = await Sales.findById(req.params.id)
      .populate("items.item", "itemName sellingPrice")
      .populate("attendant", "username");

    if (!sale) {
      return res.status(404).send("Receipt not found");
    }

    res.render("receipts", { sale });

  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading receipt");
  }
});

module.exports = router;