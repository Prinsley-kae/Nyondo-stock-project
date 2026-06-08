const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const Sales = require("../models/Sales");
const Stock = require("../models/Stock");
const CreditSale = require("../models/CreditSale");
const Registration = require("../models/Registration");
const TransportRule = require("../models/TransportRule");
const Report = require("../models/Report");
const { isAdmin } = require("../middleware/auth.js");

// NAME VALIDATION
const formatName = (name) => {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

// ADMIN DASHBOARD
router.get("/admin", isAdmin, async (req, res) => {
  try {
    // 1. Fetch only the core stats
    const [salesAgg, inventoryAgg, creditAgg, supplierCount] =
      await Promise.all([
        Sales.aggregate([
          { $group: { _id: null, grandTotal: { $sum: "$finalTotal" } } },
        ]).catch(() => []),
        Stock.aggregate([
          { $group: { _id: null, grandExpenditure: { $sum: "$totalValue" } } },
        ]).catch(() => []),
        CreditSale.aggregate([
          { $group: { _id: null, totalOutstanding: { $sum: "$balance" } } },
        ]).catch(() => []),
        Stock.distinct("companyName")
          .then((s) => s.length)
          .catch(() => 0),
      ]);

    // 2. Render dashboard with minimal, clean data
    res.render("admin-dashboard", {
      stats: {
        salesRevenue: salesAgg.length ? salesAgg[0].grandTotal : 0,
        inventoryValue: inventoryAgg.length
          ? inventoryAgg[0].grandExpenditure
          : 0,
      },
      supplierCount,
      totalCredit: creditAgg.length ? creditAgg[0].totalOutstanding : 0,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.render("admin-dashboard", {
      stats: { salesRevenue: 0, inventoryValue: 0 },
      supplierCount: 0,
      totalCredit: 0,
    });
  }
});

// SETTINGS PAGE
router.get("/admin/settings", isAdmin, async (req, res) => {
  try {
    const user = await Registration.findById(req.user._id);
    res.render("settings", { user });
  } catch (error) {
    console.error("Settings load error:", error);
    res.status(500).send("Error loading settings.");
  }
});

// PROFILE UPDATE
router.post("/admin/profile/update", isAdmin, async (req, res) => {
  try {
    const { name, email } = req.body;
    let errors = [];

    // 1. Full Name Validation (First Last format)
    if (!name || !/^[a-zA-Z]+ [a-zA-Z]+$/.test(name.trim())) {
      errors.push("Full name must be in 'First Last' format.");
    }

    // 2. Email Validation
    const emailLower = email ? email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
      errors.push("Please enter a valid email address.");
    }

    if (errors.length > 0) {
      req.flash("error_msg", errors.join(" "));
      return res.redirect("/admin/settings");
    }

    // 3. Update Profile
    await Registration.findByIdAndUpdate(req.user._id, {
      fullname: formatName(name), 
      email: emailLower,
    });

    req.flash("success_msg", "Profile updated successfully.");
    res.redirect("/admin/settings");
  } catch (error) {
    console.error("Profile update error:", error);
    req.flash("error_msg", "Failed to update profile.");
    res.redirect("/admin/settings");
  }
});

// TRANSPORT ROUTE
router.get("/admin/transport-rules", isAdmin, async (req, res) => {
  try {
    let rules = await TransportRule.findOne();
    if (!rules)
      rules = await TransportRule.create({
        freeRadius: 10,
        minOrder: 500000,
        deliveryFee: 30000,
      });

    res.render("transport-rules", { rules });
  } catch (error) {
    res.status(500).send("Unable to load configuration.");
  }
});

// POST ROUTE
router.post("/admin/transport-rules/update", isAdmin, async (req, res) => {
  try {
    const { freeRadius, minOrder, deliveryFee } = req.body;
    let rules = await TransportRule.findOne();

    if (rules) {
      rules.freeRadius = Number(freeRadius);
      rules.minOrder = Number(minOrder);
      rules.deliveryFee = Number(deliveryFee);
      await rules.save();
    } else {
      await TransportRule.create({
        freeRadius: Number(freeRadius),
        minOrder: Number(minOrder),
        deliveryFee: Number(deliveryFee),
      });
    }

    req.flash("success_msg", "Transport rules updated successfully.");
    res.redirect("/admin/transport-rules");
  } catch (error) {
    console.error("Error updating rules:", error);
    req.flash("error_msg", "Failed to update transport configuration.");
    res.redirect("/admin/transport-rules");
  }
});

// CUSTOMER CREDITS AND DEPOSITS FORM
router.get("/admin/deposits", isAdmin, async (req, res) => {
  try {
    const items = await Stock.find({
      $or: [{ currentQuantity: { $gt: 0 } }, { quantity: { $gt: 0 } }],
    }).sort({ itemName: 1 });

    res.render("credit-sales-form", {
      items: items || [],
      errors: {},
      oldData: {},
      messages: {
        error_msg: req.flash("error_msg"),
        success_msg: req.flash("success_msg"),
      },
    });
  } catch (error) {
    console.error("Error loading credit sales form:", error);
    res.render("credit-sales-form", { items: [], errors: {}, oldData: {} });
  }
});

router.post("/admin/deposits", isAdmin, async (req, res) => {
  const stockItemsList = await Stock.find({ currentQuantity: { $gt: 0 } }).sort(
    { itemName: 1 },
  );

  let {
    customerName,
    customerAddress,
    customerContact,
    nin,
    paymentType,
    amountPaid,
    notes,
    distance,
    deliveryMethod,
    items,
  } = req.body;

  let errors = {};

  //  Validations
  const nameRegex = /^[A-Za-z]+ [A-Za-z]+$/;

  if (!customerName || !nameRegex.test(customerName.trim())) {
    errors.customerName = {
      msg: "Customer name must be in 'First Last' format.",
    };
  } else {

    // 2. If valid, format it to ensure proper capitalization
    customerName = formatName(customerName);
  }

  if (!customerAddress || customerAddress.trim().length < 3) {
    errors.customerAddress = { msg: "Delivery address is required." };
  }
  if (!customerContact || !/^\+256[7643]\d{8}$/.test(customerContact.trim())) {
    errors.customerContact = {
      msg: "Valid contact required (e.g., +2567xxxxxxxx).",
    };
  }
  if (!nin || !/^[A-Z0-9]{14}$/.test(nin.trim().toUpperCase())) {
    errors.nin = { msg: "NIN must be exactly 14 characters." };
  }
  if (amountPaid === "" || amountPaid === undefined || Number(amountPaid) < 0) {
    errors.amountPaid = { msg: "Valid amount is required." };
  }

  // Logistics Validation Layer
  if (deliveryMethod === "self-pick") {
    distance = 0;
  } else {
    if (distance === "" || distance === undefined || Number(distance) < 0) {
      errors.distance = {
        msg: "Distance is required and must be 0 or greater for deliveries.",
      };
    }
  }

  if (!items || Object.keys(items).length === 0) {
    errors.items = { msg: "Please add at least one physical item." };
  } else {
    for (let key in items) {
      if (!items[key].itemId || Number(items[key].quantity) <= 0) {
        errors.items = {
          msg: "All selected items must have a valid quantity.",
        };
        break;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.render("credit-sales-form", {
      items: stockItemsList,
      errors,
      oldData: req.body,
    });
  }

  try {
    let subtotal = 0;
    let itemsToSave = [];
    let stockItemsToUpdate = [];

    // PASS 1: Read and validate ALL stock values before changing anything in the DB
    for (let key in items) {
      const incoming = items[key];
      const stockItem = await Stock.findById(incoming.itemId);
      const qty = Number(incoming.quantity);

      if (!stockItem || stockItem.currentQuantity < qty) {
        return res.render("credit-sales-form", {
          items: stockItemsList,
          errors: {
            items: {
              msg: `Insufficient stock for ${stockItem ? stockItem.itemName : "selected item"}.`,
            },
          },
          oldData: req.body,
        });
      }

      subtotal += stockItem.sellingPrice * qty;
      itemsToSave.push({ item: stockItem._id, quantity: qty });

      // Stage the updates in memory instead of executing immediately
      stockItemsToUpdate.push({
        document: stockItem,
        targetQuantity: stockItem.currentQuantity - qty,
      });
    }

    // PASS 2: If Pass 1 cleared completely, safe execution of stock reduction begins
    for (let update of stockItemsToUpdate) {
      update.document.currentQuantity = update.targetQuantity;
      await update.document.save();
    }

    // Calculate transport logistics charges
    let transportFee = 0;
    if (deliveryMethod !== "self-pick") {
      const rules = (await TransportRule.findOne()) || {
        freeRadius: 10,
        minOrder: 500000,
        deliveryFee: 30000,
      };
      transportFee =
        Number(distance) <= rules.freeRadius && subtotal >= rules.minOrder
          ? 0
          : rules.deliveryFee;
    }

    const finalTotal = subtotal + transportFee;
    const paid = Number(amountPaid);
    const balance = finalTotal - paid;

    // Create invoices
    const creditSale = new CreditSale({
      customerName: customerName.trim(),
      customerAddress: customerAddress.trim(),
      customerContact: customerContact.trim(),
      nin: nin.trim().toUpperCase(),
      items: itemsToSave,
      paymentType,
      amountPaid: paid,
      notes,
      subtotal,
      transportFee,
      totalAmount: finalTotal,
      balance,
      distance: Number(distance),
      deliveryMethod: deliveryMethod || "delivery",
      admin: req.user._id,
      adminName: req.user.fullname || req.user.username,
      status: balance <= 0 ? "cleared" : "partial",
    });

    await creditSale.save();
    res.redirect(`/admin/depositreceipt/${creditSale._id}`);
  } catch (err) {
    console.error("Credit Sale Error Logs:", err);
    res
      .status(500)
      .send("A server application handling exception has materialised.");
  }
});

// DEPOSITS TABLE(GET)
router.get("/admin/deposit-details", isAdmin, async (req, res) => {
  try {
    const creditSales = await CreditSale.find()
      .populate("items.item")
      .populate("admin", "fullname")
      .sort({ createdAt: -1 });

    res.render("credit-sales-list", {
      creditSales,
      deposits: creditSales,
    });
  } catch (error) {
    console.error("Error reading credit sales ledger items:", error);
    res.status(500).send("Error loading transaction database logs.");
  }
});

// DELETE DEPOSIT
router.post("/admin/deposit-details/delete/:id", isAdmin, async (req, res) => {
  try {
    const deletedSale = await CreditSale.findByIdAndDelete(req.params.id);

    if (!deletedSale) {
      req.flash("error_msg", "Record not found.");
      return res.redirect("/admin/deposit-details");
    }

    req.flash("success_msg", "Credit sale record deleted successfully.");
    res.redirect("/admin/deposit-details");
  } catch (error) {
    console.error("Delete error:", error);
    req.flash("error_msg", "Failed to delete record.");
    res.redirect("/admin/deposit-details");
  }
});

// CREDIT FOLLOW UP LEDGER
router.get("/admin/credit-follow-up", isAdmin, async (req, res) => {
  try {
    const pendingSales = await CreditSale.find({
      $expr: { $gt: ["$totalAmount", "$amountPaid"] },
    }).sort({ createdAt: -1 });

    res.render("credit-follow-up", { pendingSales });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Could not load follow-up ledger");
    res.redirect("/admin");
  }
});

  //  PROCESS NEW CREDIT DEPOSIT PAYMENT (GET & POST)

router.get("/admin/deposits/edit/:id", isAdmin, async (req, res) => {
  try {
    const sale = await CreditSale.findById(req.params.id).populate(
      "items.item",
    );
    if (!sale) {
      req.flash("error_msg", "Credit record not found.");
      return res.redirect("/admin/credit-follow-up");
    }
    res.render("pay-debt", { sale });
  } catch (error) {
    console.error("Error loading payment view:", error);
    res.status(500).send("Error loading asset configuration parameters.");
  }
});

router.post("/admin/deposits/update/:id", isAdmin, async (req, res) => {
  try {
    const paymentAmount = parseFloat(req.body.paymentAmount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      req.flash("error_msg", "Please enter a valid payment amount.");
      return res.redirect(`/admin/deposits/edit/${req.params.id}`);
    }

    const sale = await CreditSale.findById(req.params.id);
    if (!sale) {
      req.flash("error_msg", "Record tracking identity missing.");
      return res.redirect("/admin/credit-follow-up");
    }

    const currentBalance = sale.totalAmount - sale.amountPaid;
    if (paymentAmount > currentBalance) {
      req.flash(
        "error_msg",
        "Payment amount cannot exceed the active outstanding balance.",
      );
      return res.redirect(`/admin/deposits/edit/${req.params.id}`);
    }

    const newAmountPaid = sale.amountPaid + paymentAmount;
    const newBalance = sale.totalAmount - newAmountPaid;
    const newStatus = newBalance <= 0 ? "cleared" : "partial";

    await CreditSale.findByIdAndUpdate(req.params.id, {
      $set: {
        amountPaid: newAmountPaid,
        balance: newBalance,
        status: newStatus,
        notes: req.body.notes || sale.notes,
      },
    });

    req.flash(
      "success_msg",
      "Payment logged and balance updated successfully.",
    );
    res.redirect("/admin/credit-follow-up");
  } catch (error) {
    console.error("Payment registration database failure:", error);
    res
      .status(500)
      .send("Database configuration failure updating balance sheet rows.");
  }
});

  //  DEBT CLEARANCE RECEIPT ROUTE
router.get("/admin/receipt/:id", isAdmin, async (req, res) => {
  try {
    const sale = await CreditSale.findById(req.params.id)
      .populate("items.item")
      .populate("admin", "username fullname");

    if (!sale) {
      return res
        .status(404)
        .send("Requested invoice or historical log not found.");
    }
    res.render("debt-receipt", { sale });
  } catch (error) {
    console.error("Error generating text receipt document context:", error);
    res.status(500).send("Internal invoice rendering logic exception.");
  }
});

  //  AJAX ASYNCHRONOUS CREDIT RECORD DELETION
router.delete("/admin/deposits/delete/:id", isAdmin, async (req, res) => {
  try {
    const targetDoc = await CreditSale.findByIdAndDelete(req.params.id);
    if (!targetDoc) {
      return res.status(404).json({
        success: false,
        message: "Target record could not be located.",
      });
    }
    res.json({
      success: true,
      message: "Credit record cleanly dropped from databases.",
    });
  } catch (error) {
    console.error(
      "Asynchronous execution route exception handling deletion:",
      error,
    );
    res.status(500).json({
      success: false,
      message: "Server database structural index omission error.",
    });
  }
});

  //  USER MANAGEMENT (READ & CREATE)
router.get("/admin/users", isAdmin, async (req, res) => {
  try {
    const users = await Registration.find().sort({ createdAt: -1 });
    res.render("system-users", { users });
  } catch (error) {
    console.error("Error loading user profile list:", error);
    res.status(500).send("Error loading user records");
  }
});

// ADD NEW USER
router.get("/admin/add-user", (req, res) => {
  res.render("add-new-user", { errors: {}, oldData: {} });
});

router.post("/admin/add-user", isAdmin, async (req, res) => {

  let { username, email, phonenumber, nin, role, password, confirmPassword } =
    req.body;
  let errors = {};

  // 1. Empty Form Check
  if (!username || !email || !phonenumber || !nin || !password) {
    return res.render("add-new-user", {
      errors: { global: { msg: "All fields are required." } },
      oldData: req.body,
    });
  }

  // 2. Name Validation (John Doe)
  if (!/^[a-zA-Z]+ [a-zA-Z]+$/.test(username.trim())) {
    errors.username = {
      msg: "Please enter First and Last name (e.g., John Doe).",
    };
  }

  // 3. Email Validation (Small letters, no spaces, uniqueness check)
  const emailLower = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
    errors.email = { msg: "Enter a valid email address." };
  } else {
    const existingUser = await Registration.findOne({ email: emailLower });
    if (existingUser) errors.email = { msg: "Email is already registered." };
  }

  // 4. Phone Validation (Strictly +2567...)
  if (!/^\+2567\d{8}$/.test(phonenumber.trim())) {
    errors.phonenumber = {
      msg: "Phone must start with +2567 and be 12 digits total.",
    };
  }

  // 5. NIN Validation (14 chars, A-Z and 0-9 only)
  if (!/^[A-Z0-9]{14}$/.test(nin.trim().toUpperCase())) {
    errors.nin = {
      msg: "NIN must be 14 characters (Uppercase & Numbers only).",
    };
  }

  // 6. Password Complexity (8+ chars, upper, lower, number, special)
  const passRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passRegex.test(password)) {
    errors.password = {
      msg: "Password must be 8+ chars with uppercase, lowercase, number, and special character.",
    };
  }
  if (password !== confirmPassword) {
    errors.confirmPassword = { msg: "Passwords do not match." };
  }

  if (Object.keys(errors).length > 0) {
    return res.render("add-new-user", { errors, oldData: req.body });
  }

  try {
    const newUser = new Registration({
      fullname: formatName(username),
      email: emailLower,
      phonenumber: phonenumber.trim(),
      nin: nin.trim().toUpperCase(),
      role,
    });
    await Registration.register(newUser, password);
    req.flash("success", "User created successfully.");
    res.redirect("/admin/users");
  } catch (error) {
    res.render("add-new-user", {
      errors: { global: { msg: "System Error: " + error.message } },
      oldData: req.body,
    });
  }
});

  //  USER MANAGEMENT (EDIT & UPDATE)
router.get("/admin/users/edit/:id", isAdmin, async (req, res) => {
  try {
    // 1. Fetch the user by the ID provided in the URL
    const user = await Registration.findById(req.params.id);

    // 2. If no user is found, redirect back to the user list with an error
    if (!user) {
      req.flash("error_msg", "User identity record not found.");
      return res.redirect("/admin/users");
    }

    // 3. Render the edit page and pass the user object
    res.render("edit-user", {
      user: user,
      errors: {},
    });
  } catch (error) {
    console.error("Error loading user edit form:", error);
    res
      .status(500)
      .send("Database configuration failure retrieving user profile.");
  }
});

router.post("/admin/users/edit/:id", isAdmin, async (req, res) => {
  // 1. Destructure all fields, including isActive
  let { username, email, phonenumber, nin, role, isActive } = req.body;
  let errors = {};
  const emailLower = email.trim().toLowerCase();

  // 2. Validation
  if (!/^[a-zA-Z]+ [a-zA-Z]+$/.test(username.trim()))
    errors.username = { msg: "Format must be 'First Last'." };

  if (!/^\+2567\d{8}$/.test(phonenumber.trim()))
    errors.phonenumber = { msg: "Phone must start with +2567." };

  if (!/^[A-Z0-9]{14}$/.test(nin.trim().toUpperCase()))
    errors.nin = { msg: "NIN must be 14 alphanumeric chars." };

  const duplicate = await Registration.findOne({
    email: emailLower,
    _id: { $ne: req.params.id },
  });

  if (duplicate) errors.email = { msg: "This email is already taken." };

  if (Object.keys(errors).length > 0) {
    const user = await Registration.findById(req.params.id);
    return res.render("edit-user", {
      user: { ...user.toObject(), ...req.body },
      errors,
    });
  }

  // 3. Update using correct schema keys
  await Registration.findByIdAndUpdate(req.params.id, {
    fullname: formatName(username),
    email: emailLower,
    phonenumber: phonenumber.trim(),
    nin: nin.trim().toUpperCase(),
    role: role,
    isActive: isActive === "true",
  });

  req.flash("success", "User updated.");
  res.redirect("/admin/users");
});

  //  USER MANAGEMENT (DELETE)
router.get("/admin/users/delete/:id", isAdmin, async (req, res) => {
  try {
    await Registration.findByIdAndDelete(req.params.id);
    req.flash("success", "Target authorization file cleanly removed.");
    res.redirect("/admin/users");
  } catch (error) {
    res.status(500).send("Error dropping identity node indexes.");
  }
});


  //  DEPOSIT RECEIPT GENERATOR
router.get("/admin/depositreceipt/:id", isAdmin, async (req, res) => {
  try {
    const sale = await CreditSale.findById(req.params.id)
      .populate("items.item")
      .populate("admin", "username fullname");

    if (!sale) {
      return res
        .status(404)
        .send("Receipt document ledger instance traces clean (empty).");
    }

    res.render("deposit-receipt", { sale });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send("System calculation layout context initialization failed.");
  }
});

// REPORT: OUTSTANDING CREDIT LEDGER REPORT
router.get("/admin/credit-ledger", isAdmin, async (req, res) => {
  try {
    // 1. Fetch debtors with populated fields
    const debtors = await CreditSale.find({ balance: { $gt: 0 } })
      .populate("items.item")
      .populate("admin", "fullname")
      .sort({ createdAt: 1 });

    const totalDebt = debtors.reduce((sum, sale) => sum + sale.balance, 0);
    const generatorName = req.user.fullname || req.user.username;

    // 2. Render HTML
    req.app.render(
      "credit-ledger",
      {
        debtors,
        totalDebt,
        adminName: generatorName,
        isPdf: true,
      },
      async (err, html) => {
        if (err) throw err;

        // 3. Generate PDF Buffer
        const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });
        const pdfBuffer = await page.pdf({
          format: "A4",
          landscape: true,
          printBackground: true,
        });
        await browser.close();

        // 4. Save file physically to disk
        const dir = path.join(__dirname, "../public/reports");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const filename = `Credit_Ledger_${Date.now()}.pdf`;
        const filePath = path.join(dir, filename);
        fs.writeFileSync(filePath, pdfBuffer);

        // 5. Save record to Database
        await Report.create({
          title: "Official Credit Ledger Report",
          filename: filename,
          category: "Credit",
          generatedBy: generatorName,
          createdAt: new Date(),
        });

        // 6. Send response
        res.set({
          "Content-Type": "application/pdf",
          "Content-Disposition": "inline; filename=credit-report.pdf",
        });
        res.send(pdfBuffer);
      },
    );
  } catch (error) {
    console.error("Puppeteer PDF error:", error);
    res.status(500).send("Failed to generate PDF.");
  }
});

module.exports = router;
