const { verifyToken } = require("../lib/security");
const { findUserById, sanitizeUser } = require("../lib/store");

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const payload = verifyToken(token);
    const user = await findUserById(payload.id);

    if (!user) {
      return res.status(401).json({ message: "Session is no longer valid." });
    }

    req.user = sanitizeUser(user);
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have access to this area." });
    }

    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
};
