const express = require("express");
const router = express.Router();
const puppeteer = require("puppeteer");
const pug = require("pug");
const path = require("path");
const fs = require("fs");
const Sales = require("../models/Sales");
const Stock = require("../models/Stock");
const Report = require("../models/Report");
const { isAttendantOrAdmin, isAttendant } = require("../middleware/auth");


// SALES DASHBOARD 
router.get("/sales", isAttendant, async (req, res) => {
  try {
    // 1. Stats Aggregation
    const statsResult = await Sales.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$finalTotal" },
          totalTransactions: { $sum: 1 },
        },
      },
    ]);

    // 2. Today's Sales Count
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const todaySalesCount = await Sales.countDocuments({
      date: { $gte: startOfToday },
    });

    // 3. Active Stock
    const totalStockItems = await Stock.countDocuments({
      currentQuantity: { $gt: 0 },
    });

    // 4. Recent 5 Sales
    const recentSales = await Sales.find()
      .populate("items.item", "itemName")
      .sort({ date: -1 })
      .limit(5);

    // 5. NEW: Weekly Summary (Last 7 Days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Fetch and calculate weekly data
    const weeklyReport = await Sales.find({
      date: { $gte: sevenDaysAgo },
    }).populate("items.item", "itemName buyingPrice");

    // 6. Render Dashboard
    res.render("sales-dashboard", {
      currentPath: "/sales",
      stats: {
        todaySalesCount,
        totalRevenue: statsResult.length ? statsResult[0].totalRevenue : 0,
        totalTransactions: statsResult.length
          ? statsResult[0].totalTransactions
          : 0,
        totalStockItems,
      },
      recentSales,
      weeklyReport, 
    });
  } catch (error) {
    console.error("Sales dashboard calculation failure:", error);
    res.status(500).send("Error computing sales dashboard metrics.");
  }
});

// REPORT FORM
router.get("/sales/report-form", isAttendant, (req, res) => {
  res.render("sales-reports"); 
});

router.get("/sales/generate-report", isAttendant, async (req, res) => {
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
        const cost = item.item ? item.item.buyingPrice || 0 : 0;
        return p + (item.unitPrice - cost) * item.quantity;
      }, 0);
      return sum + saleProfit;
    }, 0);

    res.render("report-results", {
      sales,
      startDate,
      endDate,
      totalRevenue,
      totalProfit,
    });
  } catch (error) {
    res.status(500).send("Error generating report");
  }
});

// REPORT ARCHIVE
// 2. Generate PDF & Save Archive (The POST Route)
router.post("/sales/report-archive/pdf", isAttendant, async (req, res) => {
  let browser;
  try {
    const { reportTitle, startDate, endDate } = req.body;
    const start = new Date(startDate);
    const end = new Date(new Date(endDate).setHours(23, 59, 59, 999));

    // Fetch data
    const sales = await Sales.find({ date: { $gte: start, $lte: end } })
      .populate("items.item", "itemName buyingPrice")
      .populate("attendant", "fullname")
      .sort({ date: -1 });

    const totalRevenue = sales.reduce((sum, s) => sum + (s.finalTotal || 0), 0);
    const totalProfit = sales.reduce(
      (sum, s) =>
        sum +
        s.items.reduce(
          (p, item) =>
            p +
            (item.unitPrice - (item.item?.buyingPrice || 0)) * item.quantity,
          0,
        ),
      0,
    );

    // Get Attendant Name for the PDF
    const attendantName = req.user.fullname || req.user.username || "Staff";

    // Prepare HTML template with the new variables
    const html = pug.renderFile(
      path.join(__dirname, "../views/report-results.pug"),
      {
        sales,
        startDate,
        endDate,
        totalRevenue,
        totalProfit,
        reportTitle, 
        generatedBy: attendantName, 
        isPdf: true,
      },
    );

    // Handle Folder Creation automatically
    const dir = path.join(__dirname, "../public/reports");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filename = `Report_${Date.now()}.pdf`;
    const outputPath = path.join(dir, filename);

    // Generate PDF
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: outputPath, format: "A4", printBackground: true });
    await browser.close();

    // Save to Database
    await Report.create({
      title: reportTitle,
      filename: filename,
      generatedBy: attendantName,
      createdAt: new Date(),
    });

    res.download(outputPath);
  } catch (error) {
    if (browser) await browser.close();
    console.error("PDF/Archive error:", error);
    res
      .status(500)
      .send("Error generating and saving report: " + error.message);
  }
});

