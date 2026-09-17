// TYPING TRACKER BACKEND — Apps Script backend for users, auth, typing sessions, stats, profiles and the leaderboard.
const CONFIG = {
  SPREADSHEET_ID: '15w4iI2R-Nh1XgaxT_axnOUWjL3hlE11y-EryBA9wgC4',
  SHEETS: { TYPING_SESSIONS: 'TypingSessions', USERS: 'Users' }
};

/* SHEET HELPERS */
// Opens the TypingSessions sheet.
function getTypingSessionsSheet() {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEETS.TYPING_SESSIONS);
  if (!sheet) throw new Error('TypingSessions sheet not found.');
  return sheet;
}
// Opens the Users sheet.
function getUsersSheet() {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEETS.USERS);
  if (!sheet) throw new Error('Users sheet not found.');
  return sheet;
}
// Adds a "profilePicture" header column to Users if missing and returns its 1-based column index.
function ensureProfilePictureColumn() {
  const sheet = getUsersSheet();
  const lastColumn = sheet.getLastColumn();
  if (!lastColumn) throw new Error('Users sheet is empty.');
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const index = headers.indexOf('profilePicture');
  if (index !== -1) return index + 1;
  sheet.getRange(1, lastColumn + 1).setValue('profilePicture');
  return lastColumn + 1;
}

/* ID GENERATORS */
// Builds a unique typing session ID.
function generateTypingSessionId() { return 'TS_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8).toUpperCase(); }
// Builds a unique registered user ID.
function generateUserId() { return 'USER_' + Utilities.getUuid().replace(/-/g, '').substring(0, 16).toUpperCase(); }
// Builds a random, single-use login token.
function generateAuthToken() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }

/* PASSWORD SECURITY */
// Generates a random salt for password hashing.
function generateSalt() { return Utilities.getUuid() + Utilities.getUuid(); }
// Hashes a password + salt with SHA-256, returned as hex.
function hashPassword(password, salt) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password) + String(salt), Utilities.Charset.UTF_8);
  return digest.map(byte => ('0' + ((byte < 0 ? byte + 256 : byte).toString(16))).slice(-2)).join('');
}

/* PROFILE PICTURES */
// Returns the fixed list of profile picture URLs users may choose from.
function getAllowedProfilePictures() {
  return [
    'https://jkbjp.in/wp-content/uploads/2016/11/sh_narendra_modi_27.09.2016_1-1.png',
    'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT26qlBV9LBE5Dmvy-cdZr8qAAeVkqrNDfbkTh6JoT9-Q&s',
    'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRiio3eLYRdubH1WwqC1VgPk8hQYSShN_q4lLSeXK6cipReo09OdaB6i7hz&s=10',
    'https://cdn.pfps.gg/pfps/9134-funny-memes.png',
    'https://c.ndtvimg.com/2026-01/8r81dk38_varun-dhawan_625x300_15_January_26.jpeg?im=FeatureCrop,algorithm=dnn,width=270,height=300',
    'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTzoKFt7rHRjcem2HbpY4xuGm6K0MzACB-03fnxcID7j8KWCKs6MoNVgKw&s=10',
    'https://wallpapers.com/images/featured/meme-profile-pictures-vnigweuy4onsxunv.jpg',
    'https://i.pinimg.com/236x/5f/00/3e/5f003ee3e3bb7bd299f31241079d8c9a.jpg?nii=t',
    'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSTlUPDvlI9Ek8_sOs9KxqJW183sxhTclErb78rDGl-a_MwfSIkVSBoCNUW&s=10',
    'https://m.sakshipost.com/sites/default/files/styles/storypage_main/public/gallery_images/2025/07/24/aneet%20padda6-1753357202.jpg?itok=PsDaWuIq',
    'https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1592721086i/54199957.jpg',
    'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTlCnupgdyBDKqIDjumOYOVl3q_1Zico0yDJZjZBtJA0f4F3lnqG-Yk1Q&s=10'
  ];
}
// Validates a profile picture URL; empty falls back to the first option.
function validateProfilePicture(profilePicture) {
  const value = String(profilePicture || '').trim();
  if (!value) return getAllowedProfilePictures()[0];
  if (!getAllowedProfilePictures().includes(value)) throw new Error('Invalid profile picture.');
  return value;
}

