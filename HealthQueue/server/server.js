const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express(); // ✅ sabse pehle

app.use(cors());
app.use(express.json());

// ✅ DB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

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
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
