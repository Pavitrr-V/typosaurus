// Typing practice — loads content, tracks keystrokes, shows live stats, saves sessions
// Requires content-engine.js to be loaded first (for getRandomContent)

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbysk8XF0SfRD_1rbOTfZ2XIQ12S-wE1jR6J5ga7ltEA0GCTxKZeMPYSM_QeW0HTVS9ugA/exec";

// Current user: logged-in (typingUser) or guest (typingGuestId)
function getCurrentUser() {
  const token = localStorage.getItem("typingAuthToken");
  const storedUser = localStorage.getItem("typingUser");
  if (token && storedUser) {
    try {
      const user = JSON.parse(storedUser);
      if (user.userId) return { userId: user.userId, userType: "user", token };
    } catch (error) {
      console.error("Invalid stored user:", error);
      localStorage.removeItem("typingUser");
    }
  }
  let guestId = localStorage.getItem("typingGuestId");
  if (!guestId) {
    guestId = "GUEST_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8).toUpperCase();
    localStorage.setItem("typingGuestId", guestId);
  }
  return { userId: guestId, userType: "guest", token: null };
}
const currentUser = getCurrentUser();

// Category metadata keyed by URL param
const practiceData = {
  easy: { title: "Easy Words", description: "" },
  hard: { title: "Hard Words", description: "" },
  paragraph: { title: "Paragraphs", description: "" },
  story: { title: "Stories", description: "" },
  coding: { title: "Coding", description: "" },
  genz: { title: "Gen Z / Slang", description: "" },
  numbers: { title: "Numbers & Symbols", description: "" },
  quotes: { title: "Quotes", description: "" },
  mixed: { title: "Mixed Challenge", description: "" },
};

// Selected category from URL (?category=), defaults to easy
const params = new URLSearchParams(window.location.search);
const category = params.get("category") || "easy";
const selected = practiceData[category] || practiceData.easy;
let targetCharacters = [];

// DOM refs
const categoryTitle = document.getElementById("categoryTitle");
const categoryDescription = document.getElementById("categoryDescription");
const typingText = document.getElementById("typingText");
const hiddenTypingInput = document.getElementById("hiddenTypingInput");
const typingStatus = document.getElementById("typingStatus");
const restartButton = document.getElementById("restartButton");
const typingPage = document.getElementById("typingPage");
const backButton = document.getElementById("backButton");
const practiceNav = document.getElementById("practiceNav");
const typingScreen = document.getElementById("typingScreen");
const resultsScreen = document.getElementById("resultsScreen");
const typingTimer = document.getElementById("typingTimer");
const liveTime = document.getElementById("liveTime");
const liveWpm = document.getElementById("liveWpm");
const liveAccuracy = document.getElementById("liveAccuracy");
const resultCategory = document.getElementById("resultCategory");
const resultWpm = document.getElementById("resultWpm");
const resultAccuracy = document.getElementById("resultAccuracy");
const resultTime = document.getElementById("resultTime");
const resultCharacters = document.getElementById("resultCharacters");
const resultCorrect = document.getElementById("resultCorrect");
const resultIncorrect = document.getElementById("resultIncorrect");
const tryAgainButton = document.getElementById("tryAgainButton");
const resultsBackButton = document.getElementById("resultsBackButton");
const soundToggleButton = document.getElementById("soundToggleButton");
const typingPreview = document.getElementById("typingPreview");
const progressFill = document.getElementById("progressFill");

// Set category UI
if (categoryTitle) categoryTitle.textContent = selected.title;
if (categoryDescription) categoryDescription.textContent = selected.description;

// State
let typedCharacters = [];
let startTime = null;
let endTime = null;
let timerInterval = null;
let testCompleted = false;
let isContentLoading = false;
let contentLoadId = 0;

// Render target characters as <span> elements
function createTypingText() {
  if (!typingText) return;
  typingText.innerHTML = "";
  targetCharacters.forEach((character, index) => {
    const span = document.createElement("span");
    span.className = "typing-character";
    span.textContent = character;
    span.dataset.index = index;
    typingText.appendChild(span);
  });
}

