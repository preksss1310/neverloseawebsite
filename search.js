const qEl = document.getElementById("q");
const resultsEl = document.getElementById("results");
let allSites = [];
let allFolders = [];
let activeFolder = ""; // empty means all folders
let editingId = null;   // site being edited
let draft = null;       // unsaved edits for that site
let folderMode = "";    // "", "rename" or "delete"
const REASONS = ["Steal this vibe", "Visual Reference", "Rabbit Hole"];

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
      const memoryHtml = editingId === s.id ? editorHtml(s) : (memory.length ? '<div class="memory">' + memory.join("") + "</div>" : "");

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
        '<div class="right"><button class="edit" data-id="' + s.id + '">' + (editingId === s.id ? "Editing" : "Edit") + '</button><button class="del" data-id="' + s.id + '">Delete</button>' +
        '<a class="open" href="' + escapeHtml(s.url) + '" target="_blank">Open Website ↗</a></div>' +
        "</div></div>"
      );
    })
    .join("");

  resultsEl.querySelectorAll(".edit").forEach((b) => {
    b.addEventListener("click", () => startEdit(Number(b.dataset.id)));
  });
  wireEditor();

  resultsEl.querySelectorAll(".del").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = Number(b.dataset.id);
      if (editingId === id) { editingId = null; draft = null; }
      allSites = allSites.filter((s) => s.id !== id);
      await setSites(allSites);
      renderFolders();
      run();
    });
  });
}

function editorHtml(s) {
  const tagPool = Array.from(new Set(
    detectTags({ title: s.title, url: s.url, description: s.description }).concat(draft.tags)
  ));
  const tagChips = tagPool
    .map((t) => '<button class="echip' + (draft.tags.includes(t) ? " on" : "") + '" data-tag="' + escapeHtml(t) + '">' + escapeHtml(t) + (draft.tags.includes(t) ? " ⭐" : "") + "</button>")
    .join("");
  const reasonChips = REASONS
    .map((r) => '<button class="echip' + (draft.reason === r ? " on" : "") + '" data-reason="' + escapeHtml(r) + '">' + escapeHtml(r) + "</button>")
    .join("");
  const opts = ['<option value="">No folder</option>']
    .concat(allFolders.map((f) => '<option value="' + escapeHtml(f) + '"' + (draft.folder === f ? " selected" : "") + ">" + escapeHtml(f) + "</option>"))
    .join("");
  return (
    '<div class="editor">' +
    '<div class="elabel">HOW DO YOU WANNA REMEMBER IT?</div><div class="echips">' + reasonChips + "</div>" +
    '<input class="einput" id="eNote" type="text" maxlength="200" placeholder="Your note" value="' + escapeHtml(draft.note) + '" />' +
    '<div class="elabel">TAGS</div><div class="echips">' + tagChips + "</div>" +
    '<div class="erow"><input class="einput" id="eNewTag" type="text" maxlength="24" placeholder="Add your own tag" />' +
    '<button class="ebtn" id="eAddTag">Add</button></div>' +
    '<div class="elabel">FOLDER</div>' +
    '<select class="einput" id="eFolder">' + opts + '</select>' +
    '<div class="erow end"><button class="ebtn ghost" id="eCancel">Cancel</button><button class="ebtn dark" id="eSave">Save changes</button></div>' +
    "</div>"
  );
}

function startEdit(id) {
  const s = allSites.find((x) => x.id === id);
  if (!s) return;
  editingId = id;
  draft = {
    note: s.note || "",
    reason: s.reason || "",
    tags: (s.tags || []).slice(),
    folder: s.folder || ""
  };
  run();
}

function stopEdit() {
  editingId = null;
  draft = null;
  run();
}

