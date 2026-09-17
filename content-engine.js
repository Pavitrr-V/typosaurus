// Random typing content engine — supplies the text shown on the practice page (practice.js calls getRandomContent(category)).
// Content is picked from the fixed lists below, generated on the fly (numbers/mixed), or fetched from the Quotable API (with a local fallback).
// "Recent content" is remembered in localStorage so the same line isn't repeated too often.

const CONTENT_RECENT_STORAGE_KEY = "typingRecentContent";
const MAX_RECENT_ITEMS = 25;
const QUOTABLE_API = "https://api.quotable.io/quotes/random?limit=20&minLength=40&maxLength=220";

/* Local content */
const EASY_CONTENT = [
  "The morning sun was bright and warm as the new day began.",
  "Small steps can help us become better every day.",
  "Practice makes difficult things feel easier over time.",
  "A calm mind can make simple tasks much easier.",
  "Good habits grow when we repeat them consistently.",
  "The little things we do each day can create big changes.",
  "Learning something new can be exciting and rewarding.",
  "Take your time, stay focused, and keep moving forward.",
  "Every mistake is another chance to learn something useful.",
  "A simple plan can make a busy day feel more organized.",
  "The best way to improve is to practice regularly.",
  "Clear goals help us understand what we want to achieve.",
  "Reading and writing every day can improve communication skills.",
  "A positive attitude can make a difficult task feel manageable.",
  "Patience and consistency are useful skills in almost everything.",
];

const HARD_CONTENT = [
  "Extraordinary circumstances often require exceptional perseverance.",
  "Sophisticated techniques can dramatically improve concentration.",
  "Communication becomes increasingly effective through deliberate practice.",
  "Intellectual curiosity encourages people to investigate unfamiliar subjects.",
  "Complicated problems frequently become manageable after careful analysis.",
  "Consistent experimentation can produce remarkable improvements over time.",
  "Understanding unfamiliar terminology requires patience and attention.",
  "Successful professionals frequently demonstrate adaptability and resilience.",
  "Technological innovation continuously transforms conventional approaches.",
  "Accurate interpretation requires comprehensive knowledge of relevant information.",
  "Unpredictable circumstances can challenge even experienced individuals.",
  "Efficient organizations prioritize transparency, accountability, and collaboration.",
  "Critical thinking enables individuals to evaluate complicated arguments.",
  "Exceptional performance usually requires discipline, persistence, and precision.",
  "Entrepreneurial opportunities frequently emerge from unexpected circumstances.",
];

const PARAGRAPH_CONTENT = [
  "Typing is a practical skill that becomes easier with regular practice. When you focus on accuracy first, speed gradually improves without forcing every keystroke. A comfortable rhythm allows your hands to move naturally while your attention remains on the words in front of you.",
  "Technology has changed the way people communicate, learn, and work. Students can access information within seconds, while professionals can collaborate with people around the world. These advantages are useful, but they also make it important to develop the ability to concentrate without constant distractions.",
  "Progress rarely happens all at once. Most improvements come from small decisions repeated consistently over a long period. Whether you are learning a language, practicing typing, or building a new skill, patience and consistency are often more valuable than short bursts of intense effort.",
  "A good typing session should balance speed and accuracy. Moving too quickly can create unnecessary mistakes, while typing too slowly may prevent you from developing a natural rhythm. The goal is to find a comfortable pace where your fingers respond automatically to what your mind wants to write.",
  "Learning becomes more effective when mistakes are treated as useful feedback. Instead of becoming frustrated by an incorrect answer or a missed key, identify what caused the mistake and continue practicing. Over time, repeated exposure makes unfamiliar patterns easier to recognize and remember.",
];

const STORY_CONTENT = [
  "The old library stood quietly at the end of the street. Every evening, a warm light appeared behind its tallest window. One rainy night, a curious student decided to discover what was inside. The door opened with a soft sound, and a narrow staircase appeared behind the shelves.",
  "Maya found a small notebook underneath an old wooden bench. Its pages were filled with strange drawings, short messages, and a map of the neighborhood. She followed the map after school and eventually discovered a tiny garden hidden between two buildings.",
  "The train arrived just before sunset. Arjun stepped inside and found an empty seat near the window. As the city disappeared behind him, he noticed a handwritten note on the glass. It contained only three words: Keep going forward.",
  "A quiet village had one unusual tradition. Every year, on the first evening of spring, everyone placed a small lantern outside their homes. Nobody remembered exactly how the tradition began, but each generation continued it because the warm lights made the entire village feel connected.",
  "The shopkeeper opened his store early one winter morning. A mysterious package was waiting outside the door with no name or address. Inside was an old mechanical watch that still worked perfectly. Curious about its history, he began asking everyone in town if they recognized it.",
];

