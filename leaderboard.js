// Leaderboard page — fetches public leaderboard, renders podium (top 3) + ranked table; logged-in users see "Your Ranking" card, guests see login popup + reduced card.
// NOTE: PROFILE_AVATARS below must stay identical (including exact casing of each URL) to auth.js/account.js profiles.

const LEADERBOARD_API_URL = "https://script.google.com/macros/s/AKfycbysk8XF0SfRD_1rbOTfZ2XIQ12S-wE1jR6J5ga7ltEA0GCTxKZeMPYSM_QeW0HTVS9ugA/exec";

// DOM refs
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const errorMessage = document.getElementById("errorMessage");
const loginState = document.getElementById("loginState");
const emptyState = document.getElementById("emptyState");
const leaderboardContent = document.getElementById("leaderboardContent");
const leaderboardBody = document.getElementById("leaderboardBody");
const refreshButton = document.getElementById("refreshButton");
const retryButton = document.getElementById("retryButton");
const loginButton = document.getElementById("loginButton");
const practiceButton = document.getElementById("practiceButton");

// Profile pictures (must match auth.js/account.js exactly)
const PROFILE_AVATARS = [
  "https://jkbjp.in/wp-content/uploads/2016/11/sh_narendra_modi_27.09.2016_1-1.png",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT26qlBV9LBE5Dmvy-cdZr8qAAeVkqrNDfbkTh6JoT9-Q&s",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRiio3eLYRdubH1WwqC1VgPk8hQYSShN_q4lLSeXK6cipReo09OdaB6i7hz&s=10",
  "https://cdn.pfps.gg/pfps/9134-funny-memes.png",
  "https://c.ndtvimg.com/2026-01/8r81dk38_varun-dhawan_625x300_15_January_26.jpeg?im=FeatureCrop,algorithm=dnn,width=270,height=300",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTzoKFt7rHRjcem2HbpY4xuGm6K0MzACB-03fnxcID7j8KWCKs6MoNVgKw&s=10",
  "https://wallpapers.com/images/featured/meme-profile-pictures-vnigweuy4onsxunv.jpg",
  "https://i.pinimg.com/236x/5f/00/3e/5f003ee3e3bb7bd299f31241079d8c9a.jpg?nii=t",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSTlUPDvlI9Ek8_sOs9KxqJW183sxhTclErb78rDGl-a_MwfSIkVSBoCNUW&s=10",
  "https://m.sakshipost.com/sites/default/files/styles/storypage_main/public/gallery_images/2025/07/24/aneet%20padda6-1753357202.jpg?itok=PsDaWuIq",
  "https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1592721086i/54199957.jpg",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTlCn8upgdyBDKqIDjumOYOVl3q_1Zico0yDJZjZBtJA0f4F3lnqG-Yk1Q&s=10",
];

// Avatar helpers
function getProfileAvatar(user) {
  if (!user) return null;
  const profilePicture = String(user.profilePicture || "").trim();
  return PROFILE_AVATARS.includes(profilePicture) ? profilePicture : null;
}
function getProfileInitial(user) {
  if (!user) return "U";
  const name = user.displayName || user.username || user.name || "U";
  return String(name).charAt(0).toUpperCase();
}
function renderAvatar(element, user, altText) {
  if (!element) return;
  element.innerHTML = "";
  const avatar = getProfileAvatar(user);
  if (avatar) {
    const image = document.createElement("img");
    image.src = avatar;
    image.alt = altText || "Profile picture";
    image.loading = "lazy";
    image.className = "leaderboard-profile-image";
    image.onerror = function () {
      element.innerHTML = "";
      element.textContent = getProfileInitial(user);
      element.classList.remove("has-profile-image");
    };
    element.appendChild(image);
    element.classList.add("has-profile-image");
    return;
  }
  element.textContent = getProfileInitial(user);
  element.classList.remove("has-profile-image");
}

// Account helpers
function getStoredAccount() {
  const token = localStorage.getItem("typingAuthToken");
  const storedUser = localStorage.getItem("typingUser");
  if (!token || !storedUser) return null;
  try { return { token, user: JSON.parse(storedUser) }; } catch (error) {
    console.error("Invalid stored user:", error);
    localStorage.removeItem("typingUser");
    return null;
  }
}
function getDisplayName(user) { return user ? (user.displayName || user.username || "User") : "User"; }

