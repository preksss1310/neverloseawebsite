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

// On-device tag detection. Nothing here leaves the browser.
// Part 1: category tags (Design Studio, Recipe, Code...), matched on whole words
// and weighted by where the word shows up (title and headings count the most).
const TAG_RULES = [
  { tag: "Brand Portfolio", words: ["portfolio", "branding", "brand identity", "visual identity", "logo design"] },
  { tag: "Design Studio", words: ["design studio", "creative studio", "design agency", "creative agency", "studio"] },
  { tag: "Typography", words: ["typography", "typeface", "typefaces", "font", "fonts", "type foundry", "lettering"] },
  { tag: "Case Study", words: ["case study", "case studies"] },
  { tag: "UI Design", words: ["ui design", "ux design", "user interface", "user experience", "figma", "wireframe", "design system", "prototype"] },
  { tag: "Inspiration", words: ["inspiration", "moodboard", "mood board", "awwwards", "dribbble", "behance", "pinterest", "showcase", "gallery"] },
  { tag: "Photography", words: ["photography", "photographer", "photo", "photos", "lightroom"] },
  { tag: "Art", words: ["illustration", "illustrator", "artwork", "artist", "painting", "sculpture"] },
  { tag: "Article", words: ["article", "blog", "essay", "newsletter", "substack", "medium"] },
  { tag: "News", words: ["news", "breaking", "headlines", "journalism", "press release"] },
  { tag: "Research", words: ["research", "journal", "whitepaper", "white paper", "abstract", "arxiv", "findings", "survey"] },
  { tag: "Learning", words: ["course", "courses", "tutorial", "tutorials", "lesson", "lessons", "how to", "guide", "learn", "bootcamp", "lecture"] },
  { tag: "Code", words: ["github", "gitlab", "open source", "javascript", "python", "typescript", "api", "sdk", "developer", "developers", "stack overflow", "documentation", "npm", "repository", "programming"] },
  { tag: "AI", words: ["artificial intelligence", "machine learning", "chatgpt", "llm", "openai", "anthropic", "generative", "ai", "gpt"] },
  { tag: "Tool", words: ["generator", "converter", "calculator", "extension", "plugin", "saas", "dashboard", "template", "templates"] },
  { tag: "Productivity", words: ["productivity", "notion", "todo", "to-do", "planner", "calendar", "workflow", "automation"] },
  { tag: "Spreadsheet", words: ["spreadsheet", "google sheets", "excel", "xlsx"] },
  { tag: "Document", words: ["google docs", "google doc", "pdf", "word document", "slides", "presentation", "deck"] },
  { tag: "Shopping", words: ["shop", "buy", "cart", "checkout", "sale", "discount", "amazon", "flipkart", "myntra", "deal", "deals"] },
  { tag: "Fashion", words: ["fashion", "clothing", "outfit", "streetwear", "apparel", "sneakers", "jewellery", "jewelry"] },
  { tag: "Video", words: ["youtube", "video", "videos", "vimeo", "film", "movie", "trailer", "netflix"] },
  { tag: "Music", words: ["music", "spotify", "playlist", "album", "soundcloud", "song", "songs", "lyrics"] },
  { tag: "Podcast", words: ["podcast", "podcasts", "episode", "episodes"] },
  { tag: "Recipe", words: ["recipe", "recipes", "cooking", "ingredients", "bake", "baking", "cuisine", "dinner", "breakfast"] },
  { tag: "Travel", words: ["travel", "hotel", "hotels", "flight", "flights", "itinerary", "airbnb", "booking", "destination", "tourism", "trip"] },
  { tag: "Jobs", words: ["jobs", "careers", "career", "hiring", "linkedin", "resume", "internship", "vacancy", "job opening"] },
  { tag: "Finance", words: ["finance", "investing", "investment", "stocks", "mutual fund", "crypto", "bitcoin", "banking", "budget", "tax", "loan"] },
  { tag: "Startup", words: ["startup", "startups", "founder", "founders", "venture", "fundraising", "product hunt", "y combinator"] },
  { tag: "Marketing", words: ["marketing", "seo", "branding strategy", "growth", "advertising", "copywriting", "social media", "campaign"] },
  { tag: "Health", words: ["health", "fitness", "workout", "nutrition", "wellness", "yoga", "meditation", "mental health"] },
  { tag: "Education", words: ["university", "college", "school", "scholarship", "admissions", "syllabus", "curriculum"] },
  { tag: "Events", words: ["event", "events", "conference", "meetup", "webinar", "workshop", "tickets", "summit"] },
  { tag: "Games", words: ["game", "games", "gaming", "steam", "playstation", "esports"] },
  { tag: "Sports", words: ["cricket", "football", "soccer", "nba", "tennis", "formula 1", "sports", "match", "league"] },
  { tag: "Real Estate", words: ["real estate", "apartment", "apartments", "property", "rent", "rental", "housing"] },
  { tag: "Reference", words: ["wikipedia", "encyclopedia", "dictionary", "glossary", "wiki"] }
];

