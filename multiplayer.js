/* REAL USER MULTIPLAYER BATTLE — SERVER-AUTHORITATIVE VERSION.
   Requires: battle.js (defines syncBattleResultToServer, the battle screen/functions/helpers),
   Socket.IO client, and the multiplayer-server/ (localhost:3000, out of scope). */

const MULTIPLAYER_SERVER_URL = "http://localhost:3000";

let multiplayerSocket = null;
let multiplayerMode = false;
let multiplayerSearching = false;
let multiplayerRoomId = null;
let multiplayerOpponent = null;
let multiplayerTargetText = "";
let multiplayerTypedCharacters = [];
let multiplayerBattleStarted = false;
let multiplayerBattleFinished = false;
let multiplayerStartTime = null;
let multiplayerStartAt = null;
let multiplayerTimer = null;
let multiplayerCountdownTimer = null;
let multiplayerLeavingBattle = false;
let multiplayerPrivateCode = null;    // 6-digit code of the room we are hosting
let multiplayerWaitingPrivate = false; // true while hosting a waiting private room
let multiplayerAutoJoinCode = null;   // code from an invite link (?private=XXXXXX)

/* DOM
   IMPORTANT: battle.js already owns quitBattleButton and rematchButton variables,
   so multiplayer.js deliberately uses unique names (mp*) for the same elements. */
const findOpponentButton = document.getElementById("findOpponentButton");
const mpQuitBattleButton = document.getElementById("quitBattleButton");
const mpRematchButton = document.getElementById("rematchButton");
const mpResultBackButton = document.getElementById("resultBackButton");
// Private battle DOM.
const createPrivateBattleButton = document.getElementById("createPrivateBattleButton");
const privateWaitingPanel = document.getElementById("privateWaitingPanel");
const privateCodeDisplay = document.getElementById("privateCodeDisplay");
const privateInviteLink = document.getElementById("privateInviteLink");
const copyInviteButton = document.getElementById("copyInviteButton");
const privateCancelButton = document.getElementById("privateCancelButton");
const privateJoinPanel = document.getElementById("privateJoinPanel");
const privateCodeInput = document.getElementById("privateCodeInput");
const joinPrivateBattleButton = document.getElementById("joinPrivateBattleButton");
const privateBattleStatus = document.getElementById("privateBattleStatus");

