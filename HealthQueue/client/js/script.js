// Patient Authentication Functions
window.login = async function() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  if (!email || !password) {
    alert('❌ Please enter email and password');
    return;
  }

  try {
    const response = await fetch(`${window.API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        role: 'patient'
      })
    });

    const data = await response.json();

    if (response.ok && data.token && data.user) {
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('token', data.token);
      alert('✅ Login successful!');
      window.location.href = 'dashboard.html';
    } else {
      alert('❌ Login failed: ' + (data.msg || data.error || 'Invalid credentials'));
    }
  } catch (error) {
    alert('❌ Network Error: ' + error.message);
    console.error('Login error:', error);
  }
};

window.signup = async function() {
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const phone = document.getElementById('phone').value;
  const password = document.getElementById('password').value;

  if (!name || !email || !phone || !password) {
    alert('❌ Please fill all fields');
    return;
  }

  try {
    const response = await fetch(`${window.API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        phone,
        password,
        role: 'patient'
      })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      alert('✅ Signup successful! Please login now.');
      window.location.href = 'login.html';
    } else {
      alert('❌ Signup failed: ' + (data.error || data.msg || 'Please try again'));
    }
  } catch (error) {
    alert('❌ Network Error: ' + error.message);
    console.error('Signup error:', error);
  }
};

// Check if user is logged in on dashboard page
window.checkAuth = function() {
  const user = localStorage.getItem('user');
  const token = localStorage.getItem('token');

  if (!user || !token) {
    window.location.href = 'login.html';
    return null;
  }

  return JSON.parse(user);
};

// Logout function
window.logout = function() {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  window.location.href = 'login.html';
};

console.log('✅ HealthQueue Authentication Module Loaded');

