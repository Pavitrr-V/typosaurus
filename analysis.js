// Analysis page — loads typing history/statistics and renders stat tiles, SVG line charts, category breakdown, history
// Class names here are set/toggled from analysis.js (.hidden, .category-row, .history-row).

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbysk8XF0SfRD_1rbOTfZ2XIQ12S-wE1jR6J5ga7ltEA0GCTxKZeMPYSM_QeW0HTVS9ugA/exec";

// Auth helpers
function getAuthenticatedToken() { return localStorage.getItem("typingAuthToken"); }
function getAuthenticatedUser() {
  const token = getAuthenticatedToken();
  const storedUser = localStorage.getItem("typingUser");
  if (!token || !storedUser) return null;
  try { return JSON.parse(storedUser); } catch (error) { console.error("Invalid stored user:", error); return null; }
}
function getGuestId() {
  let guestId = localStorage.getItem("typingGuestId");
  if (!guestId) {
    guestId = "GUEST_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8).toUpperCase();
    localStorage.setItem("typingGuestId", guestId);
  }
  return guestId;
}
function isAuthenticated() { return Boolean(getAuthenticatedToken() && getAuthenticatedUser()); }

// DOM refs
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const errorMessage = document.getElementById("errorMessage");
const emptyState = document.getElementById("emptyState");
const analysisContent = document.getElementById("analysisContent");
const totalTests = document.getElementById("totalTests");
const averageWpm = document.getElementById("averageWpm");
const averageAccuracy = document.getElementById("averageAccuracy");
const totalTime = document.getElementById("totalTime");
const bestWpm = document.getElementById("bestWpm");
const bestAccuracy = document.getElementById("bestAccuracy");
const recordWpm = document.getElementById("recordWpm");
const recordAccuracy = document.getElementById("recordAccuracy");
const wpmChart = document.getElementById("wpmChart");
const accuracyChart = document.getElementById("accuracyChart");
const categoryList = document.getElementById("categoryList");
const historyList = document.getElementById("historyList");
const progressTitle = document.getElementById("progressTitle");
const progressText = document.getElementById("progressText");
const refreshButton = document.getElementById("refreshButton");
const retryButton = document.getElementById("retryButton");

