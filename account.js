// Account widget — sidebar UI, profile settings, logout flow
// Reads session from localStorage: typingAuthToken, typingUser

const ACCOUNT_API_URL = "https://script.google.com/macros/s/AKfycbysk8XF0SfRD_1rbOTfZ2XIQ12S-wE1jR6J5ga7ltEA0GCTxKZeMPYSM_QeW0HTVS9ugA/exec";

// Available profile pictures (must match auth.js)
const PROFILE_PICTURES = [
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

// Read stored auth token and user object
function getStoredUser() {
  const token = localStorage.getItem("typingAuthToken");
  const storedUser = localStorage.getItem("typingUser");
  if (!token || !storedUser) return null;
  try { return { token, user: JSON.parse(storedUser) }; }
  catch (error) {
    console.error("Invalid stored user:", error);
    localStorage.removeItem("typingUser");
    return null;
  }
}

// Get avatar URL or initial letter for a user
function getUserAvatar(user) {
  if (user && user.profilePicture && PROFILE_PICTURES.includes(user.profilePicture)) return user.profilePicture;
  const name = user && (user.displayName || user.username);
  return name ? name.charAt(0).toUpperCase() : "G";
}

// Render avatar into a container element (image or initial)
function applyAvatar(element, user) {
  if (!element) return;
  const avatar = getUserAvatar(user);
  element.innerHTML = "";
  element.classList.add("account-avatar");
  if (PROFILE_PICTURES.includes(avatar)) {
    const img = document.createElement("img");
    img.src = avatar; img.alt = "Profile picture"; img.loading = "lazy"; img.className = "account-profile-image";
    img.onerror = function () {
      element.innerHTML = "";
      element.textContent = user && (user.displayName || user.username) ? (user.displayName || user.username).charAt(0).toUpperCase() : "G";
      element.classList.remove("profile-image-avatar");
    };
    element.appendChild(img);
    element.classList.add("profile-image-avatar");
    return;
  }
  element.textContent = avatar;
  element.classList.remove("profile-image-avatar");
}

// Setup the account sidebar UI (guest vs logged-in)
function setupAccountUI() {
  injectAccountStyles();
  const accountName = document.getElementById("accountName");
  const accountType = document.getElementById("accountType");
  const accountAvatar = document.getElementById("accountAvatar");
  const logoutButton = document.getElementById("logoutButton");
  const settingsButton = document.getElementById("settingsButton");
  if (!accountName || !accountType || !accountAvatar || !logoutButton) return;

  const account = getStoredUser();
  renderLeagueUI(); // independent of guest/logged-in branching

  // Guest state
  if (!account) {
    accountName.textContent = "Guest";
    accountType.textContent = "";
    applyAvatar(accountAvatar, null);
    logoutButton.classList.add("hidden");
    if (settingsButton) { settingsButton.classList.add("hidden"); settingsButton.onclick = null; }
    const oldBtn = document.getElementById("loginButton");
    if (oldBtn) oldBtn.remove();
    const loginButton = document.createElement("button");
    loginButton.type = "button"; loginButton.id = "loginButton";
    loginButton.className = "logout-button login-button"; loginButton.textContent = "Login";
    loginButton.addEventListener("click", () => window.location.href = "auth.html");
    const actions = document.querySelector(".account-actions") || document.querySelector(".sidebar-account");
    if (actions) actions.appendChild(loginButton);
    return;
  }

  // Logged-in state
  const user = account.user;
  const displayName = user.displayName || user.username || "User";
  accountName.textContent = displayName;
  accountType.textContent = user.username ? "" : "Account";
  applyAvatar(accountAvatar, user);
  logoutButton.classList.remove("hidden");
  if (settingsButton) { settingsButton.classList.remove("hidden"); settingsButton.onclick = openProfileSettings; }
  const loginBtn = document.getElementById("loginButton");
  if (loginBtn) loginBtn.remove();
  logoutButton.onclick = logout;
}

// League badge widget in topbar — fetches score and checks for promotion
async function renderLeagueUI() {
  if (!window.Leagues) return;
  const details = document.querySelector(".account-details");
  if (!details) return;
  let wrap = document.getElementById("accountLeagueWrap");
  if (wrap) wrap.remove();
  const score = await window.Leagues.checkLeagueStatus();
  if (score === null) return;
  wrap = window.Leagues.buildLeagueTopbarWidget(score);
  wrap.id = "accountLeagueWrap";
  details.appendChild(wrap);
}

// Open profile settings modal
function openProfileSettings() {
  const account = getStoredUser();
  if (!account) { window.location.href = "auth.html"; return; }
  if (document.getElementById("profileSettingsModal")) return;
  const user = account.user;
  const currentAvatar = getUserAvatar(user);

  const modal = document.createElement("div");
  modal.id = "profileSettingsModal";
  modal.className = "profile-settings-overlay";
  modal.innerHTML = `
    <div class="profile-settings-modal" role="dialog" aria-modal="true" aria-labelledby="profileSettingsTitle">
      <div class="profile-settings-header">
        <div>
          <h2 id="profileSettingsTitle">Profile Settings</h2>
          <p>Customize your Typing Practice profile.</p>
        </div>
        <button type="button" class="profile-settings-close" id="profileSettingsClose" aria-label="Close settings">×</button>
      </div>
      <div class="profile-settings-body">
        <div class="profile-settings-avatar-preview">
          <div id="settingsAvatarPreview" class="settings-avatar-preview"></div>
          <div><strong>Profile picture</strong><div class="settings-muted">Choose an avatar below.</div></div>
        </div>
        <div class="settings-section">
          <label>Profile picture</label>
          <div class="settings-avatar-grid" id="settingsAvatarGrid">
            ${PROFILE_PICTURES.map(a => `<button type="button" class="settings-avatar-option ${a === currentAvatar ? "selected" : ""}"></button>`).join("")}
          </div>
        </div>
        <div class="settings-section">
          <label for="settingsUsername">Username</label>
          <input type="text" id="settingsUsername" class="settings-input" value="${escapeHtml(user.username || "")}" minlength="3" maxlength="30" autocomplete="username">
          <small>3–30 characters. Letters, numbers, _, . and - only.</small>
        </div>
        <div id="profileSettingsStatus" class="profile-settings-status hidden"></div>
      </div>
      <div class="profile-settings-footer">
        <button type="button" class="settings-cancel-button" id="profileSettingsCancel">Cancel</button>
        <button type="button" class="settings-save-button" id="profileSettingsSave">Save changes</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  let selectedAvatar = currentAvatar;
  const avatarPreview = document.getElementById("settingsAvatarPreview");
  const avatarButtons = modal.querySelectorAll(".settings-avatar-option");

  // Put images inside avatar buttons
  avatarButtons.forEach((btn, i) => {
    btn.dataset.avatar = PROFILE_PICTURES[i];
    const img = document.createElement("img");
    img.src = PROFILE_PICTURES[i]; img.alt = "Profile picture " + (i + 1); img.loading = "lazy";
    btn.appendChild(img);
    btn.addEventListener("click", () => {
      selectedAvatar = btn.dataset.avatar;
      avatarButtons.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      renderProfileImage(avatarPreview, selectedAvatar, "Selected profile picture");
    });
  });

  renderProfileImage(avatarPreview, currentAvatar, "Current profile picture");
  document.getElementById("profileSettingsClose").onclick = closeProfileSettings;
  document.getElementById("profileSettingsCancel").onclick = closeProfileSettings;
  modal.addEventListener("click", e => { if (e.target === modal) closeProfileSettings(); });
  document.addEventListener("keydown", handleProfileEscape);
  document.getElementById("profileSettingsSave").addEventListener("click", () => saveProfileSettings(selectedAvatar));
  injectAccountStyles();
}

// Render an avatar image (or "G" fallback) into a preview element
function renderProfileImage(element, imageUrl, altText) {
  if (!element) return;
  element.innerHTML = "";
  if (!imageUrl || !PROFILE_PICTURES.includes(imageUrl)) { element.textContent = "G"; return; }
  const img = document.createElement("img");
  img.src = imageUrl; img.alt = altText || "Profile picture";
  img.onerror = () => { element.innerHTML = ""; element.textContent = "G"; };
  element.appendChild(img);
}

// Close settings modal and remove keydown listener
function closeProfileSettings() {
  const modal = document.getElementById("profileSettingsModal");
  if (modal) modal.remove();
  document.removeEventListener("keydown", handleProfileEscape);
}
function handleProfileEscape(e) { if (e.key === "Escape") closeProfileSettings(); }

// Save profile settings to server
async function saveProfileSettings(selectedAvatar) {
  const account = getStoredUser();
  if (!account) { window.location.href = "auth.html"; return; }
  const usernameInput = document.getElementById("settingsUsername");
  const saveButton = document.getElementById("profileSettingsSave");
  if (!usernameInput || !saveButton) return;
  const username = usernameInput.value.trim();

  // Validation
  if (!username) { showProfileSettingsStatus("Please enter a username.", "error"); return; }
  if (username.length < 3) { showProfileSettingsStatus("Username must be at least 3 characters.", "error"); return; }
  if (username.length > 30) { showProfileSettingsStatus("Username cannot exceed 30 characters.", "error"); return; }
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) { showProfileSettingsStatus("Username can only contain letters, numbers, underscore, dot and hyphen.", "error"); return; }
  if (!PROFILE_PICTURES.includes(selectedAvatar)) { showProfileSettingsStatus("Please choose a valid profile picture.", "error"); return; }

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";
  try {
    const payload = { action: "updateProfile", token: account.token, username, profilePicture: selectedAvatar };
    console.log("Updating profile:", payload);
    const response = await fetch(ACCOUNT_API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
    console.log("Profile update HTTP status:", response.status);
    if (!response.ok) throw new Error("Server returned HTTP " + response.status);
    const text = await response.text();
    console.log("Profile update response:", text);
    let result;
    try { result = JSON.parse(text); } catch { throw new Error("The server returned an invalid response."); }
    if (!result.success) throw new Error(result.message || "Could not update your profile.");
    const data = result.data || result;
    if (!data.user) throw new Error("Profile was updated but account information was not returned.");

    // Update local account
    localStorage.setItem("typingUser", JSON.stringify(data.user));
    const accountName = document.getElementById("accountName");
    const accountType = document.getElementById("accountType");
    if (accountName) accountName.textContent = data.user.displayName || data.user.username || "User";
    if (accountType) accountType.textContent = "Signed in";
    applyAvatar(document.getElementById("accountAvatar"), data.user);
    showProfileSettingsStatus("Profile updated successfully.", "success");
    setTimeout(closeProfileSettings, 700);
  } catch (error) {
    console.error("Profile update error:", error);
    if (error instanceof TypeError && error.message.toLowerCase().includes("fetch")) {
      showProfileSettingsStatus("Unable to connect to the server. Please check that your Apps Script Web App is deployed and accessible.", "error");
    } else { showProfileSettingsStatus(error.message || "Could not update your profile.", "error"); }
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save changes";
  }
}

// Show status message in settings modal
function showProfileSettingsStatus(message, type) {
  const status = document.getElementById("profileSettingsStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.remove("hidden", "success", "error");
  status.classList.add(type);
}

// HTML-escape a string for safe template insertion
function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Inject account/settings styles into <head> (once)
function injectAccountStyles() {
  if (document.getElementById("profileAccountStyles")) return;
  const style = document.createElement("style");
  style.id = "profileAccountStyles";
  style.textContent = `
    .account-avatar { width:34px!important;height:34px!important;min-width:34px!important;min-height:34px!important;max-width:34px!important;max-height:34px!important;flex:0 0 34px!important;overflow:hidden!important;position:relative!important;border-radius:50%!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;background:#edf4fc!important; }
    .account-avatar .account-profile-image { width:34px!important;height:34px!important;min-width:34px!important;min-height:34px!important;max-width:34px!important;max-height:34px!important;position:absolute!important;top:0!important;left:0!important;display:block!important;object-fit:cover!important;border-radius:50%!important;margin:0!important;padding:0!important;border:0!important; }
    .account-profile-image { width:34px!important;height:34px!important;min-width:34px!important;min-height:34px!important;max-width:34px!important;max-height:34px!important;object-fit:cover!important;border-radius:50%!important;display:block!important;margin:0!important;padding:0!important; }
    .login-button { border:1px solid #3787d8!important;background:#3787d8!important;color:#fff!important;transition:background 0.15s ease,border-color 0.15s ease,transform 0.15s ease; }
    .login-button:hover { background:#2f76bd!important;border-color:#2f76bd!important;transform:translateY(-1px); }
    .login-button:active { transform:translateY(0); }
    .logout-loading-overlay { position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:rgba(255,255,255,0.97);opacity:1;visibility:visible;pointer-events:auto;transition:opacity 0.2s ease,visibility 0.2s ease; }
    .logout-loading-overlay.hidden { opacity:0;visibility:hidden;pointer-events:none; }
    .logout-loading-card { width:min(360px,calc(100% - 40px));padding:32px 28px;background:#fff;border:1px solid #e2e5e9;border-radius:18px;box-shadow:0 15px 45px rgba(0,0,0,0.08);text-align:center;box-sizing:border-box; }
    .logout-loading-spinner { width:38px;height:38px;margin:0 auto 18px;border:3px solid #e7edf4;border-top-color:#3787d8;border-radius:50%;animation:logoutSpin 0.8s linear infinite; }
    @keyframes logoutSpin { to { transform:rotate(360deg); } }
    .logout-loading-card h2 { margin:0;color:#111827;font-size:20px;font-weight:650; }
    .logout-loading-card p { margin:8px 0 0;color:#6b7280;font-size:13px;line-height:1.5; }
    .settings-avatar-preview { width:64px;height:64px;min-width:64px;min-height:64px;max-width:64px;max-height:64px;border-radius:50%;overflow:hidden;background:#eff6ff;display:flex;align-items:center;justify-content:center;font-size:34px;flex-shrink:0;position:relative;box-sizing:border-box; }
    .settings-avatar-preview img { width:64px;height:64px;min-width:64px;min-height:64px;max-width:64px;max-height:64px;object-fit:cover;border-radius:50%;display:block;margin:0;padding:0; }
    .settings-avatar-option { padding:0;overflow:hidden;aspect-ratio:1;position:relative; }
    .settings-avatar-option img { width:100%;height:100%;object-fit:cover;display:block;border-radius:10px;margin:0;padding:0; }
    .profile-settings-overlay { position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box; }
    .profile-settings-modal { width:min(500px,100%);max-height:min(720px,90vh);overflow-y:auto;background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,0.2); }
    .profile-settings-header { display:flex;justify-content:space-between;align-items:flex-start;padding:22px 24px;border-bottom:1px solid #eef0f3; }
    .profile-settings-header h2 { margin:0;font-size:20px; }
    .profile-settings-header p { margin:5px 0 0;color:#6b7280;font-size:13px; }
    .profile-settings-close { border:none;background:transparent;cursor:pointer;font-size:28px;line-height:1;color:#6b7280;padding:0 4px; }
    .profile-settings-body { padding:24px; }
    .profile-settings-avatar-preview { display:flex;align-items:center;gap:14px;margin-bottom:24px; }
    .settings-muted { margin-top:3px;font-size:13px;color:#6b7280; }
    .settings-section { margin-top:20px; }
    .settings-section label { display:block;margin-bottom:9px;font-weight:600;font-size:14px; }
    .settings-avatar-grid { display:grid;grid-template-columns:repeat(6,1fr);gap:8px; }
    .settings-avatar-option { border:2px solid transparent;border-radius:12px;background:#f4f6f8;cursor:pointer;transition:transform 0.15s ease,border-color 0.15s ease,background 0.15s ease; }
    .settings-avatar-option:hover { transform:translateY(-2px);background:#eef2f7; }
    .settings-avatar-option.selected { border-color:#2563eb;background:#eff6ff; }
    .settings-input { width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #d7dce2;border-radius:9px;outline:none;font-size:14px; }
    .settings-input:focus { border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,0.1); }
    .settings-section small { display:block;margin-top:6px;color:#6b7280;font-size:12px; }
    .profile-settings-status { margin-top:18px;padding:10px 12px;border-radius:8px;font-size:13px; }
    .profile-settings-status.success { background:#ecfdf5;color:#047857; }
    .profile-settings-status.error { background:#fef2f2;color:#b91c1c; }
    .profile-settings-footer { display:flex;justify-content:flex-end;gap:9px;padding:16px 24px;border-top:1px solid #eef0f3; }
    .settings-cancel-button,.settings-save-button { border:none;border-radius:9px;padding:10px 16px;cursor:pointer;font-size:13px; }
    .settings-cancel-button { background:#f1f3f5;color:#374151; }
    .settings-save-button { background:#2563eb;color:#fff; }
    .settings-save-button:disabled { opacity:0.6;cursor:not-allowed; }
    @media (max-width:500px) { .settings-avatar-grid { grid-template-columns:repeat(4,1fr); } .profile-settings-header,.profile-settings-body,.profile-settings-footer { padding-left:18px;padding-right:18px; } .logout-loading-card { width:calc(100% - 24px);padding:28px 20px; } }`;
  document.head.appendChild(style);
}

// Show logout loading overlay (reuses existing or creates new)
function showLogoutLoading() {
  let overlay = document.getElementById("logoutLoadingOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "logoutLoadingOverlay";
    overlay.className = "logout-loading-overlay hidden";
    overlay.innerHTML = `<div class="logout-loading-card"><div class="logout-loading-spinner"></div><h2>Logging out...</h2><p>Please wait while we securely end your session.</p></div>`;
    document.body.appendChild(overlay);
  }
  injectAccountStyles();
  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  return overlay;
}

// Logout flow — server request then clear local session
async function logout() {
  if (window.__logoutInProgress) return;
  window.__logoutInProgress = true;
  showLogoutLoading();
  const token = localStorage.getItem("typingAuthToken");
  const logoutButton = document.getElementById("logoutButton");
  if (logoutButton) { logoutButton.disabled = true; logoutButton.textContent = "Logging out..."; }
  try {
    if (token) {
      const response = await fetch(ACCOUNT_API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "logout", token }) });
      console.log("Logout HTTP status:", response.status);
      let text = "";
      try { text = await response.text(); } catch (e) { console.warn("Could not read logout response:", e); }
      console.log("Logout response:", text);
      if (!response.ok) console.warn("Server logout returned HTTP " + response.status);
    }
  } catch (error) { console.warn("Logout request failed:", error); }
  finally {
    localStorage.removeItem("typingAuthToken");
    localStorage.removeItem("typingUser");
    await new Promise(r => setTimeout(r, 500));
    window.location.href = "index.html";
  }
}

// Init on DOM ready
document.addEventListener("DOMContentLoaded", setupAccountUI);
