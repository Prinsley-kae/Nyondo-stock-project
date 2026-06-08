const express = require("express");
const router = express.Router();
const Registration = require("../models/Registration");
const passport = require("passport");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// Email message for resetting the password
require('dotenv').config(); 

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// HOME PAGE
router.get("/", (req, res) => {
  res.render("index");
});

// SIGNUP PAGE (GET)
router.get("/signup", (req, res) => {
  res.render("signup");
});

// SIGNUP (POST) - NO FLASH / INLINE FIELD VALIDATION
router.post("/signup", async (req, res) => {
  const { fullname, email, phonenumber, nin, role, password, confirmPassword } =
    req.body;

  try {
    console.log("SIGNUP PAYLOAD RECEIVED:", req.body);

    // Using a key-value object to target elements directly in your Pug template
    const errors = {};

    // FULL NAME VALIDATION & FORMATTING
    const nameParts = fullname ? fullname.trim().split(/\s+/) : [];
    let formattedFullName = "";

    if (nameParts.length < 2) {
      errors.fullname = "Please enter both your first and last name.";
    } else {

      // Helper to Title Case
      const toTitleCase = (str) => {
        return str
          .toLowerCase()
          .split(" ")
          .map((word) => {
            return word.charAt(0).toUpperCase() + word.slice(1);
          })
          .join(" ");
      };
      formattedFullName = toTitleCase(fullname.trim());
    }

    // EMAIL VALIDATION
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      errors.email = "Please enter a valid email address.";
    }

    // PHONE NUMBER VALIDATION & CLEANING
    let rawInputPhone = phonenumber ? phonenumber.trim() : "";

    // If they type '0777...' (10 digits), peel off the 0 to get the pure 9 digits
    if (rawInputPhone.startsWith("0") && rawInputPhone.length === 10) {
      rawInputPhone = rawInputPhone.substring(1);
    }

    // Must be exactly 9 digits remaining and start with 7
    const nineDigitRegex = /^7\d{8}$/;
    if (!nineDigitRegex.test(rawInputPhone)) {
      errors.phonenumber =
        "Phone number must be 9 digits and start with 7 (e.g., 77789990).";
    }

    let cleanPhone = "+256" + rawInputPhone;

    // NIN VALIDATION
    const cleanNIN = nin ? nin.trim().toUpperCase() : "";
    const ninValid = /^[A-Z0-9]{14}$/.test(cleanNIN);

    if (cleanNIN.length !== 14 || !ninValid) {
      errors.nin =
        "NIN must be exactly 14 characters (Capital letters and numbers only).";
    }

    // PASSWORD MATCH & COMPLEXITY VALIDATION
    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }

    if (
      !password ||
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[@$!%*?&]/.test(password) ||
      /\s/.test(password)
    ) {
      errors.password =
        "Password requires 8+ characters, uppercase, lowercase, a number, and a special character.";
    }

    // IMMEDIATE BLOCK IF ERROR KEYS EXIST
    if (Object.keys(errors).length > 0) {
      return res.render("signup", {
        errors,
        fullname,
        email,
        phonenumber, 
        nin: cleanNIN,
        role,
      });
    }

    // CHECK IF USER EXISTS
    let existingUser = await Registration.findOne({
      email: email.toLowerCase().trim(),
    });
    if (existingUser) {
      return res.render("signup", {
        errors: {
          email: "Email is already registered. Please use another email.",
        },
        fullname,
        email,
        phonenumber,
        nin: cleanNIN,
        role,
      });
    }

    // MONGODB DATABASE USER REGISTRATION (PURE ASYNC/AWAIT)
    const newUser = new Registration({
      fullname: formattedFullName,
      email: email.toLowerCase().trim(),
      phonenumber: cleanPhone,
      nin: cleanNIN,
      role,
    });

    // Awaiting the promise handles validation natively without callback synchronization locks!
    await Registration.register(newUser, password);

    // Flash is executed safely here because it directly follows a true HTTP Redirect
    req.flash(
      "success_msg",
      "Account registered successfully! You can now log in.",
    );
    return res.redirect("/login");
  } catch (error) {
    console.error("Signup Operation Interrupted: ", error);

    // If passport-local-mongoose throws a duplicate field error, we handle it elegantly here
    let systemErrorMessage =
      "An unexpected system fault occurred processing request.";
    if (error.name === "UserExistsError") {
      systemErrorMessage =
        "A user with the given email address is already registered.";
    }

    return res.render("signup", {
      errors: { system: systemErrorMessage },
      fullname,
      email,
      phonenumber,
      nin,
      role,
    });
  }
});

