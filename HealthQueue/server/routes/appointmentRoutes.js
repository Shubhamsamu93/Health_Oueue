const router = require("express").Router();
const {
  book,
  getAll,
  update,
  getPatientAppointments,
  getDoctorAppointments,
  getTodayAppointments,
  updateAppointmentStatus
} = require("../controllers/appointmentController");
const { getUpcomingAppointmentSummary } = require("../controllers/dashboardController");

router.get("/upcoming", getUpcomingAppointmentSummary);
router.get("/today", getTodayAppointments);
router.get("/patient/:patientId", getPatientAppointments);
router.get("/doctor/:doctorId", getDoctorAppointments);
router.post("/book", book);
router.get("/", getAll);
router.put("/:id/status", updateAppointmentStatus);
router.put("/:id", update);


console.log("Appointment Routes Loaded");
module.exports = router;
