const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, required: true },
  phone: String,
  password: String,
  role: { type: String, enum: ["patient", "doctor"], required: true },
  age: Number,
  gender: String,
  address: String,
  doctorProfile: mongoose.Schema.Types.ObjectId,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", schema);
