const router = require("express").Router();
const { chat } = require("../controllers/chatbotController");

router.post("/", chat);

module.exports = router;