function wireEditor() {
  if (editingId === null) return;
  const note = document.getElementById("eNote");
  if (!note) return;
  note.addEventListener("input", () => (draft.note = note.value));
  document.getElementById("eFolder").addEventListener("change", (e) => (draft.folder = e.target.value));
  resultsEl.querySelectorAll(".echip[data-reason]").forEach((b) =>
    b.addEventListener("click", () => {
      draft.reason = draft.reason === b.dataset.reason ? "" : b.dataset.reason;
      run();
    })
  );
  resultsEl.querySelectorAll(".echip[data-tag]").forEach((b) =>
    b.addEventListener("click", () => {
      const t = b.dataset.tag;
      draft.tags = draft.tags.includes(t) ? draft.tags.filter((x) => x !== t) : draft.tags.concat(t);
      run();
    })
  );
  const addTag = () => {
    const input = document.getElementById("eNewTag");
    const t = input.value.trim().slice(0, 24);
    if (!t) return;
    if (!draft.tags.some((x) => x.toLowerCase() === t.toLowerCase())) draft.tags.push(t);
    run();
  };
  document.getElementById("eAddTag").addEventListener("click", addTag);
  document.getElementById("eNewTag").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTag();
  });
  document.getElementById("eCancel").addEventListener("click", stopEdit);
  document.getElementById("eSave").addEventListener("click", async () => {
    const idx = allSites.findIndex((x) => x.id === editingId);
    if (idx >= 0) {
      allSites[idx].note = (document.getElementById("eNote").value || "").trim();
      allSites[idx].reason = draft.reason;
      allSites[idx].tags = draft.tags;
      allSites[idx].folder = draft.folder;
      await setSites(allSites);
    }
    editingId = null;
    draft = null;
    renderFolders();
    run();
  });
}

async function renameFolder(oldName, rawNew) {
  const name = (rawNew || "").trim().slice(0, 30);
  if (!name || name === oldName) {
    folderMode = "";
    renderFolders();
    return;
  }
  const match = allFolders.find((f) => f.toLowerCase() === name.toLowerCase() && f !== oldName);
  const finalName = match || name;
  allFolders = allFolders.filter((f) => f !== oldName);
  if (!match) allFolders.push(finalName);
  allSites.forEach((s) => {
    if (s.folder === oldName) s.folder = finalName;
  });
  await setFolders(allFolders);
  await setSites(allSites);
  activeFolder = finalName;
  folderMode = "";
  renderFolders();
  run();
}

async function deleteFolder(name) {
  allFolders = allFolders.filter((f) => f !== name);
  allSites.forEach((s) => {
    if (s.folder === name) s.folder = "";
  });
  await setFolders(allFolders);
  await setSites(allSites);
  activeFolder = "";
  folderMode = "";
  renderFolders();
  run();
}

function folderBarHtml() {
  if (!activeFolder) return "";
  const n = escapeHtml(activeFolder);
  if (folderMode === "rename") {
    return '<div class="fbar"><input class="einput" id="fRename" maxlength="30" value="' + n + '" />' +
      '<button class="ebtn dark" id="fRenameSave">Save</button><button class="ebtn ghost" id="fCancel">Cancel</button></div>';
  }
  if (folderMode === "delete") {
    return '<div class="fbar"><span>Delete the folder “' + n + '”? Your websites stay saved, just not in a folder.</span>' +
      '<button class="ebtn danger" id="fDeleteYes">Yes, delete folder</button><button class="ebtn ghost" id="fCancel">Cancel</button></div>';
  }
  return '<div class="fbar"><span>\u{1F4C1} ' + n + '</span><button class="ebtn ghost" id="fRenameBtn">Rename</button><button class="ebtn ghost" id="fDeleteBtn">Delete folder</button></div>';
}

function wireFolderBar() {
  const on = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  };
  on("fRenameBtn", () => { folderMode = "rename"; renderFolders(); document.getElementById("fRename").focus(); });
  on("fDeleteBtn", () => { folderMode = "delete"; renderFolders(); });
  on("fCancel", () => { folderMode = ""; renderFolders(); });
  on("fRenameSave", () => renameFolder(activeFolder, document.getElementById("fRename").value));
  on("fDeleteYes", () => deleteFolder(activeFolder));
  const r = document.getElementById("fRename");
  if (r) r.addEventListener("keydown", (e) => { if (e.key === "Enter") renameFolder(activeFolder, r.value); });
}

function renderFolders() {
  const box = document.getElementById("folders");
  const bar = document.getElementById("folderBar");
  if (!allFolders.length) {
    box.innerHTML = "";
    bar.innerHTML = "";
    return;
  }
  bar.innerHTML = folderBarHtml();
  wireFolderBar();
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
      folderMode = "";
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