/* USER LOOKUP */
// Maps one raw user row into an object (needs the header row + row index).
function mapUserRow(data, headers, i) {
  const profileIndex = headers.indexOf('profilePicture');
  return {
    rowNumber: i + 1,
    userId: data[i][0], username: data[i][1], passwordHash: data[i][2], salt: data[i][3],
    googleId: data[i][4], email: data[i][5], displayName: data[i][6],
    createdAt: data[i][7], lastLoginAt: data[i][8],
    profilePicture: profileIndex !== -1 ? data[i][profileIndex] : ''
  };
}
// Finds a user by username (case-insensitive).
function findUserByUsername(username) {
  const data = getUsersSheet().getDataRange().getValues();
  if (data.length <= 1) return null;
  const target = String(username).trim().toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim().toLowerCase() === target) return mapUserRow(data, data[0], i);
  }
  return null;
}
// Finds a user by their exact user ID.
function findUserById(userId) {
  const data = getUsersSheet().getDataRange().getValues();
  if (data.length <= 1) return null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId)) return mapUserRow(data, data[0], i);
  }
  return null;
}

/* AUTHENTICATION */
// Creates a temporary server-side session (6 hours) and returns its token.
function createUserSession(userId) {
  const token = generateAuthToken();
  CacheService.getScriptCache().put('AUTH_' + token, userId, 21600);
  return token;
}
// Validates a token and returns the logged-in user (throws if invalid/expired).
function verifyAuthToken(token) {
  token = String(token || '').trim();
  if (!token) throw new Error('Authentication required.');
  const userId = CacheService.getScriptCache().get('AUTH_' + token);
  if (!userId) throw new Error('Your session has expired. Please login again.');
  const user = findUserById(userId);
  if (!user) throw new Error('User account not found.');
  return user;
}
// Invalidates a login token (logout).
function logoutUser(token) {
  token = String(token || '').trim();
  if (token) CacheService.getScriptCache().remove('AUTH_' + token);
  return { success: true };
}

/* SCORING — weights/multipliers that turn a typing session into a leaderboard score. */
const SCORE_CONFIG = {
  WPM_WEIGHT: 4,
  ACCURACY_WEIGHT: 3,
  TIME_WEIGHT: 1,
  MAX_REFERENCE_WPM: 100,
  BEST_TIME_SECONDS: 60,
  WORST_TIME_SECONDS: 300,
  CATEGORY_MULTIPLIERS: {
    'Easy Words': 1.00,
    'Gen Z / Slang': 1.05,
    'Hard Words': 1.20,
    'Quotes': 1.25,
    'Paragraphs': 1.30,
    'Stories': 1.40,
    'Numbers & Symbols': 1.35,
    'Mixed Challenge': 1.50,
    'Coding': 1.60
  },
  ACTIVITY_BONUS: [
    { tests: 500, bonus: 1100 }, { tests: 250, bonus: 900 }, { tests: 100, bonus: 650 },
    { tests: 50, bonus: 450 }, { tests: 25, bonus: 300 }, { tests: 10, bonus: 175 },
    { tests: 5, bonus: 100 }, { tests: 1, bonus: 25 }
  ]
};
// Looks up the score multiplier for a category (defaults to 1).
function getCategoryMultiplier(category) { return SCORE_CONFIG.CATEGORY_MULTIPLIERS[String(category || '').trim()] || 1; }
// Converts session duration into a 0-100 score (faster = higher, capped at BEST/WORST bounds).
function calculateTimeScore(durationSeconds) {
  durationSeconds = Number(durationSeconds) || 0;
  if (durationSeconds <= 0) return 0;
  if (durationSeconds <= SCORE_CONFIG.BEST_TIME_SECONDS) return 100;
  if (durationSeconds >= SCORE_CONFIG.WORST_TIME_SECONDS) return 0;
  const range = SCORE_CONFIG.WORST_TIME_SECONDS - SCORE_CONFIG.BEST_TIME_SECONDS;
  const remaining = SCORE_CONFIG.WORST_TIME_SECONDS - durationSeconds;
  return Math.max(0, Math.min(100, (remaining / range) * 100));
}
// Combines WPM, accuracy and time into one weighted, category-adjusted session score.
function calculateTypingScore(session) {
  session = session || {};
  const wpm = Math.max(0, Number(session.wpm) || 0);
  const accuracy = Math.max(0, Math.min(100, Number(session.accuracy) || 0));
  const duration = Math.max(0, Number(session.durationSeconds) || 0);
  const wpmScore = Math.min(100, (wpm / SCORE_CONFIG.MAX_REFERENCE_WPM) * 100);
  const timeScore = calculateTimeScore(duration);
  const baseScore = wpmScore * SCORE_CONFIG.WPM_WEIGHT + accuracy * SCORE_CONFIG.ACCURACY_WEIGHT + timeScore * SCORE_CONFIG.TIME_WEIGHT;
  return Math.round(baseScore * getCategoryMultiplier(session.category) * 100) / 100;
}
// Returns the leaderboard bonus earned for a given total test count.
function calculateActivityBonus(totalTests) {
  totalTests = Math.max(0, Number(totalTests) || 0);
  for (const level of SCORE_CONFIG.ACTIVITY_BONUS) {
    if (totalTests >= level.tests) return level.bonus;
  }
  return 0;
}