(function() {
  function setSession(token, user) {
    state.token = token;
    state.user = user;
    localStorage.setItem("hq_token", token);
    localStorage.setItem("hq_user", JSON.stringify(user));
  }

  function clearSession() {
    state.token = "";
    state.user = null;
    state.roleData = null;
    localStorage.removeItem("hq_token");
    localStorage.removeItem("hq_user");
    if (state.socket) {
      state.socket.disconnect();
      state.socket = null;
    }
  }

  function applyTheme() {
    const isLight = localStorage.getItem("hq_theme") === "light";
    document.body.classList.toggle("light-mode", isLight);
    document.querySelector("#darkModeToggle i").className = isLight ? "fa-solid fa-sun" : "fa-solid fa-moon";
  }

  function switchView(view) {
    document.querySelectorAll(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.remove("active-view"));
    document.getElementById(`view-${view}`).classList.add("active-view");
    els.topbarTitle.textContent = viewTitles[view];
  }

  function hideRoleRestrictedNav() {
    const hiddenByRole = { patient: ["patients", "doctors"], doctor: ["doctors"], admin: ["appointments"] };
    document.querySelectorAll(".nav-link").forEach((button) => {
      button.classList.toggle("d-none", Boolean(hiddenByRole[state.user?.role]?.includes(button.dataset.view)));
    });
  }

  function renderSummaryCards(items) {
    els.summaryCards.innerHTML = items.map((item) => `<article class="metric-card"><span>${item.label}</span><strong>${item.value}</strong><p class="mb-0 muted">${item.help}</p></article>`).join("");
  }

  function renderChart(id, type, data) {
    const canvas = document.getElementById(id);
    if (!canvas || typeof Chart === "undefined") {
      return;
    }
    state.charts[id]?.destroy();
    state.charts[id] = new Chart(canvas, {
      type,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: getComputedStyle(document.body).getPropertyValue("--text") } } },
        scales: type === "line" || type === "bar" ? {
          y: { ticks: { color: getComputedStyle(document.body).getPropertyValue("--muted") }, grid: { color: "rgba(255,255,255,0.07)" } },
          x: { ticks: { color: getComputedStyle(document.body).getPropertyValue("--muted") }, grid: { display: false } },
        } : {},
      },
    });
  }

  function maybeNotifyNearTurn() {
    if (state.user?.role === "patient" && state.roleData?.activeAppointment?.patientsAhead <= 2) {
      toast(`Your turn is near for token ${state.roleData.activeAppointment.token}.`, "Patient Alert");
    }
  }

  function hydrateDoctorOptions() {
    const department = els.appointmentDepartment.value || "OPD";
    const doctors = state.doctors.filter((doctor) => doctor.department === department);
    els.appointmentDoctor.innerHTML = doctors.map((doctor) => `<option value="${doctor.id}">${doctor.name} · ${doctor.specialization}</option>`).join("");
  }

  function renderDashboard() {
    const host = document.getElementById("view-dashboard");

    if (state.user.role === "patient") {
      const active = state.roleData.activeAppointment;
      renderSummaryCards([
        { label: "Active Token", value: state.roleData.summary.activeToken, help: "Token-based appointment tracking" },
        { label: "Queue Position", value: state.roleData.summary.liveQueuePosition || "-", help: "Your current spot in queue" },
        { label: "Estimated Wait", value: `${state.roleData.summary.estimatedWaitMinutes} mins`, help: "Updated from the live queue" },
        { label: "Completed Visits", value: state.roleData.summary.completedVisits, help: "Appointment history records" },
      ]);

      host.innerHTML = `<div class="grid-two">
        <article class="panel-card">
          <header><div><h3 class="mb-1">Patient Overview</h3><p class="mb-0 muted">Book appointments and monitor your live token movement.</p></div><button class="btn btn-brand" id="openAppointmentModal">Book Appointment</button></header>
          ${active ? `<div class="list-item"><div class="list-item-row"><div><h4>${active.token}</h4><p class="mb-1 muted">${active.department} with ${active.doctorName}</p><p class="mb-0 muted">${formatDate(active.date)} | ${active.reason}</p></div><div class="text-end">${statusPill(active.status)}<div class="mt-2">${priorityPill(active.priority)}</div></div></div></div>` : `<div class="empty-state">No active queue item right now. You can book a new appointment anytime.</div>`}
          <div class="timeline">${state.roleData.notifications.map((note) => `<div class="timeline-item"><strong>${note.title}</strong><p class="mb-0 muted">${note.message}</p></div>`).join("")}</div>
        </article>
        <article class="panel-card chart-shell"><header><div><h3 class="mb-1">Appointment Trend</h3><p class="mb-0 muted">Your visit history by appointment status.</p></div></header><canvas id="patientHistoryChart"></canvas></article>
      </div>`;

      document.getElementById("openAppointmentModal")?.addEventListener("click", () => appointmentModal.show());
      renderChart("patientHistoryChart", "bar", {
        labels: ["Waiting", "In Progress", "Completed"],
        datasets: [{ label: "Appointments", data: [state.roleData.history.filter((item) => item.status === "waiting").length, state.roleData.history.filter((item) => item.status === "in-progress").length, state.roleData.history.filter((item) => item.status === "completed").length], backgroundColor: ["#ffb84d", "#1d9bf0", "#54d38a"], borderRadius: 12 }],
      });
      return;
    }

    if (state.user.role === "doctor") {
      renderSummaryCards([
        { label: "Assigned Today", value: state.roleData.summary.assignedToday, help: "Patients assigned to you today" },
        { label: "Waiting", value: state.roleData.summary.waitingCount, help: "Patients waiting in your queue" },
        { label: "In Progress", value: state.roleData.summary.inProgressCount, help: "Current consultation count" },
        { label: "Avg Wait", value: `${state.roleData.summary.averageWaitMinutes} mins`, help: "Average live wait estimate" },
      ]);

      host.innerHTML = `<div class="grid-two">
        <article class="panel-card">
          <header><div><h3 class="mb-1">Doctor Queue Control</h3><p class="mb-0 muted">Call the next patient and complete appointments in real time.</p></div><button class="btn btn-brand" id="callNextBtn">Call Next Patient</button></header>
          ${state.roleData.inProgress ? `<div class="list-item"><div class="list-item-row"><div><h4>${state.roleData.inProgress.patientName}</h4><p class="mb-1 muted">${state.roleData.inProgress.token} | ${state.roleData.inProgress.reason}</p><p class="mb-0 muted">${state.roleData.inProgress.department}</p></div><div class="action-row">${statusPill(state.roleData.inProgress.status)}<button class="btn btn-outline-light" data-complete-id="${state.roleData.inProgress.id}">Mark Completed</button></div></div></div>` : `<div class="empty-state">No patient is in progress. Use "Call Next Patient" to continue the queue.</div>`}
          <div class="list-group-custom">${state.roleData.queue.slice(0, 6).map((item) => `<div class="list-item"><div class="list-item-row"><div><strong>${item.patientName}</strong><p class="mb-0 muted">${item.token} | ${item.reason}</p></div><div class="action-row">${statusPill(item.status)}${priorityPill(item.priority)}</div></div></div>`).join("")}</div>
        </article>
        <article class="panel-card chart-shell"><header><h3 class="mb-0">Queue Status Mix</h3></header><canvas id="doctorQueueChart"></canvas></article>
      </div>`;

      document.getElementById("callNextBtn")?.addEventListener("click", callNextPatient);
      document.querySelector("[data-complete-id]")?.addEventListener("click", (event) => completeAppointment(event.target.dataset.completeId));
      renderChart("doctorQueueChart", "doughnut", {
        labels: ["Waiting", "In Progress", "Completed"],
        datasets: [{ data: [state.roleData.queue.filter((item) => item.status === "waiting").length, state.roleData.queue.filter((item) => item.status === "in-progress").length, state.roleData.queue.filter((item) => item.status === "completed").length], backgroundColor: ["#ffb84d", "#1d9bf0", "#54d38a"] }],
      });
      return;
    }

    renderSummaryCards([
      { label: "Daily Patients", value: state.roleData.summary.dailyPatients, help: "Today's total registrations and visits" },
      { label: "Active Waiting", value: state.roleData.summary.activeWaiting, help: "Patients currently waiting" },
      { label: "Completed Today", value: state.roleData.summary.completedToday, help: "Completed visits for today" },
      { label: "Avg Waiting Time", value: `${state.roleData.summary.averageWaitingTime} mins`, help: "Average wait across departments" },
    ]);

    host.innerHTML = `<div class="grid-two">
      <article class="panel-card chart-shell"><header><h3 class="mb-0">Department Load</h3></header><canvas id="adminDepartmentChart"></canvas></article>
      <article class="panel-card chart-shell"><header><h3 class="mb-0">Status Analytics</h3></header><canvas id="adminStatusChart"></canvas></article>
    </div>
    <article class="panel-card">
      <header><div><h3 class="mb-1">Recent Queue Activity</h3><p class="mb-0 muted">Track recent appointments and intervene when emergency cases arrive.</p></div></header>
      <div class="list-group-custom">${state.roleData.recentAppointments.map((item) => `<div class="list-item"><div class="list-item-row"><div><strong>${item.patientName}</strong><p class="mb-0 muted">${item.department} | ${item.doctorName} | ${item.token}</p></div><div class="action-row">${statusPill(item.status)}${priorityPill(item.priority)}</div></div></div>`).join("")}</div>
    </article>`;

    renderChart("adminDepartmentChart", "bar", {
      labels: state.roleData.charts.departmentLoad.map((item) => item.department),
      datasets: [{ label: "Total Patients", data: state.roleData.charts.departmentLoad.map((item) => item.total), backgroundColor: ["#4fd1c5", "#1d9bf0", "#54d38a"], borderRadius: 14 }],
    });
    renderChart("adminStatusChart", "pie", {
      labels: state.roleData.charts.statusMix.map((item) => item.label),
      datasets: [{ data: state.roleData.charts.statusMix.map((item) => item.value), backgroundColor: ["#ffb84d", "#1d9bf0", "#54d38a"] }],
    });
  }

  function renderPatientsView() {
    const host = document.getElementById("view-patients");
    if (state.user.role === "patient") {
      host.innerHTML = `<article class="panel-card"><header><h3 class="mb-0">Patient Notifications</h3></header><div class="timeline">${state.roleData.notifications.map((item) => `<div class="timeline-item"><strong>${item.title}</strong><p class="mb-0 muted">${item.message}</p></div>`).join("")}</div></article>`;
      return;
    }

    host.innerHTML = `<article class="panel-card">
      <header class="section-title"><div><h3 class="mb-1">Patients</h3><p class="mb-0 muted">Search and filter all registered patients.</p></div><input class="form-control" id="patientSearch" placeholder="Search by name, email, or phone"></header>
      <div class="table-shell"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Visits</th></tr></thead><tbody id="patientsTableBody"></tbody></table></div>
    </article>`;

    const renderRows = (items) => {
      document.getElementById("patientsTableBody").innerHTML = items.map((patient) => `<tr><td>${patient.name}</td><td>${patient.phone}</td><td>${patient.email}</td><td>${patient.appointmentCount}</td></tr>`).join("");
    };
    renderRows(state.patients);
    document.getElementById("patientSearch")?.addEventListener("input", async (event) => {
      state.patients = await api(`/api/admin/patients?search=${encodeURIComponent(event.target.value.trim())}`);
      renderRows(state.patients);
    });
  }

  function renderDoctorsView() {
    const host = document.getElementById("view-doctors");
    host.innerHTML = `<article class="panel-card">
      <header><div><h3 class="mb-1">Doctors</h3><p class="mb-0 muted">Manage doctors and view department assignments.</p></div>${state.user.role === "admin" ? '<button class="btn btn-brand" id="openDoctorModal">Add Doctor</button>' : ""}</header>
      <div class="table-shell"><table><thead><tr><th>Name</th><th>Department</th><th>Specialization</th><th>Experience</th><th>Contact</th>${state.user.role === "admin" ? "<th>Action</th>" : ""}</tr></thead><tbody>${state.doctors.map((doctor) => `<tr><td>${doctor.name}</td><td>${doctor.department}</td><td>${doctor.specialization}</td><td>${doctor.experience} yrs</td><td>${doctor.phone}</td>${state.user.role === "admin" ? `<td><button class="btn btn-sm btn-outline-danger" data-remove-doctor="${doctor.id}">Remove</button></td>` : ""}</tr>`).join("")}</tbody></table></div>
    </article>`;

    document.getElementById("openDoctorModal")?.addEventListener("click", () => doctorModal.show());
    document.querySelectorAll("[data-remove-doctor]").forEach((button) => button.addEventListener("click", async () => {
      await api(`/api/admin/doctors/${button.dataset.removeDoctor}`, { method: "DELETE" });
      toast("Doctor removed successfully.");
      await loadRoleData();
    }));
  }

  function renderQueueView() {
    const host = document.getElementById("view-queue");
    const queue = state.queue?.items || [];
    host.innerHTML = `<div class="grid-two">
      <article class="panel-card">
        <header><div><h3 class="mb-1">Live Queue</h3><p class="mb-0 muted">Real-time queue status with emergency prioritization.</p></div><div class="action-row"><span class="chip">Waiting: ${state.queue?.stats?.waiting || 0}</span><span class="chip">Emergency: ${state.queue?.stats?.emergency || 0}</span></div></header>
        <div class="list-group-custom">${queue.length ? queue.map((item) => `<div class="list-item"><div class="list-item-row"><div><strong>${item.token} · ${item.patientName}</strong><p class="mb-0 muted">${item.department} | ${item.doctorName} | ETA ${item.estimatedWaitMinutes} mins</p></div><div class="action-row">${statusPill(item.status)}${priorityPill(item.priority)}${state.user.role === "admin" ? `<button class="btn btn-sm btn-outline-warning" data-priority-id="${item.id}" data-priority-value="${item.priority === "emergency" ? "normal" : "emergency"}">Set ${item.priority === "emergency" ? "Normal" : "Emergency"}</button>` : ""}</div></div></div>`).join("") : '<div class="empty-state">No queue activity found for the selected department.</div>'}</div>
      </article>
      <article class="panel-card chart-shell"><header><h3 class="mb-0">Queue Position Analytics</h3></header><canvas id="queueChart"></canvas></article>
    </div>`;

    renderChart("queueChart", "line", {
      labels: queue.map((item) => item.token),
      datasets: [{ label: "Estimated Wait (mins)", data: queue.map((item) => item.estimatedWaitMinutes), borderColor: "#4fd1c5", backgroundColor: "rgba(79, 209, 197, 0.18)", fill: true, tension: 0.35 }],
    });
    document.querySelectorAll("[data-priority-id]").forEach((button) => button.addEventListener("click", async () => {
      await api(`/api/admin/appointments/${button.dataset.priorityId}/priority`, { method: "PATCH", body: JSON.stringify({ priority: button.dataset.priorityValue }) });
      toast(`Priority changed to ${button.dataset.priorityValue}.`);
      await loadRoleData();
    }));
  }

  function renderAppointmentsView() {
    const host = document.getElementById("view-appointments");
    const appointments = state.user.role === "patient" ? state.roleData.history : state.queue?.items || [];
    host.innerHTML = `<article class="panel-card">
      <header><div><h3 class="mb-1">${state.user.role === "patient" ? "Appointment History" : "Queue Appointments"}</h3><p class="mb-0 muted">Status tags, timing, and token details in one view.</p></div>${state.user.role === "patient" ? '<button class="btn btn-brand" id="bookFromHistory">Book New</button>' : ""}</header>
      <div class="table-shell"><table><thead><tr><th>Token</th><th>Patient / Doctor</th><th>Department</th><th>Schedule</th><th>Status</th></tr></thead><tbody>${appointments.map((item) => `<tr><td>${item.token}</td><td>${state.user.role === "patient" ? item.doctorName : item.patientName}</td><td>${item.department}</td><td>${formatDate(item.date)}</td><td>${statusPill(item.status)} ${priorityPill(item.priority)}</td></tr>`).join("")}</tbody></table></div>
    </article>`;
    document.getElementById("bookFromHistory")?.addEventListener("click", () => appointmentModal.show());
  }

  async function loadRoleData() {
    if (!state.user) return;
    showLoader(true);
    const departmentQuery = state.department ? `?department=${encodeURIComponent(state.department)}` : "";

    if (state.user.role === "patient") {
      const [dashboard, doctors, queue] = await Promise.all([api("/api/patients/dashboard"), api(`/api/patients/doctors${departmentQuery}`), api(`/api/queue/live${departmentQuery}`)]);
      state.roleData = dashboard;
      state.doctors = doctors;
      state.queue = queue;
    }
    if (state.user.role === "doctor") {
      const [dashboard, queue] = await Promise.all([api("/api/doctors/dashboard"), api(`/api/doctors/queue${departmentQuery}`)]);
      state.roleData = dashboard;
      state.queue = queue;
      state.doctors = [dashboard.doctor];
    }
    if (state.user.role === "admin") {
      const [dashboard, doctors, patients, queue] = await Promise.all([api("/api/admin/dashboard"), api(`/api/admin/doctors${departmentQuery}`), api("/api/admin/patients"), api(`/api/admin/queue${departmentQuery}`)]);
      state.roleData = dashboard;
      state.doctors = doctors;
      state.patients = patients;
      state.queue = queue;
    }

    renderDashboard();
    renderPatientsView();
    renderDoctorsView();
    renderQueueView();
    renderAppointmentsView();
    hydrateDoctorOptions();
    maybeNotifyNearTurn();
    showLoader(false);
  }

  async function callNextPatient() {
    const data = await api("/api/doctors/queue/next", { method: "POST" });
    toast(data.message, "Doctor Queue");
    await loadRoleData();
  }

  async function completeAppointment(id) {
    const data = await api(`/api/doctors/appointments/${id}/complete`, { method: "PATCH" });
    toast(data.message, "Doctor Queue");
    await loadRoleData();
  }

  async function handleLogin(event) {
    event.preventDefault();
    showLoader(true);
    try {
      const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.target).entries())) });
      setSession(data.token, data.user);
      await initAppShell();
      toast(data.message, "Welcome");
    } catch (error) {
      toast(error.message, "Login Failed");
      showLoader(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    showLoader(true);
    try {
      const data = await api("/api/auth/register", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.target).entries())) });
      setSession(data.token, data.user);
      await initAppShell();
      toast(data.message, "Registration Successful");
    } catch (error) {
      toast(error.message, "Registration Failed");
      showLoader(false);
    }
  }

  async function handleBookAppointment(event) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.target).entries());
    payload.channels = ["SMS", "WhatsApp"];
    const data = await api("/api/patients/appointments", { method: "POST", body: JSON.stringify(payload) });
    toast(`${data.message} Estimated wait: ${data.queue.estimatedWaitMinutes} mins.`, "Appointment Confirmed");
    appointmentModal.hide();
    event.target.reset();
    hydrateDoctorOptions();
    await loadRoleData();
  }

  async function handleCreateDoctor(event) {
    event.preventDefault();
    const data = await api("/api/admin/doctors", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.target).entries())) });
    toast(data.message, "Admin");
    doctorModal.hide();
    event.target.reset();
    await loadRoleData();
  }

  function initSocket() {
    if (!window.io || state.socket) return;
    // Connect socket to the specific Render backend URL
    state.socket = window.io(window.API_BASE);
    state.socket.on("connect", () => state.department && state.socket.emit("queue:join-department", state.department));
    state.socket.on("queue:updated", async () => state.user && loadRoleData());
  }

  async function initAppShell() {
    els.authView.classList.add("d-none");
    els.appShell.classList.remove("d-none");
    els.sidebarUserName.textContent = state.user.name;
    els.sidebarUserMeta.textContent = `${state.user.role.toUpperCase()} · ${state.user.department || "Patient Portal"}`;
    els.roleBadgeText.textContent = state.user.role.toUpperCase();
    hideRoleRestrictedNav();
    switchView("dashboard");
    initSocket();
    await loadRoleData();
  }

  function initEvents() {
    appointmentModal = new bootstrap.Modal(document.getElementById("appointmentModal"));
    doctorModal = new bootstrap.Modal(document.getElementById("doctorModal"));
    document.querySelectorAll("[data-auth-tab]").forEach((button) => button.addEventListener("click", () => {
      document.querySelectorAll("[data-auth-tab]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      const register = button.dataset.authTab === "register";
      els.registerForm.classList.toggle("d-none", !register);
      els.loginForm.classList.toggle("d-none", register);
    }));
    document.querySelectorAll(".nav-link").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
    document.getElementById("logoutBtn").addEventListener("click", () => { clearSession(); location.reload(); });
    document.getElementById("darkModeToggle").addEventListener("click", () => {
      localStorage.setItem("hq_theme", document.body.classList.contains("light-mode") ? "dark" : "light");
      applyTheme();
      state.user && (renderDashboard(), renderQueueView());
    });
    els.departmentFilter.addEventListener("change", async (event) => {
      state.department = event.target.value;
      state.socket && state.socket.emit("queue:join-department", state.department);
      state.user && await loadRoleData();
    });
    els.appointmentDepartment.addEventListener("change", hydrateDoctorOptions);
    els.loginForm.addEventListener("submit", handleLogin);
    els.registerForm.addEventListener("submit", handleRegister);
    els.appointmentForm.addEventListener("submit", handleBookAppointment);
    els.doctorForm.addEventListener("submit", handleCreateDoctor);
  }

  function bootstrapApp() {
    applyTheme();
    initEvents();
    if (state.user && state.token) {
      initAppShell();
    } else {
      showLoader(false);
    }
  }

  bootstrapApp();
})();
