const router = require("express").Router();
const controller = require("../controllers/patientController");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");

router.use(requireAuth, requireRole("patient"));
router.get("/dashboard", controller.dashboard);
router.get("/doctors", controller.doctors);
router.get("/history", controller.history);
router.get("/queue/:id", controller.queue);
router.post("/appointments", controller.createAppointment);

module.exports = router;
