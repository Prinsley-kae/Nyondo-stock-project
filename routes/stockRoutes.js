const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Stock = require("../models/Stock");
const Report = require("../models/Report");
const { isManager, isManagerOrAdmin } = require("../middleware/auth");
const { generatePDF } = require("../services/pdfService");
const { body, validationResult } = require("express-validator");

  //  MULTER IMAGE CONFIGURATION
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "public/uploads"),
  filename: (req, file, cb) => {
    const safeName = file.originalname
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, "");
    cb(null, Date.now() + "-" + safeName);
  },
});
const upload = multer({ storage });

  //  HELPER: PHONE SANITIZER
const sanitizePhone = (phone) => {
  if (!phone) return "N/A";
  let clean = phone.toString().replace(/\D/g, "");
  if (clean.startsWith("256") && clean.length === 12) return "+" + clean;
  if (clean.startsWith("0") && clean.length === 10)
    return "+256" + clean.substring(1);
  if (clean.length === 9 && (clean.startsWith("7") || clean.startsWith("4")))
    return "+256" + clean;
  return phone;
};

  //  DASHBOARD ROUTE
router.get("/store", isManager, async (req, res) => {
  try {
    const all = await Stock.find();
    const inventoryValue = all
      .filter((s) => (s.paymentMethod || "").toLowerCase() !== "credit")
      .reduce(
        (sum, s) =>
          sum + (Number(s.currentQuantity) || 0) * (Number(s.buyingPrice) || 0),
        0,
      );
    const totalCurrentQuantity = all.reduce(
      (sum, s) => sum + (Number(s.currentQuantity) || 0),
      0,
    );
    const lowStockItems = all.filter(
      (s) => Number(s.currentQuantity || 0) <= 100,
    );
    const suppliers = new Set(
      all.map((s) => s.companyName || s.supplierName).filter(Boolean),
    ).size;
    const projectedProfit = all
      .filter((s) => (s.paymentMethod || "").toLowerCase() !== "credit")
      .reduce((sum, s) => {
        const profitPerItem =
          (Number(s.sellingPrice) || 0) - (Number(s.buyingPrice) || 0);
        return sum + (Number(s.currentQuantity) || 0) * profitPerItem;
      }, 0);

    res.render("stock-dashboard", {
      currentPath: "/store",
      stats: {
        inventoryValue,
        totalCurrentQuantity,
        suppliers,
        projectedProfit,
        lowStockItems: lowStockItems.length,
      },
      lowStockItems,
      user: req.user,
    });
  } catch (error) {
    res.status(500).send("Dashboard error: " + error.message);
  }
});


  //  INVENTORY & CREDITS
router.get("/store/inventory", isManager, async (req, res) => {
  const stocks = await Stock.find({ paymentMethod: { $ne: "credit" } }).sort({
    createdAt: -1,
  });
  const soldStocks = stocks.filter(
    (s) => s.originalQuantity > s.currentQuantity,
  );
  res.render("stock-list", { stocks, soldStocks, user: req.user });
});

router.get("/store/credits", isManager, async (req, res) => {
  const credits = await Stock.find({ paymentMethod: "credit" }).sort({
    createdAt: -1,
  });
  res.render("supplier-credits", { credits, user: req.user });
});

  //  ADD / EDIT / DELETE STOCK
router.get("/store/add-stock", isManager, (req, res) => {
  res.render("stock-form", { user: req.user });
});

