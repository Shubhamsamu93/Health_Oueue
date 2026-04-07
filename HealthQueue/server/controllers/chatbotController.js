const Doctor = require("../models/Doctor");
const User = require("../models/User");

const SYMPTOM_SPECIALIZATION_MAP = [
  {
    specialization: "Orthopedic",
    keywords: ["broken hand", "broken leg", "fracture", "bone", "joint", "sprain", "injury", "back pain", "knee pain", "shoulder pain", "arm pain", "leg pain", "broken", "swelling after fall"]
  },
  {
    specialization: "General Physician",
    keywords: ["fever", "cold", "cough", "body pain", "weakness", "headache", "viral", "infection", "fatigue", "dizziness"]
  },
  {
    specialization: "Dentist",
    keywords: ["teeth", "tooth", "gum", "mouth", "jaw", "tooth pain", "cavity", "dental"]
  },
  {
    specialization: "Dermatologist",
    keywords: ["skin", "rash", "itching", "acne", "pimple", "allergy", "eczema", "fungal", "spots"]
  },
  {
    specialization: "ENT Specialist",
    keywords: ["ear", "nose", "throat", "sinus", "tonsil", "hearing", "ear pain", "throat pain"]
  },
  {
    specialization: "Cardiologist",
    keywords: ["chest pain", "heart", "palpitations", "blood pressure", "bp", "cardiac"]
  },
  {
    specialization: "Neurologist",
    keywords: ["migraine", "seizure", "nerve", "numbness", "paralysis", "brain", "stroke"]
  },
  {
    specialization: "Gynecologist",
    keywords: ["pregnancy", "period", "menstrual", "uterus", "womens health", "women health"]
  },
  {
    specialization: "Pediatrician",
    keywords: ["child", "kid", "baby", "newborn", "infant"]
  },
  {
    specialization: "Ophthalmologist",
    keywords: ["eye", "vision", "blurred vision", "eye pain", "eye redness"]
  },
  {
    specialization: "Psychiatrist",
    keywords: ["anxiety", "depression", "stress", "panic", "mental health", "insomnia"]
  },
  {
    specialization: "Gastroenterologist",
    keywords: ["stomach", "abdomen", "gas", "acidity", "ulcer", "vomiting", "digestion"]
  }
];

const APP_KNOWLEDGE = {
  patient: [
    "Patients can sign up, log in, browse doctors, book appointments, and track token or queue status.",
    "They can also check appointment status updates like pending, approved, rejected, or completed.",
    "The dashboard includes medical records, appointment history, downloadable reports, and doctor suggestions."
  ],
  doctor: [
    "Doctors can review appointments, approve or reject bookings, and mark visits as completed.",
    "They can manage the live queue, review patient details, see analytics, and open medical records.",
    "The doctor dashboard also includes schedule controls, notifications, and patient-related workflow tools."
  ],
  booking: [
    "A patient books by opening the patient side, choosing a doctor, selecting date and time, and submitting the reason for visit.",
    "After booking, the system creates an appointment, generates a token when applicable, and shows the appointment in the dashboard.",
    "Doctors then review that request and update its status."
  ],
  queue: [
    "The queue system helps patients see their current token progress and expected turn.",
    "Doctors can use queue management to call the next patient and keep flow moving.",
    "This reduces crowding and gives patients better visibility into waiting time."
  ],
  reports: [
    "The system stores appointment history and medical record context for patients.",
    "Patients can access reports from their dashboard, and doctors can review patient history from the doctor side.",
    "Completed visits can be reflected in reports and history views."
  ]
};

function detectSpecialization(message) {
  const lower = String(message || "").toLowerCase();
  let bestMatch = { specialization: "", score: 0 };

  SYMPTOM_SPECIALIZATION_MAP.forEach((entry) => {
    const score = entry.keywords.reduce((total, keyword) => total + (lower.includes(keyword) ? keyword.split(" ").length + 1 : 0), 0);
    if (score > bestMatch.score) {
      bestMatch = { specialization: entry.specialization, score };
    }
  });

  return bestMatch.specialization || "";
}

function hasSymptomIntent(message, specialization) {
  const lower = String(message || "").toLowerCase();
  if (specialization) return true;
  return /(pain|fever|cough|cold|itching|rash|tooth|teeth|skin|allergy|acne|weakness|headache|suffering|injury|fracture|broken|swelling|eye|chest|pregnancy|stress|anxiety|stomach)/.test(lower);
}

function matchesQuestion(message, patterns) {
  const lower = String(message || "").toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern));
}