// Load random content for the category (with fallback text)
async function loadRandomContent() {
  if (typeof getRandomContent !== "function") {
    console.error("content-engine.js must be loaded before practice.js.");
    const fallback = "Keep practicing and focus on accuracy.";
    targetCharacters = Array.from(fallback);
    createTypingText();
    return true;
  }
  const requestId = ++contentLoadId;
  isContentLoading = true;
  if (typingStatus) typingStatus.textContent = "Loading...";
  try {
    const text = await getRandomContent(category);
    if (requestId !== contentLoadId) return false;
    targetCharacters = Array.from(text || "Keep practicing and focus on accuracy.");
    createTypingText();
    return true;
  } catch (error) {
    console.error("Content loading failed:", error);
    if (requestId !== contentLoadId) return false;
    targetCharacters = Array.from("Keep practicing and focus on accuracy.");
    createTypingText();
    return true;
  } finally {
    if (requestId === contentLoadId) isContentLoading = false;
  }
}

// Current typing stats at a given moment
function calculateCurrentStats() {
  const total = typedCharacters.length;
  let correct = 0;
  for (let i = 0; i < total; i++) if (typedCharacters[i] === targetCharacters[i]) correct++;
  const incorrect = total - correct;
  const elapsedSeconds = startTime !== null ? (Date.now() - startTime) / 1000 : 0;
  const minutes = elapsedSeconds / 60;
  const wpm = minutes > 0 ? total / 5 / minutes : 0;
  const accuracy = total > 0 ? (correct / total) * 100 : 100;
  return { total, correct, incorrect, elapsedSeconds, wpm, accuracy };
}

// Update live WPM/time/accuracy display
function updateLiveStats() {
  const stats = calculateCurrentStats();
  if (liveTime) liveTime.textContent = formatTime(Math.floor(stats.elapsedSeconds));
  if (typingTimer) typingTimer.textContent = formatTime(Math.floor(stats.elapsedSeconds));
  if (liveWpm) liveWpm.textContent = stats.wpm.toFixed(1);
  if (liveAccuracy) liveAccuracy.textContent = stats.accuracy.toFixed(1) + "%";
}

// Timer helpers
function startTimer() {
  if (startTime !== null) return;
  startTime = Date.now();
  timerInterval = setInterval(updateLiveStats, 250);
  updateLiveStats();
}
function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (startTime !== null) endTime = Date.now();
}

function formatTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

// Style each typed character as correct/incorrect/current
function renderTypingProgress() {
  if (!typingText) return;
  const characters = typingText.querySelectorAll(".typing-character");
  characters.forEach((character, index) => {
    character.classList.remove("correct", "incorrect", "current");
    if (index < typedCharacters.length) {
      character.classList.add(typedCharacters[index] === targetCharacters[index] ? "correct" : "incorrect");
      return;
    }
    if (index === typedCharacters.length) character.classList.add("current");
  });

  if (typingStatus) {
    typingStatus.textContent = typedCharacters.length >= targetCharacters.length ? "Completed!"
      : typedCharacters.length === 0 ? "Start typing" : "Keep typing";
  }

  updateLiveStats();
  updateProgressBar();
  const current = typingText.querySelector(".current");
  if (current) current.scrollIntoView({ behavior: "smooth", block: "center" });
}

// Progress bar fill showing completion percent
function updateProgressBar() {
  if (!progressFill) return;
  const total = targetCharacters.length;
  progressFill.style.width = (total === 0 ? 0 : Math.min(100, (typedCharacters.length / total) * 100)) + "%";
}

function focusTyping() {
  if (hiddenTypingInput) hiddenTypingInput.focus();
}

// Final result computation after test ends
function calculateResults() {
  const totalCharacters = typedCharacters.length;
  let correctCharacters = 0;
  for (let i = 0; i < totalCharacters; i++) if (typedCharacters[i] === targetCharacters[i]) correctCharacters++;
  const incorrectCharacters = totalCharacters - correctCharacters;
  const actualEndTime = endTime || Date.now();
  const actualStartTime = startTime || actualEndTime;
  const elapsedSeconds = Math.max(0.001, (actualEndTime - actualStartTime) / 1000);
  const wpm = totalCharacters / 5 / (elapsedSeconds / 60);
  const accuracy = totalCharacters === 0 ? 0 : (correctCharacters / totalCharacters) * 100;
  return { wpm, accuracy, elapsedSeconds, totalCharacters, correctCharacters, incorrectCharacters };
}

