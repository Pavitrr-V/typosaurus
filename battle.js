// Bot battle — purely local (no Firebase, no multiplayer server, no battle database). Uses content-engine.js for text.
// Also exposes syncBattleResultToServer() (used by multiplayer.js, loaded after this file): every finished battle —
// bot or real match — is synced to the backend so wins show on the leaderboard (recalculated from BattleResults rows per load).

// BATTLE RESULT SYNC — sends finished battles to the leaderboard. Uses ACCOUNT_API_URL (defined in account.js, loaded first)
// since it points at the same deployed web app. Guests are skipped — only logged-in users have a stable leaderboard identity.
function syncBattleResultToServer(battle) {
  try {
    if (typeof getStoredUser !== "function") return;
    const stored = getStoredUser();
    if (!stored || !stored.token) return;
    const apiUrl = (typeof ACCOUNT_API_URL !== "undefined" && ACCOUNT_API_URL) ||
      (typeof APPS_SCRIPT_URL !== "undefined" && APPS_SCRIPT_URL) || null;
    if (!apiUrl) { console.warn("No API URL available to sync battle result."); return; }
    fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "saveBattleResult", token: stored.token, battle: battle }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data || !data.success) { console.warn("Battle result not saved:", data && data.message); return; }
        console.log("Battle result synced to leaderboard:", data.data);
      })
      .catch((error) => { console.warn("Could not sync battle result:", error); });
  } catch (error) { console.warn("Could not sync battle result:", error); }
}

// STATE
let selectedDifficulty = "easy";
let selectedCategory = "easy";
let battleText = "";
let targetCharacters = [];
let typedCharacters = [];
let battleStarted = false;
let battleFinished = false;
let battleStartTime = null;
let battleTimer = null;
let countdownTimer = null;
let botTimer = null;
let botProgressCharacters = 0;
let botMistakes = 0;
let botCurrentWpm = 0;
let botDisplayWpm = 0;
let botStartTime = null;
let battleGeneration = 0;

// BOT CONFIG — per-difficulty name, WPM range, accuracy, and tick-to-tick speed variation.
const BOT_CONFIG = {
  easy: { name: "EasyBot", minWpm: 25, maxWpm: 40, accuracy: 0.90, variation: 0.14 },
  medium: { name: "SpeedBot", minWpm: 45, maxWpm: 65, accuracy: 0.95, variation: 0.10 },
  hard: { name: "ProBot", minWpm: 70, maxWpm: 95, accuracy: 0.97, variation: 0.07 },
};

// BATTLE SCORE — the RACE decides who finishes first (pacing/drama), but the WINNER is decided by this score, not raw
// completion time (else someone could win by mashing random keys, since every keystroke advances the race).
// Score = NET WPM (correct − incorrect keystrokes, mistakes actively cost you) × accuracy penalty squared, so garbage
// typing collapses: 50% acc → 25% of net WPM · 90% acc → 81% · 20% acc (~random mashing) → ~4%. Same shape as the
// practice leaderboard formula, kept separate here so it can plug into a future battle leaderboard untouched.
const BATTLE_SCORE_CONFIG = {
  ACCURACY_EXPONENT: 2,     // higher = harsher punishment for inaccurate typing
  MIN_ELAPSED_SECONDS: 1,   // floor elapsed time so a near-instant finish can't yield absurd WPM
  MAX_WPM: 250,             // sanity cap
};

// Net WPM: only correct chars count toward speed; incorrect chars subtract, so mistake-built speed doesn't help.
function calculateNetWpm(correctCount, incorrectCount, elapsedSeconds) {
  const minutes = Math.max(elapsedSeconds, BATTLE_SCORE_CONFIG.MIN_ELAPSED_SECONDS) / 60;
  const netCharacters = correctCount - incorrectCount;
  const rawNetWpm = netCharacters / 5 / minutes;
  return clamp(rawNetWpm, 0, BATTLE_SCORE_CONFIG.MAX_WPM);
}

// Combines net WPM + accuracy into the single number that decides battles (and later the battle leaderboard).
function calculateBattleScore(correctCount, incorrectCount, elapsedSeconds) {
  correctCount = Math.max(0, correctCount);
  incorrectCount = Math.max(0, incorrectCount);
  const totalTyped = correctCount + incorrectCount;
  const accuracy = totalTyped > 0 ? (correctCount / totalTyped) * 100 : 0;
  const netWpm = calculateNetWpm(correctCount, incorrectCount, elapsedSeconds);
  const accuracyMultiplier = Math.pow(clamp(accuracy, 0, 100) / 100, BATTLE_SCORE_CONFIG.ACCURACY_EXPONENT);
  const score = netWpm * accuracyMultiplier;
  return {
    netWpm: Math.round(netWpm * 10) / 10,
    accuracy: Math.round(accuracy * 10) / 10,
    score: Math.round(score * 10) / 10,
  };
}