// CONNECT — sets up every socket event listener once; re-calling is a no-op while connected.
function connectToMultiplayerServer() {
  if (multiplayerSocket) return;
  console.log("[Multiplayer] Connecting...");
  multiplayerSocket = io(MULTIPLAYER_SERVER_URL);

  /* CONNECTED */
  multiplayerSocket.on("connect", () => {
    console.log("[Multiplayer] Connected:", multiplayerSocket.id);
    // A join started by an invite link (?private=CODE) can only run once we're connected.
    if (multiplayerAutoJoinCode) autoJoinPrivateBattle(multiplayerAutoJoinCode);
  });

  /* DISCONNECTED */
  multiplayerSocket.on("disconnect", () => {
    console.log("[Multiplayer] Disconnected");
    multiplayerSearching = false;
    multiplayerBattleStarted = false;
    clearMultiplayerTimers();
    // If we never managed a private join, surface the failure to the user.
    if (multiplayerAutoJoinCode) {
      setPrivateStatus("Could not join the private battle — server not connected.");
      multiplayerAutoJoinCode = null;
    }
    // If we intentionally left, don't do anything else.
    if (multiplayerLeavingBattle) {
      multiplayerLeavingBattle = false;
      return;
    }
    // If the connection disappeared while in a multiplayer battle, clean up local state.
    if (multiplayerMode && multiplayerRoomId) {
      multiplayerMode = false;
      multiplayerBattleStarted = false;
      multiplayerBattleFinished = false;
    }
  });

  /* SEARCHING — flips the Find button into its red cancel-search state. */
  multiplayerSocket.on("searching", () => {
    multiplayerSearching = true;
    if (findOpponentButton) {
      findOpponentButton.classList.add("cancel-search");
      findOpponentButton.textContent = "Cancel Search";
      findOpponentButton.disabled = false;
    }
    console.log("[Multiplayer] Searching...");
  });

  /* MATCH FOUND — is called once a room is created on the server. */
  multiplayerSocket.on("matchFound", (data) => {
    multiplayerSearching = false;
    multiplayerMode = true;
    multiplayerBattleFinished = false;
    multiplayerRoomId = data.roomId;
    multiplayerOpponent = data.opponent;
    multiplayerLeavingBattle = false;
    hidePrivateWaiting(); // a private joiner/host becomes a normal battle here
    setPrivateStatus("");
    console.log("[Multiplayer] MATCH FOUND!");
    console.log("[Multiplayer] Room:", multiplayerRoomId);
    console.log("[Multiplayer] Opponent:", multiplayerOpponent);
    // Setup both player cards.
    setupOwnUserUI();
    setupOpponentUI();
    if (findOpponentButton) {
      findOpponentButton.classList.remove("cancel-search");
      findOpponentButton.textContent = "Match Found!";
      findOpponentButton.disabled = true;
    }
    // Tell the server this player is ready.
    multiplayerSocket.emit("playerReady", { roomId: multiplayerRoomId });
  });

  /* BATTLE STARTING — server pushes the shared text + sync timestamp. */
  multiplayerSocket.on("battleStarting", (data) => {
    if (mpRematchButton) {
      mpRematchButton.disabled = true;
      mpRematchButton.textContent = "Starting...";
    }
    multiplayerTargetText = data.text;
    multiplayerStartAt = data.startAt;
    console.log("[Multiplayer] Battle starting at:", new Date(multiplayerStartAt));
    prepareMultiplayerBattle();
    startSynchronizedCountdown();
  });

  /* SERVER STATS — authoritative updates for player's own stats. */
  multiplayerSocket.on("serverStats", (stats) => {
    if (!multiplayerMode) return;
    updateOwnStats(stats);
  });

  /* OPPONENT PROGRESS — the other racer's live progress from the server. */
  multiplayerSocket.on("opponentProgress", (data) => {
    if (!multiplayerMode) return;
    updateOpponentProgress(data);
  });

  /* RESULT */
  multiplayerSocket.on("battleResult", (data) => {
    console.log("[Multiplayer] SERVER RESULT:", data);
    showMultiplayerResult(data);
  });

  /* OPPONENT REMATCH READY */
  multiplayerSocket.on("opponentRematchReady", () => {
    console.log("[Multiplayer] Opponent wants a rematch");
    if (mpRematchButton) {
      mpRematchButton.disabled = false;
      mpRematchButton.textContent = "Rematch Ready";
    }
  });

  /* OPPONENT DISCONNECTED / LEFT — stops the battle locally and shows a non-blocking overlay
     (NOT alert(), NO immediate redirect — the app stays visible with the card up). */
  multiplayerSocket.on("opponentDisconnected", (data) => {
    console.log("[Multiplayer] Opponent disconnected:", data);
    clearMultiplayerTimers();
    multiplayerSearching = false;
    multiplayerBattleStarted = false;
    multiplayerBattleFinished = true;
    const message = data?.reason === "left"
      ? "Your opponent left the battle."
      : "Your opponent disconnected.";
    showOpponentLeftNotification(message);
  });

  /* PRIVATE BATTLE CREATED — the server issued a fresh 6-digit code; show the waiting panel. */
  multiplayerSocket.on("privateBattleCreated", (data) => {
    multiplayerWaitingPrivate = true;
    multiplayerPrivateCode = data.code;
    showPrivateWaiting(data.code);
  });

  /* PRIVATE BATTLE ERROR — the code was invalid/expired or the server refused the join. */
  multiplayerSocket.on("privateBattleError", (data) => {
    multiplayerWaitingPrivate = false;
    if (joinPrivateBattleButton) joinPrivateBattleButton.disabled = false;
    setPrivateStatus(data?.message || "Could not join the private battle.");
  });
}