// POST the completed session to the backend
async function saveTypingSession(results) {
  const session = {
    userId: currentUser.userId,
    userType: currentUser.userType,
    category: selected.title,
    startTime: new Date(startTime).toISOString(),
    endTime: new Date(endTime).toISOString(),
    durationSeconds: results.elapsedSeconds,
    totalCharacters: results.totalCharacters,
    correctCharacters: results.correctCharacters,
    incorrectCharacters: results.incorrectCharacters,
    accuracy: results.accuracy,
    wpm: results.wpm,
  };
  try {
    const payload = { action: "saveTypingSession", session };
    if (currentUser.token) payload.token = currentUser.token;
    const response = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error("Server returned HTTP " + response.status);
    const data = await response.json();
    if (!data.success) throw new Error(data.message || "Could not save typing session.");
    console.log("Typing session saved:", data.data || data);
    return data;
  } catch (error) {
    console.error("Could not save typing session:", error);
    return { success: false, message: error.message };
  }
}

// Show the results screen with computed stats
function showResults() {
  stopTimer();
  const results = calculateResults();
  if (resultCategory) resultCategory.textContent = selected.title;
  if (resultWpm) resultWpm.textContent = results.wpm.toFixed(1);
  if (resultAccuracy) resultAccuracy.textContent = results.accuracy.toFixed(1) + "%";
  if (resultTime) resultTime.textContent = formatTime(Math.round(results.elapsedSeconds));
  if (resultCharacters) resultCharacters.textContent = results.totalCharacters;
  if (resultCorrect) resultCorrect.textContent = results.correctCharacters;
  if (resultIncorrect) resultIncorrect.textContent = results.incorrectCharacters;
  if (typingScreen) typingScreen.classList.add("hidden");
  if (resultsScreen) resultsScreen.classList.remove("hidden");
  testCompleted = true;
  saveTypingSession(results);
  if (hiddenTypingInput) hiddenTypingInput.blur();
}

// Reset state and load a fresh random test
async function resetTest() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  ++contentLoadId;
  typedCharacters = [];
  startTime = null;
  endTime = null;
  testCompleted = false;
  isContentLoading = true;
  if (typingTimer) typingTimer.textContent = "00:00";
  if (liveTime) liveTime.textContent = "00:00";
  if (liveWpm) liveWpm.textContent = "0";
  if (liveAccuracy) liveAccuracy.textContent = "100%";
  if (typingStatus) typingStatus.textContent = "Loading...";
  if (typingScreen) typingScreen.classList.remove("hidden");
  if (resultsScreen) resultsScreen.classList.add("hidden");
  await loadRandomContent();
  if (testCompleted) return;
  renderTypingProgress();
  focusTyping();
}