// DOM
const battleSetup = document.getElementById("battleSetup");
const battleCountdown = document.getElementById("battleCountdown");
const battleGame = document.getElementById("battleGame");
const battleResult = document.getElementById("battleResult");
const startBattleButton = document.getElementById("startBattleButton");
const battleCategory = document.getElementById("battleCategory");
const countdownNumber = document.getElementById("countdownNumber");
const battleTypingText = document.getElementById("battleTypingText");
const battleTypingCard = battleTypingText ? battleTypingText.closest(".battle-typing-card") : null;
const battleTypingInput = document.getElementById("battleTypingInput");
// Extra safeguard: block paste outright. The race never reads this input's value (it tracks keystrokes via keydown),
// so paste can't advance progress anyway — this just stops it entirely.
if (battleTypingInput) battleTypingInput.addEventListener("paste", (event) => { event.preventDefault(); });
const battleStatus = document.getElementById("battleStatus");
const battleTime = document.getElementById("battleTime");
const userProgress = document.getElementById("userProgress");
const botProgress = document.getElementById("botProgress");
const userProgressText = document.getElementById("userProgressText");
const botProgressText = document.getElementById("botProgressText");
const userWpm = document.getElementById("userWpm");
const botWpm = document.getElementById("botWpm");
const userAccuracy = document.getElementById("userAccuracy");
const botAccuracy = document.getElementById("botAccuracy");
const battleUserName = document.getElementById("battleUserName");
const battleUserAvatar = document.getElementById("battleUserAvatar");
// Captured once up front: applyRacerAvatar() replaces this container's contents each battle, which would detach
// battleUserAvatar (and break .parentElement) after the first call.
const battleUserAvatarContainer = battleUserAvatar ? battleUserAvatar.parentElement : null;
const botName = document.getElementById("botName");
const battleCategoryLabel = document.getElementById("battleCategoryLabel");
const battleDifficultyLabel = document.getElementById("battleDifficultyLabel");
const setupBackButton = document.getElementById("setupBackButton");
const quitBattleButton = document.getElementById("quitBattleButton");
const rematchButton = document.getElementById("rematchButton");
const resultBackButton = document.getElementById("resultBackButton");
const resultBattleIcon = document.getElementById("resultBattleIcon");
const battleResultTitle = document.getElementById("battleResultTitle");
const battleResultSubtitle = document.getElementById("battleResultSubtitle");
const resultUserWpm = document.getElementById("resultUserWpm");
const resultBotWpm = document.getElementById("resultBotWpm");
const resultUserAccuracy = document.getElementById("resultUserAccuracy");
const resultBotAccuracy = document.getElementById("resultBotAccuracy");
const resultUserScore = document.getElementById("resultUserScore");
const resultBotScore = document.getElementById("resultBotScore");

// USER — reads the stored profile; only trusts the picture if it's in the same allowed list account.js checks.
function getBattleUser() {
  try {
    const storedUser = localStorage.getItem("typingUser");
    if (storedUser) {
      const user = JSON.parse(storedUser);
      if (user) {
        const name = user.displayName || user.username || "You";
        const isValidPicture = typeof PROFILE_PICTURES !== "undefined" &&
          Array.isArray(PROFILE_PICTURES) && PROFILE_PICTURES.includes(user.profilePicture);
        return { name, avatarUrl: isValidPicture ? user.profilePicture : null };
      }
    }
  } catch (error) { console.warn("Could not read typing user:", error); }
  return { name: "Guest", avatarUrl: null };
}

// RACER AVATAR — image if a valid picture is available, else the name's initial; falls back to initial if image fails.
function applyRacerAvatar(container, name, avatarUrl) {
  if (!container) return;
  container.innerHTML = "";
  if (avatarUrl) {
    const img = document.createElement("img");
    img.src = avatarUrl;
    img.alt = "Profile picture";
    img.loading = "lazy";
    img.className = "racer-avatar-image";
    img.onerror = function () {
      container.innerHTML = "";
      container.textContent = (name || "G").charAt(0).toUpperCase();
    };
    container.appendChild(img);
    return;
  }
  container.textContent = (name || "G").charAt(0).toUpperCase();
}

// DIFFICULTY SELECTION
document.querySelectorAll(".difficulty-option").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".difficulty-option").forEach((item) => { item.classList.remove("active"); });
    button.classList.add("active");
    selectedDifficulty = button.dataset.difficulty;
  });
});

// CATEGORY SELECTION
if (battleCategory) battleCategory.addEventListener("change", () => { selectedCategory = battleCategory.value; });

