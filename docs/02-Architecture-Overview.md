# Obsidian Integration - Architecture Overview

**Purpose:** High-level architecture for Think Forge Chat ↔ Obsidian Plugin integration  
**Date:** January 15, 2026  
**Status:** ✅ Finalized

---

## Design Principle: Modular & Non-Invasive

The Obsidian integration is implemented as a **standalone module** that:

1. ✅ Does NOT modify existing background scripts (except one import line)
2. ✅ Does NOT alter existing communication-manager.js
3. ✅ Does NOT change existing storage schemas
4. ✅ Can be completely disabled without side effects
5. ✅ Uses its own namespace (`obsidian_*` for storage, `OBSIDIAN_*` for messages)
6. ✅ Registers its own message handlers

---

## Finalized Configuration

| Setting | Value |
|---------|-------|
| Port | Auto-detect, fallback 9879 |
| Auth | None (localhost trusted) |
| Discovery | Extension polls known port when enabled |
| Sync Direction | Both (user configurable per folder) |
| Sync Trigger | Auto sync via dirty flag mechanism |
| Feature Toggle | Disabled by default, enable in Settings/Plugins |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OBSIDIAN DESKTOP                                  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    THINK FORGE SYNC PLUGIN                            │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐   │  │
│  │  │  HTTP Server    │  │  File Watcher   │  │  Settings Tab       │   │  │
│  │  │  (localhost)    │  │  (sync folders) │  │  (plugin config)    │   │  │
│  │  │  Port: 9879     │  │                 │  │                     │   │  │
│  │  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘   │  │
│  │           │                    │                      │              │  │
│  │           └────────────────────┴──────────────────────┘              │  │
│  │                              │                                        │  │
│  │                    ┌─────────┴─────────┐                             │  │
│  │                    │   Obsidian API    │                             │  │
│  │                    │   (Vault Access)  │                             │  │
│  │                    └───────────────────┘                             │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP (localhost:9879)
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                      THINK FORGE CHAT EXTENSION                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    EXISTING SYSTEMS (UNCHANGED)                      │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │   │
│  │  │ background-  │ │ sync-manager │ │ auth-manager │ │ tab-manager│  │   │
│  │  │ new.js       │ │ .js          │ │ .js          │ │ .js        │  │   │
│  │  │ (1 line add) │ │              │ │              │ │            │  │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              NEW: OBSIDIAN MODULE (STANDALONE)                       │   │
│  │                                                                      │   │
│  │  background/obsidian/                                                │   │
│  │  ├── obsidian-bridge.js     (HTTP client)                           │   │
│  │  ├── obsidian-handlers.js   (OBSIDIAN_* message routing)            │   │
│  │  ├── obsidian-storage.js    (obsidian_* storage keys)               │   │
│  │  └── obsidian-sync.js       (dirty flag integration)                │   │
│  │                                                                      │   │
│  │  panel/                                                              │   │
│  │  ├── folder-metadata-modal.html  (generic folder config)            │   │
│  │  └── folder-metadata-modal.js                                        │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Extension Module Structure

### File Layout

```
Think Forge Chat/
├── background/
│   ├── background-new.js          # ADD: ~5 line conditional import
│   ├── auth-manager.js            # UNCHANGED
│   ├── sync-manager.js            # UNCHANGED
│   ├── communication-manager.js   # UNCHANGED
│   ├── tab-manager.js             # UNCHANGED
│   ├── import-handlers.js         # UNCHANGED
│   │
│   └── obsidian/                  # NEW: Self-contained module
│       ├── obsidian-bridge.js     # HTTP client for Obsidian plugin
│       ├── obsidian-handlers.js   # Message handlers (OBSIDIAN_*)
│       ├── obsidian-storage.js    # Storage utilities (obsidian_* keys)
│       └── obsidian-sync.js       # Sync logic (dirty flag hook)
│
├── panel/
│   ├── panel.html                 # ADD: Plugins section in Settings
│   ├── modules/
│   │   └── settings-manager.js    # ADD: Obsidian toggle handlers
│   ├── folder-metadata-modal.html # NEW: Generic folder properties
│   └── folder-metadata-modal.js   # NEW: Modal logic
│
└── content/
    └── modules/
        └── FloatingMenu.js        # ADD: "Send to Obsidian" context menu
```

### Integration Point (Single Change)

**File:** `background/background-new.js`

```javascript
// ==================== OBSIDIAN MODULE (OPTIONAL) ====================
// Conditionally load Obsidian integration if enabled
chrome.storage.local.get(['obsidian_enabled'], function(result) {
    if (result.obsidian_enabled) {
        try {
            importScripts('obsidian/obsidian-bridge.js');
            importScripts('obsidian/obsidian-handlers.js');
            importScripts('obsidian/obsidian-storage.js');
            importScripts('obsidian/obsidian-sync.js');
            console.log('✅ Obsidian module loaded');
        } catch (e) {
            console.error('❌ Failed to load Obsidian module:', e);
        }
    }
});
```

---

## Obsidian Plugin Structure

