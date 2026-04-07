const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const User = require("../models/User");
const Doctor = require("../models/Doctor");
const MedicalRecord = require("../models/MedicalRecord");

const DB_JSON_PATH = path.join(__dirname, "../data/db.json");

function normalizeId(value) {
  return String(value || "");
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function parseAppointmentDate(dateValue, timeValue) {
  if (!dateValue) {
    return new Date(0);
  }

  if (typeof dateValue === "string" && dateValue.includes("T")) {
    const parsed = new Date(dateValue);
    return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
  }

  const parsed = new Date(timeValue ? `${dateValue} ${timeValue}` : dateValue);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function isToday(dateValue, timeValue) {
  const parsed = parseAppointmentDate(dateValue, timeValue);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toDateString() === new Date().toDateString();
}

function normalizeAppointmentStatus(status) {
  const raw = String(status || "").toLowerCase();
  if (["pending", "waiting", "scheduled"].includes(raw)) return "pending";
  if (["approved", "confirmed", "in-progress"].includes(raw)) return "approved";
  if (["rejected", "cancelled", "canceled"].includes(raw)) return "rejected";
  if (["completed", "done"].includes(raw)) return "completed";
  return "pending";
}

function toStorageStatus(status) {
  const normalized = normalizeAppointmentStatus(status);
  const map = {
    pending: "waiting",
    approved: "approved",
    rejected: "cancelled",
    completed: "completed"
  };
  return map[normalized] || "waiting";
}

function formatExperience(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return `${numeric} years`;
  }

  return String(value);
}

async function readJsonFallback() {
  try {
    const raw = await fs.readFile(DB_JSON_PATH, "utf8");
    return JSON.parse(raw);
  } catch (_error) {
    return { users: [], appointments: [] };
  }
}

async function writeJsonFallback(db) {
  await fs.writeFile(DB_JSON_PATH, JSON.stringify(db, null, 2));
}

async function predict(doctorId, time) {
  const count = await Appointment.countDocuments({ doctorId, time }).catch(() => 0);
  return count * 10;
}

async function resolveDoctorLookupIds(doctorId) {
  const lookup = new Set();
  const primaryId = normalizeId(doctorId);
  if (!primaryId) {
    return [];
  }

  lookup.add(primaryId);

  try {
    if (isValidObjectId(primaryId)) {
      const doctorProfile = await Doctor.findById(primaryId).lean().catch(() => null);
      if (doctorProfile?.userId) {
        lookup.add(normalizeId(doctorProfile.userId));
      }

      const doctorByUser = await Doctor.findOne({ userId: primaryId }).lean().catch(() => null);
      if (doctorByUser?._id) {
        lookup.add(normalizeId(doctorByUser._id));
      }
    }
  } catch (_error) {
    return [...lookup];
  }

  return [...lookup];
}

async function resolveDoctorNames(doctorId) {
  const names = new Set();
  const primaryId = normalizeId(doctorId);
  if (!primaryId) {
    return [];
  }

  try {
    if (isValidObjectId(primaryId)) {
      const [doctorProfile, doctorByUser, user] = await Promise.all([
        Doctor.findById(primaryId).lean().catch(() => null),
        Doctor.findOne({ userId: primaryId }).lean().catch(() => null),
        User.findById(primaryId).lean().catch(() => null)
      ]);

      if (doctorProfile?.name) names.add(String(doctorProfile.name).trim().toLowerCase());
      if (doctorByUser?.name) names.add(String(doctorByUser.name).trim().toLowerCase());
      if (user?.name) names.add(String(user.name).trim().toLowerCase());

      if (doctorProfile?.userId && isValidObjectId(doctorProfile.userId)) {
        const linkedUser = await User.findById(doctorProfile.userId).lean().catch(() => null);
        if (linkedUser?.name) names.add(String(linkedUser.name).trim().toLowerCase());
      }
    }
  } catch (_error) {
    return [...names];
  }

  return [...names];
}

async function getMongoUserById(id) {
  if (!isValidObjectId(id)) {
    return null;
  }

  return User.findById(id).lean().catch(() => null);
}

async function getMongoDoctorProfile(doctorId) {
  if (!doctorId) {
    return null;
  }

  if (isValidObjectId(doctorId)) {
    const byId = await Doctor.findById(doctorId).lean().catch(() => null);
    if (byId) {
      return byId;
    }

    return Doctor.findOne({ userId: doctorId }).lean().catch(() => null);
  }

  return null;
}

async function getMongoPatientRecords(patientId) {
  if (!patientId || !isValidObjectId(patientId)) {
    return [];
  }

  return MedicalRecord.find({ patientId })
    .sort({ visitDate: -1 })
    .limit(4)
    .lean()
    .catch(() => []);
}

async function enrichMongoAppointment(appointment) {
  const [patient, doctorUser, doctorProfile, records] = await Promise.all([
    getMongoUserById(appointment.patientId),
    getMongoUserById(appointment.doctorId),
    getMongoDoctorProfile(appointment.doctorId),
    getMongoPatientRecords(appointment.patientId)
  ]);

  const parsedDate = parseAppointmentDate(appointment.date, appointment.timeSlot || appointment.time);

  return {
    id: appointment._id,
    _id: appointment._id,
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    patientName: appointment.patientName || patient?.name || "Patient",
    patientEmail: patient?.email || "",
    patientPhone: patient?.phone || "",
    patientGender: patient?.gender || "",
    patientAge: patient?.age || "",
    doctorName: appointment.doctorName || doctorUser?.name || doctorProfile?.name || "Doctor",
    doctorEmail: doctorUser?.email || doctorProfile?.email || "",
    doctorPhone: doctorUser?.phone || doctorProfile?.phone || "",
    department: appointment.department || doctorUser?.department || doctorProfile?.hospital || "General OPD",
    specialization: appointment.specialization || doctorUser?.specialization || doctorProfile?.specialization || "General Consultation",
    doctorExperience: formatExperience(doctorUser?.experience ?? doctorProfile?.experience),
    hospital: appointment.hospital || doctorProfile?.hospital || "",
    token: appointment.token || `#${String(appointment._id).slice(-4)}`,
    tokenNumber: appointment.token || `#${String(appointment._id).slice(-4)}`,
    date: appointment.date,
    time: appointment.time || appointment.timeSlot || "",
    timeSlot: appointment.timeSlot || appointment.time || "Time not set",
    reason: appointment.reason || "Consultation",
    notes: appointment.notes || "",
    status: normalizeAppointmentStatus(appointment.status),
    medicalHistory: records.map((record) => ({
      id: record._id,
      title: record.diagnosis || record.visitType || "Medical record",
      date: record.visitDate || record.createdAt,
      summary: record.notes || record.precautions || record.diagnosis || "Summary available"
    })),
    sortTime: parsedDate.toISOString()
  };
}

function enrichFallbackAppointment(appointment, db) {
  const patient = (db.users || []).find((user) => normalizeId(user.id) === normalizeId(appointment.patientId));
  const doctor = (db.users || []).find((user) => normalizeId(user.id) === normalizeId(appointment.doctorId));
  const parsedDate = parseAppointmentDate(appointment.date, appointment.timeSlot || appointment.time);

  return {
    id: appointment.id,
    _id: appointment.id,
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    patientName: appointment.patientName || patient?.name || "Patient",
    patientEmail: patient?.email || "",
    patientPhone: patient?.phone || "",
    patientGender: patient?.gender || "",
    patientAge: patient?.age || "",
    doctorName: appointment.doctorName || doctor?.name || "Doctor",
    doctorEmail: doctor?.email || "",
    doctorPhone: doctor?.phone || "",
    department: appointment.department || doctor?.department || "General OPD",
    specialization: appointment.specialization || doctor?.specialization || "General Consultation",
    doctorExperience: formatExperience(doctor?.experience),
    hospital: appointment.hospital || "",
    token: appointment.token || "N/A",
    tokenNumber: appointment.token || "N/A",
    date: appointment.date,
    time: appointment.time || appointment.timeSlot || "",
    timeSlot: appointment.timeSlot || appointment.time || "Time not set",
    reason: appointment.reason || "Consultation",
    notes: appointment.notes || "",
    status: normalizeAppointmentStatus(appointment.status),
    medicalHistory: [],
    sortTime: parsedDate.toISOString()
  };
}

async function listMongoDoctorAppointments(doctorId, todayOnly = false) {
  const lookupIds = await resolveDoctorLookupIds(doctorId);
  const doctorNames = await resolveDoctorNames(doctorId);
  if (!lookupIds.length) {
    return [];
  }

  const mongoIds = lookupIds.filter(isValidObjectId).map((id) => new mongoose.Types.ObjectId(id));
  const queryParts = [];
  if (mongoIds.length) {
    queryParts.push({ doctorId: { $in: mongoIds } });
  }
  queryParts.push({ doctorId: { $in: lookupIds } });
  doctorNames.forEach((name) => {
    queryParts.push({ doctorName: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
  });
  const query = { $or: queryParts };

  const appointments = await Appointment.find(query).lean().catch(() => []);
  const filtered = todayOnly
    ? appointments.filter((item) => isToday(item.date, item.timeSlot || item.time))
    : appointments;
  const enriched = await Promise.all(filtered.map(enrichMongoAppointment));

  return enriched.sort((a, b) => new Date(a.sortTime) - new Date(b.sortTime));
}

async function listFallbackDoctorAppointments(doctorId, todayOnly = false) {
  const lookupIds = await resolveDoctorLookupIds(doctorId);
  const doctorNames = await resolveDoctorNames(doctorId);
  const db = await readJsonFallback();

  return (db.appointments || [])
    .filter((item) => lookupIds.includes(normalizeId(item.doctorId)) || doctorNames.includes(String(item.doctorName || "").trim().toLowerCase()))
    .filter((item) => !todayOnly || isToday(item.date, item.timeSlot || item.time))
    .map((item) => enrichFallbackAppointment(item, db))
    .sort((a, b) => new Date(a.sortTime) - new Date(b.sortTime));
}

async function listMongoPatientAppointments(patientId) {
  if (!patientId) {
    return [];
  }

  const query = isValidObjectId(patientId)
    ? { $or: [{ patientId }, { patientId: new mongoose.Types.ObjectId(patientId) }] }
    : { patientId };
  const appointments = await Appointment.find(query).lean().catch(() => []);
  const enriched = await Promise.all(appointments.map(enrichMongoAppointment));

  return enriched.sort((a, b) => new Date(b.sortTime) - new Date(a.sortTime));
}

async function listFallbackPatientAppointments(patientId) {
  const db = await readJsonFallback();
  return (db.appointments || [])
    .filter((item) => normalizeId(item.patientId) === normalizeId(patientId))
    .map((item) => enrichFallbackAppointment(item, db))
    .sort((a, b) => new Date(b.sortTime) - new Date(a.sortTime));
}

exports.book = async (req, res) => {
  const wait = await predict(req.body.doctorId, req.body.time);
  const appt = await Appointment.create(req.body);
  res.json({ appt, wait });
};

exports.getAll = async (_req, res) => {
  const data = await Appointment.find().catch(() => []);
  res.json(data);
};

exports.getPatientAppointments = async (req, res) => {
  try {
    const patientId = req.params.patientId;
    let data = await listMongoPatientAppointments(patientId);

    if (!data.length) {
      data = await listFallbackPatientAppointments(patientId);
    }

    res.json(data);
  } catch (_err) {
    res.status(500).json({ msg: "Error fetching appointments" });
  }
};

exports.getDoctorAppointments = async (req, res) => {
  try {
    const doctorId = req.params.doctorId;
    let data = await listMongoDoctorAppointments(doctorId, false);

    if (!data.length) {
      data = await listFallbackDoctorAppointments(doctorId, false);
    }

    res.json(data);
  } catch (_err) {
    res.status(500).json({ msg: "Error fetching doctor appointments" });
  }
};

exports.getTodayAppointments = async (req, res) => {
  try {
    const doctorId = req.query.doctorId || req.params.doctorId;
    let appointments = await listMongoDoctorAppointments(doctorId, true);

    if (!appointments.length) {
      appointments = await listFallbackDoctorAppointments(doctorId, true);
    }

    res.json({
      doctorId,
      generatedAt: new Date().toISOString(),
      appointments
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Unable to fetch today's appointments." });
  }
};

exports.updateAppointmentStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    const appointmentId = req.params.id;
    const normalizedStatus = normalizeAppointmentStatus(status);

    let updated = null;

    if (isValidObjectId(appointmentId)) {
      const mongoUpdate = {
        status: normalizedStatus,
        ...(notes !== undefined ? { notes } : {})
      };

      const mongoRecord = await Appointment.findByIdAndUpdate(
        appointmentId,
        mongoUpdate,
        { new: true }
      ).lean().catch(() => null);

      if (mongoRecord) {
        updated = await enrichMongoAppointment(mongoRecord);
      }
    }

    if (!updated) {
      const db = await readJsonFallback();
      const fallbackRecord = (db.appointments || []).find((item) => normalizeId(item.id) === normalizeId(appointmentId));

      if (!fallbackRecord) {
        return res.status(404).json({ message: "Appointment not found." });
      }

      fallbackRecord.status = toStorageStatus(normalizedStatus);
      if (notes !== undefined) {
        fallbackRecord.notes = notes;
      }
      await writeJsonFallback(db);
      updated = enrichFallbackAppointment(fallbackRecord, db);
    }

    return res.json({
      message: `Appointment marked as ${normalizedStatus}.`,
      appointment: updated
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to update appointment status." });
  }
};

exports.update = async (req, res) => {
  const data = await Appointment.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  res.json(data);
};
