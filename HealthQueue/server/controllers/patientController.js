const {
  bookAppointment,
  getPatientDashboard,
  getPatientHistory,
  getQueueDetails,
  listDoctors,
} = require("../lib/store");
const { emitQueueRefresh } = require("../lib/queue");

async function dashboard(req, res) {
  try {
    const data = await getPatientDashboard(req.user.id);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to load patient dashboard." });
  }
}

async function doctors(req, res) {
  try {
    return res.json(await listDoctors(req.query.department));
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to load doctors." });
  }
}

async function createAppointment(req, res) {
  try {
    const appointment = await bookAppointment(req.user.id, req.body);
    await emitQueueRefresh(req.app.get("io"), appointment.department);
    return res.status(201).json({
      message: `Appointment booked. Token ${appointment.token} generated successfully.`,
      appointment,
      queue: await getQueueDetails(appointment.id, req.user.id),
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to book appointment." });
  }
}

async function history(req, res) {
  try {
    return res.json(await getPatientHistory(req.user.id));
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to load appointment history." });
  }
}

async function queue(req, res) {
  try {
    return res.json(await getQueueDetails(req.params.id, req.user.id));
  } catch (error) {
    return res.status(404).json({ message: error.message || "Queue item not found." });
  }
}

module.exports = {
  dashboard,
  doctors,
  createAppointment,
  history,
  queue,
};