/* TYPING SESSIONS */
// Saves one completed test (logged-in user via token, or a guest via ID) with its calculated score.
function saveTypingSession(session, token) {
  if (!session) throw new Error('Session data is required.');
  const sheet = getTypingSessionsSheet();
  let userId, userType;
  if (token) {
    userId = verifyAuthToken(token).userId; // logged-in user: identity from the verified token
    userType = 'user';
  } else {
    userId = String(session.userId || '').trim(); // guest: identity from the client-supplied guest ID
    if (!userId || !userId.startsWith('GUEST_')) throw new Error('Valid guest user ID is required.');
    userType = 'guest';
  }
  const sessionId = session.sessionId || generateTypingSessionId();
  const now = new Date();
  const startTime = session.startTime ? new Date(session.startTime) : now;
  const endTime = session.endTime ? new Date(session.endTime) : now;
  const durationSeconds = Number(session.durationSeconds) || 0;
  const totalCharacters = Number(session.totalCharacters) || 0;
  const correctCharacters = Number(session.correctCharacters) || 0;
  const incorrectCharacters = Number(session.incorrectCharacters) || 0;
  const accuracy = Number(session.accuracy) || 0;
  const wpm = Number(session.wpm) || 0;
  const category = String(session.category || 'Unknown').trim();
  const score = calculateTypingScore({ category, durationSeconds, accuracy, wpm });
  sheet.appendRow([sessionId, userId, userType, category, startTime, endTime, durationSeconds, totalCharacters, correctCharacters, incorrectCharacters, accuracy, wpm, score]);
  return { success: true, sessionId, userId, userType, score };
}

/* HISTORY */
// Returns every typing session belonging to one logged-in user or guest.
function getTypingHistory(token, guestUserId) {
  let targetUserId;
  if (token) {
    targetUserId = verifyAuthToken(token).userId;
  } else {
    guestUserId = String(guestUserId || '').trim();
    if (!guestUserId.startsWith('GUEST_')) throw new Error('Valid guest user ID is required.');
    targetUserId = guestUserId;
  }
  const data = getTypingSessionsSheet().getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  const userIdIndex = headers.indexOf('userId');
  if (userIdIndex === -1) throw new Error('userId column not found.');
  const history = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][userIdIndex]) !== String(targetUserId)) continue;
    const row = {};
    headers.forEach((header, index) => { row[header] = data[i][index]; });
    history.push(row);
  }
  return history;
}

/* STATISTICS */
// Aggregates one user/guest's sessions into overall and per-category stats.
function getTypingStatistics(token, guestUserId) {
  const history = getTypingHistory(token, guestUserId);
  const targetUserId = token ? verifyAuthToken(token).userId : String(guestUserId || '').trim();
  if (!history.length) {
    return { userId: targetUserId, totalTests: 0, averageWpm: 0, bestWpm: 0, averageAccuracy: 0, bestAccuracy: 0, totalTypingTimeSeconds: 0, totalCharacters: 0, categories: {} };
  }
  let totalWpm = 0, totalAccuracy = 0, bestWpm = 0, bestAccuracy = 0, totalTime = 0, totalCharacters = 0;
  const categories = {};
  history.forEach(session => {
    const wpm = Number(session.wpm) || 0;
    const accuracy = Number(session.accuracy) || 0;
    const duration = Number(session.durationSeconds) || 0;
    const characters = Number(session.totalCharacters) || 0;
    totalWpm += wpm;
    totalAccuracy += accuracy;
    bestWpm = Math.max(bestWpm, wpm);
    bestAccuracy = Math.max(bestAccuracy, accuracy);
    totalTime += duration;
    totalCharacters += characters;
    const category = String(session.category || 'Unknown');
    if (!categories[category]) categories[category] = { tests: 0, averageWpm: 0, bestWpm: 0, averageAccuracy: 0, bestAccuracy: 0 };
    const item = categories[category];
    item.tests++;
    item.averageWpm += wpm;
    item.bestWpm = Math.max(item.bestWpm, wpm);
    item.averageAccuracy += accuracy;
    item.bestAccuracy = Math.max(item.bestAccuracy, accuracy);
  });
  // Turn per-category running totals into averages.
  Object.keys(categories).forEach(category => {
    categories[category].averageWpm /= categories[category].tests;
    categories[category].averageAccuracy /= categories[category].tests;
  });
  return {
    userId: targetUserId,
    totalTests: history.length,
    averageWpm: totalWpm / history.length,
    bestWpm,
    averageAccuracy: totalAccuracy / history.length,
    bestAccuracy,
    totalTypingTimeSeconds: totalTime,
    totalCharacters,
    categories
  };
}