const CODING_CONTENT = [
  `const message = "Hello World";
console.log(message);`,
  `function greetUser(name) {
    return \`Hello, \${name}!\`;
}`,
  `const numbers = [10, 20, 30, 40];
const total = numbers.reduce((sum, value) => sum + value, 0);`,
  `function isEven(number) {
    return number % 2 === 0;
}`,
  `const user = {
    name: "Alex",
    age: 21,
    active: true
};`,
  `for (let i = 0; i < 10; i++) {
    console.log("Number:", i);
}`,
  `const users = ["Alex", "Sam", "Jordan"];
users.forEach(user => console.log(user));`,
  `async function loadData() {
    const response = await fetch("/api/data");
    return response.json();
}`,
  `if (isLoggedIn) {
    showDashboard();
} else {
    showLogin();
}`,
  `const square = value => value * value;`,
  `function calculateAverage(values) {
    const total = values.reduce((a, b) => a + b, 0);
    return total / values.length;
}`,
  `const settings = {
    theme: "light",
    language: "en",
    notifications: true
};`,
  `document
    .getElementById("submitButton")
    .addEventListener("click", submitForm);`,
  `let score = 0;

function increaseScore() {
    score++;
    updateScore(score);
}`,
  `try {
    const result = JSON.parse(data);
    console.log(result);
} catch (error) {
    console.error(error);
}`,
];

const GENZ_CONTENT = [
  "Bro really thought that was the move.",
  "No cap, that outfit is actually fire.",
  "Lowkey this whole thing is giving main character energy.",
  "That idea is kinda wild, but I am not even mad.",
  "The vibes are immaculate today, honestly.",
  "She understood the assignment and absolutely delivered.",
  "That was so random, I cannot even lie.",
  "Bro said one thing and then did the exact opposite.",
  "This playlist is lowkey carrying my entire day.",
  "That update is actually a huge W.",
  "Not gonna lie, that was a pretty solid comeback.",
  "The group chat went completely chaotic after midnight.",
  "That new feature is giving serious upgrade energy.",
  "I was ready to leave, but then the plot got interesting.",
  "This is definitely one of those trust-the-process moments.",
];

const LOCAL_QUOTES = [
  "The future depends on what you do today.",
  "Success is the sum of small efforts repeated day after day.",
  "Great things are done by a series of small things brought together.",
  "It always seems impossible until it is done.",
  "The secret of getting ahead is getting started.",
  "Believe you can and you are halfway there.",
  "Do what you can, with what you have, where you are.",
  "The only way to do great work is to love what you do.",
  "Success is not final, failure is not fatal, keep moving forward.",
  "Every moment is a fresh beginning.",
];

