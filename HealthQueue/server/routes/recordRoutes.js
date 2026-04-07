const router = require("express").Router();
const { 
  getPatientRecords, 
  createRecord, 
  updateRecord, 
  deleteRecord 
} = require("../controllers/recordController");

router.get("/patient/:patientId", getPatientRecords);
router.post("/", createRecord);
router.put("/:id", updateRecord);
router.delete("/:id", deleteRecord);

console.log("Medical Records Routes Loaded");
module.exports = router;
