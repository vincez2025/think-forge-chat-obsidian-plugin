# Obsidian Plugin - Questions to Answer

**Purpose:** Answer these questions to inform the technical specification  
**Date:** January 15, 2026  
**Status:** ✅ ANSWERED

---

## Quick Summary Table

| Question | Answer |
|----------|--------|
| Port | Auto-detect, fallback 9879 |
| Auth | None (localhost trusted) |
| Discovery | Extension polls known port; user enables in Settings/Plugins |
| V1 Direction | Both directions (user configurable) |
| Sync Trigger | Auto sync using existing dirty flag |
| TF → Obsidian items | All: Conversations, Forge Docs, Tags (in doc), DocKits |
| Obsidian → TF items | Notes → Forge Docs, Notes → DocKits, Folders → Folders |
| Tag handling | Flatten nested tags |
| Module location | `background/obsidian/` folder |
| UI location | Settings tab + new Folder Metadata Modal |
| Feature flag | Yes, disabled by default |
| Duplicate detection | Timestamp-based, never delete, create duplicate |
| Conflict resolution | Last write wins (timestamp) |
| Vault selection | User adds folder in Obsidian plugin |
| Folder scope | Folder-based, user selected |
| Frontmatter format | Configurable |
| Conversation format | Branch chat context menu → "Send to Obsidian" |

---

## Full Answers

### Section A: Connection & Communication

**A1. Port:** Auto-detect available port if reliable, otherwise default to 9879

**A2. Authentication:** None - localhost is trusted

**A3. Discovery:** Extension polls known port periodically. User must enable Obsidian plugin in Think Forge Chat Settings/Plugins tab (NEW tab to be created)

---

### Section B: Data Flow Direction

**B1. Direction:** Both directions from day one, with user option to configure

**B2. Trigger:** Auto sync using existing dirty flag mechanism from cloud sync

---

### Section C: What Data Moves

**C1. TF → Obsidian:** 
- Conversations (as markdown)
- Forge Docs (as markdown)
- Tags (extracted/embedded in document)
- DocKits (as folders)

**C2. Obsidian → TF:**
- Notes → Forge Docs
- Notes → Attachable to DocKits
- Folders → Think Forge Folders
- Tags remain embedded in document (not synced separately)

**C3. Tags:** Flatten nested tags (`#project/alpha` → `project`, `alpha`)

---

### Section D: Extension Integration

**D1. Module:** `background/obsidian/` folder with multiple files

**D2. UI:** 
- Settings tab section
- NEW: Folder Metadata Modal (generic for future plugins/APIs)
- Launched from Search and Organize modal
- Branch chat context menu: "Send to Obsidian" option

**D3. Feature flag:** Yes, disabled by default - user must enable

---

### Section E: Conflict Handling

**E1. Duplicates:** Timestamp-based detection. Never delete. Create duplicate if needed.

**E2. Conflicts:** Last write wins (most recent timestamp)

---

### Section F: Folder/Vault Scope

**F1. Vault:** Plugin has "Add Folder" action in Obsidian. This is sync origin. If matching folder exists in Think Forge, show message. Prompt user to create matching folder in TF.

**F2. Scope:** Folder-based only, user selected in Obsidian plugin

---

### Section G: File Format

**G1. Frontmatter:** Configurable (YAML or none)

**G2. Conversation Export:** Branch chat context menu option - "Copy to Obsidian" / "Send to Obsidian"

