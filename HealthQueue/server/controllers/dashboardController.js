const mongoose = require("mongoose");
const fs = require("fs/promises");
const path = require("path");
const Appointment = require("../models/Appointment");
const MedicalRecord = require("../models/MedicalRecord");
const Doctor = require("../models/Doctor");
const DB_JSON_PATH = path.join(__dirname, "../data/db.json");

async function readJsonFallback() {
  try {
    const raw = await fs.readFile(DB_JSON_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return { users: [], appointments: [] };
  }
}

function parseAppointmentDate(appointment) {
  const rawDate = appointment?.date || appointment?.appointmentDate;
  const rawTime = appointment?.time || appointment?.timeSlot;

  if (!rawDate) {
    return new Date(0);
  }

  // If the date already contains a time portion, let Date parse it directly.
  if (typeof rawDate === "string" && rawDate.includes("T")) {
    const parsed = new Date(rawDate);
    return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
  }

  if (rawTime && typeof rawDate === "string") {
    const parsed = new Date(`${rawDate} ${rawTime}`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const parsed = new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

async function findDoctorDetails(doctorId) {
  if (!doctorId) {
    return null;
  }

  try {
    let doctor = null;

    if (mongoose.Types.ObjectId.isValid(String(doctorId))) {
      doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        doctor = await Doctor.findOne({ userId: doctorId });
      }
    }

    return doctor;
  } catch (error) {
    return null;
  }
}

function normalizeId(value) {
  return String(value || "");
}

function normalizeQueueStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["cancelled", "canceled", "rejected"].includes(value)) return "cancelled";
  if (["completed", "done"].includes(value)) return "completed";
  if (["approved", "confirmed", "in-progress"].includes(value)) return "approved";
  return "pending";
}

function normalizeToken(value) {
  const raw = String(value || "").trim();
  return raw || null;
}

function formatQueueToken(appointment, fallbackIndex) {
  const actualToken = normalizeToken(
    appointment?.token ||
    appointment?.queueToken ||
    appointment?.tokenNumber
  );

  if (actualToken) {
    return actualToken;
  }

  const safeIndex = Number.isFinite(fallbackIndex) && fallbackIndex >= 0 ? fallbackIndex + 1 : 1;
  return `#${safeIndex}`;
}

function toQueuePayload(activeAppointment, queueItems, activeIndex) {
  const safeQueue = queueItems.length ? queueItems : [activeAppointment];
  const safeIndex = activeIndex >= 0 ? activeIndex : 0;
  const servingIndex = Math.max(
    safeQueue.findIndex((item) => ["approved", "confirmed", "in-progress"].includes(String(item.status || "").toLowerCase())),
    0
  );
  const nowServingAppointment = safeQueue[servingIndex] || safeQueue[0];
  const timelineTokens = safeQueue.map((item, index) => ({
    token: formatQueueToken(item, index),
    isServing: normalizeId(item._id || item.id) === normalizeId(nowServingAppointment?._id || nowServingAppointment?.id),
    isPatient: normalizeId(item._id || item.id) === normalizeId(activeAppointment._id || activeAppointment.id)
  }));

  const patientsAhead = safeIndex > servingIndex ? safeIndex - servingIndex : 0;

  return {
    tokenNumber: formatQueueToken(activeAppointment, safeIndex),
    yourToken: formatQueueToken(activeAppointment, safeIndex),
    nowServingToken: formatQueueToken(nowServingAppointment, servingIndex),
    patientsAhead,
    estimatedWaitingTime: patientsAhead * 10,
    timelineTokens,
    lastUpdated: new Date().toISOString()
  };
}

function choosePatientId(patientId, db) {
  if (patientId) {
    return patientId;
  }

  const firstPatient = (db.users || []).find((user) => user.role === "patient");
  return firstPatient?.id || null;
}

function mapFallbackAppointment(appointment, db) {
  const doctor = (db.users || []).find((user) => user.id === appointment.doctorId);
  return {
    id: appointment.id,
    doctorName: doctor?.name || "Doctor",
    department: appointment.department || doctor?.department || doctor?.specialization || "General",
    dateTime: parseAppointmentDate(appointment),
    status: normalizeQueueStatus(appointment.status),
    token: appointment.token || "N/A",
    doctorId: appointment.doctorId
  };
}

function buildFallbackQueueStatus(appointment, queueItems) {
  const activeStatuses = ["waiting", "in-progress", "pending", "approved", "confirmed"];
  const sameDoctorQueue = queueItems
    .filter((item) => normalizeId(item.doctorId) === normalizeId(appointment.doctorId))
    .filter((item) => activeStatuses.includes(String(item.status || "").toLowerCase()))
    .sort((a, b) => parseAppointmentDate(a) - parseAppointmentDate(b));

  const queueIndex = sameDoctorQueue.findIndex((item) => normalizeId(item.id) === normalizeId(appointment.id));
  return toQueuePayload(appointment, sameDoctorQueue, queueIndex);
}

function buildFallbackMedicines() {
  return [
    { name: "Aspirin 100mg", time: "Morning", dosage: "1 tablet" },
    { name: "Metformin 500mg", time: "Morning & Evening", dosage: "1 tablet" },
    { name: "Vitamin D3 1000 IU", time: "Evening", dosage: "1 capsule" }
  ];
}

exports.getUpcomingAppointmentSummary = async (req, res) => {
  try {
    const { patientId } = req.query;
    const now = new Date();
    const appointments = patientId ? await Appointment.find({ patientId }) : await Appointment.find();
    const upcoming = appointments
      .map((appointment) => ({ appointment, parsedDate: parseAppointmentDate(appointment) }))
      .filter(({ appointment, parsedDate }) => {
        const status = normalizeQueueStatus(appointment.status);
        return parsedDate >= now && status !== "cancelled" && status !== "completed";
      })
      .sort((a, b) => a.parsedDate - b.parsedDate)[0];

    if (!upcoming) {
      const fallbackDb = await readJsonFallback();
      const effectivePatientId = choosePatientId(patientId, fallbackDb);
      const fallbackUpcoming = (fallbackDb.appointments || [])
        .filter((appointment) => !effectivePatientId || normalizeId(appointment.patientId) === normalizeId(effectivePatientId))
        .map((appointment) => mapFallbackAppointment(appointment, fallbackDb))
        .filter((appointment) => {
          const status = normalizeQueueStatus(appointment.status);
          return appointment.dateTime >= now && status !== "cancelled" && status !== "completed";
        })
        .sort((a, b) => a.dateTime - b.dateTime)[0] || null;

      return res.json(fallbackUpcoming);
    }

    const doctor = await findDoctorDetails(upcoming.appointment.doctorId);
    return res.json({
      id: upcoming.appointment._id,
      doctorName: upcoming.appointment.doctorName || doctor?.name || "Doctor",
      department: upcoming.appointment.department || doctor?.specialization || upcoming.appointment.specialization || "General",
      dateTime: upcoming.parsedDate,
      status: upcoming.appointment.status || "pending"
    });
  } catch (error) {
    const fallbackDb = await readJsonFallback();
    const fallbackUpcoming = (fallbackDb.appointments || [])
      .map((appointment) => mapFallbackAppointment(appointment, fallbackDb))
      .sort((a, b) => a.dateTime - b.dateTime)[0] || null;
    return res.json(fallbackUpcoming);
  }
};

exports.getQueueStatus = async (req, res) => {
  try {
    const { patientId } = req.query;
    const now = new Date();
    const patientAppointments = patientId ? await Appointment.find({ patientId }) : await Appointment.find();
    const activeAppointmentEntry = patientAppointments
      .map((appointment) => ({ appointment, parsedDate: parseAppointmentDate(appointment) }))
      .filter(({ appointment, parsedDate }) => {
        const status = normalizeQueueStatus(appointment.status);
        return parsedDate >= now && status !== "cancelled" && status !== "completed";
      })
      .sort((a, b) => a.parsedDate - b.parsedDate)[0];

    if (!activeAppointmentEntry) {
      const fallbackDb = await readJsonFallback();
      const effectivePatientId = choosePatientId(patientId, fallbackDb);
      const fallbackActive = (fallbackDb.appointments || [])
        .filter((appointment) => !effectivePatientId || normalizeId(appointment.patientId) === normalizeId(effectivePatientId))
        .filter((appointment) => {
          const status = normalizeQueueStatus(appointment.status);
          const parsedDate = parseAppointmentDate(appointment);
          return parsedDate >= now && status !== "cancelled" && status !== "completed";
        })
        .sort((a, b) => parseAppointmentDate(a) - parseAppointmentDate(b))[0];

      return res.json(fallbackActive ? buildFallbackQueueStatus(fallbackActive, fallbackDb.appointments || []) : null);
    }

    const activeAppointment = activeAppointmentEntry.appointment;
    const queueAppointments = await Appointment.find({ doctorId: activeAppointment.doctorId });
    const sameDayQueue = queueAppointments
      .map((appointment) => ({ appointment, parsedDate: parseAppointmentDate(appointment) }))
      .filter(({ appointment, parsedDate }) => {
        const status = normalizeQueueStatus(appointment.status);
        return (
          parsedDate.toDateString() === activeAppointmentEntry.parsedDate.toDateString() &&
          status !== "cancelled" &&
          status !== "completed"
        );
      })
      .sort((a, b) => a.parsedDate - b.parsedDate);

    const queueIndex = sameDayQueue.findIndex(({ appointment }) => String(appointment._id) === String(activeAppointment._id));
    const queueItems = sameDayQueue.map(({ appointment }) => appointment);

    return res.json(toQueuePayload(activeAppointment, queueItems, queueIndex));
  } catch (error) {
    const fallbackDb = await readJsonFallback();
    const fallbackActive = (fallbackDb.appointments || [])[0];
    return res.json(fallbackActive ? buildFallbackQueueStatus(fallbackActive, fallbackDb.appointments || []) : null);
  }
};

exports.getTodaysMedicines = async (req, res) => {
  try {
    const { patientId } = req.query;
    const records = patientId ? await MedicalRecord.find({ patientId }).sort({ visitDate: -1 }).limit(5) : await MedicalRecord.find().sort({ visitDate: -1 }).limit(5);
    const medicines = records
      .flatMap((record) => (record.medications || []).map((medicine) => ({
        name: medicine.name || "Medicine",
        time: medicine.frequency || "As prescribed",
        dosage: medicine.dosage || "1 dose"
      })))
      .slice(0, 5);

    return res.json(medicines.length ? medicines : buildFallbackMedicines());
  } catch (error) {
    return res.json(buildFallbackMedicines());
  }
};

exports.getPendingReports = async (req, res) => {
  try {
    const { patientId } = req.query;
    const query = {
      status: { $in: ["draft", "pending_review"] }
    };
    if (patientId) {
      query.patientId = patientId;
    }
    const reports = await MedicalRecord.find(query).sort({ visitDate: -1 }).limit(10);

    return res.json({
      count: reports.length,
      reports: reports.map((report) => ({
        id: report._id,
        title: report.diagnosis || report.visitType || "Report",
        status: report.status,
        visitDate: report.visitDate
      }))
    });
  } catch (error) {
    return res.json({
      count: 0,
      reports: []
    });
  }
};
