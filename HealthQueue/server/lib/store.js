const fs = require("fs/promises");
const path = require("path");
const { hashPassword } = require("./security");

const DB_PATH = path.join(__dirname, "../data/db.json");
const DEFAULT_DEPARTMENTS = ["OPD", "Pharmacy", "Lab"];
const ACTIVE_QUEUE_STATUSES = ["waiting", "in-progress"];
let writeChain = Promise.resolve();

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function startOfDay(dateInput = new Date()) {
  const date = new Date(dateInput);
  date.setHours(0, 0, 0, 0);
  return date;
}

function sameDay(a, b) {
  return startOfDay(a).toISOString() === startOfDay(b).toISOString();
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sortQueue(a, b) {
  const priorityRank = { emergency: 0, normal: 1 };
  const statusRank = { "in-progress": 0, waiting: 1, completed: 2, cancelled: 3 };

  return (
    (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99) ||
    (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99) ||
    new Date(a.createdAt) - new Date(b.createdAt)
  );
}

async function readDb() {
  const raw = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(raw);
}

function writeDb(db) {
  writeChain = writeChain.then(() => fs.writeFile(DB_PATH, JSON.stringify(db, null, 2)));
  return writeChain;
}

async function mutateDb(mutator) {
  const db = await readDb();
  const result = await mutator(db);
  await writeDb(db);
  return result;
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function decorateAppointment(db, appointment) {
  const patient = db.users.find((user) => user.id === appointment.patientId);
  const doctor = db.users.find((user) => user.id === appointment.doctorId);
  const queueItems = db.appointments.filter(
    (item) => sameDay(item.date, appointment.date) && item.department === appointment.department && ACTIVE_QUEUE_STATUSES.includes(item.status)
  );
  const sortedItems = [...queueItems].sort(sortQueue);
  const position = sortedItems.findIndex((item) => item.id === appointment.id);
  const nowServing = sortedItems.find((item) => item.status === "in-progress") || null;
  const averageMinutes = safeNumber(db.meta.averageConsultationMinutes, 12);

  return {
    ...appointment,
    patientName: patient?.name || "Unknown Patient",
    patientPhone: patient?.phone || "",
    doctorName: doctor?.name || "Unassigned Doctor",
    specialization: doctor?.specialization || "",
    position: position === -1 ? null : position + 1,
    patientsAhead: position <= 0 ? 0 : position,
    estimatedWaitMinutes: position === -1 ? 0 : position * averageMinutes,
    nowServingToken: nowServing?.token || null,
  };
}

async function findUserByEmail(email) {
  const db = await readDb();
  return db.users.find((user) => user.email.toLowerCase() === String(email).toLowerCase()) || null;
}

async function findUserById(id) {
  const db = await readDb();
  return db.users.find((user) => user.id === id) || null;
}

async function createUser(data) {
  return mutateDb(async (db) => {
    const user = {
      id: createId("usr"),
      name: data.name,
      email: String(data.email).toLowerCase(),
      phone: data.phone,
      passwordHash: hashPassword(data.password),
      role: data.role,
      age: data.age ? safeNumber(data.age) : null,
      gender: data.gender || "",
      department: data.department || "",
      specialization: data.specialization || "",
      experience: data.experience ? safeNumber(data.experience) : 0,
      createdAt: new Date().toISOString(),
    };

    db.users.push(user);
    return user;
  });
}

async function ensureSeedData() {
  return mutateDb(async (db) => {
    if (db.meta.initialized) {
      return db;
    }

    const now = new Date();
    const admin = {
      id: createId("usr"),
      name: "Admin Desk",
      email: "admin@healthqueue.com",
      phone: "+91 90000 00001",
      passwordHash: hashPassword("admin123"),
      role: "admin",
      createdAt: now.toISOString(),
    };

    const doctorSeeds = [
      ["Dr. Meera Anand", "doctor.opd@healthqueue.com", "OPD", "General Medicine", 9],
      ["Dr. Rohan Nair", "doctor.lab@healthqueue.com", "Lab", "Pathology", 7],
      ["Dr. Kavya Shah", "doctor.pharmacy@healthqueue.com", "Pharmacy", "Clinical Pharmacology", 6],
    ].map(([name, email, department, specialization, experience]) => ({
      id: createId("usr"),
      name,
      email,
      phone: "+91 90000 10000",
      passwordHash: hashPassword("doctor123"),
      role: "doctor",
      department,
      specialization,
      experience,
      createdAt: now.toISOString(),
    }));

    const patientSeeds = [
      ["Anita Sharma", "patient1@healthqueue.com", "+91 98888 11111", 32, "Female"],
      ["Rahul Verma", "patient2@healthqueue.com", "+91 97777 22222", 41, "Male"],
      ["Nisha Khan", "patient3@healthqueue.com", "+91 96666 33333", 27, "Female"],
    ].map(([name, email, phone, age, gender]) => ({
      id: createId("usr"),
      name,
      email,
      phone,
      passwordHash: hashPassword("patient123"),
      role: "patient",
      age,
      gender,
      createdAt: now.toISOString(),
    }));

    db.users.push(admin, ...doctorSeeds, ...patientSeeds);

    db.appointments.push(
      {
        id: createId("apt"),
        token: "OPD-001",
        patientId: patientSeeds[0].id,
        doctorId: doctorSeeds[0].id,
        department: "OPD",
        priority: "normal",
        date: now.toISOString(),
        timeSlot: "09:30",
        reason: "Fever and fatigue",
        status: "in-progress",
        createdAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        startedAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      },
      {
        id: createId("apt"),
        token: "OPD-002",
        patientId: patientSeeds[1].id,
        doctorId: doctorSeeds[0].id,
        department: "OPD",
        priority: "emergency",
        date: now.toISOString(),
        timeSlot: "09:45",
        reason: "Breathing discomfort",
        status: "waiting",
        createdAt: new Date(now.getTime() - 20 * 60 * 1000).toISOString(),
      },
      {
        id: createId("apt"),
        token: "LAB-001",
        patientId: patientSeeds[2].id,
        doctorId: doctorSeeds[1].id,
        department: "Lab",
        priority: "normal",
        date: now.toISOString(),
        timeSlot: "10:00",
        reason: "Blood test",
        status: "waiting",
        createdAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
      },
      {
        id: createId("apt"),
        token: "PHA-001",
        patientId: patientSeeds[0].id,
        doctorId: doctorSeeds[2].id,
        department: "Pharmacy",
        priority: "normal",
        date: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        timeSlot: "11:15",
        reason: "Prescription collection",
        status: "completed",
        createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString(),
        startedAt: new Date(now.getTime() - 24.5 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(now.getTime() - 24.3 * 60 * 60 * 1000).toISOString(),
      }
    );

    db.notifications = [];
    db.meta = {
      initialized: true,
      averageConsultationMinutes: 12,
      departments: DEFAULT_DEPARTMENTS,
      simulatedChannels: ["SMS", "WhatsApp"],
    };

    return db;
  });
}

async function listDoctors(department) {
  const db = await readDb();
  return db.users
    .filter((user) => user.role === "doctor" && (!department || user.department === department))
    .map(sanitizeUser);
}

async function listPatients(search) {
  const db = await readDb();
  const term = search.trim().toLowerCase();

  return db.users
    .filter((user) => user.role === "patient")
    .filter((user) => {
      if (!term) {
        return true;
      }

      return [user.name, user.email, user.phone].some((value) => String(value || "").toLowerCase().includes(term));
    })
    .map((user) => {
      const appointmentCount = db.appointments.filter((appointment) => appointment.patientId === user.id).length;
      return {
        ...sanitizeUser(user),
        appointmentCount,
      };
    });
}

async function addDoctor(data) {
  if (!data.name || !data.email || !data.phone || !data.password || !data.department || !data.specialization) {
    throw new Error("Doctor name, email, phone, password, department, and specialization are required.");
  }

  const existing = await findUserByEmail(data.email);
  if (existing) {
    throw new Error("A user with this email already exists.");
  }

  return sanitizeUser(
    await createUser({
      ...data,
      role: "doctor",
    })
  );
}

async function deleteDoctor(id) {
  return mutateDb(async (db) => {
    const doctor = db.users.find((user) => user.id === id && user.role === "doctor");
    if (!doctor) {
      throw new Error("Doctor not found.");
    }

    const hasActiveAppointments = db.appointments.some(
      (appointment) => appointment.doctorId === id && ACTIVE_QUEUE_STATUSES.includes(appointment.status)
    );
    if (hasActiveAppointments) {
      throw new Error("Doctor still has active queue items.");
    }

    db.users = db.users.filter((user) => user.id !== id);
    return sanitizeUser(doctor);
  });
}

function nextToken(db, department, dateInput) {
  const departmentCode = department.slice(0, 3).toUpperCase();
  const count = db.appointments.filter(
    (appointment) => appointment.department === department && sameDay(appointment.date, dateInput)
  ).length;
  return `${departmentCode}-${String(count + 1).padStart(3, "0")}`;
}

async function bookAppointment(patientId, payload) {
  return mutateDb(async (db) => {
    const patient = db.users.find((user) => user.id === patientId && user.role === "patient");
    if (!patient) {
      throw new Error("Patient account not found.");
    }

    const doctor = db.users.find((user) => user.id === payload.doctorId && user.role === "doctor");
    if (!doctor) {
      throw new Error("Doctor not found.");
    }

    const appointmentDate = payload.date ? new Date(payload.date) : new Date();
    const department = payload.department || doctor.department;

    const appointment = {
      id: createId("apt"),
      token: nextToken(db, department, appointmentDate),
      patientId,
      doctorId: doctor.id,
      department,
      priority: payload.priority === "emergency" ? "emergency" : "normal",
      date: appointmentDate.toISOString(),
      timeSlot: payload.timeSlot || "",
      reason: payload.reason || "General consultation",
      notes: payload.notes || "",
      status: "waiting",
      createdAt: new Date().toISOString(),
      channels: payload.channels || ["SMS"],
    };

    db.appointments.push(appointment);
    return decorateAppointment(db, appointment);
  });
}

async function getPatientHistory(patientId) {
  const db = await readDb();
  return db.appointments
    .filter((appointment) => appointment.patientId === patientId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((appointment) => decorateAppointment(db, appointment));
}

async function getPatientDashboard(patientId) {
  const db = await readDb();
  const patient = db.users.find((user) => user.id === patientId);
  const history = db.appointments
    .filter((appointment) => appointment.patientId === patientId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((appointment) => decorateAppointment(db, appointment));

  const activeAppointment = history.find((appointment) => ACTIVE_QUEUE_STATUSES.includes(appointment.status)) || null;
  const completedVisits = history.filter((appointment) => appointment.status === "completed").length;
  const notifications = [];

  if (activeAppointment && activeAppointment.patientsAhead <= 2) {
    notifications.push({
      id: createId("ntf"),
      type: "turn-near",
      title: "Your turn is near",
      message: `Token ${activeAppointment.token} is only ${activeAppointment.patientsAhead} patient(s) away.`,
    });
  }

  notifications.push({
    id: createId("ntf"),
    type: "channel",
    title: "WhatsApp alert ready",
    message: "Simulated SMS and WhatsApp notifications are enabled for appointment updates.",
  });

  return {
    profile: sanitizeUser(patient),
    summary: {
      activeToken: activeAppointment?.token || "No active token",
      liveQueuePosition: activeAppointment?.position || 0,
      estimatedWaitMinutes: activeAppointment?.estimatedWaitMinutes || 0,
      completedVisits,
    },
    activeAppointment,
    history,
    notifications,
  };
}

async function getDoctorDashboard(doctorId) {
  const db = await readDb();
  const doctor = db.users.find((user) => user.id === doctorId && user.role === "doctor");
  const items = db.appointments
    .filter((appointment) => appointment.doctorId === doctorId)
    .sort(sortQueue)
    .map((appointment) => decorateAppointment(db, appointment));

  const waiting = items.filter((item) => item.status === "waiting");
  const inProgress = items.find((item) => item.status === "in-progress") || null;

  return {
    doctor: sanitizeUser(doctor),
    summary: {
      assignedToday: items.filter((item) => sameDay(item.date, new Date())).length,
      waitingCount: waiting.length,
      inProgressCount: inProgress ? 1 : 0,
      averageWaitMinutes: waiting.length ? Math.round(waiting.reduce((sum, item) => sum + item.estimatedWaitMinutes, 0) / waiting.length) : 0,
    },
    inProgress,
    queue: items,
  };
}

async function getAdminDashboard() {
  const db = await readDb();
  const todayAppointments = db.appointments.filter((appointment) => sameDay(appointment.date, new Date()));
  const decorated = todayAppointments.map((appointment) => decorateAppointment(db, appointment));
  const waitingItems = decorated.filter((appointment) => appointment.status === "waiting");
  const completedToday = decorated.filter((appointment) => appointment.status === "completed");
  const byDepartment = db.meta.departments.map((department) => ({
    department,
    total: decorated.filter((appointment) => appointment.department === department).length,
    waiting: decorated.filter((appointment) => appointment.department === department && appointment.status === "waiting").length,
    inProgress: decorated.filter((appointment) => appointment.department === department && appointment.status === "in-progress").length,
  }));

  return {
    summary: {
      dailyPatients: todayAppointments.length,
      activeWaiting: waitingItems.length,
      completedToday: completedToday.length,
      averageWaitingTime: waitingItems.length
        ? Math.round(waitingItems.reduce((sum, item) => sum + item.estimatedWaitMinutes, 0) / waitingItems.length)
        : 0,
    },
    departments: byDepartment,
    charts: {
      departmentLoad: byDepartment,
      statusMix: [
        { label: "Waiting", value: decorated.filter((item) => item.status === "waiting").length },
        { label: "In Progress", value: decorated.filter((item) => item.status === "in-progress").length },
        { label: "Completed", value: decorated.filter((item) => item.status === "completed").length },
      ],
    },
    recentAppointments: decorated.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8),
  };
}

async function getQueueSnapshot(filters = {}) {
  const db = await readDb();
  const today = new Date();
  const appointments = db.appointments
    .filter((appointment) => sameDay(appointment.date, today))
    .filter((appointment) => !filters.department || appointment.department === filters.department)
    .filter((appointment) => !filters.doctorId || appointment.doctorId === filters.doctorId)
    .sort(sortQueue)
    .map((appointment) => decorateAppointment(db, appointment));

  return {
    generatedAt: new Date().toISOString(),
    department: filters.department || "All",
    stats: {
      waiting: appointments.filter((item) => item.status === "waiting").length,
      inProgress: appointments.filter((item) => item.status === "in-progress").length,
      completed: appointments.filter((item) => item.status === "completed").length,
      emergency: appointments.filter((item) => item.priority === "emergency" && ACTIVE_QUEUE_STATUSES.includes(item.status)).length,
    },
    items: appointments,
  };
}

async function getQueueDetails(appointmentId, patientId) {
  const db = await readDb();
  const appointment = db.appointments.find((item) => item.id === appointmentId);
  if (!appointment) {
    throw new Error("Appointment not found.");
  }

  if (patientId && appointment.patientId !== patientId) {
    throw new Error("Queue record does not belong to this patient.");
  }

  return decorateAppointment(db, appointment);
}

async function getNextAppointmentForDoctor(doctorId) {
  return mutateDb(async (db) => {
    const inProgress = db.appointments.find(
      (appointment) => appointment.doctorId === doctorId && appointment.status === "in-progress"
    );
    if (inProgress) {
      return decorateAppointment(db, inProgress);
    }

    const next = db.appointments
      .filter((appointment) => appointment.doctorId === doctorId && appointment.status === "waiting")
      .sort(sortQueue)[0];

    if (!next) {
      return null;
    }

    next.status = "in-progress";
    next.startedAt = new Date().toISOString();
    return decorateAppointment(db, next);
  });
}

async function updateAppointmentStatus(appointmentId, status, doctorId) {
  return mutateDb(async (db) => {
    const appointment = db.appointments.find((item) => item.id === appointmentId);
    if (!appointment) {
      throw new Error("Appointment not found.");
    }

    if (doctorId && appointment.doctorId !== doctorId) {
      throw new Error("This appointment is not assigned to you.");
    }

    appointment.status = status;
    if (status === "completed") {
      appointment.completedAt = new Date().toISOString();
    }

    return decorateAppointment(db, appointment);
  });
}

async function updateAppointmentPriority(appointmentId, priority) {
  if (!["emergency", "normal"].includes(priority)) {
    throw new Error("Priority must be emergency or normal.");
  }

  return mutateDb(async (db) => {
    const appointment = db.appointments.find((item) => item.id === appointmentId);
    if (!appointment) {
      throw new Error("Appointment not found.");
    }

    appointment.priority = priority;
    return decorateAppointment(db, appointment);
  });
}

async function updateUserProfile(id, updates) {
  return mutateDb(async (db) => {
    const user = db.users.find((item) => item.id === id);
    if (!user) {
      throw new Error("User not found.");
    }

    user.name = String(updates.name || user.name || "").trim() || user.name;
    user.phone = String(updates.phone || "").trim();
    user.address = String(updates.address || "").trim();

    if (updates.age !== undefined && updates.age !== null && updates.age !== "") {
      user.age = safeNumber(updates.age, user.age || null);
    }

    if (updates.gender !== undefined) {
      user.gender = String(updates.gender || "").trim();
    }

    return sanitizeUser(user);
  });
}

async function updateUserPassword(id, password) {
  if (!password || String(password).trim().length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }

  return mutateDb(async (db) => {
    const user = db.users.find((item) => item.id === id);
    if (!user) {
      throw new Error("User not found.");
    }

    user.passwordHash = hashPassword(String(password));
    return sanitizeUser(user);
  });
}

module.exports = {
  addDoctor,
  bookAppointment,
  createUser,
  deleteDoctor,
  ensureSeedData,
  findUserByEmail,
  findUserById,
  getAdminDashboard,
  getDoctorDashboard,
  getNextAppointmentForDoctor,
  getPatientDashboard,
  getPatientHistory,
  getQueueDetails,
  getQueueSnapshot,
  listDoctors,
  listPatients,
  sanitizeUser,
  updateUserPassword,
  updateUserProfile,
  updateAppointmentPriority,
  updateAppointmentStatus,
};
