// REAL-USER MULTIPLAYER SERVER — Socket.IO server: matchmaking, lockstep races, server-authoritative scoring.
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
app.use(cors());
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 3000;

/* MATCHMAKING — FIFO queue of waiting players + active battle rooms + pending private rooms. */
const matchmakingQueue = [];
const battles = new Map();
// Pending private rooms keyed by 6-digit code: code → { code, hostPlayer } (no room exists until someone joins).
const privateBattles = new Map();

// Shared pool of passages the server hands to both racers.
const BATTLE_TEXTS = [
  "The best way to improve is to practice consistently and focus on accuracy.",
  "Small improvements every day can turn into impressive results over time.",
  "Stay focused on the text and let your fingers follow your thoughts naturally.",
  "Fast typing is useful, but accurate typing is what makes your performance reliable.",
  "Technology gives people powerful tools to learn create communicate and solve problems.",
  "Good habits are built through repetition patience and consistent effort.",
  "A calm mind helps you react faster and make fewer mistakes while typing.",
  "Learning to type quickly takes practice but learning to type accurately takes discipline.",
  "Great results usually come from small improvements repeated over a long period.",
  "The goal is not simply to type faster but to become faster without losing control.",
  "Every mistake is useful when you notice it understand it and work to avoid repeating it.",
  "Programming requires patience because solving difficult problems often takes several attempts.",
  "Creative ideas become more valuable when you turn them into something people can actually use.",
  "A strong foundation makes it easier to learn more advanced concepts later.",
  "When you concentrate completely on the task your speed and accuracy can improve naturally."
];

function getRandomBattleText() { return BATTLE_TEXTS[Math.floor(Math.random() * BATTLE_TEXTS.length)]; }

/* HTTP */
app.get("/", (req, res) => { res.send("Multiplayer server is running!"); });

