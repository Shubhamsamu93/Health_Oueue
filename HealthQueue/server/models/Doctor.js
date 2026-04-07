const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: String,
  email: String,
  phone: String,
  specialization: { type: String, required: true },
  experience: { type: Number, default: 0 },
  hospital: String,
  availableDays: { type: [String], default: ["Monday", "Wednesday", "Friday"] },
  timeSlots: { type: [String], default: ["09:00 AM", "10:00 AM", "02:00 PM", "03:00 PM"] },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Doctor", schema);