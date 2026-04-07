// Quick test to create a patient and seed records
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const MedicalRecord = require("./models/MedicalRecord");

async function quickTest() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("📡 Connected to MongoDB");

    // Check if patient exists
    let patient = await User.findOne({ email: "patient1@healthqueue.com" });
    
    if (!patient) {
      console.log("Creating test patient...");
      patient = await User.create({
        name: "Test Patient",
        email: "patient1@healthqueue.com",
        phone: "9876543210",
        password: "password123",
        role: "patient"
      });
      console.log("✅ Patient created:", patient._id);
    } else {
      console.log("✅ Patient already exists:", patient._id);
    }

    // Create sample medical records
    const demoRecords = [
      {
        patientId: patient._id,
        doctorName: "Dr. Rajesh Kumar",
        specialization: "General Physician",
        visitDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        visitType: "consultation",
        diagnosis: "Common Cold with mild fever",
        symptoms: ["fever", "cough", "sore throat", "body aches"],
        medications: [
          { name: "Paracetamol 500mg", dosage: "500mg", frequency: "Twice daily", duration: "5 days" },
          { name: "Azithromycin", dosage: "500mg", frequency: "Once daily", duration: "3 days" },
          { name: "Throat lozenges", dosage: "1 lozenge", frequency: "Every 2 hours as needed", duration: "5 days" }
        ],
        precautions: "1. Get at least 7-8 hours of sleep daily\n2. Stay hydrated - drink warm water, herbal tea, or warm lemon water\n3. Gargle with warm salt water 3-4 times daily\n4. Avoid cold water, ice cream, and cold drinks\n5. Eat warm, easy to digest food\n6. Avoid heavy, spicy, or fried food\n7. Take complete rest for 2-3 days\n8. Maintain room humidity to ease congestion",
        notes: "Patient showing mild symptoms. ECG and chest X-ray done - all normal. If symptoms persist after 5 days, please revisit clinic. Avoid crowded places.",
        status: "completed",
        followUp: "After 5 days if symptoms persist"
      },
      {
        patientId: patient._id,
        doctorName: "Dr. Priya Singh",
        specialization: "Cardiologist",
        visitDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        visitType: "checkup",
        diagnosis: "Pre-hypertension (Stage 1)",
        symptoms: ["occasional dizziness", "slight headache"],
        medications: [
          { name: "Lisinopril", dosage: "10mg", frequency: "Once daily morning", duration: "30 days" },
          { name: "Aspirin", dosage: "75mg", frequency: "Once daily after food", duration: "30 days" }
        ],
        precautions: "1. Reduce salt intake to less than 5g per day\n2. Perform 30 mins moderate aerobic exercise 5 days a week\n3. Maintain healthy weight - BMI 18.5-24.9\n4. Avoid smoking and limit alcohol\n5. Practice meditation 15 mins daily\n6. Avoid caffeine-rich beverages\n7. Sleep 7-9 hours every night\n8. Monitor BP bi-weekly at home",
        notes: "ECG shows normal pattern. Echocardiography is normal. At pre-hypertension stage. Lifestyle modifications critical to prevent progression to Stage 2.",
        status: "completed",
        followUp: "After 30 days - recheck BP and medication tolerance"
      },
      {
        patientId: patient._id,
        doctorName: "Dr. Amit Patel",
        specialization: "Orthopedic Surgeon",
        visitDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        visitType: "followup",
        diagnosis: "Knee pain (Grade 2 osteoarthritis) - significantly improved",
        symptoms: ["mild knee pain", "occasional morning stiffness"],
        medications: [
          { name: "Ibuprofen", dosage: "400mg", frequency: "Once daily after food", duration: "7 days" },
          { name: "Glucosamine Sulfate", dosage: "1500mg", frequency: "Once daily", duration: "60 days" }
        ],
        precautions: "1. Continue daily physiotherapy exercises for 45 mins\n2. Apply ice for 15 mins after activities, then rest\n3. Avoid stair climbing - use elevators\n4. Do not sit cross-legged or squat\n5. Use proper footwear with cushioning\n6. Maintain healthy body weight\n7. Sleep with pillow under knees for comfort\n8. Walk on flat, soft surfaces only",
        notes: "X-ray shows excellent progress compared to initial visit. Swelling has reduced significantly. Patient showing great improvement with physiotherapy adherence. Advised to continue exercises and strengthen surrounding muscles.",
        status: "completed",
        followUp: "After 2 weeks - review if pain persists"
      },
      {
        patientId: patient._id,
        doctorName: "Dr. Neha Verma",
        specialization: "Diabetologist",
        visitDate: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
        visitType: "test",
        diagnosis: "Diabetes Screening - Prediabetic State (Fasting glucose: 118 mg/dL)",
        symptoms: ["occasional fatigue"],
        medications: [
          { name: "Metformin", dosage: "500mg", frequency: "Twice daily with food", duration: "Ongoing" }
        ],
        precautions: "1. Follow strict diabetic diet - low sugar, low carbs\n2. Eat at regular intervals (5 small meals instead of 3 large)\n3. Include high-fiber foods (vegetables, oats, legumes)\n4. Avoid refined carbohydrates and sugary drinks\n5. Exercise for 45-60 mins daily (brisk walking preferred)\n6. Monitor fasting blood glucose weekly\n7. Maintain healthy weight (target loss 3-5 kg)\n8. Manage stress through meditation",
        notes: "HbA1c: 6.2% (prediabetic range). At risk of developing Type 2 diabetes. Early intervention with diet and exercise can reverse this condition. Lifestyle changes are critical now.",
        status: "completed",
        followUp: "After 30 days - repeat fasting glucose and HbA1c test"
      },
      {
        patientId: patient._id,
        doctorName: "Dr. Vikram Sharma",
        specialization: "Neurologist",
        visitDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        visitType: "consultation",
        diagnosis: "Tension Type Headaches with Cervico-cranial syndrome",
        symptoms: ["frequent headaches", "neck stiffness", "shoulder tension"],
        medications: [
          { name: "Aspirin", dosage: "500mg", frequency: "As needed for headache", duration: "PRN" },
          { name: "Amitriptyline", dosage: "10mg", frequency: "Once at bedtime", duration: "30 days" },
          { name: "Muscle relaxant cream", dosage: "Apply locally", frequency: "Twice daily", duration: "30 days" }
        ],
        precautions: "1. Maintain proper posture - keep monitor at eye level\n2. Take 5-min breaks every 30 mins of screen time\n3. Do neck and shoulder stretches regularly (every 2 hours)\n4. Avoid sleeping on high or low pillows - use firm support\n5. Practice yoga and meditation for 20 mins daily\n6. Reduce stress through breathing exercises\n7. Apply warm compress to neck for 15 mins daily\n8. Keep work desk ergonomically correct",
        notes: "MRI brain is normal. Tension headaches are stress and posture related. Patient showing good improvement with lifestyle changes. Advised to continue prescribed exercises and meditation.",
        status: "completed",
        followUp: "After 2 weeks - review medication effectiveness"
      }
    ];

    // Delete existing records for this patient
    await MedicalRecord.deleteMany({ patientId: patient._id });
    console.log("🗑️  Cleared existing records");

    // Insert new records
    const inserted = await MedicalRecord.insertMany(demoRecords);
    console.log(`✅ Inserted ${inserted.length} medical records`);

    // Show summary
    console.log("\n📋 Database Summary:");
    console.log(`   Patient ID: ${patient._id}`);
    console.log(`   Patient Email: patient1@healthqueue.com`);
    console.log(`   Password: password123`);
    console.log(`   Medical Records: ${inserted.length}`);

    console.log("\n✅ Setup completed! You can now:");
    console.log("   1. Login at http://localhost:5000/patient/login.html");
    console.log("   2. Email: patient1@healthqueue.com");
    console.log("   3. Password: password123");
    console.log("   4. Click 'View Records' button to see medical records");

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

quickTest();
