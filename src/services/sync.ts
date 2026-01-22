/**
 * Think Forge Sync - Sync Service
 * Handles synchronization logic between extension and vault
 */

import { App, Notice } from 'obsidian';
import {
    ThinkForgeBranch,
    ForgeDoc,
    DocKit,
    FolderMapping,
    SyncPushRequest,
    SyncPushResponse,
    SyncPullResponse,
    SyncError,
    ThinkForgeSyncSettings,
} from '../types';
import { StorageService } from './storage';

export class SyncService {
    private app: App;
    private storage: StorageService;
    private settings: ThinkForgeSyncSettings;
    private syncInProgress: boolean = false;

    constructor(app: App, storage: StorageService, settings: ThinkForgeSyncSettings) {
        this.app = app;
        this.storage = storage;
        this.settings = settings;
    }

    updateSettings(settings: ThinkForgeSyncSettings): void {
        this.settings = settings;
    }

    isSyncing(): boolean {
        return this.syncInProgress;
    }

    // ============================================================
    // Push Sync (Extension -> Obsidian)
    // ============================================================

    async handlePush(request: SyncPushRequest): Promise<SyncPushResponse> {
        if (this.syncInProgress) {
            throw new Error('Sync already in progress');
        }

        this.syncInProgress = true;
        const errors: SyncError[] = [];
        const processed = {
            folders: 0,
            branches: 0,
            forgeDocs: 0,
            docKits: 0,
        };

        // Get base path and project name
        const basePath = this.settings.basePath || this.settings.defaultSyncFolder || 'ThinkForge';
        const projectName = request.projectName || 'Default';
        const projectPath = `${basePath}/${projectName}`;
        try {
            // Create folder structure first
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
                            itemType: 'folder',
                            error: e instanceof Error ? e.message : String(e),
                        });
                    }
                }
            }

            // Process branches (chats)
            if (request.branches) {
                for (const branch of request.branches) {
                    try {
                        await this.storage.saveBranchToProject(branch, projectPath);
                        processed.branches++;
                    } catch (e) {
                        errors.push({
                            itemId: branch.id,
                            itemType: 'branch',
                            error: e instanceof Error ? e.message : String(e),
                        });
                    }
                }
            }

            // Process Forge Docs
            if (request.forgeDocs) {
                for (const doc of request.forgeDocs) {
                    try {
                        await this.storage.saveForgeDocToProject(doc, projectPath);
                        processed.forgeDocs++;
                    } catch (e) {
                        errors.push({
                            itemId: doc.id,
                            itemType: 'forgeDoc',
                            error: e instanceof Error ? e.message : String(e),
                        });
                    }
                }
            }

            // Process DocKits
            if (request.docKits) {
                for (const docKit of request.docKits) {
                    try {
                        await this.storage.saveDocKitToProject(docKit, projectPath);
                        processed.docKits++;
                    } catch (e) {
                        errors.push({
                            itemId: docKit.id,
                            itemType: 'docKit',
                            error: e instanceof Error ? e.message : String(e),
                        });
                    }
                }
            }

            // Update last sync time
            this.settings.lastSync = Date.now();

            // Show notice
            const totalProcessed = processed.branches + processed.forgeDocs + processed.docKits;
            if (totalProcessed > 0) {
                new Notice(`Think Forge: Synced ${totalProcessed} items to ${projectName}`);
            }

            return { processed, errors };

        } finally {
            this.syncInProgress = false;
        }
    }

    // ============================================================
    // Pull Sync (Obsidian -> Extension)
    // ============================================================

    async handlePull(since?: number, folderIds?: string[]): Promise<SyncPullResponse> {
        const branches: ThinkForgeBranch[] = [];
        const forgeDocs: ForgeDoc[] = [];
        const docKits: DocKit[] = [];

        // Get relevant mappings
        const mappings = folderIds
            ? this.settings.folderMappings.filter(m => folderIds.includes(m.thinkForgeFolderId))
            : this.settings.folderMappings;

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

        // Filter by timestamp if provided
        const filterByTime = (items: { updatedAt: number }[]) => {
            if (!since) return items;
            return items.filter(item => item.updatedAt > since);
        };

        return {
            branches: filterByTime(branches) as ThinkForgeBranch[],
            forgeDocs: filterByTime(forgeDocs) as ForgeDoc[],
            docKits: filterByTime(docKits) as DocKit[],
            lastSync: Date.now(),
        };
    }

    // ============================================================
    // Folder Mapping Management
    // ============================================================

    private findMapping(folderId: string): FolderMapping | undefined {
        return this.settings.folderMappings.find(m => m.thinkForgeFolderId === folderId);
    }

    private getDefaultMapping(): FolderMapping | undefined {
        if (this.settings.defaultSyncFolder) {
            return {
                thinkForgeFolderId: '__default__',
                thinkForgeFolderName: 'Default',
                obsidianPath: this.settings.defaultSyncFolder,
                createdAt: Date.now(),
                lastSync: 0,
            };
        }
        return this.settings.folderMappings[0];
    }

    async addFolderMapping(
        thinkForgeFolderId: string,
        thinkForgeFolderName: string,
        obsidianPath: string
    ): Promise<FolderMapping> {
        // Ensure folder exists
        await this.storage.ensureFolderExists(obsidianPath);

        const mapping: FolderMapping = {
            thinkForgeFolderId,
            thinkForgeFolderName,
            obsidianPath,
            createdAt: Date.now(),
            lastSync: 0,
        };

        // Remove existing mapping for this folder if exists
        this.settings.folderMappings = this.settings.folderMappings.filter(
            m => m.thinkForgeFolderId !== thinkForgeFolderId
        );

        this.settings.folderMappings.push(mapping);
        return mapping;
    }

    removeFolderMapping(thinkForgeFolderId: string): boolean {
        const initialLength = this.settings.folderMappings.length;
        this.settings.folderMappings = this.settings.folderMappings.filter(
            m => m.thinkForgeFolderId !== thinkForgeFolderId
        );
        return this.settings.folderMappings.length < initialLength;
    }

    getFolderMappings(): FolderMapping[] {
        return [...this.settings.folderMappings];
    }

    // ============================================================
    // Auto Sync
    // ============================================================

    private autoSyncInterval: ReturnType<typeof setInterval> | null = null;

    startAutoSync(): void {
        if (!this.settings.autoSync) return;
        
        this.stopAutoSync();
        
        const intervalMs = this.settings.syncIntervalMinutes * 60 * 1000;
        this.autoSyncInterval = setInterval(() => {
            // Auto sync is a placeholder - in HTTP-only mode, 
            // the extension initiates all syncs via HTTP push
            if (this.settings.debugMode) {
                console.log('Think Forge: Auto sync interval tick (no-op in HTTP-only mode)');
            }
        }, intervalMs);
    }

    stopAutoSync(): void {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
        }
    }
}

