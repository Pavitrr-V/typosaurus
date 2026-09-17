// League system (shared across pages) — turns total score into a tier, renders the small badge (topbar + leaderboard), and shows a full-screen promotion animation on rank-up.
// Loaded on every page BEFORE account.js / leaderboard.js. Namespaced under the `Leagues` global. Depends on nothing else.

const LEAGUE_API_URL = "https://script.google.com/macros/s/AKfycbysk8XF0SfRD_1rbOTfZ2XIQ12S-wE1jR6J5ga7ltEA0GCTxKZeMPYSM_QeW0HTVS9ugA/exec";

// LEVEL TABLE — single source of truth; nothing else hard-codes a score number.
// 70 levels; threshold = (level - 1) * 2000 (Level 1 = 0, Level 2 = 2000, ...). Ordered highest first so getLeague() picks the first qualifying tier.
const LEVELS_COUNT = 70;
const LEVEL_SCORE_INTERVAL = 2000;
// Every level uses the same two-upward-arrow icon; the 8 color pairs cycle for visual variety.
const LEVEL_STYLES = Array.from({ length: 8 }, () => ({ icon: iconChevrons(), color: "#6b8e23", glow: "#e3eccd" }));

const LEAGUE_TIERS = (function buildLeagueLevels() {
  const tiers = [];
  for (let level = LEVELS_COUNT; level >= 1; level--) {
    const style = LEVEL_STYLES[(level - 1) % LEVEL_STYLES.length];
    tiers.push({ key: "level-" + level, name: "Level " + level, minScore: (level - 1) * LEVEL_SCORE_INTERVAL, color: style.color, glow: style.glow, icon: style.icon });
  }
  return tiers;
})();

// Icons — inline SVG, colored via currentColor so one CSS rule recolors every badge.
function iconChevrons() {
  return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 17 6-6 6 6"/><path d="m6 10 6-6 6 6"/></svg>';
}

// Tier lookup
function getLeague(score) {
  score = Math.max(0, Number(score) || 0);
  for (const tier of LEAGUE_TIERS) {
    if (score >= tier.minScore) return tier;
  }
  return LEAGUE_TIERS[LEAGUE_TIERS.length - 1];
}
// Level ordinal (0 = Level 1); used only to detect "did they just rank up".
function getLeagueIndex(score) { return LEAGUE_TIERS.length - 1 - LEAGUE_TIERS.indexOf(getLeague(score)); }
// Next tier up, or null at the top.
function getNextLeague(score) {
  const position = LEAGUE_TIERS.indexOf(getLeague(score));
  return position > 0 ? LEAGUE_TIERS[position - 1] : null;
}
// 0-1 progress toward next tier (1 if maxed).
function getLeagueProgress(score) {
  score = Math.max(0, Number(score) || 0);
  const tier = getLeague(score);
  const next = getNextLeague(score);
  if (!next) return 1;
  const span = next.minScore - tier.minScore;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (score - tier.minScore) / span));
}

// Badge rendering — size: "sm" (leaderboard rows) or "md" (topbar).
function renderLeagueBadge(score, size) {
  const tier = getLeague(score);
  size = size === "sm" ? "sm" : "md";
  return `<span class="league-badge league-badge-${size}" style="--league-color: ${tier.color}; --league-glow: ${tier.glow};" title="${tier.name}"><span class="league-badge-icon">${tier.icon}</span><span class="league-badge-name">${tier.name}</span></span>`;
}
// Small "X / Y to next tier" row for the topbar hover popover; "" if already top tier.
function renderLeagueProgress(score) {
  const next = getNextLeague(score);
  if (!next) return '<div class="league-progress-row"><span>Highest level reached</span></div>';
  const ratio = getLeagueProgress(score);
  return `<div class="league-progress-row"><span>${formatLeagueNumber(score)} / ${formatLeagueNumber(next.minScore)} to ${escapeLeagueHtml(next.name)}</span></div><div class="league-progress-track"><div class="league-progress-fill" style="width: ${Math.round(ratio * 100)}%; background: ${next.color};"></div></div>`;
}
// Topbar badge + hover popover built as real DOM nodes so the popover's hidden state is set inline in JS (not reliant on leagues.css).
function buildLeagueTopbarWidget(score) {
  const wrap = document.createElement("div");
  wrap.className = "account-league-wrap";
  wrap.innerHTML = renderLeagueBadge(score, "md");
  const popover = document.createElement("div");
  popover.className = "league-progress-popover";
  popover.innerHTML = renderLeagueProgress(score);
  popover.style.display = "none";
  wrap.appendChild(popover);
  wrap.addEventListener("mouseenter", function () { popover.style.display = "block"; });
  wrap.addEventListener("mouseleave", function () { popover.style.display = "none"; });
  return wrap;
}
function formatLeagueNumber(value) { return Math.round(Number(value) || 0).toLocaleString(); }
function escapeLeagueHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// Score fetching — logged-in users get the server-side running total (bonus included); guests sum their own history (each row carries its own score).
async function fetchTotalScore() {
  const token = localStorage.getItem("typingAuthToken");
  try {
    if (token) {
      const response = await fetch(LEAGUE_API_URL + "?action=userScore&token=" + encodeURIComponent(token));
      const payload = await response.json();
      if (!payload.success) return null;
      return Number(payload.data.totalScore) || 0;
    }
    const guestId = localStorage.getItem("typingGuestId");
    if (!guestId) return 0;
    const response = await fetch(LEAGUE_API_URL + "?action=history&guestUserId=" + encodeURIComponent(guestId));
    const payload = await response.json();
    if (!payload.success || !Array.isArray(payload.data)) return null;
    return payload.data.reduce(function (sum, session) { return sum + (Number(session.score) || 0); }, 0);
  } catch (error) {
    console.warn("Could not load total score for league badge:", error);
    return null;
  }
}

