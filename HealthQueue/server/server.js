const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const path = require("path");

const app = express(); // ✅ sabse pehle

app.use(cors());
app.use(express.json());

// ✅ static frontend serve
app.use(express.static(path.join(__dirname, "../client")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

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

// ✅ server start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => 
  console.log(`Server running on port ${PORT}`)
);
