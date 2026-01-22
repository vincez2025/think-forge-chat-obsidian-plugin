# Obsidian Plugin - Implementation Plan

**Version:** 1.0  
**Date:** January 15, 2026  
**Status:** 📋 Ready for Implementation

---

## Overview

This document breaks down the implementation into phases with specific tasks.

---

## Phase 1: Extension Foundation (Modular)

### 1.1 Create Obsidian Module Structure

**Location:** `background/obsidian/`

```
background/obsidian/
├── obsidian-bridge.js      # HTTP client for Obsidian plugin
├── obsidian-handlers.js    # Message handlers (OBSIDIAN_*)
├── obsidian-storage.js     # Storage utilities (obsidian_* keys)
└── obsidian-sync.js        # Sync logic (dirty flag integration)
```

**Tasks:**
- [ ] Create `background/obsidian/` folder
- [ ] Create `obsidian-bridge.js` - HTTP client with connection management
- [ ] Create `obsidian-handlers.js` - Message handler registration
- [ ] Create `obsidian-storage.js` - Storage key constants and utilities
- [ ] Create `obsidian-sync.js` - Sync queue and dirty flag integration

### 1.2 Integration Point

**File:** `background/background-new.js`

**Single Change Required:**
```javascript
// Add after existing importScripts (around line 40)

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

**Tasks:**
- [ ] Add conditional import to `background-new.js`
- [ ] Test that existing functionality is unchanged when disabled
- [ ] Test that modules load correctly when enabled

---

## Phase 2: Settings UI

### 2.1 Plugins Section in Settings Tab

**File:** `panel/panel.html` (Settings tab section)

**New UI Elements:**
- "Plugins" section header
- Obsidian enable/disable toggle
- Connection status indicator
- Port configuration (optional)

**Tasks:**
- [ ] Add "Plugins" section to Settings tab HTML
- [ ] Add Obsidian toggle switch
- [ ] Add connection status indicator
- [ ] Add "Configure" button to open detailed settings

### 2.2 Settings Manager Integration

**File:** `panel/modules/settings-manager.js`

**Tasks:**
- [ ] Add Obsidian settings handlers
- [ ] Handle enable/disable toggle
- [ ] Send `OBSIDIAN_ENABLE` / `OBSIDIAN_DISABLE` messages
- [ ] Update connection status display

---

## Phase 3: Folder Metadata Modal

### 3.1 Create Modal Window

**New Files:**
```
panel/
├── folder-metadata-modal.html
├── folder-metadata-modal.js
└── folder-metadata-modal.css (or add to panel.css)
```

**Modal Features:**
- Folder name and stats display
- Obsidian sync configuration section
  - Enable/disable for this folder
  - Select Obsidian folder path
  - Sync direction dropdown
  - Last sync timestamp
  - Manual sync button
- Extensible for future integrations

**Tasks:**
- [ ] Create `folder-metadata-modal.html`
- [ ] Create `folder-metadata-modal.js`
- [ ] Add CSS styles for modal
- [ ] Add "Properties" button to folder context menu in Organize tab
- [ ] Wire up modal launch from Organize tab

### 3.2 Folder Selection UX

**Tasks:**
- [ ] Display list of available Obsidian folders (from `/sync/folders`)
- [ ] Allow creating new sync mapping
- [ ] Handle "folder already synced" case
- [ ] Show sync status per folder

---

## Phase 4: Branch Chat Integration

### 4.1 Context Menu Addition

**File:** `content/modules/FloatingMenu.js` (or wherever branch context menu is)

**Tasks:**
- [ ] Add "Send to Obsidian" option to branch context menu
- [ ] Only show if Obsidian is enabled and connected
- [ ] Send `OBSIDIAN_EXPORT_CONVERSATION` message on click

### 4.2 Export Flow

**Tasks:**
- [ ] Create folder picker dialog (show synced folders)
- [ ] Handle export request in `obsidian-handlers.js`
- [ ] Format conversation as markdown
- [ ] POST to Obsidian `/import/conversation`
- [ ] Show success/error toast

---

## Phase 5: Obsidian Plugin (TypeScript)

### 5.1 Plugin Structure

**Location:** `Obsidian Plugin/src/`

```
src/
├── main.ts                 # Plugin entry point
├── server.ts               # HTTP server setup
├── settings.ts             # Plugin settings tab
├── api/
│   ├── routes.ts           # Route definitions
│   ├── status.ts           # GET /status
│   ├── notes.ts            # CRUD /notes
│   ├── sync.ts             # Sync operations
│   └── import.ts           # Import handlers
├── services/
│   ├── vault-service.ts    # Obsidian vault operations
│   ├── sync-service.ts     # Sync state management
│   └── mapping-service.ts  # ID mapping
└── types/
    └── index.ts            # TypeScript interfaces