router.post(
  "/store/add-stock",
  isManager,
  upload.single("itemImage"),
  async (req, res) => {
    // 1. Debugging: Ensure form data is reaching the server
    console.log("REQ.BODY:", req.body);
    console.log("REQ.FILE:", req.file);

    const {
      itemName,
      quantity,
      buyingPrice,
      sellingPrice,
      supplierName,
      companyName,
      supplierContact,
    } = req.body;

    const errors = {};

    // 2. STRICT VALIDATION: Catch missing AND invalid data
    if (!itemName || itemName === "-- Select Item --") {
      errors.itemName = { msg: "Please select a valid item" };
    }

    if (!quantity || isNaN(quantity) || Number(quantity) < 1) {
      errors.quantity = { msg: "Quantity is required and must be 1 or more" };
    }

    if (!buyingPrice || Number(buyingPrice) <= 0) {
      errors.buyingPrice = { msg: "Buying price is required and must be greater than 0" };
    }

    if (!sellingPrice || Number(sellingPrice) <= Number(buyingPrice)) {
      errors.sellingPrice = {
        msg: "Selling price is required and must be greater than buying price",
      };
    }

    if (!supplierName || supplierName.trim().split(/\s+/).length < 2) {
      errors.supplierName = { msg: "Supplier name must include first and last name" };
    }

    if (!companyName || companyName.trim().length < 3) {
      errors.companyName = { msg: "Enter a valid company name" };
    }

    if (!supplierContact || !/^7[0-9]{8}$/.test(supplierContact)) {
      errors.supplierContact = {
        msg: "Contact must start with 7 and be 9 digits",
      };
    }

    // 3. RENDER ERRORS IF FOUND
    if (Object.keys(errors).length > 0) {
      return res.render("stock-form", {
        errors,
        data: req.body, // Pass data back to keep form filled
        user: req.user,
      });
    }

    // 4. DATABASE SAVE
    try {
      const qtyVal = Number(quantity);
      const buyVal = Number(buyingPrice);

      const stock = new Stock({
        ...req.body,
        batchId: req.body.batchId || `BTCH-${Date.now().toString().slice(-8)}`,
        supplierContact: sanitizePhone(supplierContact),
        originalQuantity: qtyVal,
        currentQuantity: qtyVal,
        totalValue: qtyVal * buyVal,
        itemImage: req.file ? req.file.filename : null,
      });

      await stock.save();
      req.flash("success", "Stock added successfully!");
      res.redirect(`/store/receipts/intake/${stock._id}`);
    } catch (error) {
      console.error("Stock Save Error:", error);
      req.flash("error", "Server error. Please try again.");
      res.redirect("/store/add-stock");
    }
  }
);
// EDIT STOCK - GET
router.get("/store/inventory/edit/:id", isManager, async (req, res) => {
  try {
    const stock = await Stock.findById(req.params.id);

    if (!stock) {
      return res.status(404).send("Stock item not found.");
    }

    res.render("edit-stock", {
      stock,
      user: req.user,
    });
  } catch (error) {
    console.error("Error fetching stock for edit:", error);
    res.status(500).send("Error loading edit page.");
  }
});

// EDIT STOCK - POST
router.post(
  "/store/inventory/edit/:id",
  isManager,
  upload.single("itemImage"),
  async (req, res) => {
    try {
      const errors = {};
      const {
        itemName,
        originalQuantity,
        currentQuantity,
        buyingPrice,
        sellingPrice,
        supplierName,
        companyName,
        supplierContact,
        paymentMethod,
      } = req.body;

      // Helper to check if field is empty
      const isEmpty = (val) => !val || val.toString().trim() === "";

      // 1. MANDATORY "REQUIRED" VALIDATION
      const requiredFields = [
        "itemName", "originalQuantity", "currentQuantity", 
        "buyingPrice", "sellingPrice", "supplierName", 
        "companyName", "supplierContact"
      ];

      requiredFields.forEach((field) => {
        if (isEmpty(req.body[field])) {
          errors[field] = { msg: "This field is required" };
        }
      });

      // 2. BUSINESS LOGIC VALIDATION (Only if field is not already marked as empty)
      const bPrice = Number(buyingPrice);
      const sPrice = Number(sellingPrice);

      if (!errors.itemName && itemName === "-- Select Item --") {
        errors.itemName = { msg: "Please select a valid item" };
      }

      if (!errors.originalQuantity && (isNaN(originalQuantity) || Number(originalQuantity) < 1)) {
        errors.originalQuantity = { msg: "Original quantity must be 1 or more" };
      }

      if (!errors.currentQuantity && (isNaN(currentQuantity) || Number(currentQuantity) < 0)) {
        errors.currentQuantity = { msg: "Current quantity must be 0 or more" };
      }

      if (!errors.buyingPrice && bPrice <= 0) {
        errors.buyingPrice = { msg: "Buying price must be greater than 0" };
      }

      if (!errors.sellingPrice && sPrice <= bPrice) {
        errors.sellingPrice = { msg: "Selling price must be greater than buying price" };
      }

      if (!errors.supplierName && supplierName.trim().split(/\s+/).length < 2) {
        errors.supplierName = { msg: "Must include first and last name" };
      }

      if (!errors.companyName && companyName.trim().length < 3) {
        errors.companyName = { msg: "Enter a valid company name" };
      }

      if (!errors.supplierContact && !/^7[0-9]{8}$/.test(supplierContact)) {
        errors.supplierContact = { msg: "Contact must start with 7 and be 9 digits" };
      }

      // IF VALIDATION FAILS, RENDER EDIT PAGE WITH ERRORS
      if (Object.keys(errors).length > 0) {
        const stock = await Stock.findById(req.params.id);
        req.flash("error_msg", "Please correct the errors in the form.");
        return res.render("edit-stock", {
          stock,
          errors,
          formData: req.body,
        });
      }

      // 3. PREPARE UPDATE DATA
      const updateData = {
        itemName,
        originalQuantity: Number(originalQuantity),
        currentQuantity: Number(currentQuantity),
        buyingPrice: bPrice,
        sellingPrice: sPrice,
        supplierName,
        companyName,
        supplierContact: "+256" + supplierContact,
        paymentMethod,
      };

      if (req.file) {
        updateData.itemImage = req.file.filename;
      }

      // 4. UPDATE DATABASE
      const updatedStock = await Stock.findByIdAndUpdate(
        req.params.id,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!updatedStock) {
        req.flash("error_msg", "Stock item not found.");
        return res.redirect("/store/inventory");
      }

      req.flash("success_msg", "Stock item updated successfully!");
      res.redirect("/store/inventory");
      
    } catch (error) {
      console.error("Edit Update Error:", error);
      req.flash("error_msg", "Error updating stock: " + error.message);
      res.redirect("/store/inventory");
    }
  }
);