/* Recent content — localStorage so the same line isn't repeated too often */
function getRecentContent() {
  try {
    const stored = localStorage.getItem(CONTENT_RECENT_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) { return []; }
}
function saveRecentContent(text) {
  if (!text) return;
  let recent = getRecentContent();
  recent = recent.filter(item => item !== text);
  recent.unshift(text);
  if (recent.length > MAX_RECENT_ITEMS) recent = recent.slice(0, MAX_RECENT_ITEMS);
  try { localStorage.setItem(CONTENT_RECENT_STORAGE_KEY, JSON.stringify(recent)); } catch (error) { console.warn("Could not save recent content:", error); }
}

/* Random helpers */
function randomIndex(length) { return Math.floor(Math.random() * length); }
function randomItem(array) { return !array || array.length === 0 ? "" : array[randomIndex(array.length)]; }
function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* Unique local content */
function getUniqueFromPool(pool) {
  if (!pool || pool.length === 0) return "";
  const recent = getRecentContent();
  const available = pool.filter(text => !recent.includes(text));
  const source = available.length > 0 ? available : pool;
  const selected = randomItem(source);
  saveRecentContent(selected);
  return selected;
}

/* Numbers & symbols */
function generateNumbersContent() {
  const numbers = [];
  for (let i = 0; i < 18; i++) numbers.push(String(Math.floor(Math.random() * 100000)));
  const decimals = [];
  for (let i = 0; i < 5; i++) decimals.push((Math.random() * 100).toFixed(Math.floor(Math.random() * 3) + 1));
  const symbols = ["+", "-", "=", "*", "/", "%", "@", "#", "$", "&", "_", "!", "?", "^", "~"];
  const selectedSymbols = shuffle(symbols).slice(0, 10).join(" ");
  const date =
    `${2025 + Math.floor(Math.random() * 5)}-` +
    `${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-` +
    `${String(1 + Math.floor(Math.random() * 28)).padStart(2, "0")}`;
  const result =
    numbers.slice(0, 9).join(" ") + " | " +
    decimals.join(" ") + " | " +
    selectedSymbols + " | " +
    numbers.slice(9).join(" ") + " | " +
    date;
  saveRecentContent(result);
  return result;
}

/* Mixed challenge */
function generateMixedContent() {
  const easy = randomItem(EASY_CONTENT);
  const hard = randomItem(HARD_CONTENT);
  const number = String(Math.floor(10 + Math.random() * 990));
  const percent = Math.floor(50 + Math.random() * 51);
  const symbols = randomItem(["+", "#", "@", "%", "&", "="]);
  const result = `${easy} ${hard} In ${number} days, aim for ${percent}% accuracy ${symbols} and keep improving!`;
  saveRecentContent(result);
  return result;
}

/* Quotable API */
let quoteCache = [];
let quoteRequestInProgress = false;
async function fetchQuoteBatch() {
  if (quoteRequestInProgress) return;
  quoteRequestInProgress = true;
  try {
    const response = await fetch(QUOTABLE_API, { method: "GET" });
    if (!response.ok) throw new Error("Quote API returned HTTP " + response.status);
    const data = await response.json();
    if (Array.isArray(data)) quoteCache = data.map(item => item && item.content).filter(Boolean);
  } catch (error) { console.warn("Quote API unavailable. Using local quotes.", error); }
  finally { quoteRequestInProgress = false; }
}

async function getQuoteContent() {
  let quote = "";
  if (quoteCache.length === 0) await fetchQuoteBatch();
  if (quoteCache.length > 0) {
    const recent = getRecentContent();
    const available = quoteCache.filter(item => !recent.includes(item));
    const source = available.length > 0 ? available : quoteCache;
    quote = randomItem(source);
    quoteCache = quoteCache.filter(item => item !== quote);
  }
  if (!quote) {
    quote = getUniqueFromPool(LOCAL_QUOTES);
  } else {
    saveRecentContent(quote);
  }
  return quote;
}

/* Category normalization */
function normalizeCategory(category) {
  const value = String(category || "easy").toLowerCase().trim();
  const aliases = {
    "easy words": "easy",
    "hard words": "hard",
    paragraphs: "paragraph",
    stories: "story",
    "gen z": "genz",
    "gen z / slang": "genz",
    "numbers & symbols": "numbers",
    "numbers and symbols": "numbers",
    quotes: "quotes",
    "mixed challenge": "mixed",
  };
  return aliases[value] || value;
}

/* Main content function */
async function getRandomContent(category) {
  const type = normalizeCategory(category);
  let result = "";
  switch (type) {
    case "easy": result = getUniqueFromPool(EASY_CONTENT); break;
    case "hard": result = getUniqueFromPool(HARD_CONTENT); break;
    case "paragraph": result = getUniqueFromPool(PARAGRAPH_CONTENT); break;
    case "story": result = getUniqueFromPool(STORY_CONTENT); break;
    case "coding": result = getUniqueFromPool(CODING_CONTENT); break;
    case "genz": result = getUniqueFromPool(GENZ_CONTENT); break;
    case "numbers": result = generateNumbersContent(); break;
    case "quotes": result = await getQuoteContent(); break;
    case "mixed": result = generateMixedContent(); break;
    default: result = getUniqueFromPool(EASY_CONTENT); break;
  }
  return result;
}

/* Preload quotes quietly so the Quotes category feels faster */
window.addEventListener("load", function () { fetchQuoteBatch(); });