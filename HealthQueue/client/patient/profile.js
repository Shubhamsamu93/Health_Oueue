(function () {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const token = localStorage.getItem("token") || "";
  const API_BASE = window.API_BASE + "/api";

  if (!user || user.role !== "patient") {
    window.location.href = "login.html";
    return;
  }

  const state = {
    profile: null,
    appointments: [],
    records: [],
    queue: null,
    filter: "all",
    editing: false
  };

  const els = {
    sidebar: document.querySelector(".sidebar"),
    mobileMenuToggle: document.getElementById("mobileMenuToggle"),
    mobileSidebarBackdrop: document.getElementById("mobileSidebarBackdrop"),
    sidebarName: document.getElementById("profileSidebarName"),
    heroName: document.getElementById("profileName"),
    heroEmail: document.getElementById("profileEmail"),
    heroPhone: document.getElementById("profilePhone"),
    heroAgeGender: document.getElementById("profileAgeGender"),
    heroAddress: document.getElementById("profileAddress"),
    avatarLarge: document.getElementById("profileAvatarLarge"),
    avatarHeader: document.getElementById("profileHeaderAvatar"),
    apptCount: document.getElementById("profileApptCount"),
    recordCount: document.getElementById("profileRecordCount"),
    queueToken: document.getElementById("profileQueueToken"),
    completionText: document.getElementById("completionText"),
    completionBar: document.getElementById("completionBar"),
    queueStatusBadge: document.getElementById("queueStatusBadge"),
    queueTokenValue: document.getElementById("queueTokenValue"),
    queuePositionValue: document.getElementById("queuePositionValue"),
    inputName: document.getElementById("inputName"),
    inputEmail: document.getElementById("inputEmail"),
    inputPhone: document.getElementById("inputPhone"),
    inputAge: document.getElementById("inputAge"),
    inputGender: document.getElementById("inputGender"),
    inputAddress: document.getElementById("inputAddress"),
    editBtn: document.getElementById("editProfileBtn"),
    saveBtn: document.getElementById("saveProfileBtn"),
    appointmentsList: document.getElementById("appointmentsPanelList"),
    recordsList: document.getElementById("recordsPanelList"),
    miniUpcomingCount: document.getElementById("miniUpcomingCount"),
    miniCompletedCount: document.getElementById("miniCompletedCount"),
    miniRecordCount: document.getElementById("miniRecordCount"),
    logoutBtn: document.getElementById("logoutProfileBtn"),
    recordPreviewBody: document.getElementById("recordPreviewBody"),
    newPasswordInput: document.getElementById("newPasswordInput"),
    confirmPasswordInput: document.getElementById("confirmPasswordInput"),
    savePasswordBtn: document.getElementById("savePasswordBtn")
  };

  const recordPreviewModal = new bootstrap.Modal(document.getElementById("recordPreviewModal"));
  const changePasswordModal = new bootstrap.Modal(document.getElementById("changePasswordModal"));

  function getPatientId() {
    return user?._id || user?.id || user?.patientId || "";
  }

  function getHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  function getAvatarText(name) {
    return String(name || "P")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeStatus(status) {
    const raw = String(status || "").toLowerCase();
    if (["completed", "done"].includes(raw)) return "completed";
    if (["cancelled", "canceled"].includes(raw)) return "cancelled";
    return "upcoming";
  }

  function appointmentBadge(status) {
    const normalized = normalizeStatus(status);
    const map = {
      upcoming: "bg-primary-subtle text-primary",
      completed: "bg-success-subtle text-success",
      cancelled: "bg-danger-subtle text-danger"
    };
    return `<span class="badge ${map[normalized]} text-capitalize">${normalized}</span>`;
  }

  async function fetchJSON(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || "Request failed");
    }
    return data;
  }

  async function loadProfile() {
    const patientId = getPatientId();
    const profileUrl = `${API_BASE}/user/profile?patientId=${encodeURIComponent(patientId)}`;
    const profileData = await fetchJSON(profileUrl, { headers: getHeaders() });

    let recordData = profileData.records || [];
    if (!recordData.length && patientId) {
      try {
        const recordsResponse = await fetchJSON(`${API_BASE}/records/patient/${encodeURIComponent(patientId)}`);
        recordData = (recordsResponse || []).map((record, index) => ({
          id: record._id || `record-${index + 1}`,
          title: record.diagnosis || record.visitType || `Medical Record ${index + 1}`,
          doctorName: record.doctorName || "Treating Doctor",
          type: record.visitType || "Prescription",
          displayDate: new Date(record.visitDate || record.createdAt || Date.now()).toLocaleDateString("en-IN"),
          status: record.status || "completed",
          summary: record.notes || record.precautions || record.diagnosis || "Medical summary available",
          downloadable: true
        }));
      } catch (_error) {
        recordData = [];
      }
    }

    state.profile = profileData.profile || {};
    state.appointments = profileData.appointments || [];
    state.records = recordData;
    state.queue = profileData.queue || null;

    renderProfile(profileData.completion || 0);
    renderAppointments();
    renderRecords();
  }

  function renderProfile(completion) {
    const profile = state.profile || {};
    const avatarText = getAvatarText(profile.name);
    const upcomingCount = state.appointments.filter((item) => normalizeStatus(item.status) === "upcoming").length;
    const completedCount = state.appointments.filter((item) => normalizeStatus(item.status) === "completed").length;

    els.sidebarName.textContent = profile.name || "Patient";
    els.heroName.textContent = profile.name || "Patient";
    els.heroEmail.textContent = profile.email || "--";
    els.heroPhone.textContent = profile.phone || "--";
    els.heroAgeGender.textContent = [profile.age ? `${profile.age} yrs` : "", profile.gender || ""].filter(Boolean).join(" • ") || "Details pending";
    els.heroAddress.textContent = profile.address || "Address not added yet";
    els.avatarLarge.textContent = avatarText;
    els.avatarHeader.textContent = avatarText;
    els.apptCount.textContent = state.appointments.length;
    els.recordCount.textContent = state.records.length;
    els.queueToken.textContent = state.queue?.token || "--";
    els.completionText.textContent = `${completion}%`;
    els.completionBar.style.width = `${completion}%`;
    els.queueStatusBadge.textContent = state.queue ? String(state.queue.status || "active").replace("-", " ") : "No active queue";
    els.queueTokenValue.textContent = state.queue?.token || "--";
    els.queuePositionValue.textContent = state.queue?.position ?? "--";
    els.inputName.value = profile.name || "";
    els.inputEmail.value = profile.email || "";
    els.inputPhone.value = profile.phone || "";
    els.inputAge.value = profile.age || "";
    els.inputGender.value = profile.gender || "";
    els.inputAddress.value = profile.address || "";
    els.miniUpcomingCount.textContent = upcomingCount;
    els.miniCompletedCount.textContent = completedCount;
    els.miniRecordCount.textContent = state.records.length;
  }

  function renderAppointments() {
    const filtered = state.appointments.filter((item) => {
      if (state.filter === "all") return true;
      return normalizeStatus(item.status) === state.filter;
    });

    if (!filtered.length) {
      els.appointmentsList.innerHTML = '<div class="profile-empty-state"><i class="fas fa-calendar-xmark"></i><span>No appointments found for this filter.</span></div>';
      return;
    }

    els.appointmentsList.innerHTML = filtered.map((item) => `
      <article class="profile-list-card">
        <div class="profile-list-icon appointment-icon"><i class="fas fa-calendar-check"></i></div>
        <div class="profile-list-content">
          <div class="profile-list-head">
            <h4>${escapeHtml(item.doctorName || "Doctor")}</h4>
            ${appointmentBadge(item.status)}
          </div>
          <p>${escapeHtml(item.department || "General OPD")} • Token ${escapeHtml(item.token || "N/A")}</p>
          <div class="profile-list-meta">
            <span><i class="fas fa-calendar"></i> ${escapeHtml(item.displayDate || "--")}</span>
            <span><i class="fas fa-clock"></i> ${escapeHtml(item.displayTime || "--")}</span>
            <span><i class="fas fa-notes-medical"></i> ${escapeHtml(item.reason || "Consultation")}</span>
          </div>
        </div>
      </article>
    `).join("");
  }

  function renderRecords() {
    if (!state.records.length) {
      els.recordsList.innerHTML = '<div class="profile-empty-state"><i class="fas fa-file-circle-xmark"></i><span>No medical records available right now.</span></div>';
      return;
    }

    els.recordsList.innerHTML = state.records.map((record) => `
      <article class="profile-list-card">
        <div class="profile-list-icon record-icon"><i class="fas fa-file-prescription"></i></div>
        <div class="profile-list-content">
          <div class="profile-list-head">
            <h4>${escapeHtml(record.title || "Medical Record")}</h4>
            <span class="badge bg-light text-dark text-capitalize">${escapeHtml(record.status || "completed")}</span>
          </div>
          <p>${escapeHtml(record.type || "Record")} • ${escapeHtml(record.doctorName || "Treating Doctor")}</p>
          <div class="profile-list-meta">
            <span><i class="fas fa-calendar"></i> ${escapeHtml(record.displayDate || "--")}</span>
            <span><i class="fas fa-note-sticky"></i> ${escapeHtml(record.summary || "Medical summary available")}</span>
          </div>
        </div>
        <div class="profile-list-actions">
          <button class="btn btn-outline-primary btn-sm" data-view-record="${escapeHtml(record.id)}">View</button>
          <button class="btn btn-primary btn-sm" data-download-record="${escapeHtml(record.id)}">Download</button>
        </div>
      </article>
    `).join("");
  }

  function setEditing(enabled) {
    state.editing = enabled;
    ["inputName", "inputPhone", "inputAge", "inputGender", "inputAddress"].forEach((key) => {
      els[key].disabled = !enabled;
    });
    els.editBtn.classList.toggle("d-none", enabled);
    els.saveBtn.classList.toggle("d-none", !enabled);
  }

  async function saveProfile() {
    const patientId = getPatientId();
    const payload = {
      patientId,
      name: els.inputName.value.trim(),
      phone: els.inputPhone.value.trim(),
      age: els.inputAge.value.trim(),
      gender: els.inputGender.value,
      address: els.inputAddress.value.trim()
    };

    const response = await fetchJSON(`${API_BASE}/user/profile?patientId=${encodeURIComponent(patientId)}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    state.profile = {
      ...state.profile,
      ...response.profile
    };

    localStorage.setItem("user", JSON.stringify({
      ...user,
      name: state.profile.name,
      phone: state.profile.phone
    }));

    renderProfile(response.completion || 0);
    setEditing(false);
    alert("Profile updated successfully.");
  }

  async function updatePassword() {
    const patientId = getPatientId();
    const newPassword = els.newPasswordInput.value.trim();
    const confirmPassword = els.confirmPasswordInput.value.trim();

    if (!newPassword || newPassword.length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    await fetchJSON(`${API_BASE}/user/change-password?patientId=${encodeURIComponent(patientId)}`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ patientId, newPassword })
    });

    els.newPasswordInput.value = "";
    els.confirmPasswordInput.value = "";
    changePasswordModal.hide();
    alert("Password changed successfully.");
  }

  function openRecordPreview(recordId) {
    const record = state.records.find((item) => String(item.id) === String(recordId));
    if (!record) return;

    els.recordPreviewBody.innerHTML = `
      <div class="record-preview-shell">
        <h4>${escapeHtml(record.title || "Medical Record")}</h4>
        <p><strong>Doctor:</strong> ${escapeHtml(record.doctorName || "Treating Doctor")}</p>
        <p><strong>Date:</strong> ${escapeHtml(record.displayDate || "--")}</p>
        <p><strong>Type:</strong> ${escapeHtml(record.type || "Prescription")}</p>
        <p class="mb-0"><strong>Summary:</strong> ${escapeHtml(record.summary || "Medical summary available")}</p>
      </div>
    `;
    recordPreviewModal.show();
  }

  function downloadRecord(recordId) {
    const record = state.records.find((item) => String(item.id) === String(recordId));
    if (!record) return;

    const blob = new Blob([
      `HealthQueue Medical Record\n\nTitle: ${record.title}\nDoctor: ${record.doctorName}\nDate: ${record.displayDate}\nType: ${record.type}\nStatus: ${record.status}\nSummary: ${record.summary}\n`
    ], { type: "text/plain;charset=utf-8" });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${String(record.title || "medical-record").replace(/\s+/g, "-").toLowerCase()}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    els.mobileMenuToggle?.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-open");
    });

    els.mobileSidebarBackdrop?.addEventListener("click", () => {
      document.body.classList.remove("sidebar-open");
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth >= 992) {
        document.body.classList.remove("sidebar-open");
      }
    });

    document.querySelectorAll(".profile-tab").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".profile-tab").forEach((item) => item.classList.remove("active"));
        document.querySelectorAll(".profile-tab-panel").forEach((panel) => panel.classList.remove("active"));
        button.classList.add("active");
        document.querySelector(`.profile-tab-panel[data-panel="${button.dataset.tab}"]`)?.classList.add("active");
      });
    });

    document.querySelectorAll(".filter-chip").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".filter-chip").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        state.filter = button.dataset.status;
        renderAppointments();
      });
    });

    els.editBtn.addEventListener("click", () => setEditing(true));
    els.saveBtn.addEventListener("click", saveProfile);
    els.logoutBtn.addEventListener("click", () => window.logout());
    document.getElementById("changePasswordBtn").addEventListener("click", () => changePasswordModal.show());
    document.getElementById("sideChangePasswordBtn").addEventListener("click", () => changePasswordModal.show());
    els.savePasswordBtn.addEventListener("click", updatePassword);

    document.addEventListener("click", (event) => {
      const viewButton = event.target.closest("[data-view-record]");
      const downloadButton = event.target.closest("[data-download-record]");

      if (viewButton) {
        openRecordPreview(viewButton.getAttribute("data-view-record"));
      }

      if (downloadButton) {
        downloadRecord(downloadButton.getAttribute("data-download-record"));
      }
    });
  }

  async function init() {
    bindEvents();
    try {
      await loadProfile();
    } catch (error) {
      console.error("Unable to load profile", error);
      alert(error.message || "Unable to load profile");
    }
  }

  init();
})();