// OPPONENT LEFT / DISCONNECTED NOTIFICATION — builds a fixed overlay + injected scoped styles, then
// the Back button removes it, resets all multiplayer state, and returns to battle.html.
function showOpponentLeftNotification(message) {
  // Remove an existing notification if one somehow already exists.
  const existingOverlay = document.getElementById("opponentDisconnectedOverlay");
  if (existingOverlay) existingOverlay.remove();

  // Assemble overlay > card > icon / heading / message / back button.
  const overlay = document.createElement("div");
  overlay.id = "opponentDisconnectedOverlay";
  const card = document.createElement("div");
  card.className = "opponent-disconnected-card";
  const icon = document.createElement("div");
  icon.className = "opponent-disconnected-icon";
  icon.textContent = "!";
  const title = document.createElement("h2");
  title.textContent = "Battle Ended";
  const text = document.createElement("p");
  text.textContent = message;
  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.id = "opponentDisconnectedBack";
  backButton.textContent = "Back to Battle";
  card.appendChild(icon);
  card.appendChild(title);
  card.appendChild(text);
  card.appendChild(backButton);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Inject frontend-only styles, scoped to this notification (only created once).
  let style = document.getElementById("opponentDisconnectedStyles");
  if (!style) {
    style = document.createElement("style");
    style.id = "opponentDisconnectedStyles";
    style.textContent = `
      #opponentDisconnectedOverlay { position: fixed; inset: 0; z-index: 999999; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
      .opponent-disconnected-card { width: min(420px, 100%); box-sizing: border-box; padding: 32px 28px; border-radius: 20px; text-align: center; background: var(--card-bg, #181818); color: var(--text-primary, #ffffff); border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45); animation: opponentDisconnectedAppear 0.2s ease-out; }
      .opponent-disconnected-icon { width: 64px; height: 64px; margin: 0 auto 18px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(255, 255, 255, 0.08); font-size: 28px; }
      .opponent-disconnected-card h2 { margin: 0 0 10px; font-size: 24px; font-weight: 700; }
      .opponent-disconnected-card p { margin: 0 0 24px; opacity: 0.75; font-size: 15px; line-height: 1.5; }
      #opponentDisconnectedBack { width: 100%; padding: 13px 20px; border: 0; border-radius: 10px; cursor: pointer; font: inherit; font-weight: 600; background: var(--accent, #ffffff); color: var(--accent-text, #000000); transition: opacity 0.15s ease, transform 0.15s ease; }
      #opponentDisconnectedBack:hover { opacity: 0.9; transform: translateY(-1px); }
      #opponentDisconnectedBack:active { transform: translateY(0); }
      @keyframes opponentDisconnectedAppear { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
    `;
    document.head.appendChild(style);
  }

  // Back button: remove overlay, clean multiplayer state, return to battle page.
  backButton.addEventListener("click", () => {
    const currentOverlay = document.getElementById("opponentDisconnectedOverlay");
    if (currentOverlay) currentOverlay.remove();
    multiplayerMode = false;
    multiplayerSearching = false;
    multiplayerBattleStarted = false;
    multiplayerBattleFinished = false;
    multiplayerRoomId = null;
    multiplayerOpponent = null;
    multiplayerTargetText = "";
    multiplayerTypedCharacters = [];
    window.location.href = "battle.html";
  });
}

// FIND OPPONENT — toggles matchmaking on/off; guard against double-clicks and mid-battle searches.
if (findOpponentButton) {
  findOpponentButton.addEventListener("click", () => {
    // If already searching, cancel the search.
    if (multiplayerSearching) {
      cancelMultiplayerMatchmaking();
      return;
    }
    // Don't search while already inside a multiplayer battle.
    if (multiplayerMode) {
      console.log("[Multiplayer] Already in battle.");
      return;
    }
    // Make sure Socket.IO is connected.
    if (!multiplayerSocket || !multiplayerSocket.connected) {
      console.error("[Multiplayer] Server not connected.");
      return;
    }
    const user = typeof getBattleUser === "function"
      ? getBattleUser()
      : { name: "Player", avatarUrl: null };
    // Prevent double-clicks.
    findOpponentButton.disabled = true;
    findOpponentButton.textContent = "Searching...";
    multiplayerSocket.emit("findOpponent", { name: user.name, avatarUrl: user.avatarUrl });
  });
}

// CANCEL SEARCH — returns the Find button to its idle state.
function cancelMultiplayerMatchmaking() {
  if (!multiplayerSocket) return;
  multiplayerSocket.emit("cancelMatchmaking");
  multiplayerSearching = false;
  if (findOpponentButton) {
    findOpponentButton.classList.remove("cancel-search");
    findOpponentButton.textContent = "◉ Find Opponent";
    findOpponentButton.disabled = false;
  }
  console.log("[Multiplayer] Search cancelled");
}

