const express = require("express");
const router = express.Router();
const Sales = require("../models/Sales");
const Stock = require("../models/Stock");
const CreditSale = require("../models/CreditSale");
const Registration = require("../models/Registration");
const TransportRule = require("../models/TransportRule");
const { isAdmin } = require("../middleware/auth.js");

/* ==========================================================================
   ADMIN DASHBOARD
   ========================================================================== */
router.get("/admin", isAdmin, async (req, res) => {
  try {
    // 1. Existing Stats
    const salesAgg = await Sales.aggregate([
      { $group: { _id: null, grandTotal: { $sum: "$finaltotal" } } },
    ]);
    
    const inventoryAgg = await Stock.aggregate([
      { $group: { _id: null, grandExpenditure: { $sum: "$totalValue" } } },
    ]);

    // 2. NEW: Fetch Suppliers and Credit
    const supplierCount = await Supplier.countDocuments(); // Ensure this matches your Model name
    
    const creditAgg = await Credit.aggregate([
      { $group: { _id: null, totalOutstanding: { $sum: "$amountDue" } } },
    ]);

    // 3. Prepare the data
    const stats = {
      salesRevenue: salesAgg.length ? salesAgg[0].grandTotal : 0,
      inventoryValue: inventoryAgg.length ? inventoryAgg[0].grandExpenditure : 0,
    };
    
    const totalCredit = creditAgg.length ? creditAgg[0].totalOutstanding : 0;

    // 4. Pass EVERYTHING to the view
    res.render("admin-dashboard", { 
      stats, 
      supplierCount, 
      totalCredit 
    });

  } catch (error) {
    console.error("Dashboard calculation error:", error.message);
    req.flash("error", "Failed to calculate financial stats.");
    res.status(500).render("admin-dashboard", {
      stats: { salesRevenue: 0, inventoryValue: 0 },
      supplierCount: 0,
      totalCredit: 0
    });
  }
});

/* ==========================================================================
   REPORTS & SETTINGS LAYOUT ROUTES
   ========================================================================== */
router.get("/admin/reports", (req, res) => {
  res.render("admin-reports");
});

// SETTINGS PAGE
// GET: Render Settings Page
router.get("/admin/settings", isAdmin, async (req, res) => {
  try {
    // req.user is available because of your auth middleware
    const user = await Registration.findById(req.user._id);
    res.render("settings", { user });
  } catch (error) {
    console.error("Settings load error:", error);
    res.status(500).send("Error loading settings.");
  }
});

// POST: Update Profile Details (Name & Email)
router.post("/admin/profile/update", isAdmin, async (req, res) => {
  try {
    const { name, email } = req.body;
    await Registration.findByIdAndUpdate(req.user._id, {
      fullname: name, // Ensure this matches your Registration schema field name
      email: email.toLowerCase()
    });
    
    req.flash("success_msg", "Profile updated successfully.");
    res.redirect("/admin/settings");
  } catch (error) {
    console.error("Profile update error:", error);
    req.flash("error_msg", "Failed to update profile.");
    res.redirect("/admin/settings");
  }
});

// POST: Update Password
router.post("/admin/profile/update-password", isAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await Registration.findById(req.user._id);

    // Passport-local-mongoose provides the changePassword method
    user.changePassword(currentPassword, newPassword, (err) => {
      if (err) {
        req.flash("error_msg", "Current password incorrect or update failed.");
        return res.redirect("/admin/settings");
      }
      req.flash("success_msg", "Password updated successfully.");
      res.redirect("/admin/settings");
    });
  } catch (error) {
    console.error("Password change error:", error);
    res.redirect("/admin/settings");
  }
});

// TRANSPORT ROUTE
router.get("/admin/transport-rules", isAdmin, async (req, res) => {
  try {
    let rules = await TransportRule.findOne();
    // Initialize if empty
    if (!rules) {
      rules = await TransportRule.create({ freeRadius: 10, minOrder: 500000, deliveryFee: 30000 });
    }
    res.render("transport-rules", { rules });
  } catch (error) {
    console.error("Error loading transport settings:", error);
    res.status(500).send("Unable to load configuration.");
  }
});

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
        deliveryFee: Number(deliveryFee)
      });
    }
    req.flash("success_msg", "Transport rules updated successfully.");
    res.redirect("/admin/transport-rules");
  } catch (error) {
    console.error("Error updating rules:", error);
    res.status(500).send("Error updating transport configuration.");
  }
});

/* ==========================================================================
   CUSTOMER DEPOSITS / CREDIT SALES FORM
   ========================================================================== */
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

/* ==========================================================================
   PROCESS CUSTOMER DEPOSITS / CREDIT SALES SUBMISSION
   ========================================================================== */
