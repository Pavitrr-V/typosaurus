// Auth page — login, signup, avatar picker, guest mode, password toggles
// Stores session in localStorage: typingAuthToken, typingUser

const AUTH_API_URL = "https://script.google.com/macros/s/AKfycbysk8XF0SfRD_1rbOTfZ2XIQ12S-wE1jR6J5ga7ltEA0GCTxKZeMPYSM_QeW0HTVS9ugA/exec";

// Fixed avatar choices (same order as account.js)
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

let selectedProfilePicture = PROFILE_PICTURES[0];

// Get (or create) persistent guest ID for transferring sessions later
function getGuestId() {
  let guestId = localStorage.getItem("typingGuestId");
  if (!guestId) {
    guestId = "GUEST_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8).toUpperCase();
    localStorage.setItem("typingGuestId", guestId);
  }
  return guestId;
}

// DOM refs
const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const switchToSignup = document.getElementById("switchToSignup");
const switchToLogin = document.getElementById("switchToLogin");
const authSubtitle = document.getElementById("authSubtitle");
const guestMessage = document.getElementById("guestMessage");
const guestMessageTitle = document.getElementById("guestMessageTitle");
const guestMessageText = document.getElementById("guestMessageText");
const authStatus = document.getElementById("authStatus");
const continueGuest = document.getElementById("continueGuest");
const loginButton = document.getElementById("loginButton");
const signupButton = document.getElementById("signupButton");
const profileOptions = document.querySelectorAll(".profile-option");
const profilePreviewImage = document.getElementById("profilePreviewImage");

// Profile picture selection
profileOptions.forEach(button => {
  button.addEventListener("click", () => {
    const avatar = button.dataset.avatar;
    if (!avatar || !PROFILE_PICTURES.includes(avatar)) return;
    selectedProfilePicture = avatar;
    profileOptions.forEach(o => o.classList.remove("selected"));
    button.classList.add("selected");
    if (profilePreviewImage) profilePreviewImage.src = selectedProfilePicture;
  });
});

// Mode switching
function showLogin() {
  loginTab.classList.add("active");
  signupTab.classList.remove("active");
  loginForm.classList.remove("hidden");
  signupForm.classList.add("hidden");
  authSubtitle.textContent = "Sign in to continue your progress.";
  updateGuestMessage("login");
  clearStatus();
}
function showSignup() {
  signupTab.classList.add("active");
  loginTab.classList.remove("active");
  signupForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  authSubtitle.textContent = "Create an account and keep your typing progress.";
  updateGuestMessage("signup");
  clearStatus();
}
if (loginTab) loginTab.addEventListener("click", showLogin);
if (signupTab) signupTab.addEventListener("click", showSignup);
if (switchToSignup) switchToSignup.addEventListener("click", showSignup);
if (switchToLogin) switchToLogin.addEventListener("click", showLogin);

// Guest banner (only visible if #guestMessage exists in HTML)
function updateGuestMessage(mode) {
  if (!guestMessage) return;
  const hasGuest = localStorage.getItem("typingGuestId");
  if (!hasGuest) { guestMessage.classList.add("hidden"); return; }
  guestMessage.classList.remove("hidden");
  if (mode === "signup") {
    if (guestMessageTitle) guestMessageTitle.textContent = "Your guest progress will be transferred";
    if (guestMessageText) guestMessageText.textContent = "When you create your account, all typing sessions saved under this guest profile will be moved to your new account.";
  } else {
    if (guestMessageTitle) guestMessageTitle.textContent = "Your current guest progress will be replaced";
    if (guestMessageText) guestMessageText.textContent = "Logging into an existing account will remove this guest profile's saved sessions. You will see only the progress belonging to the account you log into.";
  }
}

