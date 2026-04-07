const User = require("../models/User");
const Doctor = require("../models/Doctor");
const jwt = require("jsonwebtoken");

exports.signup = async (req,res)=>{
  try {
    const { name, email, phone, password, role, specialization, experience } = req.body;
    
    // Validate required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }
    
    // Create User
    const user = await User.create({
      name,
      email,
      phone,
      password,
      role
    });
    
    // If doctor, create Doctor profile
    if (role === "doctor") {
      if (!specialization) {
        // Delete user if specialization missing
        await User.findByIdAndDelete(user._id);
        return res.status(400).json({ error: "Specialization required for doctors" });
      }
      
      const doctor = await Doctor.create({
        userId: user._id,
        name,
        email,
        phone,
        specialization,
        experience: experience || 0,
        availableDays: ["Monday", "Wednesday", "Friday"],
        timeSlots: ["09:00 AM", "10:00 AM", "02:00 PM", "03:00 PM"]
      });
      
      user.doctorProfile = doctor._id;
      await user.save();
    }
    
    res.status(201).json({ 
      msg: "✅ Doctor account created successfully! Please login to continue.",
      user: { _id: user._id, name, email, role },
      success: true
    });
  } catch (error) {
    console.error("❌ Signup error:", error);
    res.status(500).json({ error: error.message || "Signup failed" });
  }
};

exports.login = async (req,res)=>{
  try {
    const { email, password, role } = req.body;
    
    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ msg: "❌ Email and password required" });
    }
    
    const user = await User.findOne({ email });
    
    if (!user || user.password !== password) {
      return res.status(400).json({ msg: "❌ Invalid email or password" });
    }
    
    // Check role if specified
    if (role && user.role !== role) {
      return res.status(401).json({ msg: `❌ This account is registered as a ${user.role}, not a ${role}` });
    }
    
    const token = jwt.sign({ id: user._id }, "secret");
    
    res.json({ 
      token, 
      user: { 
        _id: user._id, 
        name: user.name, 
        email: user.email, 
        phone: user.phone,
        role: user.role 
      },
      msg: `✅ Welcome back, ${user.name}!`
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ msg: error.message || "Login failed" });
  }
};