// "Last seen" league (promotion detection) — stored per identity (userId/guestId) so switching sessions never fires a false promotion.
function getLeagueStorageKey() {
  const token = localStorage.getItem("typingAuthToken");
  if (token) {
    try {
      const user = JSON.parse(localStorage.getItem("typingUser") || "null");
      if (user && user.userId) return "typingLastSeenLeague_" + user.userId;
    } catch (error) {}
  }
  const guestId = localStorage.getItem("typingGuestId");
  return "typingLastSeenLeague_" + (guestId || "unknown");
}
function getLastSeenLeagueIndex() {
  const parsed = Number(localStorage.getItem(getLeagueStorageKey()));
  return Number.isFinite(parsed) ? parsed : 0;
}
function setLastSeenLeagueIndex(index) { localStorage.setItem(getLeagueStorageKey(), String(index)); }

// Public entry point — call once per page load (account.js does this). Fetches total score, returns it, and shows the promotion overlay if the player ranked up.
async function checkLeagueStatus() {
  const score = await fetchTotalScore();
  if (score === null) return null;
  const currentIndex = getLeagueIndex(score);
  const lastSeenIndex = getLastSeenLeagueIndex();
  if (currentIndex > lastSeenIndex) showLeaguePromotion(getLeague(score));
  setLastSeenLeagueIndex(currentIndex);
  return score;
}

// Promotion animation
function showLeaguePromotion(tier) {
  if (document.getElementById("leaguePromotionOverlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "leaguePromotionOverlay";
  overlay.className = "league-promo-overlay";
  overlay.innerHTML = `
        <div class="league-promo-card" style="--league-color: ${tier.color}; --league-glow: ${tier.glow};" role="dialog" aria-modal="true" aria-label="Level promotion">
            <div class="league-promo-rays"></div>
            <div class="league-promo-burst">${buildPromoParticles()}</div>
            <div class="league-promo-badge">${tier.icon}</div>
            <div class="league-promo-text">
                <span class="league-promo-label">PROMOTED</span>
                <h2 class="league-promo-tier">${tier.name}</h2>
                <p class="league-promo-sub">Keep going — the next level is waiting.</p>
            </div>
            <button type="button" class="league-promo-continue" id="leaguePromoContinue">Continue</button>
        </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  function dismiss() {
    overlay.classList.add("is-closing");
    document.body.style.overflow = "";
    setTimeout(function () { overlay.remove(); }, 220);
  }
  overlay.addEventListener("click", function (event) { if (event.target === overlay) dismiss(); });
  const continueButton = document.getElementById("leaguePromoContinue");
  if (continueButton) continueButton.addEventListener("click", dismiss);
  setTimeout(dismiss, 6000); // safety net so the overlay never gets stuck
  requestAnimationFrame(function () { overlay.classList.add("is-visible"); });
}

function buildPromoParticles() {
  let particles = "";
  const count = 12;
  for (let i = 0; i < count; i++) {
    const angle = (360 / count) * i;
    particles += `<span class="league-promo-particle" style="--angle: ${angle}deg; --delay: ${i * 18}ms;"></span>`;
  }
  return particles;
}

// Export
window.Leagues = {
  getLeague, getLeagueIndex, getNextLeague, getLeagueProgress,
  renderLeagueBadge, renderLeagueProgress, buildLeagueTopbarWidget,
  fetchTotalScore, checkLeagueStatus,
};