```
Obsidian Plugin/
├── docs/                          # Documentation
│   ├── 01-Questions-To-Answer.md  # ✅ Answered
│   ├── 02-Architecture-Overview.md # This file
│   ├── 03-API-Specification.md    # REST API spec
│   ├── 04-Sync-Contract.md        # Data models & rules
│   └── 05-Implementation-Plan.md  # Task breakdown
│
├── src/
│   ├── main.ts                    # Plugin entry point
│   ├── server.ts                  # HTTP server (Express/native)
│   ├── settings.ts                # Plugin settings UI
│   ├── api/
│   │   ├── routes.ts              # Route definitions
│   │   ├── status.ts              # GET /status
│   │   ├── notes.ts               # CRUD /notes
│   │   ├── sync.ts                # Sync operations
│   │   └── import.ts              # Import handlers
│   ├── services/
│   │   ├── vault-service.ts       # Obsidian vault operations
│   │   ├── sync-service.ts        # Sync state management
│   │   └── mapping-service.ts     # ID mapping
│   └── types/
│       └── index.ts               # TypeScript interfaces
│
├── manifest.json                  # Obsidian plugin manifest
├── package.json                   # NPM dependencies
└── tsconfig.json                  # TypeScript config
```

---

## UI Integration Points

### 1. Settings Tab - Plugins Section

```
┌─────────────────────────────────────────────────────────┐
│ Settings                                                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ [Existing settings sections...]                          │
│                                                          │
│ ─────────────────────────────────────────────────────── │
│                                                          │
│ Plugins                                                  │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🟢 Obsidian Sync                          [Toggle] │ │
│ │    Connected to: My Vault                          │ │
│ │    Synced folders: 3                               │ │
│ │                                     [Configure →]  │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 2. Folder Metadata Modal

Launched from folder context menu in Organize/Search tabs:

```
┌─────────────────────────────────────────────────────────┐
│ Folder Properties                               [X]     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Name: Projects                                           │
│ Items: 42 documents                                      │
│ Created: Jan 10, 2026                                    │
│                                                          │
│ ─────────────────────────────────────────────────────── │
│                                                          │
│ Obsidian Sync                                            │
│                                                          │
│ Status: ● Connected                                      │
│                                                          │
│ Sync enabled for this folder: [✓]                       │
│                                                          │
│ Obsidian folder: [Think Forge/Projects    ▼]            │
│                                                          │
│ Direction: [Both (bidirectional)          ▼]            │
│                                                          │
│ Last sync: Jan 15, 2026 10:30 AM                        │
│                                                          │
│                              [Sync Now]  [Save]         │
└─────────────────────────────────────────────────────────┘
```

### 3. Branch Chat Context Menu

```
[Branch Icon]
    │
    ├── Branch to new chat
    ├── Copy to clipboard
    ├── ─────────────────
    └── Send to Obsidian   ← NEW (only if Obsidian enabled)
```

---

## Storage Keys (Extension)

All Obsidian-related storage uses `obsidian_` prefix:

| Key | Type | Description |
|-----|------|-------------|
| `obsidian_enabled` | boolean | Feature toggle (default: false) |
| `obsidian_port` | number | HTTP server port (default: 9879) |
| `obsidian_connected` | boolean | Current connection status |
| `obsidian_vault_name` | string | Connected vault name |
| `obsidian_sync_folders` | array | Configured sync folder mappings |
| `obsidian_last_sync` | string | ISO8601 timestamp of last sync |
| `obsidian_pending_sync` | array | Item IDs queued for sync |
| `obsidian_settings` | object | User preferences |

---

## Message Types (Extension Internal)

All Obsidian messages use `OBSIDIAN_` prefix:

| Message | Direction | Purpose |
|---------|-----------|---------|
| `OBSIDIAN_ENABLE` | Panel → Background | Enable Obsidian module |
| `OBSIDIAN_DISABLE` | Panel → Background | Disable Obsidian module |
| `OBSIDIAN_CHECK_CONNECTION` | Panel → Background | Check connection status |
| `OBSIDIAN_CONNECTION_STATUS` | Background → Panel | Report status |
| `OBSIDIAN_GET_SYNC_FOLDERS` | Panel → Background | Get folder mappings |
| `OBSIDIAN_SYNC_FOLDERS_RESULT` | Background → Panel | Return mappings |
| `OBSIDIAN_ADD_SYNC_FOLDER` | Panel → Background | Create folder mapping |
| `OBSIDIAN_REMOVE_SYNC_FOLDER` | Panel → Background | Delete folder mapping |
| `OBSIDIAN_EXPORT_CONVERSATION` | Content → Background | Export to Obsidian |
| `OBSIDIAN_EXPORT_RESULT` | Background → Panel | Export result |
| `OBSIDIAN_SYNC_NOW` | Panel → Background | Trigger manual sync |

---

## Data Flow Summary

### Think Forge → Obsidian

1. User edits Forge Doc / saves conversation
2. Item's `isDirty` flag set to true
3. Obsidian sync module detects dirty item in synced folder
4. Module calls `POST /notes` on Obsidian plugin
5. Obsidian plugin creates/updates markdown file
6. Module clears dirty flag for Obsidian sync

### Obsidian → Think Forge

1. User edits note in Obsidian
2. File watcher records change
3. Extension polls `GET /sync/changes`
4. Extension fetches full note content
5. Extension creates/updates Forge Doc
6. Extension acknowledges sync

### Branch Chat Export

1. User right-clicks branch icon
2. Selects "Send to Obsidian"
3. Extension shows folder picker
4. User selects target folder
5. Extension calls `POST /import/conversation`
6. Note created in Obsidian
7. Success toast shown

---

## Related Documents

| Document | Purpose |
|----------|---------|
| `03-API-Specification.md` | REST API endpoints |
| `04-Sync-Contract.md` | Data models & sync rules |
| `05-Implementation-Plan.md` | Task breakdown |