```

### 5.2 Plugin Manifest

**File:** `Obsidian Plugin/manifest.json`

```json
{
  "id": "think-forge-sync",
  "name": "Think Forge Sync",
  "version": "1.0.0",
  "minAppVersion": "1.0.0",
  "description": "Sync notes with Think Forge Chat browser extension",
  "author": "Think Forge",
  "authorUrl": "https://thinkforge.app",
  "isDesktopOnly": true
}
```

### 5.3 Implementation Tasks

**Tasks:**
- [ ] Initialize Obsidian plugin project structure
- [ ] Create `main.ts` with plugin lifecycle
- [ ] Create `server.ts` with Express/native HTTP server
- [ ] Implement `/status` endpoint
- [ ] Implement `/notes` CRUD endpoints
- [ ] Implement `/sync/folders` management
- [ ] Implement `/sync/changes` for polling
- [ ] Implement `/import/conversation` and `/import/forgedoc`
- [ ] Create settings tab UI
- [ ] Add file watcher for sync folder changes
- [ ] Test CORS with Chrome extension

---

## Phase 6: Auto Sync Integration

### 6.1 Dirty Flag Hook

**File:** `background/obsidian/obsidian-sync.js`

**Tasks:**
- [ ] Listen for storage changes to items in synced folders
- [ ] Check `isDirty` flag on relevant items
- [ ] Queue dirty items for Obsidian sync
- [ ] Process queue with batching (avoid spamming API)

### 6.2 Polling for Obsidian Changes

**Tasks:**
- [ ] Poll `/sync/changes` endpoint periodically
- [ ] Process incoming changes
- [ ] Create/update Forge Docs from Obsidian notes
- [ ] Acknowledge sync completion

---

## Implementation Order

### Recommended Sequence

```
Week 1: Phase 1 (Extension Foundation)
        - Create module structure
        - Add integration point
        - Basic message handlers

Week 2: Phase 2 + 3 (UI)
        - Settings UI
        - Folder Metadata Modal

Week 3: Phase 5 (Obsidian Plugin Core)
        - Plugin setup
        - HTTP server
        - Basic endpoints

Week 4: Phase 4 + 6 (Integration)
        - Branch chat menu
        - Auto sync
        - End-to-end testing
```

---

## Testing Checklist

### Extension Tests
- [ ] Obsidian module loads only when enabled
- [ ] Existing functionality unchanged when disabled
- [ ] Connection status updates correctly
- [ ] Settings persist across sessions
- [ ] Export to Obsidian works from branch menu

### Obsidian Plugin Tests
- [ ] HTTP server starts on correct port
- [ ] CORS allows Chrome extension requests
- [ ] Notes CRUD operations work
- [ ] Sync folder management works
- [ ] File watcher detects changes
- [ ] Frontmatter is preserved/generated correctly

### Integration Tests
- [ ] TF → Obsidian: Forge Doc syncs to note
- [ ] TF → Obsidian: Conversation exports correctly
- [ ] Obsidian → TF: Note syncs to Forge Doc
- [ ] Conflict resolution works (last write wins)
- [ ] Duplicate handling works (create copy)
- [ ] Tags flatten correctly
- [ ] Connection loss/recovery handled gracefully

---

## Files to Create/Modify

### New Files (Extension)

| File | Purpose |
|------|---------|
| `background/obsidian/obsidian-bridge.js` | HTTP client |
| `background/obsidian/obsidian-handlers.js` | Message handlers |
| `background/obsidian/obsidian-storage.js` | Storage utilities |
| `background/obsidian/obsidian-sync.js` | Sync logic |
| `panel/folder-metadata-modal.html` | Modal HTML |
| `panel/folder-metadata-modal.js` | Modal logic |

### Modified Files (Extension)

| File | Change |
|------|--------|
| `background/background-new.js` | Add conditional import (~5 lines) |
| `panel/panel.html` | Add Plugins section to Settings tab |
| `panel/modules/settings-manager.js` | Add Obsidian handlers |
| `content/modules/FloatingMenu.js` | Add context menu item |

### New Files (Obsidian Plugin)

| File | Purpose |
|------|---------|
| `manifest.json` | Plugin manifest |
| `package.json` | NPM dependencies |
| `tsconfig.json` | TypeScript config |
| `src/main.ts` | Plugin entry |
| `src/server.ts` | HTTP server |
| `src/settings.ts` | Settings tab |
| `src/api/*.ts` | API endpoints |
| `src/services/*.ts` | Business logic |
| `src/types/index.ts` | TypeScript types |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Extension breaks if module fails | Wrap in try-catch, disable gracefully |
| Port conflict | Auto-detect with fallback |
| Obsidian not running | Graceful degradation, clear status |
| Large sync queues | Batch processing, rate limiting |
| Data loss | Never delete, create duplicates |

---

## Success Criteria

### MVP Complete When:
1. ✅ User can enable Obsidian in Settings
2. ✅ Extension detects Obsidian plugin connection
3. ✅ User can configure folder sync mapping
4. ✅ Forge Docs sync to Obsidian notes
5. ✅ Obsidian notes sync to Forge Docs
6. ✅ Branch chat "Send to Obsidian" works
7. ✅ Auto sync with dirty flag works