// REPORT LIST
router.get("/sales/reports/list", isAttendantOrAdmin, async (req, res) => {
  try {
    let query = {};

    // 1. If user is Store Manager, restrict them to 'Stock' reports only
    if (req.user.role === "store_manager") {
      query = { category: "Stock" };
    }

    // 2. Fetch reports based on the query (if manager, only stock; if admin/attendant, all)
    const reports = await Report.find(query).sort({ createdAt: -1 });

    // 3. Render the page, passing the current user's role so the UI knows what to show
    res.render("report-list", {
      reports,
      userRole: req.user.role,
      dashboardUrl: "/dashboard", 
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Unable to load report list.");
  }
});

// DELETE THE REPORT FROM THE ARCHIVE
router.get(
  "/sales/reports/list/delete/:id",
  isAttendantOrAdmin,
  async (req, res) => {
    try {
      // 1. Find the report record in the database
      const report = await Report.findById(req.params.id);
      if (!report) {
        return res.status(404).send("Report record not found in database.");
      }

      // 2. Construct the path to the physical file
      const filePath = path.join(
        __dirname,
        "../public/reports",
        report.filename,
      );

      // 3. Delete the physical file from the server if it exists
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // 4. Remove the record from MongoDB
      await Report.findByIdAndDelete(req.params.id);

      // 5. Redirect back to the archive list
      res.redirect("/sales/reports/list");
    } catch (error) {
      console.error("Delete Error:", error);
      res
        .status(500)
        .send("Error deleting the report record: " + error.message);
    }
  },
);

// PRINTED RECEIPTS
router.get("/sales/printed-receipts", isAttendant, async (req, res) => {
  try {
    const sales = await Sales.find()
      .populate("items.item", "itemName sellingPrice")
      .populate("attendant", "username fullname")
      .sort({ date: -1 });
    res.render("printed-receipts", { sales });
  } catch (error) {
    res.status(500).send("Error loading printed receipts");
  }
});

router.get("/sales/sales-list", isAttendantOrAdmin, async (req, res) => {
  try {
    const sales = await Sales.find()
      .populate("items.item", "itemName sellingPrice")
      .populate("attendant", "username fullname")
      .sort({ date: -1 });
    res.render("sales-list", { sales });
  } catch (error) {
    res.status(500).send("Error loading sales table");
  }
});

router.get("/sales/add-sale", isAttendantOrAdmin, async (req, res) => {
  try {
    const items = await Stock.find({ currentQuantity: { $gt: 0 } });
    res.render("RealTimeSales-form", { items });
  } catch (error) {
    res.status(500).send("Error loading sales page");
  }
});

// ADD SALE
router.post("/sales/add-sale", isAttendant, async (req, res) => {
  try {
    const {
      customerName,
      phoneNumber,
      customerAddress,
      deliveryMethod,
      distance,
    } = req.body;

    // 1. Data Collection
    const itemsInput = Array.isArray(req.body.items)
      ? req.body.items
      : req.body.items
        ? Object.values(req.body.items)
        : [];

    const errors = {};

    // 2. Validation Checks
    const rawPhone = req.body.phoneNumber || "";
    const fullPhoneNumber = "+256" + rawPhone;

    // New Regex: Starts with +256, then a 7, then 8 more digits
    const phoneRegex = /^\+2567\d{8}$/;

    const nameRegex = /^[A-Z][a-z]+(\s[A-Z][a-z]+)+$/;

    if (itemsInput.length === 0) {
      errors.general = "Cannot save an empty sale transaction record.";
    }

    if (!customerName || !nameRegex.test(customerName)) {
      errors.customerName =
        "Invalid name format. Use 'John Doe' (Capitalized with a space).";
    }

    // Validation logic for phone
    if (!rawPhone || !phoneRegex.test(fullPhoneNumber)) {
      errors.phoneNumber =
        "Invalid phone format. Must start with +2567 followed by 8 digits.";
    }
    // 3. Handle Errors (Manual render to keep form data and show messages)
    if (Object.keys(errors).length > 0) {
      if (errors.general) req.flash("error_msg", errors.general);
      else req.flash("error_msg", "Please correct the highlighted fields.");

      const items = await Stock.find({ currentQuantity: { $gt: 0 } });
      return res.render("RealTimeSales-form", {
        items,
        errors,
        formData: req.body,
        error_msg: req.flash("error_msg"),
        success_msg: req.flash("success_msg"),
      });
    }

    let subtotal = 0;
    let processedItems = [];

    // 4. Loop through structured payload matrix variables safely
    for (const record of itemsInput) {
      const itemId = record.itemId;
      const quantity = parseInt(record.quantity || 0, 10);

      if (!itemId || quantity <= 0) continue;

      const stockItem = await Stock.findById(itemId);
      if (!stockItem || stockItem.currentQuantity < quantity) {
        req.flash(
          "error_msg",
          `Insufficient stock or item not found for ID: ${itemId}`,
        );
        return res.redirect("/sales/add-sale");
      }

      // Deduct inventory quantities
      stockItem.currentQuantity -= quantity;
      await stockItem.save();

      const itemTotal = stockItem.sellingPrice * quantity;
      subtotal += itemTotal;

      processedItems.push({
        item: stockItem._id,
        quantity: quantity,
        unitPrice: stockItem.sellingPrice,
        itemTotal: itemTotal,
      });
    }

    // 5. DELIVERY LOGISTICS BUSINESS CALCULATIONS ENGINE
    let transportFee = 30000;
    const travelDistance = Number(distance || 0);

    if (deliveryMethod === "self-pick") {
      transportFee = 0;
    } else if (travelDistance <= 10 && subtotal >= 500000) {
      transportFee = 0;
    }

    const newSale = new Sales({
      customerName,
      phoneNumber,
      customerAddress,
      deliveryMethod,
      distance: travelDistance,
      items: processedItems,
      subtotal,
      transportFee,
      finalTotal: subtotal + transportFee,
      attendant: req.user._id,
    });

    await newSale.save();
    req.flash("success_msg", "Sale transaction completed successfully.");
    res.redirect(`/sales/receipts/${newSale._id}`);
  } catch (error) {
    console.error("Error processing sales collection payload:", error);
    req.flash("error_msg", "A system error occurred while saving the sale.");
    res.redirect("/sales/add-sale");
  }
});

router.get("/sales/receipts/:id", isAttendant, async (req, res) => {
  try {
    const sale = await Sales.findById(req.params.id)
      .populate("items.item", "itemName sellingPrice")
      .populate("attendant", "username fullname");
    res.render("receipts", { sale });
  } catch (error) {
    res.status(500).send("Error loading receipt");
  }
});

router.get("/sales/receipts/delete/:id", isAttendant, async (req, res) => {
  try {
    const sale = await Sales.findById(req.params.id);
    if (sale && sale.items) {
      for (const entry of sale.items) {
        await Stock.findByIdAndUpdate(entry.item, {
          $inc: { currentQuantity: entry.quantity },
        });
      }
    }
    await Sales.findByIdAndDelete(req.params.id);
    res.redirect("/sales/printed-receipts");
  } catch (error) {
    res.status(500).send("Error removing transaction records");
  }
});

router.get("/sales/add-sale/edit/:id", isAttendant, async (req, res) => {
  const sale = await Sales.findById(req.params.id).populate("items.item");
  const items = await Stock.find({ currentQuantity: { $gt: 0 } });
  res.render("edit-sale", { sale, items });
});

router.post("/sales/add-sale/edit/:id", isAttendant, async (req, res) => {
  try {
    const {
      customerName,
      phoneNumber,
      customerAddress,
      distance,
      deliveryMethod,
    } = req.body;

    // 1. Validation Logic
    const rawPhone = phoneNumber || "";
    const fullPhoneNumber = rawPhone.startsWith("+256")
      ? rawPhone
      : "+256" + rawPhone;
    const phoneRegex = /^\+2567\d{8}$/;
    const nameRegex = /^[A-Z][a-z]+(\s[A-Z][a-z]+)+$/;

    const errors = {};
    if (!customerName || !nameRegex.test(customerName))
      errors.customerName = "Invalid name. Use 'John Doe' format.";
    if (!rawPhone || !phoneRegex.test(fullPhoneNumber))
      errors.phoneNumber = "Invalid phone. Use 7XXXXXXXX format.";

    if (Object.keys(errors).length > 0) {
      const sale = await Sales.findById(req.params.id).populate("items.item");
      const items = await Stock.find({ currentQuantity: { $gt: 0 } });
      return res.render("edit-sale", {
        sale,
        items,
        errors,
        formData: req.body,
      });
    }

    // 2. Locate original sale
    const sale = await Sales.findById(req.params.id).populate("items.item");
    if (!sale) return res.status(404).send("Sale record not found.");

    // 3.  Add old items back to stock
    for (const entry of sale.items) {
      await Stock.findByIdAndUpdate(entry.item._id, {
        $inc: { currentQuantity: entry.quantity },
      });
    }

    // 4. : Deduct new quantities
    const itemsInput = Array.isArray(req.body.items.item)
      ? req.body.items.item.map((id, i) => ({
          itemId: id,
          quantity: parseInt(req.body.items.quantity[i]),
        }))
      : [
          {
            itemId: req.body.items.item,
            quantity: parseInt(req.body.items.quantity),
          },
        ];

    let subtotal = 0;
    let newProcessedItems = [];

    for (const record of itemsInput) {
      const stockItem = await Stock.findById(record.itemId);
      if (!stockItem || stockItem.currentQuantity < record.quantity) {
        throw new Error(`Insufficient stock for one of the items.`);
      }

      stockItem.currentQuantity -= record.quantity;
      await stockItem.save();

      subtotal += stockItem.sellingPrice * record.quantity;
      newProcessedItems.push({
        item: stockItem._id,
        quantity: record.quantity,
        unitPrice: stockItem.sellingPrice,
        itemTotal: stockItem.sellingPrice * record.quantity,
      });
    }

    // 5.  Save the sale record
    sale.customerName = customerName;
    sale.phoneNumber = fullPhoneNumber;
    sale.customerAddress = customerAddress;
    sale.distance = Number(distance || 0);
    sale.deliveryMethod = deliveryMethod;
    sale.items = newProcessedItems;
    sale.subtotal = subtotal;
    sale.transportFee = deliveryMethod === "self-pick" ? 0 : 30000;
    sale.finalTotal = sale.subtotal + sale.transportFee;

    await sale.save();

    req.flash("success_msg", "Transaction updated successfully.");
    res.redirect(`/sales/receipts/${sale._id}`);
  } catch (error) {
    console.error("Edit Sale Error:", error);
    req.flash("error_msg", "Update failed: " + error.message);
    res.redirect(`/sales/add-sale/edit/${req.params.id}`);
  }
});

router.get("/sales/add-sale/delete/:id", isAttendant, async (req, res) => {
  const sale = await Sales.findById(req.params.id);
  if (sale) {
    for (const entry of sale.items) {
      await Stock.findByIdAndUpdate(entry.item, {
        $inc: { currentQuantity: entry.quantity },
      });
    }
    await Sales.findByIdAndDelete(req.params.id);
  }
  res.redirect("/sales/sales-list");
});

router.get("/sales/analytics", isAttendantOrAdmin, async (req, res) => {
  const topProducts = await Sales.aggregate([
    { $unwind: "$items" },
    { $group: { _id: "$items.item", totalQty: { $sum: "$items.quantity" } } },
    { $sort: { totalQty: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: "stocks",
        localField: "_id",
        foreignField: "_id",
        as: "productDetails",
      },
    },
  ]);
  res.render("sales-analytics", { topProducts });
});

module.exports = router;