/* SOCKET */
io.on("connection", socket => {
  console.log("[SERVER] User connected:", socket.id);

  /* FIND OPPONENT — pair with a waiting player or enqueue this one. */
  socket.on("findOpponent", playerData => {
    removeFromQueue(socket.id);
    removeHostingPrivate(socket.id); // starting quick match discards any pending private room
    const player = { id: socket.id, name: sanitizeName(playerData?.name), avatarUrl: sanitizeAvatar(playerData?.avatarUrl), socket };
    console.log("[MATCHMAKING]", player.name, "is searching");

    // Match an existing waiting player → create the room and the battle state for both.
    if (matchmakingQueue.length > 0) {
      const opponent = matchmakingQueue.shift();
      const roomId = createRoomId();
      socket.join(roomId);
      opponent.socket.join(roomId);
      const battle = {
        roomId,
        text: null,
        startAt: null,
        started: false,
        finished: false,
        players: { [opponent.id]: createPlayerState(opponent), [socket.id]: createPlayerState(player) }
      };
      battles.set(roomId, battle);
      console.log("[MATCHMAKING] MATCH FOUND");
      console.log("[MATCHMAKING] Room:", roomId);
      // Tell each player who their opponent is.
      opponent.socket.emit("matchFound", { roomId, opponent: { id: player.id, name: player.name, avatarUrl: player.avatarUrl } });
      socket.emit("matchFound", { roomId, opponent: { id: opponent.id, name: opponent.name, avatarUrl: opponent.avatarUrl } });
      return;
    }

    // No opponent waiting — go into the queue and spin until someone matches.
    matchmakingQueue.push(player);
    socket.emit("searching");
    console.log("[MATCHMAKING] Added to queue:", player.name);
  });

  /* CANCEL SEARCH — drop this player from the waiting queue. */
  socket.on("cancelMatchmaking", () => {
    removeFromQueue(socket.id);
    console.log("[MATCHMAKING] Search cancelled:", socket.id);
  });

  /* CREATE PRIVATE BATTLE — host requests a fresh 6-digit code; a pending room is stored so a joiner can pair up. */
  socket.on("createPrivateBattle", playerData => {
    removeFromQueue(socket.id);
    removeHostingPrivate(socket.id); // a player can only host one pending private room
    const player = { id: socket.id, name: sanitizeName(playerData?.name), avatarUrl: sanitizeAvatar(playerData?.avatarUrl), socket };
    const code = generatePrivateCode();
    privateBattles.set(code, { code, hostPlayer: player });
    console.log("[PRIVATE] Created:", code, player.name);
    socket.emit("privateBattleCreated", { code });
  });

  /* CANCEL PRIVATE BATTLE — host aborts; the code stops working. */
  socket.on("cancelPrivateBattle", () => {
    removeHostingPrivate(socket.id);
    console.log("[PRIVATE] Cancelled:", socket.id);
  });

  /* JOIN PRIVATE BATTLE — pair the joiner with the host by code, then launch the normal battle (matchFound to both). */
  socket.on("joinPrivateBattle", (data, callback) => {
    const pending = privateBattles.get(typeof data?.code === "string" ? data.code.trim() : "");
    if (!pending) { socket.emit("privateBattleError", { message: "Invalid or expired private battle code." }); return; }
    removeFromQueue(socket.id);
    removeFromQueue(pending.hostPlayer.id);
    removeHostingPrivate(socket.id);
    privateBattles.delete(pending.code);
    const joiner = { id: socket.id, name: sanitizeName(data?.name), avatarUrl: sanitizeAvatar(data?.avatarUrl), socket };
    const host = pending.hostPlayer;
    const roomId = createRoomId();
    socket.join(roomId);
    host.socket.join(roomId);
    const battle = { roomId, text: null, startAt: null, started: false, finished: false, players: { [host.id]: createPlayerState(host), [joiner.id]: createPlayerState(joiner) } };
    battles.set(roomId, battle);
    console.log("[PRIVATE] Joined:", pending.code, joiner.name, "→", roomId);
    host.socket.emit("matchFound", { roomId, opponent: { id: joiner.id, name: joiner.name, avatarUrl: joiner.avatarUrl } });
    socket.emit("matchFound", { roomId, opponent: { id: host.id, name: host.name, avatarUrl: host.avatarUrl } });
    if (typeof callback === "function") callback({ ok: true });
  });

  /* PLAYER READY — the SERVER picks the passage (the client can never submit it); when both
     players are ready, announce the shared text + an exact synchronized start time (now + 4s). */
  socket.on("playerReady", ({ roomId }) => {
    const battle = battles.get(roomId);
    if (!battle || battle.finished) return;
    const player = battle.players[socket.id];
    if (!player) return;
    if (!battle.text) battle.text = getRandomBattleText();
    player.ready = true;
    console.log("[BATTLE] Player ready:", socket.id, roomId);
    const players = Object.values(battle.players);
    const everyoneReady = players.length === 2 && players.every(p => p.ready);
    if (!everyoneReady) return;
    battle.startAt = Date.now() + 4000;
    battle.started = false;
    io.to(roomId).emit("battleStarting", { roomId, text: battle.text, startAt: battle.startAt });
    console.log("[BATTLE] Server-selected text:", battle.text);
    console.log("[BATTLE] Starting:", roomId);
  });

  /* KEY PRESS — server-authoritative: ignore before GO, past the end, or non-character keys;
     store the key and send stats back to the player + progress to the opponent. */
  socket.on("keyPress", ({ roomId, key }) => {
    const battle = battles.get(roomId);
    if (!battle || battle.finished || !battle.text || !battle.startAt) return;
    // Do not allow typing before GO.
    if (Date.now() < battle.startAt) return;
    if (!battle.started) battle.started = true;
    const player = battle.players[socket.id];
    if (!player) return;
    // Only real single-character keys are accepted.
    if (typeof key !== "string" || key.length !== 1) return;
    // Do not allow typing past the end of the text.
    if (player.typed.length >= battle.text.length) return;
    const index = player.typed.length;
    const isCorrect = key === battle.text[index];
    player.typed += key;
    if (isCorrect) player.correct++; else player.incorrect++;
    const stats = calculateStats(player, battle.startAt);
    // Authoritative stats to the typist, authoritative progress to the opponent.
    socket.emit("serverStats", stats);
    socket.to(roomId).emit("opponentProgress", { playerId: socket.id, typed: player.typed.length, correct: player.correct, incorrect: player.incorrect, wpm: stats.wpm, accuracy: stats.accuracy });
    // Finished → end the race.
    if (player.typed.length >= battle.text.length) finishBattle(battle, socket.id);
  });

  /* BACKSPACE — remove the last character, recompute correct/incorrect from the remaining
     sequence (never trust the client counts), and sync stats/progress again. */
  socket.on("backspace", ({ roomId }) => {
    const battle = battles.get(roomId);
    if (!battle || battle.finished || !battle.started) return;
    const player = battle.players[socket.id];
    if (!player || player.typed.length === 0) return;
    player.typed = player.typed.slice(0, -1);
    recalculateCharacterCounts(player, battle.text);
    const stats = calculateStats(player, battle.startAt);
    socket.emit("serverStats", stats);
    socket.to(roomId).emit("opponentProgress", { playerId: socket.id, typed: player.typed.length, correct: player.correct, incorrect: player.incorrect, wpm: stats.wpm, accuracy: stats.accuracy });
  });

  /* REMATCH — only after the previous battle finished; when both players are ready, reset the
     battle state and relaunch with a freshly chosen text and a new synchronized start time. */
  socket.on("requestRematch", ({ roomId }) => {
    const battle = battles.get(roomId);
    if (!battle) return;
    const player = battle.players[socket.id];
    // Rematch is only available after the previous battle has finished.
    if (!player || !battle.finished) return;
    player.rematchReady = true;
    console.log("[REMATCH] Player ready:", socket.id, roomId);
    socket.to(roomId).emit("opponentRematchReady");
    const players = Object.values(battle.players);
    const everyoneReady = players.length === 2 && players.every(p => p.rematchReady);
    if (!everyoneReady) return;
    // RESET BATTLE.
    battle.text = getRandomBattleText();
    battle.startAt = Date.now() + 4000;
    battle.started = false;
    battle.finished = false;
    players.forEach(p => { p.ready = false; p.rematchReady = false; p.typed = ""; p.correct = 0; p.incorrect = 0; });
    io.to(roomId).emit("battleStarting", { roomId, text: battle.text, startAt: battle.startAt });
    console.log("[REMATCH] Starting:", roomId);
    console.log("[REMATCH] New text:", battle.text);
  });

  /* LEAVE BATTLE — acknowledge to the leaver (callback) after the server processed the request. */
  socket.on("leaveBattle", (data, callback) => {
    const success = leaveBattle(socket, data.roomId);
    if (typeof callback === "function") callback({ ok: success });
  });

  /* DISCONNECTING — fires BEFORE Socket.IO removes the socket from its rooms: drop from the
     queue, and if mid-battle notify the opponent then delete the room (only when not finished). */
  socket.on("disconnecting", reason => {
    console.log("[SERVER] Player disconnecting:", socket.id, "Reason:", reason);
    removeFromQueue(socket.id);
    removeHostingPrivate(socket.id); // close any pending private room this host was waiting in
    for (const [roomId, battle] of battles.entries()) {
      if (!battle.players[socket.id]) continue; // this socket isn't part of this battle
      console.log("[BATTLE] Disconnecting player found:", socket.id, "Room:", roomId);
      if (!battle.finished) {
        const opponentId = Object.keys(battle.players).find(id => id !== socket.id);
        if (opponentId) {
          console.log("[BATTLE] Notifying opponent about disconnect:", opponentId);
          io.to(opponentId).emit("opponentDisconnected", { reason: "disconnect" });
          console.log("[BATTLE] Disconnect notification sent.");
        }
        battles.delete(roomId);
        console.log("[BATTLE] Room deleted:", roomId);
      }
    }
  });

  socket.on("disconnect", reason => { console.log("[SERVER] User disconnected:", socket.id, "Reason:", reason); });
});

