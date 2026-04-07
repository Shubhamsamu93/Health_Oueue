const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  patientId: mongoose.Schema.Types.ObjectId,
  doctorId: mongoose.Schema.Types.ObjectId,
  patientName: String,
  token: String,
  timeSlot: String,
  department: String,
  specialization: String,
  reason: String,
  notes: String,
  date: String,
  time: String,
  status: { type: String, default: "pending" }
});

module.exports = mongoose.model("Appointment", schema);