// DELETE STOCK
router.post("/store/inventory/delete/:id", isManager, async (req, res) => {
  try {
    const item = await Stock.findById(req.params.id);
    const isCredit = item && item.paymentMethod === "credit";
    await Stock.findByIdAndDelete(req.params.id);
    res.redirect(isCredit ? "/store/credits" : "/store/inventory");
  } catch (error) {
    res.redirect("/store/inventory");
  }
});


  //  PAYMENT & REPORTS
// 1. PAY & CLEAR DEBT (Updates status and redirects to Voucher)
router.post("/store/credits/pay/:id", isManager, async (req, res) => {
  try {
    const updatedItem = await Stock.findByIdAndUpdate(
      req.params.id,
      {
        paymentMethod: "cash",
        paymentDate: new Date(),
        voucherId: "VCH-" + Date.now().toString().slice(-6),
      },
      { new: true },
    );

    // Redirect to the voucher view for printing
    res.redirect(`/store/voucher/${updatedItem._id}`);
  } catch (error) {
    res.status(500).send("Error clearing debt: " + error.message);
  }
});

// 2. VIEW VOUCHER PAGE (The page that shows the 'PAID' status and details)
router.get("/store/voucher/:id", isManager, async (req, res) => {
  try {
    const item = await Stock.findById(req.params.id);
    if (!item) return res.status(404).send("Voucher not found");
    res.render("print-clearance", { item, user: req.user });
  } catch (error) {
    res.status(500).send("Error loading voucher.");
  }
});

// 3. PAYMENT HISTORY (Displays all items where paymentMethod is 'cash')
router.get("/store/payment-history", isManager, async (req, res) => {
  try {
    // Only fetch items that have been paid (cash)
    const paidItems = await Stock.find({ paymentMethod: "cash" }).sort({
      paymentDate: -1,
    });
    res.render("payment-history", { paidItems, user: req.user });
  } catch (error) {
    res.status(500).send("Error loading history.");
  }
});

// 4. DELETE PAYMENT RECORD
router.post("/store/delete-payment/:id", isManager, async (req, res) => {
  try {
    // Optional: Only allow deletion if it's a payment record
    await Stock.findByIdAndDelete(req.params.id);
    res.redirect("/store/payment-history");
  } catch (error) {
    res.status(500).send("Error deleting record.");
  }
});

router.get("/admin/stock-report", isManagerOrAdmin, async (req, res) => {
  const items = await Stock.find();
  let csv = "Item Name,Buying Price,Quantity,Total\n";
  items.forEach(
    (i) =>
      (csv += `"${i.itemName}","${i.buyingPrice}","${i.currentQuantity}","${i.totalValue}"\n`),
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="Inventory_Report.csv"',
  );
  res.send("\uFEFF" + csv);
});

router.get("/admin/credit-report", isManagerOrAdmin, async (req, res) => {
  const credits = await Stock.find({ paymentMethod: "credit" });
  let csv = "Item Name,Supplier,Amount Owed\n";
  credits.forEach(
    (i) =>
      (csv += `"${i.itemName}","${i.supplierName}","${i.buyingPrice * i.currentQuantity}"\n`),
  );
  res.send("\uFEFF" + csv);
});

router.get("/store/receipts/intake/:id", isManager, async (req, res) => {
  const item = await Stock.findById(req.params.id);
  res.render("print-intake", { item, user: req.user });
});

