(function () {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  console.log("🔍 Records Page - User loaded:", user);
  
  if (!user || user.role !== "patient") {
    console.error("❌ Not authenticated as patient. User:", user);
    window.location.href = "login.html";
    return;
  }

  const API_BASE = window.API_BASE + "/api";
  console.log("📍 API_BASE:", API_BASE);
  const state = {
    records: []
  };

  const els = {
    mobileMenuToggle: document.getElementById("mobileMenuToggle"),
    mobileSidebarBackdrop: document.getElementById("mobileSidebarBackdrop"),
    sidebar: document.querySelector(".sidebar"),
    sidebarName: document.getElementById("recordsSidebarName"),
    headerAvatar: document.getElementById("recordsHeaderAvatar"),
    countBadge: document.getElementById("recordsCountBadge"),
    subtitle: document.getElementById("recordsPageSubtitle"),
    loading: document.getElementById("recordsLoadingState"),
    empty: document.getElementById("recordsEmptyState"),
    error: document.getElementById("recordsErrorState"),
    errorText: document.getElementById("recordsErrorText"),
    grid: document.getElementById("recordsPageGrid"),
    detailsBody: document.getElementById("recordDetailsBody"),
    logoutBtn: document.getElementById("logoutBtn"),
    recordDetailsModal: document.getElementById("recordDetailsModal")
  };

  let recordDetailsModal = null;
  
  function initializeModal() {
    if (!recordDetailsModal && els.recordDetailsModal) {
      try {
        recordDetailsModal = new bootstrap.Modal(els.recordDetailsModal);
        console.log("✅ Bootstrap modal initialized");
      } catch (e) {
        console.warn("⚠️  Bootstrap modal failed to initialize:", e.message);
      }
    }
    return recordDetailsModal;
  }

  function getPatientId() {
    const id = user?._id || user?.id || user?.patientId || "";
    console.log("🆔 Patient ID extracted:", id, "Type:", typeof id);
    return id;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

  function formatDate(value) {
    const date = new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? "--" : date.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function formatStatus(status) {
    const normalized = String(status || "completed").toLowerCase();
    if (normalized === "pending_review") {
      return { label: "Pending Review", badgeClass: "bg-warning-subtle text-warning" };
    }
    if (normalized === "draft") {
      return { label: "Draft", badgeClass: "bg-secondary-subtle text-secondary" };
    }
    return { label: "Completed", badgeClass: "bg-success-subtle text-success" };
  }

  function getRecordTitle(record) {
    if (record.attachments?.length) return "Report";
    return "Prescription";
  }

  function toggleState(target) {
    [els.loading, els.empty, els.error].forEach((node) => node?.classList.add("d-none"));
    if (target) {
      target.classList.remove("d-none");
    }
  }

  function renderRecords() {
    console.log("🎨 Rendering records... Total:", state.records.length);
    
    if (!state.records.length) {
      console.warn("⚠️  No records to display");
      els.grid.innerHTML = "";
      els.countBadge.textContent = "0 records";
      els.subtitle.textContent = "No records available for your account yet.";
      toggleState(els.empty);
      return;
    }

    toggleState(null);
    els.countBadge.textContent = `${state.records.length} record${state.records.length === 1 ? "" : "s"}`;
    els.subtitle.textContent = "Your prescriptions, reports, and consultation history are listed below.";

    els.grid.innerHTML = state.records.map((record, index) => {
      const statusMeta = formatStatus(record.status);
      const title = getRecordTitle(record);
      return `
        <article class="records-page-card">
          <div class="records-page-card-head">
            <div>
              <span class="records-page-tag">${title}</span>
              <h4>${escapeHtml(record.diagnosis || record.visitType || `${title} ${index + 1}`)}</h4>
            </div>
            <span class="badge ${statusMeta.badgeClass}">${statusMeta.label}</span>
          </div>
          <div class="records-page-card-meta">
            <span><i class="fas fa-user-doctor"></i>${escapeHtml(record.doctorName || "Treating Doctor")}</span>
            <span><i class="fas fa-calendar-day"></i>${escapeHtml(formatDate(record.visitDate || record.createdAt))}</span>
          </div>
          <div class="records-page-card-actions">
            <button type="button" class="btn btn-outline-primary" data-view-record="${index}">
              <i class="fas fa-eye me-2"></i>View
            </button>
            <button type="button" class="btn btn-primary" data-download-record="${index}">
              <i class="fas fa-download me-2"></i>Download
            </button>
          </div>
        </article>
      `;
    }).join("");
    
    console.log("✅ Grid HTML rendered");

    els.grid.querySelectorAll("[data-view-record]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.getAttribute("data-view-record"));
        if (!Number.isNaN(index)) {
          console.log("👁️ Opening record details for index:", index);
          openRecordDetails(state.records[index]);
        }
      });
    });

    els.grid.querySelectorAll("[data-download-record]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.getAttribute("data-download-record"));
        if (!Number.isNaN(index)) {
          console.log("📥 Downloading record for index:", index);
          downloadRecord(state.records[index], index);
        }
      });
    });
  }

  function openRecordDetails(record) {
    if (!record) return;
    const statusMeta = formatStatus(record.status);
    els.detailsBody.innerHTML = `
      <div class="records-details-shell">
        <div class="records-details-top">
          <div>
            <div class="records-page-tag">${escapeHtml(getRecordTitle(record))}</div>
            <h4>${escapeHtml(record.diagnosis || record.visitType || "Medical Record")}</h4>
          </div>
          <span class="badge ${statusMeta.badgeClass}">${statusMeta.label}</span>
        </div>
        <div class="records-details-grid">
          <div class="records-detail-box"><strong>Doctor</strong><span>${escapeHtml(record.doctorName || "Treating Doctor")}</span></div>
          <div class="records-detail-box"><strong>Date</strong><span>${escapeHtml(formatDate(record.visitDate || record.createdAt))}</span></div>
          <div class="records-detail-box"><strong>Specialization</strong><span>${escapeHtml(record.specialization || "General")}</span></div>
          <div class="records-detail-box"><strong>Type</strong><span>${escapeHtml(getRecordTitle(record))}</span></div>
        </div>
        ${record.symptoms?.length ? `<div class="records-detail-section"><strong>Symptoms</strong><p>${escapeHtml(record.symptoms.join(", "))}</p></div>` : ""}
        ${record.diagnosis ? `<div class="records-detail-section"><strong>Diagnosis</strong><p>${escapeHtml(record.diagnosis)}</p></div>` : ""}
        ${record.notes ? `<div class="records-detail-section"><strong>Notes</strong><p>${escapeHtml(record.notes)}</p></div>` : ""}
        ${record.precautions ? `<div class="records-detail-section"><strong>Precautions</strong><p>${escapeHtml(record.precautions)}</p></div>` : ""}
      </div>
    `;
    const modal = initializeModal();
    if (modal) {
      modal.show();
    }
  }

  function downloadRecord(record, index) {
    if (!record) return;
    const content = [
      `HealthQueue Medical Record`,
      ``,
      `Title: ${getRecordTitle(record)}`,
      `Doctor: ${record.doctorName || "Treating Doctor"}`,
      `Date: ${formatDate(record.visitDate || record.createdAt)}`,
      `Status: ${formatStatus(record.status).label}`,
      `Specialization: ${record.specialization || "General"}`,
      `Diagnosis: ${record.diagnosis || "N/A"}`,
      `Symptoms: ${Array.isArray(record.symptoms) && record.symptoms.length ? record.symptoms.join(", ") : "N/A"}`,
      `Notes: ${record.notes || "N/A"}`,
      `Precautions: ${record.precautions || "N/A"}`
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `medical-record-${index + 1}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function loadRecords() {
    const patientId = getPatientId();
    console.log("🏥 Loading records for patient:", patientId);
    
    if (!patientId) {
      console.error("❌ Patient ID is empty or null");
      toggleState(els.error);
      els.errorText.textContent = "Patient session is missing. Please log in again.";
      return;
    }

    toggleState(els.loading);
    els.grid.innerHTML = "";

    try {
      const apiUrl = `${API_BASE}/records/patient/${encodeURIComponent(patientId)}`;
      console.log("📡 Fetching from:", apiUrl);
      
      const response = await fetch(apiUrl);
      console.log("📊 Response status:", response.status);
      
      const data = await response.json().catch(() => ([]));
      console.log("📦 Response data:", data);
      
      if (!response.ok) {
        throw new Error(data?.msg || data?.message || "Failed to load records");
      }
      state.records = Array.isArray(data) ? data : [];
      console.log("✅ Records loaded:", state.records.length);
      renderRecords();
    } catch (error) {
      console.error("❌ Error loading records:", error);
      state.records = [];
      els.grid.innerHTML = "";
      toggleState(els.error);
      els.errorText.textContent = error.message || "Unable to load records right now.";
    }
  }

  function setupResponsiveNav() {
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
  }

  function logout() {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    window.location.href = "login.html";
  }

  function init() {
    console.log("🚀 Records page initializing...");
    els.sidebarName.textContent = user.name || "Patient";
    els.headerAvatar.textContent = getAvatarText(user.name);
    els.logoutBtn?.addEventListener("click", logout);
    setupResponsiveNav();
    initializeModal();
    loadRecords();
    console.log("✅ Records page ready");
  }

  window.logout = logout;
  init();
})();
