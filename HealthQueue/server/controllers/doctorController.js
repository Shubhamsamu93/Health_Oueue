const Doctor = require("../models/Doctor");
const User = require("../models/User");

exports.createDoctor = async (req,res)=>{
  try {
    const doc = await Doctor.create(req.body);
    res.status(201).json(doc);
  } catch (error) {
    console.error('Error creating doctor:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getDoctors = async (req,res)=>{
  try {
    const specializationFilter = String(req.query.specialization || '').trim();
    const doctorQuery = specializationFilter
      ? { specialization: { $regex: `^${specializationFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }
      : {};
    const doctors = await Doctor.find(doctorQuery).lean();
    
    if (!doctors || doctors.length === 0) {
      return res.json([]);
    }
    
    // Populate user data (name, email, phone) if available
    const enrichedDoctors = await Promise.all(doctors.map(async (doc) => {
      if (doc.userId) {
        const user = await User.findById(doc.userId).lean();
        if (user) {
          return {
            ...doc,
            name: user.name,
            email: user.email,
            phone: user.phone
          };
        }
      }
      return doc;
    }));
    
    res.json(enrichedDoctors);
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ error: error.message });
  }
};