// Hostnames that tell us the category on their own.
const HOST_TAGS = [
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)vimeo\.com$/, "Video"],
  [/(^|\.)github\.com$|(^|\.)gitlab\.com$|stackoverflow\.com$/, "Code"],
  [/docs\.google\.com$/, "Document"],
  [/(^|\.)linkedin\.com$/, "Jobs"],
  [/(^|\.)spotify\.com$|soundcloud\.com$/, "Music"],
  [/(^|\.)figma\.com$|dribbble\.com$|behance\.net$|awwwards\.com$/, "Inspiration"],
  [/(^|\.)wikipedia\.org$/, "Reference"],
  [/(^|\.)medium\.com$|substack\.com$/, "Article"],
  [/(^|\.)amazon\.[a-z.]+$|flipkart\.com$|myntra\.com$/, "Shopping"],
  [/(^|\.)arxiv\.org$/, "Research"]
];

// Part 2: keywords taken from the page itself (title, headings, meta keywords, description).
const STOP_WORDS = new Set(("a about above after again all also am an and any are as at be because been before being below between both but by can " +
  "could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just " +
  "me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then " +
  "there these they this those through to too under until up us very was we were what when where which while who whom why will with would you your " +
  "yours get gets got make makes made use used using new best top").split(" "));
const GENERIC_WORDS = new Set(("home homepage official website site web page pages welcome login log sign signin signup sign-in sign-up menu " +
  "contact about us privacy policy terms cookie cookies search skip content main navigation click here read more learn more free online " +
  "app apps www com org net co index untitled loading just a moment").split(" "));

