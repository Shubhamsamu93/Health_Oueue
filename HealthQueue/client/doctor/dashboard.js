(function () {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const API_BASE = window.API_BASE + "/api";
  const REFRESH_INTERVAL_MS = 10000;

  if (!user || user.role !== "doctor") {
    alert("Access Denied");
    window.location.href = "../index.html";
    return;
  }

  const state = {
    activeView: "appointments",
    appointments: [],
    appointmentFilter: "all",
    patientSearch: "",
    patientStatusFilter: "all",
    recordSearch: "",
    selectedAppointmentId: null,
    selectedPatientId: null,
    selectedMessagePatientId: null,
    charts: { analytics: null, trend: null },
    doctorProfile: null,
    doctorMeta: null,
    refreshTimer: null,
    isLoading: false,
    notifications: [],
    messageThreads: {},
    schedule: null
  };

  const els = {
    sidebarName: document.getElementById("doctorSidebarName"),
    pageTitle: document.getElementById("doctorPageTitle"),
    pageSubtitle: document.getElementById("doctorPageSubtitle"),
    welcomeText: document.getElementById("doctorWelcomeText"),
    doctorAvatar: document.getElementById("doctorAvatar"),
    pendingCount: document.getElementById("pendingCount"),
    approvedCount: document.getElementById("approvedCount"),
    rejectedCount: document.getElementById("rejectedCount"),
    completedCount: document.getElementById("completedCount"),
    analyticsCompletedCount: document.getElementById("analyticsCompletedCount"),
    analyticsPendingCount: document.getElementById("analyticsPendingCount"),
    analyticsTotalAppointments: document.getElementById("analyticsTotalAppointments"),
    analyticsApprovedCount: document.getElementById("analyticsApprovedCount"),
    analyticsRejectedCount: document.getElementById("analyticsRejectedCount"),
    totalPatientsToday: document.getElementById("totalPatientsToday"),
    appointmentsList: document.getElementById("list"),
    noAppointments: document.getElementById("noAppointments"),
    loadingState: document.getElementById("doctorLoadingState"),
    errorState: document.getElementById("doctorErrorState"),
    quickPatientsList: document.getElementById("doctorPatientsList"),
    patientPanelCount: document.getElementById("doctorPatientPanelCount"),
    patientsDirectoryList: document.getElementById("patientsDirectoryList"),
    patientsDirectoryEmpty: document.getElementById("patientsDirectoryEmpty"),
    patientSearchInput: document.getElementById("patientSearchInput"),
    patientStatusFilter: document.getElementById("patientStatusFilter"),
    queueCount: document.getElementById("queueCount"),
    queueNowServing: document.getElementById("queueNowServing"),
    queueNextUp: document.getElementById("queueNextUp"),
    queueList: document.getElementById("queueList"),
    queueEmpty: document.getElementById("queueEmpty"),
    callNextPatientBtn: document.getElementById("callNextPatientBtn"),
    notificationsList: document.getElementById("notificationsList"),
    notificationsEmpty: document.getElementById("notificationsEmpty"),
    markNotificationsReadBtn: document.getElementById("markNotificationsReadBtn"),
    recordsList: document.getElementById("recordsList"),
    recordsEmpty: document.getElementById("recordsEmpty"),
    recordSearchInput: document.getElementById("recordSearchInput"),
    availabilityStatus: document.getElementById("availabilityStatus"),
    consultationMode: document.getElementById("consultationMode"),
    morningSlotInput: document.getElementById("morningSlotInput"),
    eveningSlotInput: document.getElementById("eveningSlotInput"),
    scheduleNotesInput: document.getElementById("scheduleNotesInput"),
    saveScheduleBtn: document.getElementById("saveScheduleBtn"),
    messageThreads: document.getElementById("messageThreads"),
    messageThreadTitle: document.getElementById("messageThreadTitle"),
    messageThreadSubtitle: document.getElementById("messageThreadSubtitle"),
    messageList: document.getElementById("messageList"),
    messageInput: document.getElementById("messageInput"),
    sendMessageBtn: document.getElementById("sendMessageBtn"),
    analyticsChart: document.getElementById("doctorAnalyticsChart"),
    trendChart: document.getElementById("doctorTrendChart"),
    modalSubtitle: document.getElementById("modalAppointmentSubtitle"),
    patientInfoContent: document.getElementById("patientInfoContent"),
    patientHistoryContent: document.getElementById("patientHistoryContent"),
    notesInput: document.getElementById("doctorNotesInput"),
    modalApproveBtn: document.getElementById("modalApproveBtn"),
    modalRejectBtn: document.getElementById("modalRejectBtn"),
    modalCompleteBtn: document.getElementById("modalCompleteBtn"),
    modalDownloadBtn: document.getElementById("modalDownloadBtn"),
    patientModalSubtitle: document.getElementById("patientModalSubtitle"),
    patientModalContent: document.getElementById("patientModalContent"),
    doctorSettingsName: document.getElementById("doctorSettingsName"),
    doctorSettingsEmail: document.getElementById("doctorSettingsEmail"),
    doctorSettingsPhone: document.getElementById("doctorSettingsPhone"),
    doctorSettingsExperience: document.getElementById("doctorSettingsExperience"),
    doctorSettingsAddress: document.getElementById("doctorSettingsAddress"),
    saveDoctorSettingsBtn: document.getElementById("saveDoctorSettingsBtn"),
    mobileMenuToggle: document.getElementById("mobileMenuToggle"),
    mobileSidebarBackdrop: document.getElementById("mobileSidebarBackdrop")
  };

  const viewConfig = {
    appointments: { title: '<i class="fas fa-calendar-check me-2"></i>Your Appointments', subtitle: "Manage and update your consultation queue" },
    queue: { title: '<i class="fas fa-list-ol me-2"></i>Queue Management', subtitle: "Monitor live queue flow and call the next patient" },
    patients: { title: '<i class="fas fa-users me-2"></i>Your Patients', subtitle: "View patients who booked appointments with you" },
    notifications: { title: '<i class="fas fa-bell me-2"></i>Notifications', subtitle: "Track new appointment alerts and activity updates" },
    records: { title: '<i class="fas fa-file-medical me-2"></i>Medical Records', subtitle: "Review patient history, reports, and recent consultation notes" },
    schedule: { title: '<i class="fas fa-user-clock me-2"></i>Schedule Management', subtitle: "Set your availability, slots, and consultation preferences" },
    messages: { title: '<i class="fas fa-comments me-2"></i>Messages', subtitle: "Send quick follow-ups and updates to your patients" },
    analytics: { title: '<i class="fas fa-chart-line me-2"></i>Appointment Analytics', subtitle: "Track appointment outcomes and daily flow" },
    settings: { title: '<i class="fas fa-cog me-2"></i>Profile Settings', subtitle: "Keep your doctor profile information up to date" }
  };

  const appointmentDetailsModal = new bootstrap.Modal(document.getElementById("appointmentDetailsModal"));
  const patientDetailsModal = new bootstrap.Modal(document.getElementById("patientDetailsModal"));

  function getDoctorId() {
    return user?._id || user?.id || user?.doctorProfile || "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getAvatar(name) {
    return String(name || "D").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  }

  function normalizeStatus(status) {
    const value = String(status || "").toLowerCase();
    if (["approved", "confirmed", "in-progress"].includes(value)) return "approved";
    if (["rejected", "cancelled", "canceled"].includes(value)) return "rejected";
    if (["completed", "done"].includes(value)) return "completed";
    return "pending";
  }

  function statusLabel(status) {
    return { pending: "Pending", approved: "Approved", rejected: "Rejected", completed: "Completed" }[normalizeStatus(status)] || "Pending";
  }

  function statusIcon(status) {
    return { pending: "fa-clock", approved: "fa-check-circle", rejected: "fa-xmark-circle", completed: "fa-circle-check" }[normalizeStatus(status)] || "fa-clock";
  }

  function formatDate(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Date not set";
    return parsed.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }

  function isToday(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed.toDateString() === new Date().toDateString();
  }

  function fetchJSON(url, options = {}) {
    return fetch(url, options).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.msg || "Request failed");
      return data;
    });
  }

  function setText(element, value) {
    if (element) {
      element.textContent = String(value ?? "");
    }
  }

  function getDoctorStorageKey(suffix) {
    return `doctorDashboard:${getDoctorId() || "doctor"}:${suffix}`;
  }

  function readStorageJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function writeStorageJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getCanvasContext(canvas) {
    if (!canvas || typeof canvas.getContext !== "function") {
      return null;
    }

    try {
      return canvas.getContext("2d");
    } catch (_error) {
      return null;
    }
  }

  function getSelectedAppointment() {
    return state.appointments.find((item) => String(item.id || item._id) === String(state.selectedAppointmentId)) || null;
  }

  function getSelectedMessagePatient() {
    return getUniquePatients().find((item) => String(item.patientId) === String(state.selectedMessagePatientId)) || null;
  }

  function getQueueAppointments() {
    return state.appointments
      .filter((item) => ["pending", "approved"].includes(normalizeStatus(item.status)))
      .sort((a, b) => {
        const aApproved = normalizeStatus(a.status) === "approved" ? 0 : 1;
        const bApproved = normalizeStatus(b.status) === "approved" ? 0 : 1;
        if (aApproved !== bApproved) return aApproved - bApproved;
        const tokenA = Number(a.token || a.tokenNumber || Number.MAX_SAFE_INTEGER);
        const tokenB = Number(b.token || b.tokenNumber || Number.MAX_SAFE_INTEGER);
        if (tokenA !== tokenB) return tokenA - tokenB;
        return new Date(a.date || 0) - new Date(b.date || 0);
      });
  }

  function getRecordEntries() {
    const term = state.recordSearch.trim().toLowerCase();
    const entries = getUniquePatients().map((patient) => {
      const latestAppointment = patient.appointments[0] || null;
      const latestRecord = (patient.medicalHistory || [])[0] || null;
      return {
        patient,
        latestAppointment,
        latestRecord
      };
    });

    return entries.filter(({ patient, latestAppointment, latestRecord }) => {
      if (!term) return true;
      return [
        patient.name,
        patient.patientId,
        patient.phone,
        latestAppointment?.reason,
        latestRecord?.title,
        latestRecord?.summary
      ].some((value) => String(value || "").toLowerCase().includes(term));
    });
  }

  function loadDashboardPreferences() {
    state.schedule = readStorageJSON(getDoctorStorageKey("schedule"), {
      status: "available",
      mode: "in-person",
      morningSlot: "9:00 AM - 1:00 PM",
      eveningSlot: "4:00 PM - 8:00 PM",
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      notes: ""
    });
    state.messageThreads = readStorageJSON(getDoctorStorageKey("messages"), {});
    state.notifications = readStorageJSON(getDoctorStorageKey("notifications"), []);
  }

  function persistMessages() {
    writeStorageJSON(getDoctorStorageKey("messages"), state.messageThreads);
  }

  function persistNotifications() {
    writeStorageJSON(getDoctorStorageKey("notifications"), state.notifications);
  }

  function getPdfEngine() {
    return window.jspdf?.jsPDF || window.jsPDF || null;
  }

  function pdfSafeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim() || "N/A";
  }

  function ensurePdfPage(doc, y, requiredHeight = 12) {
    if (y + requiredHeight <= 280) {
      return y;
    }
    doc.addPage();
    return 20;
  }

  function writePdfField(doc, label, value, y) {
    y = ensurePdfPage(doc, y, 12);
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 15, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(pdfSafeText(value), 125);
    doc.text(lines, 58, y);
    return y + Math.max(7, lines.length * 5 + 1);
  }

  function writePdfParagraph(doc, text, y, indent = 20) {
    y = ensurePdfPage(doc, y, 12);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(pdfSafeText(text), 170 - indent);
    doc.text(lines, indent, y);
    return y + lines.length * 5 + 2;
  }

  function writePdfSectionTitle(doc, title, y) {
    y = ensurePdfPage(doc, y, 16);
    doc.setDrawColor(37, 99, 235);
    doc.setTextColor(37, 99, 235);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(title, 15, y);
    doc.line(15, y + 2, 195, y + 2);
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    return y + 10;
  }

  async function exportDoctorReport(reportData, filename) {
    const JsPDF = getPdfEngine();
    if (!JsPDF) {
      throw new Error("PDF engine unavailable");
    }

    const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    let y = 18;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235);
    doc.text("HEALTHQUEUE", 105, y, { align: "center" });
    y += 7;
    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139);
    doc.text("Doctor Clinical Summary", 105, y, { align: "center" });
    y += 10;
    doc.setDrawColor(37, 99, 235);
    doc.line(15, y, 195, y);
    y += 10;

    y = writePdfSectionTitle(doc, "Patient Snapshot", y);
    y = writePdfField(doc, "Patient Name", reportData.patientName, y);
    y = writePdfField(doc, "Patient ID", reportData.patientId, y);
    y = writePdfField(doc, "Phone", reportData.patientPhone, y);
    y = writePdfField(doc, "Email", reportData.patientEmail, y);
    y = writePdfField(doc, "Age / Gender", `${reportData.patientAge} / ${reportData.patientGender}`, y);

    y += 4;
    y = writePdfSectionTitle(doc, "Current Appointment", y);
    y = writePdfField(doc, "Token Number", reportData.tokenNumber, y);
    y = writePdfField(doc, "Date", reportData.appointmentDate, y);
    y = writePdfField(doc, "Time Slot", reportData.timeSlot, y);
    y = writePdfField(doc, "Department", reportData.department, y);
    y = writePdfField(doc, "Status", reportData.status, y);
    y = writePdfField(doc, "Reason / Symptoms", reportData.reason, y);
    y = writePdfField(doc, "Doctor Notes", reportData.doctorNotes, y);

    y += 4;
    y = writePdfSectionTitle(doc, "Appointment History With This Doctor", y);
    if (!reportData.historyItems.length) {
      y = writePdfParagraph(doc, "No appointment history available.", y, 15);
    } else {
      reportData.historyItems.forEach((item, index) => {
        y = ensurePdfPage(doc, y, 18);
        doc.setFont("helvetica", "bold");
        doc.text(`${index + 1}. ${pdfSafeText(item.date)} | ${pdfSafeText(item.time)} | ${pdfSafeText(item.status)}`, 15, y);
        y += 6;
        y = writePdfParagraph(doc, `${pdfSafeText(item.department)} | ${pdfSafeText(item.reason)}`, y, 20);
      });
    }

    y += 4;
    y = writePdfSectionTitle(doc, "Medical History", y);
    if (!reportData.medicalHistory.length) {
      y = writePdfParagraph(doc, "No medical history available.", y, 15);
    } else {
      reportData.medicalHistory.forEach((record, index) => {
        y = ensurePdfPage(doc, y, 18);
        doc.setFont("helvetica", "bold");
        doc.text(`${index + 1}. ${pdfSafeText(record.title)} (${pdfSafeText(record.date)})`, 15, y);
        y += 6;
        y = writePdfParagraph(doc, record.summary, y, 20);
      });
    }

    y = ensurePdfPage(doc, y + 6, 14);
    doc.setDrawColor(203, 213, 225);
    doc.line(15, y, 195, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated by ${pdfSafeText(reportData.generatedBy)} on ${pdfSafeText(reportData.generatedAt)}`, 105, y, { align: "center" });

    doc.save(filename);
  }

  function getAppointmentsForList() {
    return state.appointmentFilter === "all" ? state.appointments : state.appointments.filter((item) => normalizeStatus(item.status) === state.appointmentFilter);
  }

  function getUniquePatients() {
    const unique = new Map();
    state.appointments.forEach((appointment) => {
      const patientId = String(appointment.patientId || appointment.id || appointment._id || "");
      const existing = unique.get(patientId);
      const currentDate = new Date(appointment.date || 0).getTime();
      const previousDate = existing ? new Date(existing.lastAppointmentDate || 0).getTime() : 0;

      if (!existing) {
        unique.set(patientId, {
          patientId,
          name: appointment.patientName || "Patient",
          email: appointment.patientEmail || "",
          phone: appointment.patientPhone || "",
          gender: appointment.patientGender || "",
          age: appointment.patientAge || "",
          latestStatus: normalizeStatus(appointment.status),
          latestToken: appointment.token || appointment.tokenNumber || "N/A",
          specialization: appointment.specialization || appointment.department || "General Consultation",
          department: appointment.department || "General OPD",
          lastAppointmentDate: appointment.date,
          appointmentCount: 1,
          medicalHistory: appointment.medicalHistory || [],
          notes: appointment.notes || "",
          appointments: [appointment]
        });
        return;
      }

      existing.appointmentCount += 1;
      existing.appointments.push(appointment);
      if (currentDate >= previousDate) {
        existing.latestStatus = normalizeStatus(appointment.status);
        existing.latestToken = appointment.token || appointment.tokenNumber || existing.latestToken;
        existing.lastAppointmentDate = appointment.date;
        existing.specialization = appointment.specialization || existing.specialization;
        existing.department = appointment.department || existing.department;
        existing.notes = appointment.notes || existing.notes;
      }
      if ((!existing.medicalHistory || !existing.medicalHistory.length) && appointment.medicalHistory?.length) {
        existing.medicalHistory = appointment.medicalHistory;
      }
    });

    return [...unique.values()].sort((a, b) => new Date(b.lastAppointmentDate || 0) - new Date(a.lastAppointmentDate || 0));
  }

  function getFilteredPatients() {
    const term = state.patientSearch.trim().toLowerCase();
    return getUniquePatients().filter((patient) => {
      const matchesSearch = !term || [patient.name, patient.email, patient.phone, patient.latestToken, patient.patientId]
        .some((value) => String(value || "").toLowerCase().includes(term));
      const matchesStatus = state.patientStatusFilter === "all" || patient.latestStatus === state.patientStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }

  function getLegacyStoredAppointments() {
    try {
      return JSON.parse(localStorage.getItem("appointments") || "[]");
    } catch (_error) {
      return [];
    }
  }

  function buildLegacyPatientName(appointment, index) {
    return appointment.patientName || appointment.bookedBy || appointment.userName || `Legacy Patient ${index + 1}`;
  }

  function buildLegacyPatientId(appointment, index) {
    return appointment.patientId || appointment.patientEmail || appointment.patientPhone || `legacy-patient-${index + 1}`;
  }

  function getDoctorMatchNames() {
    return [
      state.doctorProfile?.name,
      state.doctorMeta?.name,
      user?.name
    ].filter(Boolean).map((value) => String(value).trim().toLowerCase());
  }

  function mergeLegacyAppointments(apiAppointments) {
    const doctorId = String(getDoctorId() || "");
    const doctorNames = getDoctorMatchNames();
    const merged = new Map();

    apiAppointments.forEach((appointment) => {
      merged.set(String(appointment.id || appointment._id), appointment);
    });

    getLegacyStoredAppointments().forEach((appointment, index) => {
      const appointmentDoctorId = String(appointment.doctorId || "");
      const appointmentDoctorName = String(appointment.doctorName || "").trim().toLowerCase();
      const matchesDoctor = (doctorId && appointmentDoctorId === doctorId) || (appointmentDoctorName && doctorNames.includes(appointmentDoctorName));
      if (!matchesDoctor) {
        return;
      }

      const normalized = {
        id: appointment._id || appointment.id || appointment.appointmentId || `legacy-${index + 1}`,
        _id: appointment._id || appointment.id || appointment.appointmentId || `legacy-${index + 1}`,
        patientId: buildLegacyPatientId(appointment, index),
        doctorId: appointment.doctorId || doctorId,
        patientName: buildLegacyPatientName(appointment, index),
        patientEmail: appointment.patientEmail || "",
        patientPhone: appointment.patientPhone || "",
        patientGender: appointment.patientGender || "",
        patientAge: appointment.patientAge || "",
        doctorName: appointment.doctorName || state.doctorProfile?.name || user.name || "Doctor",
        department: appointment.department || appointment.specialization || "General OPD",
        specialization: appointment.specialization || appointment.department || "General Consultation",
        doctorExperience: state.doctorMeta?.experience || "",
        hospital: appointment.hospital || "",
        token: appointment.token || appointment.tokenNumber || `LEG-${String(index + 1).padStart(3, "0")}`,
        tokenNumber: appointment.token || appointment.tokenNumber || `LEG-${String(index + 1).padStart(3, "0")}`,
        date: appointment.date || appointment.bookedAt || new Date().toISOString(),
        time: appointment.time || appointment.timeSlot || "",
        timeSlot: appointment.timeSlot || appointment.time || "Time not set",
        reason: appointment.reason || "Consultation",
        notes: appointment.notes || "",
        status: normalizeStatus(appointment.status),
        medicalHistory: Array.isArray(appointment.medicalHistory) ? appointment.medicalHistory : []
      };

      const key = String(normalized.id);
      if (!merged.has(key)) {
        merged.set(key, normalized);
      }
    });

    return [...merged.values()];
  }

  function updateHeaderContent() {
    const doctorName = state.doctorProfile?.name || user.name || "Doctor";
    const config = viewConfig[state.activeView];
    els.sidebarName.textContent = doctorName;
    els.welcomeText.textContent = `Welcome back, ${doctorName}!`;
    els.doctorAvatar.textContent = getAvatar(doctorName);
    els.pageTitle.innerHTML = config.title;
    els.pageSubtitle.textContent = config.subtitle;
  }

  function renderStats() {
    const counts = {
      pending: state.appointments.filter((item) => normalizeStatus(item.status) === "pending").length,
      approved: state.appointments.filter((item) => normalizeStatus(item.status) === "approved").length,
      rejected: state.appointments.filter((item) => normalizeStatus(item.status) === "rejected").length,
      completed: state.appointments.filter((item) => normalizeStatus(item.status) === "completed").length
    };

    setText(els.pendingCount, counts.pending);
    setText(els.approvedCount, counts.approved);
    setText(els.rejectedCount, counts.rejected);
    setText(els.completedCount, counts.completed);
    setText(els.analyticsCompletedCount, counts.completed);
    setText(els.analyticsPendingCount, counts.pending);
    setText(els.analyticsTotalAppointments, state.appointments.length);
    setText(els.analyticsApprovedCount, counts.approved);
    setText(els.analyticsRejectedCount, counts.rejected);
    setText(els.totalPatientsToday, state.appointments.filter((item) => isToday(item.date)).length);

    const patients = getUniquePatients();
    els.patientPanelCount.textContent = `${patients.length} patients`;
    els.quickPatientsList.innerHTML = patients.length
      ? patients.slice(0, 6).map((patient) => `
          <article class="doctor-mini-card clickable-mini-card" data-patient-id="${escapeHtml(patient.patientId)}">
            <div class="doctor-mini-avatar">${escapeHtml(getAvatar(patient.name))}</div>
            <div>
              <strong>${escapeHtml(patient.name)}</strong>
              <p>${escapeHtml(patient.department)} • ${escapeHtml(patient.latestToken)}</p>
            </div>
          </article>
        `).join("")
      : '<div class="panel-empty-state">No patients linked to your appointments yet.</div>';

    renderAnalyticsChart(counts);
    renderTrendChart(counts);
  }

  function renderAnalyticsChart(counts) {
    if (typeof Chart === "undefined") return;
    const context = getCanvasContext(els.analyticsChart);
    if (!context) return;

    try {
      state.charts.analytics?.destroy();
      state.charts.analytics = new Chart(context, {
        type: "doughnut",
        data: {
          labels: ["Pending", "Approved", "Rejected", "Completed"],
          datasets: [{ data: [counts.pending, counts.approved, counts.rejected, counts.completed], backgroundColor: ["#f59e0b", "#10b981", "#ef4444", "#2563eb"], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, cutout: "68%" }
      });
    } catch (error) {
      console.error("Doctor analytics chart render failed:", error);
      state.charts.analytics = null;
    }
  }

  function renderTrendChart(counts) {
    if (typeof Chart === "undefined") return;
    const context = getCanvasContext(els.trendChart);
    if (!context) return;

    try {
      state.charts.trend?.destroy();
      state.charts.trend = new Chart(context, {
        type: "bar",
        data: {
          labels: ["Total", "Approved", "Rejected", "Completed"],
          datasets: [{ label: "Appointments", data: [state.appointments.length, counts.approved, counts.rejected, counts.completed], backgroundColor: ["#1d4ed8", "#10b981", "#ef4444", "#2563eb"], borderRadius: 14, maxBarThickness: 46 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 8, right: 6, bottom: 0, left: 2 } },
          plugins: { legend: { display: false } },
          scales: {
            x: {
              grid: { display: false, drawBorder: false },
              ticks: { color: "#64748b", font: { size: 11, weight: "600" } }
            },
            y: {
              beginAtZero: true,
              grid: { color: "rgba(148, 163, 184, 0.18)", drawBorder: false },
              ticks: { precision: 0, color: "#94a3b8", font: { size: 10 } }
            }
          }
        }
      });
    } catch (error) {
      console.error("Doctor trend chart render failed:", error);
      state.charts.trend = null;
    }
  }

  function getPreviousVisitInfo(currentAppointment) {
    const patientId = String(currentAppointment.patientId || "");
    const currentDate = new Date(currentAppointment.date || 0).getTime();
    if (!patientId || !currentDate) {
      return null;
    }

    const previousVisit = state.appointments
      .filter((appointment) => String(appointment.patientId || "") === patientId)
      .filter((appointment) => new Date(appointment.date || 0).getTime() < currentDate)
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0];

    if (!previousVisit) {
      return null;
    }

    return {
      date: formatDate(previousVisit.date),
      status: statusLabel(previousVisit.status),
      reason: previousVisit.reason || "Consultation"
    };
  }

  function renderAppointments() {
    const appointments = getAppointmentsForList();
    els.appointmentsList.innerHTML = appointments.map((item) => {
      const status = normalizeStatus(item.status);
      const previousVisit = getPreviousVisitInfo(item);
      return `
        <article class="appointment-card ${status}" data-open-appointment="${escapeHtml(item.id || item._id)}">
          <div class="appointment-card-top">
            <div class="appointment-header">
              <div class="patient-info">
                <h4>${escapeHtml(item.patientName || "Patient")}</h4>
                <div class="patient-meta">
                  <span class="patient-id"><i class="fas fa-id-badge"></i> ${escapeHtml(item.patientId || "N/A")}</span>
                  <span class="patient-id"><i class="fas fa-user"></i> ${escapeHtml(item.patientAge || "N/A")} yrs</span>
                  <span class="patient-id"><i class="fas fa-venus-mars"></i> ${escapeHtml(item.patientGender || "Not set")}</span>
                  <span class="patient-id"><i class="fas fa-hashtag"></i> ${escapeHtml(item.token || item.tokenNumber || "N/A")}</span>
                  <span class="patient-slot"><i class="fas fa-clock"></i> ${escapeHtml(item.timeSlot || item.time || "Time not set")}</span>
                </div>
              </div>
              <div class="status-badge ${status}">
                <i class="fas ${statusIcon(status)}"></i> ${statusLabel(status)}
              </div>
            </div>
            <button class="btn btn-light appointment-open-btn" data-open-appointment="${escapeHtml(item.id || item._id)}" title="View Full Details">
              <i class="fas fa-chevron-right"></i>
            </button>
          </div>
          <div class="appointment-card-grid-enhanced">
            <div class="appointment-section-block">
              <div class="appointment-section-label"><i class="fas fa-user-injured"></i> Patient Details</div>
              <div class="appointment-details compact">
                <div class="detail-item"><i class="fas fa-phone"></i><span>${escapeHtml(item.patientPhone || "Not available")}</span></div>
                <div class="detail-item"><i class="fas fa-calendar-day"></i><span>${escapeHtml(formatDate(item.date))}</span></div>
              </div>
            </div>
            <div class="appointment-section-block">
              <div class="appointment-section-label"><i class="fas fa-file-waveform"></i> Appointment Details</div>
              <div class="appointment-details compact">
                <div class="detail-item"><i class="fas fa-building"></i><span>${escapeHtml(item.department || "General OPD")}</span></div>
                <div class="detail-item"><i class="fas fa-stethoscope"></i><span>${escapeHtml(item.specialization || item.department || "General Consultation")}</span></div>
              </div>
            </div>
          </div>
          <div class="medical-context-grid">
            <div class="medical-context-card">
              <div class="appointment-section-label"><i class="fas fa-notes-medical"></i> Symptoms / Reason</div>
              <p>${escapeHtml(item.reason || "Consultation")}</p>
            </div>
            <div class="medical-context-card">
              <div class="appointment-section-label"><i class="fas fa-clock-rotate-left"></i> Previous Visit</div>
              ${previousVisit
                ? `<p>${escapeHtml(previousVisit.date)} • ${escapeHtml(previousVisit.status)}</p><small>${escapeHtml(previousVisit.reason)}</small>`
                : '<p>No previous visit found</p><small>First recorded visit with this doctor</small>'}
            </div>
          </div>
          <div class="action-buttons">
            <button class="btn-action approve" data-action="approved" data-id="${escapeHtml(item.id || item._id)}" ${status === "approved" || status === "completed" ? "disabled" : ""}><i class="fas fa-check"></i> Approve</button>
            <button class="btn-action reject" data-action="rejected" data-id="${escapeHtml(item.id || item._id)}" ${status === "rejected" || status === "completed" ? "disabled" : ""}><i class="fas fa-times"></i> Reject</button>
            <button class="btn-action complete" data-action="completed" data-id="${escapeHtml(item.id || item._id)}" ${status === "completed" || status === "rejected" ? "disabled" : ""}><i class="fas fa-circle-check"></i> Mark Completed</button>
            <button class="btn-action details" data-open-appointment="${escapeHtml(item.id || item._id)}"><i class="fas fa-eye"></i> View Full Details</button>
          </div>
        </article>
      `;
    }).join("");

    els.noAppointments.style.display = appointments.length ? "none" : "flex";
  }

  function renderPatientsDirectory() {
    const patients = getFilteredPatients();
    els.patientsDirectoryList.innerHTML = patients.map((patient) => `
      <article class="patient-directory-card" data-patient-id="${escapeHtml(patient.patientId)}">
        <div class="patient-directory-head">
          <div class="patient-directory-avatar">${escapeHtml(getAvatar(patient.name))}</div>
          <div>
            <h4>${escapeHtml(patient.name)}</h4>
            <p>${escapeHtml(patient.department)} • ${escapeHtml(patient.specialization || "General Consultation")}</p>
          </div>
          <span class="status-badge ${escapeHtml(patient.latestStatus)}"><i class="fas ${statusIcon(patient.latestStatus)}"></i> ${statusLabel(patient.latestStatus)}</span>
        </div>
        <div class="patient-directory-body">
          <div><span><i class="fas fa-id-badge me-1"></i>Patient ID</span><strong>${escapeHtml(patient.patientId)}</strong></div>
          <div><span><i class="fas fa-phone me-1"></i>Phone</span><strong>${escapeHtml(patient.phone || "Not available")}</strong></div>
          <div><span><i class="fas fa-user me-1"></i>Age</span><strong>${escapeHtml(patient.age || "N/A")}</strong></div>
          <div><span><i class="fas fa-venus-mars me-1"></i>Gender</span><strong>${escapeHtml(patient.gender || "Not set")}</strong></div>
          <div><span><i class="fas fa-hashtag me-1"></i>Latest Token</span><strong>${escapeHtml(patient.latestToken || "N/A")}</strong></div>
          <div><span><i class="fas fa-calendar-check me-1"></i>Appointments</span><strong>${escapeHtml(patient.appointmentCount)}</strong></div>
          <div><span><i class="fas fa-clock-rotate-left me-1"></i>Last Visit</span><strong>${escapeHtml(formatDate(patient.lastAppointmentDate))}</strong></div>
          <div><span><i class="fas fa-notes-medical me-1"></i>Latest Reason</span><strong>${escapeHtml(patient.appointments[0]?.reason || patient.notes || "Consultation")}</strong></div>
        </div>
        <div class="patient-directory-footer">
          <span class="patient-directory-chip"><i class="fas fa-eye me-1"></i>Click to view full details</span>
        </div>
      </article>
    `).join("");

    els.patientsDirectoryEmpty.style.display = patients.length ? "none" : "flex";
  }

  function renderQueueManagement() {
    const queueItems = getQueueAppointments();
    const nowServing = queueItems.find((item) => normalizeStatus(item.status) === "approved") || null;
    const nextUp = queueItems.find((item) => normalizeStatus(item.status) === "pending") || null;

    setText(els.queueCount, queueItems.length);
    setText(els.queueNowServing, nowServing ? `${nowServing.patientName || "Patient"} • Token ${nowServing.token || nowServing.tokenNumber || "N/A"}` : "No patient");
    setText(els.queueNextUp, nextUp ? `${nextUp.patientName || "Patient"} • Token ${nextUp.token || nextUp.tokenNumber || "N/A"}` : "Waiting list empty");

    if (els.callNextPatientBtn) {
      els.callNextPatientBtn.disabled = !nextUp;
    }

    els.queueList.innerHTML = queueItems.map((item, index) => {
      const status = normalizeStatus(item.status);
      return `
        <article class="queue-card ${status}">
          <div class="queue-card-main">
            <div class="queue-token">#${escapeHtml(item.token || item.tokenNumber || index + 1)}</div>
            <div>
              <h4>${escapeHtml(item.patientName || "Patient")}</h4>
              <p>${escapeHtml(item.department || "General OPD")} • ${escapeHtml(item.timeSlot || item.time || "Time not set")}</p>
            </div>
          </div>
          <div class="queue-card-meta">
            <span class="status-badge ${status}"><i class="fas ${statusIcon(status)}"></i>${statusLabel(status)}</span>
            <button class="btn btn-outline-primary btn-sm" data-open-appointment="${escapeHtml(item.id || item._id)}">
              <i class="fas fa-eye me-1"></i>View
            </button>
          </div>
        </article>
      `;
    }).join("");

    els.queueEmpty.style.display = queueItems.length ? "none" : "flex";
  }

  function buildNotifications() {
    const existing = new Map((state.notifications || []).map((item) => [String(item.id), item]));
    const appointmentNotifications = state.appointments
      .slice()
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 12)
      .map((appointment) => {
        const id = `appointment-${appointment.id || appointment._id}`;
        const previous = existing.get(id);
        return {
          id,
          appointmentId: appointment.id || appointment._id,
          patientId: appointment.patientId || "",
          title: `${appointment.patientName || "Patient"} booked ${appointment.department || "a consultation"}`,
          message: `Token ${appointment.token || appointment.tokenNumber || "N/A"} • ${formatDate(appointment.date)} • ${appointment.timeSlot || appointment.time || "Time not set"}`,
          createdAt: appointment.createdAt || appointment.date || new Date().toISOString(),
          unread: previous ? previous.unread : normalizeStatus(appointment.status) === "pending"
        };
      });

    state.notifications = appointmentNotifications;
    persistNotifications();
  }

  function renderNotifications() {
    els.notificationsList.innerHTML = state.notifications.map((item) => `
      <article class="notification-card ${item.unread ? "unread" : ""}">
        <div class="notification-icon"><i class="fas fa-bell"></i></div>
        <div class="notification-body">
          <h4>${escapeHtml(item.title)}</h4>
          <p>${escapeHtml(item.message)}</p>
          <span>${escapeHtml(formatDate(item.createdAt))}</span>
        </div>
        <div class="notification-actions">
          <button class="btn btn-outline-primary btn-sm" data-notification-open="${escapeHtml(item.appointmentId || "")}">Open</button>
        </div>
      </article>
    `).join("");

    els.notificationsEmpty.style.display = state.notifications.length ? "none" : "flex";
  }

  function renderMedicalRecords() {
    const entries = getRecordEntries();
    els.recordsList.innerHTML = entries.map(({ patient, latestAppointment, latestRecord }) => `
      <article class="record-card" data-patient-id="${escapeHtml(patient.patientId)}">
        <div class="record-card-head">
          <div>
            <h4>${escapeHtml(patient.name)}</h4>
            <p>${escapeHtml(patient.patientId)} • ${escapeHtml(patient.department || "General OPD")}</p>
          </div>
          <span class="status-badge ${escapeHtml(patient.latestStatus)}"><i class="fas ${statusIcon(patient.latestStatus)}"></i>${statusLabel(patient.latestStatus)}</span>
        </div>
        <div class="record-card-grid">
          <div>
            <span>Latest Visit</span>
            <strong>${escapeHtml(formatDate(patient.lastAppointmentDate))}</strong>
          </div>
          <div>
            <span>Appointment Count</span>
            <strong>${escapeHtml(patient.appointmentCount)}</strong>
          </div>
          <div>
            <span>Recent Reason</span>
            <strong>${escapeHtml(latestAppointment?.reason || "Consultation")}</strong>
          </div>
          <div>
            <span>Latest Report</span>
            <strong>${escapeHtml(latestRecord?.title || "No report added")}</strong>
          </div>
        </div>
        <div class="record-card-summary">${escapeHtml(latestRecord?.summary || latestAppointment?.notes || "Patient history and reports are ready to review.")}</div>
        <div class="record-card-actions">
          <button class="btn btn-outline-primary btn-sm" data-patient-id="${escapeHtml(patient.patientId)}"><i class="fas fa-user me-1"></i>Patient</button>
          <button class="btn btn-outline-secondary btn-sm" data-open-appointment="${escapeHtml(latestAppointment?.id || latestAppointment?._id || "")}"><i class="fas fa-file-lines me-1"></i>Latest Visit</button>
        </div>
      </article>
    `).join("");

    els.recordsEmpty.style.display = entries.length ? "none" : "flex";
  }

  function renderSchedule() {
    const schedule = state.schedule || {};
    if (els.availabilityStatus) els.availabilityStatus.value = schedule.status || "available";
    if (els.consultationMode) els.consultationMode.value = schedule.mode || "in-person";
    if (els.morningSlotInput) els.morningSlotInput.value = schedule.morningSlot || "";
    if (els.eveningSlotInput) els.eveningSlotInput.value = schedule.eveningSlot || "";
    if (els.scheduleNotesInput) els.scheduleNotesInput.value = schedule.notes || "";
    document.querySelectorAll(".schedule-day").forEach((checkbox) => {
      checkbox.checked = Array.isArray(schedule.days) && schedule.days.includes(checkbox.value);
    });
  }

  function renderMessages() {
    const patients = getUniquePatients();
    if (!state.selectedMessagePatientId && patients.length) {
      state.selectedMessagePatientId = patients[0].patientId;
    }

    els.messageThreads.innerHTML = patients.map((patient) => {
      const thread = state.messageThreads[patient.patientId] || [];
      const lastMessage = thread[thread.length - 1];
      return `
        <button class="message-thread-item ${String(state.selectedMessagePatientId) === String(patient.patientId) ? "active" : ""}" data-message-patient="${escapeHtml(patient.patientId)}">
          <div class="message-thread-avatar">${escapeHtml(getAvatar(patient.name))}</div>
          <div class="message-thread-body">
            <strong>${escapeHtml(patient.name)}</strong>
            <span>${escapeHtml(lastMessage?.text || patient.phone || "No messages yet")}</span>
          </div>
        </button>
      `;
    }).join("");

    const patient = getSelectedMessagePatient();
    const thread = patient ? (state.messageThreads[patient.patientId] || []) : [];
    setText(els.messageThreadTitle, patient?.name || "Select a patient");
    setText(els.messageThreadSubtitle, patient ? `${patient.department || "General OPD"} • ${patient.phone || "No phone available"}` : "Start a quick update or follow-up conversation.");

    els.messageList.innerHTML = patient ? (thread.length ? thread.map((item) => `
      <article class="message-bubble ${item.sender === "doctor" ? "doctor" : "patient"}">
        <p>${escapeHtml(item.text)}</p>
        <span>${escapeHtml(new Date(item.createdAt).toLocaleString("en-IN"))}</span>
      </article>
    `).join("") : '<div class="panel-empty-state">No messages yet. Send a quick update to this patient.</div>') : '<div class="panel-empty-state">Select a patient from the left to open the chat.</div>';
  }

  function renderSettings() {
    const profile = state.doctorProfile || user;
    const meta = state.doctorMeta || {};
    els.doctorSettingsName.value = profile?.name || "";
    els.doctorSettingsEmail.value = profile?.email || user?.email || "";
    els.doctorSettingsPhone.value = profile?.phone || "";
    els.doctorSettingsExperience.value = meta.experience || profile?.experience || user?.experience || "";
    els.doctorSettingsAddress.value = profile?.address || "";
  }

  function setLoading(loading) {
    state.isLoading = loading;
    els.loadingState.classList.toggle("d-none", !loading);
    if (loading) els.errorState.classList.add("d-none");
  }

  function setError(show, message) {
    els.errorState.classList.toggle("d-none", !show);
    if (show && message) {
      const paragraph = els.errorState.querySelector("p");
      if (paragraph) paragraph.textContent = message;
    }
  }

  function setActiveView(view) {
    state.activeView = view;
    document.querySelectorAll(".sidebar-nav .nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
    document.querySelectorAll(".doctor-view-section").forEach((section) => section.classList.toggle("is-active", section.id === `${view}View`));
    document.body.classList.remove("sidebar-open");
    if (view === "queue") renderQueueManagement();
    if (view === "notifications") renderNotifications();
    if (view === "records") renderMedicalRecords();
    if (view === "schedule") renderSchedule();
    if (view === "messages") renderMessages();
    updateHeaderContent();
  }

  async function loadDoctorMeta() {
    try {
      const doctors = await fetchJSON(`${API_BASE}/doctors`);
      const doctorId = String(getDoctorId());
      state.doctorMeta = Array.isArray(doctors) ? doctors.find((item) => String(item.userId || item._id || item.id) === doctorId) || null : null;
    } catch (_error) {
      state.doctorMeta = null;
    }
  }

  async function loadDoctorProfile() {
    const doctorId = getDoctorId();
    if (!doctorId) {
      state.doctorProfile = user;
      renderSettings();
      updateHeaderContent();
      return;
    }

    try {
      const response = await fetchJSON(`${API_BASE}/user/profile?patientId=${encodeURIComponent(doctorId)}`);
      state.doctorProfile = response.profile || user;
    } catch (_error) {
      state.doctorProfile = user;
    }

    renderSettings();
    updateHeaderContent();
  }

  async function loadAppointments(showLoader = true) {
    if (showLoader) setLoading(true);

    try {
      const doctorId = getDoctorId();
      const appointments = await fetchJSON(`${API_BASE}/appointments/doctor/${encodeURIComponent(doctorId)}`);
      const normalizedAppointments = Array.isArray(appointments) ? appointments.map((item) => ({ ...item, status: normalizeStatus(item.status) })) : [];
      state.appointments = mergeLegacyAppointments(normalizedAppointments);
      buildNotifications();
      renderAppointments();
      renderStats();
      renderPatientsDirectory();
      renderQueueManagement();
      renderNotifications();
      renderMedicalRecords();
      renderMessages();
      setError(false);
    } catch (error) {
      console.error("Error loading appointments:", error);
      state.appointments = mergeLegacyAppointments([]);
      buildNotifications();
      renderAppointments();
      renderStats();
      renderPatientsDirectory();
      renderQueueManagement();
      renderNotifications();
      renderMedicalRecords();
      renderMessages();
      setError(true, error.message || "Please check the API connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function openAppointmentModal(appointmentId) {
    const appointment = state.appointments.find((item) => String(item.id || item._id) === String(appointmentId));
    if (!appointment) return;

    const patientSummary = getUniquePatients().find((item) => String(item.patientId || "") === String(appointment.patientId || ""));
    const status = normalizeStatus(appointment.status);
    const patientName = appointment.patientName || patientSummary?.name || "Patient";
    const patientPhone = appointment.patientPhone || patientSummary?.phone || "Not available";
    const patientEmail = appointment.patientEmail || patientSummary?.email || "Not available";
    const patientAge = appointment.patientAge || patientSummary?.age || "Not available";
    const patientGender = appointment.patientGender || patientSummary?.gender || "Not available";
    const patientHistory = appointment.medicalHistory?.length ? appointment.medicalHistory : (patientSummary?.medicalHistory || []);
    state.selectedAppointmentId = appointment.id || appointment._id;
    els.modalSubtitle.textContent = `${patientName} • Token ${appointment.token || "N/A"} • ${appointment.timeSlot || appointment.time || "Time not set"}`;
    els.notesInput.value = appointment.notes || "";
    els.patientInfoContent.innerHTML = `
      <div class="patient-info-grid">
        <div><span>Name</span><strong>${escapeHtml(patientName)}</strong></div>
        <div><span>Patient ID</span><strong>${escapeHtml(appointment.patientId || "N/A")}</strong></div>
        <div><span>Phone</span><strong>${escapeHtml(patientPhone)}</strong></div>
        <div><span>Email</span><strong>${escapeHtml(patientEmail)}</strong></div>
        <div><span>Age</span><strong>${escapeHtml(patientAge)}</strong></div>
        <div><span>Gender</span><strong>${escapeHtml(patientGender)}</strong></div>
        <div><span>Status</span><strong>${escapeHtml(statusLabel(status))}</strong></div>
        <div><span>Time Slot</span><strong>${escapeHtml(appointment.timeSlot || appointment.time || "Time not set")}</strong></div>
        <div><span>Department</span><strong>${escapeHtml(appointment.department || "General OPD")}</strong></div>
        <div><span>Reason</span><strong>${escapeHtml(appointment.reason || "Consultation")}</strong></div>
      </div>
    `;

    els.patientHistoryContent.innerHTML = patientHistory.length
      ? patientHistory.map((record) => `
          <article class="history-item">
            <strong>${escapeHtml(record.title || "Medical Record")}</strong>
            <span>${escapeHtml(formatDate(record.date))}</span>
            <p>${escapeHtml(record.summary || "Summary available")}</p>
          </article>
        `).join("")
      : '<div class="panel-empty-state">No medical history available for this patient.</div>';

    els.modalApproveBtn.disabled = status === "approved" || status === "completed";
    els.modalRejectBtn.disabled = status === "rejected" || status === "completed";
    els.modalCompleteBtn.disabled = status === "completed" || status === "rejected";
    appointmentDetailsModal.show();
  }

  function openPatientModal(patientId) {
    const patient = getUniquePatients().find((item) => String(item.patientId) === String(patientId));
    if (!patient) return;

    state.selectedPatientId = patient.patientId;
    els.patientModalSubtitle.textContent = `${patient.name} • ${patient.appointmentCount} appointment${patient.appointmentCount === 1 ? "" : "s"}`;
    els.patientModalContent.innerHTML = `
      <div class="patient-directory-modal-grid">
        <div class="patient-modal-card">
          <div class="patient-modal-card-head"><h6><i class="fas fa-user me-2"></i>Patient Overview</h6></div>
          <div class="patient-info-grid">
            <div><span>Name</span><strong>${escapeHtml(patient.name)}</strong></div>
            <div><span>Patient ID</span><strong>${escapeHtml(patient.patientId)}</strong></div>
            <div><span>Phone</span><strong>${escapeHtml(patient.phone || "Not available")}</strong></div>
            <div><span>Email</span><strong>${escapeHtml(patient.email || "Not available")}</strong></div>
            <div><span>Age</span><strong>${escapeHtml(patient.age || "Not available")}</strong></div>
            <div><span>Gender</span><strong>${escapeHtml(patient.gender || "Not available")}</strong></div>
            <div><span>Latest Token</span><strong>${escapeHtml(patient.latestToken || "N/A")}</strong></div>
            <div><span>Latest Status</span><strong>${escapeHtml(statusLabel(patient.latestStatus))}</strong></div>
          </div>
        </div>
        <div class="patient-modal-card">
          <div class="patient-modal-card-head"><h6><i class="fas fa-calendar-check me-2"></i>Recent Appointments</h6></div>
          <div class="patient-appointment-stack">
            ${patient.appointments.map((appointment) => `
              <article class="history-item">
                <strong>${escapeHtml(formatDate(appointment.date))}</strong>
                <span>${escapeHtml((appointment.timeSlot || appointment.time || "Time not set") + " • " + statusLabel(appointment.status))}</span>
                <p>${escapeHtml((appointment.department || "General OPD") + " • " + (appointment.reason || "Consultation"))}</p>
              </article>
            `).join("")}
          </div>
        </div>
      </div>
      <div class="patient-modal-card mt-3">
        <div class="patient-modal-card-head"><h6><i class="fas fa-file-waveform me-2"></i>Medical History</h6></div>
        ${patient.medicalHistory?.length
          ? patient.medicalHistory.map((record) => `
              <article class="history-item">
                <strong>${escapeHtml(record.title || "Medical Record")}</strong>
                <span>${escapeHtml(formatDate(record.date))}</span>
                <p>${escapeHtml(record.summary || "Summary available")}</p>
              </article>
            `).join("")
          : '<div class="panel-empty-state">No medical history available for this patient.</div>'}
      </div>
    `;
    patientDetailsModal.show();
  }

  async function updateAppointmentStatus(appointmentId, status, notesOverride) {
    try {
      const current = state.appointments.find((item) => String(item.id || item._id) === String(appointmentId));
      const notes = notesOverride !== undefined ? notesOverride : (current?.notes || "");
      await fetchJSON(`${API_BASE}/appointments/${encodeURIComponent(appointmentId)}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes })
      });
      await loadAppointments(false);
      if (state.selectedAppointmentId && String(state.selectedAppointmentId) === String(appointmentId)) appointmentDetailsModal.hide();
    } catch (error) {
      alert(error.message || "Failed to update appointment.");
    }
  }

  async function downloadClinicalSummary() {
    const appointment = getSelectedAppointment();
    if (!appointment) {
      alert("Appointment details not found.");
      return;
    }

    const patientSummary = getUniquePatients().find((item) => String(item.patientId || "") === String(appointment.patientId || ""));
    const patientName = appointment.patientName || patientSummary?.name || "Patient";
    const patientPhone = appointment.patientPhone || patientSummary?.phone || "Not available";
    const patientEmail = appointment.patientEmail || patientSummary?.email || "Not available";
    const patientAge = appointment.patientAge || patientSummary?.age || "Not available";
    const patientGender = appointment.patientGender || patientSummary?.gender || "Not available";
    const historyItems = patientSummary?.appointments || [appointment];
    const medicalHistory = appointment.medicalHistory?.length ? appointment.medicalHistory : (patientSummary?.medicalHistory || []);

    const reportData = {
      patientName,
      patientId: appointment.patientId || "N/A",
      patientPhone,
      patientEmail,
      patientAge,
      patientGender,
      tokenNumber: appointment.token || appointment.tokenNumber || "N/A",
      appointmentDate: formatDate(appointment.date),
      timeSlot: appointment.timeSlot || appointment.time || "Time not set",
      department: appointment.department || "General OPD",
      status: statusLabel(appointment.status),
      reason: appointment.reason || "Consultation",
      doctorNotes: els.notesInput.value.trim() || appointment.notes || "No notes added",
      historyItems: historyItems.map((item) => ({
        date: formatDate(item.date),
        time: item.timeSlot || item.time || "Time not set",
        department: item.department || "General OPD",
        status: statusLabel(item.status),
        reason: item.reason || "Consultation"
      })),
      medicalHistory: medicalHistory.map((record) => ({
        date: formatDate(record.date),
        title: record.title || "Medical Record",
        summary: record.summary || "Summary available"
      })),
      generatedBy: state.doctorProfile?.name || user.name || "Doctor",
      generatedAt: new Date().toLocaleString("en-IN")
    };

    try {
      await exportDoctorReport(reportData, `clinical_summary_${String(patientName).replace(/\s+/g, "_")}.pdf`);
    } catch (error) {
      console.error("Doctor report download failed:", error);
      alert(error.message || "Failed to download clinical summary.");
    }
  }

  async function callNextPatient() {
    const nextUp = getQueueAppointments().find((item) => normalizeStatus(item.status) === "pending");
    if (!nextUp) {
      alert("No pending patient is waiting in the queue.");
      return;
    }

    await updateAppointmentStatus(nextUp.id || nextUp._id, "approved", `Called to consultation on ${new Date().toLocaleString("en-IN")}`);
    setActiveView("queue");
  }

  function markNotificationsRead() {
    state.notifications = state.notifications.map((item) => ({ ...item, unread: false }));
    persistNotifications();
    renderNotifications();
  }

  function saveSchedule() {
    const selectedDays = [...document.querySelectorAll(".schedule-day:checked")].map((checkbox) => checkbox.value);
    state.schedule = {
      status: els.availabilityStatus?.value || "available",
      mode: els.consultationMode?.value || "in-person",
      morningSlot: els.morningSlotInput?.value.trim() || "",
      eveningSlot: els.eveningSlotInput?.value.trim() || "",
      days: selectedDays,
      notes: els.scheduleNotesInput?.value.trim() || ""
    };
    writeStorageJSON(getDoctorStorageKey("schedule"), state.schedule);
    alert("Schedule updated successfully.");
  }

  function sendMessage() {
    const patient = getSelectedMessagePatient();
    const text = els.messageInput?.value.trim();
    if (!patient) {
      alert("Please select a patient first.");
      return;
    }
    if (!text) {
      alert("Please write a message before sending.");
      return;
    }

    const thread = state.messageThreads[patient.patientId] || [];
    thread.push({
      id: `msg-${Date.now()}`,
      sender: "doctor",
      text,
      createdAt: new Date().toISOString()
    });
    state.messageThreads[patient.patientId] = thread;
    persistMessages();
    els.messageInput.value = "";
    renderMessages();
  }

  async function saveDoctorSettings() {
    const doctorId = getDoctorId();
    if (!doctorId) return alert("Doctor profile not found.");

    const payload = { name: els.doctorSettingsName.value.trim(), phone: els.doctorSettingsPhone.value.trim(), address: els.doctorSettingsAddress.value.trim() };
    if (!payload.name) return alert("Doctor name is required.");

    const originalHtml = els.saveDoctorSettingsBtn.innerHTML;
    els.saveDoctorSettingsBtn.disabled = true;
    els.saveDoctorSettingsBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Saving';

    try {
      const response = await fetchJSON(`${API_BASE}/user/profile?patientId=${encodeURIComponent(doctorId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      state.doctorProfile = { ...(state.doctorProfile || user), ...(response.profile || payload) };
      localStorage.setItem("user", JSON.stringify({ ...user, ...state.doctorProfile }));
      renderSettings();
      updateHeaderContent();
      alert(response.message || "Doctor settings saved successfully.");
    } catch (error) {
      alert(error.message || "Failed to save doctor settings.");
    } finally {
      els.saveDoctorSettingsBtn.disabled = false;
      els.saveDoctorSettingsBtn.innerHTML = originalHtml;
    }
  }

  function attachEvents() {
    document.querySelectorAll(".filter-btn").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".filter-btn").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        state.appointmentFilter = button.dataset.status;
        renderAppointments();
      });
    });

    document.querySelectorAll(".sidebar-nav .nav-item").forEach((item) => item.addEventListener("click", (event) => {
      event.preventDefault();
      setActiveView(item.dataset.view);
    }));

    document.addEventListener("click", (event) => {
      const appointmentCard = event.target.closest("[data-open-appointment]");
      const actionButton = event.target.closest("[data-action]");
      const patientCard = event.target.closest("[data-patient-id]");
      const notificationButton = event.target.closest("[data-notification-open]");
      const messageThread = event.target.closest("[data-message-patient]");

      if (actionButton) {
        event.stopPropagation();
        updateAppointmentStatus(actionButton.getAttribute("data-id"), actionButton.getAttribute("data-action"));
        return;
      }

       if (notificationButton) {
        const appointmentId = notificationButton.getAttribute("data-notification-open");
        state.notifications = state.notifications.map((item) => item.appointmentId === appointmentId ? { ...item, unread: false } : item);
        persistNotifications();
        renderNotifications();
        openAppointmentModal(appointmentId);
        return;
      }

      if (appointmentCard && appointmentCard.closest(".appointments-list")) {
        openAppointmentModal(appointmentCard.getAttribute("data-open-appointment"));
        return;
      }

      if (appointmentCard && appointmentCard.closest(".queue-list")) {
        openAppointmentModal(appointmentCard.getAttribute("data-open-appointment"));
        return;
      }

      if (appointmentCard && appointmentCard.closest(".record-list")) {
        openAppointmentModal(appointmentCard.getAttribute("data-open-appointment"));
        return;
      }

      if (patientCard && (patientCard.closest(".patients-directory-grid") || patientCard.closest(".doctor-mini-list"))) {
        openPatientModal(patientCard.getAttribute("data-patient-id"));
        return;
      }

      if (patientCard && patientCard.closest(".record-list")) {
        openPatientModal(patientCard.getAttribute("data-patient-id"));
      }

      if (messageThread) {
        state.selectedMessagePatientId = messageThread.getAttribute("data-message-patient");
        renderMessages();
      }
    });

    els.patientSearchInput?.addEventListener("input", (event) => { state.patientSearch = event.target.value || ""; renderPatientsDirectory(); });
    els.patientStatusFilter?.addEventListener("change", (event) => { state.patientStatusFilter = event.target.value || "all"; renderPatientsDirectory(); });
    els.recordSearchInput?.addEventListener("input", (event) => { state.recordSearch = event.target.value || ""; renderMedicalRecords(); });
    els.modalApproveBtn.addEventListener("click", () => updateAppointmentStatus(state.selectedAppointmentId, "approved", els.notesInput.value.trim()));
    els.modalRejectBtn.addEventListener("click", () => updateAppointmentStatus(state.selectedAppointmentId, "rejected", els.notesInput.value.trim()));
    els.modalCompleteBtn.addEventListener("click", () => updateAppointmentStatus(state.selectedAppointmentId, "completed", els.notesInput.value.trim()));
    els.modalDownloadBtn?.addEventListener("click", downloadClinicalSummary);
    els.callNextPatientBtn?.addEventListener("click", callNextPatient);
    els.markNotificationsReadBtn?.addEventListener("click", markNotificationsRead);
    els.saveScheduleBtn?.addEventListener("click", saveSchedule);
    els.sendMessageBtn?.addEventListener("click", sendMessage);
    els.messageInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });
    els.saveDoctorSettingsBtn?.addEventListener("click", saveDoctorSettings);
    els.mobileMenuToggle?.addEventListener("click", () => document.body.classList.toggle("sidebar-open"));
    els.mobileSidebarBackdrop?.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
    window.addEventListener("resize", () => { if (window.innerWidth >= 992) document.body.classList.remove("sidebar-open"); });
  }

  function startAutoRefresh() {
    window.clearInterval(state.refreshTimer);
    state.refreshTimer = window.setInterval(() => loadAppointments(false), REFRESH_INTERVAL_MS);
  }

  window.logout = function logout() {
    if (confirm("Are you sure you want to logout?")) {
      localStorage.clear();
      window.location.href = "../index.html";
    }
  };

  async function init() {
    loadDashboardPreferences();
    attachEvents();
    setActiveView("appointments");
    await Promise.all([loadDoctorMeta(), loadDoctorProfile()]);
    await loadAppointments();
    renderSettings();
    renderSchedule();
    renderMessages();
    startAutoRefresh();
  }

  init();
})();