function detectIntent(message) {
  const lower = String(message || "").toLowerCase();

  if (hasSymptomIntent(message, detectSpecialization(message))) {
    return "symptom_guidance";
  }
  if (lower.includes("appointment") || lower.includes("book") || lower.includes("booking")) {
    return "booking";
  }
  if (
    (lower.includes("doctor") || lower.includes("doctors")) &&
    (lower.includes("feature") || lower.includes("features") || lower.includes("dashboard") || lower.includes("work"))
  ) {
    return "doctor_help";
  }
  if (
    (lower.includes("doctor") || lower.includes("doctors")) &&
    (lower.includes("how") || lower.includes("get") || lower.includes("take") || lower.includes("consult"))
  ) {
    return "doctor_booking";
  }
  if (/(how|help|benefit|useful|works|work|do).*patient|patient.*(help|benefit|works|useful)/.test(lower)) {
    return "patient_help";
  }
  if (/(how|help|works|work|do).*doctor|doctor.*(help|works|manage|can do)/.test(lower)) {
    return "doctor_help";
  }
  if (lower.includes("queue") || lower.includes("token") || lower.includes("wait")) {
    return "queue";
  }
  if (lower.includes("record") || lower.includes("report") || lower.includes("history")) {
    return "records";
  }
  if (lower.includes("feature") || lower.includes("dashboard") || lower.includes("app")) {
    return "overview";
  }
  return "general";
}

function buildDoctorSuggestionLine(specialization, doctors) {
  if (!specialization) return "";
  if (!doctors.length) {
    return `Your symptoms look closest to a ${specialization}. I could not find a matching doctor in the database right now, but that is still the most suitable department to check first.`;
  }

  const topDoctors = doctors
    .slice(0, 3)
    .map((doctor) => doctor.name || "Doctor")
    .join(", ");

  return `Based on your symptoms, a ${specialization} is the best fit. You can consider ${topDoctors}.`;
}

function composeReply(title, points, extraLine = "") {
  const lines = [`${title}`];
  points.forEach((point) => lines.push(`- ${point}`));
  if (extraLine) {
    lines.push(extraLine);
  }
  return lines.join("\n");
}

function buildOverviewReply() {
  return composeReply(
    "HealthQueue is a hospital queue and appointment management system.",
    [
      "Patients can search doctors, book appointments, track token progress, and view medical records or reports.",
      "Doctors can manage appointments, update patient status, review records, and handle daily queue flow.",
      "The system is designed to reduce waiting time and keep appointments organized for both patients and hospital staff."
    ]
  );
}

