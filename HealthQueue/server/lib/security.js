const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "healthqueue-secret";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

function comparePassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) {
    return false;
  }

  const [salt, currentHash] = storedHash.split(":");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(currentHash, "hex"), Buffer.from(derivedKey, "hex"));
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: "8h" });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = {
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
};