// Number helpers
function number(value) { const r = Number(value); return Number.isFinite(r) ? r : 0; }
function formatNumber(value, decimals = 1) { return number(value).toFixed(decimals); }
function formatTime(seconds) {
  seconds = Math.max(0, Math.round(number(seconds)));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Coerce a raw session into consistent fields
function normalizeSession(session) {
  return {
    category: String(session.category || "Unknown"),
    wpm: number(session.wpm),
    accuracy: number(session.accuracy),
    durationSeconds: number(session.durationSeconds),
    totalCharacters: number(session.totalCharacters),
    correctCharacters: number(session.correctCharacters),
    incorrectCharacters: number(session.incorrectCharacters),
    startTime: session.startTime || null,
    endTime: session.endTime || null,
  };
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Server returned HTTP " + response.status);
  let data;
  try { data = await response.json(); } catch { throw new Error("The server returned an invalid response."); }
  return data;
}

// Extract sessions array from a response (varied shapes)
function sessionsFrom(response) {
  if (response && Array.isArray(response.data)) return response.data;
  if (response && Array.isArray(response.sessions)) return response.sessions;
  if (Array.isArray(response)) return response;
  return [];
}

// Fetch history for the authenticated user or guest
async function fetchTypingHistory() {
  const token = getAuthenticatedToken();
  const query = token ? "&token=" + encodeURIComponent(token) : "&guestUserId=" + encodeURIComponent(getGuestId());
  const response = await getJson(APPS_SCRIPT_URL + "?action=history" + query);
  if (!response.success) throw new Error(response.message || "Could not load your typing history.");
  return sessionsFrom(response).map(normalizeSession);
}

// Fetch aggregate statistics for the authenticated user or guest
async function fetchTypingStatistics() {
  const token = getAuthenticatedToken();
  const query = token ? "&token=" + encodeURIComponent(token) : "&guestUserId=" + encodeURIComponent(getGuestId());
  const response = await getJson(APPS_SCRIPT_URL + "?action=statistics" + query);
  if (!response.success) throw new Error(response.message || "Could not load your typing statistics.");
  return response.data || null;
}

// Main load: fetch everything, render or show empty/error
async function loadAnalysis() {
  showLoading();
  try {
    const [sessions, backendStatistics] = await Promise.all([fetchTypingHistory(), fetchTypingStatistics()]);
    console.log("Backend statistics:", backendStatistics);
    if (!sessions.length) { showEmpty(); return; }
    renderAnalysis(sessions);
  } catch (error) {
    console.error("Analysis error:", error);
    const message = String(error.message || "").toLowerCase();
    // Expired/invalid session → drop auth and retry as guest (no redirect)
    if (isAuthenticated() && ["session has expired", "authentication required", "invalid authentication", "user account not found"].some(k => message.includes(k))) {
      localStorage.removeItem("typingAuthToken");
      localStorage.removeItem("typingUser");
      loadAnalysis();
      return;
    }
    showError(error.message || "Could not load your analysis.");
  }
}

// State cards
function showLoading() { loadingState && loadingState.classList.remove("hidden"); errorState && errorState.classList.add("hidden"); emptyState && emptyState.classList.add("hidden"); analysisContent && analysisContent.classList.add("hidden"); }
function showError(message) { loadingState && loadingState.classList.add("hidden"); errorState && errorState.classList.remove("hidden"); emptyState && emptyState.classList.add("hidden"); analysisContent && analysisContent.classList.add("hidden"); if (errorMessage) errorMessage.textContent = message; }
function showEmpty() { loadingState && loadingState.classList.add("hidden"); errorState && errorState.classList.add("hidden"); emptyState && emptyState.classList.remove("hidden"); analysisContent && analysisContent.classList.add("hidden"); }
function showDashboard() { loadingState && loadingState.classList.add("hidden"); errorState && errorState.classList.add("hidden"); emptyState && emptyState.classList.add("hidden"); analysisContent && analysisContent.classList.remove("hidden"); }

// Summary stats across all sessions
function calculateStats(sessions) {
  const tests = sessions.length;
  if (!tests) return { tests: 0, averageWpm: 0, averageAccuracy: 0, totalTime: 0, bestWpm: 0, bestAccuracy: 0 };
  const totalWpm = sessions.reduce((s, i) => s + i.wpm, 0);
  const totalAccuracy = sessions.reduce((s, i) => s + i.accuracy, 0);
  const totalTime = sessions.reduce((s, i) => s + i.durationSeconds, 0);
  return {
    tests,
    averageWpm: totalWpm / tests,
    averageAccuracy: totalAccuracy / tests,
    totalTime,
    bestWpm: Math.max(...sessions.map(i => i.wpm)),
    bestAccuracy: Math.max(...sessions.map(i => i.accuracy)),
  };
}

// Per-category aggregates
function calculateCategories(sessions) {
  const categories = {};
  sessions.forEach(session => {
    const name = session.category;
    if (!categories[name]) categories[name] = { tests: 0, totalWpm: 0, totalAccuracy: 0, bestWpm: 0, bestAccuracy: 0 };
    const c = categories[name];
    c.tests++;
    c.totalWpm += session.wpm;
    c.totalAccuracy += session.accuracy;
    c.bestWpm = Math.max(c.bestWpm, session.wpm);
    c.bestAccuracy = Math.max(c.bestAccuracy, session.accuracy);
  });
  Object.values(categories).forEach(c => { c.averageWpm = c.totalWpm / c.tests; c.averageAccuracy = c.totalAccuracy / c.tests; });
  return categories;
}

// Render the whole dashboard
function renderAnalysis(sessions) {
  showDashboard();
  const stats = calculateStats(sessions);
  const categories = calculateCategories(sessions);
  if (totalTests) totalTests.textContent = stats.tests;
  if (averageWpm) averageWpm.textContent = formatNumber(stats.averageWpm);
  if (averageAccuracy) averageAccuracy.textContent = formatNumber(stats.averageAccuracy);
  if (totalTime) totalTime.textContent = formatTime(stats.totalTime);
  if (bestWpm) bestWpm.textContent = formatNumber(stats.bestWpm);
  if (bestAccuracy) bestAccuracy.textContent = formatNumber(stats.bestAccuracy);
  if (recordWpm) recordWpm.textContent = formatNumber(stats.bestWpm);
  if (recordAccuracy) recordAccuracy.textContent = formatNumber(stats.bestAccuracy);
  renderWpmChart(sessions);
  renderAccuracyChart(sessions);
  renderProgressSummary(sessions, stats);
  renderCategories(categories);
  renderHistory(sessions);
}

// Chart: shell with zoom toolbar, fixed y-axis, scrollable SVG plot, tooltip
const CHART_MIN_ZOOM = 1;
const CHART_MAX_ZOOM = 12;
const CHART_ZOOM_FACTOR = 1.5;
const CHART_SCROLLBAR_SPACE = 10;
const chartStates = new Map();

function createChart(container, sessions, valueKey, suffix = "") {
  if (!container) return;
  if (!sessions.length) {
    container.innerHTML = '<div class="chart-empty">No data yet</div>';
    chartStates.delete(container);
    return;
  }
  const previous = chartStates.get(container);
  const state = {
    container, sessions, valueKey, suffix,
    zoom: previous && previous.zoom ? previous.zoom : CHART_MIN_ZOOM,
    observer: previous ? previous.observer : null,
    activeIndex: null,
  };
  chartStates.set(container, state);

  container.innerHTML = `
    <div class="chart-shell">
      <div class="chart-toolbar">
        <button type="button" class="chart-zoom-button" data-zoom="out" title="Zoom out" aria-label="Zoom out">−</button>
        <span class="chart-zoom-level">1.0×</span>
        <button type="button" class="chart-zoom-button" data-zoom="in" title="Zoom in" aria-label="Zoom in">+</button>
        <button type="button" class="chart-zoom-button chart-zoom-reset" data-zoom="reset" title="Reset zoom" aria-label="Reset zoom">↺</button>
      </div>
      <div class="chart-body">
        <div class="chart-yaxis"></div>
        <div class="chart-scroll"><div class="chart-plot"></div></div>
      </div>
      <div class="chart-tooltip hidden"></div>
    </div>`;

  state.shell = container.querySelector(".chart-shell");
  state.body = container.querySelector(".chart-body");
  state.yAxis = container.querySelector(".chart-yaxis");
  state.scroll = container.querySelector(".chart-scroll");
  state.plot = container.querySelector(".chart-plot");
  state.tooltip = container.querySelector(".chart-tooltip");
  state.zoomLabel = container.querySelector(".chart-zoom-level");

  container.querySelectorAll(".chart-zoom-button").forEach(button => {
    button.addEventListener("click", () => {
      const mode = button.dataset.zoom;
      if (mode === "in") setChartZoom(state, state.zoom * CHART_ZOOM_FACTOR);
      else if (mode === "out") setChartZoom(state, state.zoom / CHART_ZOOM_FACTOR);
      else setChartZoom(state, CHART_MIN_ZOOM);
    });
  });
  state.scroll.addEventListener("scroll", () => hideChartTooltip(state));
  state.shell.addEventListener("mouseleave", () => hideChartTooltip(state));
  enableChartPanning(state);
  drawChart(state);

  // Redraw when the card resizes
  if (!state.observer && typeof ResizeObserver !== "undefined") {
    state.observer = new ResizeObserver(() => { const c = chartStates.get(container); if (c) drawChart(c); });
    state.observer.observe(container);
  }
}

// Clamp zoom and re-draw keeping the visible center
function setChartZoom(state, zoom) {
  const next = Math.min(CHART_MAX_ZOOM, Math.max(CHART_MIN_ZOOM, zoom));
  if (Math.abs(next - state.zoom) < 0.001) return;
  const scroll = state.scroll;
  const visible = scroll.clientWidth || 1;
  const centerRatio = (scroll.scrollLeft + visible / 2) / (scroll.scrollWidth || 1);
  state.zoom = next;
  hideChartTooltip(state);
  drawChart(state);
  scroll.scrollLeft = centerRatio * scroll.scrollWidth - (scroll.clientWidth || 1) / 2;
}

// Drag-to-pan on the scroll area
function enableChartPanning(state) {
  const scroll = state.scroll;
  let dragging = false;
  let startX = 0;
  let startScroll = 0;
  scroll.addEventListener("mousedown", event => {
    if (event.button !== 0 || scroll.scrollWidth <= scroll.clientWidth + 1) return;
    dragging = true;
    startX = event.clientX;
    startScroll = scroll.scrollLeft;
    scroll.classList.add("is-panning");
    hideChartTooltip(state);
    event.preventDefault();
  });
  window.addEventListener("mousemove", event => { if (dragging) scroll.scrollLeft = startScroll - (event.clientX - startX); });
  window.addEventListener("mouseup", () => { if (dragging) { dragging = false; scroll.classList.remove("is-panning"); } });
}

// Draw the SVG line/area chart
function drawChart(state) {
  if (!state.plot || !state.scroll) return;
  const viewportWidth = Math.max(state.scroll.clientWidth || 0, 240);
  const height = Math.max((state.body.clientHeight || 0) - CHART_SCROLLBAR_SPACE, 130);
  const width = Math.round(viewportWidth * state.zoom);
  const paddingLeft = 14, paddingRight = 14, paddingTop = 16, paddingBottom = 26;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const values = state.sessions.map(s => number(s[state.valueKey]));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 5; max += 5; }
  const range = max - min;
  const x = i => values.length === 1 ? width / 2 : paddingLeft + (i / (values.length - 1)) * chartWidth;
  const y = v => paddingTop + (1 - (v - min) / range) * chartHeight;

  const points = values.map((value, index) => ({ x: x(index), y: y(value), value }));
  const line = points.map((p, i) => (i === 0 ? "M" : "L") + ` ${p.x} ${p.y}`).join(" ");
  const area = line + ` L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`;

  // Grid lines in the SVG + labels in the fixed gutter
  let grid = "";
  let axisLabels = "";
  [0, 1, 2, 3].forEach(step => {
    const ratio = step / 3;
    const yy = paddingTop + ratio * chartHeight;
    const label = max - ratio * range;
    grid += `<line x1="0" y1="${yy}" x2="${width}" y2="${yy}" stroke="#eef0f2" stroke-width="1" />`;
    axisLabels += `<span style="top: ${yy}px">${formatNumber(label, 0)}${state.suffix}</span>`;
  });

  // X labels ~every 60px so zooming reveals more test numbers
  const labelStep = Math.max(1, Math.ceil((values.length * 60) / Math.max(chartWidth, 1)));
  let labels = "";
  points.forEach((point, index) => {
    if (index % labelStep !== 0 && index !== values.length - 1) return;
    labels += `<text x="${point.x}" y="${height - 8}" text-anchor="middle" fill="#a0a4aa" font-size="10">${index + 1}</text>`;
  });

  // Dots + invisible larger hit targets
  const dotRadius = state.zoom > 3 ? 5 : 4;
  let dots = "";
  points.forEach((point, index) => {
    dots += `<circle class="chart-dot" data-index="${index}" cx="${point.x}" cy="${point.y}" r="${dotRadius}" fill="#ffffff" stroke="#3787d8" stroke-width="2" />`;
    dots += `<circle class="chart-hit" data-index="${index}" cx="${point.x}" cy="${point.y}" r="14" fill="transparent" />`;
  });

  state.plot.style.width = width + "px";
  state.plot.style.height = height + "px";
  state.plot.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Typing performance graph">
    ${grid}
    <path d="${area}" fill="rgba(55, 135, 216, 0.06)" stroke="none" />
    <path d="${line}" fill="none" stroke="#3787d8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    ${dots}
    ${labels}
  </svg>`;

  state.yAxis.innerHTML = axisLabels;
  state.yAxis.style.height = height + "px";
  if (state.zoomLabel) state.zoomLabel.textContent = state.zoom.toFixed(1) + "×";

  state.container.querySelectorAll(".chart-zoom-button").forEach(button => {
    const mode = button.dataset.zoom;
    if (mode === "in") button.disabled = state.zoom >= CHART_MAX_ZOOM - 0.001;
    else button.disabled = state.zoom <= CHART_MIN_ZOOM + 0.001;
  });
  state.scroll.classList.toggle("is-zoomed", state.zoom > CHART_MIN_ZOOM + 0.001);
  attachChartDotEvents(state);
}

// Tooltip wiring per dot (hover + tap)
function attachChartDotEvents(state) {
  state.plot.querySelectorAll(".chart-hit").forEach(hit => {
    const index = Number(hit.dataset.index);
    hit.addEventListener("mouseenter", () => showChartTooltip(state, index));
    hit.addEventListener("mouseleave", () => hideChartTooltip(state));
    hit.addEventListener("click", event => {
      event.stopPropagation();
      if (state.activeIndex === index) hideChartTooltip(state);
      else showChartTooltip(state, index);
    });
  });
}

function showChartTooltip(state, index) {
  const session = state.sessions[index];
  if (!session || !state.tooltip) return;
  const value = number(session[state.valueKey]);
  const isAccuracy = state.valueKey === "accuracy";
  const metricLabel = isAccuracy ? "Accuracy" : "Speed";
  const metricValue = isAccuracy ? formatNumber(value) + "%" : formatNumber(value) + " WPM";
  state.tooltip.innerHTML = `
    <div class="chart-tooltip-title">Test ${index + 1} of ${state.sessions.length}</div>
    <div class="chart-tooltip-row"><span>Category</span><strong>${escapeHtml(session.category)}</strong></div>
    <div class="chart-tooltip-row"><span>${metricLabel}</span><strong>${metricValue}</strong></div>
    <div class="chart-tooltip-row"><span>Date</span><strong>${escapeHtml(formatDate(session.endTime || session.startTime))}</strong></div>`;
  state.tooltip.classList.remove("hidden");
  highlightChartDot(state, index);
  const dot = state.plot.querySelector(`.chart-dot[data-index="${index}"]`);
  if (!dot) return;
  const shellRect = state.shell.getBoundingClientRect();
  const dotRect = dot.getBoundingClientRect();
  const tipRect = state.tooltip.getBoundingClientRect();
  let left = dotRect.left + dotRect.width / 2 - shellRect.left - tipRect.width / 2;
  left = Math.max(4, Math.min(left, shellRect.width - tipRect.width - 4));
  let top = dotRect.top - shellRect.top - tipRect.height - 12;
  if (top < 0) top = dotRect.bottom - shellRect.top + 12;
  state.tooltip.style.left = left + "px";
  state.tooltip.style.top = top + "px";
  state.activeIndex = index;
}

function hideChartTooltip(state) {
  if (!state.tooltip) return;
  state.tooltip.classList.add("hidden");
  state.activeIndex = null;
  highlightChartDot(state, null);
}
function highlightChartDot(state, index) {
  state.plot.querySelectorAll(".chart-dot").forEach(dot => dot.classList.toggle("is-active", Number(dot.dataset.index) === index));
}

function renderWpmChart(sessions) { createChart(wpmChart, sessions, "wpm", ""); }
function renderAccuracyChart(sessions) { createChart(accuracyChart, sessions, "accuracy", "%"); }

// Short text verdict comparing first and latest test
function renderProgressSummary(sessions, stats) {
  if (!progressTitle || !progressText) return;
  if (sessions.length === 1) {
    progressTitle.textContent = "Your baseline is ready";
    progressText.textContent = `You started at ${stats.averageWpm.toFixed(1)} WPM with ${stats.averageAccuracy.toFixed(1)}% accuracy. Complete more tests to see your progress.`;
    return;
  }
  const sorted = [...sessions].sort((a, b) => new Date(a.endTime || a.startTime || 0) - new Date(b.endTime || b.startTime || 0));
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  const speedChange = first.wpm === 0 ? 0 : ((latest.wpm - first.wpm) / first.wpm) * 100;
  if (speedChange > 3) {
    progressTitle.textContent = "You're getting faster";
    progressText.textContent = `Your latest test is ${speedChange.toFixed(1)}% faster than your first test. Keep the momentum going.`;
  } else if (speedChange < -3) {
    progressTitle.textContent = "Focus on consistency";
    progressText.textContent = `Your latest speed is ${Math.abs(speedChange).toFixed(1)}% below your first test. A steady pace and clean keystrokes can help.`;
  } else {
    progressTitle.textContent = "Your speed is steady";
    progressText.textContent = `You've completed ${sessions.length} tests. Keep practicing and your graph will reveal your improvement over time.`;
  }
}

