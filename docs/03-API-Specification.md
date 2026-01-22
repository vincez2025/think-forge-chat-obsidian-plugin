# Obsidian Plugin - API Specification

**Version:** 1.0  
**Date:** January 15, 2026  
**Status:** 📋 Specification

---

## Overview

The Obsidian plugin runs an HTTP server on localhost that the Think Forge Chat extension communicates with. This document defines the API contract between the two systems.

---

## Server Configuration

| Setting | Value |
|---------|-------|
| Host | `127.0.0.1` (localhost only) |
| Port | Auto-detect available, fallback `9879` |
| Protocol | HTTP (not HTTPS - localhost only) |
| Auth | None |
| CORS | Allow origin `chrome-extension://*` |

---

## Base URL

```
http://localhost:{port}/api/v1
```

---

## Endpoints

### Health & Status

#### `GET /status`
Health check endpoint. Extension polls this to detect if Obsidian plugin is running.

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "vault": {
    "name": "My Vault",
    "path": "C:/Users/me/Documents/Obsidian/My Vault"
  },
  "syncFolders": [
    {
      "obsidianPath": "Think Forge",
      "thinkForgeFolder": "tf-folder-123",
      "direction": "both",
      "lastSync": "2026-01-15T10:30:00Z"
    }
  ],
  "timestamp": "2026-01-15T10:30:00Z"
}
```

**Error Response (503):**
```json
{
  "status": "error",
  "error": "Vault not loaded"
}
```

---

### Folder Sync Configuration

#### `GET /sync/folders`
List all configured sync folders.

**Response:**
```json
{
  "folders": [
    {
      "id": "sync-folder-001",
      "obsidianPath": "Think Forge/Projects",
      "thinkForgeFolderId": "tf-folder-123",
      "thinkForgeFolderName": "Projects",
      "direction": "both",
      "created": "2026-01-15T10:00:00Z",
      "lastSync": "2026-01-15T10:30:00Z",
      "itemCount": 42
    }
  ]
}
```

#### `POST /sync/folders`
Add a new sync folder mapping.

**Request:**
```json
{
  "obsidianPath": "Think Forge/Projects",
  "thinkForgeFolderId": "tf-folder-123",
  "thinkForgeFolderName": "Projects",
  "direction": "both"
}
```

**Response:**
```json
{
  "success": true,
  "folder": {
    "id": "sync-folder-001",
    "obsidianPath": "Think Forge/Projects",
    "thinkForgeFolderId": "tf-folder-123",
    "direction": "both",
    "created": "2026-01-15T10:30:00Z"
  }
}
```

#### `DELETE /sync/folders/:id`
Remove a sync folder mapping.

**Response:**
```json
{
  "success": true,
  "deleted": "sync-folder-001"
}
```

---

### Notes/Documents

#### `GET /notes`
List notes in synced folders.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `folder` | string | Filter by sync folder ID |
| `since` | ISO8601 | Only notes modified since timestamp |
| `limit` | number | Max results (default 100) |
| `offset` | number | Pagination offset |

**Response:**
```json
{
  "notes": [
    {
      "id": "note-abc123",
      "title": "Project Alpha Notes",
      "path": "Think Forge/Projects/Project Alpha Notes.md",
      "syncFolderId": "sync-folder-001",
      "tags": ["project", "alpha", "planning"],
      "created": "2026-01-10T09:00:00Z",
      "modified": "2026-01-15T10:30:00Z",
      "size": 4523,
      "frontmatter": {
        "id": "tf-doc-xyz",
        "source": "think-forge",
        "platform": "chatgpt"
      }
    }
  ],
  "total": 42,
  "hasMore": false
}
```

#### `GET /notes/:id`
Get full note content.

**Response:**
```json
{
  "id": "note-abc123",
  "title": "Project Alpha Notes",
  "path": "Think Forge/Projects/Project Alpha Notes.md",
  "content": "# Project Alpha Notes\n\n...",
  "tags": ["project", "alpha"],
  "frontmatter": {
    "id": "tf-doc-xyz",
    "source": "think-forge"
  },
  "created": "2026-01-10T09:00:00Z",
  "modified": "2026-01-15T10:30:00Z"
}
```

#### `POST /notes`
Create or update a note (Think Forge → Obsidian).

**Request:**
```json
{
  "syncFolderId": "sync-folder-001",
  "title": "ChatGPT - React Hooks Discussion",
  "content": "# React Hooks Discussion\n\n## Question\nHow do I use useEffect?...",
  "tags": ["react", "hooks", "chatgpt"],
  "frontmatter": {
    "id": "tf-conv-12345",
    "source": "think-forge",
    "type": "conversation",
    "platform": "chatgpt",
    "created": "2026-01-15T10:00:00Z"
  },
  "existingNoteId": null
}
```

**Response:**
```json
{
  "success": true,
  "note": {
    "id": "note-new123",
    "path": "Think Forge/Projects/ChatGPT - React Hooks Discussion.md",
    "created": false,
    "updated": true,
    "timestamp": "2026-01-15T10:30:00Z"
  }
}
```

#### `DELETE /notes/:id`
Delete a note (soft delete - moves to trash or marks deleted).

**Response:**
```json
{
  "success": true,
  "action": "moved_to_trash",
  "note": "note-abc123"
}
```

---

### Sync Operations

#### `GET /sync/changes`
Get changes since last sync (for dirty flag mechanism).

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `since` | ISO8601 | Timestamp of last sync |
| `folder` | string | Filter by sync folder ID |

**Response:**
```json
{
  "changes": [
    {
      "type": "created",
      "noteId": "note-new456",
      "path": "Think Forge/Projects/New Note.md",
      "timestamp": "2026-01-15T10:25:00Z"
    },
    {
      "type": "modified",
      "noteId": "note-abc123",
      "path": "Think Forge/Projects/Existing Note.md",
      "timestamp": "2026-01-15T10:28:00Z"
    },
    {
      "type": "deleted",
      "noteId": "note-old789",
      "path": "Think Forge/Projects/Old Note.md",
      "timestamp": "2026-01-15T10:29:00Z"
    }
  ],
  "syncTimestamp": "2026-01-15T10:30:00Z"
}
```

#### `POST /sync/acknowledge`
Acknowledge sync completion (update last sync timestamp).

**Request:**
```json
{
  "syncFolderId": "sync-folder-001",
  "timestamp": "2026-01-15T10:30:00Z",
  "itemsSynced": 5
}
```

**Response:**
```json
{
  "success": true,
  "nextSyncCheck": "2026-01-15T10:31:00Z"
}
```

---

### Import Operations

#### `POST /import/conversation`
Import a Think Forge conversation as a note.

**Request:**
```json
{
  "syncFolderId": "sync-folder-001",
  "conversation": {
    "id": "tf-conv-12345",
    "title": "React Hooks Help",
    "platform": "chatgpt",
    "url": "https://chatgpt.com/c/abc123",
    "created": "2026-01-15T10:00:00Z",
    "qaPairs": [
      {
        "question": "How do I use useEffect?",
        "answer": "useEffect is a React Hook that...",
        "timestamp": "2026-01-15T10:01:00Z"
      },
      {
        "question": "What about cleanup?",
        "answer": "You can return a cleanup function...",
        "timestamp": "2026-01-15T10:02:00Z"
      }
    ],
    "tags": ["react", "hooks"]
  },
  "options": {
    "includeFrontmatter": true,
    "format": "single_file"
  }
}
```

**Response:**
```json
{
  "success": true,
  "note": {
    "id": "note-imported123",
    "path": "Think Forge/Projects/React Hooks Help.md",
    "timestamp": "2026-01-15T10:30:00Z"
  }
}
```

#### `POST /import/forgedoc`
Import a Forge Doc as a note.

**Request:**
```json
{
  "syncFolderId": "sync-folder-001",
  "forgeDoc": {
    "id": "tf-doc-xyz",
    "title": "API Design Notes",
    "content": "# API Design\n\n...",
    "tags": ["api", "design"],
    "created": "2026-01-15T09:00:00Z",
    "modified": "2026-01-15T10:00:00Z"
  },
  "options": {
    "includeFrontmatter": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "note": {
    "id": "note-doc456",
    "path": "Think Forge/Projects/API Design Notes.md",
    "timestamp": "2026-01-15T10:30:00Z"
  }
}
```

---

### Settings

#### `GET /settings`
Get plugin settings.

**Response:**
```json
{
  "port": 9879,
  "autoSync": true,
  "syncInterval": 60,
  "frontmatterEnabled": true,
  "conflictResolution": "last_write_wins",
  "duplicateHandling": "create_copy"
}
```

#### `PUT /settings`
Update plugin settings.

**Request:**
```json
{
  "autoSync": true,
  "syncInterval": 30,
  "frontmatterEnabled": true
}
```

**Response:**
```json
{
  "success": true,
  "settings": { ... }
}
```

---

## Error Responses

All endpoints return consistent error format:

```json
{
  "success": false,
  "error": {
    "code": "FOLDER_NOT_FOUND",
    "message": "Sync folder not found",
    "details": {
      "folderId": "sync-folder-999"
    }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VAULT_NOT_LOADED` | 503 | Obsidian vault not ready |
| `FOLDER_NOT_FOUND` | 404 | Sync folder doesn't exist |
| `NOTE_NOT_FOUND` | 404 | Note doesn't exist |
| `INVALID_REQUEST` | 400 | Malformed request |
| `CONFLICT` | 409 | Sync conflict detected |
| `INTERNAL_ERROR` | 500 | Unexpected error |

---

## CORS Configuration

The server must include these headers for Chrome extension access:

```
Access-Control-Allow-Origin: chrome-extension://*
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 86400
```

---

## Rate Limiting

No rate limiting for localhost communication. The extension should self-throttle polling to reasonable intervals (recommended: 5-10 seconds for status checks).


