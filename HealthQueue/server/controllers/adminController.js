const {
  addDoctor,
  deleteDoctor,
  getAdminDashboard,
  getQueueSnapshot,
  listDoctors,
  listPatients,
  updateAppointmentPriority,
} = require("../lib/store");
const { emitQueueRefresh } = require("../lib/queue");

async function dashboard(req, res) {
  try {
    return res.json(await getAdminDashboard());
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to load admin dashboard." });
  }
}

async function doctors(req, res) {
  try {
    return res.json(await listDoctors(req.query.department));
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to load doctors." });
  }
}

async function createDoctor(req, res) {
  try {
    return res.status(201).json({
      message: "Doctor created successfully.",
      doctor: await addDoctor(req.body),
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to create doctor." });
  }
}

async function removeDoctor(req, res) {
  try {
    const doctor = await deleteDoctor(req.params.id);
    return res.json({ message: `Doctor ${doctor.name} removed successfully.` });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to remove doctor." });
  }
}

async function patients(req, res) {
  try {
    return res.json(await listPatients(req.query.search || ""));
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to load patients." });
  }
}

async function queue(req, res) {
  try {
    return res.json(await getQueueSnapshot({ department: req.query.department }));
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to load queue." });
  }
}

async function updatePriority(req, res) {
  try {
    const appointment = await updateAppointmentPriority(req.params.id, req.body.priority);
    await emitQueueRefresh(req.app.get("io"), appointment.department);
    return res.json({
      message: `Priority updated to ${appointment.priority}.`,
      appointment,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to update priority." });
  }
}

module.exports = {
  dashboard,
  doctors,
  createDoctor,
  removeDoctor,
  patients,
  queue,
  updatePriority,
};