// keystroke sound effect
const CLICK_SOUND_SOURCES = [
  "data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAAIKABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwP////////////////////////////////8AAAA6TEFNRTMuMTAwAc0AAAAAAAAAABSAJAM+QgAAgAAACChsVZ0+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQxAAADomHObQxgAO/sqw/M4AC+uktjUBDkf4AlDhwMDNAMDc0AABNAgAIJwN9wN3NAAQhxABCr9d3d+IBvxEQqEEIRfQ4AAFXdz67ueiCAMW/+/oAAAAm4GACCdz/nxEQnAAAATcDfd3P/wMDFu7u/9f+uAAAhEL///iAYG58RPrgYGLB/4Yh2eGdlZBQwQQhEZiKRSVaOIQeIEOIdGFhBQFylTGcILEjxJZmHwEOgLLfplgFZ/mEgUIjI3UZE7CZjvEwAdx4VE5S/ryLCF93+jbmuGxOkd1+WZMlZvPO46yD8NOJG38fBazIc3ZYo4kVd9qL7rTT7cVriT7fwLOx2dhmKvPOz8/I5iKTzK4en4PgJ3ZjGtRyq/GaS9y9nbzp6d55TIIzAsam6Vm2ctpZVQ3JnCmk8OWOb/mf/6VTD01JLuH5NDlHLrt2gdm5JaL6Cj3S71j9vPt+5yV6/lykj9u3/6p2V320v08spKXLeP83lulrU1MqTWdaIAAAALgiAWDOABiLftaach627YS8kPP5E0qWZUjWlCbqTQh2//uSxBOAl6mjQ72XgAMnLyYxlg+ZLQb4z0QlFXc9WWdGG8J0HKVZJDLTJVBbDXAhA6U+UIV4NQqWkm5knUhTMXY6lczriGqWVk3iDmV7SeuYsOBGbqPnu/eBWST+LAgM0kZWvayv8xJou80vTP1TN6XpLI+gMMGtsQe5Ws++/eLB72utwtWpnGa/Ua2d79r23uua6r/aFeK+z/j6jQ/mDiWBbtu9QrVg/wbQgTGWAAA5D8FsVJmGAnSJAlwF8I5Ncborc0tGZW9R1ekWaDKFBsEvASAACW0UPhgwxhKBYUaFAJQ4SMCFH5d5JNfCSQiLDhWLkQzP0uzHQM9p4knBCMDikBZalrTkq2whFyogJdxnDJoBd5fRiei0kXCZpCBilaEt8sIl+oZNHUWqTdbg9hHL50TTKI8UryqiVF6qHZYbsKlvRxefHdKvKYz1ciN+MWzKs37NhmYRykzMNFPxRsflDpftuTKJp+trCgz1wWJCxxOWCQHo2iAAAADKZchyJhjREO9YY8FEzBCXmmo3dYdKlMEdHQG0UUlL7uuypMJSt//7ksQWgBk5jy2ssRyKCzPpdYSV+nU5lep5l7XdXci0mAmQk+VQEjUniUNnriJXphEhIMLMdd3jEHLVBRFAbLWwr1bMz10XQidIyCJswapHrEuFBeDdUwtoDzZk6DYvMjtK1aPrp5GxA2tPFTTTKAzz8Klt3B+Z1c9/M1hgWkIYD7NalC4eqeAqHq8r+6rdESNJFaFhwtCySULTEz4/xxyqStRehVkwwimoqyueqm7D7j05tbYkQU05dTpCDx420xPlQVLZQVnjcHfn11yhjeHAUUJQGSNndFmSFmabKT+hVyO5muMWyQkqplAvTnoU2BS/NjqUILM3tLLqoKjN7ctG0c7CotsrCyKV9nXOqMMGhKUeH3mQXQd1SIKlnGFcikle9//Sd2kqiHZleVee0kysvUWIipt9rbCUE3LshNLspEAEhvUucqoAxi4yIS01gH7VKtgtc7auVVWmJDOOAFhMgRVK8RNRgRIULJETKhUSoig6D47+VYPmJBqYLOixZIe1NMsOKiptN8HeUDY4ad7Wpqg1yjlpmadeaFr5zRgKhHD/+5LENoAUkZ1DrCUQ2lignUT2GjgVRSQ6BsLCxxJosdHRRxRxMDDwWoJQhEIRiQ6Fm2aTSqZSjlhpbWrVBZqhr+V6+G4Fm7WpFRh0YAx9HehijRhxE5J8YavcIKuUq4Y2xcr6saVSZFUvF0hCcZmhsWTIkj0JpDMH+5cSQ6GkTyonQi6UimUiGXzxBPVzLSUvFI7NDY9MiSHQOhaOBPNEbv5tbLVy06Ko9CkaSQW1Co9XHIoCJoLypZ3jZbZOLdpONOLAgMDILwGQqKB5/X+EhWZBYXEaTISFblC9ICFhUy5QvUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV",
  "data:audio/mp3;base64,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",
  "data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAAIKABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwP////////////////////////////////8AAAA6TEFNRTMuMTAwAc0AAAAAAAAAABSAJAM+QgAAgAAACCht0W4/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQxAAAE/2BItRmAANasex/M4ABgAAAHIQ9kyaemAMLT0wgEIOcGBg4nEMG5bKgAYBx3ssMHNXkgQAIA0UFcEx3SABgBgfJ7/ywYCWjKgIAcJjp2ZmBgs669e/+3Xr16+80Xr38WGBgecxTppSmmYNBEPKnYliWfwEsnv4w503owsMFjnavWONnZmv/KXvf5ylOnW16+95pf5nbr3/vf5mZmZmZylKTSnTt5xg/Xvn85qBMP92b15uRQRIOgZjsyGIur5hwjQCWc1SUOCaMWZc5UjR8cissO3LEqFKXXHpQaAh4KYXEncd8aEdQiIDCJVD3GXMtfNdjcocdCA4k8K5JZ34tAcLepdDdnyZazqJ6h2fceAH4llJEIGnqFy5XYzluGq3OW86e5YuymWT1V7ml0Na7YpbnaS99iv2nyllSlwmcLVV/nxyyzprNyzrKKb7n/95/+z9HCVWn/nnqqxivfyjPMabL7O9fh///52/73/79uku9jFh/IGm6S7L7cox/Lv/lWq0tKFFFLksLAAAAesAo2AmKWMnVfKVyQwzR//uSxAqAlKWHR52HgAs4JaWRrL25f+5/jSpyRtxfI5DtlEjSrT5kn4rkOfuJ6kFFlUiqMk82ElAtJTAYgax4jgHOWRbFwQVS1iwF9h0uKs7C3a9L2jZh2tuBWFiNLLrWcahZ3nU8Ku9PXtt0xjHq994sHPw+fa+/CvCtb/OJ/8b/r8fX/1umrW3/F+Mb/1T+uaf/+2a63i2a7rj+tra+J/KSudr+gIwAAAK0jUQyUHCGBJVNfUGg193RYrFlq5kQT5PwzllizlU0FhQsAsA4NhCNRsLIgAlIUVADAJNN4wIOXgzVqggNGjRZ4eaQ3i5xoHmcLFghFWJ/RQoAhNDaourhchmSGMLZ6pwuxrSY8A5Hqc2A14oyG5hIIyIWuDl7KcJLSSpS51ORKC8p1wmWjhhqs5TtJSrDKOKIttR5RI00FOr8zE8f2dLSuSDSxLURQuyugvY2bwn31Ce+2H0aNGs/Y13wmf164rXk+gvwhjhtqP6qTu2taRBTctx1B0AxjdSoH0uw/S7lyHkKM/UAJKyvRvW9MKqHypsZVMwbQhBNEv/7ksQXAA+1FVOnpM6TfqXjlbxo+evPYs3haAkCrPPc3TXTRBaz7gglVbRtNcsv9zchm/JJ/G6Pm51lljcg30/6HmqQSREweGAJtoJyWbmyoSjMGg0eKoPfoOpESgkGiLqjyWyYIAAFVsyCGLVIHDxULGy51mIbqNkgNNyXmXTVFLoMZanSPAL5Gtl0ecblCgRCZN0HBEgmiJgEPORrBEzaYDP65dgCDzOBUOhqihlt4IBGEKGLUA5kFST/A6AYMm2EEClF1BAoKReAS9Q5rSGrIJouWj7ATIGvOjQsuQHMFL0QpTVmMBP9AUham2RRu3D76XZcsDeZ0yhXK/7MZa9BTW3yij4uzDE9BMo7SZ012/I5py19cjUmduR0lbsDzT8Z/jMz96G617OpyvZn8rPa24COS33vKofZsm62N/fyfuG4A+oBVVIAAABZiWnoiY7wYePOBhwsiPNFtV4pwIrPC5JalYBD8GAJWytTVmThlwS7KHJCKBowmEFCRYAOCUFBJwskl8vYQAjwoBEQngo2CqoiHNh0aZbaBAKElWGChcL/+5LELoAZ2ZcdjLDcwfeyYCiRm11H15U5m+Z8pc+segmnZ8ilClyWIqoB6IUZKfKxalocR1wvABFsxBrFMD4NT0xW0MmHqtLnmc3WkqmFSuXXs02e5ZMTnqPHK3P76su7nztHqk4DDEiXb1cs+PCNc5L1WuqjSPntn7bj4d/6p2uFEnhI7FgAIAAJIIVEJRG57KIhLFi6iNRNZUscXYe5plZVNSeb/JVVKcNzYrLLsPZaQlip0ILGZf+WOTBQUssssmRkyhgYNLLLvSP7DJWssrBQoS82TjRRR8Xm5v///////2ad43NmjTirjc2acsxPNmjSirzZqTiy4XNScacUeglK0zVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV",
  "data:audio/mp3;base64,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",
  "data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAAIKABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwP////////////////////////////////8AAAA6TEFNRTMuMTAwAc0AAAAAAAAAABSAJAM+QgAAgAAACCh8CmVzAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQxAAAEzmbK7RkgAt1Mes/MPAAcURRAAAAIFqGOTJkydGEydsYCEELQIGMRhcEycoAMDZtIgJGExWAADAYcRhcEycoAMAYb1RAxi4oFAoJGLRo2//NdGj2CNGjnv/8+ogQIEEPUIZ5zn/NdGjn/4Qh//a6BBlo0aN6grFaPahn/////FZO3UEEIQnNGjRo5////zmjQEAoQMZc/PqEAoFCBiH//89qc6UQIGAAPupy6qVdgdQMgoEQaBAkPhREbwcWYwplOC5yVyr2vJGIrPAtNBAgpEkXYhdRQmMTMA8KokyFiKEICrBRl9LDFjGQnBDy3lsT47j4ECCZRVVefxqlJDoPxqAIQNYl6rQmz1PuW5B+HvCW0szxlzETKuXelZLd/ZkNNhcV4yCiQ1sYWJvu9jRMx83vHmjubbAe3fHMd5BPAVcd6xe0JbkiYp4m6a4KhRKU8FUSQwUE1uDIoartXRoUb4/8fN52tnt9bzvF3jv4WjPQR6IxWP36rw8385hQmJhevQ6Kf/+Wm/2taRCcblpdBkgagJgmQs4mpTth//uSxAqADwEvZbz0ABLZsql1hiYrOileODEK6mVSrhBDkPQ5DwYcHxQqbHypo2Y0W2tg8D0LHFmQzEh6bQrNW/1oUMtSnPpypMuuOK+eaUmvnn/lSWu5qfn3g5than4blSWta/qeVWsmiOYKuwEqWLPvPlmAJcJPTk1rYBITTdwyQIahNRxDDDQp1AKhIZsXyUDLqSxM9j0hbxmLsS5iCUuGzCESFDKgKx0BMoPLzGBgXGy8tGiH8RNdbd7OWDYTDclieeHKZAofCtITtJBwgDfICrbM8MmXRlKyeS+sSuLhSfYJg6tMjqmUX1FNC1SzCqpEUJ0aJoO3c/tS+w3/xsFh5FecTNvLsw1CynG4yuLUZbaF0FLbGQCiVEWKIVguqqFUTSSrQqG0MUU2eKSqAdkLAAAAAMhmw5vqw0uDjgkTMeKesaJjoAtS34GLQDBw0BdtIxRe82jIkkjINKZVsBM1XzMx0FgU8AiGJqmQJiIAojKTRoHkiKZi6IRj2DmY0aOIS5rlKOERoixReK1lmo8O61tNKMS6PzrcWOQFTQ1xN//7ksQ5gBw1mSmtYZHCeLGotYYl+jTyKUw6+bu8swS/VaMTztXKFkSkr8WglujvxmM7NnytGPhKNhSPqqiNaVTBDdWn48pikb0Pyl6Isn+tr1eRKaLrWzshT3PkEm8hywvMupHFRPXWGH6VjPmJf9mka2xzFljGCXrTBeGj2wa/PTORenLdakkCmnLSBN8aY0xXJEVEJrKCqB5e5YZNNU6gDFJx2GUrA9Kh6DRMSiobLY0RufJYgYzf9oeCS6Tymaukrjtx3lZ+Hcbq1StaMdiSrrPq15ibLbFrTzmOT1bv1cQHLfd9g5Lonw1a72kB9uLI3apEKGG1jllCTy6q2E6b6zW1ko5zWa+FP+f179Iv2/l5Ww331XZfz3GF/7X9JN6uTltkZBBSacgiGEJBB0BgBCPNSpMJDEUwFZ6LBWSzARDYYpiW6ygWFuofJVhOzrpHzAzHgZGK5pHE8t4vCMHRRY8OjMqDs96gRjlbElSPDiay9WWoWGDo+su+V0N3S8ZoCOLzqlfcJza3Gk6t7/Nr1W+SRb8jYTjUKRr/sbmTua3/+5LEQAAT5Yk7rDDR0VyRJfRnpa65LGJkcr12y81i4dmrf61nrarf2d/Wz2Jbs7OqJNZIhJtOSWWRIJx2uNwkCigK4tS2VPLlfYH7yO6Zk6OYmRhm4c6gR6NQ5SyyJ03jtPhFoYo22USaA+ShYZOqJnC6B7O/yVok+qaZaj/r9ihb6xT+VFBb///FakxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
];