// Formatting
function formatNumber(value) { return (Number(value) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
function formatWpm(value) { return (Number(value) || 0).toFixed(1); }
function formatAccuracy(value) { return (Number(value) || 0).toFixed(1) + "%"; }

// UI states
function hideAllStates() {
  if (loadingState) loadingState.classList.add("hidden");
  if (errorState) errorState.classList.add("hidden");
  if (loginState) loginState.classList.add("hidden");
  if (emptyState) emptyState.classList.add("hidden");
  if (leaderboardContent) leaderboardContent.classList.add("hidden");
}
function showLoading() { hideAllStates(); if (loadingState) loadingState.classList.remove("hidden"); }
function showEmpty() { hideAllStates(); if (emptyState) emptyState.classList.remove("hidden"); }
function showError(message) {
  hideAllStates();
  if (errorMessage) errorMessage.textContent = message || "Unable to load leaderboard.";
  if (errorState) errorState.classList.remove("hidden");
}

// Guest login popup
function createGuestLoginPopup() {
  if (document.getElementById("guestLoginAd")) return;
  const popup = document.createElement("div");
  popup.id = "guestLoginAd";
  popup.className = "guest-login-ad hidden";
  popup.innerHTML = `
        <button type="button" class="guest-login-ad-close" id="guestLoginAdClose" aria-label="Close">×</button>
        <div class="guest-login-ad-icon">♛</div>
        <div class="guest-login-ad-content">
            <span class="guest-login-ad-label">LEADERBOARD</span>
            <h3>Want to see your official ranking?</h3>
            <p>Log in to track your rank and compete with other typist.</p>
            <button type="button" class="guest-login-ad-button" id="guestLoginAdButton">Login here !</button>
        </div>`;
  document.body.appendChild(popup);
  const closeButton = document.getElementById("guestLoginAdClose");
  const popupLoginButton = document.getElementById("guestLoginAdButton");
  if (closeButton) closeButton.addEventListener("click", hideGuestLoginPopup);
  if (popupLoginButton) popupLoginButton.addEventListener("click", function () { window.location.href = "auth.html"; });
}
function showGuestLoginPopup() {
  createGuestLoginPopup();
  const popup = document.getElementById("guestLoginAd");
  if (!popup) return;
  popup.classList.remove("hidden");
  requestAnimationFrame(function () { popup.classList.add("show"); });
}
function hideGuestLoginPopup() {
  const popup = document.getElementById("guestLoginAd");
  if (!popup) return;
  popup.classList.remove("show");
  setTimeout(function () { popup.classList.add("hidden"); }, 220);
}

// Hide/shade the "Your Ranking" card for guests
function setGuestRankingVisibility(isGuest) {
  const yourRank = document.getElementById("yourRank");
  if (!yourRank) return;
  const rankingCard = yourRank.closest(".your-ranking");
  if (rankingCard) {
    rankingCard.classList.toggle("guest-hidden-ranking", isGuest);
    return;
  }
  yourRank.style.display = isGuest ? "none" : "";
}

// Load leaderboard (guests can view public board; logged-in users send token)
async function loadLeaderboard(silent) {
  const account = getStoredAccount();
  const isGuest = !account;
  if (!silent) showLoading();
  try {
    let url = LEADERBOARD_API_URL + "?action=leaderboard";
    if (account) url += "&token=" + encodeURIComponent(account.token);
    console.log("Loading leaderboard:", url);
    const response = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store" });
    console.log("Leaderboard HTTP status:", response.status);
    if (!response.ok) throw new Error("Server returned HTTP " + response.status);
    const text = await response.text();
    console.log("Leaderboard raw response:", text);
    let data;
    try { data = JSON.parse(text); } catch (jsonError) {
      console.error("Invalid JSON response:", text);
      throw new Error("The server returned an invalid response.");
    }
    console.log("Leaderboard parsed response:", data);
    if (!data.success) {
      const message = data.message || data.error || "Unable to load leaderboard.";
      // Only treat auth errors as auth errors for logged-in users; guests must still see the public board.
      if (account && (message.toLowerCase().includes("login") || message.toLowerCase().includes("token") || message.toLowerCase().includes("auth") || message.toLowerCase().includes("session"))) {
        localStorage.removeItem("typingAuthToken");
        localStorage.removeItem("typingUser");
        loadLeaderboard();
        return;
      }
      throw new Error(message);
    }
    const result = data.data || {};
    const leaderboard = result.leaderboard || result.rankings || [];
    console.log("Leaderboard rows:", leaderboard);
    if (!Array.isArray(leaderboard)) throw new Error("Invalid leaderboard data received from server.");
    if (leaderboard.length === 0) { showEmpty(); return; }
    renderLeaderboard(leaderboard, account);
    setGuestRankingVisibility(isGuest);
    if (isGuest) {
      setTimeout(function () { if (!getStoredAccount()) showGuestLoginPopup(); }, 900);
    } else {
      hideGuestLoginPopup();
    }
  } catch (error) {
    console.error("Leaderboard error:", error);
    // A background auto-refresh failing shouldn't rip the visible board away — only show the error state for explicit/initial loads.
    if (!silent) showError(error.message || "Unable to load leaderboard.");
  }
}

// Battle wins (bot or live opponent) are synced to the backend each battle, and the
// leaderboard is recalculated fresh on every load — polling here just surfaces rank
// changes from others without requiring a manual "Refresh" click.
const LEADERBOARD_AUTO_REFRESH_MS = 20000;
let leaderboardAutoRefreshTimer = null;
function startLeaderboardAutoRefresh() {
  if (leaderboardAutoRefreshTimer) return;
  leaderboardAutoRefreshTimer = setInterval(function () {
    if (leaderboardContent && leaderboardContent.classList.contains("hidden")) return;
    loadLeaderboard(true);
  }, LEADERBOARD_AUTO_REFRESH_MS);
}
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible") loadLeaderboard(true);
});