// SHOW SCREEN — only the passed screen is visible; the rest hide.
function showScreen(screen) {
  battleSetup.classList.add("hidden");
  battleCountdown.classList.add("hidden");
  battleGame.classList.add("hidden");
  battleResult.classList.add("hidden");
  screen.classList.remove("hidden");
}

// LOAD CONTENT — pulls a fresh random passage from content-engine.js for the selected category.
async function loadBattleContent() {
  if (typeof getRandomContent !== "function") throw new Error("content-engine.js is not loaded.");
  const text = await getRandomContent(selectedCategory);
  battleText = text || "Keep practicing and focus on accuracy.";
  targetCharacters = Array.from(battleText);
}

// CREATE TEXT — renders each character of the target text as its own span (one per keystroke).
function renderBattleText() {
  battleTypingText.innerHTML = "";
  targetCharacters.forEach((character, index) => {
    const span = document.createElement("span");
    span.className = "battle-character";
    span.textContent = character;
    span.dataset.index = index;
    battleTypingText.appendChild(span);
  });
}

// START BUTTON
if (startBattleButton) startBattleButton.addEventListener("click", startBattleSetup);

// START BATTLE — loads the text, then hands off to prepareBattle(); button shows a loading state meanwhile.
async function startBattleSetup() {
  if (battleStarted) return;
  startBattleButton.disabled = true;
  startBattleButton.textContent = "Loading...";
  try {
    await loadBattleContent();
    prepareBattle();
  } catch (error) {
    console.error("Could not start battle:", error);
    alert("Could not load the battle text. Please try again.");
  } finally {
    startBattleButton.disabled = false;
    startBattleButton.textContent = "⚔ Start Battle";
  }
}

// PREPARE — resets all state to a fresh battle and shows the 3-2-1 countdown.
function prepareBattle() {
  battleGeneration++;
  clearTimers();
  battleStarted = false;
  battleFinished = false;
  battleStartTime = null;
  typedCharacters = [];
  botProgressCharacters = 0;
  botMistakes = 0;
  botCurrentWpm = 0;
  botDisplayWpm = 0;
  botStartTime = null;
  renderBattleText();
  const user = getBattleUser();
  const bot = BOT_CONFIG[selectedDifficulty];
  battleUserName.textContent = user.name;
  applyRacerAvatar(battleUserAvatarContainer, user.name, user.avatarUrl);
  botName.textContent = bot.name;
  battleCategoryLabel.textContent = getCategoryName(selectedCategory);
  battleDifficultyLabel.textContent = capitalize(selectedDifficulty);
  resetBattleUI();
  showScreen(battleCountdown);
  startCountdown();
}

// CATEGORY NAME — human label for the battle result screen.
function getCategoryName(category) {
  const names = {
    easy: "Easy Words",
    hard: "Hard Words",
    paragraph: "Paragraphs",
    story: "Stories",
    coding: "Coding",
    genz: "Gen Z / Slang",
    numbers: "Numbers & Symbols",
    quotes: "Quotes",
    mixed: "Mixed Challenge",
  };
  return names[category] || "Typing Battle";
}

// COUNTDOWN — 3, 2, 1 then "GO!", each tick restarting the pop animation, then beginBattle().
function startCountdown() {
  let count = 3;
  const showNumber = (number) => {
    countdownNumber.textContent = number;
    countdownNumber.style.animation = "none";
    void countdownNumber.offsetWidth;
    countdownNumber.style.animation = "countdownPop 0.8s ease";
  };
  showNumber(count);
  countdownTimer = setInterval(() => {
    count--;
    if (count > 0) { showNumber(count); return; }
    clearInterval(countdownTimer);
    countdownTimer = null;
    showNumber("GO!");
    setTimeout(() => { beginBattle(); }, 500);
  }, 1000);
}

// BEGIN — starts the real race: timers for the clock and the bot, focus on the hidden input.
function beginBattle() {
  if (battleFinished) return;
  showScreen(battleGame);
  battleStarted = true;
  battleStartTime = Date.now();
  botStartTime = Date.now();
  battleStatus.textContent = "Start typing!";
  focusBattleInput();
  startBattleTimer();
  startBot();
}

// TIMER — 100ms tick driving the live stats while the race runs.
function startBattleTimer() {
  clearInterval(battleTimer);
  battleTimer = setInterval(() => { updateBattleStats(); }, 100);
}

