// Shared helpers used by the popup and the search page.

const STORE_KEY = "nlw_sites";

async function getSites() {
  const data = await chrome.storage.local.get(STORE_KEY);
  return data[STORE_KEY] || [];
}

async function setSites(sites) {
  await chrome.storage.local.set({ [STORE_KEY]: sites });
}

const FOLDER_KEY = "nlw_folders";

async function getFolders() {
  const data = await chrome.storage.local.get(FOLDER_KEY);
  return data[FOLDER_KEY] || [];
}

async function setFolders(folders) {
  await chrome.storage.local.set({ [FOLDER_KEY]: folders });
}

// Ignore the part after # so the same page counts as one site
// (Google Sheets changes it when you switch between sheet tabs).
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch (e) {
    return url;
  }
}

function cleanDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return url;
  }
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Saved just now";
  if (min < 60) return "Saved " + min + " min ago";
  const hr = Math.floor(min / 60);
  if (hr < 24) return "Saved " + hr + (hr === 1 ? " hour" : " hours") + " ago";
  const day = Math.floor(hr / 24);
  if (day < 30) return "Saved " + day + (day === 1 ? " day" : " days") + " ago";
  const mon = Math.floor(day / 30);
  if (mon < 12) return "Saved " + mon + (mon === 1 ? " month" : " months") + " ago";
  const yr = Math.floor(mon / 12);
  return "Saved " + yr + (yr === 1 ? " year" : " years") + " ago";
}

// Simple on-device tag detection. No data leaves the browser.
const TAG_RULES = [
  { tag: "Brand Portfolio", words: ["portfolio", "brand", "identity", "branding", "logo"] },
  { tag: "Design Studio", words: ["studio", "design", "agency", "creative"] },
  { tag: "Typography Archive", words: ["typography", "typeface", "font", "type foundry"] },
  { tag: "Case Study", words: ["case study", "case-study", "project", "work"] },
  { tag: "Article", words: ["article", "blog", "post", "medium", "substack", "read"] },
  { tag: "News", words: ["news", "times", "report", "breaking", "headline"] },
  { tag: "Tool", words: ["tool", "app", "generator", "free", "online", "converter"] },
  { tag: "Shopping", words: ["shop", "buy", "store", "price", "cart", "amazon", "flipkart"] },
  { tag: "Video", words: ["youtube", "video", "watch", "vimeo", "film"] },
  { tag: "Code", words: ["github", "code", "developer", "docs", "api", "stack overflow"] },
  { tag: "Learning", words: ["course", "learn", "tutorial", "guide", "lesson", "how to"] },
  { tag: "Recipe", words: ["recipe", "cook", "food", "ingredients"] },
  { tag: "Travel", words: ["travel", "hotel", "flight", "trip", "visit", "booking"] },
  { tag: "Jobs", words: ["jobs", "careers", "hiring", "linkedin", "resume", "internship"] },
  { tag: "Research", words: ["research", "study", "paper", "journal", "report"] },
  { tag: "Inspiration", words: ["inspiration", "gallery", "mood", "awwwards", "dribbble", "behance", "pinterest"] }
];

function detectTags(text) {
  const hay = (text || "").toLowerCase();
  const scored = [];
  for (const rule of TAG_RULES) {
    let score = 0;
    for (const w of rule.words) {
      if (hay.includes(w)) score += 1;
    }
    if (score > 0) scored.push({ tag: rule.tag, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const tags = scored.slice(0, 4).map((s) => s.tag);
  return tags.length ? tags : ["Website"];
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
