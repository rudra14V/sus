const state = {
  user: JSON.parse(localStorage.getItem("wm_user") || "null"),
  data: null,
  route: location.hash.replace("#", "") || "dashboard",
  chatTo: null,
  menuOpen: true,
  sidebarOpen: false,
  selectedSubject: "OS",
  selectedFolderId: "",
  selectedVideoSubject: "OS",
  selectedVideoFolderId: ""
};

const app = document.querySelector("#app");
const statuses = ["read", "done", "seen", "ignore", "not required"];

function api(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.user ? { "x-user-id": state.user.id } : {}),
      ...(options.headers || {})
    }
  }).then(async response => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed");
    return payload;
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "No time set";
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function setRoute(route) {
  state.route = route;
  location.hash = route;
  render();
}

async function loadData() {
  state.data = await api("/api/bootstrap");
}

function logout() {
  localStorage.removeItem("wm_user");
  state.user = null;
  state.data = null;
  renderLogin();
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-night">
      <section class="login-shell">
        <form class="login-card" id="loginForm">
          <section class="login-fields">
            <span class="eyebrow">Work Manager</span>
            <h2>Sign in to your night shift</h2>
            <p class="muted">Verified IDs are issued by the administrator.</p>
            <label class="field">
              Verified ID
              <input name="userId" id="loginUserId" autocomplete="username" placeholder="Enter verified ID" required />
            </label>
            <label class="field">
              Password
              <input name="password" type="password" autocomplete="current-password" placeholder="Enter password" required />
            </label>
            <p class="error" id="loginError"></p>
            <button class="primary" type="submit">Login</button>
          </section>
        </form>
      </section>
    </main>
  `;

  document.querySelector("#loginUserId").addEventListener("input", event => {
    const form = document.querySelector("#loginForm");
    const value = event.target.value.trim().toLowerCase();
    form.classList.remove("point-girl", "point-boy");
    if ("cypher".startsWith(value) && value) {
      form.classList.add("point-girl");
    }
    if ("jaguar".startsWith(value) && value) {
      form.classList.add("point-boy");
    }
  });

  document.querySelector("#loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const payload = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ userId: form.get("userId"), password: form.get("password") })
      });
      state.user = payload.user;
      localStorage.setItem("wm_user", JSON.stringify(payload.user));
      await loadData();
      render();
    } catch (error) {
      document.querySelector("#loginError").textContent = error.message;
    }
  });
}

function layout(content) {
  const items = [
    ["dashboard", "Dashboard"],
    ["notes", "Notes & Lectures"],
    ["announcements", "Announcements"],
    ["sticky", "Sticky Notes"],
    ["meetings", "Meetings"],
    ["chat", "Chat Room"]
  ];

  app.innerHTML = `
    <div class="app-shell ${state.sidebarOpen ? "sidebar-open" : "sidebar-closed"}">
      <button class="floating-hamburger" data-sidebar-toggle type="button" aria-label="Open sidebar menu">
        <span></span>
        <span></span>
        <span></span>
      </button>
      ${state.sidebarOpen ? `<button class="sidebar-backdrop" data-sidebar-toggle type="button" aria-label="Close sidebar menu"></button>` : ""}
      <aside class="sidebar ${state.sidebarOpen ? "open" : ""}">
        <div class="brand-row">
          <div class="brand">Work Manager</div>
          <button class="hamburger" data-sidebar-toggle type="button" aria-label="Close sidebar menu">
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
        <div class="sidebar-body ${state.sidebarOpen ? "open" : ""}">
          <div class="user-chip">
            <strong>${escapeHtml(state.user.name)}</strong>
            <div class="muted">${escapeHtml(state.user.role)}</div>
          </div>
          <button class="dropdown-toggle ${state.menuOpen ? "open" : ""}" id="featureToggle" type="button">
            <span>Features</span>
            <span class="chevron">▾</span>
          </button>
          <div class="feature-menu ${state.menuOpen ? "open" : ""}">
            ${items.map(([route, label]) => `<button class="nav-button ${state.route === route ? "active" : ""}" data-route="${route}">${label}</button>`).join("")}
          </div>
          <div class="menu-title">Account</div>
          <button class="nav-button" id="logoutButton">Logout</button>
        </div>
      </aside>
      <main class="content">${content}</main>
    </div>
  `;

  document.querySelectorAll("[data-route]").forEach(button => {
    button.addEventListener("click", () => setRoute(button.dataset.route));
  });
  document.querySelectorAll("[data-sidebar-toggle]").forEach(button => button.addEventListener("click", () => {
    state.sidebarOpen = !state.sidebarOpen;
    render();
  }));
  document.querySelector("#featureToggle").addEventListener("click", () => {
    state.menuOpen = !state.menuOpen;
    render();
  });
  document.querySelector("#logoutButton").addEventListener("click", logout);
}

function pageTitle(title, subtitle = "", backRoute = "") {
  return `
    <div class="topbar">
      <div class="page-title">
        <h1>${title}</h1>
        ${subtitle ? `<p class="muted">${subtitle}</p>` : ""}
      </div>
      ${backRoute ? `<button class="ghost" data-route="${backRoute}">Back</button>` : ""}
    </div>
  `;
}

function renderDashboard() {
  const unread = state.data.inbox.filter(message => !message.read).length;
  layout(`
    ${pageTitle("Dashboard", "Today’s sticky notes, announcements, meetings, and message notifications.")}
    <section class="grid dashboard-grid">
      <div class="grid">
        <div class="panel">
          <div class="section-head"><h2>Sticky Notes</h2><button class="ghost" data-route="sticky">Add note</button></div>
          <div class="cards">
            ${state.data.stickyNotes.length ? state.data.stickyNotes.map(renderStickyCard).join("") : `<div class="empty">No sticky notes yet.</div>`}
          </div>
        </div>
        <div class="panel">
          <div class="section-head"><h2>Announcements</h2><button class="ghost" data-route="announcements">Write</button></div>
          <div class="list">${state.data.announcements.slice(0, 4).map(renderAnnouncement).join("")}</div>
        </div>
      </div>
      <div class="grid">
        <div class="panel">
          <div class="section-head"><h2>Meeting Reminders</h2><button class="ghost" data-route="meetings">Schedule</button></div>
          <div class="list">${state.data.meetings.slice(0, 5).map(renderMeeting).join("")}</div>
        </div>
        <div class="panel">
          <div class="section-head"><h2>Inbox</h2><span class="pill ${unread ? "amber" : "green"}">${unread} unread</span></div>
          <div class="list">${state.data.inbox.slice(0, 5).map(renderMessage).join("") || `<div class="empty">No messages.</div>`}</div>
        </div>
      </div>
    </section>
  `);
  bindCommonRoutes();
  bindStickyActions();
  bindMessageActions();
  bindAnnouncementDeletes();
  bindMeetingDeletes();
}

function renderStickyCard(note) {
  const active = note.statuses?.[state.user.id] || "";
  return `
    <article class="card">
      <div class="section-head compact">
        <h3>${escapeHtml(note.title)}</h3>
        ${note.ownerId === state.user.id ? `<button class="danger small-button" data-delete-sticky="${note.id}">Delete</button>` : ""}
      </div>
      <p>${escapeHtml(note.body)}</p>
      <span class="pill ${note.audience === "everyone" ? "green" : "amber"}">${note.audience}</span>
      <div class="status-row">
        ${statuses.map(status => `<button class="status-button ${active === status ? "active" : ""}" data-note="${note.id}" data-status="${status}">${status}</button>`).join("")}
      </div>
    </article>
  `;
}

function renderAnnouncement(item) {
  return `
    <article class="card">
      <div class="section-head compact">
        <h3>${escapeHtml(item.title)}</h3>
        ${item.authorId === state.user.id ? `<button class="danger small-button" data-delete-announcement="${item.id}">Delete</button>` : ""}
      </div>
      <p>${escapeHtml(item.body)}</p>
      <small class="muted">By ${escapeHtml(item.authorId)} • ${formatDate(item.createdAt)}</small>
    </article>
  `;
}

function renderMeeting(item) {
  return `
    <article class="card">
      <div class="section-head compact">
        <h3>${escapeHtml(item.title)}</h3>
        ${item.ownerId === state.user.id ? `<button class="danger small-button" data-delete-meeting="${item.id}">Delete</button>` : ""}
      </div>
      <p class="muted">${formatDate(item.scheduledAt)}</p>
      ${item.link ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noreferrer">Open meeting link</a>` : ""}
    </article>
  `;
}

function renderMessage(item) {
  return `
    <article class="card">
      <div class="section-head">
        <h3>${escapeHtml(item.subject)}</h3>
        <span class="pill ${item.read ? "green" : "amber"}">${item.read ? "read" : "unread"}</span>
      </div>
      <p>${escapeHtml(item.body)}</p>
      <small class="muted">From ${escapeHtml(item.from)} • ${formatDate(item.createdAt)}</small>
      ${item.read ? "" : `<div class="action-row"><button class="ghost" data-message="${item.id}">Mark read</button></div>`}
    </article>
  `;
}

function renderNotesPage() {
  layout(`
    ${pageTitle("Notes & Lectures", "Open notes and video lecture links from one place.", "dashboard")}
    <section class="resource-grid">
      <button class="resource-button" data-route="subjectNotes"><strong>Notes</strong><span class="muted">Open subject folders and saved files.</span></button>
      <button class="resource-button" data-route="videoLectures"><strong>Video Lectures</strong><span class="muted">Open subject folders and saved lecture links.</span></button>
    </section>
  `);
  bindCommonRoutes();
}

function renderSubjectNotesPage() {
  const subjects = ["OS", "RANAC", "OOPS", "DBMS", "ADSA", "CHESS"];
  const folders = (state.data.subjectFolders || []).filter(folder => folder.subject === state.selectedSubject);
  const folderExists = folders.some(folder => folder.id === state.selectedFolderId);
  if (state.selectedFolderId && !folderExists) state.selectedFolderId = "";
  const files = (state.data.subjectFiles || []).filter(file => {
    const fileFolderId = file.folderId || "";
    return file.subject === state.selectedSubject && fileFolderId === state.selectedFolderId;
  });
  const currentFolder = folders.find(folder => folder.id === state.selectedFolderId);
  const folderLabel = currentFolder ? currentFolder.name : "Main folder";
  layout(`
    ${pageTitle("Subject Notes", "Choose a subject, view stored files, or add PDFs, images, audio, video, and other media.", "notes")}
    <section class="subject-layout">
      <div class="panel">
        <div class="section-head">
          <h2>Subjects</h2>
        </div>
        <div class="subject-list">
          ${subjects.map(subject => `<button class="subject-button ${state.selectedSubject === subject ? "active" : ""}" data-subject="${subject}">${subject}</button>`).join("")}
        </div>
      </div>
      <div class="panel">
        <div class="section-head">
          <div>
            <h2>${escapeHtml(state.selectedSubject)} Files</h2>
            <p class="muted">${escapeHtml(folderLabel)} • ${files.length} stored item${files.length === 1 ? "" : "s"}</p>
          </div>
          <div class="action-row no-margin">
            <button class="ghost" id="openFolderForm">New folder</button>
            <button class="primary" id="openUpload">Add file</button>
          </div>
        </div>
        <form class="upload-form" id="folderForm">
          <label class="field">Folder name<input name="name" placeholder="Example: Unit 1" required /></label>
          <button class="primary" type="submit">Create folder</button>
        </form>
        <div class="folder-strip">
          <button class="folder-button ${state.selectedFolderId === "" ? "active" : ""}" data-folder="">Main folder</button>
          ${folders.map(renderFolderButton).join("")}
        </div>
        <form class="upload-form" id="uploadForm">
          <label class="field">Title<input name="title" placeholder="Optional display name" /></label>
          <label class="field">File<input name="file" type="file" accept="application/pdf,image/*,audio/*,video/*,*/*" required /></label>
          <button class="primary" type="submit">Save file</button>
        </form>
        <div class="file-grid">
          ${files.map(renderSubjectFile).join("") || `<div class="empty">No files stored in ${escapeHtml(state.selectedSubject)} yet.</div>`}
        </div>
      </div>
    </section>
  `);
  bindCommonRoutes();
  document.querySelectorAll("[data-subject]").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedSubject = button.dataset.subject;
      state.selectedFolderId = "";
      renderSubjectNotesPage();
    });
  });
  document.querySelectorAll("[data-folder]").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedFolderId = button.dataset.folder;
      renderSubjectNotesPage();
    });
  });
  document.querySelector("#openUpload").addEventListener("click", () => {
    document.querySelector("#uploadForm").classList.toggle("open");
  });
  document.querySelector("#openFolderForm").addEventListener("click", () => {
    document.querySelector("#folderForm").classList.toggle("open");
  });
  document.querySelectorAll("[data-delete-file]").forEach(button => {
    button.addEventListener("click", () => deleteSubjectFile(button.dataset.deleteFile));
  });
  document.querySelectorAll("[data-delete-folder]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      deleteSubjectFolder(button.dataset.deleteFolder);
    });
  });
  document.querySelector("#uploadForm").addEventListener("submit", submitSubjectFile);
  document.querySelector("#folderForm").addEventListener("submit", submitSubjectFolder);
}

function renderFolderButton(folder) {
  const canDelete = folder.ownerId === state.user.id;
  return `
    <button class="folder-button ${state.selectedFolderId === folder.id ? "active" : ""}" data-folder="${folder.id}">
      <span>${escapeHtml(folder.name)}</span>
      ${canDelete ? `<span class="folder-delete" data-delete-folder="${folder.id}" title="Delete folder">×</span>` : ""}
    </button>
  `;
}

function renderSubjectFile(file) {
  const fileUrl = file.url || file.dataUrl || "";
  const mimeType = file.mimeType || "application/octet-stream";
  const isImage = mimeType.startsWith("image/");
  const isAudio = mimeType.startsWith("audio/");
  const isVideo = mimeType.startsWith("video/");
  const preview = isImage
    ? `<img src="${escapeHtml(fileUrl)}" alt="${escapeHtml(file.title)}" />`
    : isAudio
      ? `<audio controls src="${escapeHtml(fileUrl)}"></audio>`
      : isVideo
        ? `<video controls src="${escapeHtml(fileUrl)}"></video>`
        : `<div class="file-icon">${escapeHtml((file.fileName.split(".").pop() || "file").toUpperCase())}</div>`;
  return `
    <article class="card file-card">
      <div class="file-preview">${preview}</div>
      <div class="section-head compact">
        <h3>${escapeHtml(file.title)}</h3>
        ${file.ownerId === state.user.id ? `<button class="danger small-button" data-delete-file="${file.id}">Delete</button>` : ""}
      </div>
      <p class="muted">${escapeHtml(file.fileName)} • ${formatDate(file.createdAt)}</p>
      <p class="muted">Uploaded by ${escapeHtml(file.ownerId)}</p>
      <a class="ghost file-open" href="${escapeHtml(fileUrl)}" target="_blank" rel="noreferrer">Open file</a>
    </article>
  `;
}

function renderVideoLecturesPage() {
  const subjects = ["OS", "RANAC", "OOPS", "DBMS", "ADSA", "CHESS"];
  const folders = (state.data.videoFolders || []).filter(folder => folder.subject === state.selectedVideoSubject);
  const folderExists = folders.some(folder => folder.id === state.selectedVideoFolderId);
  if (state.selectedVideoFolderId && !folderExists) state.selectedVideoFolderId = "";
  const links = (state.data.videoLinks || []).filter(link => {
    const linkFolderId = link.folderId || "";
    return link.subject === state.selectedVideoSubject && linkFolderId === state.selectedVideoFolderId;
  });
  const currentFolder = folders.find(folder => folder.id === state.selectedVideoFolderId);
  const folderLabel = currentFolder ? currentFolder.name : "Main folder";
  layout(`
    ${pageTitle("Video Lectures", "Choose a subject, create folders, and save lecture links.", "notes")}
    <section class="subject-layout">
      <div class="panel">
        <div class="section-head">
          <h2>Subjects</h2>
        </div>
        <div class="subject-list">
          ${subjects.map(subject => `<button class="subject-button ${state.selectedVideoSubject === subject ? "active" : ""}" data-video-subject="${subject}">${subject}</button>`).join("")}
        </div>
      </div>
      <div class="panel">
        <div class="section-head">
          <div>
            <h2>${escapeHtml(state.selectedVideoSubject)} Videos</h2>
            <p class="muted">${escapeHtml(folderLabel)} • ${links.length} stored link${links.length === 1 ? "" : "s"}</p>
          </div>
          <div class="action-row no-margin">
            <button class="ghost" id="openVideoFolderForm">New folder</button>
            <button class="primary" id="openVideoLinkForm">Add link</button>
          </div>
        </div>
        <form class="upload-form" id="videoFolderForm">
          <label class="field">Folder name<input name="name" placeholder="Example: Unit 1" required /></label>
          <button class="primary" type="submit">Create folder</button>
        </form>
        <div class="folder-strip">
          <button class="folder-button ${state.selectedVideoFolderId === "" ? "active" : ""}" data-video-folder="">Main folder</button>
          ${folders.map(renderVideoFolderButton).join("")}
        </div>
        <form class="upload-form" id="videoLinkForm">
          <label class="field">Title<input name="title" placeholder="Lecture title" required /></label>
          <label class="field">Video or class link<input name="url" type="url" placeholder="https://..." required /></label>
          <button class="primary" type="submit">Save link</button>
        </form>
        <div class="file-grid">
          ${links.map(renderVideoLink).join("") || `<div class="empty">No links stored in ${escapeHtml(state.selectedVideoSubject)} yet.</div>`}
        </div>
      </div>
    </section>
  `);
  bindCommonRoutes();
  document.querySelectorAll("[data-video-subject]").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedVideoSubject = button.dataset.videoSubject;
      state.selectedVideoFolderId = "";
      renderVideoLecturesPage();
    });
  });
  document.querySelectorAll("[data-video-folder]").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedVideoFolderId = button.dataset.videoFolder;
      renderVideoLecturesPage();
    });
  });
  document.querySelector("#openVideoFolderForm").addEventListener("click", () => {
    document.querySelector("#videoFolderForm").classList.toggle("open");
  });
  document.querySelector("#openVideoLinkForm").addEventListener("click", () => {
    document.querySelector("#videoLinkForm").classList.toggle("open");
  });
  document.querySelectorAll("[data-delete-video-folder]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      deleteVideoFolder(button.dataset.deleteVideoFolder);
    });
  });
  document.querySelectorAll("[data-delete-video-link]").forEach(button => {
    button.addEventListener("click", () => deleteVideoLink(button.dataset.deleteVideoLink));
  });
  document.querySelector("#videoFolderForm").addEventListener("submit", submitVideoFolder);
  document.querySelector("#videoLinkForm").addEventListener("submit", submitVideoLink);
}

function renderVideoFolderButton(folder) {
  const canDelete = folder.ownerId === state.user.id;
  return `
    <button class="folder-button ${state.selectedVideoFolderId === folder.id ? "active" : ""}" data-video-folder="${folder.id}">
      <span>${escapeHtml(folder.name)}</span>
      ${canDelete ? `<span class="folder-delete" data-delete-video-folder="${folder.id}" title="Delete folder">×</span>` : ""}
    </button>
  `;
}

function renderVideoLink(link) {
  return `
    <article class="card file-card">
      <div class="section-head compact">
        <h3>${escapeHtml(link.title)}</h3>
        ${link.ownerId === state.user.id ? `<button class="danger small-button" data-delete-video-link="${link.id}">Delete</button>` : ""}
      </div>
      <p class="muted">Added by ${escapeHtml(link.ownerId)} • ${formatDate(link.createdAt)}</p>
      <a class="ghost file-open" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">Open link</a>
    </article>
  `;
}

function renderAnnouncementsPage() {
  layout(`
    ${pageTitle("Announcements", "Write an announcement and send it to everyone.", "dashboard")}
    <section class="grid two-col">
      <form class="panel" id="announcementForm">
        <h2>New Announcement</h2>
        <label class="field">Title<input name="title" required /></label>
        <label class="field">Message<textarea name="body" required></textarea></label>
        <button class="primary" type="submit">Send to everyone</button>
      </form>
      <div class="panel"><h2>All Announcements</h2><div class="list">${state.data.announcements.map(renderAnnouncement).join("")}</div></div>
    </section>
  `);
  document.querySelector("#announcementForm").addEventListener("submit", submitAnnouncement);
  bindAnnouncementDeletes();
}

function renderStickyPage() {
  layout(`
    ${pageTitle("Sticky Notes", "Write a sticky note for only you or place it on everyone’s dashboard.", "dashboard")}
    <section class="grid two-col">
      <form class="panel" id="stickyForm">
        <h2>New Sticky Note</h2>
        <label class="field">Title<input name="title" required /></label>
        <label class="field">Text<textarea name="body" required></textarea></label>
        <label class="field">Show on dashboard
          <select name="audience">
            <option value="self">Only me</option>
            <option value="everyone">Everyone</option>
          </select>
        </label>
        <button class="primary" type="submit">Put on dashboard</button>
      </form>
      <div class="panel"><h2>Visible Sticky Notes</h2><div class="cards">${state.data.stickyNotes.map(renderStickyCard).join("")}</div></div>
    </section>
  `);
  document.querySelector("#stickyForm").addEventListener("submit", submitSticky);
  bindStickyActions();
  bindStickyDeletes();
}

function renderMeetingsPage() {
  layout(`
    ${pageTitle("Meetings", "Paste the meeting link, set the time, and it appears in reminders.", "dashboard")}
    <section class="grid two-col">
      <form class="panel" id="meetingForm">
        <h2>Schedule Meeting</h2>
        <label class="field">Title<input name="title" required /></label>
        <label class="field">Meeting link<input name="link" type="url" placeholder="https://..." required /></label>
        <label class="field">Time<input name="scheduledAt" type="datetime-local" required /></label>
        <button class="primary" type="submit">Add reminder</button>
      </form>
      <div class="panel"><h2>Upcoming Meetings</h2><div class="list">${state.data.meetings.map(renderMeeting).join("")}</div></div>
    </section>
  `);
  document.querySelector("#meetingForm").addEventListener("submit", submitMeeting);
  bindMeetingDeletes();
}

function renderChatPage() {
  const others = state.data.users.filter(user => user.id !== state.user.id);
  state.chatTo = state.chatTo || others[0]?.id;
  const chats = state.data.chats.filter(chat => chat.from === state.chatTo || chat.to === state.chatTo);
  layout(`
    ${pageTitle("Chat Room", "Select a username and send direct messages.", "dashboard")}
    <section class="grid two-col">
      <form class="panel" id="chatForm">
        <h2>New Message</h2>
        <label class="field">Username
          <select name="to" id="chatTo">${others.map(user => `<option value="${user.id}" ${state.chatTo === user.id ? "selected" : ""}>${escapeHtml(user.name)} (${escapeHtml(user.id)})</option>`).join("")}</select>
        </label>
        <label class="field">Message<textarea name="body" required></textarea></label>
        <button class="primary" type="submit">Send</button>
      </form>
      <div class="panel">
        <h2>Conversation</h2>
        <div class="chat-box">${chats.map(chat => `<div class="chat-message ${chat.from === state.user.id ? "mine" : ""}"><strong>${escapeHtml(chat.from)}</strong><p>${escapeHtml(chat.body)}</p><small class="muted">${formatDate(chat.createdAt)}</small></div>`).join("") || `<div class="empty">No chat messages yet.</div>`}</div>
      </div>
    </section>
  `);
  document.querySelector("#chatTo")?.addEventListener("change", event => {
    state.chatTo = event.target.value;
    renderChatPage();
  });
  document.querySelector("#chatForm").addEventListener("submit", submitChat);
}

function bindCommonRoutes() {
  document.querySelectorAll("[data-route]").forEach(button => {
    button.addEventListener("click", () => setRoute(button.dataset.route));
  });
}

function bindStickyActions() {
  document.querySelectorAll("[data-note]").forEach(button => {
    button.addEventListener("click", async () => {
      await api(`/api/sticky-notes/${button.dataset.note}`, {
        method: "PATCH",
        body: JSON.stringify({ status: button.dataset.status })
      });
      await loadData();
      render();
    });
  });
  bindStickyDeletes();
}

function bindStickyDeletes() {
  document.querySelectorAll("[data-delete-sticky]").forEach(button => {
    button.addEventListener("click", () => deleteSticky(button.dataset.deleteSticky));
  });
}

function bindMeetingDeletes() {
  document.querySelectorAll("[data-delete-meeting]").forEach(button => {
    button.addEventListener("click", () => deleteMeeting(button.dataset.deleteMeeting));
  });
}

function bindMessageActions() {
  document.querySelectorAll("[data-message]").forEach(button => {
    button.addEventListener("click", async () => {
      await api(`/api/messages/${button.dataset.message}`, { method: "PATCH" });
      await loadData();
      render();
    });
  });
}

function bindAnnouncementDeletes() {
  document.querySelectorAll("[data-delete-announcement]").forEach(button => {
    button.addEventListener("click", () => deleteAnnouncement(button.dataset.deleteAnnouncement));
  });
}

async function submitSticky(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await api("/api/sticky-notes", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
  await loadData();
  renderStickyPage();
}

async function submitAnnouncement(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await api("/api/announcements", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
  await loadData();
  renderAnnouncementsPage();
}

async function deleteAnnouncement(announcementId) {
  if (!confirm("Delete this announcement?")) return;
  await api(`/api/announcements/${announcementId}`, { method: "DELETE" });
  await loadData();
  render();
}

async function submitMeeting(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await api("/api/meetings", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
  await loadData();
  renderMeetingsPage();
}

async function deleteSticky(noteId) {
  if (!confirm("Delete this sticky note?")) return;
  await api(`/api/sticky-notes/${noteId}`, { method: "DELETE" });
  await loadData();
  render();
}

async function deleteMeeting(meetingId) {
  if (!confirm("Delete this meeting?")) return;
  await api(`/api/meetings/${meetingId}`, { method: "DELETE" });
  await loadData();
  render();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function submitSubjectFile(event) {
  event.preventDefault();
  const submitButton = event.currentTarget.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";
  const form = new FormData(event.currentTarget);
  const file = form.get("file");
  if (!file || !file.name) {
    submitButton.disabled = false;
    submitButton.textContent = "Save file";
    return;
  }
  try {
    const dataUrl = await fileToDataUrl(file);
    await api("/api/subject-files", {
      method: "POST",
      body: JSON.stringify({
        subject: state.selectedSubject,
        folderId: state.selectedFolderId,
        title: form.get("title") || file.name,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        dataUrl
      })
    });
    await loadData();
    renderSubjectNotesPage();
  } catch (error) {
    alert(error.message || "File upload failed.");
    submitButton.disabled = false;
    submitButton.textContent = "Save file";
  }
}

async function submitSubjectFolder(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await api("/api/subject-folders", {
    method: "POST",
    body: JSON.stringify({
      subject: state.selectedSubject,
      name: form.get("name")
    })
  });
  await loadData();
  renderSubjectNotesPage();
}

async function deleteSubjectFile(fileId) {
  if (!confirm("Delete this uploaded file?")) return;
  await api(`/api/subject-files/${fileId}`, { method: "DELETE" });
  await loadData();
  renderSubjectNotesPage();
}

async function deleteSubjectFolder(folderId) {
  if (!confirm("Delete this folder and files you uploaded inside it?")) return;
  await api(`/api/subject-folders/${folderId}`, { method: "DELETE" });
  state.selectedFolderId = "";
  await loadData();
  renderSubjectNotesPage();
}

async function submitVideoFolder(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await api("/api/video-folders", {
    method: "POST",
    body: JSON.stringify({
      subject: state.selectedVideoSubject,
      name: form.get("name")
    })
  });
  await loadData();
  renderVideoLecturesPage();
}

async function submitVideoLink(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await api("/api/video-links", {
    method: "POST",
    body: JSON.stringify({
      subject: state.selectedVideoSubject,
      folderId: state.selectedVideoFolderId,
      title: form.get("title"),
      url: form.get("url")
    })
  });
  await loadData();
  renderVideoLecturesPage();
}

async function deleteVideoLink(linkId) {
  if (!confirm("Delete this video link?")) return;
  await api(`/api/video-links/${linkId}`, { method: "DELETE" });
  await loadData();
  renderVideoLecturesPage();
}

async function deleteVideoFolder(folderId) {
  if (!confirm("Delete this folder and links you added inside it?")) return;
  await api(`/api/video-folders/${folderId}`, { method: "DELETE" });
  state.selectedVideoFolderId = "";
  await loadData();
  renderVideoLecturesPage();
}

async function submitChat(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  state.chatTo = form.get("to");
  await api("/api/chats", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
  await loadData();
  renderChatPage();
}

async function render() {
  if (!state.user) return renderLogin();
  if (!state.data) {
    try {
      await loadData();
    } catch {
      return logout();
    }
  }

  const pages = {
    dashboard: renderDashboard,
    notes: renderNotesPage,
    announcements: renderAnnouncementsPage,
    sticky: renderStickyPage,
    meetings: renderMeetingsPage,
    chat: renderChatPage,
    subjectNotes: renderSubjectNotesPage,
    videoLectures: renderVideoLecturesPage
  };
  (pages[state.route] || renderDashboard)();
}

window.addEventListener("hashchange", () => {
  state.route = location.hash.replace("#", "") || "dashboard";
  render();
});

render();
