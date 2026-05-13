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
// SIGNUP (POST)
// ======================================================
router.post('/signup', async (req, res) => {

  try {
    console.log(req.body)
    const {
      fullname,
      email,
      phonenumber,
      nin,
      role,
      password
    } = req.body;

    const errors = [];

    // ======================================================
    // FULL NAME VALIDATION
    // ======================================================
    if (!fullname || fullname.length < 3) {
      errors.push('Full name must be at least 3 characters');
    }

    // ======================================================
    // EMAIL VALIDATION
    // ======================================================
    if (!email.includes('@')) {
      errors.push('Enter a valid email address');
    }

    // ======================================================
    // PHONE NUMBER FIX + VALIDATION (UPDATED)
    // ======================================================

    let cleanPhone = phonenumber;

    // If user enters 7XXXXXXXX → convert to +2567XXXXXXXX
    if (cleanPhone && cleanPhone.startsWith('7') && cleanPhone.length === 9) {
      cleanPhone = '+256' + cleanPhone;
    }

    // Must now start with +256
    if (!cleanPhone.startsWith('+256')) {
      errors.push('Phone number must start with +256 or 7XXXXXXXX');
    }

    // Must be correct length after normalization
    if (cleanPhone.length !== 13) {
      errors.push('Phone number must be valid (e.g +256701234567)');
    }

    // ======================================================
    // NIN VALIDATION
    // ======================================================
    if (nin.length !== 14) {
      errors.push('NIN must be exactly 14 characters');
    }

    const ninValid = /^[A-Z0-9]{14}$/.test(nin);

    if (!ninValid) {
      errors.push('NIN must contain only capital letters and numbers');
    }

    // ======================================================
    // PASSWORD VALIDATION
    // ======================================================
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least 1 uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least 1 lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least 1 number');
    }

    if (!/[@$!%*?&]/.test(password)) {
      errors.push('Password must contain at least 1 special character (@$!%*?&)');
    }

    if (/\s/.test(password)) {
      errors.push('Password must not contain spaces');
    }

    // ======================================================
    // IF ERRORS EXIST
    // TODO: Implement flash messages to enable a user correct existing errors while registering
    // ======================================================
    // console.log(errors)
    // if (errors.length > 0) {

    //   return res.render('signup', {
    //     errors,
    //     fullname,
    //     email,
    //     phonenumber,
    //     nin,
    //     role
    //   });

    // }

    // ======================================================
    // CHECK IF USER EXISTS
    // ======================================================
    let existingUser = await Registration.findOne({
      email: email.toLowerCase()
    });

    if (existingUser) {
// TODO: Implement flash messages to notify the user that the email exists
      return res.render('login', {
        error: 'Email is already registered'
      });

    }

    // ======================================================
    // CREATE USER
    // ======================================================
    const newUser = new Registration({
      fullname,
      email: email.toLowerCase(),
      phonenumber: cleanPhone,  
      nin,
      role
    });
    console.log(newUser);
    await Registration.register(newUser, req.body.password, (err) => {
      if (err) {
        return res.redirect("/signup");
      }
    });
    res.redirect("/login");
  } catch (error) {
    console.error(error);
    res.render("signup", { error: error.message });
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
      return res.render('login', {
        error: 'Invalid email or password'
      });
    }

    req.logIn(user, (err) => {

      if (err) {
        return next(err);
      }

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
    console.log("LOGIN INPUT:", req.body);

});


// ======================================================
// LOGOUT
// ======================================================
router.get('/logout', (req, res) => {

  req.logout(function (err) {

    if (err) {
      return res.redirect('/');
    }

    res.render('logout');

  });

});


module.exports = router;