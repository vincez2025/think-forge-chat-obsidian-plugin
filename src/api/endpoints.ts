/**
 * Think Forge Sync - API Endpoints
 * HTTP request handlers for extension communication (one-way sync)
 */

import { App } from 'obsidian';
import {
    ApiResponse,
    HealthCheckResponse,
    FolderMappingsResponse,
    SyncPushRequest,
    SyncPushResponse,
    SyncPullRequest,
    SyncPullResponse,
    FolderMapping,
    ThinkForgeSyncSettings,
} from '../types';
import { SyncService } from '../services/sync';

// ============================================================
// Input Validation Helpers
// ============================================================

interface ValidationResult {
    valid: boolean;
    error?: string;
}

function validateString(value: unknown, fieldName: string, maxLength = 1000): ValidationResult {
    if (typeof value !== 'string') {
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

function validatePath(value: unknown, fieldName: string): ValidationResult {
    const stringCheck = validateString(value, fieldName, 500);
    if (!stringCheck.valid) return stringCheck;
    
    const path = value as string;
    
    // Check for path traversal attempts
    if (path.includes('..') || path.includes('\\..') || path.includes('../')) {
        return { valid: false, error: `${fieldName} contains invalid path traversal characters` };
    }
    
    // Check for absolute paths (should be relative to vault)
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
        return { valid: false, error: `${fieldName} must be a relative path` };
    }
    
    return { valid: true };
}

function validateArray(value: unknown, fieldName: string, maxItems = 1000): ValidationResult {
    if (!Array.isArray(value)) {
        return { valid: false, error: `${fieldName} must be an array` };
    }
    if (value.length > maxItems) {
        return { valid: false, error: `${fieldName} exceeds maximum of ${maxItems} items` };
    }
    return { valid: true };
}

function validateSyncPushRequest(body: unknown): ValidationResult {
    if (!body || typeof body !== 'object') {
        return { valid: false, error: 'Request body is required' };
    }
    
    const req = body as Record<string, unknown>;
    
    // projectName is required
    const projectCheck = validateString(req.projectName, 'projectName', 200);
    if (!projectCheck.valid) return projectCheck;
    
    // Validate arrays if present
    if (req.branches !== undefined) {
        const check = validateArray(req.branches, 'branches');
        if (!check.valid) return check;
    }
    
    if (req.forgeDocs !== undefined) {
        const check = validateArray(req.forgeDocs, 'forgeDocs');
        if (!check.valid) return check;
    }
    
    if (req.docKits !== undefined) {
        const check = validateArray(req.docKits, 'docKits');
        if (!check.valid) return check;
    }
    
    if (req.folders !== undefined) {
        const check = validateArray(req.folders, 'folders');
        if (!check.valid) return check;
    }
    
    return { valid: true };
}

function validateCreateMappingRequest(body: unknown): ValidationResult {
    if (!body || typeof body !== 'object') {
        return { valid: false, error: 'Request body is required' };
    }
    
    const req = body as Record<string, unknown>;
    
    const idCheck = validateString(req.thinkForgeFolderId, 'thinkForgeFolderId', 100);
    if (!idCheck.valid) return idCheck;
    
    const nameCheck = validateString(req.thinkForgeFolderName, 'thinkForgeFolderName', 200);
    if (!nameCheck.valid) return nameCheck;
    
    const pathCheck = validatePath(req.obsidianPath, 'obsidianPath');
    if (!pathCheck.valid) return pathCheck;
    
    return { valid: true };
}

// ============================================================
// API Endpoints Class
// ============================================================

export class ApiEndpoints {
    private app: App;
    private syncService: SyncService;
    private settings: ThinkForgeSyncSettings;
    private version: string;

    constructor(
        app: App,
        syncService: SyncService,
        settings: ThinkForgeSyncSettings,
        version: string
    ) {
        this.app = app;
        this.syncService = syncService;
        this.settings = settings;
        this.version = version;
    }

    updateSettings(settings: ThinkForgeSyncSettings): void {
        this.settings = settings;
        this.syncService.updateSettings(settings);
    }

    // ============================================================
    // Health Check & Status
    // ============================================================

    handleHealthCheck(): ApiResponse<HealthCheckResponse> {
        const vaultName = this.app.vault.getName();
        
        return {
            success: true,
            data: {
                status: 'ok',
                version: this.version,
                vaultName,
                basePath: this.settings.basePath || 'ThinkForge',
                syncEnabled: this.settings.serverEnabled,
                lastSync: this.settings.lastSync,
            },
            timestamp: Date.now(),
        };
    }

    /**
     * Handle /status endpoint - used by extension for connection check
     */
    handleStatus(): ApiResponse<{
        vault: { name: string; path: string };
        basePath: string;
        syncFolders: FolderMapping[];
    }> {
        const vaultName = this.app.vault.getName();
        const vaultPath = (this.app.vault.adapter as { basePath?: string }).basePath || '';
        
        return {
            success: true,
            data: {
                vault: {
                    name: vaultName,
                    path: vaultPath,
                },
                basePath: this.settings.basePath || 'ThinkForge',
                syncFolders: this.syncService.getFolderMappings(),
            },
            timestamp: Date.now(),
        };
    }

    // ============================================================
    // Folder Mappings
    // ============================================================

    handleGetMappings(): ApiResponse<FolderMappingsResponse> {
        return {
            success: true,
            data: {
                mappings: this.syncService.getFolderMappings(),
            },
            timestamp: Date.now(),
        };
    }

    async handleCreateMapping(body: unknown): Promise<ApiResponse<FolderMapping>> {
        // Validate input
        const validation = validateCreateMappingRequest(body);
        if (!validation.valid) {
            return {
                success: false,
                error: validation.error,
                timestamp: Date.now(),
            };
        }
        
        const req = body as {
            thinkForgeFolderId: string;
            thinkForgeFolderName: string;
            obsidianPath: string;
        };
        
        try {
            const mapping = await this.syncService.addFolderMapping(
                req.thinkForgeFolderId,
                req.thinkForgeFolderName,
                req.obsidianPath
            );

            return {
                success: true,
                data: mapping,
                timestamp: Date.now(),
            };
        } catch (e) {
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                timestamp: Date.now(),
            };
        }
    }

    handleDeleteMapping(folderId: string): ApiResponse<{ deleted: boolean }> {
        // Validate folder ID
        if (!folderId || typeof folderId !== 'string' || folderId.length > 100) {
            return {
                success: false,
                error: 'Invalid folder ID',
                timestamp: Date.now(),
            };
        }
        
        const deleted = this.syncService.removeFolderMapping(folderId);
        
        return {
            success: true,
            data: { deleted },
            timestamp: Date.now(),
        };
    }

    // ============================================================
    // Sync Operations
    // ============================================================

    async handleSyncPush(body: unknown): Promise<ApiResponse<SyncPushResponse>> {
        // Validate input
        const validation = validateSyncPushRequest(body);
        if (!validation.valid) {
            return {
                success: false,
                error: validation.error,
                timestamp: Date.now(),
            };
        }
        
        try {
            if (this.syncService.isSyncing()) {
                return {
                    success: false,
                    error: 'Sync already in progress',
                    timestamp: Date.now(),
                };
            }

            const result = await this.syncService.handlePush(body as SyncPushRequest);

            return {
                success: true,
                data: result,
                timestamp: Date.now(),
            };
        } catch (e) {
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                timestamp: Date.now(),
            };
        }
    }

    async handleSyncPull(body: unknown): Promise<ApiResponse<SyncPullResponse>> {
        // Basic validation - body is optional for pull
        if (body !== undefined && body !== null && typeof body !== 'object') {
            return {
                success: false,
                error: 'Invalid request body',
                timestamp: Date.now(),
            };
        }
        
        try {
            const req = (body || {}) as SyncPullRequest;
            const result = await this.syncService.handlePull(req.since, req.folderIds);

            return {
                success: true,
                data: result,
                timestamp: Date.now(),
            };
        } catch (e) {
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                timestamp: Date.now(),
            };
        }
    }

    // ============================================================
    // Vault Information
    // ============================================================

    handleGetFolders(): ApiResponse<{ folders: string[] }> {
        const folders: string[] = [];
        
        const getAllFolders = (path: string) => {
            const folder = this.app.vault.getAbstractFileByPath(path);
            if (folder && 'children' in folder) {
                folders.push(path || '/');
                for (const child of (folder as { children: { path: string; name: string }[] }).children) {
                    if ('children' in (this.app.vault.getAbstractFileByPath(child.path) || {})) {
                        getAllFolders(child.path);
                    }
                }
            }
        };

        getAllFolders('');
        
        return {
            success: true,
            data: { folders: folders.filter(f => f !== '/').sort() },
            timestamp: Date.now(),
        };
    }

    // ============================================================
    // Request Router
    // ============================================================

    async handleRequest(
        method: string,
        path: string,
        body?: unknown
    ): Promise<ApiResponse> {
        // Normalize path
        const normalizedPath = path.replace(/^\/+|\/+$/g, '');
        const segments = normalizedPath.split('/');

        try {
            // Route: GET /health
            if (method === 'GET' && normalizedPath === 'health') {
                return this.handleHealthCheck();
            }

            // Route: GET /ping (alias for health, used by extension)
            if (method === 'GET' && normalizedPath === 'ping') {
                return this.handleHealthCheck();
            }

            // Route: GET /status (connection status for extension)
            if (method === 'GET' && normalizedPath === 'status') {
                return this.handleStatus();
            }

            // Route: GET /folders
            if (method === 'GET' && normalizedPath === 'folders') {
                return this.handleGetFolders();
            }

            // Route: GET /mappings
            if (method === 'GET' && normalizedPath === 'mappings') {
                return this.handleGetMappings();
            }

            // Route: POST /mappings
            if (method === 'POST' && normalizedPath === 'mappings') {
                return await this.handleCreateMapping(body);
            }

            // Route: DELETE /mappings/:folderId
            if (method === 'DELETE' && segments[0] === 'mappings' && segments[1]) {
                return this.handleDeleteMapping(decodeURIComponent(segments[1]));
            }

            // Route: POST /sync/push
            if (method === 'POST' && normalizedPath === 'sync/push') {
                return await this.handleSyncPush(body);
            }

            // Route: POST /sync/pull
            if (method === 'POST' && normalizedPath === 'sync/pull') {
                return await this.handleSyncPull(body);
            }

            // 404 - Not Found
            return {
                success: false,
                error: `Unknown endpoint: ${method} /${normalizedPath}`,
                timestamp: Date.now(),
            };

        } catch (e) {
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
                timestamp: Date.now(),
            };
        }
    }
}