// PRIVATE BATTLE — create/join a 6-digit-code room against a real player; the match then rides the normal matchFound flow.

// CREATE — ask the server for a code; the waiting panel appears with code + invite link.
function createPrivateBattle() {
  if (multiplayerMode) { setPrivateStatus("You are already in a battle."); return; }
  if (multiplayerWaitingPrivate) return;
  if (!multiplayerSocket || !multiplayerSocket.connected) { setPrivateStatus("Server not connected."); return; }
  if (multiplayerSearching) cancelMultiplayerMatchmaking();
  setPrivateStatus("Creating private battle...");
  multiplayerSocket.emit("createPrivateBattle", battleUserPayload());
}

// JOIN — validate the 6-digit code and ask the server to pair us with the host.
function joinPrivateBattle() {
  const code = privateCodeInput ? privateCodeInput.value.trim() : "";
  if (!/^\d{6}$/.test(code)) { setPrivateStatus("Enter the 6-digit code."); return; }
  if (multiplayerMode) { setPrivateStatus("You are already in a battle."); return; }
  if (!multiplayerSocket || !multiplayerSocket.connected) { setPrivateStatus("Server not connected."); return; }
  if (multiplayerSearching) cancelMultiplayerMatchmaking();
  if (multiplayerWaitingPrivate) hidePrivateWaiting();
  if (joinPrivateBattleButton) joinPrivateBattleButton.disabled = true;
  setPrivateStatus("Joining private battle...");
  multiplayerSocket.emit("joinPrivateBattle", { code, ...battleUserPayload() }, () => {
    if (joinPrivateBattleButton) joinPrivateBattleButton.disabled = false;
  });
}

// AUTO-JOIN — used by the invite link (?private=CODE): fires once the socket connects.
function autoJoinPrivateBattle(code) {
  multiplayerAutoJoinCode = null;
  if (joinPrivateBattleButton) joinPrivateBattleButton.disabled = true;
  setPrivateStatus("Joining private battle...");
  multiplayerSocket.emit("joinPrivateBattle", { code, ...battleUserPayload() }, () => {
    if (joinPrivateBattleButton) joinPrivateBattleButton.disabled = false;
  });
}

// WAITING — reveals the code + invite link and hides the create/join controls.
function showPrivateWaiting(code) {
  if (createPrivateBattleButton) createPrivateBattleButton.classList.add("hidden");
  if (privateJoinPanel) privateJoinPanel.classList.add("hidden");
  if (!privateWaitingPanel) return;
  privateWaitingPanel.classList.remove("hidden");
  if (privateCodeDisplay) privateCodeDisplay.textContent = code;
  const url = buildPrivateInviteUrl(code);
  if (privateInviteLink) { privateInviteLink.textContent = url; privateInviteLink.dataset.url = url; }
  setPrivateStatus("Waiting for opponent to join with this code.");
}

// HIDE WAITING — clears private state and returns to the create/join controls.
function hidePrivateWaiting() {
  multiplayerWaitingPrivate = false;
  multiplayerPrivateCode = null;
  if (privateWaitingPanel) privateWaitingPanel.classList.add("hidden");
  if (createPrivateBattleButton) createPrivateBattleButton.classList.remove("hidden");
  if (privateJoinPanel) privateJoinPanel.classList.remove("hidden");
}

// INVITE URL — a link to battle.html?private=CODE so opening it auto-joins the room.
function buildPrivateInviteUrl(code) {
  const url = new URL("battle.html", window.location.href);
  url.searchParams.set("private", code);
  return url.href;
}

// STATUS — one-line helper message on the private panel (falls back to the console).
function setPrivateStatus(message) {
  if (privateBattleStatus) privateBattleStatus.textContent = message;
  else console.log("[Private]", message);
}

// PAYLOAD — current user's name + avatar for private-battle events.
function battleUserPayload() {
  const user = typeof getBattleUser === "function" ? getBattleUser() : { name: "Player", avatarUrl: null };
  return { name: user.name, avatarUrl: user.avatarUrl };
}

