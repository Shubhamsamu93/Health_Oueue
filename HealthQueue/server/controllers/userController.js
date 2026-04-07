const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const MedicalRecord = require("../models/MedicalRecord");
const {
  findUserById,
  getPatientHistory,
  sanitizeUser,
  updateUserProfile,
  updateUserPassword
} = require("../lib/store");

const TOKEN_SECRETS = [
  process.env.JWT_SECRET || "healthqueue-secret",
  "secret"
];

function normalizeId(value) {
  return String(value || "");
}

function parseDateValue(value, time) {
  if (!value) {
    return new Date(0);
  }

  if (typeof value === "string" && value.includes("T")) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
  }

  const parsed = new Date(time ? `${value} ${time}` : value);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function getRequestedPatientId(req) {
  const authHeader = req.headers.authorization || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (bearer) {
    for (const secret of TOKEN_SECRETS) {
      try {
        const payload = jwt.verify(bearer, secret);
        if (payload?.id) {
          return String(payload.id);
        }
      } catch (_error) {
        continue;
      }
    }
  }

  return String(req.query.patientId || req.body.patientId || req.params.patientId || "").trim();
}

function buildCompletion(profile) {
  const checks = [
    Boolean(profile.name),
    Boolean(profile.email),
    Boolean(profile.phone),
    Boolean(profile.age),
    Boolean(profile.gender),
    Boolean(profile.address)
  ];
  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}

function mapAppointmentItem(item) {
  const appointmentDate = parseDateValue(item.date || item.appointmentDate, item.time || item.timeSlot);
  const status = String(item.status || "").toLowerCase();
  return {
    id: item._id || item.id,
    doctorName: item.doctorName || item.doctor || "Doctor",
    department: item.department || item.specialization || "General OPD",
    date: appointmentDate.toISOString(),
    displayDate: appointmentDate.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }),
    displayTime: appointmentDate.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit"
    }),
    status: status || "upcoming",
    token: item.token || item.tokenNumber || item.queueToken || "N/A",
    reason: item.reason || item.visitType || "Consultation"
  };
}

function mapRecordItem(record, fallbackIndex = 1) {
  const visitDate = parseDateValue(record.visitDate || record.createdAt);
  const title = record.diagnosis || record.visitType || record.title || `Medical Record ${fallbackIndex}`;
  return {
    id: record._id || record.id || `record-${fallbackIndex}`,
    title,
    doctorName: record.doctorName || "Treating Doctor",
    type: record.visitType || "Prescription",
    date: visitDate.toISOString(),
    displayDate: visitDate.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }),
    status: record.status || "completed",
    summary: record.notes || record.precautions || record.diagnosis || "Medical summary available",
    downloadable: true
  };
}

async function getMongoProfile(patientId) {
  const user = await User.findById(patientId).lean();
  if (!user) {
    return null;
  }

  const appointments = await Appointment.find({ patientId }).lean();
  const records = await MedicalRecord.find({ patientId }).sort({ visitDate: -1 }).lean();

  const mappedAppointments = appointments
    .map(mapAppointmentItem)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const now = new Date();
  const activeQueue = mappedAppointments
    .filter((item) => {
      const status = String(item.status || "").toLowerCase();
      return ["waiting", "in-progress", "pending", "upcoming", "confirmed"].includes(status) && new Date(item.date) >= new Date(now.getTime() - 24 * 60 * 60 * 1000);
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;

  return {
    profile: {
      id: user._id,
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      age: user.age || "",
      gender: user.gender || "",
      address: user.address || "",
      role: user.role || "patient",
      createdAt: user.createdAt || new Date().toISOString()
    },
    appointments: mappedAppointments,
    records: records.map(mapRecordItem),
    queue: activeQueue ? {
      token: activeQueue.token,
      position: activeQueue.status === "in-progress" ? 0 : 1,
      status: activeQueue.status
    } : null
  };
}

async function getFallbackProfile(patientId) {
  const user = await findUserById(patientId);
  if (!user) {
    return null;
  }

  const history = await getPatientHistory(patientId);
  return {
    profile: {
      id: user.id,
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      age: user.age || "",
      gender: user.gender || "",
      address: user.address || "",
      role: user.role || "patient",
      createdAt: user.createdAt || new Date().toISOString()
    },
    appointments: history.map(mapAppointmentItem),
    records: [],
    queue: (() => {
      const active = history.find((item) => ["waiting", "in-progress"].includes(String(item.status || "").toLowerCase()));
      if (!active) {
        return null;
      }
      return {
        token: active.token || active.tokenNumber || "N/A",
        position: Number.isFinite(active.position) ? active.position : (active.patientsAhead || 0) + 1,
        status: active.status || "waiting"
      };
    })()
  };
}

exports.getProfile = async (req, res) => {
  try {
    const patientId = getRequestedPatientId(req);
    if (!patientId) {
      return res.status(400).json({ message: "Patient id is required." });
    }

    const mongoProfile = await getMongoProfile(patientId).catch(() => null);
    const fallbackProfile = mongoProfile || await getFallbackProfile(patientId);

    if (!fallbackProfile) {
      return res.status(404).json({ message: "Profile not found." });
    }

    return res.json({
      ...fallbackProfile,
      completion: buildCompletion(fallbackProfile.profile)
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to load profile." });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const patientId = getRequestedPatientId(req);
    if (!patientId) {
      return res.status(400).json({ message: "Patient id is required." });
    }

    const payload = {
      name: req.body.name,
      phone: req.body.phone,
      address: req.body.address,
      age: req.body.age,
      gender: req.body.gender
    };

    let updatedUser = null;
    if (normalizeId(patientId).match(/^[a-f\d]{24}$/i)) {
      updatedUser = await User.findByIdAndUpdate(
        patientId,
        payload,
        { new: true, runValidators: false }
      ).lean();
      if (updatedUser) {
        updatedUser = sanitizeUser(updatedUser);
      }
    }

    if (!updatedUser) {
      updatedUser = await updateUserProfile(patientId, payload);
    }

    return res.json({
      message: "Profile updated successfully.",
      profile: {
        id: updatedUser._id || updatedUser.id,
        name: updatedUser.name || "",
        email: updatedUser.email || "",
        phone: updatedUser.phone || "",
        age: updatedUser.age || "",
        gender: updatedUser.gender || "",
        address: updatedUser.address || ""
      },
      completion: buildCompletion(updatedUser)
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to update profile." });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const patientId = getRequestedPatientId(req);
    const { newPassword } = req.body;

    if (!patientId) {
      return res.status(400).json({ message: "Patient id is required." });
    }

    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters long." });
    }

    let updated = null;
    if (normalizeId(patientId).match(/^[a-f\d]{24}$/i)) {
      updated = await User.findByIdAndUpdate(
        patientId,
        { password: newPassword },
        { new: true, runValidators: false }
      ).lean();
    }

    if (!updated) {
      updated = await updateUserPassword(patientId, newPassword);
    }

    return res.json({ message: "Password changed successfully." });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to change password." });
  }
};
