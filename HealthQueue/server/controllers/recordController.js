const MedicalRecord = require("../models/MedicalRecord");
const mongoose = require("mongoose");

exports.getPatientRecords = async (req, res) => {
  try {
    const patientIdParam = req.params.patientId;
    console.log("🔍 [Records API] Getting records for patient:", patientIdParam);
    
    // Try to convert to ObjectId if it looks like a MongoDB ID
    let patientId;
    try {
      patientId = mongoose.Types.ObjectId(patientIdParam);
    } catch (e) {
      patientId = patientIdParam; // Use as string if not valid ObjectId
    }
    
    console.log("🔄 [Records API] Converted to ObjectId:", patientId);
    
    const records = await MedicalRecord.find({ patientId })
      .sort({ visitDate: -1 })
      .limit(100);
    
    console.log("✅ [Records API] Found records:", records.length);
    
    if (!records.length) {
      console.log("⚠️  [Records API] No records found for patient:", patientId);
      // Don't return empty array - help with debugging
      console.log("🔎 [Records API] All records in DB:", await MedicalRecord.find().select('patientId').limit(5));
      return res.json([]);
    }
    
    console.log("📤 [Records API] Returning", records.length, "records");
    res.json(records);
  } catch (err) {
    console.error('❌ [Records API] Error fetching patient records:', err);
    res.status(500).json({ msg: "Error fetching medical records", error: err.message });
  }
};

exports.createRecord = async (req, res) => {
  try {
    const record = await MedicalRecord.create(req.body);
    res.status(201).json(record);
  } catch (err) {
    console.error('Error creating record:', err);
    res.status(500).json({ msg: "Error creating medical record", error: err.message });
  }
};

exports.updateRecord = async (req, res) => {
  try {
    const record = await MedicalRecord.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(record);
  } catch (err) {
    res.status(500).json({ msg: "Error updating medical record" });
  }
};

exports.deleteRecord = async (req, res) => {
  try {
    await MedicalRecord.findByIdAndDelete(req.params.id);
    res.json({ msg: "Record deleted successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Error deleting medical record" });
  }
};