/* ALL SESSIONS */
// Returns every typing session in the sheet, for leaderboard calculations.
function getAllTypingSessions() {
  const data = getTypingSessionsSheet().getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const session = {};
    headers.forEach((header, index) => { session[header] = row[index]; });
    return session;
  });
}

/* LEADERBOARD */
// Builds the ranked leaderboard from all registered users' typing sessions.
function calculateLeaderboard() {
  const sessions = getAllTypingSessions();
  const userData = getUsersSheet().getDataRange().getValues();
  if (userData.length <= 1) return [];
  const headers = userData[0];
  const rows = userData.slice(1);
  const userIdIndex = headers.indexOf('userId');
  const usernameIndex = headers.indexOf('username');
  const displayNameIndex = headers.indexOf('displayName');
  const profilePictureIndex = headers.indexOf('profilePicture');
  if (userIdIndex === -1 || usernameIndex === -1) throw new Error('Users sheet is missing required columns.');
  // Quick lookup table: userId -> basic profile info.
  const users = {};
  rows.forEach(row => {
    const userId = String(row[userIdIndex] || '').trim();
    if (!userId) return;
    users[userId] = {
      userId,
      username: String(row[usernameIndex] || '').trim(),
      displayName: String((displayNameIndex !== -1 ? row[displayNameIndex] : '') || row[usernameIndex] || 'User').trim(),
      profilePicture: profilePictureIndex !== -1 ? String(row[profilePictureIndex] || '').trim() : ''
    };
  });
  const stats = {};
  // Fold every registered (non-guest) session into that user's running totals.
  sessions.forEach(session => {
    const userId = String(session.userId || '').trim();
    const userType = String(session.userType || '').trim().toLowerCase();
    if (userType !== 'user' || !users[userId]) return;
    if (!stats[userId]) {
      stats[userId] = { userId, username: users[userId].username, displayName: users[userId].displayName, profilePicture: users[userId].profilePicture, totalTests: 0, totalScore: 0, totalWpm: 0, totalAccuracy: 0, bestWpm: 0, bestScore: 0, totalTime: 0 };
    }
    const user = stats[userId];
    const wpm = Number(session.wpm) || 0;
    const accuracy = Number(session.accuracy) || 0;
    const duration = Number(session.durationSeconds) || 0;
    let score = Number(session.score);
    // Recalculate scores for legacy rows saved without a valid score.
    if (session.score === '' || session.score === null || session.score === undefined || !isFinite(score) || score < 0) {
      score = calculateTypingScore({ wpm, accuracy, durationSeconds: duration, category: session.category });
    }
    user.totalTests++;
    user.totalScore += score;
    user.totalWpm += wpm;
    user.totalAccuracy += accuracy;
    user.totalTime += duration;
    user.bestWpm = Math.max(user.bestWpm, wpm);
    user.bestScore = Math.max(user.bestScore, score);
  });
  // Turn accumulated totals into the final leaderboard rows.
  const leaderboard = Object.values(stats).map(user => {
    const activityBonus = calculateActivityBonus(user.totalTests);
    const averageWpm = user.totalTests ? user.totalWpm / user.totalTests : 0;
    const averageAccuracy = user.totalTests ? user.totalAccuracy / user.totalTests : 0;
    const totalScore = user.totalScore + activityBonus;
    return {
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      profilePicture: user.profilePicture,
      totalTests: user.totalTests,
      sessionScore: Math.round(user.totalScore * 100) / 100,
      activityBonus,
      totalScore: Math.round(totalScore * 100) / 100,
      averageWpm: Math.round(averageWpm * 10) / 10,
      averageAccuracy: Math.round(averageAccuracy * 10) / 10,
      bestWpm: Math.round(user.bestWpm * 10) / 10,
      bestScore: Math.round(user.bestScore * 100) / 100,
      totalTime: user.totalTime
    };
  });
  // Rank by total score, then best score, then best WPM, then username.
  leaderboard.sort((a, b) =>
    b.totalScore - a.totalScore || b.bestScore - a.bestScore || b.bestWpm - a.bestWpm || String(a.username).localeCompare(String(b.username)));
  leaderboard.forEach((user, index) => { user.rank = index + 1; user.isCurrentUser = false; });
  return leaderboard;
}
// Returns the full leaderboard, flagging the requesting user's own row if logged in.
function getLeaderboard(token) {
  const leaderboard = calculateLeaderboard();
  const currentUserId = token ? verifyAuthToken(token).userId : null;
  leaderboard.forEach(user => { user.isCurrentUser = !!currentUserId && String(user.userId) === String(currentUserId); });
  return { currentUserId, totalUsers: leaderboard.length, leaderboard };
}

