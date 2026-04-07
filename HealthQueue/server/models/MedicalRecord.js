const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor'
  },
  doctorName: String,
  specialization: String,
  visitDate: {
    type: Date,
    default: Date.now
  },
  visitType: {
    type: String,
    enum: ['consultation', 'followup', 'emergency', 'checkup', 'test', 'imaging'],
    default: 'consultation'
  },
  diagnosis: String,
  symptoms: [String],
  medications: [
    {
      name: String,
      dosage: String,
      frequency: String,
      duration: String
    }
  ],
  precautions: String,
  notes: String,
  attachments: [String],
  status: {
    type: String,
    enum: ['draft', 'completed', 'pending_review'],
    default: 'completed'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("MedicalRecord", schema);
