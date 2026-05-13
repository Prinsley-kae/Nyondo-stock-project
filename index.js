// =========================
// DEPENDENCIES
// =========================

const express = require('express');
const expressSession = require('express-session');
const path = require('path');
const mongoose = require('mongoose');
const passport = require('passport');

const MongoStore = require('connect-mongo').default;
const LocalStrategy = require('passport-local').Strategy;

require('dotenv').config();
const connectDb = require('./config/start');

// Import user model
const Registration = require('./models/Registration');

// =========================
// APP SETUP
// =========================
const app = express();
const port = 3000;

// Connect to database
connectDb();

// =========================
// VIEW ENGINE
// =========================
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// =========================
// MIDDLEWARE
// =========================
app.use(express.static(path.join(__dirname, 'public')));
// app.use('/public/uploads', express.static(__dirname + '/public/uploads'));
app.use(express.urlencoded({ extended: true }));

app.use(expressSession({
  secret: "Nyondo-secret-key",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.DATABASE,
    collectionName: 'sessions'
  }),
  cookie:{
    maxAge: 1000*60*60*5 // 5 hours life for a login session
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// =========================
// PASSPORT CONFIGURATION (FIXED)
// =========================
passport.use(new LocalStrategy(
  { usernameField: 'email' },   
  Registration.authenticate()
));

passport.serializeUser(Registration.serializeUser());
passport.deserializeUser(Registration.deserializeUser());

// =========================
// GLOBAL USER (for Pug)
// =========================
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
});

// =========================
// ROUTES
// =========================
app.use('/', require('./routes/indexRoutes'));
app.use('/', require('./routes/adminRoutes'));
app.use('/', require('./routes/salesRoutes'));
app.use('/', require('./routes/stockRoutes'));

// =========================
// 404 HANDLER
// =========================
app.use((req, res) => {
  res.status(404).send('Oops! Route not found.');
});

// =========================
// START SERVER
// =========================
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});