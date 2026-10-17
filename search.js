const qEl = document.getElementById("q");
const resultsEl = document.getElementById("results");
let allSites = [];
let allFolders = [];
let activeFolder = ""; // empty means all folders

const STOP = new Set(["find", "the", "a", "an", "of", "for", "my", "that", "this", "website", "site", "page", "i", "saved", "show", "me", "where", "is", "was"]);

function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w));
}

function searchableText(s) {
  return [s.title, s.domain, s.url, s.note, s.reason, s.folder, (s.tags || []).join(" "), s.description]
    .join(" ")
    .toLowerCase();
}

function score(site, tokens) {
  if (!tokens.length) return 100;
  const hay = searchableText(site);
  let hit = 0;
  for (const t of tokens) {
    if (hay.includes(t)) hit += 1;
  }
  return Math.round((hit / tokens.length) * 100);
}

function render(list, tokens, ms) {
  if (!allSites.length) {
    resultsEl.innerHTML =
      '<div class="empty">Nothing saved yet.<br>Open any website, click the extension, and hit Lock in Memory.</div>';
    return;
  }
  if (!list.length) {
    resultsEl.innerHTML = activeFolder && !tokens.length
      ? '<div class="empty">This folder is empty.</div>'
      : '<div class="empty">No matches. Try different words.</div>';
    return;
  }

  resultsEl.innerHTML = list
    .map((r) => {
      const s = r.site;
      const memory = [];
      if (s.folder) memory.push('<span class="tag">\u{1F4C1} ' + escapeHtml(s.folder) + "</span>");
      if (s.reason) memory.push("<span>\u{1F4A1} “" + escapeHtml(s.reason) + "”</span>");
      if (s.note) memory.push("<span>" + escapeHtml(s.note) + "</span>");
      (s.tags || []).forEach((t) => memory.push('<span class="tag">⭐ ' + escapeHtml(t) + "</span>"));
      const memoryHtml = memory.length ? '<div class="memory">' + memory.join("") + "</div>" : "";

      return (
        '<div class="result">' +
        '<div class="body">' +
        '<div class="found"><i></i>Found in ' + ms + 's • ' + r.score + '% Match</div>' +
        '<div class="titlerow"><h2>' + escapeHtml(s.title) + '</h2>' +
        '<a class="dpill" href="' + escapeHtml(s.url) + '" target="_blank">' + escapeHtml(s.domain) + ' ↗</a></div>' +
        memoryHtml +
        "</div>" +
        '<div class="bottom">' +
        '<div class="left"><span>' + timeAgo(s.savedAt) + '</span><span class="match">' + r.score + '% Match</span></div>' +
        '<div class="right"><button class="del" data-id="' + s.id + '">Delete</button>' +
        '<a class="open" href="' + escapeHtml(s.url) + '" target="_blank">Open Website ↗</a></div>' +
        "</div></div>"
      );
    })
    .join("");

  resultsEl.querySelectorAll(".del").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = Number(b.dataset.id);
      allSites = allSites.filter((s) => s.id !== id);
      await setSites(allSites);
      renderFolders();
      run();
    });
  });
}

function renderFolders() {
  const box = document.getElementById("folders");
  if (!allFolders.length) {
    box.innerHTML = "";
    return;
  }
  const count = (name) => allSites.filter((s) => s.folder === name).length;
  const chips = [{ name: "", label: "All", n: allSites.length }].concat(
    allFolders.map((f) => ({ name: f, label: "\u{1F4C1} " + f, n: count(f) }))
  );
  box.innerHTML = chips
    .map(
      (c) =>
        '<button class="fchip' + (c.name === activeFolder ? " on" : "") + '" data-folder="' +
        escapeHtml(c.name) + '">' + escapeHtml(c.label) + "<small>" + c.n + "</small></button>"
    )
    .join("");
  box.querySelectorAll(".fchip").forEach((b) => {
    b.addEventListener("click", () => {
      activeFolder = b.dataset.folder;
      renderFolders();
      run();
    });
  });
}

function run() {
  const start = performance.now();
  const tokens = tokenize(qEl.value);
  const pool = activeFolder ? allSites.filter((s) => s.folder === activeFolder) : allSites;
  let list = pool.map((site) => ({ site, score: score(site, tokens) }));
  if (tokens.length) list = list.filter((r) => r.score > 0);
  list.sort((a, b) => b.score - a.score || b.site.savedAt - a.site.savedAt);
  const ms = Math.max((performance.now() - start) / 1000, 0.001).toFixed(2);
  render(list, tokens, ms);
}

async function init() {
  allSites = await getSites();
  allFolders = await getFolders();
  renderFolders();
  run();
}

qEl.addEventListener("input", run);
init();