/* CURRENT USER SCORE */
// Returns just the logged-in user's own leaderboard row (zeroed if they have no sessions yet).
function getUserScoreStats(token) {
  if (!token) throw new Error('Login required.');
  const user = verifyAuthToken(token);
  const leaderboard = calculateLeaderboard();
  const result = leaderboard.find(item => String(item.userId) === String(user.userId));
  if (result) return result;
  return { userId: user.userId, username: user.username, displayName: user.displayName || user.username, profilePicture: user.profilePicture || '', rank: null, totalUsers: leaderboard.length, totalScore: 0, totalTests: 0, averageWpm: 0, averageAccuracy: 0, bestWpm: 0, bestScore: 0, activityBonus: 0, totalTime: 0 };
}

/* USER PROFILE — update only; the read path lives on the client (localStorage), and no page calls a profile fetch. */
// Updates the logged-in user's username and profile picture (username must stay unique).
function updateUserProfile(token, username, profilePicture) {
  if (!token) throw new Error('Login required.');
  const authenticatedUser = verifyAuthToken(token);
  username = String(username || '').trim();
  if (!username) throw new Error('Username is required.');
  if (username.length < 3) throw new Error('Username must be at least 3 characters.');
  if (username.length > 30) throw new Error('Username cannot exceed 30 characters.');
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) throw new Error('Username can only contain letters, numbers, underscore, dot and hyphen.');
  const validatedPicture = validateProfilePicture(profilePicture);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const currentUser = findUserById(authenticatedUser.userId);
    if (!currentUser) throw new Error('User account not found.');
    const existingUser = findUserByUsername(username);
    if (existingUser && String(existingUser.userId) !== String(currentUser.userId)) throw new Error('Username is already taken.');
    const sheet = getUsersSheet();
    const profileColumn = ensureProfilePictureColumn();
    sheet.getRange(currentUser.rowNumber, 2).setValue(username); // update username
    sheet.getRange(currentUser.rowNumber, 7).setValue(username); // keep displayName in sync
    sheet.getRange(currentUser.rowNumber, profileColumn).setValue(validatedPicture); // update avatar
    return { success: true, user: { userId: currentUser.userId, username, displayName: username, email: currentUser.email || '', profilePicture: validatedPicture, userType: 'user' } };
  } finally {
    lock.releaseLock();
  }
}

/* CREATE ACCOUNT */
// Validates a signup, creates the user row, and migrates any guest history to it.
function createUserAccount(username, password, profilePicture, guestUserId) {
  username = String(username || '').trim();
  password = String(password || '');
  guestUserId = String(guestUserId || '').trim();
  if (!username) throw new Error('Username is required.');
  if (username.length < 3) throw new Error('Username must be at least 3 characters.');
  if (username.length > 30) throw new Error('Username cannot exceed 30 characters.');
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) throw new Error('Username can only contain letters, numbers, underscore, dot and hyphen.');
  if (!password) throw new Error('Password is required.');
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');
  const selectedPicture = validateProfilePicture(profilePicture);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (findUserByUsername(username)) throw new Error('Username is already taken.');
    const userId = generateUserId();
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    const now = new Date();
    const sheet = getUsersSheet();
    const profileColumn = ensureProfilePictureColumn();
    const row = [userId, username, passwordHash, salt, '', '', username, now, now, selectedPicture];
    while (row.length < Math.max(10, profileColumn)) row.push(''); // pad row to match sheet width
    sheet.appendRow(row);
    // Move any guest typing history onto the new account.
    const transferredSessions = guestUserId.startsWith('GUEST_') ? transferGuestSessions(guestUserId, userId) : 0;
    const token = createUserSession(userId);
    return { success: true, user: { userId, username, displayName: username, profilePicture: selectedPicture, userType: 'user' }, token, transferredSessions };
  } finally {
    lock.releaseLock();
  }
}