/* CREATE PLAYER STATE — fresh per-battle record for one racer. */
function createPlayerState(player) {
  return { id: player.id, name: player.name, avatarUrl: player.avatarUrl, ready: false, rematchReady: false, typed: "", correct: 0, incorrect: 0 };
}

/* CALCULATE AUTHORITATIVE STATS — server time only; same Battle Score shape as the battle system
   (net WPM = correct − incorrect, × accuracy², both clamped). */
function calculateStats(player, startAt) {
  const elapsed = Math.max(1, (Date.now() - startAt) / 1000);
  const totalTyped = player.typed.length;
  const accuracy = totalTyped > 0 ? (player.correct / totalTyped) * 100 : 100;
  const netCharacters = player.correct - player.incorrect;
  const rawNetWpm = (netCharacters / 5) / (elapsed / 60);
  const netWpm = clamp(rawNetWpm, 0, 250);
  const accuracyMultiplier = Math.pow(clamp(accuracy, 0, 100) / 100, 2);
  const score = netWpm * accuracyMultiplier;
  return { typed: totalTyped, correct: player.correct, incorrect: player.incorrect, wpm: round(netWpm), accuracy: round(accuracy), score: round(score), elapsed };
}

/* RECALCULATE COUNTS — recompute correct/incorrect from the remaining typed sequence. */
function recalculateCharacterCounts(player, text) {
  let correct = 0;
  for (let i = 0; i < player.typed.length; i++) { if (player.typed[i] === text[i]) correct++; }
  player.correct = correct;
  player.incorrect = player.typed.length - correct;
}