// Render leaderboard
function renderLeaderboard(rankings, account) {
  hideAllStates();
  if (leaderboardContent) leaderboardContent.classList.remove("hidden");
  if (account) renderCurrentUser(rankings, account);
  renderPodium(rankings);
  renderTable(rankings);
}

// Current user's rank card
function renderCurrentUser(rankings, account) {
  if (!account) return;
  let currentUser = rankings.find(function (item) { return item.isCurrentUser === true; });
  if (!currentUser) {
    const currentUserId = account.user && (account.user.userId || account.user.id);
    if (currentUserId) {
      currentUser = rankings.find(function (item) { return String(item.userId || "").toLowerCase() === String(currentUserId).toLowerCase(); });
    }
  }
  const yourRank = document.getElementById("yourRank");
  const yourName = document.getElementById("yourName");
  const yourAvatar = document.getElementById("yourAvatar");
  const yourScore = document.getElementById("yourScore");
  const yourTests = document.getElementById("yourTests");
  const yourWpm = document.getElementById("yourWpm");
  const yourAccuracy = document.getElementById("yourAccuracy");
  if (!currentUser) {
    if (yourRank) yourRank.textContent = "-";
    if (yourName) yourName.textContent = getDisplayName(account.user);
    if (yourAvatar) renderAvatar(yourAvatar, account.user, "Your profile picture");
    if (yourScore) yourScore.textContent = "0";
    if (yourTests) yourTests.textContent = "0";
    if (yourWpm) yourWpm.textContent = "0.0";
    if (yourAccuracy) yourAccuracy.textContent = "0.0%";
    return;
  }
  const name = currentUser.displayName || currentUser.username || currentUser.name || "You";
  const rank = currentUser.rank ?? "-";
  const score = currentUser.totalScore ?? currentUser.score ?? 0;
  const tests = currentUser.totalTests ?? currentUser.tests ?? currentUser.testCount ?? 0;
  const averageWpm = currentUser.averageWpm ?? currentUser.avgWpm ?? 0;
  const averageAccuracy = currentUser.averageAccuracy ?? currentUser.avgAccuracy ?? 0;
  if (yourRank) yourRank.textContent = formatNumber(rank);
  if (yourName) yourName.textContent = name;
  renderLeagueBadgeBelow(yourName, score);
  if (yourAvatar) renderAvatar(yourAvatar, currentUser, "Your profile picture");
  if (yourScore) yourScore.textContent = formatNumber(score);
  if (yourTests) yourTests.textContent = formatNumber(tests);
  if (yourWpm) yourWpm.textContent = formatWpm(averageWpm);
  if (yourAccuracy) yourAccuracy.textContent = formatAccuracy(averageAccuracy);
}