// Category rows sorted by average WPM
function renderCategories(categories) {
  if (!categoryList) return;
  categoryList.innerHTML = "";
  const entries = Object.entries(categories).sort((a, b) => b[1].averageWpm - a[1].averageWpm);
  if (!entries.length) { categoryList.innerHTML = '<div class="chart-empty">No category data yet.</div>'; return; }
  entries.forEach(([name, data]) => {
    const row = document.createElement("div");
    row.className = "category-row";
    row.innerHTML = `
      <div class="category-name">${escapeHtml(name)}</div>
      <div class="category-tests">${data.tests} ${data.tests === 1 ? "test" : "tests"}</div>
      <div class="category-score">${formatNumber(data.averageWpm)} <small>WPM</small></div>`;
    categoryList.appendChild(row);
  });
}

// Recent sessions (newest first, up to 8)
function renderHistory(sessions) {
  if (!historyList) return;
  historyList.innerHTML = "";
  const sorted = [...sessions].sort((a, b) => new Date(b.endTime || b.startTime || 0) - new Date(a.endTime || a.startTime || 0));
  sorted.slice(0, 8).forEach(session => {
    const row = document.createElement("div");
    row.className = "history-row";
    row.innerHTML = `
      <div>
        <div class="history-category">${escapeHtml(session.category)}</div>
        <div class="history-date">${formatDate(session.endTime || session.startTime)}</div>
      </div>
      <div class="history-stat">${formatNumber(session.wpm)} <small>WPM</small></div>
      <div class="history-stat">${formatNumber(session.accuracy)}%</div>
      <div class="history-stat">${formatTime(session.durationSeconds)}</div>`;
    historyList.appendChild(row);
  });
}

// Events + init
if (refreshButton) refreshButton.addEventListener("click", loadAnalysis);
if (retryButton) retryButton.addEventListener("click", loadAnalysis);
loadAnalysis();