router.post("/admin/deposits", isAdmin, async (req, res) => {
  const stockItemsList = await Stock.find({
    $or: [{ currentQuantity: { $gt: 0 } }, { quantity: { $gt: 0 } }],
  }).sort({ itemName: 1 });

  let {
    customerName,
    customerAddress,
    customerContact,
    nin,
    paymentType,
    amountPaid,
    notes,
    distance,
  } = req.body;

  let errors = {};
  if (!customerName || !customerName.trim())
    errors.customerName = { msg: "Customer profile name is required." };

  if (!customerAddress || !customerAddress.trim())
    errors.customerAddress = { msg: "Delivery address is required." };

  const phoneRegex = /^\+256[7643]\d{8}$/;
  if (!customerContact || !phoneRegex.test(customerContact.trim())) {
    errors.customerContact = {
      msg: "Provide a valid Ugandan contact number starting with +256.",
    };
  }

  const ninRegex = /^[A-Z0-9]{14}$/;
  if (!nin || !ninRegex.test(nin.trim().toUpperCase())) {
    errors.nin = {
      msg: "National Identification Number must be exactly 14 characters.",
    };
  }

  if (!req.body.items || typeof req.body.items !== "object") {
    errors.items = { msg: "Please add at least one physical product item." };
  }

  if (!paymentType)
    errors.paymentType = { msg: "Specify structural payment medium." };

  const paid = Number(amountPaid) || 0;
  if (paid < 0)
    errors.amountPaid = { msg: "Amount deposited cannot be a negative value." };

  if (Object.keys(errors).length > 0) {
    const firstErrorMessage = errors[Object.keys(errors)[0]].msg;
    return res.render("credit-sales-form", {
      items: stockItemsList,
      errors,
      oldData: req.body,
      messages: { error_msg: firstErrorMessage, success_msg: "" },
    });
  }

  try {
    let subtotal = 0;
    let itemsToSave = [];

    const payloadItems = Array.isArray(req.body.items)
      ? req.body.items
      : Object.values(req.body.items || {});

    for (let incoming of payloadItems) {
      if (!incoming || !incoming.itemId || !incoming.quantity) continue;

      const stockItem = await Stock.findById(incoming.itemId);
      if (!stockItem) continue;

      const qtyNeeded = Number(incoming.quantity);
      subtotal += stockItem.sellingPrice * qtyNeeded;

      itemsToSave.push({
        item: stockItem._id,
        quantity: qtyNeeded,
      });

      stockItem.currentQuantity -= qtyNeeded;
      await stockItem.save();
    }

    if (itemsToSave.length === 0) {
      return res.status(400).send("No valid items selected for transaction processing.");
    }

    // TRANSPORT VALIDATION
    // Fetch rules from DB, or fallback to constants if something goes wrong
    let activeRules = await TransportRule.findOne();
    const rules = activeRules || { freeRadius: 10, minOrder: 500000, deliveryFee: 30000 };

    const deliveryDistance = Number(distance) || 0;
    let transportFee = rules.deliveryFee; // Use the dynamic fee

    // Apply logic: Free if distance within radius AND subtotal meets threshold
    if (deliveryDistance <= rules.freeRadius && subtotal >= rules.minOrder) {
      transportFee = 0;
    } else {
      transportFee = 30000;
    }

    
    const finalTotal = subtotal + transportFee;
    const balance = finalTotal - paid;

    let status = "pending";
    if (balance <= 0) status = "cleared";
    else if (paid > 0) status = "partial";

    const currentAdminId = req.user ? req.user._id : null;
    const currentAdminName = req.user
      ? req.user.fullname || req.user.username
      : "System Attendant";

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
      distance: deliveryDistance,
      admin: currentAdminId,
      adminName: currentAdminName,
      status,
    });

    await creditSale.save();

    req.flash("success_msg", "Credit sales ticket safely created.");
    res.redirect(`/admin/depositreceipt/${creditSale._id}`);
  } catch (error) {
    console.error("Error processing credit transaction:", error);
    res.status(500).send("Fatal execution error within database pipelines");
  }
});

/* ==========================================================================
   CUSTOMER DEPOSITS TABLE / LISTING
   ========================================================================== */