// Podium (top 3)
function renderPodium(rankings) {
  renderPodiumUser(rankings[0], "first");
  renderPodiumUser(rankings[1], "second");
  renderPodiumUser(rankings[2], "third");
}
function renderPodiumUser(user, position) {
  const nameElement = document.getElementById(position + "Name");
  const scoreElement = document.getElementById(position + "Score");
  const avatarElement = document.getElementById(position + "Avatar");
  if (!nameElement || !scoreElement || !avatarElement) return;
  if (!user) {
    nameElement.textContent = "—";
    scoreElement.textContent = "0";
    avatarElement.innerHTML = "";
    avatarElement.textContent = position === "first" ? "1" : position === "second" ? "2" : "3";
    avatarElement.classList.remove("has-profile-image");
    return;
  }
  const name = user.displayName || user.username || user.name || "User";
  const score = user.totalScore ?? user.score ?? 0;
  nameElement.textContent = name;
  scoreElement.textContent = formatNumber(score);
  renderAvatar(avatarElement, user, name + "'s profile picture");
  renderLeagueBadgeBelow(nameElement, score);
}

// Place league badge right below the name (podium + "Your Rank" cards stack vertically; badge sits inline beside table names via its own wrapper).
function renderLeagueBadgeBelow(nameElement, score) {
  if (!window.Leagues || !nameElement) return;
  const existing = nameElement.nextElementSibling;
  if (existing && existing.classList.contains("league-badge")) existing.remove();
  nameElement.insertAdjacentHTML("afterend", window.Leagues.renderLeagueBadge(score, "sm"));
}

// Ranked table rows
function renderTable(rankings) {
  if (!leaderboardBody) return;
  leaderboardBody.innerHTML = "";
  rankings.forEach(function (user, index) {
    const row = document.createElement("tr");
    if (user.isCurrentUser === true) row.classList.add("current-user");
    const rank = user.rank ?? index + 1;
    const name = user.displayName || user.username || user.name || "User";
    const score = user.totalScore ?? user.score ?? 0;
    const tests = user.totalTests ?? user.tests ?? user.testCount ?? 0;
    const averageWpm = user.averageWpm ?? user.avgWpm ?? 0;
    const averageAccuracy = user.averageAccuracy ?? user.avgAccuracy ?? 0;
    const isTopRank = Number(rank) <= 3;
    row.innerHTML = `
                <td><span class="rank-number ${isTopRank ? "top-rank" : ""}">#${escapeHtml(rank)}</span></td>
                <td>
                    <div class="typist-cell">
                        <div class="table-avatar"></div>
                        <div>
                            <span class="typist-name">${escapeHtml(name)}</span>
                            ${user.isCurrentUser === true ? '<span class="you-badge">You</span>' : ""}
                            <div class="typist-league">${window.Leagues ? window.Leagues.renderLeagueBadge(score, "sm") : ""}</div>
                        </div>
                    </div>
                </td>
                <td class="score-cell">${formatNumber(score)}</td>
                <td class="number-cell">${formatNumber(tests)}</td>
                <td class="number-cell">${formatWpm(averageWpm)}</td>
                <td class="number-cell">${formatAccuracy(averageAccuracy)}</td>`;
    leaderboardBody.appendChild(row);
    const tableAvatar = row.querySelector(".table-avatar");
    renderAvatar(tableAvatar, user, name + "'s profile picture");
  });
}

// HTML safety
function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Events
if (refreshButton) refreshButton.addEventListener("click", function () { loadLeaderboard(); });
if (retryButton) retryButton.addEventListener("click", function () { loadLeaderboard(); });
if (loginButton) loginButton.addEventListener("click", function () { window.location.href = "auth.html"; });
if (practiceButton) practiceButton.addEventListener("click", function () { window.location.href = "index.html"; });

// Init
document.addEventListener("DOMContentLoaded", function () {
  loadLeaderboard();
  startLeaderboardAutoRefresh();
});