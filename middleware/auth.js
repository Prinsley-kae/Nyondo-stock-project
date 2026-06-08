// Checks if a user is logged in
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
};

// Checks if a logged in user is a manager
const isManager = (req, res, next) => {
  if (req.isAuthenticated() && req.user.role === "store_manager") {
    return next();
  }
  res.status(403).send("Access denied: You are not a manager");
};

// Checks if a logged in user is an admin
const isAdmin = (req, res, next) => {
  
  if (req.isAuthenticated() && req.user.role === "admin") {
    return next();
  }
  res.status(403).send("Access denied: You are not an administrator");
};

// Checks if a logged in user is a sales attendant
const isAttendant = (req, res, next) => {
  if (req.isAuthenticated() && req.user.role === "sales_attendant") {
    return next();
  }
  res.status(403).send("Access denied: You are not an attendant");
};

const isManagerOrAdmin = (req, res, next) => {
  if (
    req.isAuthenticated() &&
    (req.user.role === "store_manager" || req.user.role === "admin")
  ) {
    return next();
  }
  res.status(403).send("Access denied: You are a stranger");
};

const isAttendantOrAdmin = (req, res, next) => {
  if (
    req.isAuthenticated() &&
    (req.user.role === "sales_attendant" || req.user.role === "admin")
  ) {
    return next();
  }
  res.status(403).send("Access denied: You are a stranger");
};

module.exports = {isAuthenticated,isManager,isAdmin,isAttendant,isAttendantOrAdmin,isManagerOrAdmin,};