// UPDATE STATS — live clock, progress bars, WPM and accuracy; ends the race when the user hits the end of the text.
function updateBattleStats() {
  if (!battleStarted) return;
  const elapsed = Math.max(0, (Date.now() - battleStartTime) / 1000);
  battleTime.textContent = formatTime(elapsed);
  const userTotal = typedCharacters.length;
  let correct = 0;
  for (let i = 0; i < userTotal; i++) { if (typedCharacters[i] === targetCharacters[i]) correct++; }
  const accuracy = userTotal > 0 ? (correct / userTotal) * 100 : 100;
  const minutes = elapsed / 60;
  const wpm = minutes > 0 ? userTotal / 5 / minutes : 0;
  const userPercent = targetCharacters.length > 0 ? Math.min(100, (userTotal / targetCharacters.length) * 100) : 0;
  userProgress.style.width = userPercent + "%";
  userProgressText.textContent = Math.round(userPercent) + "%";
  userWpm.textContent = Math.round(wpm);
  userAccuracy.textContent = Math.round(accuracy) + "%";
  updateBotUI();
  if (userTotal >= targetCharacters.length) finishBattle("user");
}

// BOT — HUMAN-LIKE PACING. Real typists don't hold one constant speed, so instead of a steady WPM with light noise:
//  1. Picks a fresh target pace every 1-2s and eases current speed toward it (drifts, doesn't just jitter).
//  2. Adds per-tick jitter for natural wobble.
//  3. Starts a bit slower, like warming up.
//  4. Occasionally hesitates a beat — far more likely right after a word/punctuation, like a person reading ahead.
function startBot() {
  const config = BOT_CONFIG[selectedDifficulty];
  let botTargetWpm = randomBetween(config.minWpm, config.maxWpm);
  botCurrentWpm = botTargetWpm * randomBetween(0.7, 0.9); // warming up
  botDisplayWpm = botCurrentWpm;
  let nextTargetChangeAt = Date.now() + randomBetween(500, 1500);
  let hesitateUntil = 0;
  let lastUpdate = Date.now();
  const generation = battleGeneration;
  botTimer = setInterval(() => {
    if (generation !== battleGeneration || !battleStarted || battleFinished) { clearInterval(botTimer); return; }
    const now = Date.now();
    const delta = now - lastUpdate;
    lastUpdate = now;
    // Drift toward a freshly-chosen pace every second or two
    if (now >= nextTargetChangeAt) {
      botTargetWpm = randomBetween(config.minWpm, config.maxWpm);
      nextTargetChangeAt = now + randomBetween(600, 2000);
    }
    // Occasionally hesitate a beat (much more likely at a word boundary)
    const charIndex = Math.floor(botProgressCharacters);
    const justAfterWord = charIndex > 0 && /[\s.,!?;:]/.test(targetCharacters[charIndex - 1] || "");
    const hesitationChance = justAfterWord ? 0.05 : 0.012;
    if (now >= hesitateUntil && Math.random() < hesitationChance) hesitateUntil = now + randomBetween(150, 450);
    // Ease underlying speed toward target (not snap), then add per-tick jitter
    botCurrentWpm += (botTargetWpm - botCurrentWpm) * 0.15;
    const jitter = 1 + randomBetween(-config.variation, config.variation);
    let instantWpm = clamp(botCurrentWpm * jitter, config.minWpm * 0.5, config.maxWpm * 1.15);
    if (now < hesitateUntil) instantWpm *= 0.08; // near-crawl mid-hesitation
    botDisplayWpm = instantWpm;
    // WPM -> characters per second (1 word = 5 characters)
    const charactersPerSecond = instantWpm * 5 / 60;
    botProgressCharacters += charactersPerSecond * (delta / 1000);
    // Bot accuracy determines occasional mistakes
    const expectedCharacters = Math.floor(botProgressCharacters);
    const expectedMistakes = expectedCharacters * (1 - config.accuracy);
    if (expectedMistakes > botMistakes) botMistakes = Math.floor(expectedMistakes);
    if (botProgressCharacters >= targetCharacters.length) botProgressCharacters = targetCharacters.length;
    updateBotUI();
    if (botProgressCharacters >= targetCharacters.length) finishBattle("bot");
  }, 120);
}

// BOT UI — bot progress bar, progress %, WPM and accuracy display.
function updateBotUI() {
  const percent = targetCharacters.length > 0 ? Math.min(100, (botProgressCharacters / targetCharacters.length) * 100) : 0;
  botProgress.style.width = percent + "%";
  botProgressText.textContent = Math.round(percent) + "%";
  botWpm.textContent = Math.round(Math.max(0, botDisplayWpm));
  const config = BOT_CONFIG[selectedDifficulty];
  const accuracy = Math.max(0, Math.min(100, config.accuracy * 100));
  botAccuracy.textContent = Math.round(accuracy) + "%";
}

