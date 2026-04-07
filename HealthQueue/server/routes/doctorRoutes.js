const router = require("express").Router();
const {createDoctor,getDoctors} = require("../controllers/doctorController");

router.post("/", createDoctor);
router.get("/", getDoctors);

module.exports = router;
