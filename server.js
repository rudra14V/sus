const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const STORAGE_DIR = process.env.STORAGE_DIR || __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(STORAGE_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(STORAGE_DIR, "uploads");
const SUBJECTS = ["OS", "RANAC", "OOPS", "DBMS", "ADSA", "CHESS", "WEBDEV"];

function verifiedUsers() {
  if (process.env.VERIFIED_USERS_JSON) {
    try {
      return JSON.parse(process.env.VERIFIED_USERS_JSON);
    } catch (error) {
      console.warn("Invalid VERIFIED_USERS_JSON, using individual env vars.");
    }
  }

  return [
    {
      id: process.env.ADMIN_ID || "cypher",
      password: process.env.ADMIN_PASSWORD || "chinni_bangaramm",
      name: process.env.ADMIN_NAME || "Cypher",
      role: "admin"
    },
    {
      id: process.env.MEMBER_ID || "jaguar",
      password: process.env.MEMBER_PASSWORD || "ammu_kutty",
      name: process.env.MEMBER_NAME || "Jaguar",
      role: "member"
    }
  ];
}

function createSeed() {
  const users = verifiedUsers();
  const adminId = users[0]?.id || "cypher";
  const memberId = users[1]?.id || "jaguar";

  return {
  users,
  stickyNotes: [
    {
      id: "note-1",
      title: "Welcome checklist",
      body: "Check announcements, meeting reminders, and inbox before starting work.",
      ownerId: adminId,
      audience: "everyone",
      statuses: {},
      createdAt: new Date().toISOString()
    }
  ],
  announcements: [
    {
      id: "ann-1",
      title: "Work manager is live",
      body: "Use this space for team-wide updates and important notices.",
      authorId: adminId,
      createdAt: new Date().toISOString()
    }
  ],
  meetings: [
    {
      id: "meet-1",
      title: "Daily sync",
      link: "https://meet.google.com/",
      scheduledAt: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
      ownerId: adminId,
      createdAt: new Date().toISOString()
    }
  ],
  inbox: [
    {
      id: "msg-1",
      to: memberId,
      from: adminId,
      subject: "Welcome",
      body: "Your work dashboard is ready.",
      read: false,
      createdAt: new Date().toISOString()
    }
  ],
  notes: [],
  subjectFolders: [],
  subjectFiles: [],
  videoFolders: [],
  videoLinks: [],
  resources: [
    { id: "res-1", type: "video", title: "Training video", url: "https://www.youtube.com/" }
  ],
  chats: []
};
}

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(createSeed(), null, 2));
  syncVerifiedUsers();
  migrateSubjectFileStorage();
}

function syncVerifiedUsers() {
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  const currentUsers = verifiedUsers();
  let changed = false;
  db.users = db.users || [];
  currentUsers.forEach(currentUser => {
    const existing = db.users.find(user => user.id === currentUser.id);
    if (existing) {
      ["password", "name", "role"].forEach(key => {
        if (existing[key] !== currentUser[key]) {
          existing[key] = currentUser[key];
          changed = true;
        }
      });
    } else {
      db.users.push(currentUser);
      changed = true;
    }
  });
  if (changed) writeDb(db);
}