// SOUND EFFECTS — same click/backspace/error samples as practice.js and same "typingSoundEnabled" flag, so muting one page mutes the other.
    const CLICK_SOUND_SOURCES = [
    "data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAAIKABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwP////////////////////////////////8AAAA6TEFNRTMuMTAwAc0AAAAAAAAAABSAJAM+QgAAgAAACChsVZ0+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQxAAADomHObQxgAO/sqw/M4AC+uktjUBDkf4AlDhwMDNAMDc0AABNAgAIJwN9wN3NAAQhxABCr9d3d+IBvxEQqEEIRfQ4AAFXdz67ueiCAMW/+/oAAAAm4GACCdz/nxEQnAAAATcDfd3P/wMDFu7u/9f+uAAAhEL///iAYG58RPrgYGLB/4Yh2eGdlZBQwQQhEZiKRSVaOIQeIEOIdGFhBQFylTGcILEjxJZmHwEOgLLfplgFZ/mEgUIjI3UZE7CZjvEwAdx4VE5S/ryLCF93+jbmuGxOkd1+WZMlZvPO46yD8NOJG38fBazIc3ZYo4kVd9qL7rTT7cVriT7fwLOx2dhmKvPOz8/I5iKTzK4en4PgJ3ZjGtRyq/GaS9y9nbzp6d55TIIzAsam6Vm2ctpZVQ3JnCmk8OWOb/mf/6VTD01JLuH5NDlHLrt2gdm5JaL6Cj3S71j9vPt+5yV6/lykj9u3/6p2V320v08spKXLeP83lulrU1MqTWdaIAAAALgiAWDOABiLftaach627YS8kPP5E0qWZUjWlCbqTQh2//uSxBOAl6mjQ72XgAMnLyYxlg+ZLQb4z0QlFXc9WWdGG8J0HKVZJDLTJVBbDXAhA6U+UIV4NQqWkm5knUhTMXY6lczriGqWVk3iDmV7SeuYsOBGbqPnu/eBWST+LAgM0kZWvayv8xJou80vTP1TN6XpLI+gMMGtsQe5Ws++/eLB72utwtWpnGa/Ua2d79r23uua6r/aFeK+z/j6jQ/mDiWBbtu9QrVg/wbQgTGWAAA5D8FsVJmGAnSJAlwF8I5Ncborc0tGZW9R1ekWaDKFBsEvASAACW0UPhgwxhKBYUaFAJQ4SMCFH5d5JNfCSQiLDhWLkQzP0uzHQM9p4knBCMDikBZalrTkq2whFyogJdxnDJoBd5fRiei0kXCZpCBilaEt8sIl+oZNHUWqTdbg9hHL50TTKI8UryqiVF6qHZYbsKlvRxefHdKvKYz1ciN+MWzKs37NhmYRykzMNFPxRsflDpftuTKJp+trCgz1wWJCxxOWCQHo2iAAAADKZchyJhjREO9YY8FEzBCXmmo3dYdKlMEdHQG0UUlL7uuypMJSt//7ksQWgBk5jy2ssRyKCzPpdYSV+nU5lep5l7XdXci0mAmQk+VQEjUniUNnriJXphEhIMLMdd3jEHLVBRFAbLWwr1bMz10XQidIyCJswapHrEuFBeDdUwtoDzZk6DYvMjtK1aPrp5GxA2tPFTTTKAzz8Klt3B+Z1c9/M1hgWkIYD7NalC4eqeAqHq8r+6rdESNJFaFhwtCySULTEz4/xxyqStRehVkwwimoqyueqm7D7j05tbYkQU05dTpCDx420xPlQVLZQVnjcHfn11yhjeHAUUJQGSNndFmSFmabKT+hVyO5muMWyQkqplAvTnoU2BS/NjqUILM3tLLqoKjN7ctG0c7CotsrCyKV9nXOqMMGhKUeH3mQXQd1SIKlnGFcikle9//Sd2kqiHZleVee0kysvUWIipt9rbCUE3LshNLspEAEhvUucqoAxi4yIS01gH7VKtgtc7auVVWmJDOOAFhMgRVK8RNRgRIULJETKhUSoig6D47+VYPmJBqYLOixZIe1NMsOKiptN8HeUDY4ad7Wpqg1yjlpmadeaFr5zRgKhHD/+5LENoAUkZ1DrCUQ2lignUT2GjgVRSQ6BsLCxxJosdHRRxRxMDDwWoJQhEIRiQ6Fm2aTSqZSjlhpbWrVBZqhr+V6+G4Fm7WpFRh0YAx9HehijRhxE5J8YavcIKuUq4Y2xcr6saVSZFUvF0hCcZmhsWTIkj0JpDMH+5cSQ6GkTyonQi6UimUiGXzxBPVzLSUvFI7NDY9MiSHQOhaOBPNEbv5tbLVy06Ko9CkaSQW1Co9XHIoCJoLypZ3jZbZOLdpONOLAgMDILwGQqKB5/X+EhWZBYXEaTISFblC9ICFhUy5QvUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV",
    "data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAAIKABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwP////////////////////////////////8AAAA6TEFNRTMuMTAwAc0AAAAAAAAAABSAJAM+QgAAgAAACCh8CmVzAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQxAAAEzmbK7RkgAt1Mes/MPAAcURRAAAAIFqGOTJkydGEydsYCEELQIGMRhcEycoAMDZtIgJGExWAADAYcRhcEycoAMAYb1RAxi4oFAoJGLRo2//NdGj2CNGjnv/8+ogQIEEPUIZ5zn/NdGjn/4Qh//a6BBlo0aN6grFaPahn/////FZO3UEEIQnNGjRo5////zmjQEAoQMZc/PqEAoFCBiH//89qc6UQIGAAPupy6qVdgdQMgoEQaBAkPhREbwcWYwplOC5yVyr2vJGIrPAtNBAgpEkXYhdRQmMTMA8KokyFiKEICrBRl9LDFjGQnBDy3lsT47j4ECCZRVVefxqlJDoPxqAIQNYl6rQmz1PuW5B+HvCW0szxlzETKuXelZLd/ZkNNhcV4yCiQ1sYWJvu9jRMx83vHmjubbAe3fHMd5BPAVcd6xe0JbkiYp4m6a4KhRKU8FUSQwUE1uDIoartXRoUb4/8fN52tnt9bzvF3jv4WjPQR6IxWP36rw8385hQmJhevQ6Kf/+Wm/2taRCcblpdBkgagJgmQs4mpTth//uSxAqADwEvZbz0ABLZsql1hiYrOileODEK6mVSrhBDkPQ5DwYcHxQqbHypo2Y0W2tg8D0LHFmQzEh6bQrNW/1oUMtSnPpypMuuOK+eaUmvnn/lSWu5qfn3g5than4blSWta/qeVWsmiOYKuwEqWLPvPlmAJcJPTk1rYBITTdwyQIahNRxDDDQp1AKhIZsXyUDLqSxM9j0hbxmLsS5iCUuGzCESFDKgKx0BMoPLzGBgXGy8tGiH8RNdbd7OWDYTDclieeHKZAofCtITtJBwgDfICrbM8MmXRlKyeS+sSuLhSfYJg6tMjqmUX1FNC1SzCqpEUJ0aJoO3c/tS+w3/xsFh5FecTNvLsw1CynG4yuLUZbaF0FLbGQCiVEWKIVguqqFUTSSrQqG0MUU2eKSqAdkLAAAAAMhmw5vqw0uDjgkTMeKesaJjoAtS34GLQDBw0BdtIxRe82jIkkjINKZVsBM1XzMx0FgU8AiGJqmQJiIAojKTRoHkiKZi6IRj2DmY0aOIS5rlKOERoixReK1lmo8O61tNKMS6PzrcWOQFTQ1xN//7ksQ5gBw1mSmtYZHCeLGotYYl+jTyKUw6+bu8swS/VaMTztXKFkSkr8WglujvxmM7NnytGPhKNhSPqqiNaVTBDdWn48pikb0Pyl6Isn+tr1eRKaLrWzshT3PkEm8hywvMupHFRPXWGH6VjPmJf9mka2xzFljGCXrTBeGj2wa/PTORenLdakkCmnLSBN8aY0xXJEVEJrKCqB5e5YZNNU6gDFJx2GUrA9Kh6DRMSiobLY0RufJYgYzf9oeCS6Tymaukrjtx3lZ+Hcbq1StaMdiSrrPq15ibLbFrTzmOT1bv1cQHLfd9g5Lonw1a72kB9uLI3apEKGG1jllCTy6q2E6b6zW1ko5zWa+FP+f179Iv2/l5Ww331XZfz3GF/7X9JN6uTltkZBBSacgiGEJBB0BgBCPNSpMJDEUwFZ6LBWSzARDYYpiW6ygWFuofJVhOzrpHzAzHgZGK5pHE8t4vCMHRRY8OjMqDs96gRjlbElSPDiay9WWoWGDo+su+V0N3S8ZoCOLzqlfcJza3Gk6t7/Nr1W+SRb8jYTjUKRr/sbmTua3/+5LEQAAT5Yk7rDDR0VyRJfRnpa65LGJkcr12y81i4dmrf61nrarf2d/Wz2Jbs7OqJNZIhJtOSWWRIJx2uNwkCigK4tS2VPLlfYH7yO6Zk6OYmRhm4c6gR6NQ5SyyJ03jtPhFoYo22USaA+ShYZOqJnC6B7O/yVok+qaZaj/r9ihb6xT+VFBb///FakxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
    ];

    const BACKSPACE_SOUND_SRC =
    "data:audio/mp3;base64,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";

    const ERROR_SOUND_SRC =
    "data:audio/mp3;base64,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";