const BACKSPACE_SOUND_SRC =
  "data:audio/mp3;base64,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";

const ERROR_SOUND_SRC =
  "data:audio/mp3;base64,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";

let soundEnabled = localStorage.getItem("typingSoundEnabled") !== "false"; // default: on

// Pool of pre-loaded <audio> elements per sound for overlapping plays
function createSoundPlayer(src, poolSize) {
  const pool = [];
  for (let i = 0; i < poolSize; i++) {
    const audio = new Audio(src);
    audio.preload = "auto";
    pool.push(audio);
  }
  let nextIndex = 0;
  return function play(playbackRate) {
    if (!soundEnabled) return;
    const audio = pool[nextIndex];
    nextIndex = (nextIndex + 1) % pool.length;
    audio.currentTime = 0;
    audio.playbackRate = playbackRate || 1;
    audio.play().catch(function () {}); // skip if no user gesture yet
  };
}

// One pool per sample so the same click can overlap while typing fast
const clickPlayers = CLICK_SOUND_SOURCES.map(src => createSoundPlayer(src, 3));
const playBackspaceClick = createSoundPlayer(BACKSPACE_SOUND_SRC, 3);
const playErrorClick = createSoundPlayer(ERROR_SOUND_SRC, 3);
function playTypeSound() { clickPlayers[Math.floor(Math.random() * clickPlayers.length)](1); }
function playBackspaceSound() { playBackspaceClick(1); }
function playErrorSound() { playErrorClick(1); }

