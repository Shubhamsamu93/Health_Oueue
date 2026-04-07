const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express(); // ✅ sabse pehle

app.use(cors());
app.use(express.json());

// ✅ Improved DB connection for Serverless
const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) {
    console.log("Using existing MongoDB connection");
    return;
  }
  
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("❌ MONGO_URI is missing!");
    return;
  }
  
  try {
    console.log("Attempting to connect to MongoDB...");
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000 // Fast fail if IP is blocked
    });
    console.log("✅ MongoDB Connected Successfully");
  } catch (err) {
    console.error("❌ MongoDB Connection Failed:", err.message);
  }
};

// Middleware to ensure DB is connected before processing requests
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// ✅ routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/doctors", require("./routes/doctorRoutes"));
app.use("/api/appointments", require("./routes/appointmentRoutes"));
app.use("/api/queue", require("./routes/queueRoutes"));
app.use("/api/medicines", require("./routes/medicinesRoutes"));
app.use("/api/reports", require("./routes/reportsRoutes"));
app.use("/api/records", require("./routes/recordRoutes"));
app.use("/api/user", require("./routes/userRoutes"));
app.use("/api/chatbot", require("./routes/chatbotRoutes"));

// ✅ Health check endpoint for Render
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "HealthQueue Backend is running" });
});

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