// CREATE BUTTON
if (createPrivateBattleButton) createPrivateBattleButton.addEventListener("click", createPrivateBattle);

// JOIN — click or Enter inside the code box.
if (joinPrivateBattleButton) joinPrivateBattleButton.addEventListener("click", joinPrivateBattle);
if (privateCodeInput) privateCodeInput.addEventListener("keydown", (event) => { if (event.key === "Enter") joinPrivateBattle(); });

// CANCEL WAITING — tells the server the room is dead and returns to the controls.
if (privateCancelButton) privateCancelButton.addEventListener("click", () => {
  if (multiplayerSocket && multiplayerSocket.connected) multiplayerSocket.emit("cancelPrivateBattle");
  hidePrivateWaiting();
  setPrivateStatus("Private battle cancelled.");
});

// COPY INVITE LINK — clipboard when available, otherwise shows the URL as the status.
if (copyInviteButton) copyInviteButton.addEventListener("click", () => {
  const url = privateInviteLink?.dataset.url;
  if (!url) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url)
      .then(() => setPrivateStatus("Invite link copied!"))
      .catch(() => setPrivateStatus("Could not copy the invite link."));
  } else {
    setPrivateStatus(url);
  }
});

// OWN USER UI — mirrors getBattleUser() into #battleUserName + .user-racer-avatar (initial fallback).
function setupOwnUserUI() {
  const user = typeof getBattleUser === "function"
    ? getBattleUser()
    : { name: "Player", avatarUrl: null };
  const userName = document.getElementById("battleUserName");
  const userAvatar = document.querySelector(".user-racer-avatar");
  if (userName) userName.textContent = user.name || "Player";
  if (!userAvatar) return;
  userAvatar.innerHTML = "";
  if (user.avatarUrl) {
    const img = document.createElement("img");
    img.src = user.avatarUrl;
    img.alt = "Your profile picture";
    img.className = "racer-avatar-image";
    img.onerror = () => { userAvatar.innerHTML = ""; userAvatar.textContent = getInitial(user.name); };
    userAvatar.appendChild(img);
  } else {
    userAvatar.textContent = getInitial(user.name);
  }
}

// OPPONENT UI — shows the matched player in the bot card slot and relabels "Bot" → "Opponent".
function setupOpponentUI() {
  const opponentName = document.getElementById("botName");
  const opponentAvatar = document.querySelector(".bot-racer-avatar");
  if (opponentName) opponentName.textContent = multiplayerOpponent?.name || "Opponent";
  // Change the "Bot" label under the opponent racer to "Opponent".
  const opponentCard = document.querySelector(".bot-racer-card");
  if (opponentCard) {
    const label = opponentCard.querySelector(".racer-info span");
    if (label) label.textContent = "Opponent";
  }
  if (opponentAvatar) {
    opponentAvatar.innerHTML = "";
    if (multiplayerOpponent && multiplayerOpponent.avatarUrl) {
      const img = document.createElement("img");
      img.src = multiplayerOpponent.avatarUrl;
      img.alt = "Opponent profile picture";
      img.className = "racer-avatar-image";
      img.onerror = () => { opponentAvatar.innerHTML = ""; opponentAvatar.textContent = getInitial(multiplayerOpponent.name); };
      opponentAvatar.appendChild(img);
    } else {
      opponentAvatar.textContent = getInitial(multiplayerOpponent?.name);
    }
  }
}

// PREPARE BATTLE — resets the shared battle screens/state and shows the countdown screen using the server's text.
function prepareMultiplayerBattle() {
  clearMultiplayerTimers();
  setupOwnUserUI();
  setupOpponentUI();
  multiplayerTypedCharacters = [];
  multiplayerBattleStarted = false;
  multiplayerBattleFinished = false;
  multiplayerStartTime = null;
  // Use the existing battle renderer (in battle.js).
  targetCharacters = Array.from(multiplayerTargetText);
  renderBattleText();
  // User stats.
  userProgress.style.width = "0%";
  userProgressText.textContent = "0%";
  userWpm.textContent = "0";
  userAccuracy.textContent = "100%";
  // Opponent stats.
  botProgress.style.width = "0%";
  botProgressText.textContent = "0%";
  botWpm.textContent = "0";
  botAccuracy.textContent = "100%";
  battleTime.textContent = "00:00";
  battleStatus.textContent = "Get ready...";
  // Labels.
  battleCategoryLabel.textContent = "Multiplayer";
  battleDifficultyLabel.textContent = "Real User";
  showScreen(battleCountdown);
}