/* LOGIN */
// Verifies credentials, discards guest history, and starts a new session.
function loginUser(username, password, guestUserId) {
  username = String(username || '').trim();
  password = String(password || '');
  guestUserId = String(guestUserId || '').trim();
  const user = findUserByUsername(username);
  if (!user) throw new Error('Invalid username or password.');
  const suppliedHash = hashPassword(password, user.salt);
  if (suppliedHash !== user.passwordHash) throw new Error('Invalid username or password.');
  // Guest sessions are discarded (not merged) on login, unlike on signup.
  const deletedGuestSessions = guestUserId.startsWith('GUEST_') ? deleteGuestSessions(guestUserId) : 0;
  getUsersSheet().getRange(user.rowNumber, 9).setValue(new Date()); // update lastLoginAt
  const token = createUserSession(user.userId);
  return {
    success: true,
    user: { userId: user.userId, username: user.username, displayName: user.displayName || user.username, email: user.email || '', profilePicture: user.profilePicture || '', userType: 'user' },
    token,
    deletedGuestSessions
  };
}

/* GUEST SESSION MANAGEMENT */
// Reassigns a guest's typing sessions to a newly created real account.
function transferGuestSessions(guestUserId, newUserId) {
  const sheet = getTypingSessionsSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return 0;
  const headers = data[0];
  const userIdIndex = headers.indexOf('userId');
  const userTypeIndex = headers.indexOf('userType');
  if (userIdIndex === -1) throw new Error('userId column not found.');
  let transferred = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][userIdIndex]) !== String(guestUserId)) continue;
    sheet.getRange(i + 1, userIdIndex + 1).setValue(newUserId);
    if (userTypeIndex !== -1) sheet.getRange(i + 1, userTypeIndex + 1).setValue('user');
    transferred++;
  }
  return transferred;
}
// Deletes all typing sessions belonging to a guest ID (used on login, not signup).
function deleteGuestSessions(guestUserId) {
  const sheet = getTypingSessionsSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return 0;
  const userIdIndex = data[0].indexOf('userId');
  if (userIdIndex === -1) throw new Error('userId column not found.');
  let deleted = 0;
  for (let i = data.length - 1; i >= 1; i--) { // bottom-to-top so row numbers stay valid while deleting
    if (String(data[i][userIdIndex]) === String(guestUserId)) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }
  return deleted;
}

/* POST API — write-style requests (only the actions the frontend actually calls). */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Request body is empty.');
    const data = JSON.parse(e.postData.contents);
    if (!data.action) throw new Error('Missing "action" field.');
    let result;
    switch (String(data.action)) {
      case 'saveTypingSession': result = saveTypingSession(data.session, data.token); break;
      case 'createAccount': result = createUserAccount(data.username, data.password, data.profilePicture, data.guestUserId); break;
      case 'login': result = loginUser(data.username, data.password, data.guestUserId); break;
      case 'logout': result = logoutUser(data.token); break;
      case 'updateProfile': result = updateUserProfile(data.token, data.username, data.profilePicture); break;
      default: throw new Error('Unknown action: ' + data.action);
    }
    return jsonResponse({ success: true, data: result });
  } catch (error) {
    return jsonResponse({ success: false, message: error && error.message ? error.message : 'Server error.' });
  }
}

/* GET API — read-only requests (only the actions the frontend actually calls). */
function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = String(params.action || '').trim();
    const token = String(params.token || '').trim();
    const guestUserId = String(params.guestUserId || '').trim();
    let result;
    switch (action) {
      case 'history': result = getTypingHistory(token, guestUserId); break;
      case 'statistics': result = getTypingStatistics(token, guestUserId); break;
      case 'leaderboard': result = getLeaderboard(token); break;
      case 'userScore': result = getUserScoreStats(token); break;
      default: throw new Error('Invalid action.');
    }
    return jsonResponse({ success: true, data: result });
  } catch (error) {
    return jsonResponse({ success: false, message: error && error.message ? error.message : 'Server error.' });
  }
}

/* RESPONSE HELPER */
// Wraps any result into the standard JSON response shape.
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}