async function getDoctorsBySpecialization(specialization) {
  if (!specialization) return [];

  const doctors = await Doctor.find({
    specialization: { $regex: `^${specialization.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }
  }).lean();

  if (!doctors.length) return [];

  return Promise.all(doctors.map(async (doctor) => {
    if (!doctor.userId) {
      return {
        id: doctor._id,
        name: doctor.name || "Doctor",
        specialization: doctor.specialization,
        experience: doctor.experience || 0,
        hospital: doctor.hospital || "HealthQueue Hospital",
        phone: doctor.phone || ""
      };
    }

    const user = await User.findById(doctor.userId).lean();
    return {
      id: doctor._id,
      name: user?.name || doctor.name || "Doctor",
      specialization: doctor.specialization,
      experience: doctor.experience || 0,
      hospital: doctor.hospital || "HealthQueue Hospital",
      phone: user?.phone || doctor.phone || ""
    };
  }));
}

function formatHistory(history) {
  if (!Array.isArray(history) || !history.length) {
    return "No previous chat history.";
  }

  return history
    .slice(-6)
    .map((entry) => `${entry.role === "assistant" || entry.role === "bot" ? "Assistant" : "User"}: ${String(entry.text || "").trim()}`)
    .filter(Boolean)
    .join("\n");
}

async function generateAiText(message, specialization, doctors, history = []) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return "";
  }

  const doctorSummary = doctors.length
    ? doctors.map((doctor) => `${doctor.name} (${doctor.specialization}, ${doctor.experience} yrs, ${doctor.hospital})`).join("; ")
    : "No matching doctors found in database.";

  const prompt = [
    "You are HealthQueue AI, a helpful assistant for a hospital queue management system.",
    "Your job is to answer the user's exact question clearly, practically, and conversationally.",
    "Do not sound repetitive, robotic, or generic.",
    "Do not give a medical diagnosis. For symptoms, suggest the most relevant doctor type and mention available doctors if provided.",
    "Prefer simple English, short paragraphs or bullets, and directly address what the user asked.",
    "If the user asks about app features, explain them in plain language with direct benefits.",
    "If the question is about navigation, tell the user which section or dashboard area to open.",
    "If the message mentions a symptom like fever, skin issue, or tooth problem, answer that symptom question first instead of giving a broad app overview.",
    specialization ? `Detected likely specialization from symptoms: ${specialization}.` : "No exact specialization detected from symptoms.",
    `Doctors found in database: ${doctorSummary}`,
    `Recent conversation:\n${formatHistory(history)}`,
    `User question: ${message}`
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      input: prompt
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(errorBody || "AI request failed");
  }

  const data = await response.json();
  return String(data.output_text || "").trim();
}

function buildSymptomReply(specialization, doctors) {
  if (!specialization) {
    return composeReply(
      "I can guide you based on symptoms.",
      [
        "Please mention the main symptom, like fever, skin issue, tooth pain, chest pain, or injury.",
        "Then I can suggest the most suitable doctor type for that patient."
      ]
    );
  }

  const guidance = [`For this condition, the most suitable doctor is usually a ${specialization}.`];

  if (specialization === "Orthopedic") {
    guidance.push("An Orthopedic doctor is the right choice for broken bones, fractures, joint injuries, or pain after a fall.");
  } else if (specialization === "General Physician") {
    guidance.push("A General Physician is the best first step for common problems like fever, cough, weakness, viral symptoms, or body pain.");
  } else if (specialization === "Dentist") {
    guidance.push("A Dentist is the right specialist for tooth pain, gum issues, cavities, or jaw-related dental problems.");
  } else if (specialization === "Dermatologist") {
    guidance.push("A Dermatologist should examine skin-related issues like rashes, itching, acne, allergies, or persistent spots.");
  } else {
    guidance.push(`A ${specialization} can examine this issue properly and decide the next treatment or tests.`);
  }

  guidance.push("The patient can book that doctor from the booking or doctors section in HealthQueue.");

  if (doctors.length) {
    guidance.push(`I also found ${doctors.length} matching doctor${doctors.length > 1 ? "s" : ""} in the system for this specialization.`);
  } else {
    guidance.push("I could not find a matching doctor in the system right now, but the right specialization is still listed above.");
  }

  return composeReply("Here is the best guidance for this symptom:", guidance);
}

function buildFallbackReply(message, specialization, doctors) {
  const intent = detectIntent(message);
  const doctorSuggestion = buildDoctorSuggestionLine(specialization, doctors);

  if (intent === "symptom_guidance") {
    return [buildSymptomReply(specialization, doctors), doctorSuggestion].filter(Boolean).join("\n");
  }

  if (matchesQuestion(message, ["what is healthqueue", "about healthqueue", "tell me about healthqueue", "about the healthqueue", "what does this app do"])) {
    return buildOverviewReply();
  }

  if (intent === "patient_help") {
    return composeReply(
      "HealthQueue helps patients in these ways:",
      APP_KNOWLEDGE.patient,
      doctorSuggestion
    );
  }

  if (intent === "doctor_help") {
    return composeReply(
      "HealthQueue helps doctors by organizing daily workflow:",
      APP_KNOWLEDGE.doctor,
      doctorSuggestion
    );
  }

  if (intent === "booking") {
    return composeReply(
      "Here is how appointment booking works in HealthQueue:",
      APP_KNOWLEDGE.booking,
      doctorSuggestion
    );
  }

  if (intent === "doctor_booking") {
    return composeReply(
      "A patient can get an appointment from a doctor like this:",
      [
        "Open the patient side of HealthQueue and go to the doctors or booking section.",
        "Choose the doctor, select an available date and time slot, and enter the reason for the visit.",
        "Submit the request so the appointment is created and linked with that doctor.",
        "After that, the patient can track whether the appointment is pending, approved, rejected, or completed from the dashboard."
      ],
      doctorSuggestion
    );
  }

  if (intent === "queue") {
    return composeReply(
      "Here is how the queue feature helps:",
      APP_KNOWLEDGE.queue,
      doctorSuggestion
    );
  }

  if (intent === "records") {
    return composeReply(
      "Here is what you can do with records and reports:",
      APP_KNOWLEDGE.reports,
      doctorSuggestion
    );
  }

  if (intent === "overview") {
    return buildOverviewReply();
  }

  if (specialization) {
    return composeReply(
      "I understood your symptoms and can guide you like this:",
      [
        `The most relevant specialist is usually a ${specialization}.`,
        "You can open the Doctors section or patient dashboard to review available doctors and book a slot.",
        "After booking, you can track approval status and queue progress from the dashboard."
      ],
      doctorSuggestion
    );
  }

  return composeReply(
    "I can help with both app guidance and symptom-based doctor suggestions.",
    [
      "Ask about booking, queue tracking, patient features, doctor features, reports, or dashboard flow.",
      "You can also describe symptoms like fever, fracture, skin issues, chest pain, eye pain, or tooth pain.",
      "I will then suggest the most suitable doctor type and, if available, matching doctors from the system."
    ]
  );
}

exports.chat = async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ message: "Message is required." });
    }

    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const specialization = detectSpecialization(message);
    const doctors = await getDoctorsBySpecialization(specialization);

    let reply = "";
    try {
      reply = await generateAiText(message, specialization, doctors, history);
    } catch (_error) {
      reply = "";
    }

    if (!reply) {
      reply = buildFallbackReply(message, specialization, doctors);
    }

    return res.json({
      reply,
      specialization: specialization || null,
      doctors
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to process chatbot request." });
  }
};