// SYNCHRONIZED COUNTDOWN — counts down against the server-provided start time (not local), so both
// players start at the exact same moment despite latency.
function startSynchronizedCountdown() {
  clearInterval(multiplayerCountdownTimer);
  const update = () => {
    const remaining = multiplayerStartAt - Date.now();
    if (remaining <= 0) {
      clearInterval(multiplayerCountdownTimer);
      multiplayerCountdownTimer = null;
      countdownNumber.textContent = "GO!";
      setTimeout(() => { beginMultiplayerBattle(); }, 200);
      return;
    }
    const seconds = Math.ceil(remaining / 1000);
    countdownNumber.textContent = seconds;
    countdownNumber.style.animation = "none";
    void countdownNumber.offsetWidth;
    countdownNumber.style.animation = "countdownPop 0.8s ease";
  };
  update();
  multiplayerCountdownTimer = setInterval(update, 50);
}

// BEGIN BATTLE — shows the game screen, anchors the clock to the server timestamp, starts it.
function beginMultiplayerBattle() {
  if (multiplayerBattleFinished) return;
  showScreen(battleGame);
  multiplayerBattleStarted = true;
  multiplayerStartTime = multiplayerStartAt;
  battleStatus.textContent = "Start typing!";
  focusBattleInput();
  multiplayerTimer = setInterval(updateMultiplayerClock, 100);
}

// CLOCK — purely cosmetic race timer derived from the server start time.
function updateMultiplayerClock() {
  if (!multiplayerBattleStarted || multiplayerBattleFinished) return;
  const elapsed = Math.max(0, (Date.now() - multiplayerStartTime) / 1000);
  battleTime.textContent = formatTime(elapsed);
}

// KEYBOARD — individual keystrokes are forwarded to the server, which is authoritative.
document.addEventListener("keydown", (event) => {
  if (!multiplayerMode || !multiplayerBattleStarted || multiplayerBattleFinished) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  // Prevent key-repeat abuse.
  if (event.repeat) { event.preventDefault(); return; }

  /* BACKSPACE — trimmed locally then echoed to the server. */
  if (event.key === "Backspace") {
    event.preventDefault();
    if (multiplayerTypedCharacters.length === 0) return;
    multiplayerTypedCharacters.pop();
    playBackspaceSound();
    renderMultiplayerTyping();
    multiplayerSocket.emit("backspace", { roomId: multiplayerRoomId });
    return;
  }

  // Ignore special keys.
  if (event.key.length !== 1) return;
  event.preventDefault();
  if (multiplayerTypedCharacters.length >= multiplayerTargetText.length) return;

  const index = multiplayerTypedCharacters.length;
  const correct = event.key === multiplayerTargetText[index];
  multiplayerTypedCharacters.push(event.key);
  if (correct) {
    playTypeSound();
  } else {
    playErrorSound();
    triggerBattleWrongCharacterFeedback();
  }
  renderMultiplayerTyping();
  multiplayerSocket.emit("keyPress", { roomId: multiplayerRoomId, key: event.key });
});

// RENDER USER — same colored-character rendering as the race (correct/incorrect/current), with scroll-into-view.
function renderMultiplayerTyping() {
  const characters = battleTypingText.querySelectorAll(".battle-character");
  characters.forEach((character, index) => {
    character.classList.remove("correct", "incorrect", "current");
    if (index < multiplayerTypedCharacters.length) {
      character.classList.add(multiplayerTypedCharacters[index] === multiplayerTargetText[index] ? "correct" : "incorrect");
      return;
    }
    if (index === multiplayerTypedCharacters.length) character.classList.add("current");
  });
  const current = battleTypingText.querySelector(".current");
  if (current) current.scrollIntoView({ behavior: "smooth", block: "center" });
}