function _esc(w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function _has(hay, w) {
  return new RegExp("(^|[^a-z0-9])" + _esc(w) + "(s|es)?([^a-z0-9]|$)").test(hay);
}
function _tokens(text) {
  return (text || "").toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9+#]+/).filter(Boolean);
}
function _titleCase(phrase) {
  const p = phrase.trim().replace(/\s+/g, " ");
  if (/[A-Z]/.test(p.slice(1))) return p; // already styled, like "UI Design" or "iPhone"
  return p.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
function _isGeneric(token) {
  return GENERIC_WORDS.has(token) || /^\d+$/.test(token);
}
function _brandNames(info) {
  const names = new Set();
  const add = (n) => { const k = (n || "").toLowerCase().replace(/[^a-z0-9]/g, ""); if (k.length > 2) names.add(k); };
  add(info.siteName);
  (info.siteName || "").split(/[^A-Za-z0-9]+/).forEach(add);
  try {
    const host = new URL(info.url).hostname.replace(/^www\./, "").split(".");
    const label = host.length > 1 ? host[host.length - 2] : host[0];
    add(label);
    label.split("-").forEach(add);
  } catch (e) {}
  return names;
}

function detectTags(input) {
  const info = typeof input === "string" ? { title: input } : (input || {});
  const title = info.title || "";
  const h1 = (info.h1 || []).join(" . ");
  const h2 = (info.h2 || []).join(" . ");
  const desc = info.description || "";
  const kw = (info.keywords || "") + " " + (info.articleTags || []).join(" ");
  const urlText = (info.url || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[\/_\-.]+/g, " ");

  // --- categories
  const fields = [
    [title + " . " + (info.ogTitle || ""), 3],
    [h1, 3],
    [kw, 2],
    [desc, 2],
    [h2, 1],
    [urlText, 1]
  ].map(([t, w]) => [t.toLowerCase(), w]);
  const scored = [];
  for (const rule of TAG_RULES) {
    let score = 0;
    for (const w of rule.words) {
      for (const [hay, weight] of fields) if (hay && _has(hay, w)) score += weight * (w.includes(" ") ? 1.5 : 1);
    }
    if (score >= 2) scored.push({ tag: rule.tag, score });
  }
  try {
    const host = new URL(info.url).hostname;
    for (const [re, tag] of HOST_TAGS) {
      if (re.test(host)) {
        const hit = scored.find((s) => s.tag === tag);
        if (hit) hit.score += 6; else scored.push({ tag, score: 6 });
      }
    }
  } catch (e) {}
  scored.sort((a, b) => b.score - a.score);
  const cats = scored.slice(0, 2).map((s) => s.tag);

  // --- keywords
  const brands = _brandNames(info);
  const cand = new Map(); // lowercase phrase -> { text, score }
  const bump = (text, score) => {
    const clean = text.trim().replace(/\s+/g, " ");
    if (!clean || clean.length > 28 || clean.length < 3 || /[\/@]/.test(clean)) return;
    const key = clean.toLowerCase();
    const cur = cand.get(key);
    if (cur) cur.score += score; else cand.set(key, { text: _titleCase(clean), score });
  };
  const phraseOk = (p) => {
    const toks = _tokens(p);
    if (!toks.length || toks.length > 4) return false;
    if (toks.every((t) => STOP_WORDS.has(t) || _isGeneric(t))) return false;
    if (STOP_WORDS.has(toks[0]) || STOP_WORDS.has(toks[toks.length - 1])) return false;
    if (_isGeneric(toks[0]) && toks.length === 1) return false;
    return true;
  };
  const isBrand = (p) => {
    const key = p.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key) return false;
    const first = (p.toLowerCase().match(/[a-z0-9]+/) || [""])[0];
    for (const b of brands) {
      if (key === b || (b.length >= 4 && key.includes(b)) || (key.length >= 4 && b.includes(key))) return true;
      if (first.length >= 4 && b.startsWith(first)) return true;
    }
    return false;
  };

  // "Page name | Site name": the short tail is usually the site, not the topic
  const tailParts = title.split(/\s[|–—·•-]\s/).map((x) => x.trim()).filter(Boolean);
  if (tailParts.length >= 2) {
    const tail = tailParts[tailParts.length - 1];
    const headWords = tailParts[0].split(/\s+/).length;
    if (tail.split(/\s+/).length <= 3 && headWords >= 2) {
      brands.add(tail.toLowerCase().replace(/[^a-z0-9]/g, ""));
      tail.split(/[^A-Za-z0-9]+/).forEach((w) => { if (w.length > 2) brands.add(w.toLowerCase()); });
    }
  }

  // 1) what the site says about itself: meta keywords and article tags
  const metaKeys = ((info.keywords || "").split(/[,;|]/).concat(info.articleTags || []))
    .map((k) => k.trim()).filter((k) => k && phraseOk(k) && !isBrand(k));
  metaKeys.slice(0, 6).forEach((k, i) => bump(k, 9 - Math.min(i, 4)));

  // 2) title and heading segments, like "Lumen and Co: Brand Portfolio" -> "Brand Portfolio"
  const segSplit = /\s[|:·•–—-]\s|[|:·•–—,]|\s-\s/;
  const segments = (t, w) => {
    const parts = (t || "").split(segSplit).map((p) => p.trim()).filter(Boolean);
    const keep = parts.filter((p) => !isBrand(p));
    (keep.length ? keep : parts).forEach((p) => { if (phraseOk(p) && p.split(/\s+/).length <= 4) bump(p, w); });
  };
  segments(title, 7);
  segments(info.ogTitle, 3);
  (info.h1 || []).forEach((h) => segments(h, 5));

  // names of places and things written with a capital mid-sentence ("... in Goa")
  for (const t of [title, (info.h1 || [])[0] || ""]) {
    const words = (t || "").split(/[^A-Za-z0-9']+/).filter(Boolean);
    const caps = words.filter((w) => /^[A-Z]/.test(w)).length;
    if (words.length < 3 || caps / words.length >= 0.5) continue;
    words.forEach((w, i) => {
      const low = w.toLowerCase();
      if (i > 0 && /^[A-Z][a-z]{2,}/.test(w) && !STOP_WORDS.has(low) && !_isGeneric(low) && !isBrand(w)) bump(w, 5);
    });
  }

  // 3) the words that really repeat: pairs first, then single words
  const weighted = [[title, 3], [info.ogTitle, 2], [h1, 3], [h2, 1.5], [desc, 2], [info.keywords, 2]];
  const uni = new Map();
  const bi = new Map();
  for (const [text, w] of weighted) {
    for (const chunk of (text || "").split(/[.,;:!?()\[\]|·•–—\n]| - /)) {
      const toks = _tokens(chunk);
      for (let i = 0; i < toks.length; i++) {
        const t = toks[i];
        const ok = (x) => x.length > 2 && !STOP_WORDS.has(x) && !_isGeneric(x) && !brands.has(x);
        if (ok(t)) uni.set(t, (uni.get(t) || 0) + w);
        if (i + 1 < toks.length && ok(t) && ok(toks[i + 1])) {
          const pair = t + " " + toks[i + 1];
          bi.set(pair, (bi.get(pair) || 0) + w);
        }
      }
    }
  }
  [...bi.entries()].filter(([, v]) => v >= 4).forEach(([k, v]) => bump(k, v));
  [...uni.entries()].filter(([k, v]) => v >= 4 && k.length >= 4).forEach(([k, v]) => bump(k, v * 0.6));

  // --- pick the best, without repeating ourselves
  const catKeys = new Set(cats.map((c) => c.toLowerCase()));
  const prefixes = (txt) => _tokens(txt).map((t) => t.slice(0, 4));
  const rank = (c) => c.score * (c.text.includes(" ") ? 1.8 : 1); // full phrases beat loose words
  const ranked = [...cand.values()].sort((a, b) => rank(b) - rank(a));
  const picked = [];
  for (const c of ranked) {
    const low = c.text.toLowerCase();
    if (catKeys.has(low)) continue;
    // skip a single word that is already inside a chosen phrase (and the reverse)
    if (cats.some((p) => p.toLowerCase().includes(low))) continue;
    if (picked.some((p) => { const pl = p.toLowerCase(); return pl.includes(low) || low.includes(pl); })) continue;
    const mine = prefixes(c.text);
    if (mine.length === 1 && picked.some((p) => prefixes(p).includes(mine[0]))) continue;
    picked.push(c.text);
    if (picked.length >= 4) break;
  }
  // a category is redundant when a picked phrase already contains it ("Typography" vs "Typography Archive")
  const keepCats = cats.filter((c) => !picked.some((p) => p.toLowerCase().startsWith(c.toLowerCase() + " ")));
  const all = keepCats.concat(picked).slice(0, 6);
  return all.length ? all : ["Website"];
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
