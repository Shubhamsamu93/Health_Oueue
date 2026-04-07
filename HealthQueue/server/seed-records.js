// Seed script to populate demo medical records
// Run this once to populate your database with sample data
// Usage: node seed-records.js

require("dotenv").config();
const mongoose = require("mongoose");
const MedicalRecord = require("./models/MedicalRecord");
const User = require("./models/User");

async function seedRecords() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("📡 Connected to MongoDB");

    // Find a test patient (assumes patient exists with this email)
    const testPatient = await User.findOne({ email: "patient1@healthqueue.com" });
    if (!testPatient) {
      console.log("❌ Test patient not found. Please create a patient account first.");
      process.exit(1);
    }

    const patientId = testPatient._id;
    console.log(`✅ Using patient: ${testPatient.name} (${testPatient.email})`);

    // Demo records
    const demoRecords = [
      {
        patientId,
        doctorName: "Dr. Rajesh Kumar",
        specialization: "General Physician",
        visitDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        visitType: "consultation",
        diagnosis: "Common Cold",
        symptoms: ["fever", "cough", "sore throat"],
        medications: [
          { name: "Paracetamol 500mg", dosage: "500mg", frequency: "Twice daily", duration: "5 days" },
          { name: "Azithromycin", dosage: "500mg", frequency: "Once daily", duration: "3 days" }
        ],
        precautions: "Get plenty of rest, stay hydrated, avoid cold water.",
        notes: "Patient advised to take bed rest for 2-3 days.",
        status: "completed"
      },
      {
        patientId,
        doctorName: "Dr. Priya Singh",
        specialization: "Cardiologist",
        visitDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        visitType: "checkup",
        diagnosis: "Pre-hypertension",
        symptoms: ["occasional dizziness"],
        medications: [
          { name: "Lisinopril", dosage: "10mg", frequency: "Once daily", duration: "30 days" }
        ],
        precautions: "Reduce salt intake, regular exercise, avoid stress, monitor BP daily.",
        notes: "ECG normal. Follow-up in 1 month.",
        status: "completed"
      },
      {
        patientId,
        doctorName: "Dr. Amit Patel",
        specialization: "Orthopedic Surgeon",
        visitDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
        visitType: "followup",
        diagnosis: "Knee pain (resolved)",
        symptoms: ["knee pain (improving)"],
        medications: [
          { name: "Ibuprofen", dosage: "400mg", frequency: "Once daily after food", duration: "7 days" }
        ],
        precautions: "Continue physiotherapy exercises, apply ice before bed, avoid stair climbing.",
        notes: "X-ray shows good recovery. Patient can resume light activities.",
        status: "completed"
      },
      {
        patientId,
        doctorName: "Dr. Sneha Desai",
        specialization: "General Physician",
        visitDate: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000), // 21 days ago
        visitType: "test",
        diagnosis: "Routine Blood Test",
        symptoms: [],
        medications: [],
        precautions: "Results show normal values. No medication needed.",
        notes: "Annual health checkup completed successfully.",
        status: "completed"
      },
      {
        patientId,
        doctorName: "Dr. Vikram Sharma",
        specialization: "Neurologist",
        visitDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        visitType: "consultation",
        diagnosis: "Tension Headaches",
        symptoms: ["frequent headaches", "neck stiffness"],
        medications: [
          { name: "Aspirin", dosage: "500mg", frequency: "As needed", duration: "Until relief" },
          { name: "Amitriptyline", dosage: "10mg", frequency: "Once at night", duration: "30 days" }
        ],
        precautions: "Manage stress, regular sleep schedule, neck exercises, reduce screen time.",
        notes: "Patient advised to practice yoga and meditation.",
        status: "completed"
      }
    ];

    // Clear existing demo records (optional)
    await MedicalRecord.deleteMany({ patientId });
    console.log("🗑️  Cleared existing records for patient");

    // Insert demo records
    const inserted = await MedicalRecord.insertMany(demoRecords);
    console.log(`✅ Inserted ${inserted.length} demo medical records`);

    // Show summary
    const records = await MedicalRecord.find({ patientId });
    console.log(`\n📋 Total records in database: ${records.length}`);
    records.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.doctorName} - ${r.diagnosis} (${new Date(r.visitDate).toLocaleDateString()})`);
    });

    console.log("\n✅ Seeding completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error during seeding:", err.message);
    process.exit(1);
  }
}

seedRecords();