let soundEnabled = localStorage.getItem("typingSoundEnabled") !== "false"; // default: on

  // Small pool of preloaded Audio elements per source so rapid keystrokes don't get cut off.
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
      audio.play().catch(function () {});
    };
  }

const clickPlayers = CLICK_SOUND_SOURCES.map((src) => createSoundPlayer(src, 3));
const playBackspaceClick = createSoundPlayer(BACKSPACE_SOUND_SRC, 3);
const playErrorClick = createSoundPlayer(ERROR_SOUND_SRC, 3);

  // Picks a random sample for each correct keystroke so it doesn't sound mechanical.
  function playTypeSound() {
    const player = clickPlayers[Math.floor(Math.random() * clickPlayers.length)];
    player(1);
  }
  function playBackspaceSound() { playBackspaceClick(1); }
  function playErrorSound() { playErrorClick(1); }

// WRONG CHARACTER FEEDBACK — vibrates and shakes the typing card, same as the practice page.
function triggerBattleWrongCharacterFeedback() {
  if (navigator.vibrate) navigator.vibrate(60);
  if (!battleTypingCard) return;
  battleTypingCard.classList.remove("shake");
  void battleTypingCard.offsetWidth;
  battleTypingCard.classList.add("shake");
  battleTypingCard.addEventListener("animationend", function () {
    battleTypingCard.classList.remove("shake");
  }, { once: true });
}