// Monochrome speaker icons for the sound toggle
const SOUND_ON_ICON = '<svg class="icon-sound" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
const SOUND_OFF_ICON = '<svg class="icon-sound" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';

function updateSoundToggleUI() {
  if (!soundToggleButton) return;
  soundToggleButton.innerHTML = soundEnabled ? SOUND_ON_ICON : SOUND_OFF_ICON;
  soundToggleButton.setAttribute("aria-pressed", String(soundEnabled));
  soundToggleButton.title = soundEnabled ? "Sound on (click to mute)" : "Sound off (click to unmute)";
}
updateSoundToggleUI();
if (soundToggleButton) {
  soundToggleButton.addEventListener("click", event => {
    event.stopPropagation();
    soundEnabled = !soundEnabled;
    localStorage.setItem("typingSoundEnabled", String(soundEnabled));
    updateSoundToggleUI();
  });
}

// Wrong-character feedback: vibrate (mobile) + shake the preview
function triggerWrongCharacterFeedback() {
  if (navigator.vibrate) navigator.vibrate(60);
  if (!typingPreview) return;
  typingPreview.classList.remove("shake");
  void typingPreview.offsetWidth;
  typingPreview.classList.add("shake");
  typingPreview.addEventListener("animationend", () => typingPreview.classList.remove("shake"), { once: true });
}