// LOGIN PAGE(GET)
router.get("/login", (req, res) => {
  res.render("login");
});

// LOGIN(POST)
router.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);

    // If user is not found or password is wrong
    if (!user) {
      req.flash("error_msg", "Invalid email or password.");

      // We render the page instead of redirecting so we can pass error flags
      return res.render("login", {
        error_msg: "Invalid email or password.",
        // Passing these allows the pug template to apply the .input-error class
        isError: true,
      });
    }

    req.logIn(user, async (err) => {
      if (err) return next(err);

      // Successful login
      const redirectPath =
        user.role === "admin"
          ? "/admin"
          : user.role === "store_manager"
            ? "/store"
            : user.role === "sales_attendant"
              ? "/sales"
              : "/admin-dashboard";

      return res.redirect(`${redirectPath}?success=true`);
    });
  })(req, res, next);
});

// FORGOT PASSWORD
router.get("/forgot-password", (req, res) => {
  // Pass empty flash messages so it doesn't show an old error
  res.render("forgot-password", {
    error_msg: req.flash("error_msg"),
  });
});

router.post("/forgot-password", async (req, res) => {
  try {
    const user = await Registration.findOne({ email: req.body.email });
    if (!user) {
      req.flash("error_msg", "Email not found.");
      return res.redirect("/forgot-password");
    }

    const token = crypto.randomBytes(20).toString("hex");
    user.resetPasswordToken = token;
    user.resetPasswordExpires = new Date(Date.now() + 3600000);

    await user.save(); 

    const resetUrl = `http://localhost:3000/reset-password/${token}`;
    const mailOptions = {
      from: "priscillaakwee@gmail.com",
      to: user.email,
      subject: "Password Reset Request",
      text: `Click the link to reset your password: ${resetUrl}`,
    };

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error("Email Error:", err);
        req.flash("error_msg", "Error sending email.");
        return res.redirect("/forgot-password");
      }
      req.flash("success_msg", "A reset link has been sent to your email.");
      return res.redirect("/login");
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "System error.");
    return res.redirect("/forgot-password");
  }
});

// RESET PASSWORD
router.get("/reset-password/:token", async (req, res) => {
  const token = req.params.token.trim();
  console.log("Looking for token:", token);

  const user = await Registration.findOne({ resetPasswordToken: token });

  if (!user) {
    console.log("DATABASE CHECK: No user found with this token at all.");
    const anyUser = await Registration.findOne({});
    console.log(
      "Sample user in DB has token:",
      anyUser ? anyUser.resetPasswordToken : "None",
    );
  } else {
    console.log("User found! Expiry in DB is:", user.resetPasswordExpires);
    console.log("Current system time is:", new Date());

    // Now check if expiry is the reason for failure
    if (user.resetPasswordExpires > new Date()) {
      console.log("Expiry is valid.");
    } else {
      console.log("Expiry is invalid (in the past).");
    }
  }

  if (!user || user.resetPasswordExpires < new Date()) {
    req.flash("error_msg", "Token is invalid or expired.");
    return res.redirect("/forgot-password");
  }

  res.render("reset-password", { token: token });
});

// POST: Actually update the password
router.post("/reset-password/:token", async (req, res) => {
  try {
    const user = await Registration.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      req.flash("error_msg", "Token invalid or expired.");
      return res.redirect("/forgot-password");
    }

    if (req.body.password !== req.body.confirmPassword) {
      req.flash("error_msg", "Passwords do not match.");
      return res.redirect("back");
    }

    // 1. Set the password (this does NOT save to the DB yet)
    await user.setPassword(req.body.password);

    // 2. Clear reset tokens
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    // 3. Now save the user to the database
    await user.save();

    req.flash("success_msg", "Password updated! You can now login.");
    return res.redirect("/login");
  } catch (err) {
    console.error("Reset Password Error:", err);
    req.flash("error_msg", "An error occurred. Please try again.");
    return res.redirect("/forgot-password");
  }
});

// LOGOUT
router.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      req.flash("error_msg", "Failed to terminate user login session.");
      return res.redirect("/");
    }

    // Redirect to login page with the logout parameter
    res.redirect("/login?logout=true");
  });
});

module.exports = router;
