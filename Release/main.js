/*
Think Forge Sync - Obsidian Plugin
Sync notes with Think Forge Chat browser extension
*/

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ThinkForgeSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/types/index.ts
var DEFAULT_SETTINGS = {
  serverPort: 9879,
  serverEnabled: true,
  autoSync: false,
  syncIntervalMinutes: 5,
  basePath: "ThinkForge",
  // Files go to: basePath/ProjectName/
  defaultSyncFolder: "Think Forge",
  // Deprecated
  folderMappings: [],
  // Deprecated
  debugMode: false,
  lastSync: null
};

// src/services/storage.ts
var import_obsidian = require("obsidian");
var StorageService = class {
  constructor(app) {
    this.app = app;
  }
  // ============================================================
  // Security: Path Validation
  // ============================================================
  /**
   * Validate and sanitize a path to prevent directory traversal attacks
   * @throws Error if path is invalid or contains traversal attempts
   */
  validatePath(path) {
    const normalized = (0, import_obsidian.normalizePath)(path);
    if (normalized.includes("..")) {
      throw new Error("Invalid path: directory traversal not allowed");
    }
    if (/^[A-Za-z]:/.test(normalized) || normalized.startsWith("/")) {
      throw new Error("Invalid path: absolute paths not allowed");
    }
    if (normalized.includes("\0")) {
      throw new Error("Invalid path: contains null bytes");
    }
    return normalized;
  }
  /**
   * Sanitize a folder path from external input
   */
  sanitizeFolderPath(path) {
    if (!path)
      return "";
    const cleaned = path.replace(/^[/\\]+|[/\\]+$/g, "");
    const segments = cleaned.split(/[/\\]+/).filter(Boolean);
    const sanitizedSegments = segments.map((seg) => {
      if (seg === "." || seg === "..")
        return "";
      return this.sanitizeFilename(seg);
    }).filter(Boolean);
    return sanitizedSegments.join("/");
  }
  // ============================================================
  // Folder Operations
  // ============================================================
  async ensureFolderExists(path) {
    const normalizedPath = this.validatePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (existing instanceof import_obsidian.TFolder) {
      return existing;
    }
    if (existing instanceof import_obsidian.TFile) {
      throw new Error(`Cannot create folder: a file already exists at ${normalizedPath}`);
    }
    await this.app.vault.createFolder(normalizedPath);
    const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (!(folder instanceof import_obsidian.TFolder)) {
      throw new Error(`Failed to create folder at ${normalizedPath}`);
    }
    return folder;
  }
  async getFolderContents(path) {
    const normalizedPath = (0, import_obsidian.normalizePath)(path);
    const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (!(folder instanceof import_obsidian.TFolder)) {
      return [];
    }
    return folder.children.filter((f) => f instanceof import_obsidian.TFile);
  }
  // ============================================================
  // Branch Operations
  // ============================================================
  /**
   * Save branch to project path (preserves folder structure)
   */
  async saveBranchToProject(branch, projectPath) {
    const safeFolderPath = this.sanitizeFolderPath(branch.folderPath);
    let folderPath;
    if (safeFolderPath) {
      folderPath = this.validatePath(`${projectPath}/${safeFolderPath}`);
    } else {
      folderPath = this.validatePath(projectPath);
    }
    await this.ensureFolderExists(folderPath);
    const filename = this.sanitizeFilename(branch.title || `Chat ${branch.id}`);
    const filePath = (0, import_obsidian.normalizePath)(`${folderPath}/${filename}.md`);
    const frontmatter = {
      thinkforge_id: branch.id,
      thinkforge_type: "branch",
      folder_id: branch.folderId,
      platform: branch.platform,
      url: branch.url,
      created: new Date(branch.createdAt).toISOString(),
      updated: new Date(branch.updatedAt).toISOString(),
      synced: (/* @__PURE__ */ new Date()).toISOString()
    };
    const content = this.formatBranchAsMarkdown(branch, frontmatter);
    const existingFile = this.app.vault.getAbstractFileByPath(filePath);
    if (existingFile instanceof import_obsidian.TFile) {
      await this.app.vault.modify(existingFile, content);
    } else {
      await this.app.vault.create(filePath, content);
    }
    return filePath;
  }
  /**
   * Legacy: Save branch using folder mapping
   */
  async saveBranch(branch, mapping) {
    return this.saveBranchToProject(branch, mapping.obsidianPath);
  }
  formatBranchAsMarkdown(branch, frontmatter) {
    const fm = this.formatFrontmatter(frontmatter);
    let content = `${fm}
`;
    content += `# ${branch.title || "Untitled Chat"}

`;
    content += `> Platform: ${branch.platform} | [Original Link](${branch.url})

`;
    if (branch.tags && Array.isArray(branch.tags) && branch.tags.length > 0) {
      content += `Tags: ${branch.tags.map((t) => `#${t}`).join(" ")}

`;
    }
    content += `---

`;
    if (branch.messages && Array.isArray(branch.messages)) {
      for (const msg of branch.messages) {
        const roleLabel = msg.role === "user" ? "**You**" : "**Assistant**";
        const timestamp = new Date(msg.timestamp).toLocaleString();
        content += `### ${roleLabel}
`;
        content += `*${timestamp}*

`;
        content += `${msg.content}

`;
        content += `---

`;
      }
    } else {
      content += `*This is a saved reference to a conversation. Visit the original link to view the full chat.*
`;
    }
    return content;
  }
  // ============================================================
  // Forge Doc Operations
  // ============================================================
  /**
   * Save Forge Doc to project path (preserves folder structure)
   */
  async saveForgeDocToProject(doc, projectPath) {
    const safeFolderPath = this.sanitizeFolderPath(doc.folderPath);
    let folderPath;
    if (safeFolderPath) {
      folderPath = this.validatePath(`${projectPath}/${safeFolderPath}`);
    } else {
      folderPath = this.validatePath(projectPath);
    }
    await this.ensureFolderExists(folderPath);
    const filename = this.sanitizeFilename(doc.title || `Doc ${doc.id}`);
    const filePath = (0, import_obsidian.normalizePath)(`${folderPath}/${filename}.md`);
    const frontmatter = {
      thinkforge_id: doc.id,
      thinkforge_type: "forgeDoc",
      folder_id: doc.folderId,
      tags: doc.tags,
      created: new Date(doc.createdAt).toISOString(),
      updated: new Date(doc.updatedAt).toISOString(),
      synced: (/* @__PURE__ */ new Date()).toISOString()
    };
    const content = this.formatForgeDocAsMarkdown(doc, frontmatter);
    const existingFile = this.app.vault.getAbstractFileByPath(filePath);
    if (existingFile instanceof import_obsidian.TFile) {
      await this.app.vault.modify(existingFile, content);
    } else {
      await this.app.vault.create(filePath, content);
    }
    return filePath;
  }
  /**
   * Legacy: Save Forge Doc using folder mapping
   */
  async saveForgeDoc(doc, mapping) {
    return this.saveForgeDocToProject(doc, mapping.obsidianPath);
  }
  formatForgeDocAsMarkdown(doc, frontmatter) {
    const fm = this.formatFrontmatter(frontmatter);
    let content = `${fm}
`;
    content += `# ${doc.title}

`;
    if (doc.tags && doc.tags.length > 0) {
      content += `Tags: ${doc.tags.map((t) => `#${t}`).join(" ")}

`;
    }
    content += `---

`;
    content += doc.content || "";
    return content;
  }
  // ============================================================
  // DocKit Operations
  // ============================================================
  /**
   * Save DocKit to project path (preserves folder structure)
   */
  async saveDocKitToProject(docKit, projectPath) {
    const safeFolderPath = this.sanitizeFolderPath(docKit.folderPath);
    const safeName = this.sanitizeFilename(docKit.name || "Untitled DocKit");
    let folderPath;
    if (safeFolderPath) {
      folderPath = this.validatePath(`${projectPath}/${safeFolderPath}/${safeName}`);
    } else {
      folderPath = this.validatePath(`${projectPath}/${safeName}`);
    }
    await this.ensureFolderExists(folderPath);
    const indexPath = (0, import_obsidian.normalizePath)(`${folderPath}/_index.md`);
    const frontmatter = {
      thinkforge_id: docKit.id,
      thinkforge_type: "docKit",
      folder_id: docKit.folderId,
      description: docKit.description,
      created: new Date(docKit.createdAt).toISOString(),
      updated: new Date(docKit.updatedAt).toISOString(),
      synced: (/* @__PURE__ */ new Date()).toISOString()
    };
    const indexContent = this.formatDocKitIndex(docKit, frontmatter);
    const existingIndex = this.app.vault.getAbstractFileByPath(indexPath);
    if (existingIndex instanceof import_obsidian.TFile) {
      await this.app.vault.modify(existingIndex, indexContent);
    } else {
      await this.app.vault.create(indexPath, indexContent);
    }
    for (const item of docKit.items || []) {
      await this.saveDocKitItem(item, folderPath);
    }
    return folderPath;
  }
  /**
   * Legacy: Save DocKit using folder mapping
   */
  async saveDocKit(docKit, mapping) {
    const folderPath = (0, import_obsidian.normalizePath)(`${mapping.obsidianPath}/DocKits/${this.sanitizeFilename(docKit.name)}`);
    await this.ensureFolderExists(folderPath);
    const indexPath = (0, import_obsidian.normalizePath)(`${folderPath}/_index.md`);
    const frontmatter = {
      thinkforge_id: docKit.id,
      thinkforge_type: "docKit",
      folder_id: docKit.folderId,
      description: docKit.description,
      created: new Date(docKit.createdAt).toISOString(),
      updated: new Date(docKit.updatedAt).toISOString(),
      synced: (/* @__PURE__ */ new Date()).toISOString()
    };
    const indexContent = this.formatDocKitIndex(docKit, frontmatter);
    const existingIndex = this.app.vault.getAbstractFileByPath(indexPath);
    if (existingIndex instanceof import_obsidian.TFile) {
      await this.app.vault.modify(existingIndex, indexContent);
    } else {
      await this.app.vault.create(indexPath, indexContent);
    }
    for (const item of docKit.items) {
      await this.saveDocKitItem(item, folderPath);
    }
    return folderPath;
  }
  async saveDocKitItem(item, folderPath) {
    const filename = this.sanitizeFilename(item.title || `Item ${item.id}`);
    const filePath = (0, import_obsidian.normalizePath)(`${folderPath}/${filename}.md`);
    let content = `---
`;
    content += `item_id: ${item.id}
`;
    content += `type: ${item.type}
`;
    if (item.url) {
      content += `url: ${item.url}
`;
    }
    content += `---

`;
    content += `# ${item.title}

`;
    content += item.content;
    const existingFile = this.app.vault.getAbstractFileByPath(filePath);
    if (existingFile instanceof import_obsidian.TFile) {
      await this.app.vault.modify(existingFile, content);
    } else {
      await this.app.vault.create(filePath, content);
    }
  }
  formatDocKitIndex(docKit, frontmatter) {
    const fm = this.formatFrontmatter(frontmatter);
    let content = `${fm}
`;
    content += `# ${docKit.name}

`;
    content += `${docKit.description}

`;
    content += `---

`;
    content += `## Items

`;
    for (const item of docKit.items) {
      const filename = this.sanitizeFilename(item.title || `Item ${item.id}`);
      content += `- [[${filename}]] (${item.type})
`;
    }
    return content;
  }
  // ============================================================
  // Reading Operations
  // ============================================================
  async readThinkForgeFiles(folderPath) {
    var _a;
    const branches = [];
    const forgeDocs = [];
    const docKits = [];
    const files = await this.getFolderContents(folderPath);
    for (const file of files) {
      const content = await this.app.vault.read(file);
      const parsed = this.parseFrontmatter(content);
      if (!((_a = parsed.frontmatter) == null ? void 0 : _a.thinkforge_type)) {
        continue;
      }
      switch (parsed.frontmatter.thinkforge_type) {
        case "branch":
          break;
        case "forgeDoc":
          break;
        case "docKit":
          break;
      }
    }
    return { branches, forgeDocs, docKits };
  }
  // ============================================================
  // Utility Methods
  // ============================================================
  formatFrontmatter(data) {
    let fm = "---\n";
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        fm += `${key}:
`;
        for (const item of value) {
          fm += `  - ${item}
`;
        }
      } else {
        fm += `${key}: ${value}
`;
      }
    }
    fm += "---";
    return fm;
  }
  parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
      return { frontmatter: null, body: content };
    }
    try {
      const frontmatter = {};
      const lines = match[1].split("\n");
      let currentKey = "";
      let currentArray = null;
      for (const line of lines) {
        if (line.startsWith("  - ")) {
          if (currentArray) {
            currentArray.push(line.slice(4));
          }
        } else if (line.includes(": ")) {
          if (currentArray && currentKey) {
            frontmatter[currentKey] = currentArray;
          }
          const [key, ...valueParts] = line.split(": ");
          const value = valueParts.join(": ");
          currentKey = key;
          if (value === "") {
            currentArray = [];
          } else {
            currentArray = null;
            frontmatter[key] = value;
          }
        }
      }
      if (currentArray && currentKey) {
        frontmatter[currentKey] = currentArray;
      }
      return { frontmatter, body: match[2] };
    } catch (e) {
      return { frontmatter: null, body: content };
    }
  }
  sanitizeFilename(name) {
    return name.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 100);
  }
};

// src/services/sync.ts
var import_obsidian2 = require("obsidian");
var SyncService = class {
  constructor(app, storage, settings) {
    this.syncInProgress = false;
    // ============================================================
    // Auto Sync
    // ============================================================
    this.autoSyncInterval = null;
    this.app = app;
    this.storage = storage;
    this.settings = settings;
  }
  updateSettings(settings) {
    this.settings = settings;
  }
  isSyncing() {
    return this.syncInProgress;
  }
  // ============================================================
  // Push Sync (Extension -> Obsidian)
  // ============================================================
  async handlePush(request) {
    if (this.syncInProgress) {
      throw new Error("Sync already in progress");
    }
    this.syncInProgress = true;
    const errors = [];
    const processed = {
      folders: 0,
      branches: 0,
      forgeDocs: 0,
      docKits: 0
    };
    const basePath = this.settings.basePath || this.settings.defaultSyncFolder || "ThinkForge";
    const projectName = request.projectName || "Default";
    const projectPath = `${basePath}/${projectName}`;
    try {
      if (request.folders) {
        for (const folder of request.folders) {
          try {
            if (folder.path) {
              await this.storage.ensureFolderExists(`${projectPath}/${folder.path}`);
              processed.folders++;
            }
          } catch (e) {
            errors.push({
              itemId: folder.id,
              itemType: "folder",
              error: e instanceof Error ? e.message : String(e)
            });
          }
        }
      }
      if (request.branches) {
        for (const branch of request.branches) {
          try {
            await this.storage.saveBranchToProject(branch, projectPath);
            processed.branches++;
          } catch (e) {
            errors.push({
              itemId: branch.id,
              itemType: "branch",
              error: e instanceof Error ? e.message : String(e)
            });
          }
        }
      }
      if (request.forgeDocs) {
        for (const doc of request.forgeDocs) {
          try {
            await this.storage.saveForgeDocToProject(doc, projectPath);
            processed.forgeDocs++;
          } catch (e) {
            errors.push({
              itemId: doc.id,
              itemType: "forgeDoc",
              error: e instanceof Error ? e.message : String(e)
            });
          }
        }
      }
      if (request.docKits) {
        for (const docKit of request.docKits) {
          try {
            await this.storage.saveDocKitToProject(docKit, projectPath);
            processed.docKits++;
          } catch (e) {
            errors.push({
              itemId: docKit.id,
              itemType: "docKit",
              error: e instanceof Error ? e.message : String(e)
            });
          }
        }
      }
      this.settings.lastSync = Date.now();
      const totalProcessed = processed.branches + processed.forgeDocs + processed.docKits;
      if (totalProcessed > 0) {
        new import_obsidian2.Notice(`Think Forge: Synced ${totalProcessed} items to ${projectName}`);
      }
      return { processed, errors };
    } finally {
      this.syncInProgress = false;
    }
  }
  // ============================================================
  // Pull Sync (Obsidian -> Extension)
  // ============================================================
  async handlePull(since, folderIds) {
    const branches = [];
    const forgeDocs = [];
    const docKits = [];
    const mappings = folderIds ? this.settings.folderMappings.filter((m) => folderIds.includes(m.thinkForgeFolderId)) : this.settings.folderMappings;
    for (const mapping of mappings) {
      try {
        const result = await this.storage.readThinkForgeFiles(mapping.obsidianPath);
        branches.push(...result.branches);
        forgeDocs.push(...result.forgeDocs);
        docKits.push(...result.docKits);
      } catch (e) {
        if (this.settings.debugMode) {
          console.error(`Think Forge: Failed to read from ${mapping.obsidianPath}:`, e);
        }
      }
    }
    const filterByTime = (items) => {
      if (!since)
        return items;
      return items.filter((item) => item.updatedAt > since);
    };
    return {
      branches: filterByTime(branches),
      forgeDocs: filterByTime(forgeDocs),
      docKits: filterByTime(docKits),
      lastSync: Date.now()
    };
  }
  // ============================================================
  // Folder Mapping Management
  // ============================================================
  findMapping(folderId) {
    return this.settings.folderMappings.find((m) => m.thinkForgeFolderId === folderId);
  }
  getDefaultMapping() {
    if (this.settings.defaultSyncFolder) {
      return {
        thinkForgeFolderId: "__default__",
        thinkForgeFolderName: "Default",
        obsidianPath: this.settings.defaultSyncFolder,
        createdAt: Date.now(),
        lastSync: 0
      };
    }
    return this.settings.folderMappings[0];
  }
  async addFolderMapping(thinkForgeFolderId, thinkForgeFolderName, obsidianPath) {
    await this.storage.ensureFolderExists(obsidianPath);
    const mapping = {
      thinkForgeFolderId,
      thinkForgeFolderName,
      obsidianPath,
      createdAt: Date.now(),
      lastSync: 0
    };
    this.settings.folderMappings = this.settings.folderMappings.filter(
      (m) => m.thinkForgeFolderId !== thinkForgeFolderId
    );
    this.settings.folderMappings.push(mapping);
    return mapping;
  }
  removeFolderMapping(thinkForgeFolderId) {
    const initialLength = this.settings.folderMappings.length;
    this.settings.folderMappings = this.settings.folderMappings.filter(
      (m) => m.thinkForgeFolderId !== thinkForgeFolderId
    );
    return this.settings.folderMappings.length < initialLength;
  }
  getFolderMappings() {
    return [...this.settings.folderMappings];
  }
  startAutoSync() {
    if (!this.settings.autoSync)
      return;
    this.stopAutoSync();
    const intervalMs = this.settings.syncIntervalMinutes * 60 * 1e3;
    this.autoSyncInterval = setInterval(() => {
      if (this.settings.debugMode) {
        console.log("Think Forge: Auto sync interval tick (no-op in HTTP-only mode)");
      }
    }, intervalMs);
  }
  stopAutoSync() {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }
};

// src/api/endpoints.ts
function validateString(value, fieldName, maxLength = 1e3) {
  if (typeof value !== "string") {
    return { valid: false, error: `${fieldName} must be a string` };
  }
  if (value.length === 0) {
    return { valid: false, error: `${fieldName} is required` };
  }
  if (value.length > maxLength) {
    return { valid: false, error: `${fieldName} exceeds maximum length of ${maxLength}` };
  }
  return { valid: true };
}
function validatePath(value, fieldName) {
  const stringCheck = validateString(value, fieldName, 500);
  if (!stringCheck.valid)
    return stringCheck;
  const path = value;
  if (path.includes("..") || path.includes("\\..") || path.includes("../")) {
    return { valid: false, error: `${fieldName} contains invalid path traversal characters` };
  }
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) {
    return { valid: false, error: `${fieldName} must be a relative path` };
  }
  return { valid: true };
}
function validateArray(value, fieldName, maxItems = 1e3) {
  if (!Array.isArray(value)) {
    return { valid: false, error: `${fieldName} must be an array` };
  }
  if (value.length > maxItems) {
    return { valid: false, error: `${fieldName} exceeds maximum of ${maxItems} items` };
  }
  return { valid: true };
}
function validateSyncPushRequest(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body is required" };
  }
  const req = body;
  const projectCheck = validateString(req.projectName, "projectName", 200);
  if (!projectCheck.valid)
    return projectCheck;
  if (req.branches !== void 0) {
    const check = validateArray(req.branches, "branches");
    if (!check.valid)
      return check;
  }
  if (req.forgeDocs !== void 0) {
    const check = validateArray(req.forgeDocs, "forgeDocs");
    if (!check.valid)
      return check;
  }
  if (req.docKits !== void 0) {
    const check = validateArray(req.docKits, "docKits");
    if (!check.valid)
      return check;
  }
  if (req.folders !== void 0) {
    const check = validateArray(req.folders, "folders");
    if (!check.valid)
      return check;
  }
  return { valid: true };
}
function validateCreateMappingRequest(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body is required" };
  }
  const req = body;
  const idCheck = validateString(req.thinkForgeFolderId, "thinkForgeFolderId", 100);
  if (!idCheck.valid)
    return idCheck;
  const nameCheck = validateString(req.thinkForgeFolderName, "thinkForgeFolderName", 200);
  if (!nameCheck.valid)
    return nameCheck;
  const pathCheck = validatePath(req.obsidianPath, "obsidianPath");
  if (!pathCheck.valid)
    return pathCheck;
  return { valid: true };
}
var ApiEndpoints = class {
  constructor(app, syncService, settings, version) {
    this.app = app;
    this.syncService = syncService;
    this.settings = settings;
    this.version = version;
  }
  updateSettings(settings) {
    this.settings = settings;
    this.syncService.updateSettings(settings);
  }
  // ============================================================
  // Health Check & Status
  // ============================================================
  handleHealthCheck() {
    const vaultName = this.app.vault.getName();
    return {
      success: true,
      data: {
        status: "ok",
        version: this.version,
        vaultName,
        basePath: this.settings.basePath || "ThinkForge",
        syncEnabled: this.settings.serverEnabled,
        lastSync: this.settings.lastSync
      },
      timestamp: Date.now()
    };
  }
  /**
   * Handle /status endpoint - used by extension for connection check
   */
  handleStatus() {
    const vaultName = this.app.vault.getName();
    const vaultPath = this.app.vault.adapter.basePath || "";
    return {
      success: true,
      data: {
        vault: {
          name: vaultName,
          path: vaultPath
        },
        basePath: this.settings.basePath || "ThinkForge",
        syncFolders: this.syncService.getFolderMappings()
      },
      timestamp: Date.now()
    };
  }
  // ============================================================
  // Folder Mappings
  // ============================================================
  handleGetMappings() {
    return {
      success: true,
      data: {
        mappings: this.syncService.getFolderMappings()
      },
      timestamp: Date.now()
    };
  }
  async handleCreateMapping(body) {
    const validation = validateCreateMappingRequest(body);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        timestamp: Date.now()
      };
    }
    const req = body;
    try {
      const mapping = await this.syncService.addFolderMapping(
        req.thinkForgeFolderId,
        req.thinkForgeFolderName,
        req.obsidianPath
      );
      return {
        success: true,
        data: mapping,
        timestamp: Date.now()
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
        timestamp: Date.now()
      };
    }
  }
  handleDeleteMapping(folderId) {
    if (!folderId || typeof folderId !== "string" || folderId.length > 100) {
      return {
        success: false,
        error: "Invalid folder ID",
        timestamp: Date.now()
      };
    }
    const deleted = this.syncService.removeFolderMapping(folderId);
    return {
      success: true,
      data: { deleted },
      timestamp: Date.now()
    };
  }
  // ============================================================
  // Sync Operations
  // ============================================================
  async handleSyncPush(body) {
    const validation = validateSyncPushRequest(body);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        timestamp: Date.now()
      };
    }
    try {
      if (this.syncService.isSyncing()) {
        return {
          success: false,
          error: "Sync already in progress",
          timestamp: Date.now()
        };
      }
      const result = await this.syncService.handlePush(body);
      return {
        success: true,
        data: result,
        timestamp: Date.now()
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
        timestamp: Date.now()
      };
    }
  }
  async handleSyncPull(body) {
    if (body !== void 0 && body !== null && typeof body !== "object") {
      return {
        success: false,
        error: "Invalid request body",
        timestamp: Date.now()
      };
    }
    try {
      const req = body || {};
      const result = await this.syncService.handlePull(req.since, req.folderIds);
      return {
        success: true,
        data: result,
        timestamp: Date.now()
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
        timestamp: Date.now()
      };
    }
  }
  // ============================================================
  // Vault Information
  // ============================================================
  handleGetFolders() {
    const folders = [];
    const getAllFolders = (path) => {
      const folder = this.app.vault.getAbstractFileByPath(path);
      if (folder && "children" in folder) {
        folders.push(path || "/");
        for (const child of folder.children) {
          if ("children" in (this.app.vault.getAbstractFileByPath(child.path) || {})) {
            getAllFolders(child.path);
          }
        }
      }
    };
    getAllFolders("");
    return {
      success: true,
      data: { folders: folders.filter((f) => f !== "/").sort() },
      timestamp: Date.now()
    };
  }
  // ============================================================
  // Request Router
  // ============================================================
  async handleRequest(method, path, body) {
    const normalizedPath = path.replace(/^\/+|\/+$/g, "");
    const segments = normalizedPath.split("/");
    try {
      if (method === "GET" && normalizedPath === "health") {
        return this.handleHealthCheck();
      }
      if (method === "GET" && normalizedPath === "ping") {
        return this.handleHealthCheck();
      }
      if (method === "GET" && normalizedPath === "status") {
        return this.handleStatus();
      }
      if (method === "GET" && normalizedPath === "folders") {
        return this.handleGetFolders();
      }
      if (method === "GET" && normalizedPath === "mappings") {
        return this.handleGetMappings();
      }
      if (method === "POST" && normalizedPath === "mappings") {
        return await this.handleCreateMapping(body);
      }
      if (method === "DELETE" && segments[0] === "mappings" && segments[1]) {
        return this.handleDeleteMapping(decodeURIComponent(segments[1]));
      }
      if (method === "POST" && normalizedPath === "sync/push") {
        return await this.handleSyncPush(body);
      }
      if (method === "POST" && normalizedPath === "sync/pull") {
        return await this.handleSyncPull(body);
      }
      return {
        success: false,
        error: `Unknown endpoint: ${method} /${normalizedPath}`,
        timestamp: Date.now()
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
        timestamp: Date.now()
      };
    }
  }
};

// src/server.ts
var import_http = require("http");
var ALLOWED_ORIGINS = [
  "chrome-extension://",
  // Any Chrome extension
  "moz-extension://",
  // Firefox extensions
  "null"
  // Local file or extension context
];
var HttpServer = class {
  constructor(endpoints, settings) {
    this.server = null;
    this.isRunning = false;
    this.endpoints = endpoints;
    this.settings = settings;
  }
  updateSettings(settings) {
    this.settings = settings;
    this.endpoints.updateSettings(settings);
  }
  isServerRunning() {
    return this.isRunning;
  }
  async start() {
    if (this.isRunning) {
      if (this.settings.debugMode) {
        console.log("Think Forge: Server already running");
      }
      return;
    }
    return new Promise((resolve, reject) => {
      this.server = (0, import_http.createServer)((req, res) => {
        this.handleRequest(req, res);
      });
      this.server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
          console.error(`Think Forge: Port ${this.settings.serverPort} is already in use`);
          reject(new Error(`Port ${this.settings.serverPort} is already in use`));
        } else {
          console.error("Think Forge: Server error:", err);
          reject(err);
        }
      });
      this.server.listen(this.settings.serverPort, "127.0.0.1", () => {
        this.isRunning = true;
        if (this.settings.debugMode) {
          console.log(`Think Forge: Server started on http://127.0.0.1:${this.settings.serverPort}`);
        }
        resolve();
      });
    });
  }
  async stop() {
    return new Promise((resolve) => {
      if (!this.server || !this.isRunning) {
        resolve();
        return;
      }
      this.server.close(() => {
        this.isRunning = false;
        this.server = null;
        if (this.settings.debugMode) {
          console.log("Think Forge: Server stopped");
        }
        resolve();
      });
    });
  }
  // ============================================================
  // HTTP Request Handling
  // ============================================================
  async handleRequest(req, res) {
    const origin = req.headers.origin || "";
    const isAllowedOrigin = this.isOriginAllowed(origin);
    if (isAllowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
      res.setHeader("Access-Control-Allow-Origin", "null");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Think-Forge-Token");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url || "/", `http://127.0.0.1:${this.settings.serverPort}`);
    const path = url.pathname;
    const method = req.method || "GET";
    if (this.settings.debugMode) {
      console.log(`Think Forge: ${method} ${path}`);
    }
    try {
      let body = void 0;
      if (method === "POST" || method === "PUT") {
        body = await this.parseBody(req);
      }
      const response = await this.endpoints.handleRequest(method, path, body);
      const statusCode = response.success ? 200 : 400;
      res.writeHead(statusCode);
      res.end(JSON.stringify(response));
    } catch (e) {
      console.error("Think Forge: Request error:", e);
      res.writeHead(500);
      res.end(JSON.stringify({
        success: false,
        error: e instanceof Error ? e.message : "Internal server error",
        timestamp: Date.now()
      }));
    }
  }
  /**
   * Check if the request origin is allowed
   */
  isOriginAllowed(origin) {
    if (!origin)
      return true;
    return ALLOWED_ORIGINS.some((allowed) => origin.startsWith(allowed));
  }
  parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = "";
      let size = 0;
      const maxSize = 10 * 1024 * 1024;
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxSize) {
          reject(new Error("Request body too large (max 10MB)"));
          req.destroy();
          return;
        }
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : void 0);
        } catch (e) {
          reject(new Error("Invalid JSON body"));
        }
      });
      req.on("error", reject);
    });
  }
};