/* FINISH BATTLE — winner = higher SERVER-calculated Battle Score (a genuine score tie goes to the
   first finisher); emit the result, then schedule room cleanup in 60s (only if still the same
   finished battle, so a rematch isn't torn down). */
function finishBattle(battle, finisherId) {
  if (battle.finished) return;
  battle.finished = true;
  const playerIds = Object.keys(battle.players);
  const playerA = battle.players[playerIds[0]];
  const playerB = battle.players[playerIds[1]];
  const statsA = calculateStats(playerA, battle.startAt);
  const statsB = calculateStats(playerB, battle.startAt);
  let winnerId;
  if (statsA.score > statsB.score) {
    winnerId = playerA.id;
  } else if (statsB.score > statsA.score) {
    winnerId = playerB.id;
  } else {
    winnerId = finisherId; // genuine score tie → whoever finished first wins
  }
  io.to(battle.roomId).emit("battleResult", {
    winnerId,
    players: {
      [playerA.id]: { id: playerA.id, name: playerA.name, avatarUrl: playerA.avatarUrl, ...statsA },
      [playerB.id]: { id: playerB.id, name: playerB.name, avatarUrl: playerB.avatarUrl, ...statsB }
    }
  });
  console.log("[BATTLE] Finished:", battle.roomId);
  console.log("[BATTLE] Winner:", winnerId);
  setTimeout(() => {
    const currentBattle = battles.get(battle.roomId);
    // Only delete if this is still the same finished battle (not a rematch that already started).
    if (currentBattle === battle && battle.finished) battles.delete(battle.roomId);
  }, 60000);
}

/* LEAVE BATTLE — notify the opponent (while still active), delete the room, leave it, ack. */
function leaveBattle(socket, roomId) {
  const battle = battles.get(roomId);
  if (!battle) return false; // battle doesn't exist
  console.log("[BATTLE] Player leaving:", socket.id, "Room:", roomId);
  const opponentId = Object.keys(battle.players).find(id => id !== socket.id);
  // Notify the opponent while the battle is still active.
  if (!battle.finished && opponentId) {
    console.log("[BATTLE] Notifying opponent about leave:", opponentId);
    io.to(opponentId).emit("opponentDisconnected", { reason: "left" });
    console.log("[BATTLE] Opponent notified.");
  }
  battles.delete(roomId);
  console.log("[BATTLE] Room deleted:", roomId);
  socket.leave(roomId);
  return true;
}

/* QUEUE */
function removeFromQueue(socketId) {
  const index = matchmakingQueue.findIndex(player => player.id === socketId);
  if (index !== -1) matchmakingQueue.splice(index, 1);
}
// Tear down any pending private room this socket is hosting.
function removeHostingPrivate(socketId) {
  for (const [code, pb] of privateBattles) { if (pb.hostPlayer.id === socketId) { privateBattles.delete(code); return; } }
}
// FRESH 6-DIGIT CODE — numeric and unique among pending private rooms.
function generatePrivateCode() {
  let code;
  do { code = String(Math.floor(100000 + Math.random() * 900000)); } while (privateBattles.has(code));
  return code;
}

/* HELPERS */
function createRoomId() { return "battle_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8); }
// Sanitize a display name (strip control chars, cap at 30 chars, default "Player").
function sanitizeName(name) {
  if (typeof name !== "string") return "Player";
  return name.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 30) || "Player";
}
// Only allow normal HTTP(S) profile-picture URLs, capped at 1000 chars.
function sanitizeAvatar(url) {
  if (typeof url !== "string" || !url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.href.slice(0, 1000);
  } catch { return null; }
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function round(value) { return Math.round(value * 10) / 10; }

/* START SERVER */
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Multiplayer server running on port ${PORT}`);
});