// SERVER STATS — server remains authoritative: whenever its typed count differs, local state is reconciled.
function updateOwnStats(stats) {
  const percent = multiplayerTargetText.length > 0 ? (stats.typed / multiplayerTargetText.length) * 100 : 0;
  userProgress.style.width = Math.min(100, percent) + "%";
  userProgressText.textContent = Math.round(Math.min(100, percent)) + "%";
  userWpm.textContent = Math.round(stats.wpm || 0);
  userAccuracy.textContent = Math.round(stats.accuracy ?? 100) + "%";
  if (stats.typed !== multiplayerTypedCharacters.length) {
    multiplayerTypedCharacters = multiplayerTypedCharacters.slice(0, stats.typed);
    renderMultiplayerTyping();
  }
}

// OPPONENT PROGRESS — mirrors the server-tracked opponent into the bot card UI.
function updateOpponentProgress(data) {
  const percent = multiplayerTargetText.length > 0 ? (data.typed / multiplayerTargetText.length) * 100 : 0;
  botProgress.style.width = Math.min(100, percent) + "%";
  botProgressText.textContent = Math.round(Math.min(100, percent)) + "%";
  botWpm.textContent = Math.round(data.wpm || 0);
  botAccuracy.textContent = Math.round(data.accuracy ?? 100) + "%";
}

// RESULT — renders the server-calculated result, relabels Bot → Opponent, syncs to the leaderboard
// through battle.js's syncBattleResultToServer (loaded before this file), and shows the result screen.
function showMultiplayerResult(data) {
  clearMultiplayerTimers();
  multiplayerBattleFinished = true;
  multiplayerBattleStarted = false;
  // Enable rematch.
  if (mpRematchButton) {
    mpRematchButton.disabled = false;
    mpRematchButton.textContent = "↻ Rematch";
  }
  const myId = multiplayerSocket.id;
  const me = data.players[myId];
  const opponentId = Object.keys(data.players).find((id) => id !== myId);
  const opponent = opponentId ? data.players[opponentId] : null;
  // Server-calculated values.
  resultUserScore.textContent = me?.score ?? 0;
  resultUserWpm.textContent = Math.round(me?.wpm ?? 0);
  resultUserAccuracy.textContent = Math.round(me?.accuracy ?? 0) + "%";
  resultBotScore.textContent = opponent?.score ?? 0;
  resultBotWpm.textContent = Math.round(opponent?.wpm ?? 0);
  resultBotAccuracy.textContent = Math.round(opponent?.accuracy ?? 0) + "%";
  // Change Bot labels to Opponent.
  const resultLabels = document.querySelectorAll(".battle-result-stat span");
  resultLabels.forEach((label) => {
    if (label.textContent.trim() === "Bot Score") label.textContent = "Opponent Score";
    if (label.textContent.trim() === "Bot WPM") label.textContent = "Opponent WPM";
    if (label.textContent.trim() === "Bot Accuracy") label.textContent = "Opponent Accuracy";
  });
  const didWin = data.winnerId === myId;
  // Real sync to the backend so this real-opponent battle reflects on the leaderboard too.
  if (typeof syncBattleResultToServer === "function") {
    syncBattleResultToServer({
      mode: "multiplayer",
      category: "Battle",
      opponentName: opponent?.name || "Opponent",
      opponentType: "player",
      result: !data.winnerId ? "draw" : (didWin ? "win" : "loss"),
      userScore: me?.score ?? 0,
      userWpm: me?.wpm ?? 0,
      userAccuracy: me?.accuracy ?? 0,
      opponentScore: opponent?.score ?? 0,
      opponentWpm: opponent?.wpm ?? 0,
      opponentAccuracy: opponent?.accuracy ?? 0,
    });
  }
  resultBattleIcon.textContent = didWin ? "🏆" : "⚔️";
  battleResultTitle.textContent = didWin ? "You Win!" : "You Lose";
  battleResultSubtitle.textContent = didWin
    ? "Higher Battle Score — well typed."
    : "Your opponent had the higher Battle Score.";
  showScreen(battleResult);
}