// Capture keystrokes and track progress
document.addEventListener("keydown", event => {
  if (testCompleted || isContentLoading) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;

  // Backspace removes the last typed character
  if (event.key === "Backspace") {
    event.preventDefault();
    if (typedCharacters.length === 0) return;
    typedCharacters.pop();
    playBackspaceSound();
    renderTypingProgress();
    return;
  }

  if (event.key.length !== 1) return; // ignore modifier/non-character keys
  event.preventDefault();
  if (typedCharacters.length >= targetCharacters.length) return;
  startTimer();

  const typedIndex = typedCharacters.length;
  const isCorrect = event.key === targetCharacters[typedIndex];
  typedCharacters.push(event.key);
  if (isCorrect) playTypeSound();
  else { playErrorSound(); triggerWrongCharacterFeedback(); }
  renderTypingProgress();
  if (typedCharacters.length === targetCharacters.length) showResults();
});

// Click typing area to focus
if (typingPage) {
  typingPage.addEventListener("click", event => {
    if (event.target.closest("button")) return;
    if (testCompleted) return;
    focusTyping();
  });
}

// Buttons
if (restartButton) restartButton.addEventListener("click", e => { e.stopPropagation(); resetTest(); });
if (tryAgainButton) tryAgainButton.addEventListener("click", e => { e.stopPropagation(); resetTest(); });
if (backButton) backButton.addEventListener("click", e => { e.stopPropagation(); window.location.href = "index.html"; });
if (resultsBackButton) resultsBackButton.addEventListener("click", e => { e.stopPropagation(); window.location.href = "index.html"; });
if (practiceNav) practiceNav.addEventListener("click", () => window.location.href = "index.html");

// Initialize with a fresh test
resetTest();

// Focus input once page finishes loading
window.addEventListener("load", () => setTimeout(focusTyping, 150));