// KEYBOARD — the whole race is driven by individual keydowns; the hidden input only exists to hold focus.
document.addEventListener("keydown", (event) => {
  if (!battleStarted || battleFinished) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;

  /* BACKSPACE removes the most recent keystroke (progress shrinks). */
  if (event.key === "Backspace") {
    event.preventDefault();
    if (typedCharacters.length === 0) return;
    typedCharacters.pop();
    playBackspaceSound();
    renderUserTyping();
    return;
  }

  // Ignore OS key-repeat (holding a key auto-fires repeated keydown). Only a genuine individual keypress advances the
  // race — otherwise holding one matching key would let someone type faster than any real keystroke.
  if (event.repeat) { event.preventDefault(); return; }

  // Ignore arrows, tab, enter, function keys, etc.
  if (event.key.length !== 1) return;

  event.preventDefault();
  if (typedCharacters.length >= targetCharacters.length) return;

  // Every character is accepted — wrong characters don't stop typing.
  const typedIndex = typedCharacters.length;
  const isCorrect = event.key === targetCharacters[typedIndex];
  typedCharacters.push(event.key);

  if (isCorrect) {
    playTypeSound();
  } else {
    playErrorSound();
    triggerBattleWrongCharacterFeedback();
  }
  renderUserTyping();
});

// USER TYPING RENDER — correct becomes green, incorrect red, the next target gets the "current" cursor style, and the
// active character is scrolled into view so long texts stay readable while racing.
function renderUserTyping() {
  const characters = battleTypingText.querySelectorAll(".battle-character");
  characters.forEach((character, index) => {
    character.classList.remove("correct");
    character.classList.remove("incorrect");
    character.classList.remove("current");
    if (index < typedCharacters.length) {
      character.classList.add(typedCharacters[index] === targetCharacters[index] ? "correct" : "incorrect");
    } else if (index === typedCharacters.length) {
      character.classList.add("current");
    }
  });
  const current = battleTypingText.querySelector(".current");
  if (current) current.scrollIntoView({ behavior: "smooth", block: "center" });
}

// FOCUS — returns focus to the hidden input (clicking away shouldn't stall the battle).
function focusBattleInput() {
  if (battleTypingInput) battleTypingInput.focus();
}

// RESET UI — zeroes every stat display for a fresh race.
function resetBattleUI() {
  userProgress.style.width = "0%";
  botProgress.style.width = "0%";
  userProgressText.textContent = "0%";
  botProgressText.textContent = "0%";
  userWpm.textContent = "0";
  botWpm.textContent = "0";
  userAccuracy.textContent = "100%";
  botAccuracy.textContent = "100%";
  battleTime.textContent = "00:00";
  battleStatus.textContent = "Start typing...";
}