// REPORT GENERATION:
// --- 1. INVENTORY EVALUATION REPORT ---
router.get(
  "/store/reports/inventory-valuation",
  isManager,
  async (req, res) => {
    try {
      const stocks = await Stock.find({
        paymentMethod: { $ne: "credit" },
      }).sort({ createdAt: -1 });
      const totalValue = stocks.reduce(
        (sum, s) =>
          sum + (Number(s.currentQuantity) || 0) * (Number(s.buyingPrice) || 0),
        0,
      );

      req.app.render(
        "inventory-reports",
        { stocks, totalValue, user: req.user },
        async (err, html) => {
          if (err) return res.status(500).send("Report template error.");

          // 4. Save file physically to disk
          const dir = path.join(__dirname, "../public/reports");
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

          const pdf = await generatePDF(html);
          const filename = `Inventory_Valuation_${Date.now()}.pdf`;
          const filePath = path.join(dir, filename);
          fs.writeFileSync(filePath, pdf);

          // AUTO-SAVE TO DATABASE
          await Report.create({
            title: "Inventory Valuation Report",
            filename: filename,
            category: "Stock",
            generatedBy: req.user.fullname,
            startDate: new Date(),
            endDate: new Date(),
          });

          res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
          });
          res.send(pdf);
        },
      );
    } catch (error) {
      res.status(500).send("Failed: " + error.message);
    }
  },
);

// 2. SALES MOVEMENT REPORT 
router.get("/store/reports/sales-movement", isManager, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const items = await Stock.find({
      updatedAt: { $gte: start, $lte: end },
      $expr: { $gt: ["$originalQuantity", "$currentQuantity"] },
    }).sort({ updatedAt: -1 });

    req.app.render(
      "sales-movement",
      {
        items,
        startDate: start.toLocaleDateString("en-GB"),
        endDate: end.toLocaleDateString("en-GB"),
        user: req.user,
      },
      async (err, html) => {
        if (err) return res.status(500).send("Template error.");

        // 4. Save file physically to disk
        const dir = path.join(__dirname, "../public/reports");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const pdf = await generatePDF(html);
        const filename = `Sales_Movement_${Date.now()}.pdf`;
        const filePath = path.join(dir, filename);
        fs.writeFileSync(filePath, pdf);

        // AUTO-SAVE TO DATABASE
        await Report.create({
          title: `Sales Movement (${start.toLocaleDateString()} to ${end.toLocaleDateString()})`,
          filename: filename,
          category: "Sales",
          generatedBy: req.user.fullname,
          startDate: start,
          endDate: end,
        });

        res.set({
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
        });
        res.send(pdf);
      },
    );
  } catch (error) {
    res.status(500).send("Failed: " + error.message);
  }
});

// 3. CREDIT LIABILITY REPORT
router.get("/store/reports/credit-liability", isManager, async (req, res) => {
  try {
    const credits = await Stock.find({ paymentMethod: "credit" }).sort({
      createdAt: -1,
    });
    const totalDebt = credits.reduce(
      (sum, s) =>
        sum + (Number(s.buyingPrice) || 0) * (Number(s.currentQuantity) || 0),
      0,
    );

    req.app.render(
      "credit-report",
      { credits, totalDebt, user: req.user },
      async (err, html) => {
        if (err) return res.status(500).send("Template error.");

        // 4. Save file physically to disk
        const dir = path.join(__dirname, "../public/reports");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const pdf = await generatePDF(html);
        const filename = `Credit_Liability_${Date.now()}.pdf`;
        const filePath = path.join(dir, filename);
        fs.writeFileSync(filePath, pdf);

        // AUTO-SAVE TO DATABASE
        await Report.create({
          title: "Credit Liability Report",
          filename: filename,
          category: "Credit",
          generatedBy: req.user.fullname,
          startDate: new Date(),
          endDate: new Date(),
        });

        res.set({
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
        });
        res.send(pdf);
      },
    );
  } catch (error) {
    res.status(500).send("Failed: " + error.message);
  }
});

// REPORT HISTORY LIST 
router.get("/store/reports-history", isManager, async (req, res) => {
  try {
    // Filter by the user's FULL NAME string, because that is how you saved it
    const reports = await Report.find({ generatedBy: req.user.fullname }).sort({
      createdAt: -1,
    });

    res.render("report-history", {
      reports,
      dashboardUrl: "/store",
    });
  } catch (error) {
    res.status(500).send("Error: " + error.message);
  }
});

// DELETE REPORT 
router.delete(
  "/store/reports/delete/:id",
  isManagerOrAdmin,
  async (req, res) => {
    try {
      const report = await Report.findById(req.params.id);
      if (!report) return res.status(404).send("Report not found");

      // Construct physical file path
      const filePath = path.join(
        __dirname,
        "../public/reports",
        report.filename,
      );

      // Delete physical file if it exists
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Delete database record
      await Report.findByIdAndDelete(req.params.id);
      res.status(200).send("Deleted");
    } catch (error) {
      console.error("Delete Error:", error);
      res.status(500).send("Error deleting report.");
    }
  },
);

module.exports = router;
