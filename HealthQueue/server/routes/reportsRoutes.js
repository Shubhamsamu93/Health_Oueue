const router = require("express").Router();
const { getPendingReports } = require("../controllers/dashboardController");

router.get("/pending", getPendingReports);

module.exports = router;
