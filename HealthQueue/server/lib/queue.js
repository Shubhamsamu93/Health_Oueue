async function emitQueueRefresh(io, department) {
  if (!io) {
    return;
  }

  const { getQueueSnapshot } = require("./store");
  const snapshot = await getQueueSnapshot({ department });
  io.emit("queue:updated", snapshot);

  if (department) {
    io.to(`department:${department}`).emit("queue:department-updated", snapshot);
  }
}

module.exports = {
  emitQueueRefresh,
};
