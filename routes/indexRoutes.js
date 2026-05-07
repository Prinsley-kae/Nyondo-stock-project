const express = require('express');
const router = express.Router();
const Registration = require('../models/Registration');
const passport = require('passport');

// =========================
// INDEX ROUTE
// =========================
router.get('/', (req, res) => {
    res.render('index');
});


// =========================
// LOGIN ROUTES
// =========================
router.get('/login', (req, res) => {
    res.render('login');
});

router.post('/login', (req, res, next) => {

    req.body.username = req.body.email.toLowerCase();
    passport.authenticate('local', (err, user, info) => {

        if (err) {
            console.error(err);
            return next(err);
        }

        if (!user) {
            console.log("LOGIN FAILED:", info);
            return res.render('login', {
                error: "Invalid email or password"
            });
        }

        req.logIn(user, (err) => {
            if (err) return next(err);

            console.log("LOGIN SUCCESS:", user.email, user.role);

            if (user.role === "admin") {
                return res.redirect('/admin');
            }

            if (user.role === "store_manager") {
                return res.redirect('/store');
            }

            if (user.role === "sales_attendant") {
                return res.redirect('/sales');
            }

            return res.redirect('/');
        });

    })(req, res, next);
    console.log("LOGIN INPUT:", req.body);
});

// ========
// SIGNUP ROUTES
// =========================
router.get('/signup', (req, res) => {
    res.render('signup');
});

router.post('/signup', async (req, res) => {
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
            return res.render('signup', {
                error: "All required fields must be filled"
            });
        }

        // Check if user exists
        let existingUser = await Registration.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.render('signup', { error: 'Email already exists' });
        }

        // Phone validation
        if (!phoneRegex.test(phonenumber)) {
            return res.render('signup', { error: 'Invalid Ugandan phone number' });
        }

        // NIN validation (optional but validated if present)
        if (nin && !ninRegex.test(nin)) {
            return res.render('signup', { error: 'Invalid NIN format' });
        }

        // Role validation
        if (!validRoles.includes(role)) {
            return res.render('signup', { error: 'Invalid role selected' });
        }

        // Password match check
        if (password !== confirmPassword) {
            return res.render('signup', { error: 'Passwords do not match' });
        }

        // Password strength check
        if (password.length < 6) {
            return res.render('signup', { error: 'Password must be at least 6 characters' });
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
                return res.render('signup', { error: 'Registration failed' });
            }

            
        });
        res.redirect('/login');

    } catch (error) {
        console.error(error);
        res.render('signup', { error: error.message });
    }
});

module.exports = router;