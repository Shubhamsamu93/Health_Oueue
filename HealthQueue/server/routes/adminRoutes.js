const router = require("express").Router();
const controller = require("../controllers/adminController");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");

router.use(requireAuth, requireRole("admin"));
router.get("/dashboard", controller.dashboard);
router.get("/doctors", controller.doctors);
router.post("/doctors", controller.createDoctor);
router.delete("/doctors/:id", controller.removeDoctor);
router.get("/patients", controller.patients);
router.get("/queue", controller.queue);
router.patch("/appointments/:id/priority", controller.updatePriority);

module.exports = router;
