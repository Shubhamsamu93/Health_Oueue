const router = require("express").Router();
const controller = require("../controllers/queueController");
const { getQueueStatus } = require("../controllers/dashboardController");

router.get("/status", getQueueStatus);
router.get("/live", controller.live);
router.get("/:id", controller.byId);

module.exports = router;