function migrateSubjectFileStorage() {
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  let changed = false;
  db.subjectFiles = db.subjectFiles || [];
  db.subjectFolders = db.subjectFolders || [];
  db.videoFolders = db.videoFolders || [];
  db.videoLinks = db.videoLinks || [];
  db.subjectFiles.forEach(file => {
    if (!file.url && file.dataUrl) {
      file.url = saveDataUrlFile(file.id || id("file"), file.fileName || "file", file.dataUrl);
      delete file.dataUrl;
      changed = true;
    }
  });
  if (changed) writeDb(db);
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    req.on("data", chunk => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > 50_000_000) {
        tooLarge = true;
        reject(new Error("Uploaded file is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function id(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

function safeFilePart(value) {
  return String(value || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function saveDataUrlFile(fileId, fileName, dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return "";
  const extension = path.extname(fileName) || "";
  const safeName = `${fileId}-${safeFilePart(path.basename(fileName, extension))}${extension}`;
  const filePath = path.join(UPLOAD_DIR, safeName);
  fs.writeFileSync(filePath, Buffer.from(match[2], "base64"));
  return `/uploads/${safeName}`;
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".txt": "text/plain"
  }[ext] || "application/octet-stream";
}

function publicUser(user) {
  return { id: user.id, name: user.name, role: user.role };
}

function requireUser(req, db) {
  const userId = req.headers["x-user-id"];
  return db.users.find(user => user.id === userId);
}

function routeApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const db = readDb();

  if (req.method === "POST" && url.pathname === "/api/login") {
    return parseBody(req)
      .then(body => {
        const user = db.users.find(item => item.id === body.userId && item.password === body.password);
        if (!user) return sendJson(res, 401, { error: "Invalid verified ID or password." });
        sendJson(res, 200, { user: publicUser(user) });
      })
      .catch(() => sendJson(res, 400, { error: "Invalid request body." }));
  }

  const user = requireUser(req, db);
  if (!user) return sendJson(res, 401, { error: "Login required." });

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const visibleNotes = db.stickyNotes.filter(note => note.audience === "everyone" || note.ownerId === user.id);
    const inbox = db.inbox.filter(message => message.to === user.id || message.to === "everyone");
    return sendJson(res, 200, {
      user: publicUser(user),
      users: db.users.map(publicUser),
      stickyNotes: visibleNotes,
      announcements: db.announcements,
      meetings: db.meetings,
      inbox,
      notes: db.notes.filter(note => note.ownerId === user.id),
      subjectFolders: db.subjectFolders || [],
      subjectFiles: db.subjectFiles || [],
      videoFolders: db.videoFolders || [],
      videoLinks: db.videoLinks || [],
      resources: db.resources,
      chats: db.chats.filter(chat => chat.from === user.id || chat.to === user.id)
    });
  }

  if (req.method === "POST" && url.pathname === "/api/sticky-notes") {
    return parseBody(req).then(body => {
      const note = {
        id: id("note"),
        title: body.title || "Untitled note",
        body: body.body || "",
        ownerId: user.id,
        audience: body.audience === "everyone" ? "everyone" : "self",
        statuses: {},
        createdAt: new Date().toISOString()
      };
      db.stickyNotes.unshift(note);
      writeDb(db);
      sendJson(res, 201, note);
    });
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/sticky-notes/")) {
    return parseBody(req).then(body => {
      const noteId = url.pathname.split("/").pop();
      const note = db.stickyNotes.find(item => item.id === noteId);
      if (!note) return sendJson(res, 404, { error: "Sticky note not found." });
      note.statuses[user.id] = body.status;
      writeDb(db);
      sendJson(res, 200, note);
    });
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/sticky-notes/")) {
    const noteId = url.pathname.split("/").pop();
    const noteIndex = db.stickyNotes.findIndex(item => item.id === noteId);
    if (noteIndex === -1) return sendJson(res, 404, { error: "Sticky note not found." });
    if (db.stickyNotes[noteIndex].ownerId !== user.id) {
      return sendJson(res, 403, { error: "Only the sticky note creator can delete it." });
    }
    db.stickyNotes.splice(noteIndex, 1);
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/announcements") {
    return parseBody(req).then(body => {
      const announcement = {
        id: id("ann"),
        title: body.title || "Announcement",
        body: body.body || "",
        authorId: user.id,
        createdAt: new Date().toISOString()
      };
      db.announcements.unshift(announcement);
      writeDb(db);
      sendJson(res, 201, announcement);
    });
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/announcements/")) {
    const announcementId = url.pathname.split("/").pop();
    const announcementIndex = db.announcements.findIndex(item => item.id === announcementId);
    if (announcementIndex === -1) return sendJson(res, 404, { error: "Announcement not found." });
    if (db.announcements[announcementIndex].authorId !== user.id) {
      return sendJson(res, 403, { error: "Only the announcement author can delete it." });
    }
    db.announcements.splice(announcementIndex, 1);
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/meetings") {
    return parseBody(req).then(body => {
      const meeting = {
        id: id("meet"),
        title: body.title || "Meeting",
        link: body.link || "",
        scheduledAt: body.scheduledAt || "",
        ownerId: user.id,
        createdAt: new Date().toISOString()
      };
      db.meetings.unshift(meeting);
      writeDb(db);
      sendJson(res, 201, meeting);
    });
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/meetings/")) {
    const meetingId = url.pathname.split("/").pop();
    const meetingIndex = db.meetings.findIndex(item => item.id === meetingId);
    if (meetingIndex === -1) return sendJson(res, 404, { error: "Meeting not found." });
    if (db.meetings[meetingIndex].ownerId !== user.id) {
      return sendJson(res, 403, { error: "Only the meeting creator can delete it." });
    }
    db.meetings.splice(meetingIndex, 1);
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/notes") {
    return parseBody(req).then(body => {
      const note = {
        id: id("personal"),
        title: body.title || "Note",
        body: body.body || "",
        ownerId: user.id,
        createdAt: new Date().toISOString()
      };
      db.notes.unshift(note);
      writeDb(db);
      sendJson(res, 201, note);
    });
  }

  if (req.method === "POST" && url.pathname === "/api/subject-files") {
    return parseBody(req).then(body => {
      if (!SUBJECTS.includes(body.subject)) {
        return sendJson(res, 400, { error: "Invalid subject." });
      }
      const fileId = id("file");
      const storedUrl = saveDataUrlFile(fileId, body.fileName || "file", body.dataUrl);
      if (!storedUrl) {
        return sendJson(res, 400, { error: "Could not read uploaded file." });
      }
      const file = {
        id: fileId,
        subject: body.subject,
        title: body.title || body.fileName || "Untitled file",
        fileName: body.fileName || "file",
        mimeType: body.mimeType || "application/octet-stream",
        url: storedUrl,
        folderId: body.folderId || "",
        ownerId: user.id,
        createdAt: new Date().toISOString()
      };
      db.subjectFiles = db.subjectFiles || [];
      db.subjectFiles.unshift(file);
      writeDb(db);
      sendJson(res, 201, file);
    });
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/subject-files/")) {
    const fileId = url.pathname.split("/").pop();
    db.subjectFiles = db.subjectFiles || [];
    const fileIndex = db.subjectFiles.findIndex(item => item.id === fileId);
    if (fileIndex === -1) return sendJson(res, 404, { error: "File not found." });
    const file = db.subjectFiles[fileIndex];
    if (file.ownerId !== user.id) return sendJson(res, 403, { error: "Only the uploader can delete this file." });
    if (file.url && file.url.startsWith("/uploads/")) {
      const uploadPath = path.normalize(path.join(UPLOAD_DIR, file.url.replace("/uploads/", "")));
      if (uploadPath.startsWith(UPLOAD_DIR) && fs.existsSync(uploadPath)) fs.unlinkSync(uploadPath);
    }
    db.subjectFiles.splice(fileIndex, 1);
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/subject-folders") {
    return parseBody(req).then(body => {
      if (!SUBJECTS.includes(body.subject)) {
        return sendJson(res, 400, { error: "Invalid subject." });
      }
      const folder = {
        id: id("folder"),
        subject: body.subject,
        name: body.name || "New folder",
        ownerId: user.id,
        createdAt: new Date().toISOString()
      };
      db.subjectFolders = db.subjectFolders || [];
      db.subjectFolders.unshift(folder);
      writeDb(db);
      sendJson(res, 201, folder);
    });
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/subject-folders/")) {
    const folderId = url.pathname.split("/").pop();
    db.subjectFolders = db.subjectFolders || [];
    db.subjectFiles = db.subjectFiles || [];
    const folderIndex = db.subjectFolders.findIndex(item => item.id === folderId);
    if (folderIndex === -1) return sendJson(res, 404, { error: "Folder not found." });
    const folder = db.subjectFolders[folderIndex];
    if (folder.ownerId !== user.id) return sendJson(res, 403, { error: "Only the folder creator can delete this folder." });
    const folderFiles = db.subjectFiles.filter(file => file.folderId === folderId);
    const blocked = folderFiles.some(file => file.ownerId !== user.id);
    if (blocked) return sendJson(res, 403, { error: "This folder contains files uploaded by another user." });
    folderFiles.forEach(file => {
      if (file.url && file.url.startsWith("/uploads/")) {
        const uploadPath = path.normalize(path.join(UPLOAD_DIR, file.url.replace("/uploads/", "")));
        if (uploadPath.startsWith(UPLOAD_DIR) && fs.existsSync(uploadPath)) fs.unlinkSync(uploadPath);
      }
    });
    db.subjectFiles = db.subjectFiles.filter(file => file.folderId !== folderId);
    db.subjectFolders.splice(folderIndex, 1);
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/video-folders") {
    return parseBody(req).then(body => {
      if (!SUBJECTS.includes(body.subject)) return sendJson(res, 400, { error: "Invalid subject." });
      const folder = {
        id: id("vfolder"),
        subject: body.subject,
        name: body.name || "New folder",
        ownerId: user.id,
        createdAt: new Date().toISOString()
      };
      db.videoFolders = db.videoFolders || [];
      db.videoFolders.unshift(folder);
      writeDb(db);
      sendJson(res, 201, folder);
    });
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/video-folders/")) {
    const folderId = url.pathname.split("/").pop();
    db.videoFolders = db.videoFolders || [];
    db.videoLinks = db.videoLinks || [];
    const folderIndex = db.videoFolders.findIndex(item => item.id === folderId);
    if (folderIndex === -1) return sendJson(res, 404, { error: "Folder not found." });
    const folder = db.videoFolders[folderIndex];
    if (folder.ownerId !== user.id) return sendJson(res, 403, { error: "Only the folder creator can delete this folder." });
    const folderLinks = db.videoLinks.filter(link => link.folderId === folderId);
    if (folderLinks.some(link => link.ownerId !== user.id)) return sendJson(res, 403, { error: "This folder contains links added by another user." });
    db.videoLinks = db.videoLinks.filter(link => link.folderId !== folderId);
    db.videoFolders.splice(folderIndex, 1);
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/video-links") {
    return parseBody(req).then(body => {
      if (!SUBJECTS.includes(body.subject)) return sendJson(res, 400, { error: "Invalid subject." });
      const link = {
        id: id("vlink"),
        subject: body.subject,
        folderId: body.folderId || "",
        title: body.title || "Video lecture",
        url: body.url || "",
        ownerId: user.id,
        createdAt: new Date().toISOString()
      };
      db.videoLinks = db.videoLinks || [];
      db.videoLinks.unshift(link);
      writeDb(db);
      sendJson(res, 201, link);
    });
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/video-links/")) {
    const linkId = url.pathname.split("/").pop();
    db.videoLinks = db.videoLinks || [];
    const linkIndex = db.videoLinks.findIndex(item => item.id === linkId);
    if (linkIndex === -1) return sendJson(res, 404, { error: "Link not found." });
    if (db.videoLinks[linkIndex].ownerId !== user.id) return sendJson(res, 403, { error: "Only the uploader can delete this link." });
    db.videoLinks.splice(linkIndex, 1);
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/messages") {
    return parseBody(req).then(body => {
      const message = {
        id: id("msg"),
        to: body.to,
        from: user.id,
        subject: body.subject || "Message",
        body: body.body || "",
        read: false,
        createdAt: new Date().toISOString()
      };
      db.inbox.unshift(message);
      writeDb(db);
      sendJson(res, 201, message);
    });
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/messages/")) {
    const messageId = url.pathname.split("/").pop();
    const message = db.inbox.find(item => item.id === messageId && (item.to === user.id || item.to === "everyone"));
    if (!message) return sendJson(res, 404, { error: "Message not found." });
    message.read = true;
    writeDb(db);
    return sendJson(res, 200, message);
  }

  if (req.method === "POST" && url.pathname === "/api/chats") {
    return parseBody(req).then(body => {
      const chat = {
        id: id("chat"),
        from: user.id,
        to: body.to,
        body: body.body || "",
        createdAt: new Date().toISOString()
      };
      db.chats.push(chat);
      writeDb(db);
      sendJson(res, 201, chat);
    });
  }

  sendJson(res, 404, { error: "Not found." });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/uploads/")) {
    const uploadPath = path.normalize(path.join(UPLOAD_DIR, decodeURIComponent(url.pathname.replace("/uploads/", ""))));
    if (!uploadPath.startsWith(UPLOAD_DIR)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    return fs.readFile(uploadPath, (error, data) => {
      if (error) {
        res.writeHead(404);
        return res.end("Not found");
      }
      res.writeHead(200, { "Content-Type": contentTypeFor(uploadPath) });
      res.end(data);
    });
  }

  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (indexError, indexData) => {
        if (indexError) {
          res.writeHead(404);
          return res.end("Not found");
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(indexData);
      });
      return;
    }

    const ext = path.extname(filePath);
    const type = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
      ".json": "application/json"
    }[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

ensureDb();
http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    const result = routeApi(req, res);
    if (result && typeof result.catch === "function") {
      result.catch(error => sendJson(res, 400, { error: error.message || "Request failed." }));
    }
    return result;
  }
  serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`Work manager running at http://localhost:${PORT}`);
});