// REMATCH — capture phase (true) gives multiplayer priority over battle.js's bot-rematch handler.
if (mpRematchButton) {
  mpRematchButton.addEventListener("click", (event) => {
    if (!multiplayerMode) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!multiplayerSocket || !multiplayerSocket.connected) {
      console.error("[Multiplayer] Server not connected.");
      return;
    }
    if (!multiplayerRoomId) return;
    if (!multiplayerBattleFinished) return;
    mpRematchButton.disabled = true;
    mpRematchButton.textContent = "Waiting for Opponent...";
    multiplayerSocket.emit("requestRematch", { roomId: multiplayerRoomId });
    console.log("[Multiplayer] Rematch requested");
  }, true);
}

// RESULT BACK — the result screen's back button, multiplayer-aware: emits leaveBattle and waits for
// the server ack before navigating (with a 500ms safety fallback to avoid duplicate redirects).
if (mpResultBackButton) {
  mpResultBackButton.addEventListener("click", (event) => {
    // Only override this button for multiplayer battles.
    if (!multiplayerMode) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    console.log("[Multiplayer] Leaving result:", multiplayerRoomId);
    multiplayerLeavingBattle = true;
    const roomId = multiplayerRoomId; // save before clearing state
    clearMultiplayerTimers();
    let navigated = false; // prevent multiple redirects
    const returnToBattle = () => {
      if (navigated) return;
      navigated = true;
      window.location.href = "battle.html";
    };
    if (multiplayerSocket && multiplayerSocket.connected && roomId) {
      multiplayerSocket.emit("leaveBattle", { roomId }, () => {
        console.log("[Multiplayer] Result leave acknowledged.");
        returnToBattle();
      });
      setTimeout(returnToBattle, 500); // safety fallback
    } else {
      returnToBattle();
    }
    // Clear local multiplayer state.
    multiplayerMode = false;
    multiplayerSearching = false;
    multiplayerBattleStarted = false;
    multiplayerBattleFinished = false;
    multiplayerRoomId = null;
    multiplayerOpponent = null;
    multiplayerTargetText = "";
    multiplayerTypedCharacters = [];
  }, true);
}

// QUIT BATTLE — same server-graceful leave flow as the result back button.
if (mpQuitBattleButton) {
  mpQuitBattleButton.addEventListener("click", (event) => {
    event.preventDefault();
    // If there isn't an active multiplayer battle, just go back.
    if (!multiplayerMode || !multiplayerRoomId) {
      window.location.href = "battle.html";
      return;
    }
    console.log("[Multiplayer] Leaving battle:", multiplayerRoomId);
    multiplayerLeavingBattle = true; // mark as intentional leave
    const roomId = multiplayerRoomId; // save before clearing state
    clearMultiplayerTimers();
    let navigated = false; // prevent multiple redirects
    const returnToBattle = () => {
      if (navigated) return;
      navigated = true;
      window.location.href = "battle.html";
    };
    if (multiplayerSocket && multiplayerSocket.connected) {
      // Wait for the server acknowledgement before navigating away.
      multiplayerSocket.emit("leaveBattle", { roomId }, () => {
        console.log("[Multiplayer] Leave acknowledged by server.");
        returnToBattle();
      });
      setTimeout(returnToBattle, 500); // safety fallback
    } else {
      returnToBattle();
    }
    // Clear local multiplayer state.
    multiplayerMode = false;
    multiplayerSearching = false;
    multiplayerBattleStarted = false;
    multiplayerBattleFinished = false;
    multiplayerRoomId = null;
    multiplayerOpponent = null;
    multiplayerTargetText = "";
    multiplayerTypedCharacters = [];
  });
}

// TIMER CLEANUP — stops both in-flight intervals (clock + synchronized countdown).
function clearMultiplayerTimers() {
  if (multiplayerTimer) { clearInterval(multiplayerTimer); multiplayerTimer = null; }
  if (multiplayerCountdownTimer) { clearInterval(multiplayerCountdownTimer); multiplayerCountdownTimer = null; }
}

// HELPERS
function getInitial(name) { return String(name || "P").charAt(0).toUpperCase(); }

// INVITE-LINK ENTRY — a battle.html?private=CODE link auto-joins once the socket connects.
const privateParam = new URLSearchParams(window.location.search).get("private");
if (privateParam && /^\d{6}$/.test(privateParam)) {
  multiplayerAutoJoinCode = privateParam;
  setPrivateStatus("Opening private battle invite...");
}

// START
connectToMultiplayerServer();