// src/settings.ts
var import_obsidian3 = require("obsidian");
var AddMappingModal = class extends import_obsidian3.Modal {
  constructor(app, plugin, onSave) {
    super(app);
    this.tfFolders = [];
    this.obsidianFolders = [];
    this.selectedTfFolder = null;
    this.obsidianPath = "";
    this.plugin = plugin;
    this.onSave = onSave;
  }
  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("think-forge-mapping-modal");
    contentEl.createEl("h2", { text: "Add Folder Mapping" });
    const loadingEl = contentEl.createEl("p", { text: "Loading folders..." });
    await this.loadFolders();
    loadingEl.remove();
    if (this.tfFolders.length === 0) {
      contentEl.createEl("p", {
        text: "\u26A0\uFE0F No Think Forge folders found.",
        cls: "think-forge-warning"
      });
      contentEl.createEl("p", {
        text: "Make sure the Think Forge Chrome extension is running and connected.",
        cls: "setting-item-description"
      });
      const closeBtn = contentEl.createEl("button", { text: "Close" });
      closeBtn.addEventListener("click", () => this.close());
      return;
    }
    new import_obsidian3.Setting(contentEl).setName("Think Forge Folder").setDesc("Select a folder from Think Forge to sync").addDropdown((dropdown) => {
      dropdown.addOption("", "Select a folder...");
      for (const folder of this.tfFolders) {
        dropdown.addOption(folder.id, folder.name);
      }
      dropdown.onChange((value) => {
        this.selectedTfFolder = this.tfFolders.find((f) => f.id === value) || null;
        if (this.selectedTfFolder) {
          this.obsidianPath = `Think Forge/${this.selectedTfFolder.name}`;
          obsidianPathInput.setValue(this.obsidianPath);
        }
      });
    });
    let obsidianPathInput;
    new import_obsidian3.Setting(contentEl).setName("Obsidian Vault Path").setDesc("Where to save synced items (folder will be created if needed)").addText((text) => {
      obsidianPathInput = text;
      text.setPlaceholder("Think Forge/MyFolder").setValue(this.obsidianPath).onChange((value) => {
        this.obsidianPath = value;
      });
    });
    if (this.obsidianFolders.length > 0) {
      const suggestionEl = contentEl.createEl("div", { cls: "think-forge-folder-suggestions" });
      suggestionEl.createEl("span", { text: "Existing folders: ", cls: "setting-item-description" });
      const folderList = suggestionEl.createEl("div", { cls: "think-forge-folder-list" });
      for (const folder of this.obsidianFolders.slice(0, 10)) {
        const btn = folderList.createEl("button", { text: folder, cls: "think-forge-folder-btn" });
        btn.addEventListener("click", () => {
          this.obsidianPath = folder;
          obsidianPathInput.setValue(folder);
        });
      }
    }
    const buttonContainer = contentEl.createEl("div", { cls: "think-forge-modal-buttons" });
    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());
    const saveBtn = buttonContainer.createEl("button", { text: "Add Mapping", cls: "mod-cta" });
    saveBtn.addEventListener("click", async () => {
      await this.saveMapping();
    });
    this.addStyles(contentEl);
  }
  async loadFolders() {
    try {
      const folders = [];
      const files = this.app.vault.getAllLoadedFiles();
      for (const file of files) {
        if (file.hasOwnProperty("children")) {
          folders.push(file.path);
        }
      }
      this.obsidianFolders = folders.sort();
    } catch (e) {
      if (this.plugin.settings.debugMode) {
        console.error("Think Forge Sync: Failed to load vault folders:", e);
      }
    }
  }
  async saveMapping() {
    if (!this.selectedTfFolder) {
      new import_obsidian3.Notice("Please select a Think Forge folder");
      return;
    }
    if (!this.obsidianPath.trim()) {
      new import_obsidian3.Notice("Please enter an Obsidian vault path");
      return;
    }
    const existing = this.plugin.settings.folderMappings.find(
      (m) => m.thinkForgeFolderId === this.selectedTfFolder.id
    );
    if (existing) {
      new import_obsidian3.Notice("This Think Forge folder is already mapped");
      return;
    }
    const mapping = {
      thinkForgeFolderId: this.selectedTfFolder.id,
      thinkForgeFolderName: this.selectedTfFolder.name,
      obsidianPath: this.obsidianPath.trim(),
      createdAt: Date.now(),
      lastSync: 0
    };
    this.plugin.settings.folderMappings.push(mapping);
    await this.plugin.saveSettings();
    new import_obsidian3.Notice(`Mapping added: ${this.selectedTfFolder.name} \u2192 ${this.obsidianPath}`);
    this.onSave();
    this.close();
  }
  addStyles(container) {
    const style = container.createEl("style");
    style.textContent = `
            .think-forge-mapping-modal {
                padding: 20px;
            }
            .think-forge-warning {
                color: var(--text-error);
                font-weight: 500;
            }
            .think-forge-folder-suggestions {
                margin: 10px 0;
                padding: 10px;
                background: var(--background-secondary);
                border-radius: 6px;
            }
            .think-forge-folder-list {
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
                margin-top: 8px;
            }
            .think-forge-folder-btn {
                padding: 4px 8px;
                font-size: 12px;
                background: var(--background-modifier-border);
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            .think-forge-folder-btn:hover {
                background: var(--background-modifier-hover);
            }
            .think-forge-modal-buttons {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 20px;
            }
        `;
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};
var ThinkForgeSyncSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h1", { text: "Think Forge Sync" });
    containerEl.createEl("p", {
      text: "Sync your Think Forge conversations, Forge Docs, and DocKits with your Obsidian vault.",
      cls: "setting-item-description"
    });
    containerEl.createEl("h2", { text: "Server Settings" });
    new import_obsidian3.Setting(containerEl).setName("Enable sync server").setDesc("Start a local HTTP server to receive data from the Think Forge extension").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.serverEnabled).onChange(async (value) => {
        this.plugin.settings.serverEnabled = value;
        await this.plugin.saveSettings();
        if (value) {
          await this.plugin.startServer();
        } else {
          await this.plugin.stopServer();
        }
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Server port").setDesc("Port number for the local sync server (default: 9879)").addText(
      (text) => text.setPlaceholder("9879").setValue(String(this.plugin.settings.serverPort)).onChange(async (value) => {
        const port = parseInt(value, 10);
        if (!isNaN(port) && port > 0 && port < 65536) {
          this.plugin.settings.serverPort = port;
          await this.plugin.saveSettings();
        }
      })
    );
    const serverStatus = containerEl.createEl("div", { cls: "think-forge-server-status" });
    this.updateServerStatus(serverStatus);
    containerEl.createEl("h2", { text: "Sync Location" });
    new import_obsidian3.Setting(containerEl).setName("Base folder").setDesc("Files are saved to: BasePath/ProjectName/Chats/ and BasePath/ProjectName/Forge Docs/").addText(
      (text) => text.setPlaceholder("ThinkForge").setValue(this.plugin.settings.basePath || "ThinkForge").onChange(async (value) => {
        this.plugin.settings.basePath = value || "ThinkForge";
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("p", {
      text: `Example: ${this.plugin.settings.basePath || "ThinkForge"}/My Project/Chats/conversation.md`,
      cls: "setting-item-description"
    });
    containerEl.createEl("h2", { text: "Auto Sync" });
    new import_obsidian3.Setting(containerEl).setName("Enable auto sync").setDesc("Automatically sync changes at regular intervals").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoSync).onChange(async (value) => {
        this.plugin.settings.autoSync = value;
        await this.plugin.saveSettings();
        new import_obsidian3.Notice(value ? "Auto sync enabled" : "Auto sync disabled");
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Sync interval").setDesc("How often to check for changes (in minutes)").addDropdown(
      (dropdown) => dropdown.addOption("1", "1 minute").addOption("5", "5 minutes").addOption("15", "15 minutes").addOption("30", "30 minutes").addOption("60", "1 hour").setValue(String(this.plugin.settings.syncIntervalMinutes)).onChange(async (value) => {
        this.plugin.settings.syncIntervalMinutes = parseInt(value, 10);
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h2", { text: "Sync Direction" });
    const syncInfoDiv = containerEl.createEl("div", { cls: "think-forge-sync-info" });
    syncInfoDiv.createEl("p", {
      text: "\u2192 One-way sync: Think Forge Extension \u2192 Obsidian",
      cls: "setting-item-description"
    });
    syncInfoDiv.createEl("p", {
      text: "Changes made in the Think Forge extension are automatically exported to your Obsidian vault. Edits made in Obsidian stay local to your vault.",
      cls: "setting-item-description"
    });
    containerEl.createEl("h2", { text: "Debug" });
    new import_obsidian3.Setting(containerEl).setName("Debug mode").setDesc("Log detailed information to the console").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.debugMode).onChange(async (value) => {
        this.plugin.settings.debugMode = value;
        await this.plugin.saveSettings();
      })
    );
    if (this.plugin.settings.lastSync) {
      const lastSyncDate = new Date(this.plugin.settings.lastSync).toLocaleString();
      containerEl.createEl("p", {
        text: `Last sync: ${lastSyncDate}`,
        cls: "setting-item-description"
      });
    }
    this.addStyles(containerEl);
  }
  displayMappings(container) {
    container.empty();
    const mappings = this.plugin.settings.folderMappings;
    if (mappings.length === 0) {
      container.createEl("p", {
        text: "No folder mappings configured. Mappings will be created when you sync from Think Forge.",
        cls: "setting-item-description think-forge-no-mappings"
      });
    } else {
      for (const mapping of mappings) {
        this.createMappingItem(container, mapping);
      }
    }
    const addContainer = container.createEl("div", { cls: "think-forge-add-mapping-info" });
    addContainer.createEl("p", {
      text: "\u{1F4A1} To add a mapping, use the Think Forge Chrome extension:",
      cls: "think-forge-add-tip"
    });
    addContainer.createEl("ol", {}).innerHTML = `
            <li>Open Think Forge extension panel</li>
            <li>Go to Settings \u2192 Plugins \u2192 Obsidian</li>
            <li>Click "Add Folder Mapping"</li>
            <li>Select a Think Forge folder and Obsidian path</li>
        `;
    const advancedContainer = container.createEl("details", { cls: "think-forge-advanced-mapping" });
    advancedContainer.createEl("summary", { text: "\u2699\uFE0F Advanced: Add manual mapping" });
    new import_obsidian3.Setting(advancedContainer).setDesc("For power users who know the folder ID").addButton(
      (button) => button.setButtonText("Add Manual Mapping").onClick(() => {
        this.showAddMappingModal();
      })
    );
  }
  createMappingItem(container, mapping) {
    const item = container.createEl("div", { cls: "think-forge-mapping-item" });
    const info = item.createEl("div", { cls: "think-forge-mapping-info" });
    info.createEl("span", {
      text: mapping.thinkForgeFolderName || mapping.thinkForgeFolderId,
      cls: "think-forge-mapping-name"
    });
    info.createEl("span", { text: " \u2192 " });
    info.createEl("span", {
      text: mapping.obsidianPath,
      cls: "think-forge-mapping-path"
    });
    const lastSync = mapping.lastSync ? new Date(mapping.lastSync).toLocaleDateString() : "Never";
    info.createEl("span", {
      text: ` (Last sync: ${lastSync})`,
      cls: "think-forge-mapping-date"
    });
    const actions = item.createEl("div", { cls: "think-forge-mapping-actions" });
    const deleteBtn = actions.createEl("button", { text: "Remove" });
    deleteBtn.addEventListener("click", async () => {
      this.plugin.settings.folderMappings = this.plugin.settings.folderMappings.filter(
        (m) => m.thinkForgeFolderId !== mapping.thinkForgeFolderId
      );
      await this.plugin.saveSettings();
      this.displayMappings(container.parentElement);
      new import_obsidian3.Notice("Mapping removed");
    });
  }
  showAddMappingModal() {
    const modal = new AddMappingModal(this.app, this.plugin, () => {
      this.display();
    });
    modal.open();
  }
  updateServerStatus(container) {
    container.empty();
    const isRunning = this.plugin.isServerRunning();
    const statusClass = isRunning ? "think-forge-status-running" : "think-forge-status-stopped";
    const statusText = isRunning ? `\u2713 Server running on port ${this.plugin.settings.serverPort}` : "\u2717 Server stopped";
    container.createEl("span", {
      text: statusText,
      cls: `think-forge-status ${statusClass}`
    });
    if (isRunning) {
      const testBtn = container.createEl("button", { text: "Test Connection" });
      testBtn.addEventListener("click", async () => {
        try {
          const response = await fetch(`http://127.0.0.1:${this.plugin.settings.serverPort}/health`);
          const data = await response.json();
          if (data.success) {
            new import_obsidian3.Notice("\u2713 Connection successful!");
          } else {
            new import_obsidian3.Notice("\u2717 Connection failed: " + data.error);
          }
        } catch (e) {
          new import_obsidian3.Notice("\u2717 Connection failed: " + (e instanceof Error ? e.message : "Unknown error"));
        }
      });
    }
  }
  addStyles(container) {
    const style = container.createEl("style");
    style.textContent = `
            .think-forge-server-status {
                margin: 10px 0 20px 0;
                padding: 10px;
                background: var(--background-secondary);
                border-radius: 6px;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .think-forge-status {
                font-weight: 500;
            }
            .think-forge-status-running {
                color: var(--text-success);
            }
            .think-forge-status-stopped {
                color: var(--text-muted);
            }
            .think-forge-mappings {
                margin: 10px 0;
            }
            .think-forge-mapping-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px;
                margin: 5px 0;
                background: var(--background-secondary);
                border-radius: 6px;
            }
            .think-forge-mapping-name {
                font-weight: 600;
                color: var(--text-accent);
            }
            .think-forge-mapping-path {
                font-family: var(--font-monospace);
                font-size: 0.9em;
            }
            .think-forge-mapping-date {
                color: var(--text-muted);
                font-size: 0.85em;
            }
            .think-forge-no-mappings {
                font-style: italic;
                color: var(--text-muted);
            }
            .think-forge-add-mapping {
                margin-top: 15px;
            }
            .think-forge-twoway-status {
                margin: 10px 0 20px 0;
                padding: 10px;
                background: var(--background-secondary);
                border-radius: 6px;
            }
        `;
  }
};

// src/main.ts
var ThinkForgeSyncPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.storageService = new StorageService(this.app);
    this.syncService = new SyncService(this.app, this.storageService, this.settings);
    this.apiEndpoints = new ApiEndpoints(
      this.app,
      this.syncService,
      this.settings,
      this.manifest.version
    );
    this.httpServer = new HttpServer(this.apiEndpoints, this.settings);
    this.addSettingTab(new ThinkForgeSyncSettingTab(this.app, this));
    this.addRibbonIcon("sync", "Think Forge Sync", async () => {
      await this.triggerManualSync();
    });
    this.addCommand({
      id: "start-server",
      name: "Start sync server",
      callback: async () => {
        await this.startServer();
      }
    });
    this.addCommand({
      id: "stop-server",
      name: "Stop sync server",
      callback: async () => {
        await this.stopServer();
      }
    });
    this.addCommand({
      id: "toggle-server",
      name: "Toggle sync server",
      callback: async () => {
        if (this.httpServer.isServerRunning()) {
          await this.stopServer();
        } else {
          await this.startServer();
        }
      }
    });
    this.addCommand({
      id: "manual-sync",
      name: "Sync now",
      callback: async () => {
        await this.triggerManualSync();
      }
    });
    this.addCommand({
      id: "show-status",
      name: "Show sync status",
      callback: () => {
        const running = this.httpServer.isServerRunning();
        new import_obsidian4.Notice(
          `Think Forge Status:
\u2022 Server: ${running ? "\u2705 Running" : "\u274C Stopped"}
\u2022 Port: ${this.settings.serverPort}
\u2022 Base path: ${this.settings.basePath || "ThinkForge"}
\u2022 Mode: Extension \u2192 Obsidian (one-way)`
        );
      }
    });
    if (this.settings.serverEnabled) {
      this.app.workspace.onLayoutReady(async () => {
        try {
          await this.startServer();
        } catch (e) {
          console.error("Think Forge Sync: Failed to start server:", e);
        }
      });
    }
    if (this.settings.autoSync) {
      this.syncService.startAutoSync();
    }
    if (this.settings.debugMode) {
      console.log("Think Forge Sync: Plugin loaded (one-way: Extension \u2192 Obsidian)");
      console.log("Think Forge Sync: Settings:", {
        serverPort: this.settings.serverPort,
        serverEnabled: this.settings.serverEnabled,
        basePath: this.settings.basePath || "ThinkForge"
      });
    }
  }
  async onunload() {
    await this.stopServer();
    this.syncService.stopAutoSync();
    if (this.settings.debugMode) {
      console.log("Think Forge Sync: Plugin unloaded");
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.syncService.updateSettings(this.settings);
    this.httpServer.updateSettings(this.settings);
    this.apiEndpoints.updateSettings(this.settings);
  }
  // ============================================================
  // Server Control
  // ============================================================
  async startServer() {
    try {
      await this.httpServer.start();
      new import_obsidian4.Notice(`Think Forge Sync: Server started on port ${this.settings.serverPort}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      new import_obsidian4.Notice(`Think Forge Sync: Failed to start server - ${message}`);
      console.error("Think Forge Sync:", e);
    }
  }
  async stopServer() {
    await this.httpServer.stop();
    new import_obsidian4.Notice("Think Forge Sync: Server stopped");
  }
  isServerRunning() {
    var _a, _b;
    return (_b = (_a = this.httpServer) == null ? void 0 : _a.isServerRunning()) != null ? _b : false;
  }
  // ============================================================
  // Public API for other plugins or scripts
  // ============================================================
  getSettings() {
    return { ...this.settings };
  }
  async triggerSync() {
    if (!this.httpServer.isServerRunning()) {
      throw new Error("Server is not running");
    }
    await this.triggerManualSync();
  }
  /**
   * Trigger a manual sync - useful for testing and user-initiated syncs
   * Note: This is one-way sync (Extension → Obsidian). The extension pushes data via HTTP.
   * This command just confirms the server is ready to receive.
   */
  async triggerManualSync() {
    if (!this.httpServer.isServerRunning()) {
      new import_obsidian4.Notice("\u26A0\uFE0F Think Forge server is not running. Enable it in settings.");
      return;
    }
    new import_obsidian4.Notice(
      `\u2705 Think Forge server ready!
\u2022 Port: ${this.settings.serverPort}
\u2022 Use the Chrome extension to push data to Obsidian.`
    );
  }
};
