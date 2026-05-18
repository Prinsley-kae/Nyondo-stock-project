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
      .populate("attendant", "username fullname") 
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
      .populate("attendant", "username fullname") // Added fullname here as well
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
    const items = await Stock.find({ quantity: { $gt: 0 } });
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
    const { customerName, phoneNumber, customerAddress, distance } = req.body;
    const items = req.body.items || {};

    const itemIdsRaw = items.item ?? [];
    const quantitiesRaw = items.quantity ?? [];

    const itemIds = Array.isArray(itemIdsRaw) ? itemIdsRaw : [itemIdsRaw];
    const quantities = Array.isArray(quantitiesRaw) ? quantitiesRaw : [quantitiesRaw];

    let subtotal = 0;
    let processedItems = [];
    let transportFee = 30000;

    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i];
      const qty = Number(quantities[i]);

      if (!itemId || isNaN(qty) || qty <= 0) continue;

      const stockItem = await Stock.findById(itemId);
      if (!stockItem) continue;

      if (stockItem.quantity < qty) {
        return res.status(400).send(`Insufficient stock for ${stockItem.itemName}`);
      }

      const itemTotal = stockItem.sellingPrice * qty;

      stockItem.quantity -= qty;
      await stockItem.save();

      subtotal += itemTotal;

      processedItems.push({
        item: stockItem._id,
        quantity: qty,
        unitPrice: stockItem.sellingPrice,
        itemTotal
      });
    }

    if (processedItems.length === 0) {
      return res.status(400).send("No valid items selected for sale");
    }

    if (Number(distance) <= 10 && subtotal >= 500000) {
      transportFee = 0;
    } else {
      transportFee = 30000;
    }

    const finalTotal = subtotal + transportFee;

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
// SINGLE RECEIPT VIEW
// ======================================================
router.get("/sales/receipts/:id", isAttendantOrAdmin, async (req, res) => {
  try {
    const sale = await Sales.findById(req.params.id)
      .populate("items.item", "itemName sellingPrice")
      .populate("attendant", "username fullname");

    if (!sale) {
      return res.status(404).send("Receipt not found");
    }

    // NOTE: Make sure your Pug template file is named "receipt-view.pug" 
    // or rename this string to match your exact file name.
    res.render("receipts", { sale });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading receipt");
  }
});

// ======================================================
// DELETE RECEIPT (ADDED TO MATCH YOUR PUG ICON ACTION)
// ======================================================
router.get("/sales/receipts/delete/:id", isAttendantOrAdmin, async (req, res) => {
  try {
    const sale = await Sales.findById(req.params.id);
    
    if (!sale) {
      return res.status(404).send("Receipt record not found");
    }

    // Revert items back into stock inventory before deleting the record
    if (sale.items && sale.items.length) {
      for (const entry of sale.items) {
        await Stock.findByIdAndUpdate(entry.item, {
          $inc: { quantity: entry.quantity }
        });
      }
    }

    await Sales.findByIdAndDelete(req.params.id);
    
    // Redirect back cleanly to the printed receipts dashboard list
    res.redirect("/sales/printed-receipts");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error removing transaction records");
  }
});

// ======================================================
// GET: RENDER THE EDIT SALE PAGE WITH PRE-FILLED DATA
// ======================================================
router.get("/sales/add-sale/edit/:id", isAttendantOrAdmin, async (req, res) => {
  try {
    // Fetch the sale and populate its nested items
    const sale = await Sales.findById(req.params.id).populate("items.item");
    if (!sale) {
      return res.status(404).send("Sale record not found");
    }

    // Fetch all stock products currently available for the row dropdown selects
    const items = await Stock.find({ quantity: { $gt: 0 } });

    // Renders your updated edit pug file, passing the sale data and available stock options
    res.render("edit-sale", { sale, items });
  } catch (error) {
    console.error("Error loading edit page:", error);
    res.status(500).send("Error loading edit page");
  }
});

// ======================================================
// POST: PROCESS THE SALE UPDATE & ADJUST INVENTORY STOCK
// ======================================================
router.post("/sales/add-sale/edit/:id", isAttendantOrAdmin, async (req, res) => {
  try {
    // 1. Locate the original sale document
    const oldSale = await Sales.findById(req.params.id);
    if (!oldSale) {
      return res.status(404).send("Sale record not found");
    }

    // 2. REVERT OLD STOCK: Return previous quantities back to inventory before evaluating updates
    if (oldSale.items && oldSale.items.length) {
      for (const entry of oldSale.items) {
        await Stock.findByIdAndUpdate(entry.item, {
          $inc: { quantity: entry.quantity }
        });
      }
    }

    // 3. Extract incoming multi-row form payloads
    const { customerName, phoneNumber, customerAddress, distance } = req.body;
    const items = req.body.items || {};

    const itemIdsRaw = items.item ?? [];
    const quantitiesRaw = items.quantity ?? [];

    // Ensure values are treated uniformly as arrays
    const itemIds = Array.isArray(itemIdsRaw) ? itemIdsRaw : [itemIdsRaw];
    const quantities = Array.isArray(quantitiesRaw) ? quantitiesRaw : [quantitiesRaw];

    let subtotal = 0;
    let processedItems = [];
    let transportFee = 30000;

    // 4. Process and validate the updated item selections
    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i];
      const qty = Number(quantities[i]);

      if (!itemId || isNaN(qty) || qty <= 0) continue;

      const stockItem = await Stock.findById(itemId);
      if (!stockItem) continue;

      // Check stock availability (remember, old stock was successfully added back above)
      if (stockItem.quantity < qty) {
        return res.status(400).send(`Insufficient stock for ${stockItem.itemName}`);
      }

      const itemTotal = stockItem.sellingPrice * qty;

      // Deduct the updated quantities from stock inventory
      stockItem.quantity -= qty;
      await stockItem.save();

      subtotal += itemTotal;
      processedItems.push({
        item: stockItem._id,
        quantity: qty,
        unitPrice: stockItem.sellingPrice,
        itemTotal
      });
    }

    // Fail-safe validation check
    if (processedItems.length === 0) {
      return res.status(400).send("No valid items selected for sale");
    }

    // 5. Recalculate Uganda shipping / transport metrics based on updated parameters
    if (Number(distance) <= 10 && subtotal >= 500000) {
      transportFee = 0;
    } else {
      transportFee = 30000;
    }

    const finalTotal = subtotal + transportFee;

    // 6. Mutate and commit the modifications onto the original document instance
    oldSale.customerName = customerName;
    oldSale.phoneNumber = phoneNumber;
    oldSale.customerAddress = customerAddress;
    oldSale.distance = Number(distance);
    oldSale.items = processedItems;
    oldSale.subtotal = subtotal;
    oldSale.transportFee = transportFee;
    oldSale.finalTotal = finalTotal;
    oldSale.attendant = req.user._id;

    await oldSale.save();

    // Clean redirection directly back onto the updated single receipt invoice layout
    res.redirect(`/sales/receipts/${oldSale._id}`);
  } catch (error) {
    console.error("Error updating sale transaction:", error);
    res.status(500).send("Error updating transaction record");
  }
});

module.exports = router;