// dashboard.js - Client-side logic for redesigned patient dashboard
(function(){
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user || user.role !== 'patient') {
    alert('Access denied');
    window.location.href = '../patient/login.html';
  }

  // DOM refs
  const sidebarUser = document.getElementById('sidebarUserName');
  const userAvatar = document.getElementById('userAvatar');
  const nextDoctor = document.getElementById('nextDoctor');
  const nextSpec = document.getElementById('nextSpec');
  const nextDateTime = document.getElementById('nextDateTime');
  const apptTag = document.getElementById('apptTag');
  const currentToken = document.getElementById('currentToken');
  const patientsAhead = document.getElementById('patientsAhead');
  const etaEl = document.getElementById('eta');
  const queueMini = document.getElementById('queueMini');
  const queueTracker = document.getElementById('queueTracker');
  const trackerSteps = document.getElementById('trackerSteps');
  const yourToken = document.getElementById('yourToken');
  const servingToken = document.getElementById('servingToken');
  const upcomingContainer = document.getElementById('upcomingContainer');
  const pastContainer = document.getElementById('pastContainer');
  const medsList = document.getElementById('medsList');
  const reportsList = document.getElementById('reportsList');
  const recordsList = document.getElementById('recordsList');
  const notificationsList = document.getElementById('notificationsList');
  const notificationCount = document.getElementById('notificationCount');
  const doctorsList = document.getElementById('doctorsList');
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const mobileSidebarBackdrop = document.getElementById('mobileSidebarBackdrop');
  const sidebar = document.querySelector('.sidebar');
  const chatbotShell = document.getElementById('chatbotShell');
  const chatbotToggle = document.getElementById('chatbotToggle');
  const chatbotWindow = document.getElementById('chatbotWindow');
  const chatbotClose = document.getElementById('chatbotClose');
  const chatbotMessages = document.getElementById('chatbotMessages');
  const chatbotQuickReplies = document.getElementById('chatbotQuickReplies');
  const chatbotTyping = document.getElementById('chatbotTyping');
  const chatbotInput = document.getElementById('chatbotInput');
  const chatbotSend = document.getElementById('chatbotSend');
  const API_BASE = window.API_BASE + '/api';

  let appointments = [];
  let records = [];
  let notifications = [];
  let medicines = [];
  let allDoctors = [];
  let selectedDoctor = null;
  let healthChart = null;
  let chatbotOpen = false;
  let chatbotConversation = [];
  let upcomingAppointmentSummary = null;
  let liveQueueSummary = null;
  let todaysMedicines = [];
  let pendingReportsSummary = { count: 0, reports: [] };
  let summaryErrors = {
    upcoming: false,
    queue: false,
    medicines: false,
    reports: false
  };
  const recordsViewState = {
    search: '',
    status: 'all',
    sort: 'latest',
    page: 1,
    perPage: 6
  };

  function getPatientId(){
    return user?._id || user?.id || user?.patientId || '';
  }

  function normalizeAppointmentStatusValue(status){
    const value = String(status || '').toLowerCase();
    if (value.includes('cancel') || value.includes('reject')) return 'rejected';
    if (value.includes('complete') || value.includes('done')) return 'completed';
    if (value.includes('approve') || value.includes('confirm') || value.includes('in-progress')) return 'approved';
    return 'pending';
  }

  function normalizeAppointmentRecord(appointment, index = 0){
    return {
      ...appointment,
      _id: appointment._id || appointment.id || appointment.appointmentId || `local-${index}`,
      appointmentId: appointment.appointmentId || appointment.id || appointment._id || `local-${index}`,
      patientId: appointment.patientId || getPatientId(),
      token: appointment.token || appointment.tokenNumber || appointment.queueToken || appointment.token || `#${index + 1}`,
      status: normalizeAppointmentStatusValue(appointment.status),
      date: appointment.date || appointment.appointmentDate || new Date().toISOString()
    };
  }

  function mergeLocalAppointments(apiAppointments){
    const localAppts = JSON.parse(localStorage.getItem('appointments') || '[]');
    if (!localAppts.length) {
      return apiAppointments;
    }

    const merged = new Map();
    apiAppointments.forEach((appointment, index) => {
      const normalized = normalizeAppointmentRecord(appointment, index);
      merged.set(String(normalized._id), normalized);
    });

    localAppts.forEach((appointment, index) => {
      const normalized = normalizeAppointmentRecord(appointment, index + apiAppointments.length);
      const key = String(normalized._id);
      if (!merged.has(key)) {
        merged.set(key, normalized);
      }
    });

    return [...merged.values()];
  }

  function safeText(el, text){ if(el) el.textContent = text }

  function escapeHtml(value){
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeQueueToken(value, fallbackNumber = 1){
    const raw = String(value || '').trim();
    return raw || `#${fallbackNumber}`;
  }

  function buildQueueTimeline(queueData){
    if (Array.isArray(queueData?.timelineTokens) && queueData.timelineTokens.length) {
      const initialTimeline = queueData.timelineTokens.map((item, index) => ({
        token: normalizeQueueToken(item?.token, index + 1),
        isServing: Boolean(item?.isServing),
        isPatient: Boolean(item?.isPatient)
      }));

      const lastToken = initialTimeline[initialTimeline.length - 1]?.token || '#1';
      const tokenMatch = lastToken.match(/(\D*)(\d+)/);
      const tokenPrefix = tokenMatch?.[1] || '#';
      const numericWidth = tokenMatch?.[2]?.length || 1;
      let nextNumber = (Number.parseInt(tokenMatch?.[2] || String(initialTimeline.length), 10) || initialTimeline.length) + 1;

      while (initialTimeline.length < 10) {
        initialTimeline.push({
          token: `${tokenPrefix}${String(nextNumber).padStart(numericWidth, '0')}`,
          isServing: false,
          isPatient: false
        });
        nextNumber += 1;
      }

      return initialTimeline;
    }

    const servingTokenValue = normalizeQueueToken(
      queueData?.nowServingToken || queueData?.currentToken || queueData?.tokenNumber,
      1
    );
    const patientTokenValue = normalizeQueueToken(queueData?.yourToken || queueData?.tokenNumber, 1);
    const tokenMatch = patientTokenValue.match(/(\D*)(\d+)/);
    const tokenPrefix = tokenMatch?.[1] || '#';
    const patientNumber = Number.parseInt(tokenMatch?.[2] || '1', 10) || 1;
    const baseNumber = Math.max(1, patientNumber - 1);
    const timeline = [];

    for(let step = 0; step < 6; step += 1){
      const numericToken = `${tokenPrefix}${String(baseNumber + step).padStart(tokenMatch?.[2]?.length || 1, '0')}`;
      timeline.push({
        token: numericToken,
        isServing: numericToken === servingTokenValue,
        isPatient: numericToken === patientTokenValue
      });
    }

    if (!timeline.some((item) => item.token === servingTokenValue)) {
      timeline[0] = { token: servingTokenValue, isServing: true, isPatient: servingTokenValue === patientTokenValue };
    }
    if (!timeline.some((item) => item.token === patientTokenValue)) {
      timeline[Math.min(timeline.length - 1, Math.max(0, queueData?.patientsAhead || 0))] = {
        token: patientTokenValue,
        isServing: patientTokenValue === servingTokenValue,
        isPatient: true
      };
    }

    return timeline;
  }

  // Global handler function for appointment clicks
  function handleAppointmentClick(element, event) {
    event.preventDefault();
    event.stopPropagation();
    const appointmentId = element.getAttribute('data-appointment-id');
    console.log('🔍 Clicked appointment:', appointmentId);
    showAppointmentDetail(appointmentId);
  }

  // Make it globally accessible
  window.handleAppointmentClick = handleAppointmentClick;

  function init(){
    mountChatbotToViewport();
    sidebarUser.textContent = user.name || 'Patient';
    userAvatar.textContent = (user.name||'S').slice(0,1).toUpperCase();
    attachHandlers();
    initChatbot();
    loadData();
    setInterval(refreshPatientDashboardData, 10000);
  }

  function attachHandlers(){
    setupResponsiveNav();
    document.getElementById('actBook')?.addEventListener('click', showBookAppointmentModal);
    document.getElementById('actRecords')?.addEventListener('click', showAllRecords);
    document.getElementById('actPrecaution')?.addEventListener('click', showPrecautions);
    document.getElementById('actOrder')?.addEventListener('click', ()=>{ alert('Order medicines - flow coming soon') });
    document.getElementById('actEmergency')?.addEventListener('click', ()=>{ alert('Calling emergency help...') });
    document.getElementById('rescheduleBtn')?.addEventListener('click', ()=>{ handleSummaryReschedule(); });
    document.getElementById('joinBtn')?.addEventListener('click', ()=>{ alert('Joining video call...') });
    document.getElementById('viewAllAppts')?.addEventListener('click', (e)=>{ e.preventDefault(); showAppointmentHistory(); });
    document.getElementById('viewAllRecordsLink')?.addEventListener('click', (e)=>{ e.preventDefault(); showAllRecords(); });
    userAvatar?.addEventListener('click', ()=>{ window.location.href = 'profile.html'; });
    userAvatar?.classList.add('clickable-avatar');
    
    // Add handlers for appointment history filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', ()=>{
        document.querySelectorAll('.filter-tab').forEach(t => {
          t.style.background = 'white';
          t.style.color = '#64748b';
          t.style.borderColor = '#e2e8f0';
          t.style.borderWidth = '2px';
        });
        const filter = tab.getAttribute('data-filter');
        setAppointmentHistoryTabStyles(filter);
        renderAppointmentHistory(filter);
      });
    });
    
    // Add handlers for sidebar navigation
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.getAttribute('data-section');
        closeResponsiveNav();
        
        // Update active nav item
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(navItem => navItem.classList.remove('active'));
        item.classList.add('active');
        
        // Handle section views
        if(section === 'doctors') {
          showDoctorsList();
        } else if(section === 'appointments') {
          showAppointmentHistory();
        } else if(section === 'records') {
          showAllRecords();
        } else if(section === 'profile') {
          window.location.href = 'profile.html';
        } else if(section === 'dashboard') {
          // Show main dashboard view
          document.querySelector('.layout-grid').style.display = 'grid';
        }
      });
    });
  }

  async function loadData(){
    const patientId = getPatientId();
    renderSummaryLoaders();
    await loadPatientAppointments();

    if (patientId) {
      try{
        const r = await fetch(`${API_BASE}/records/patient/${patientId}`);
        if(r.ok) records = await r.json(); else records = [];
      }catch(e){ records = [] }
    } else {
      records = [];
    }

    // Load all doctors for booking
    await loadAllDoctors();

    // notifications & meds (demo/synthesized if not from server)
    notifications = [
      {id:1, text:'Take Vitamin D3 1000 IU now', time:'10 mins ago', type:'med'},
      {id:2, text:'Your blood test report is ready to download', time:'20 mins ago', type:'report'}
    ];

    medicines = [
      {id:1, name:'Aspirin 100mg', time:'Morning', dosage:'1 tablet'},
      {id:2, name:'Metformin 500mg', time:'Morning & Evening', dosage:'1 tablet'},
      {id:3, name:'Vitamin D3 1000 IU', time:'Evening', dosage:'1 capsule'}
    ];

    await loadDashboardSummaryCards();
    renderAll();
  }

  async function loadPatientAppointments(){
    const patientId = getPatientId();
    if (!patientId) {
      appointments = mergeLocalAppointments([]);
      return;
    }

    try{
      const res = await fetch(`${API_BASE}/appointments/patient/${patientId}`);
      const data = res.ok ? await res.json() : [];
      appointments = mergeLocalAppointments(Array.isArray(data) ? data : []).map((appointment, index) => normalizeAppointmentRecord(appointment, index));
    }catch(e){
      appointments = mergeLocalAppointments([]).map((appointment, index) => normalizeAppointmentRecord(appointment, index));
    }
  }

  async function loadAllDoctors(){
    try{
      const res = await fetch(`${API_BASE}/doctors`);
      if(res.ok) {
        allDoctors = await res.json();
        console.log('✅ Doctors loaded from API:', allDoctors.length, 'doctors');
      } else {
        console.warn('⚠️ API returned status:', res.status);
        allDoctors = [];
      }
    }catch(e){ 
      console.error('❌ Error fetching doctors:', e);
      allDoctors = [];
    }

    // Demo doctors if empty
    if(allDoctors.length === 0){
      console.log('ℹ️ Using demo doctors (no doctors in database yet)');
      allDoctors = [
        {_id:'doc1', name:'Dr. Rajesh Kumar', specialization:'General Physician', experience:'12 years', hospital:'City Medical Center'},
        {_id:'doc2', name:'Dr. Priya Singh', specialization:'Cardiologist', experience:'8 years', hospital:'Heart Care Hospital'},
        {_id:'doc3', name:'Dr. Amit Patel', specialization:'Orthopedic Surgeon', experience:'15 years', hospital:'Bone & Joint Clinic'},
        {_id:'doc4', name:'Dr. Sneha Desai', specialization:'Pediatrician', experience:'10 years', hospital:'Kids Health Center'},
        {_id:'doc5', name:'Dr. Vikram Sharma', specialization:'Neurologist', experience:'11 years', hospital:'Brain & Spine Institute'}
      ];
    }
  }

  function renderAll(){
    renderNextAppointment();
    renderRecords();
    renderAppointments();
    renderMedicines();
    renderPendingReports();
    renderHealthSummary();
    renderNotifications();
  }

  function renderSummaryLoaders(){
    safeText(nextDoctor, 'Loading...');
    safeText(nextSpec, 'Fetching appointment');
    safeText(nextDateTime, 'Please wait');
    apptTag.textContent = '...';
    apptTag.className = 'badge bg-secondary float-end';

    safeText(currentToken, '#--');
    safeText(patientsAhead, 'Loading queue...');
    safeText(etaEl, 'Estimating wait...');
    if(queueMini) queueMini.innerHTML = '<div class="text-muted small">Loading queue status...</div>';

    medsList.innerHTML = '<div class="text-muted text-center py-2"><i class="fas fa-spinner fa-spin me-2"></i>Loading medicines...</div>';
    reportsList.innerHTML = '<div class="text-muted text-center py-2"><i class="fas fa-spinner fa-spin me-2"></i>Loading reports...</div>';
  }

  async function loadDashboardSummaryCards(){
    const patientId = getPatientId();
    const querySuffix = patientId ? `?patientId=${encodeURIComponent(patientId)}` : '';
    const upcomingRequest = fetchJSON(`${API_BASE}/appointments/upcoming${querySuffix}`);
    const queueRequest = fetchJSON(`${API_BASE}/queue/status${querySuffix}`)
      .then((data) => {
        liveQueueSummary = data;
        summaryErrors.queue = false;
        renderLiveQueue();
        return data;
      })
      .catch((error) => {
        console.error('[Dashboard API] Queue early fallback applied:', error.message);
        liveQueueSummary = getFallbackQueueStatus();
        summaryErrors.queue = false;
        renderLiveQueue();
        return liveQueueSummary;
      });
    const medicinesRequest = fetchJSON(`${API_BASE}/medicines/today${querySuffix}`);
    const reportsRequest = fetchJSON(`${API_BASE}/reports/pending${querySuffix}`);

    const requests = await Promise.allSettled([
      upcomingRequest,
      queueRequest,
      medicinesRequest,
      reportsRequest
    ]);

    upcomingAppointmentSummary = requests[0].status === 'fulfilled'
      ? requests[0].value
      : getFallbackUpcomingAppointment();
    liveQueueSummary = requests[1].status === 'fulfilled' && hasUsableQueueSummary(requests[1].value)
      ? requests[1].value
      : getFallbackQueueStatus();
    todaysMedicines = requests[2].status === 'fulfilled' && Array.isArray(requests[2].value) && requests[2].value.length
      ? requests[2].value
      : getFallbackMedicines();
    pendingReportsSummary = requests[3].status === 'fulfilled' && requests[3].value
      ? requests[3].value
      : getFallbackReportsSummary();

    summaryErrors = {
      upcoming: false,
      queue: false,
      medicines: false,
      reports: false
    };
  }

  function renderNextAppointmentError(){
    safeText(nextDoctor, 'Unable to load');
    safeText(nextSpec, 'Appointment service unavailable');
    safeText(nextDateTime, 'Try again later');
    apptTag.textContent = 'Error';
    apptTag.className = 'badge bg-danger float-end';
  }

  function renderLiveQueueError(){
    safeText(currentToken, '#--');
    safeText(patientsAhead, 'Queue unavailable');
    safeText(etaEl, 'Try again later');
    if(queueMini) queueMini.innerHTML = '<div class="text-danger small">Unable to load live queue.</div>';
    if(queueTracker) {
      queueTracker.innerHTML = `
        <div class="queue-tracker-empty">
          <i class="fas fa-wave-square"></i>
          <h4>Live queue unavailable</h4>
          <p>We could not fetch the current queue status right now.</p>
        </div>
      `;
    } else if(trackerSteps) {
      trackerSteps.innerHTML = '<div class="text-danger small">Unable to load queue steps.</div>';
    }
  }

  function renderMedicinesError(){
    medsList.innerHTML = '<div class="text-danger text-center py-2"><i class="fas fa-circle-exclamation me-2"></i>Unable to load medicines</div>';
  }

  function renderPendingReportsError(){
    reportsList.innerHTML = '<div class="text-danger text-center py-2"><i class="fas fa-circle-exclamation me-2"></i>Unable to load reports</div>';
  }

  function getFallbackUpcomingAppointment(){
    const now = new Date();
    const upcoming = appointments
      .map((appointment) => ({ ...appointment, parsedDate: new Date(appointment.date || appointment.appointmentDate || Date.now()) }))
      .filter((appointment) => appointment.parsedDate >= now)
      .sort((a, b) => a.parsedDate - b.parsedDate)[0];

    if (upcoming) {
      return {
        id: upcoming._id || upcoming.appointmentId || null,
        doctorName: upcoming.doctorName || 'Doctor',
        department: upcoming.department || upcoming.specialization || 'General',
        dateTime: upcoming.parsedDate,
        status: upcoming.status || 'pending'
      };
    }

    return null;
  }

  function getFallbackQueueStatus(){
    const activeStatuses = ['waiting', 'in-progress', 'pending', 'approved', 'scheduled'];
    const activeAppointment = appointments.find((appointment) => {
      const status = String(appointment.status || '').toLowerCase();
      return activeStatuses.includes(status);
    });

    if (!activeAppointment) {
      return {
        tokenNumber: '#1',
        yourToken: '#1',
        nowServingToken: '#1',
        patientsAhead: 0,
        estimatedWaitingTime: 0,
        timelineTokens: [{ token: '#1', isServing: true, isPatient: true }]
      };
    }

    const sameDoctorQueue = appointments
      .filter((appointment) => String(appointment.doctorId || '') === String(activeAppointment.doctorId || ''))
      .filter((appointment) => activeStatuses.includes(String(appointment.status || '').toLowerCase()));
    const activeIndex = Math.max(0, sameDoctorQueue.findIndex((appointment) => appointment === activeAppointment));
    const servingAppointment = sameDoctorQueue.find((appointment) => String(appointment.status || '').toLowerCase() === 'in-progress') || sameDoctorQueue[0] || activeAppointment;

    return {
      tokenNumber: normalizeQueueToken(activeAppointment.token || activeAppointment.queueToken || activeAppointment.tokenNumber, activeIndex + 1),
      yourToken: normalizeQueueToken(activeAppointment.token || activeAppointment.queueToken || activeAppointment.tokenNumber, activeIndex + 1),
      nowServingToken: normalizeQueueToken(servingAppointment.token || servingAppointment.queueToken || servingAppointment.tokenNumber, 1),
      patientsAhead: activeIndex,
      estimatedWaitingTime: activeIndex * 10,
      timelineTokens: sameDoctorQueue.map((appointment, index) => ({
        token: normalizeQueueToken(appointment.token || appointment.queueToken || appointment.tokenNumber, index + 1),
        isServing: appointment === servingAppointment,
        isPatient: appointment === activeAppointment
      }))
    };
  }

  function getFallbackMedicines(){
    return medicines.length ? medicines : [
      { name:'Aspirin 100mg', time:'Morning', dosage:'1 tablet' },
      { name:'Metformin 500mg', time:'Morning & Evening', dosage:'1 tablet' },
      { name:'Vitamin D3 1000 IU', time:'Evening', dosage:'1 capsule' }
    ];
  }

  function getFallbackReportsSummary(){
    const reportItems = records
      .filter((record) => record.pending || record.status === 'pending_review' || record.status === 'draft')
      .slice(0, 3)
      .map((record, index) => ({
        id: record._id || record.id || `report-${index}`,
        title: record.diagnosis || record.title || record.visitType || 'Pending Report',
        status: record.status || 'pending_review'
      }));

    return {
      count: reportItems.length,
      reports: reportItems
    };
  }

  function normalizeQueueSummary(queueData){
    const source = queueData && typeof queueData === 'object' ? queueData : {};
    const yourTokenValue = normalizeQueueToken(
      source.yourToken || source.tokenNumber || source.token || source.queueToken,
      1
    );
    const nowServingValue = normalizeQueueToken(
      source.nowServingToken || source.currentToken || source.servingToken || source.activeToken || source.tokenNumber,
      1
    );
    const aheadCount = Number(source.patientsAhead ?? source.positionAhead ?? source.queueAhead ?? 0) || 0;
    const waitMinutes = Number(source.estimatedWaitingTime ?? source.estimatedWaitMinutes ?? source.waitMinutes ?? 0) || 0;
    const timelineTokens = Array.isArray(source.timelineTokens) && source.timelineTokens.length
      ? source.timelineTokens
      : Array.isArray(source.queue)
        ? source.queue.map((item, index) => ({
            token: normalizeQueueToken(item?.token || item?.queueToken || item?.tokenNumber, index + 1),
            isServing: Boolean(item?.isServing),
            isPatient: Boolean(item?.isPatient)
          }))
        : [];

    return {
      ...source,
      yourToken: yourTokenValue,
      tokenNumber: yourTokenValue,
      nowServingToken: nowServingValue,
      patientsAhead: aheadCount,
      estimatedWaitingTime: waitMinutes,
      timelineTokens
    };
  }

  function hasUsableQueueSummary(queueData){
    if (!queueData || typeof queueData !== 'object') return false;
    return Boolean(
      queueData.yourToken ||
      queueData.tokenNumber ||
      queueData.nowServingToken ||
      queueData.currentToken ||
      (Array.isArray(queueData.timelineTokens) && queueData.timelineTokens.length)
    );
  }

  function renderNextAppointment(){
    if (summaryErrors.upcoming) {
      renderNextAppointmentError();
      return;
    }

    const next = upcomingAppointmentSummary;
    if(next){
      const nextDate = new Date(next.dateTime || next.date || Date.now());
      safeText(nextDoctor, next.doctorName || 'Doctor');
      safeText(nextSpec, next.department || next.specialization || 'General');
      safeText(nextDateTime, nextDate.toLocaleString('en-IN'));
      
      // Check if appointment is today, tomorrow, or later
      if(isToday(nextDate)) {
        apptTag.textContent = 'Today';
        apptTag.className = 'badge bg-danger float-end';
      } else if(isToday(new Date(nextDate.getTime() - 24*60*60*1000))) {
        apptTag.textContent = 'Tomorrow';
        apptTag.className = 'badge bg-warning float-end';
      } else {
        apptTag.textContent = nextDate.toLocaleDateString('en-IN');
        apptTag.className = 'badge bg-success float-end';
      }
    } else {
      safeText(nextDoctor, 'No upcoming');
      safeText(nextSpec, 'appointments');
      safeText(nextDateTime, 'No upcoming appointments');
      apptTag.textContent = 'Free';
      apptTag.className = 'badge bg-secondary float-end';
    }
  }

  function isToday(d){ const t=new Date(); return d.toDateString()===t.toDateString() }

  function renderRecords(){
    const historyItems = getPatientHistoryItems();

    // Sidebar medical records - show summary with view button
    recordsList.innerHTML = `
      <div style="text-align: center; padding: 1rem; color: #64748b;">
        <i class="fas fa-file-medical" style="font-size: 32px; color: #cbd5e1; margin-bottom: 0.5rem; display: block;"></i>
        <p style="margin: 0.5rem 0;">${historyItems.length} history item${historyItems.length === 1 ? '' : 's'} available</p>
        <button type="button" class="btn btn-sm btn-primary" onclick="showAllRecords()" style="width: 100%; margin-top: 0.5rem;">
          <i class="fas fa-eye" style="margin-right: 4px;"></i>View All Records
        </button>
      </div>
    `;

  }

  function renderMedicines(){
    if (summaryErrors.medicines) {
      renderMedicinesError();
      return;
    }

    medsList.innerHTML = todaysMedicines.slice(0,3).map((m,idx)=> {
      const colors = ['#f59e0b','#10b981','#3b82f6'];
      const icons = ['fa-pills','fa-capsules','fa-droplet'];
      const color = colors[idx % colors.length];
      const icon = icons[idx % icons.length];
      return `<div style="padding:10px; border-left:4px solid ${color}; border-radius:8px; margin-bottom:8px; background:linear-gradient(90deg,rgba(${color.slice(1,7)},0.08),transparent)"><div style="display:flex; align-items:center; gap:8px"><i class="fas ${icon}" style="color:${color}; font-size:16px"></i><strong>${m.name}</strong></div><div class="small text-muted" style="margin-left:24px">${m.time} - ${m.dosage}</div></div>`
    }).join('') || '<div class="empty">No medicines for today</div>';
  }

  function renderPendingReports(){
    if (summaryErrors.reports) {
      renderPendingReportsError();
      return;
    }

    const pendingReports = pendingReportsSummary?.reports || [];
    if (!pendingReportsSummary || pendingReportsSummary.count === 0) {
      reportsList.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:1rem;"><i class="fas fa-check-circle" style="margin-right:6px;"></i>All reports reviewed</div>';
      return;
    }

    reportsList.innerHTML = `
      <div style="padding:10px; border-left:4px solid #f59e0b; border-radius:8px; margin-bottom:10px; background:#fffbeb;">
        <div style="font-weight:700; color:#92400e;">${pendingReportsSummary.count} pending report${pendingReportsSummary.count === 1 ? '' : 's'}</div>
        <div style="font-size:0.85rem; color:#b45309; margin-top:4px;">Needs doctor review</div>
      </div>
      ${pendingReports.slice(0,2).map((report) => `
        <div style="padding:10px; border-left:4px solid #cbd5e1; border-radius:8px; margin-bottom:8px; background:#fff;">
          <div style="font-weight:600; color:#334155; font-size:0.9rem;">${report.title || 'Pending Report'}</div>
          <div style="font-size:0.8rem; color:#64748b; margin-top:4px;">
            <i class="fas fa-clock" style="margin-right:4px;"></i>${report.status === 'draft' ? 'Draft' : 'Pending Review'}
          </div>
        </div>
      `).join('')}
    `;
  }

  function renderAppointments(){
    // Helper function to parse appointment date
    const parseApptDate = (dateStr) => {
      // Handle YYYY-MM-DDTHH:MM format or ISO format
      if(!dateStr) return new Date();
      try {
        return new Date(dateStr);
      } catch(e) {
        return new Date();
      }
    };

    const now = new Date();
    const future = appointments.filter(a => {
      const apptDate = parseApptDate(a.date);
      return apptDate >= now;
    }).sort((a, b) => {
      const dateA = parseApptDate(a.date);
      const dateB = parseApptDate(b.date);
      return dateA - dateB;
    }).slice(0,3);

    upcomingContainer.innerHTML = (future.length > 0 ? '<h5 style="color:#10b981; margin-bottom:16px; font-weight:700;">📅 Upcoming Appointments</h5>' : '') + future.map((a, idx)=> {
      const status = a.status || 'Scheduled';
      const apptDate = parseApptDate(a.date);
      const dateStr = apptDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
      const timeStr = apptDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const appointmentId = 'appointment_' + (a._id || a.appointmentId || idx);
      
      return `
        <div class="appointment-card appointment-upcoming" style="border-left:5px solid #10b981; background:linear-gradient(135deg, #ecfdf550, #f0fdf450); cursor:pointer; position:relative;" data-appointment-id="${appointmentId}" onclick="handleAppointmentClick(this, event)">
          <div class="appointment-click-overlay" style="position:absolute; top:0; right:0; padding:12px; opacity:0; transition:opacity 0.3s ease;">
            <i class="fas fa-arrow-right" style="color:#10b981; font-size:1.2rem;"></i>
          </div>
          <div class="appointment-header">
            <div>
              <strong style="font-size:1.1rem; color:#10b981;">${a.doctorName||'Doctor'}</strong>
              <div class="small text-muted" style="font-size:0.9rem;">${a.specialization||'Medical Professional'}</div>
              ${a.hospital ? `<div class="small text-muted" style="font-size:0.85rem; margin-top:2px;"><i class="fas fa-hospital"></i> ${a.hospital}</div>` : ''}
            </div>
            <div style="margin-left:auto; text-align:right;">
              <span class="status-badge" style="background:linear-gradient(135deg, #10b981, #059669); color:white; padding:6px 14px; border-radius:20px; font-size:0.85rem; font-weight:600; display:inline-block;">${status}</span>
            </div>
          </div>
          <div class="appointment-details" style="margin-top:12px; background:white; padding:12px; border-radius:8px; border:1px solid #e5e7eb;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:0.9rem;">
              <div><i class="fas fa-calendar" style="color:#10b981; margin-right:6px; width:16px;"></i><strong>Date:</strong> ${dateStr}</div>
              <div><i class="fas fa-clock" style="color:#10b981; margin-right:6px; width:16px;"></i><strong>Time:</strong> ${timeStr}</div>
              ${a.reason ? `<div style="grid-column:1/3;"><i class="fas fa-stethoscope" style="color:#10b981; margin-right:6px; width:16px;"></i><strong>Reason:</strong> ${a.reason}</div>` : ''}
              ${a.notes ? `<div style="grid-column:1/3;"><i class="fas fa-clipboard" style="color:#10b981; margin-right:6px; width:16px;"></i><strong>Notes:</strong> ${a.notes}</div>` : ''}
              ${a.appointmentId ? `<div style="grid-column:1/3; font-size:0.85rem; color:#9ca3af;"><i class="fas fa-hashtag" style="margin-right:4px;"></i><strong>Appointment ID:</strong> ${a.appointmentId}</div>` : ''}
            </div>
          </div>
          <div class="mt-3" style="display:flex; gap:8px;">
            <button class="btn btn-sm btn-outline-primary" style="flex:1; font-size:0.9rem;" onclick="event.stopPropagation();"><i class="fas fa-edit"></i> Reschedule</button>
            <button class="btn btn-sm btn-success" style="flex:1; font-size:0.9rem;" onclick="event.stopPropagation();"><i class="fas fa-video"></i> Join Call</button>
          </div>
        </div>
      `;
    }).join('') || '<div class="no-data show"><h4>📅 No upcoming appointments</h4><p>Book your first appointment now!</p></div>';

    // Add hover effects to cards
    setTimeout(() => {
      document.querySelectorAll('.appointment-upcoming[data-appointment-id]').forEach(card => {
        card.addEventListener('mouseenter', function() {
          this.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.15)';
          this.style.transform = 'translateY(-4px)';
          this.querySelector('.appointment-click-overlay').style.opacity = '1';
        });
        card.addEventListener('mouseleave', function() {
          this.style.boxShadow = 'none';
          this.style.transform = 'translateY(0)';
          this.querySelector('.appointment-click-overlay').style.opacity = '0';
        });
      });
    }, 100);

    const past = appointments.filter(a => {
      const apptDate = parseApptDate(a.date);
      return apptDate < now;
    }).sort((a, b) => {
      const dateA = parseApptDate(a.date);
      const dateB = parseApptDate(b.date);
      return dateB - dateA;  // Most recent first
    }).slice(0,5);

    pastContainer.innerHTML = (past.length > 0 ? '<h5 style="color:#9ca3af; margin-top:16px; margin-bottom:16px; font-weight:700;">📋 Past Appointments</h5>' : '') + past.map((a, idx)=> {
      const status = a.status || 'Completed';
      const apptDate = parseApptDate(a.date);
      const dateStr = apptDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = apptDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const appointmentId = 'appointment_' + (a._id || a.appointmentId || 'past_' + idx);
      
      return `
        <div class="appointment-card appointment-past" style="border-left:5px solid #9ca3af; background:linear-gradient(135deg, #f3f4f650, #f9fafb50); cursor:pointer; position:relative;" data-appointment-id="${appointmentId}" onclick="handleAppointmentClick(this, event)">
          <div class="appointment-click-overlay" style="position:absolute; top:0; right:0; padding:12px; opacity:0; transition:opacity 0.3s ease;">
            <i class="fas fa-arrow-right" style="color:#9ca3af; font-size:1.2rem;"></i>
          </div>
          <div class="appointment-header">
            <div>
              <strong style="font-size:1.05rem; color:#6b7280;">${a.doctorName||'Doctor'}</strong>
              <div class="small text-muted" style="font-size:0.9rem;">${a.specialization||'Medical Professional'}</div>
              ${a.hospital ? `<div class="small text-muted" style="font-size:0.85rem; margin-top:2px;"><i class="fas fa-hospital"></i> ${a.hospital}</div>` : ''}
            </div>
            <div style="margin-left:auto; text-align:right;">
              <span class="status-badge" style="background:#9ca3af; color:white; padding:6px 14px; border-radius:20px; font-size:0.85rem; font-weight:600; display:inline-block;">✓ ${status}</span>
            </div>
          </div>
          <div class="appointment-details" style="margin-top:12px; background:white; padding:12px; border-radius:8px; border:1px solid #f3f4f6;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:0.9rem;">
              <div><i class="fas fa-calendar" style="color:#9ca3af; margin-right:6px; width:16px;"></i><strong>Date:</strong> ${dateStr}</div>
              <div><i class="fas fa-clock" style="color:#9ca3af; margin-right:6px; width:16px;"></i><strong>Time:</strong> ${timeStr}</div>
              ${a.reason ? `<div style="grid-column:1/3;"><i class="fas fa-stethoscope" style="color:#9ca3af; margin-right:6px; width:16px;"></i><strong>Reason:</strong> ${a.reason}</div>` : ''}
              ${a.notes ? `<div style="grid-column:1/3;"><i class="fas fa-clipboard" style="color:#9ca3af; margin-right:6px; width:16px;"></i><strong>Notes:</strong> ${a.notes}</div>` : ''}
              ${a.summary ? `<div style="grid-column:1/3;"><i class="fas fa-file-medical" style="color:#9ca3af; margin-right:6px; width:16px;"></i><strong>Summary:</strong> ${a.summary}</div>` : ''}
            </div>
          </div>
          <div class="mt-2">
            <button class="btn btn-sm btn-outline-secondary" style="width:100%; font-size:0.9rem;" onclick="event.stopPropagation();"><i class="fas fa-download"></i> Download Report</button>
          </div>
        </div>
      `;
    }).join('') || '<div class="no-data show"><h4>📋 No past appointments</h4></div>';

    // Add hover effects to past cards
    setTimeout(() => {
      document.querySelectorAll('.appointment-past[data-appointment-id]').forEach(card => {
        card.addEventListener('mouseenter', function() {
          this.style.boxShadow = '0 8px 24px rgba(156, 163, 175, 0.15)';
          this.style.transform = 'translateY(-4px)';
          this.querySelector('.appointment-click-overlay').style.opacity = '1';
        });
        card.addEventListener('mouseleave', function() {
          this.style.boxShadow = 'none';
          this.style.transform = 'translateY(0)';
          this.querySelector('.appointment-click-overlay').style.opacity = '0';
        });
      });
    }, 100);
  }

  function renderHealthSummary(){
    // try to get last vitals from records or appointments, fallback to demo values
    document.getElementById('bpVal').textContent = '120/78';
    document.getElementById('sugarVal').textContent = '98 mg/dL';
    document.getElementById('hrVal').textContent = '74 bpm';
    renderHealthChart();
  }

  function renderHealthChart(){
    const ctx = document.getElementById('healthChart');
    if(!ctx) return;
    // demo data (7 days)
    const labels = [];
    for(let i=6;i>=0;i--){ const d = new Date(); d.setDate(d.getDate()-i); labels.push(d.toLocaleDateString()); }
    const bp = [120,122,118,121,119,123,120];
    const sugar = [100,98,102,97,99,101,98];
    const hr = [72,75,73,74,76,74,73];

    if(healthChart){ healthChart.data.labels = labels; healthChart.data.datasets[0].data = bp; healthChart.data.datasets[1].data = sugar; healthChart.data.datasets[2].data = hr; healthChart.update(); return; }

    healthChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'BP (systolic)', data: bp, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', tension:0.2, pointRadius:2 },
          { label: 'Sugar (mg/dL)', data: sugar, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.06)', tension:0.2, pointRadius:2 },
          { label: 'Heart Rate', data: hr, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.06)', tension:0.2, pointRadius:2 }
        ]
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: { beginAtZero: false }
        }
      }
    });
  }

  function renderNotifications(){
    notificationCount.textContent = notifications.length;
    notificationsList.innerHTML = notifications.map(n=>{
      const typeClass = n.type === 'med' ? 'med' : (n.type === 'report' ? 'report' : 'alert');
      const icon = n.type === 'med' ? 'fa-pills' : (n.type === 'report' ? 'fa-file-medical' : 'fa-bell');
      const color = n.type === 'med' ? '#f59e0b' : (n.type === 'report' ? '#3b82f6' : '#ef4444');
      return `<div class="notification-row ${typeClass}"><div><i class="fas ${icon}" style="color:${color}"></i></div><div><div>${n.text}</div><div class="time">${n.time}</div></div></div>`
    }).join('');
  }

  function showPrecautions(){
    // Display all reports with precautions
    const precautionsContent = document.getElementById('precautionsContent');
    
    if(records.length === 0){
      precautionsContent.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #94a3b8;">
          <i class="fas fa-inbox" style="font-size: 64px; color: #cbd5e1; margin-bottom: 1rem; display: block;"></i>
          <h4 style="color: #475569;">No Precautions or Care Instructions</h4>
          <p>You don't have any recorded precautions yet. They will appear here after your medical consultations.</p>
        </div>
      `;
    } else {
      const precautionsHTML = records.map((r, idx) => {
        const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'];
        const color = colors[idx % colors.length];
        const date = new Date(r.date || r.visitDate || Date.now());
        const dateStr = date.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const status = r.pending || r.status === 'pending_review' ? '<span style="background:#fef3c7; color:#92400e; padding:6px 12px; border-radius:20px; font-size:0.85rem; font-weight:600;"><i class="fas fa-clock" style="margin-right:4px;"></i>Pending</span>' : '<span style="background:#dcfce7; color:#15803d; padding:6px 12px; border-radius:20px; font-size:0.85rem; font-weight:600;"><i class="fas fa-check-circle" style="margin-right:4px;"></i>Completed</span>';
        
        const symptomsDisplay = r.symptoms && r.symptoms.length > 0 ? `
          <div style="margin-bottom: 1.5rem; padding: 1rem; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
            <strong style="color: #92400e; display: block; margin-bottom: 0.5rem;">
              <i class="fas fa-exclamation-circle" style="margin-right: 6px;"></i>Your Symptoms
            </strong>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${r.symptoms.map(sym => `<span style="background: #fcd34d; color: #78350f; padding: 4px 10px; border-radius: 12px; font-size: 0.85rem;">${sym}</span>`).join('')}
            </div>
          </div>
        ` : '';
        
        const medicationsDisplay = r.medications && r.medications.length > 0 ? `
          <div style="margin-bottom: 1.5rem;">
            <strong style="color: #475569; display: block; margin-bottom: 0.75rem;">
              <i class="fas fa-pills" style="color: #10b981; margin-right: 6px;"></i>Prescribed Medications
            </strong>
            <div style="display: grid; gap: 0.75rem;">
              ${r.medications.map(med => `
                <div style="background: #f0fdf4; padding: 1rem; border-radius: 8px; border-left: 4px solid #10b981;">
                  <div style="font-weight: 600; color: #059669; margin-bottom: 0.5rem;">${med.name} ${med.dosage ? '(' + med.dosage + ')' : ''}</div>
                  <div style="font-size: 0.9rem; color: #047857; display: grid; gap: 4px;">
                    ${med.frequency ? `<div><i class="fas fa-hourglass-half" style="margin-right: 6px; width: 16px;"></i><strong>Frequency:</strong> ${med.frequency}</div>` : ''}
                    ${med.duration ? `<div><i class="fas fa-calendar-days" style="margin-right: 6px; width: 16px;"></i><strong>Duration:</strong> ${med.duration}</div>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : '';
        
        return `
          <div style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 2rem; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.06); transition: all 0.3s ease;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, ${color}, ${color}dd); color: white; padding: 1.5rem;">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                <div>
                  <h5 style="margin: 0; font-weight: 700; font-size: 1.3rem;">${r.visitType ? r.visitType.charAt(0).toUpperCase() + r.visitType.slice(1) + ' Visit' : 'Medical Consultation'}</h5>
                  <div style="font-size: 0.95rem; opacity: 0.95; margin-top: 6px;">
                    <i class="fas fa-calendar" style="margin-right: 6px;"></i>${dateStr} at ${timeStr}
                  </div>
                </div>
                <div>${status}</div>
              </div>
              
              <!-- Doctor Info -->
              <div style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; margin-top: 1rem;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="background: rgba(255,255,255,0.2); width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.2rem;">${(r.doctorName || 'D').charAt(0)}</div>
                  <div>
                    <div style="font-weight: 600; font-size: 1rem;">${r.doctorName || 'Doctor'}</div>
                    <div style="font-size: 0.9rem; opacity: 0.95;">${r.specialization || 'Medical Professional'}</div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Content -->
            <div style="padding: 2rem;">
              <!-- Diagnosis/Reason -->
              ${r.diagnosis ? `
                <div style="margin-bottom: 1.5rem;">
                  <strong style="color: #475569; display: block; margin-bottom: 0.75rem;">
                    <i class="fas fa-diagnoses" style="color: ${color}; margin-right: 6px;"></i>Diagnosis Reason
                  </strong>
                  <div style="background: #f8fafc; padding: 1rem; border-radius: 8px; color: #334155; border-left: 4px solid ${color}; line-height: 1.6; font-weight: 500;">
                    ${r.diagnosis}
                  </div>
                </div>
              ` : ''}
              
              <!-- Symptoms -->
              ${symptomsDisplay}
              
              <!-- Medications -->
              ${medicationsDisplay}
              
              <!-- Precautions -->
              ${r.precautions ? `
                <div style="margin-bottom: 1.5rem;">
                  <strong style="color: #475569; display: block; margin-bottom: 0.75rem;">
                    <i class="fas fa-heart-pulse" style="color: ${color}; margin-right: 6px;"></i>Important Precautions & Care Instructions
                  </strong>
                  <div style="background: #fafbfc; padding: 1.5rem; border-radius: 8px; color: #334155; border-left: 4px solid ${color}; line-height: 1.8;">
                    <div style="white-space: pre-wrap; font-family: inherit;">${r.precautions}</div>
                  </div>
                </div>
              ` : ''}
              
              <!-- Clinical Notes -->
              ${r.notes ? `
                <div style="margin-bottom: 1.5rem;">
                  <strong style="color: #475569; display: block; margin-bottom: 0.75rem;">
                    <i class="fas fa-clipboard" style="color: #3b82f6; margin-right: 6px;"></i>Clinical Notes from Doctor
                  </strong>
                  <div style="background: #eff6ff; padding: 1.5rem; border-radius: 8px; color: #334155; border-left: 4px solid #3b82f6; line-height: 1.8;">
                    <div style="white-space: pre-wrap; font-family: inherit;">${r.notes}</div>
                  </div>
                </div>
              ` : ''}
              
              <!-- Follow-up Info -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                <div style="background: #e0f2fe; padding: 1rem; border-radius: 8px; border-left: 4px solid #0284c7;">
                  <div style="font-size: 0.85rem; color: #0369a1; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">
                    <i class="fas fa-check" style="margin-right: 6px;"></i>Follow These for
                  </div>
                  <div style="font-size: 1.1rem; color: #0c4a6e; font-weight: 700;">
                    ${r.duration || 'As per doctor advice'}
                  </div>
                </div>
                <div style="background: #dbeafe; padding: 1rem; border-radius: 8px; border-left: 4px solid #2563eb;">
                  <div style="font-size: 0.85rem; color: #1e40af; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">
                    <i class="fas fa-calendar-check" style="margin-right: 6px;"></i>Next Follow-up
                  </div>
                  <div style="font-size: 1.1rem; color: #1e3a8a; font-weight: 700;">
                    ${r.followUp || 'As advised by doctor'}
                  </div>
                </div>
              </div>
              
              <!-- Action Buttons -->
              <div style="display: flex; gap: 8px; margin-top: 2rem;">
                <button class="btn btn-sm" style="background: ${color}; color: white; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; flex: 1;">
                  <i class="fas fa-download" style="margin-right: 6px;"></i>Download PDF
                </button>
                <button class="btn btn-sm" style="background: #e2e8f0; color: #334155; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; flex: 1;">
                  <i class="fas fa-print" style="margin-right: 6px;"></i>Print
                </button>
                <button class="btn btn-sm" style="background: #f3f4f6; color: #6b7280; border: 1px solid #d1d5db; padding: 10px 18px; border-radius: 6px; font-weight: 600; flex: 1;">
                  <i class="fas fa-share" style="margin-right: 6px;"></i>Share
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      precautionsContent.innerHTML = precautionsHTML;
    }
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('precautionsModal'));
    modal.show();
  }

  function showBookAppointmentModal(){
    // Navigate to full-page booking experience
    window.location.href = 'booking.html';
  }

  function showDoctorsList(){
    renderDoctors();
    const modal = new bootstrap.Modal(document.getElementById('doctorsModal'));
    modal.show();
  }

  function renderDoctors(){
    if(!allDoctors || allDoctors.length === 0){
      doctorsList.innerHTML = '<div class="text-center text-muted py-5"><i class="fas fa-user-md" style="font-size:48px; opacity:0.3; margin-bottom:16px; display:block;"></i>No doctors available</div>';
      return;
    }

    doctorsList.innerHTML = '<div class="doctors-list-grid">' + allDoctors.map((doctor, idx) => {
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
      const color = colors[idx % colors.length];
      
      return `
        <div class="doctor-card-full" style="border-left: 6px solid ${color};">
          <div class="doctor-card-header" style="background: linear-gradient(135deg, ${color}15, ${color}08); border-bottom: 2px solid ${color}20; padding: 1.5rem 1.5rem 1rem;">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
              <div class="doctor-avatar" style="background: linear-gradient(135deg, ${color}, ${color}cc); color:white; width:50px; height:50px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1.3rem;">${(doctor.name || 'D').charAt(0)}</div>
              <div>
                <strong style="color:${color}; font-size:1.2rem; display:block;">${doctor.name || 'Doctor'}</strong>
                <div class="text-muted" style="font-size:0.95rem; margin-top:2px;">${doctor.specialization || 'Medical Professional'}</div>
              </div>
            </div>
          </div>
          <div class="doctor-card-body" style="padding:1.5rem;">
            <div class="doctor-info-item" style="margin-bottom:12px;">
              <i class="fas fa-briefcase" style="color:${color}; width:20px; margin-right:10px;"></i>
              <span class="small"><strong>Experience:</strong> ${doctor.experience || 'Not specified'}</span>
            </div>
            <div class="doctor-info-item" style="margin-bottom:15px;">
              <i class="fas fa-hospital" style="color:${color}; width:20px; margin-right:10px;"></i>
              <span class="small"><strong>Hospital:</strong> ${doctor.hospital || 'Not specified'}</span>
            </div>
            <hr style="margin: 15px 0; border: none; border-top: 1px solid #e2e8f0;">
            <button class="btn btn-gradient" style="background: linear-gradient(135deg, ${color}, ${color}cc); color:white; width:100%; border:none; padding:12px; border-radius:10px; font-weight:600; cursor:pointer; transition:all 0.3s ease;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px ${color}40';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';" onclick="bookAppointmentWithDoctor('${doctor._id}','${doctor.name}','${doctor.specialization}')">
              <i class="fas fa-calendar-plus"></i> Book Appointment
            </button>
          </div>
        </div>
      `;
    }).join('') + '</div>';
  }

  function bookAppointmentWithDoctor(doctorId, doctorName, specialization){
    // Store doctor info in sessionStorage and redirect to booking page
    sessionStorage.setItem('selectedDoctorId', doctorId);
    sessionStorage.setItem('selectedDoctorName', doctorName);
    sessionStorage.setItem('selectedDoctorSpecialization', specialization);
    
    // Close the modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('doctorsModal'));
    if(modal) modal.hide();
    
    // Redirect to booking page
    setTimeout(() => {
      window.location.href = 'booking.html';
    }, 300);
  }

  // Expose bookAppointmentWithDoctor for inline onclick
  window.bookAppointmentWithDoctor = bookAppointmentWithDoctor;

  function setAppointmentHistoryTabStyles(activeFilter = 'all'){
    document.querySelectorAll('.filter-tab').forEach(tab => {
      const isActive = tab.getAttribute('data-filter') === activeFilter;
      tab.style.background = isActive ? 'linear-gradient(135deg, #8b5cf6, #a855f7)' : 'white';
      tab.style.color = isActive ? 'white' : '#64748b';
      tab.style.borderColor = isActive ? '#a855f7' : '#e2e8f0';
      tab.style.borderWidth = '2px';
    });
  }

  function closeResponsiveNav() {
    document.body.classList.remove('sidebar-open');
  }

  function setupResponsiveNav() {
    mobileMenuToggle?.addEventListener('click', () => {
      document.body.classList.toggle('sidebar-open');
    });

    mobileSidebarBackdrop?.addEventListener('click', closeResponsiveNav);

    window.addEventListener('resize', () => {
      if (window.innerWidth >= 992) {
        closeResponsiveNav();
      }
    });
  }

  function showAppointmentHistory(filter = 'all'){
    setAppointmentHistoryTabStyles(filter);
    renderAppointmentHistory(filter);
    const modal = new bootstrap.Modal(document.getElementById('appointmentHistoryModal'));
    modal.show();
  }

  function renderAppointmentHistory(filter = 'all'){
    const parseApptDate = (dateStr) => {
      if(!dateStr) return new Date();
      try {
        return new Date(dateStr);
      } catch(e) {
        return new Date();
      }
    };

    const now = new Date();
    
    // Separate appointments
    const future = appointments.filter(a => {
      const apptDate = parseApptDate(a.date);
      return apptDate >= now;
    }).sort((a, b) => {
      const dateA = parseApptDate(a.date);
      const dateB = parseApptDate(b.date);
      return dateA - dateB;
    });

    const past = appointments.filter(a => {
      const apptDate = parseApptDate(a.date);
      return apptDate < now;
    }).sort((a, b) => {
      const dateA = parseApptDate(a.date);
      const dateB = parseApptDate(b.date);
      return dateB - dateA;
    });

    let toDisplay = [];
    if(filter === 'all') {
      toDisplay = [...future, ...past];
    } else if(filter === 'upcoming') {
      toDisplay = future;
    } else if(filter === 'past') {
      toDisplay = past;
    }

    const historyList = document.getElementById('appointmentHistoryList');
    
    if(toDisplay.length === 0) {
      historyList.innerHTML = `<div class="text-center text-muted py-5"><i class="fas fa-calendar-xmark" style="font-size:48px; opacity:0.3; margin-bottom:16px; display:block;"></i><h4>No ${filter === 'all' ? '' : filter} appointments</h4></div>`;
      return;
    }

    historyList.innerHTML = toDisplay.map((a, idx) => {
      const isUpcoming = parseApptDate(a.date) >= now;
      const status = a.status || (isUpcoming ? 'Scheduled' : 'Completed');
      const apptDate = parseApptDate(a.date);
      const dateStr = apptDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = apptDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
      const color = colors[idx % colors.length];
      
      // Find the original index in the appointments array
      const originalIndex = appointments.indexOf(a);
      
      return `
        <div class="appointment-history-card" style="border-left: 6px solid ${color}; animation: slideUp 0.4s ease-out;" data-appt-idx="${originalIndex}">
          <div class="history-card-header" style="background: linear-gradient(135deg, ${color}15, ${color}08); padding: 1.5rem; border-bottom: 1px solid #e5e7eb; display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="flex:1;">
              <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
                <div class="doctor-avatar-small" style="background: linear-gradient(135deg, ${color}, ${color}cc); color:white; width:45px; height:45px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1.1rem; flex-shrink:0;">${(a.doctorName || 'D').charAt(0)}</div>
                <div>
                  <strong style="color:${color}; font-size:1.1rem; display:block;">${a.doctorName||'Doctor'}</strong>
                  <div class="small text-muted" style="font-size:0.9rem;">${a.specialization||'Medical Professional'}</div>
                </div>
              </div>
            </div>
            <span class="status-badge-history" style="background:${isUpcoming ? 'linear-gradient(135deg, #10b981, #059669)' : '#9ca3af'}; color:white; padding:8px 16px; border-radius:20px; font-size:0.85rem; font-weight:600; white-space:nowrap; margin-left:12px;">${isUpcoming ? '📅 ' + status : '✓ ' + status}</span>
          </div>
          <div class="history-card-body" style="padding: 1.5rem;">
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; margin-bottom:12px;">
              <div style="background:#f8fafc; padding:12px; border-radius:8px;">
                <div class="small text-muted" style="font-size:0.75rem; margin-bottom:4px;"><i class="fas fa-calendar" style="color:${color}; margin-right:4px;"></i>Date</div>
                <strong style="color:${color}; font-size:0.95rem;">${dateStr}</strong>
              </div>
              <div style="background:#f8fafc; padding:12px; border-radius:8px;">
                <div class="small text-muted" style="font-size:0.75rem; margin-bottom:4px;"><i class="fas fa-clock" style="color:${color}; margin-right:4px;"></i>Time</div>
                <strong style="color:${color}; font-size:0.95rem;">${timeStr}</strong>
              </div>
              <div style="background:#f8fafc; padding:12px; border-radius:8px;">
                <div class="small text-muted" style="font-size:0.75rem; margin-bottom:4px;"><i class="fas fa-hospital" style="color:${color}; margin-right:4px;"></i>Hospital</div>
                <strong style="color:${color}; font-size:0.95rem;">${a.hospital || 'N/A'}</strong>
              </div>
            </div>
            ${a.reason ? `<div style="background:#f8fafc; padding:12px; border-radius:8px; margin-bottom:12px;"><i class="fas fa-stethoscope" style="color:${color}; margin-right:8px;"></i><strong>Reason:</strong> ${a.reason}</div>` : ''}
            ${a.notes ? `<div style="background:#f8fafc; padding:12px; border-radius:8px; margin-bottom:12px;"><i class="fas fa-clipboard" style="color:${color}; margin-right:8px;"></i><strong>Notes:</strong> ${a.notes}</div>` : ''}
            ${a.summary ? `<div style="background:#f8fafc; padding:12px; border-radius:8px; margin-bottom:12px;"><i class="fas fa-file-medical" style="color:${color}; margin-right:8px;"></i><strong>Summary:</strong> ${a.summary}</div>` : ''}
          </div>
          <div class="history-card-footer" style="padding: 1rem 1.5rem; background:#f9fafb; border-top:1px solid #e5e7eb; display:flex; gap:8px;">
            ${isUpcoming ? `
              <button class="btn btn-sm btn-outline-primary" style="flex:1;" onclick="handleReschedule()"><i class="fas fa-edit"></i> Reschedule</button>
              <button class="btn btn-sm btn-success" style="flex:1;" onclick="handleJoinCall('${a.doctorName}')"><i class="fas fa-video"></i> Join Call</button>
            ` : `
              <button class="btn btn-sm btn-outline-secondary" style="flex:1;" onclick="downloadAppointmentReport(${originalIndex})"><i class="fas fa-download"></i> Download Report</button>
              <button class="btn btn-sm btn-outline-info" style="flex:1;" onclick="handleRebook()"><i class="fas fa-redo"></i> Re-book</button>
            `}
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers to history cards to show appointment details
    setTimeout(() => {
      document.querySelectorAll('.appointment-history-card').forEach((card, idx) => {
        card.style.cursor = 'pointer';
        card.style.transition = 'all 0.3s ease';
        card.addEventListener('mouseenter', function() {
          this.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.12)';
          this.style.transform = 'translateY(-4px)';
        });
        card.addEventListener('mouseleave', function() {
          this.style.boxShadow = 'none';
          this.style.transform = 'translateY(0)';
        });
        card.addEventListener('click', () => {
          const apptIndex = card.getAttribute('data-appt-idx');
          console.log('🔍 Clicked appointment with index:', apptIndex);
          if (apptIndex !== null) {
            showAppointmentDetail(parseInt(apptIndex));
          }
        });
      });
    }, 100);
  }

  // Expose showAppointmentHistory for external calls
  window.showAppointmentHistory = showAppointmentHistory;

  // Show all medical records in modal
  function showAllRecords(){
    console.log("🎯 Showing all records - redirecting to records.html");
    try {
      const historySnapshot = getPatientHistoryItems();
      sessionStorage.setItem('patientRecordsCache', JSON.stringify(historySnapshot));
    } catch (_error) {
      sessionStorage.removeItem('patientRecordsCache');
    }
    console.log("📍 Redirecting to records.html");
    window.location.href = 'records.html';
  }

  function renderAllRecordsInModal(){
    const recordsContainer = document.getElementById('recordsContainer');
    const activeElement = document.activeElement;
    const shouldRestoreSearchFocus = activeElement?.id === 'recordsSearchInput';
    const searchSelectionStart = shouldRestoreSearchFocus ? activeElement.selectionStart : null;
    const searchSelectionEnd = shouldRestoreSearchFocus ? activeElement.selectionEnd : null;
    const historyItems = getPatientHistoryItems();
    const enrichedRecords = historyItems
      .map((record, idx) => enrichRecordForDisplay(record, idx))
      .sort((a, b) => b.timestamp - a.timestamp);

    const filteredRecords = getFilteredRecords(enrichedRecords);
    const totalPages = Math.max(1, Math.ceil(filteredRecords.length / recordsViewState.perPage));
    const waitingCount = filteredRecords.filter((record) => record.statusKey === 'waiting').length;
    const completedCount = filteredRecords.filter((record) => record.statusKey === 'completed').length;
    const latestVisitLabel = filteredRecords[0]
      ? `${filteredRecords[0].dateLabel} at ${filteredRecords[0].timeLabel}`
      : 'No recent visit';
    if (recordsViewState.page > totalPages) {
      recordsViewState.page = totalPages;
    }

    const startIndex = (recordsViewState.page - 1) * recordsViewState.perPage;
    const pageRecords = filteredRecords.slice(startIndex, startIndex + recordsViewState.perPage);

    recordsContainer.innerHTML = `
      <div class="records-dashboard">
        <div class="records-toolbar card border-0 shadow-sm mb-4">
          <div class="card-body">
            <div class="records-toolbar-top">
              <div>
                <h4 class="records-title mb-1"><i class="fas fa-file-waveform me-2 text-primary"></i>View Records</h4>
                <p class="records-subtitle mb-0">Search, filter, and review your consultation history.</p>
              </div>
              <div class="records-summary-badge">
                <i class="fas fa-layer-group me-2"></i>${filteredRecords.length} record${filteredRecords.length === 1 ? '' : 's'}
              </div>
            </div>
            <div class="records-hero-grid mb-3">
              <div class="records-hero-card records-hero-primary">
                <div class="records-hero-icon"><i class="fas fa-notes-medical"></i></div>
                <div>
                  <div class="records-hero-label">Total Records</div>
                  <div class="records-hero-value">${filteredRecords.length}</div>
                </div>
              </div>
              <div class="records-hero-card records-hero-warning">
                <div class="records-hero-icon"><i class="fas fa-hourglass-half"></i></div>
                <div>
                  <div class="records-hero-label">Waiting Review</div>
                  <div class="records-hero-value">${waitingCount}</div>
                </div>
              </div>
              <div class="records-hero-card records-hero-success">
                <div class="records-hero-icon"><i class="fas fa-circle-check"></i></div>
                <div>
                  <div class="records-hero-label">Completed</div>
                  <div class="records-hero-value">${completedCount}</div>
                </div>
              </div>
              <div class="records-hero-card records-hero-neutral">
                <div class="records-hero-icon"><i class="fas fa-clock-rotate-left"></i></div>
                <div>
                  <div class="records-hero-label">Latest Visit</div>
                  <div class="records-hero-caption">${escapeHtml(latestVisitLabel)}</div>
                </div>
              </div>
            </div>
            <div class="row g-3 align-items-end mt-1">
              <div class="col-12 col-lg-5">
                <label for="recordsSearchInput" class="form-label records-control-label">Search records</label>
                <div class="input-group shadow-sm">
                  <span class="input-group-text bg-white border-end-0"><i class="fas fa-search text-muted"></i></span>
                  <input
                    id="recordsSearchInput"
                    type="search"
                    class="form-control border-start-0"
                    placeholder="Search by patient, doctor, department, token..."
                    value="${escapeHtml(recordsViewState.search)}"
                  >
                </div>
              </div>
              <div class="col-12 col-md-6 col-lg-3">
                <label for="recordsStatusFilter" class="form-label records-control-label">Filter by status</label>
                <select id="recordsStatusFilter" class="form-select shadow-sm">
                  <option value="all"${recordsViewState.status === 'all' ? ' selected' : ''}>All</option>
                  <option value="waiting"${recordsViewState.status === 'waiting' ? ' selected' : ''}>Waiting</option>
                  <option value="completed"${recordsViewState.status === 'completed' ? ' selected' : ''}>Completed</option>
                </select>
              </div>
              <div class="col-12 col-md-6 col-lg-3">
                <label for="recordsSortOrder" class="form-label records-control-label">Sort by</label>
                <select id="recordsSortOrder" class="form-select shadow-sm">
                  <option value="latest"${recordsViewState.sort === 'latest' ? ' selected' : ''}>Latest first</option>
                  <option value="oldest"${recordsViewState.sort === 'oldest' ? ' selected' : ''}>Oldest first</option>
                </select>
              </div>
              <div class="col-12 col-lg-1 d-grid">
                <button id="recordsClearFilters" class="btn btn-outline-secondary records-clear-btn">
                  <i class="fas fa-rotate-left"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        ${filteredRecords.length === 0 ? `
          <div class="records-empty-state card border-0 shadow-sm">
            <div class="card-body text-center py-5">
              <div class="records-empty-icon mb-3"><i class="fas fa-folder-open"></i></div>
              <h5 class="mb-2">No records found</h5>
              <p class="text-muted mb-0">Try changing the search text or status filter to find matching records.</p>
            </div>
          </div>
        ` : `
          <div class="records-results-meta d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <div class="text-muted small">
              Showing <strong>${startIndex + 1}-${Math.min(startIndex + pageRecords.length, filteredRecords.length)}</strong> of <strong>${filteredRecords.length}</strong> records
            </div>
            <div class="text-muted small">
              Sorted by <strong>${recordsViewState.sort === 'latest' ? 'latest first' : 'oldest first'}</strong>
            </div>
          </div>

          <div class="records-grid">
            ${pageRecords.map((record) => `
              <div class="card records-record-card border-0 shadow-sm h-100">
                <div class="card-body p-0">
                  <div class="records-record-header">
                    <div>
                      <div class="records-record-patient">
                        <i class="fas fa-user-injured me-2"></i>${escapeHtml(record.patientName)}
                      </div>
                      <div class="records-record-token mt-2 d-flex flex-wrap gap-2">
                        <span class="badge text-bg-light border"><i class="fas fa-hashtag me-1"></i>${escapeHtml(record.tokenNumber)}</span>
                        <span class="badge records-soft-badge"><i class="fas fa-layer-group me-1"></i>${escapeHtml(record.visitType || 'Consultation')}</span>
                        <span class="badge records-soft-badge"><i class="fas fa-stethoscope me-1"></i>${escapeHtml(record.specialization || 'General')}</span>
                      </div>
                    </div>
                    <span class="badge ${record.statusMeta.badgeClass} records-status-badge">
                      <i class="fas ${record.statusMeta.icon} me-1"></i>${record.statusMeta.label}
                    </span>
                  </div>

                  <div class="records-record-body p-4">
                    <div class="records-visit-banner mb-4">
                      <div class="records-visit-banner-icon"><i class="fas fa-hospital-user"></i></div>
                      <div>
                        <div class="records-visit-banner-title">${escapeHtml(record.doctorName)}</div>
                        <div class="records-visit-banner-text">${escapeHtml(record.department)} department consultation overview</div>
                      </div>
                    </div>
                    <div class="row g-3">
                      <div class="col-md-6">
                        <div class="records-detail-tile">
                          <div class="records-detail-label"><i class="fas fa-user-doctor me-2"></i>Doctor Name</div>
                          <div class="records-detail-value">${escapeHtml(record.doctorName)}</div>
                        </div>
                      </div>
                      <div class="col-md-6">
                        <div class="records-detail-tile">
                          <div class="records-detail-label"><i class="fas fa-building me-2"></i>Department</div>
                          <div class="records-detail-value">${escapeHtml(record.department)}</div>
                        </div>
                      </div>
                      <div class="col-md-6">
                        <div class="records-detail-tile">
                          <div class="records-detail-label"><i class="fas fa-calendar-day me-2"></i>Appointment Date</div>
                          <div class="records-detail-value">${escapeHtml(record.dateLabel)}</div>
                        </div>
                      </div>
                      <div class="col-md-6">
                        <div class="records-detail-tile">
                          <div class="records-detail-label"><i class="fas fa-clock me-2"></i>Appointment Time</div>
                          <div class="records-detail-value">${escapeHtml(record.timeLabel)}</div>
                        </div>
                      </div>
                    </div>

                    ${(record.diagnosis || record.notes || record.precautions) ? `
                      <div class="records-notes-block mt-4">
                        ${record.diagnosis ? `<div class="records-note-line"><i class="fas fa-stethoscope me-2 text-primary"></i><strong>Diagnosis:</strong> ${escapeHtml(record.diagnosis)}</div>` : ''}
                        ${record.notes ? `<div class="records-note-line"><i class="fas fa-clipboard me-2 text-info"></i><strong>Notes:</strong> ${escapeHtml(record.notes)}</div>` : ''}
                        ${record.precautions ? `<div class="records-note-line"><i class="fas fa-shield-heart me-2 text-success"></i><strong>Precautions:</strong> ${escapeHtml(record.precautions)}</div>` : ''}
                      </div>
                    ` : ''}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>

          ${totalPages > 1 ? `
            <nav class="records-pagination-wrap mt-4">
              <ul class="pagination justify-content-center mb-0">
                <li class="page-item ${recordsViewState.page === 1 ? 'disabled' : ''}">
                  <button class="page-link" data-records-page="${recordsViewState.page - 1}">Previous</button>
                </li>
                ${Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => `
                  <li class="page-item ${page === recordsViewState.page ? 'active' : ''}">
                    <button class="page-link" data-records-page="${page}">${page}</button>
                  </li>
                `).join('')}
                <li class="page-item ${recordsViewState.page === totalPages ? 'disabled' : ''}">
                  <button class="page-link" data-records-page="${recordsViewState.page + 1}">Next</button>
                </li>
              </ul>
            </nav>
          ` : ''}
        `}
      </div>
    `;

    attachRecordsViewHandlers();

    if (shouldRestoreSearchFocus) {
      const searchInput = document.getElementById('recordsSearchInput');
      if (searchInput) {
        searchInput.focus();
        const cursorPosition = typeof searchSelectionEnd === 'number'
          ? searchSelectionEnd
          : searchInput.value.length;
        searchInput.setSelectionRange(
          typeof searchSelectionStart === 'number' ? searchSelectionStart : cursorPosition,
          cursorPosition
        );
      }
    }
  }

  async function fetchJSON(path){
    const response = await fetch(path);
    console.log('[Dashboard API] Request:', path, 'Status:', response.status);
    if(!response.ok){
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    console.log('[Dashboard API] Response:', path, data);
    return data;
  }

  function attachRecordsViewHandlers() {
    document.getElementById('recordsSearchInput')?.addEventListener('input', (event) => {
      recordsViewState.search = event.target.value || '';
      recordsViewState.page = 1;
      renderAllRecordsInModal();
    });

    document.getElementById('recordsStatusFilter')?.addEventListener('change', (event) => {
      recordsViewState.status = event.target.value || 'all';
      recordsViewState.page = 1;
      renderAllRecordsInModal();
    });

    document.getElementById('recordsSortOrder')?.addEventListener('change', (event) => {
      recordsViewState.sort = event.target.value || 'latest';
      recordsViewState.page = 1;
      renderAllRecordsInModal();
    });

    document.getElementById('recordsClearFilters')?.addEventListener('click', () => {
      recordsViewState.search = '';
      recordsViewState.status = 'all';
      recordsViewState.sort = 'latest';
      recordsViewState.page = 1;
      renderAllRecordsInModal();
    });

    document.querySelectorAll('[data-records-page]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextPage = Number(button.getAttribute('data-records-page'));
        if (!Number.isNaN(nextPage) && nextPage > 0) {
          recordsViewState.page = nextPage;
          renderAllRecordsInModal();
        }
      });
    });

  }

  function initChatbot(){
    chatbotConversation = [
      {
        role: 'bot',
        text: 'Hello! I can explain HealthQueue features, help you understand booking or queue flow, and suggest the right doctor based on symptoms.',
        suggestions: []
      }
    ];

    chatbotToggle?.addEventListener('click', (event)=>{
      event.preventDefault();
      event.stopPropagation();
      setChatbotOpen(true);
    });
    chatbotClose?.addEventListener('click', (event)=>{
      event.preventDefault();
      event.stopPropagation();
      setChatbotOpen(false);
    });
    chatbotSend?.addEventListener('click', sendChatbotMessage);
    chatbotInput?.addEventListener('keydown', (event) => {
      if(event.key === 'Enter' && !event.shiftKey){
        event.preventDefault();
        sendChatbotMessage();
      }
    });
    chatbotQuickReplies?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-chatbot-prompt]');
      if(!button) return;
      chatbotInput.value = button.getAttribute('data-chatbot-prompt') || '';
      sendChatbotMessage();
    });

    renderChatbotMessages();
  }

  function mountChatbotToViewport(){
    if(!chatbotShell || !document.body) return;
    document.body.appendChild(chatbotShell);
    chatbotShell.style.position = 'fixed';
    chatbotShell.style.top = 'auto';
    chatbotShell.style.left = 'auto';
    chatbotShell.style.right = '16px';
    chatbotShell.style.bottom = '16px';
    chatbotShell.style.margin = '0';
    chatbotShell.style.zIndex = '1600';
  }

  function formatChatbotText(text){
    const highlightTerms = [
      'HealthQueue',
      'patient',
      'patients',
      'doctor',
      'doctors',
      'appointment',
      'appointments',
      'queue',
      'token',
      'dashboard',
      'medical records',
      'reports',
      'history',
      'General Physician',
      'Orthopedic',
      'Dentist',
      'Dermatologist',
      'ENT Specialist',
      'Cardiologist',
      'Neurologist',
      'approved',
      'rejected',
      'completed',
      'pending'
    ];

    const lines = String(text || '').split('\n').filter((line) => line.trim().length);
    return lines.map((line, index) => {
      const isBullet = line.trim().startsWith('- ');
      const cleanedLine = isBullet ? line.trim().slice(2) : line.trim();
      let formattedLine = escapeHtml(cleanedLine);

      highlightTerms.forEach((term) => {
        const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b(${escapedTerm})\\b`, 'gi');
        formattedLine = formattedLine.replace(regex, '<span class="chatbot-highlight">$1</span>');
      });

      const lineClass = index === 0 && !isBullet ? 'chatbot-line is-title' : `chatbot-line${isBullet ? ' is-bullet' : ''}`;
      return `<p class="${lineClass}">${formattedLine}</p>`;
    }).join('');
  }

  function setChatbotOpen(open){
    chatbotOpen = Boolean(open);
    chatbotShell?.classList.toggle('is-open', chatbotOpen);
    if(chatbotOpen){
      chatbotInput?.focus();
    }
  }

  function renderChatbotMessages(){
    if(!chatbotMessages) return;
    chatbotMessages.innerHTML = chatbotConversation.map((message) => {
      const suggestions = Array.isArray(message.suggestions) && message.suggestions.length
        ? `<div class="chatbot-suggestion-list">${message.suggestions.map((doctor) => `
            <article class="chatbot-suggestion-card">
              <strong>${escapeHtml(doctor.name || 'Doctor')}</strong>
              <span>${escapeHtml(doctor.specialization || 'Specialist')}</span>
              <p>${escapeHtml(`${doctor.hospital || 'HealthQueue Hospital'}${doctor.experience ? ` • ${doctor.experience} yrs exp` : ''}`)}</p>
            </article>
          `).join('')}</div>`
        : '';
      return `
        <div class="chatbot-message ${message.role === 'user' ? 'user' : 'bot'}">
          <div class="chatbot-bubble">
            <div class="chatbot-richtext">${formatChatbotText(message.text)}</div>
            ${suggestions}
          </div>
        </div>
      `;
    }).join('');
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
  }

  function setChatbotTyping(show){
    chatbotTyping?.classList.toggle('d-none', !show);
  }

  async function sendChatbotMessage(){
    const text = chatbotInput?.value.trim();
    if(!text) return;
    const history = chatbotConversation.slice(-6).map((entry) => ({
      role: entry.role === 'bot' ? 'assistant' : 'user',
      text: entry.text
    }));

    setChatbotOpen(true);
    chatbotConversation.push({ role: 'user', text, suggestions: [] });
    renderChatbotMessages();
    chatbotInput.value = '';
    chatbotSend.disabled = true;
    setChatbotTyping(true);

    try{
      const response = await fetch(`${API_BASE}/chatbot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, patientId: getPatientId(), history })
      });
      const data = await response.json().catch(()=>({}));
      if(!response.ok){
        throw new Error(data.message || 'Chatbot request failed');
      }

      chatbotConversation.push({
        role: 'bot',
        text: data.reply || 'I am here to help with appointments, queue tracking, and doctor suggestions.',
        suggestions: Array.isArray(data.doctors) ? data.doctors.slice(0, 3) : []
      });
    }catch(error){
      chatbotConversation.push({
        role: 'bot',
        text: error.message || 'Sorry, I could not process your request right now. Please try again.',
        suggestions: []
      });
    }finally{
      chatbotSend.disabled = false;
      setChatbotTyping(false);
      renderChatbotMessages();
    }
  }

  function getFilteredRecords(enrichedRecords) {
    const query = normalizeSearchText(recordsViewState.search);
    let filtered = enrichedRecords.filter((record) => {
      if (recordsViewState.status !== 'all' && record.statusKey !== recordsViewState.status) {
        return false;
      }

      if (!query) {
        return true;
      }

      return buildRecordSearchIndex(record).includes(query);
    });

    filtered = filtered.sort((a, b) => {
      return recordsViewState.sort === 'oldest' ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
    });

    return filtered;
  }

  function enrichRecordForDisplay(record) {
    const visitDate = new Date(record.visitDate || record.date || record.appointmentDate || Date.now());
    const linkedAppointment = findLinkedAppointment(record, visitDate);
    const statusKey = normalizeRecordStatus(record.status || linkedAppointment?.status || (record.pending ? 'waiting' : 'completed'));
    const statusMeta = getRecordStatusMeta(statusKey);

    return {
      ...record,
      timestamp: visitDate.getTime(),
      patientName: record.patientName || user.name || 'Patient',
      tokenNumber: record.token || record.queueToken || record.tokenNumber || linkedAppointment?.token || 'Not assigned',
      doctorName: record.doctorName || linkedAppointment?.doctorName || 'Not assigned',
      department: record.department || linkedAppointment?.department || record.specialization || 'General',
      dateLabel: visitDate.toLocaleDateString('en-IN', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      timeLabel: visitDate.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      searchIndex: '',
      statusKey,
      statusMeta
    };
  }

  function getPatientHistoryItems() {
    if (records.length > 0) {
      return records;
    }

    return appointments.map((appointment, idx) => ({
      id: appointment._id || appointment.appointmentId || `appointment-history-${idx}`,
      appointmentId: appointment._id || appointment.appointmentId || null,
      patientName: user.name || 'Patient',
      doctorName: appointment.doctorName || 'Doctor',
      specialization: appointment.specialization || appointment.department || 'General',
      department: appointment.department || appointment.specialization || 'General',
      token: appointment.token || appointment.queueToken || appointment.tokenNumber || `TOKEN-${idx + 1}`,
      visitDate: appointment.date || appointment.appointmentDate || appointment.createdAt || Date.now(),
      date: appointment.date || appointment.appointmentDate || appointment.createdAt || Date.now(),
      visitType: appointment.visitType || 'consultation',
      title: appointment.reason || 'Appointment Record',
      diagnosis: appointment.reason || '',
      notes: appointment.notes || '',
      precautions: appointment.summary || '',
      followUp: appointment.followUp || '',
      status: appointment.status || 'completed',
      pending: normalizeRecordStatus(appointment.status) === 'waiting'
    }));
  }

  function findLinkedAppointment(record, visitDate) {
    return appointments.find((appointment) => {
      const appointmentDate = new Date(appointment.date || appointment.appointmentDate || 0);
      return (
        (record.appointmentId && (record.appointmentId === appointment._id || record.appointmentId === appointment.appointmentId)) ||
        (record.doctorName && appointment.doctorName === record.doctorName && Math.abs(appointmentDate.getTime() - visitDate.getTime()) < 24 * 60 * 60 * 1000)
      );
    });
  }

  function normalizeRecordStatus(status) {
    const value = String(status || '').toLowerCase();
    if (value.includes('cancel')) return 'cancelled';
    if (value.includes('wait') || value.includes('draft') || value.includes('pending')) return 'waiting';
    return 'completed';
  }

  function getRecordStatusMeta(statusKey) {
    if (statusKey === 'waiting') {
      return { label: 'Waiting', badgeClass: 'text-bg-warning', icon: 'fa-hourglass-half' };
    }
    if (statusKey === 'cancelled') {
      return { label: 'Cancelled', badgeClass: 'text-bg-danger', icon: 'fa-circle-xmark' };
    }
    return { label: 'Completed', badgeClass: 'text-bg-success', icon: 'fa-circle-check' };
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildRecordSearchIndex(record) {
    if (record.searchIndex) {
      return record.searchIndex;
    }

    const searchableText = [
      record.patientName,
      record.tokenNumber,
      record.doctorName,
      record.department,
      record.specialization,
      record.title,
      record.diagnosis,
      record.notes,
      record.precautions,
      record.followUp,
      record.dateLabel,
      record.timeLabel,
      record.statusMeta?.label,
      record.visitType
    ].join(' ');

    const normalized = normalizeSearchText(searchableText);
    record.searchIndex = normalized;
    return normalized;
  }

  function normalizeSearchText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  window.showAllRecords = showAllRecords;

  // Live queue: simple heuristic demonstration
  async function refreshPatientDashboardData(){
    await loadPatientAppointments();
    await loadDashboardSummaryCards();
    renderAll();
    await updateLiveQueue();
  }

  async function updateLiveQueue(){
    try {
      summaryErrors.queue = false;
      const patientId = getPatientId();
      const querySuffix = patientId ? `?patientId=${encodeURIComponent(patientId)}` : '';
      liveQueueSummary = await fetchJSON(`${API_BASE}/queue/status${querySuffix}`);
      renderLiveQueue();
    } catch (error) {
      console.error('[Dashboard API] Queue fallback applied:', error.message);
      summaryErrors.queue = false;
      liveQueueSummary = getFallbackQueueStatus();
      renderLiveQueue();
    }
  }

  function renderLiveQueue(){
    if (summaryErrors.queue) {
      renderLiveQueueError();
      return;
    }

    if (!liveQueueSummary || !hasUsableQueueSummary(liveQueueSummary)) {
      liveQueueSummary = getFallbackQueueStatus();
    }

    if (!liveQueueSummary || !hasUsableQueueSummary(liveQueueSummary)) {
      safeText(currentToken, '#--');
      safeText(patientsAhead, 'No active queue');
      safeText(etaEl, '0 minutes');
      if(queueMini) queueMini.innerHTML = '<div class="text-muted small">No queue updates available.</div>';
      if (queueTracker) {
        queueTracker.innerHTML = `
          <div class="queue-tracker-empty">
            <i class="fas fa-ticket"></i>
            <h4>No active queue right now</h4>
            <p>Your next booked appointment will appear here when queue tracking starts.</p>
          </div>
        `;
      } else if (trackerSteps) {
        trackerSteps.innerHTML = '<div class="text-muted small">No active queue right now</div>';
      }
      return;
    }

    const queueData = normalizeQueueSummary(liveQueueSummary);
    const yourTokenValue = queueData.yourToken;
    const nowServingValue = queueData.nowServingToken;
    const aheadCount = Number(queueData.patientsAhead || 0);
    const waitMinutes = Number(queueData.estimatedWaitingTime || 0);
    const queueTimeline = buildQueueTimeline(queueData);
    const displayAheadText = `${aheadCount} ${aheadCount === 1 ? 'patient' : 'patients'} ahead`;

    safeText(currentToken, yourTokenValue);
    safeText(patientsAhead, displayAheadText);
    safeText(etaEl, `${waitMinutes} minute${waitMinutes === 1 ? '' : 's'}`);
    if(queueMini) {
      queueMini.innerHTML = `
        <div class="queue-mini-pill">
          <span class="queue-mini-label">Now Serving</span>
          <strong>${escapeHtml(nowServingValue)}</strong>
        </div>
        <div class="queue-mini-meta">
          <span>Your token ${escapeHtml(yourTokenValue)}</span>
          <span>${aheadCount} ahead</span>
        </div>
      `;
    }

    if (queueTracker) {
      const queueStepsHtml = queueTimeline.map((item) => {
        const stepClasses = [
          'queue-track-step',
          item.isServing ? 'is-serving' : '',
          item.isPatient ? 'is-patient' : '',
          !item.isServing && !item.isPatient ? 'is-idle' : ''
        ].filter(Boolean).join(' ');

        return `
          <div class="${stepClasses}">
            <span class="queue-track-step-ring"></span>
            <div class="queue-track-step-chip">${escapeHtml(item.token)}</div>
          </div>
        `;
      }).join('');

      queueTracker.innerHTML = `
        <div class="queue-tracker-shell">
          <div class="queue-tracker-header">
            <div class="queue-tracker-title-wrap">
              <h3>Live Queue Tracker</h3>
              <span class="queue-live-badge"><span class="queue-live-dot"></span>LIVE</span>
            </div>
          </div>

          <div class="queue-tracker-panels">
            <div class="queue-status-panel serving-panel">
              <div class="queue-panel-label">Now Serving</div>
              <div class="queue-panel-value">
                <i class="fas fa-check"></i>
                <span>${escapeHtml(nowServingValue)}</span>
              </div>
            </div>

            <div class="queue-status-panel patient-panel">
              <div class="queue-panel-label">Your Token</div>
              <div class="queue-panel-value">
                <span>${escapeHtml(yourTokenValue)}</span>
                <small>${escapeHtml(displayAheadText)}</small>
              </div>
            </div>
          </div>

          <div class="queue-tracker-timeline">
            <div class="queue-timeline-line"></div>
            <div class="queue-timeline-steps">
              ${queueStepsHtml}
            </div>
          </div>

          <div class="queue-tracker-footer">
            <div class="queue-footer-card">
              <i class="fas fa-users"></i>
              <div>
                <span>Patients Ahead</span>
                <strong>${aheadCount}</strong>
              </div>
            </div>
            <div class="queue-footer-card">
              <i class="fas fa-clock"></i>
              <div>
                <span>Estimated Wait</span>
                <strong>${waitMinutes} min</strong>
              </div>
            </div>
            <div class="queue-footer-card">
              <i class="fas fa-ticket"></i>
              <div>
                <span>Matched Token</span>
                <strong>${escapeHtml(yourTokenValue)}</strong>
              </div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    safeText(servingToken, nowServingValue);
    safeText(yourToken, yourTokenValue);
    if (trackerSteps) {
      trackerSteps.innerHTML = queueTimeline.map((item) => {
        const className = item.isServing ? 'step current' : item.isPatient ? 'step served' : 'step';
        return `<div class="${className}">${escapeHtml(item.token)}</div>`;
      }).join('');
    }
  }

  function handleSummaryReschedule(){
    if (upcomingAppointmentSummary?.id) {
      showAppointmentHistory('upcoming');
      return;
    }

    window.location.href = 'booking.html';
  }

  function normalizeAppointmentStatus(status, isUpcoming) {
    const value = String(status || '').toLowerCase();
    if (value.includes('cancel')) return 'cancelled';
    if (value.includes('complete')) return 'completed';
    if (value.includes('queue')) return 'in_queue';
    if (value.includes('confirm') || value.includes('approve')) return 'confirmed';
    return isUpcoming ? 'upcoming' : 'completed';
  }

  function getAppointmentStatusMeta(statusKey) {
    if (statusKey === 'cancelled') {
      return { label: 'Cancelled', badgeClass: 'is-cancelled', icon: 'fa-ban' };
    }
    if (statusKey === 'completed') {
      return { label: 'Completed', badgeClass: 'is-completed', icon: 'fa-circle-check' };
    }
    if (statusKey === 'in_queue') {
      return { label: 'In Queue', badgeClass: 'is-queue', icon: 'fa-users-line' };
    }
    if (statusKey === 'confirmed') {
      return { label: 'Confirmed', badgeClass: 'is-confirmed', icon: 'fa-circle-check' };
    }
    return { label: 'Upcoming', badgeClass: 'is-upcoming', icon: 'fa-calendar-check' };
  }

  function getAppointmentFlowStage(statusKey) {
    if (statusKey === 'cancelled') return 1;
    if (statusKey === 'completed') return 4;
    if (statusKey === 'in_queue') return 3;
    if (statusKey === 'confirmed') return 2;
    return 1;
  }

  function getDoctorInitials(name) {
    const parts = String(name || 'Doctor').trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'DR';
  }

  function getExperienceLabel(appointment) {
    return appointment.experience || appointment.doctorExperience || '12 years';
  }

  function getRatingValue(appointment) {
    return appointment.rating || appointment.doctorRating || '4.8';
  }

  function isOnlineAppointmentMode(appointment) {
    const text = [
      appointment.mode,
      appointment.consultationType,
      appointment.visitType,
      appointment.appointmentType,
      appointment.type
    ].join(' ').toLowerCase();

    return text.includes('online') || text.includes('video') || text.includes('tele');
  }

  function getAppointmentDetailSkeleton() {
    return `
      <div class="appointment-detail-screen appointment-detail-skeleton">
        <div class="appointment-hero">
          <div class="appointment-skeleton-line lg"></div>
          <div class="appointment-skeleton-line md"></div>
          <div class="appointment-skeleton-line sm"></div>
        </div>
        <div class="appointment-detail-container">
          <div class="appointment-card-grid">
            <div class="appointment-info-card skeleton-card"></div>
            <div class="appointment-info-card skeleton-card"></div>
            <div class="appointment-info-card skeleton-card"></div>
          </div>
          <div class="appointment-progress-card skeleton-card"></div>
          <div class="appointment-detail-grid">
            <div class="appointment-panel skeleton-card"></div>
            <div class="appointment-panel skeleton-card"></div>
          </div>
        </div>
      </div>
    `;
  }

  // Expose logout for existing button
  window.logout = function(){ if(confirm('Logout?')){ localStorage.clear(); window.location.href='../index.html' } };

  // Expose appointment detail function
  window.showAppointmentDetail = showAppointmentDetail;

  function getReportParseDate(dateStr) {
    if(!dateStr) return new Date();
    try { return new Date(dateStr); } catch(_error) { return new Date(); }
  }

  function getDoctorHistoryForAppointment(appointment) {
    const targetDoctor = String(appointment?.doctorName || '').trim().toLowerCase();
    if (!targetDoctor) {
      return [];
    }

    return records.filter((record) => {
      const recordDoctor = String(record.doctorName || '').trim().toLowerCase();
      return recordDoctor && recordDoctor === targetDoctor;
    }).sort((a, b) => new Date(b.visitDate || b.createdAt || 0) - new Date(a.visitDate || a.createdAt || 0));
  }

  function renderReportInDom(reportHTML) {
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-10000px';
    host.style.top = '0';
    host.style.width = '900px';
    host.style.background = '#ffffff';
    host.style.zIndex = '-1';
    host.innerHTML = reportHTML;
    document.body.appendChild(host);
    return host;
  }

  async function exportReportElement(element, filename) {
    if (typeof html2pdf === 'undefined') {
      throw new Error('Report engine unavailable');
    }

    const options = {
      margin: 10,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };

    await html2pdf().set(options).from(element).save();
  }

  // Function to show appointment details in modal
  function showAppointmentDetail(appointmentIndex) {
    console.log('📋 showAppointmentDetail called with index:', appointmentIndex);
    console.log('📊 Total appointments in array:', appointments.length);
    
    // Get appointment by index
    if (typeof appointmentIndex !== 'number' || appointmentIndex < 0 || appointmentIndex >= appointments.length) {
      console.error('❌ Invalid appointment index:', appointmentIndex);
      alert('Invalid appointment selected');
      return;
    }
    
    const appointment = appointments[appointmentIndex];
    
    if (!appointment) {
      console.error('❌ Appointment not found at index:', appointmentIndex);
      alert('Appointment not found');
      return;
    }

    console.log('✅ Found appointment:', appointment);

    const parseDate = (dateStr) => {
      if(!dateStr) return new Date();
      try { return new Date(dateStr); } catch(e) { return new Date(); }
    };

    const apptDate = parseDate(appointment.date);
    const fullDate = apptDate.toLocaleDateString('en-IN', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const timeStr = apptDate.toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
    const isUpcoming = apptDate >= new Date();

    try {
      const contentEl = document.getElementById('appointmentDetailContent');
      if (contentEl) {
        contentEl.innerHTML = getAppointmentDetailSkeleton();
        console.log('✅ Appointment skeleton rendered');
      } else {
        console.error('❌ appointmentDetailContent element not found');
        alert('Modal element not found on page');
        return;
      }

      // Show modal
      const modalElement = document.getElementById('appointmentDetailModal');
      if (modalElement) {
        const modal = new bootstrap.Modal(modalElement);
        modal.show();
        console.log('✅ Modal shown successfully');
      } else {
        console.error('❌ appointmentDetailModal element not found');
      }

      const normalizedStatus = normalizeAppointmentStatus(appointment.status, isUpcoming);
      const statusMeta = getAppointmentStatusMeta(normalizedStatus);
      const currentStage = getAppointmentFlowStage(normalizedStatus);
      const doctorName = appointment.doctorName || 'Dr. ---';
      const specialization = appointment.specialization || appointment.department || 'General Consultation';
      const doctorExperience = getExperienceLabel(appointment);
      const doctorRating = getRatingValue(appointment);
      const doctorAvatar = appointment.doctorImage || appointment.image || appointment.avatar || '';
      const doctorInitials = getDoctorInitials(doctorName);
      const locationLabel = appointment.department || appointment.hospital || 'General OPD';
      const locationDetail = appointment.hospital || appointment.clinicAddress || 'Main Hospital Wing';
      const appointmentId = appointment.appointmentId || appointment._id || `APT-${appointmentIndex + 1}`;
      const appointmentReason = appointment.reason || appointment.title || appointment.visitType || 'General consultation and routine follow-up.';
      const appointmentNotes = appointment.notes || appointment.symptoms || appointment.instructions || 'No additional notes shared for this appointment.';
      const appointmentSummary = appointment.summary || appointment.diagnosis || '';
      const isOnline = isOnlineAppointmentMode(appointment);
      const ratingStars = new Array(5).fill(0).map((_, index) => (
        `<i class="${index < Math.round(Number(doctorRating) || 4.8) ? 'fas' : 'far'} fa-star"></i>`
      )).join('');
      const timelineLabels = ['Booked', 'Confirmed', 'In Queue', 'Completed'];

      const html = `
        <div class="appointment-detail-screen">
          <section class="appointment-hero fade-up">
            <div class="appointment-hero-orb orb-one"></div>
            <div class="appointment-hero-orb orb-two"></div>
            <div class="appointment-hero-content">
              <div class="appointment-hero-profile">
                <div class="appointment-avatar-wrap">
                  ${doctorAvatar
                    ? `<img src="${escapeHtml(doctorAvatar)}" alt="${escapeHtml(doctorName)}" class="appointment-avatar-image">`
                    : `<div class="appointment-avatar-fallback">${escapeHtml(doctorInitials)}</div>`}
                </div>
                <div class="appointment-hero-copy">
                  <span class="appointment-hero-label">Appointment Details</span>
                  <h1>${escapeHtml(doctorName)}</h1>
                  <p>${escapeHtml(specialization)}</p>
                  <div class="appointment-hero-meta">
                    <span><i class="fas fa-briefcase-medical"></i>${escapeHtml(doctorExperience)} experience</span>
                    <span><i class="fas fa-star"></i>${escapeHtml(String(doctorRating))}/5 rating</span>
                  </div>
                  <div class="appointment-rating-row">
                    <div class="appointment-stars">${ratingStars}</div>
                    <span class="appointment-rating-caption">Trusted specialist for patient care</span>
                  </div>
                </div>
              </div>
              <div class="appointment-status-pill ${statusMeta.badgeClass}">
                <i class="fas ${statusMeta.icon}"></i>
                <span>${statusMeta.label}</span>
              </div>
            </div>
          </section>

          <div class="appointment-detail-container">
            <section class="appointment-card-grid fade-up">
              <article class="appointment-info-card is-date">
                <div class="appointment-info-icon"><i class="fas fa-calendar-days"></i></div>
                <div>
                  <div class="appointment-info-label">Appointment Date</div>
                  <div class="appointment-info-value">${escapeHtml(fullDate)}</div>
                  <div class="appointment-info-note">Please keep your ID and reports ready</div>
                </div>
              </article>
              <article class="appointment-info-card is-time">
                <div class="appointment-info-icon"><i class="fas fa-clock"></i></div>
                <div>
                  <div class="appointment-info-label">Appointment Time</div>
                  <div class="appointment-info-value">${escapeHtml(timeStr)}</div>
                  <div class="appointment-info-note">Reach 10 minutes before consultation</div>
                </div>
              </article>
              <article class="appointment-info-card is-location">
                <div class="appointment-info-icon"><i class="fas fa-location-dot"></i></div>
                <div>
                  <div class="appointment-info-label">Location / Department</div>
                  <div class="appointment-info-value">${escapeHtml(locationLabel)}</div>
                  <div class="appointment-info-note">${escapeHtml(locationDetail)}</div>
                </div>
              </article>
            </section>

            <section class="appointment-progress-card fade-up">
              <div class="appointment-section-head">
                <div>
                  <h3>Appointment Flow</h3>
                  <p>Track where this visit currently stands</p>
                </div>
                <div class="appointment-id-chip">
                  <i class="fas fa-hashtag"></i>
                  <span>${escapeHtml(String(appointmentId))}</span>
                </div>
              </div>
              <div class="appointment-progress-steps">
                ${timelineLabels.map((label, index) => `
                  <div class="appointment-progress-step ${index + 1 <= currentStage ? 'is-active' : ''} ${normalizedStatus === 'cancelled' && index + 1 > 1 ? 'is-muted' : ''}">
                    <div class="appointment-progress-dot">${index + 1}</div>
                    <div class="appointment-progress-label">${label}</div>
                  </div>
                `).join('')}
              </div>
            </section>

            <section class="appointment-detail-grid">
              <article class="appointment-panel fade-up">
                <div class="appointment-section-head">
                  <div>
                    <h3>Visit Overview</h3>
                    <p>Core details shared for this consultation</p>
                  </div>
                </div>
                <div class="appointment-overview-list">
                  <div class="appointment-overview-item">
                    <span class="key">Reason</span>
                    <strong>${escapeHtml(appointmentReason)}</strong>
                  </div>
                  <div class="appointment-overview-item">
                    <span class="key">Consultation Mode</span>
                    <strong>${escapeHtml(isOnline ? 'Online Video Consultation' : 'In-person Visit')}</strong>
                  </div>
                  <div class="appointment-overview-item">
                    <span class="key">Department</span>
                    <strong>${escapeHtml(locationLabel)}</strong>
                  </div>
                </div>
              </article>

              <article class="appointment-panel fade-up">
                <div class="appointment-section-head">
                  <div>
                    <h3>Notes & Summary</h3>
                    <p>Helpful context for your appointment</p>
                  </div>
                </div>
                <div class="appointment-rich-card">
                  <h4><i class="fas fa-notes-medical"></i>Patient Notes</h4>
                  <p>${escapeHtml(appointmentNotes)}</p>
                </div>
                ${appointmentSummary ? `
                  <div class="appointment-rich-card is-accent">
                    <h4><i class="fas fa-file-waveform"></i>Doctor Summary</h4>
                    <p>${escapeHtml(appointmentSummary)}</p>
                  </div>
                ` : ''}
              </article>
            </section>

            <section class="appointment-actions-card fade-up">
              <div class="appointment-section-head">
                <div>
                  <h3>Quick Actions</h3>
                  <p>Manage this appointment without leaving the dashboard</p>
                </div>
              </div>
              <div class="appointment-actions-row">
                ${isOnline && normalizedStatus !== 'completed' && normalizedStatus !== 'cancelled' ? `
                  <button class="btn appointment-action-btn btn-join" onclick='handleJoinCall(${JSON.stringify(doctorName)})'>
                    <i class="fas fa-video"></i>
                    <span>Join Video Call</span>
                  </button>
                ` : ''}
                ${normalizedStatus !== 'completed' && normalizedStatus !== 'cancelled' ? `
                  <button class="btn appointment-action-btn btn-reschedule" onclick="handleReschedule()">
                    <i class="fas fa-calendar-plus"></i>
                    <span>Reschedule</span>
                  </button>
                  <button class="btn appointment-action-btn btn-cancel" onclick='handleCancelAppointment(${JSON.stringify(String(appointmentId))})'>
                    <i class="fas fa-xmark"></i>
                    <span>Cancel Appointment</span>
                  </button>
                ` : `
                  <button class="btn appointment-action-btn btn-download" onclick="downloadAppointmentReport(${appointmentIndex})">
                    <i class="fas fa-download"></i>
                    <span>Download Report</span>
                  </button>
                  <button class="btn appointment-action-btn btn-rebook" onclick="handleRebook()">
                    <i class="fas fa-rotate-right"></i>
                    <span>Book Again</span>
                  </button>
                `}
              </div>
            </section>
          </div>
        </div>
      `;

      setTimeout(() => {
        const refreshedContentEl = document.getElementById('appointmentDetailContent');
        if (refreshedContentEl) {
          refreshedContentEl.innerHTML = html;
          console.log('✅ Modal content updated');
        }
      }, 80);
    } catch (error) {
      console.error('❌ Error in showAppointmentDetail:', error);
      alert('Error displaying appointment details: ' + error.message);
    }
  }

  // Function to generate and download appointment report as PDF
  window.downloadAppointmentReport = async function(appointmentIndex) {
    try {
      console.log('📄 Generating report for appointment index:', appointmentIndex);
      
      if (appointmentIndex === undefined || appointmentIndex === null) {
        // If no specific appointment, generate full history report
        generateFullAppointmentReport();
        return;
      }

      const appointment = appointments[appointmentIndex];
      if (!appointment) {
        alert('Appointment not found');
        return;
      }

      const apptDate = getReportParseDate(appointment.date);
      const doctorHistory = getDoctorHistoryForAppointment(appointment);
      const historyMarkup = doctorHistory.length
        ? doctorHistory.map((record, index) => `
            <tr>
              <td style="padding: 10px; border: 1px solid #e2e8f0;">${index + 1}</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0;">${new Date(record.visitDate || record.createdAt || Date.now()).toLocaleDateString('en-IN')}</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0;">${record.visitType || record.diagnosis || 'Consultation'}</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0;">${record.diagnosis || 'NA'}</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0;">${record.notes || record.precautions || 'No notes available'}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="5" style="padding: 18px; text-align:center; color:#64748b; border: 1px solid #e2e8f0;">No previous history found with this doctor</td></tr>';

      const reportHTML = `
        <div style="font-family: Arial, sans-serif; padding: 40px; background: white;">
          <div style="text-align: center; margin-bottom: 30px; border-bottom: 3px solid #06b6d4; padding-bottom: 20px;">
            <h1 style="color: #06b6d4; margin: 0; font-size: 28px;">HEALTHQUEUE</h1>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">Medical Appointment Report</p>
          </div>

          <div style="margin-bottom: 30px;">
            <h2 style="color: #1e293b; font-size: 18px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Appointment Details</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
              <tr>
                <td style="padding: 12px; background: #f0f9ff; font-weight: bold; width: 40%; border: 1px solid #e0f2fe;">Doctor Name:</td>
                <td style="padding: 12px; background: #fafbfc; border: 1px solid #e2e8f0;">${appointment.doctorName || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 12px; background: #f0f9ff; font-weight: bold; border: 1px solid #e0f2fe;">Specialization:</td>
                <td style="padding: 12px; background: #fafbfc; border: 1px solid #e2e8f0;">${appointment.specialization || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 12px; background: #f0f9ff; font-weight: bold; border: 1px solid #e0f2fe;">Hospital:</td>
                <td style="padding: 12px; background: #fafbfc; border: 1px solid #e2e8f0;">${appointment.hospital || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 12px; background: #f0f9ff; font-weight: bold; border: 1px solid #e0f2fe;">Appointment Date:</td>
                <td style="padding: 12px; background: #fafbfc; border: 1px solid #e2e8f0;">${apptDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
              </tr>
              <tr>
                <td style="padding: 12px; background: #f0f9ff; font-weight: bold; border: 1px solid #e0f2fe;">Time:</td>
                <td style="padding: 12px; background: #fafbfc; border: 1px solid #e2e8f0;">${apptDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</td>
              </tr>
              <tr>
                <td style="padding: 12px; background: #f0f9ff; font-weight: bold; border: 1px solid #e0f2fe;">Status:</td>
                <td style="padding: 12px; background: #fafbfc; border: 1px solid #e2e8f0;">${appointment.status || 'Completed'}</td>
              </tr>
              ${appointment.reason ? `
              <tr>
                <td style="padding: 12px; background: #f0f9ff; font-weight: bold; border: 1px solid #e0f2fe;">Reason for Visit:</td>
                <td style="padding: 12px; background: #fafbfc; border: 1px solid #e2e8f0;">${appointment.reason}</td>
              </tr>
              ` : ''}
              ${appointment.notes ? `
              <tr>
                <td style="padding: 12px; background: #f0f9ff; font-weight: bold; border: 1px solid #e0f2fe;">Notes:</td>
                <td style="padding: 12px; background: #fafbfc; border: 1px solid #e2e8f0;">${appointment.notes}</td>
              </tr>
              ` : ''}
              ${appointment.summary ? `
              <tr>
                <td style="padding: 12px; background: #f0f9ff; font-weight: bold; border: 1px solid #e0f2fe;">Summary:</td>
                <td style="padding: 12px; background: #fafbfc; border: 1px solid #e2e8f0;">${appointment.summary}</td>
              </tr>
              ` : ''}
            </table>
          </div>

          <div style="margin-bottom: 30px;">
            <h2 style="color: #1e293b; font-size: 18px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">History With This Doctor</h2>
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
              <thead>
                <tr style="background: #06b6d4; color: white;">
                  <th style="padding: 12px; border: 1px solid #06b6d4; text-align: left;">S.No</th>
                  <th style="padding: 12px; border: 1px solid #06b6d4; text-align: left;">Visit Date</th>
                  <th style="padding: 12px; border: 1px solid #06b6d4; text-align: left;">Type</th>
                  <th style="padding: 12px; border: 1px solid #06b6d4; text-align: left;">Diagnosis</th>
                  <th style="padding: 12px; border: 1px solid #06b6d4; text-align: left;">Notes</th>
                </tr>
              </thead>
              <tbody>${historyMarkup}</tbody>
            </table>
          </div>

          <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #e2e8f0; text-align: center; color: #999; font-size: 12px;">
            <p>This is an official medical record from HealthQueue. Generated on ${new Date().toLocaleString('en-IN')}</p>
          </div>
        </div>
      `;

      const host = renderReportInDom(reportHTML);
      await exportReportElement(host, `appointment_report_${appointment.appointmentId || appointmentIndex}.pdf`);
      host.remove();
      console.log('✅ Report downloaded successfully');
    } catch (error) {
      console.error('❌ Error generating report:', error);
      alert('Error downloading report: ' + error.message);
    }
  };

  // Function to generate full appointment history report
  window.generateFullAppointmentReport = async function() {
    try {
      console.log('📋 Generating full appointment history report');

      let appointmentRows = '';
      appointments.forEach((apt, idx) => {
        const apptDate = getReportParseDate(apt.date);
        const dateStr = apptDate.toLocaleDateString('en-IN');
        const timeStr = apptDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        
        appointmentRows += `
          <tr>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${idx + 1}</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${apt.doctorName || 'N/A'}</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${apt.specialization || 'N/A'}</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${dateStr}</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${timeStr}</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${apt.status || 'Completed'}</td>
          </tr>
        `;
      });

      const recordRows = records.length
        ? records.map((record, idx) => `
            <tr>
              <td style="padding: 10px; border: 1px solid #e2e8f0;">${idx + 1}</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0;">${record.doctorName || 'N/A'}</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0;">${new Date(record.visitDate || record.createdAt || Date.now()).toLocaleDateString('en-IN')}</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0;">${record.diagnosis || record.visitType || 'Consultation'}</td>
              <td style="padding: 10px; border: 1px solid #e2e8f0;">${record.notes || record.precautions || 'No notes available'}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #999;">No medical history found</td></tr>';

      const reportHTML = `
        <div style="font-family: Arial, sans-serif; padding: 40px; background: white;">
          <div style="text-align: center; margin-bottom: 30px; border-bottom: 3px solid #06b6d4; padding-bottom: 20px;">
            <h1 style="color: #06b6d4; margin: 0; font-size: 28px;">HEALTHQUEUE</h1>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">Complete Appointment History Report</p>
          </div>

          <div style="margin-bottom: 20px;">
            <h3 style="color: #1e293b; margin: 0;">Patient: ${user.name || 'Patient'}</h3>
            <p style="color: #666; margin: 5px 0 0 0;">Generated: ${new Date().toLocaleString('en-IN')}</p>
          </div>

          <div style="margin-bottom: 30px;">
            <h2 style="color: #1e293b; font-size: 18px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Appointment Records</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
              <thead>
                <tr style="background: #06b6d4; color: white;">
                  <th style="padding: 12px; border: 1px solid #06b6d4; text-align: left;">S.No</th>
                  <th style="padding: 12px; border: 1px solid #06b6d4; text-align: left;">Doctor</th>
                  <th style="padding: 12px; border: 1px solid #06b6d4; text-align: left;">Specialization</th>
                  <th style="padding: 12px; border: 1px solid #06b6d4; text-align: left;">Date</th>
                  <th style="padding: 12px; border: 1px solid #06b6d4; text-align: left;">Time</th>
                  <th style="padding: 12px; border: 1px solid #06b6d4; text-align: left;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${appointmentRows || '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #999;">No appointments found</td></tr>'}
              </tbody>
            </table>
          </div>

          <div style="margin-bottom: 30px;">
            <h2 style="color: #1e293b; font-size: 18px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Doctor Treatment History</h2>
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
              <thead>
                <tr style="background: #06b6d4; color: white;">
                  <th style="padding: 12px; border: 1px solid #06b6d4; text-align: left;">S.No</th>
                  <th style="padding: 12px; border: 1px solid #06b6d4; text-align: left;">Doctor</th>
                  <th style="padding: 12px; border: 1px solid #06b6d4; text-align: left;">Date</th>
                  <th style="padding: 12px; border: 1px solid #06b6d4; text-align: left;">Diagnosis</th>
                  <th style="padding: 12px; border: 1px solid #06b6d4; text-align: left;">Notes</th>
                </tr>
              </thead>
              <tbody>${recordRows}</tbody>
            </table>
          </div>

          <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #e2e8f0; text-align: center; color: #999; font-size: 12px;">
            <p>This is an official medical record from HealthQueue. Keep this for your records.</p>
          </div>
        </div>
      `;

      const host = renderReportInDom(reportHTML);
      await exportReportElement(host, `appointment_history_${user._id || 'patient'}.pdf`);
      host.remove();
      console.log('✅ Full report downloaded successfully');
    } catch (error) {
      console.error('❌ Error generating full report:', error);
      alert('Error downloading report: ' + error.message);
    }
  };

  // Action button handlers
  window.handleReschedule = function() {
    handleSummaryReschedule();
  };

  window.handleJoinCall = function(doctorName) {
    alert('Video call with ' + (doctorName || 'doctor') + ' - Connecting now...');
  };

  window.handleCancelAppointment = function(appointmentId) {
    alert('Cancel appointment request for ' + (appointmentId || 'this appointment') + ' will be available soon.');
  };

  window.handleRebook = function() {
    window.location.href = 'booking.html';
  };

  init();
})();
