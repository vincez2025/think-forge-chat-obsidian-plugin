/**
 * Think Forge Sync - Type Definitions
 * Shared types for Obsidian plugin and Chrome extension communication
 * One-way sync: Extension → Obsidian (HTTP only)
 */

// ============================================================
// Core Data Models
// ============================================================

export interface ThinkForgeFolder {
    id: string;
    name: string;
    color?: string;
    icon?: string;
    type?: string;  // 'dockit' or regular folder
    path?: string;  // Computed folder path for sync
    parentId?: string;
    projectId?: string;
    obsidianPath?: string;  // Mapped Obsidian vault path
    branches?: ThinkForgeBranch[];
    createdAt: number;
    updatedAt: number;
}

export interface ThinkForgeBranch {
    id: string;
    folderId?: string;
    folderPath?: string;  // Computed folder path for sync
    title: string;
    platform: string;
    url: string;
    messages: ThinkForgeMessage[];
    createdAt: number;
    updatedAt: number;
    obsidianSynced?: boolean;
    obsidianPath?: string;
}

export interface ThinkForgeMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    platform?: string;
}

export interface ForgeDoc {
    id: string;
    title: string;
    content: string;
    folderId?: string;
    folderPath?: string;  // Computed folder path for sync
    projectId?: string;
    tags: string[];
    createdAt: number;
    updatedAt: number;
    obsidianSynced?: boolean;
    obsidianPath?: string;
}

export interface DocKit {
    id: string;
    name: string;
    description?: string;
    folderPath?: string;  // Computed folder path for sync
    projectId?: string;
    items: DocKitItem[];
    folderId?: string;
    createdAt: number;
    updatedAt: number;
    obsidianSynced?: boolean;
    obsidianPath?: string;
}

export interface DocKitItem {
    id: string;
    type: 'url' | 'file' | 'text';
    title: string;
    content: string;
    url?: string;
    metadata?: Record<string, unknown>;
}

// ============================================================
// Sync Models
// ============================================================

export interface FolderMapping {
    thinkForgeFolderId: string;
    thinkForgeFolderName: string;
    obsidianPath: string;
    createdAt: number;
    lastSync: number;
}

export interface SyncState {
    lastSync: number;
    folderMappings: FolderMapping[];
}

// ============================================================
// API Request/Response Types
// ============================================================

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    timestamp: number;
}

export interface HealthCheckResponse {
    status: 'ok' | 'error';
    version: string;
    vaultName: string;
    basePath: string;
    syncEnabled: boolean;
    lastSync: number | null;
}

export interface FolderMappingsResponse {
    mappings: FolderMapping[];
}

export interface SyncPushRequest {
    projectName: string;  // Project name determines folder: basePath/ProjectName/
    projectId?: string;
    preserveStructure?: boolean;  // If true, preserve original folder structure
    folders?: ThinkForgeFolder[];
    branches?: ThinkForgeBranch[];
    forgeDocs?: ForgeDoc[];
    docKits?: DocKit[];
}

export interface SyncPushResponse {
    processed: {
        folders: number;
        branches: number;
        forgeDocs: number;
        docKits: number;
    };
    errors: SyncError[];
}

export interface SyncPullRequest {
    since?: number;  // Timestamp for incremental pull
    folderIds?: string[];  // Specific folders to pull
}

export interface SyncPullResponse {
    branches: ThinkForgeBranch[];
    forgeDocs: ForgeDoc[];
    docKits: DocKit[];
    lastSync: number;
}

export interface SyncError {
    itemId: string;
    itemType: string;
    error: string;
}

// ============================================================
// Settings
// ============================================================

export interface ThinkForgeSyncSettings {
    serverPort: number;
    serverEnabled: boolean;
    autoSync: boolean;
    syncIntervalMinutes: number;
    basePath: string;  // Base folder: files go to basePath/ProjectName/
    defaultSyncFolder: string;  // Deprecated, kept for migration
    folderMappings: FolderMapping[];  // Deprecated, kept for migration
    debugMode: boolean;
    lastSync: number | null;
}

export const DEFAULT_SETTINGS: ThinkForgeSyncSettings = {
    serverPort: 9879,
    serverEnabled: true,
    autoSync: false,
    syncIntervalMinutes: 5,
    basePath: 'ThinkForge',  // Files go to: basePath/ProjectName/
    defaultSyncFolder: 'Think Forge',  // Deprecated
    folderMappings: [],  // Deprecated
    debugMode: false,
    lastSync: null,
};

// ============================================================
// Events
// ============================================================

export interface SyncEvent {
    type: 'sync_started' | 'sync_completed' | 'sync_error' | 'item_synced';
    timestamp: number;
    details?: Record<string, unknown>;
}

// ============================================================
// Markdown Frontmatter
// ============================================================

export interface BranchFrontmatter {
    thinkforge_id: string;
    thinkforge_type: 'branch';
    folder_id?: string;
    platform: string;
    url: string;
    created: string;
    updated: string;
    synced: string;
}

export interface ForgeDocFrontmatter {
    thinkforge_id: string;
    thinkforge_type: 'forgeDoc';
    folder_id?: string;
    tags: string[];
    created: string;
    updated: string;
    synced: string;
}

export interface DocKitFrontmatter {
    thinkforge_id: string;
    thinkforge_type: 'docKit';
    folder_id?: string;
    description?: string;
    created: string;
    updated: string;
    synced: string;
}
