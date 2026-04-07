const router = require("express").Router();
const { getTodaysMedicines } = require("../controllers/dashboardController");

router.get("/today", getTodaysMedicines);

module.exports = router;
