const express = require('express');
const router = express.Router();
const Sales = require("../models/Sales");
const Stock = require("../models/Stock");
const CreditSale = require('../models/CreditSale');

const Registration = require('../models/Registration');


/* =========================
   ADMIN DASHBOARD
========================= */
router.get('/admin', async (req, res) => {
  try {
    let stats = {
      salesRevenue: 0,
      inventoryValue: 0
    };

    const salesAgg = await Sales.aggregate([
      { $group: { _id: null, grandTotal: { $sum: "$total" } } }
    ]);

    stats.salesRevenue = salesAgg.length ? salesAgg[0].grandTotal : 0;

    const inventoryAgg = await Stock.aggregate([
      { $group: { _id: null, grandExpenditure: { $sum: "$totalValue" } } }
    ]);

    stats.inventoryValue = inventoryAgg.length ? inventoryAgg[0].grandExpenditure : 0;

    res.render('admin-dashboard', { stats });

  } catch (error) {
    console.log(error.message);
    res.status(500).send('Error in loading data');
  }
});


/* =========================
   REPORTS
========================= */
router.get('/admin/reports', (req, res) => {
  res.render('admin-reports');
});


/* =========================
   CUSTOMER DEPOSITS (FIXED)
========================= */
router.get('/admin/deposits', async (req, res) => {
  try {
    const items = await Stock.find({ quantity: { $gt: 0 } });

    res.render('credit-sales-form', {
      items: items || []
    });

  } catch (error) {
    console.log(error);
    res.render('credit-sales-form', {
      items: []
    });
  }
});


/* =========================
   CUSTOMER DEPOSITS TABLE
========================= */
router.get('/admin/deposit-details', (req, res) => {
  res.render('credit-sales-list');
});


/* =========================
   USER MANAGEMENT
========================= */

router.get('/admin/users', async (req, res) => {
  try {
    const users = await Registration.find().sort({ createdAt: -1 });

    res.render('system-users', {
      users
    });

  } catch (error) {
    console.log(error);

    res.status(500).send('Error loading users');
  }
});

// ========
// ADD NEW USER ROUTES
// =========================
router.get('/admin/add-user', (req, res) => {
    res.render('add-new-user');
});

router.post('/admin/add-user', async (req, res) => {
    try {
        const {
            username,
            email,
            phonenumber,
            nin,
            role
        } = req.body;

        const password = req.body.password;
        const confirmPassword = req.body.confirmPassword;

        // =========================
        // VALIDATION RULES
        // =========================
        const phoneRegex = /^(07\d{8}|2567\d{8})$/;
        const ninRegex = /^[A-Z0-9]{14}$/;
        const validRoles = ["sales_attendant", "store_manager", "admin"];

        // Required fields
        if (!username || !email || !phonenumber || !role || !password) {
            return res.render('add-new-user', {
                error: "All required fields must be filled"
            });
        }

        // Check if user exists
        let existingUser = await Registration.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.render('add-new-user', { error: 'Email already exists' });
        }

        // Phone validation
        if (!phoneRegex.test(phonenumber)) {
            return res.render('add-new-user', { error: 'Invalid Ugandan phone number' });
        }

        // NIN validation (optional but validated if present)
        if (nin && !ninRegex.test(nin)) {
            return res.render('add-new-user', { error: 'Invalid NIN format' });
        }

        // Role validation
        if (!validRoles.includes(role)) {
            return res.render('add-new-user', { error: 'Invalid role selected' });
        }

        // Password match check
        if (password !== confirmPassword) {
            return res.render('add-new-user', { error: 'Passwords do not match' });
        }

        // Password strength check
        if (password.length < 6) {
            return res.render('add-new-user', { error: 'Password must be at least 6 characters' });
        }

        // =========================
        // CREATE USER
        // =========================
        const newUser = new Registration({
            username,
            email: email.toLowerCase(),
            phonenumber,
            nin,
            role,
            password
        });

        await Registration.register(newUser, password, (err) => {
            if (err) {
                console.error(err);
                return res.render('add-new-user', { error: 'Registration failed' });
            }

            
        });
        res.redirect('/system-users');

    } catch (error) {
        console.error(error);
        res.render('add-new-user', { error: error.message });
    }
});

// EDIT USERS
router.get('/admin/users/edit/:id', async (req, res) => {
  try {
    const user = await Registration.findById(req.params.id);

    if (!user) {
      return res.status(404).send('User not found');
    }

    res.render('edit-user', { user });

  } catch (error) {
    console.log(error);
    res.status(500).send('Error loading user');
  }
});

router.post('/admin/users/edit/:id', async (req, res) => {
  try {

    const {
      username,
      email,
      phoneNumber,
      nin,
      role,
      isActive
    } = req.body;

    await Registration.findByIdAndUpdate(req.params.id, {
      username,
      email,
      phoneNumber,
      nin,
      role,
      isActive: isActive === 'true'
    });

    res.redirect('/admin/users');

  } catch (error) {
    console.log(error);
    res.status(500).send('Error updating user');
  }
});

// DELETE USERS
router.get('/admin/users/delete/:id', async (req, res) => {
  try {

    await Registration.findByIdAndDelete(req.params.id);

    res.redirect('/admin/users');

  } catch (error) {
    console.log(error);
    res.status(500).send('Error deleting user');
  }
});

/* =========================
   SYSTEM SETTINGS
========================= */
router.get('/admin/settings', (req, res) => {
  res.render('settings');
});


/* =========================
   TRANSPORT RULES
========================= */
router.get('/admin/transport-rules', (req, res) => {
  res.render('transport-rules');
});

// CUSTOMER DEPOSITS

router.get('/admin/deposits', async (req, res) => {
  try {

    const items = await Stock.find().sort({ itemName: 1 });

    res.render('credit-sales-form', {
      items
    });

  } catch (error) {
    console.log(error);
    res.status(500).send('Error loading credit sale form');
  }
});


router.post('/admin/deposits', async (req, res) => {
  try {

    const {
      customerName,
      customerAddress,
      customerContact,
      nin,
      itemId,
      quantity,
      paymentType,
      amountPaid,
      notes
    } = req.body;

    // ================= GET ITEM =================
    const item = await Stock.findById(itemId);

    if (!item) {
      return res.status(404).send('Item not found');
    }

    // ================= CALCULATIONS =================
    const totalAmount = item.sellingPrice * quantity;
    const paid = Number(amountPaid) || 0;
    const balance = totalAmount - paid;

    let status = 'pending';

    if (balance <= 0) status = 'cleared';
    else if (paid > 0) status = 'partial';

    // ================= SAVE CREDIT SALE =================
    const creditSale = new CreditSale({
      customerName,
      customerAddress,
      customerContact,
      nin,
      item: itemId,
      quantity,
      paymentType,
      amountPaid: paid,
      notes,
      totalAmount,
      balance,
      status
    });

    await creditSale.save();

    // ================= REDUCE STOCK =================
    item.quantity -= quantity;
    await item.save();

    // ================= REDIRECT TO RECEIPT =================
    res.redirect(`/admin/depositreceipt/${creditSale._id}`);

  } catch (error) {
    console.log(error);
    res.status(500).send('Error saving credit sale');
  }
});

// DEPOSIT RECEIPT
router.get('/admin/depositreceipt/:id', async (req, res) => {
  try {

    const sale = await CreditSale.findById(req.params.id)
      .populate('item');

    if (!sale) {
      return res.status(404).send('Receipt not found');
    }

    res.render('deposit-receipt', {
      sale
    });

  } catch (error) {
    console.log(error);
    res.status(500).send('Error loading receipt');
  }
});

module.exports = router;