const { getQueueSnapshot, getQueueDetails } = require("../lib/store");

async function live(req, res) {
  try {
    return res.json(await getQueueSnapshot({ department: req.query.department }));
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to load live queue." });
  }
}

async function byId(req, res) {
  try {
    return res.json(await getQueueDetails(req.params.id));
  } catch (error) {
    return res.status(404).json({ message: error.message || "Queue record not found." });
  }
}

module.exports = {
  live,
  byId,
};