// FINISH — scores both sides on equal footing (correct − incorrect over elapsed time) and decides the winner by BATTLE
// SCORE, not by who hit the end first (finisher only explains *why* the race stopped; that closes the "type random keys
// to finish fastest" loophole). Then syncs the result to the backend and shows the result screen.
function finishBattle(finisher) {
  if (battleFinished) return;
  battleFinished = true;
  battleStarted = false;
  clearTimers();

  /* USER STATS */
  const userElapsedSeconds = Math.max(0.001, (Date.now() - battleStartTime) / 1000);
  const userTotal = typedCharacters.length;
  let userCorrect = 0;
  for (let i = 0; i < userTotal; i++) { if (typedCharacters[i] === targetCharacters[i]) userCorrect++; }
  const userIncorrect = userTotal - userCorrect;
  const userResult = calculateBattleScore(userCorrect, userIncorrect, userElapsedSeconds);

  // BOT STATS — uses whatever the bot has actually typed/wrong so far (it may not have finished), so both sides are
  // scored at the same point in time.
  const botElapsedSeconds = botStartTime ? Math.max(0.001, (Date.now() - botStartTime) / 1000) : userElapsedSeconds;
  const botTotal = Math.floor(botProgressCharacters);
  const botCorrect = Math.max(0, botTotal - botMistakes);
  const botIncorrect = Math.min(botMistakes, botTotal);
  const botResult = calculateBattleScore(botCorrect, botIncorrect, botElapsedSeconds);

  // WINNER — decided by score, NOT by who finished the text first.
  let winner;
  if (userResult.score > botResult.score) {
    winner = "user";
  } else if (botResult.score > userResult.score) {
    winner = "bot";
  } else {
    winner = finisher; // genuine tie on score falls back to who actually finished
  }

  resultUserScore.textContent = userResult.score;
  resultBotScore.textContent = botResult.score;
  resultUserWpm.textContent = Math.round(userResult.netWpm);
  resultBotWpm.textContent = Math.round(botResult.netWpm);
  resultUserAccuracy.textContent = Math.round(userResult.accuracy) + "%";
  resultBotAccuracy.textContent = Math.round(botResult.accuracy) + "%";

  if (winner === "user") {
    resultBattleIcon.textContent = "🏆";
    battleResultTitle.textContent = "You Win!";
    battleResultSubtitle.textContent = finisher === "user"
      ? "Higher Battle Score — well typed."
      : "The bot finished first, but your Battle Score was higher.";
  } else {
    resultBattleIcon.textContent = "◆";
    battleResultTitle.textContent = "Bot Wins";
    battleResultSubtitle.textContent = finisher === "bot"
      ? "The bot had the higher Battle Score. Try again!"
      : "You finished first, but accuracy dragged your Battle Score below the bot's.";
  }

  // Real sync to the backend so this win/loss is reflected on the leaderboard.
  syncBattleResultToServer({
    mode: "bot",
    category: selectedCategory,
    opponentName: BOT_CONFIG[selectedDifficulty].name,
    opponentType: "bot",
    result: winner === "user" ? "win" : (winner === "bot" ? "loss" : "draw"),
    userScore: userResult.score,
    userWpm: userResult.netWpm,
    userAccuracy: userResult.accuracy,
    opponentScore: botResult.score,
    opponentWpm: botResult.netWpm,
    opponentAccuracy: botResult.accuracy,
  });

  showScreen(battleResult);
}

// CLEAR TIMERS — stops every in-flight interval (race clock, countdown, bot) for a clean reset or quit.
function clearTimers() {
  if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  if (botTimer) { clearInterval(botTimer); botTimer = null; }
}

// REMATCH — straight back into a fresh race with the same settings.
if (rematchButton) rematchButton.addEventListener("click", () => { prepareBattle(); });

// BACK — leaves the battle page for the home/practice page.
function goToPractice() {
  clearTimers();
  battleStarted = false;
  battleFinished = true;
  window.location.href = "index.html";
}
if (setupBackButton) setupBackButton.addEventListener("click", goToPractice);
if (resultBackButton) resultBackButton.addEventListener("click", () => { window.location.href = "battle.html"; });

// QUIT BATTLE — multiplayer has its own quit handler in multiplayer.js, so this only handles local bot battles.
if (quitBattleButton) {
  quitBattleButton.addEventListener("click", () => {
    if (typeof multiplayerMode !== "undefined" && multiplayerMode) return;
    if (confirm("Quit this battle?")) goToPractice();
  });
}

// CLICK TYPING AREA — clicking the text returns focus to the hidden input mid-race.
battleTypingText.addEventListener("click", () => {
  if (battleStarted && !battleFinished) focusBattleInput();
});

// HELPERS
function randomBetween(min, max) { return min + Math.random() * (max - min); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function capitalize(value) { return String(value).charAt(0).toUpperCase() + String(value).slice(1); }
function formatTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return String(minutes).padStart(2, "0") + ":" + String(remaining).padStart(2, "0");
}

// INITIAL
showScreen(battleSetup);