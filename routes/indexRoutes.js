const express = require("express");
const router = express.Router();

const Registration = require('../models/Registration');
const passport = require('passport');


// ======================================================
// HOME PAGE
// ======================================================
router.get('/', (req, res) => {
  res.render('index');
});


// ======================================================
// SIGNUP PAGE (GET)
// ======================================================
router.get('/signup', (req, res) => {
  res.render('signup');
});


// ======================================================
// SIGNUP (POST) - NO FLASH / INLINE FIELD VALIDATION
// ======================================================
router.post('/signup', async (req, res) => {
  const {
    fullname,
    email,
    phonenumber,
    nin,
    role,
    password,
    confirmPassword
  } = req.body;

  try {
    console.log("SIGNUP PAYLOAD RECEIVED:", req.body);
    
    // Using a key-value object to target elements directly in your Pug template
    const errors = {};

    // ======================================================
    // FULL NAME VALIDATION
    // ======================================================
    if (!fullname || fullname.trim().length < 3) {
      errors.fullname = 'Full name must be at least 3 characters long.';
    }

    // ======================================================
    // EMAIL VALIDATION
    // ======================================================
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      errors.email = 'Please enter a valid email address.';
    }

    // ======================================================
    // PHONE NUMBER VALIDATION & CLEANING
    // ======================================================
    let rawInputPhone = phonenumber ? phonenumber.trim() : '';

    // If they type '0777...' (10 digits), peel off the 0 to get the pure 9 digits
    if (rawInputPhone.startsWith('0') && rawInputPhone.length === 10) {
      rawInputPhone = rawInputPhone.substring(1);
    }

    // Must be exactly 9 digits remaining and start with 7
    const nineDigitRegex = /^7\d{8}$/;
    if (!nineDigitRegex.test(rawInputPhone)) {
      errors.phonenumber = 'Phone number must be 9 digits and start with 7 (e.g., 77789990).';
    }

    let cleanPhone = '+256' + rawInputPhone;

    // ======================================================
    // NIN VALIDATION
    // ======================================================
    const cleanNIN = nin ? nin.trim().toUpperCase() : '';
    const ninValid = /^[A-Z0-9]{14}$/.test(cleanNIN);
    
    if (cleanNIN.length !== 14 || !ninValid) {
      errors.nin = 'NIN must be exactly 14 characters (Capital letters and numbers only).';
    }

    // ======================================================
    // PASSWORD MATCH & COMPLEXITY VALIDATION
    // ======================================================
    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (!password || password.length < 8 || 
        !/[A-Z]/.test(password) || 
        !/[a-z]/.test(password) || 
        !/[0-9]/.test(password) || 
        !/[@$!%*?&]/.test(password) || 
        /\s/.test(password)) {
      errors.password = 'Password requires 8+ characters, uppercase, lowercase, a number, and a special character.';
    }

    // ======================================================
    // IMMEDIATE BLOCK IF ERROR KEYS EXIST
    // ======================================================
    if (Object.keys(errors).length > 0) {
      return res.render('signup', {
        errors,
        fullname,
        email,
        phonenumber, // retains input data on-screen
        nin: cleanNIN,
        role
      });
    }

    // ======================================================
    // CHECK IF USER EXISTS
    // ======================================================
    let existingUser = await Registration.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.render('signup', {
        errors: { email: 'Email is already registered. Please log in.' },
        fullname, email, phonenumber, nin: cleanNIN, role
      });
    }

    // ======================================================
    // MONGODB DATABASE USER REGISTRATION (PURE ASYNC/AWAIT)
    // ======================================================
    const newUser = new Registration({
      fullname: fullname.trim(),
      email: email.toLowerCase().trim(),
      phonenumber: cleanPhone,  
      nin: cleanNIN,
      role
    });
    
    // Awaiting the promise handles validation natively without callback synchronization locks!
    await Registration.register(newUser, password);
      
    // Flash is executed safely here because it directly follows a true HTTP Redirect
    req.flash('success_msg', 'Account registered successfully! You can now log in.');
    return res.redirect("/login");

  } catch (error) {
    console.error("Signup Operation Interrupted: ", error);
    
    // If passport-local-mongoose throws a duplicate field error, we handle it elegantly here
    let systemErrorMessage = 'An unexpected system fault occurred processing request.';
    if (error.name === 'UserExistsError') {
      systemErrorMessage = 'A user with the given email address is already registered.';
    }

    return res.render('signup', { 
      errors: { system: systemErrorMessage },
      fullname, 
      email, 
      phonenumber, 
      nin, 
      role 
    });
  }
});


// ======================================================
// LOGIN PAGE
// ======================================================
router.get('/login', (req, res) => {
  res.render('login');
});


// ======================================================
// LOGIN
// ======================================================
router.post('/login', (req, res, next) => {

  passport.authenticate('local', (err, user) => {

    if (err) {
      return next(err);
    }

    if (!user) {
      req.flash('error_msg', 'Invalid email or password.');
      return res.redirect('/login');
    }

    req.logIn(user, (err) => {

      if (err) {
        return next(err);
      }

      req.flash('success_msg', `Welcome back, ${user.fullname || 'User'}! Authentication successful.`);

      if (user.role === 'admin') {
        return res.redirect('/admin');
      }

      if (user.role === 'store_manager') {
        return res.redirect('/store');
      }

      if (user.role === 'sales_attendant') {
        return res.redirect('/sales');
      }

      return res.redirect('/');

    });

  })(req, res, next);

});


// ======================================================
// LOGOUT
// ======================================================
router.get('/logout', (req, res) => {

  req.logout(function (err) {
    if (err) {
      req.flash('error_msg', 'Failed to terminate user login session.');
      return res.redirect('/');
    }

    req.flash('success_msg', 'You have logged out successfully.');
    res.redirect('/login');
  });

});


module.exports = router;