// Status helpers
function showStatus(message, type = "error") {
  if (!authStatus) return;
  authStatus.textContent = message;
  authStatus.classList.remove("hidden", "success", "error");
  authStatus.classList.add(type);
}
function clearStatus() {
  if (!authStatus) return;
  authStatus.textContent = "";
  authStatus.classList.add("hidden");
  authStatus.classList.remove("success", "error");
}

// POST to Apps Script backend, unwraps response, throws friendly errors
async function callAuthAPI(payload) {
  const response = await fetch(AUTH_API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error("Unable to connect to the server.");
  let result;
  try { result = await response.json(); } catch { throw new Error("The server returned an invalid response."); }
  if (!result.success) throw new Error(result.message || "Something went wrong.");
  return result;
}

// Login submit
if (loginForm) {
  loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    clearStatus();
    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value;
    if (!username || !password) { showStatus("Please enter your username and password."); return; }
    loginButton.disabled = true;
    loginButton.textContent = "Logging in...";
    try {
      const result = await callAuthAPI({ action: "login", username, password, guestUserId: localStorage.getItem("typingGuestId") || "" });
      const data = result.data || result;
      if (!data.token || !data.user) throw new Error("Login succeeded but the server did not return account information.");
      localStorage.setItem("typingAuthToken", data.token);
      localStorage.setItem("typingUser", JSON.stringify(data.user));
      localStorage.removeItem("typingGuestId");
      showStatus("Login successful. Redirecting...", "success");
      setTimeout(() => window.location.href = "index.html", 600);
    } catch (error) {
      console.error("Login error:", error);
      showStatus(error.message || "Login failed. Please try again.");
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = "Login";
    }
  });
}

// Signup submit
if (signupForm) {
  signupForm.addEventListener("submit", async e => {
    e.preventDefault();
    clearStatus();
    const username = document.getElementById("signupUsername").value.trim();
    const password = document.getElementById("signupPassword").value;
    const confirmPassword = document.getElementById("signupPasswordConfirm").value;

    // Validation
    if (!username) { showStatus("Please choose a username."); return; }
    if (username.length < 3) { showStatus("Username must be at least 3 characters."); return; }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) { showStatus("Username can only contain letters, numbers, underscore, dot and hyphen."); return; }
    if (!selectedProfilePicture || !PROFILE_PICTURES.includes(selectedProfilePicture)) { showStatus("Please choose a profile picture."); return; }
    if (!password) { showStatus("Please enter a password."); return; }
    if (password.length < 6) { showStatus("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { showStatus("Passwords do not match."); return; }

    signupButton.disabled = true;
    signupButton.textContent = "Creating account...";
    try {
      const result = await callAuthAPI({ action: "createAccount", username, password, profilePicture: selectedProfilePicture, guestUserId: localStorage.getItem("typingGuestId") || "" });
      const data = result.data || result;
      if (!data.token || !data.user) throw new Error("Account was created but the server did not return account information.");
      localStorage.setItem("typingAuthToken", data.token);
      localStorage.setItem("typingUser", JSON.stringify(data.user));
      localStorage.removeItem("typingGuestId");
      let message = "Account created successfully.";
      if (typeof data.transferredSessions === "number" && data.transferredSessions > 0) {
        message += ` ${data.transferredSessions} typing session${data.transferredSessions === 1 ? "" : "s"} transferred.`;
      }
      showStatus(message + " Redirecting...", "success");
      setTimeout(() => window.location.href = "index.html", 800);
    } catch (error) {
      console.error("Create account error:", error);
      showStatus(error.message || "Could not create your account.");
    } finally {
      signupButton.disabled = false;
      signupButton.textContent = "Create account";
    }
  });
}

// Password visibility toggles
document.querySelectorAll(".password-toggle").forEach(button => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.target);
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.textContent = show ? "Hide" : "Show";
    button.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });
});

// Continue as guest
if (continueGuest) {
  continueGuest.addEventListener("click", () => { getGuestId(); window.location.href = "index.html"; });
}

updateGuestMessage("login");