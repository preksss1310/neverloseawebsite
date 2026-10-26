let current = { url: "", title: "", description: "" };
let selectedTags = new Set();
let selectedReason = "";
let savedEntry = null;

const $ = (id) => document.getElementById(id);

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
    $("pageTitle").textContent = "Open a website first";
    $("statusText").textContent = "No page to save";
    $("lockBtn").disabled = true;
    return;
  }

  current.url = tab.url;
  current.title = tab.title || cleanDomain(tab.url);

  // Read a few things from the page (only after you click the icon) so the
  // suggested tags match what the page is really about. Nothing leaves your device.
  current.info = {};
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const meta = (sel) => {
          const e = document.querySelector(sel);
          return e ? (e.content || "").trim() : "";
        };
        const txt = (e) => (e.innerText || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160);
        return {
          description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
          keywords: meta('meta[name="keywords"]'),
          siteName: meta('meta[property="og:site_name"]'),
          ogTitle: meta('meta[property="og:title"]'),
          articleTags: Array.from(document.querySelectorAll('meta[property="article:tag"]')).map((e) => e.content).slice(0, 6),
          h1: Array.from(document.querySelectorAll("h1")).slice(0, 2).map(txt),
          h2: Array.from(document.querySelectorAll("h2")).slice(0, 6).map(txt)
        };
      }
    });
    const r = res && res.result;
    current.info = typeof r === "string" ? { description: r } : (r || {});
  } catch (e) {
    current.info = {};
  }
  current.description = current.info.description || "";

  $("pageTitle").textContent = current.title;
  $("pageDomain").textContent = cleanDomain(current.url);

  // Already saved?
  const sites = await getSites();
  const existingIdx = sites.findIndex((s) => normalizeUrl(s.url) === normalizeUrl(current.url));
  const existing = existingIdx >= 0 ? sites[existingIdx] : undefined;

  // If the page was renamed since it was saved, refresh the saved name.
  let renamed = false;
  if (existing && existing.title !== current.title) {
    sites[existingIdx].title = current.title;
    sites[existingIdx].url = current.url;
    await setSites(sites);
    renamed = true;
  }

  $("footText").textContent =
    sites.length + (sites.length === 1 ? " website" : " websites") + " saved on your device";

  if (existing) {
    $("statusText").textContent = renamed ? "Already in memory • name updated" : "Already in memory";
    $("lockBtn").textContent = "Update Memory \u{1F4CC}";
    $("note").value = existing.note || "";
    selectedReason = existing.reason || "";
    selectedTags = new Set(existing.tags || []);
  }

  const detected = detectTags(Object.assign({}, current.info, { title: current.title, url: current.url }));
  if (!existing) selectedTags = new Set([detected[0]]);
  const all = Array.from(new Set([...detected, ...selectedTags]));
  renderTags(all);
  renderReasons();
}

function renderTags(tags) {
  const box = $("tagChips");
  box.innerHTML = "";
  tags.forEach((t) => {
    const b = document.createElement("button");
    b.className = "chip" + (selectedTags.has(t) ? " on" : "");
    b.textContent = t + (selectedTags.has(t) ? " ⭐" : "");
    b.addEventListener("click", () => {
      if (selectedTags.has(t)) selectedTags.delete(t);
      else selectedTags.add(t);
      renderTags(tags);
    });
    box.appendChild(b);
  });
}

function renderReasons() {
  document.querySelectorAll(".chip.reason").forEach((b) => {
    b.classList.toggle("on", b.dataset.reason === selectedReason);
    b.onclick = () => {
      selectedReason = selectedReason === b.dataset.reason ? "" : b.dataset.reason;
      renderReasons();
    };
  });
}

async function save() {
  const sites = await getSites();
  const entry = {
    id: Date.now(),
    url: current.url,
    title: current.title,
    domain: cleanDomain(current.url),
    description: current.description,
    tags: Array.from(selectedTags),
    reason: selectedReason,
    note: $("note").value.trim(),
    folder: "",
    savedAt: Date.now()
  };
  const idx = sites.findIndex((s) => normalizeUrl(s.url) === normalizeUrl(entry.url));
  if (idx >= 0) {
    entry.id = sites[idx].id;
    entry.savedAt = sites[idx].savedAt;
    entry.folder = sites[idx].folder || "";
    sites[idx] = entry;
  } else {
    sites.unshift(entry);
  }
  await setSites(sites);

  showFolderView(entry);
}

// Step 2 after saving: put the website in a folder.
async function showFolderView(entry) {
  savedEntry = entry;
  $("mainView").hidden = true;
  $("folderView").hidden = false;
  $("statusText").textContent = "Locked in";
  renderFolderChips(await getFolders());
  $("newFolder").focus();
}

function renderFolderChips(folders) {
  const box = $("folderChips");
  box.innerHTML = "";
  $("folderHint").textContent = folders.length ? "" : "No folders yet. Make your first one below.";
  folders.forEach((name) => {
    const b = document.createElement("button");
    b.className = "chip folder" + (savedEntry.folder === name ? " on" : "");
    b.textContent = "\u{1F4C1} " + name;
    b.addEventListener("click", () => assignFolder(name));
    box.appendChild(b);
  });
}

async function assignFolder(rawName) {
  const name = (rawName || "").trim().slice(0, 30);
  if (!name) return;

  const folders = await getFolders();
  const match = folders.find((f) => f.toLowerCase() === name.toLowerCase());
  const finalName = match || name;
  if (!match) {
    folders.push(finalName);
    await setFolders(folders);
  }

  const sites = await getSites();
  const idx = sites.findIndex((s) => s.id === savedEntry.id);
  if (idx >= 0) {
    sites[idx].folder = finalName;
    await setSites(sites);
  }

  $("folderTitle").textContent = "Added to \u{1F4C1} " + finalName;
  $("folderSub").textContent = "All set. You will never lose it.";
  $("folderChoices").hidden = true;
  $("folderActions").hidden = true;
  setTimeout(() => window.close(), 1000);
}

$("lockBtn").addEventListener("click", save);
$("addFolderBtn").addEventListener("click", () => assignFolder($("newFolder").value));
$("newFolder").addEventListener("keydown", (e) => {
  if (e.key === "Enter") assignFolder($("newFolder").value);
});
$("skipFolder").addEventListener("click", (e) => {
  e.preventDefault();
  window.close();
});
$("searchLink").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("search.html") });
});

init();