router.get("/admin/deposit-details", isAdmin, async (req, res) => {
  try {
    const creditSales = await CreditSale.find()
      .populate("items.item")
      .populate("admin", "username fullname")
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

/* ==========================================================================
   USER MANAGEMENT (READ & CREATE)
   ========================================================================== */
router.get("/admin/users", isAdmin, async (req, res) => {
  try {
    const users = await Registration.find().sort({ createdAt: -1 });
    res.render("system-users", { users });
  } catch (error) {
    console.error("Error loading user profile list:", error);
    res.status(500).send("Error loading user records");
  }
});

router.get("/admin/add-user", (req, res) => {
  res.render("add-new-user", { errors: {}, oldData: {} });
});

router.post("/admin/add-user", isAdmin, async (req, res) => {
  let { username, email, phonenumber, nin, role, password, confirmPassword } =
    req.body;

  let errors = {};

  if (!username || !username.trim())
    errors.username = { msg: "Username validation identifier signature is required." };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email.trim())) {
    errors.email = { msg: "Provide a fully functional system email address." };
  }

  const phoneRegex = /^(07\d{8}|2567\d{8})$/;
  if (!phonenumber || !phoneRegex.test(phonenumber.trim())) {
    errors.phonenumber = { msg: "Must be a valid Ugandan format phone number (+256/07...)." };
  }

  const ninRegex = /^[A-Z0-9]{14}$/;
  if (!nin || !ninRegex.test(nin.trim().toUpperCase())) {
    errors.nin = { msg: "NIN data requires exactly 14 alphanumeric characters." };
  }

  if (!["sales_attendant", "store_manager", "admin"].includes(role)) {
    errors.role = { msg: "Invalid clearance user rule chosen." };
  }

  if (!password || password.length < 6) {
    errors.password = { msg: "Passwords must comprise at least 6 structural tokens." };
  }

  if (password !== confirmPassword) {
    errors.confirmPassword = { msg: "Identity verification mismatch. Input confirmation must match password." };
  }

  if (Object.keys(errors).length > 0) {
    return res.render("add-new-user", {
      errors,
      oldData: req.body,
    });
  }

  try {
    email = email.trim().toLowerCase();

    let existingUser = await Registration.findOne({ email });
    if (existingUser) {
      return res.render("add-new-user", {
        errors: { email: { msg: "This registration email is already bound to another active profile." } },
        oldData: req.body,
      });
    }

    const newUser = new Registration({
      username: username.trim(),
      email,
      phonenumber: phonenumber.trim(),
      nin: nin.trim().toUpperCase(),
      role,
    });

    await Registration.register(newUser, password);

    req.flash("success", "User profile registered successfully.");
    res.redirect("/admin/users");
  } catch (error) {
    console.error("Registration structural failure:", error);
    res.render("add-new-user", {
      errors: { global: { msg: error.message } },
      oldData: req.body,
    });
  }
});

/* ==========================================================================
   USER MANAGEMENT (EDIT & UPDATE)
   ========================================================================== */
router.get("/admin/users/edit/:id", isAdmin, async (req, res) => {
  try {
    const user = await Registration.findById(req.params.id);
    if (!user)
      return res.status(404).send("Identity document footprint not found.");

    res.render("edit-user", { user, errors: {} });
  } catch (error) {
    res.status(500).send("Error mapping identity records to views.");
  }
});

router.post("/admin/users/edit/:id", isAdmin, async (req, res) => {
  let { username, email, phonenumber, nin, role, isActive } = req.body;

  let errors = {};

  if (!username || !username.trim())
    errors.username = { msg: "Username profile field required." };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email.trim()))
    errors.email = { msg: "Enter valid operational electronic email format." };

  const phoneRegex = /^(07\d{8}|2567\d{8})$/;
  if (!phonenumber || !phoneRegex.test(phonenumber.trim()))
    errors.phonenumber = { msg: "Invalid contact details assignment scheme." };

  const ninRegex = /^[A-Z0-9]{14}$/;
  if (!nin || !ninRegex.test(nin.trim().toUpperCase()))
    errors.nin = { msg: "NIN context expects exactly 14 characters." };

  if (!["sales_attendant", "store_manager", "admin"].includes(role))
    errors.role = { msg: "Select valid profile clearance rule assignment." };

  if (Object.keys(errors).length > 0) {
    const userFallback = await Registration.findById(req.params.id);

    return res.render("edit-user", {
      user: { ...userFallback.toObject(), ...req.body, _id: req.params.id },
      errors,
    });
  }

  try {
    await Registration.findByIdAndUpdate(req.params.id, {
      username: username.trim(),
      email: email.trim().toLowerCase(),
      phonenumber: phonenumber.trim(),
      nin: nin.trim().toUpperCase(),
      role,
      isActive: isActive === "true",
    });

    req.flash("success", "User updates executed successfully.");
    res.redirect("/admin/users");
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal user profile database record adjustment error.");
  }
});

/* ==========================================================================
   USER MANAGEMENT (DELETE)
   ========================================================================== */
router.get("/admin/users/delete/:id", isAdmin, async (req, res) => {
  try {
    await Registration.findByIdAndDelete(req.params.id);
    req.flash("success", "Target authorization file cleanly removed.");
    res.redirect("/admin/users");
  } catch (error) {
    res.status(500).send("Error dropping identity node indexes.");
  }
});

/* ==========================================================================
   DEPOSIT RECEIPT GENERATOR
   ========================================================================== */
router.get("/admin/depositreceipt/:id", isAdmin, async (req, res) => {
  try {
    const sale = await CreditSale.findById(req.params.id)
      .populate("items.item")
      .populate("admin", "username fullname");

    if (!sale) {
      return res.status(404).send("Receipt document ledger instance traces clean (empty).");
    }

    res.render("deposit-receipt", { sale });
  } catch (error) {
    console.error(error);
    res.status(500).send("System calculation layout context initialization failed.");
  }
});

module.exports = router;