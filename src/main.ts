/**
 * Think Forge Sync - Main Plugin Entry
 * Obsidian plugin for syncing with Think Forge Chat browser extension
 * One-way sync: Extension → Obsidian (HTTP only)
 */

import { Plugin, Notice } from 'obsidian';
import { ThinkForgeSyncSettings, DEFAULT_SETTINGS } from './types';
import { StorageService } from './services/storage';
import { SyncService } from './services/sync';
import { ApiEndpoints } from './api/endpoints';
import { HttpServer } from './server';
import { ThinkForgeSyncSettingTab } from './settings';

export default class ThinkForgeSyncPlugin extends Plugin {
    settings: ThinkForgeSyncSettings = DEFAULT_SETTINGS;
    
    private storageService!: StorageService;
    private syncService!: SyncService;
    private apiEndpoints!: ApiEndpoints;
    private httpServer!: HttpServer;

    async onload(): Promise<void> {
        // Load settings
        await this.loadSettings();

        // Initialize services
        this.storageService = new StorageService(this.app);
        this.syncService = new SyncService(this.app, this.storageService, this.settings);
        
        // Create API endpoints and HTTP server
        this.apiEndpoints = new ApiEndpoints(
            this.app, 
            this.syncService, 
            this.settings,
            this.manifest.version
        );
        this.httpServer = new HttpServer(this.apiEndpoints, this.settings);

        // Add settings tab
        this.addSettingTab(new ThinkForgeSyncSettingTab(this.app, this));

        // Add ribbon icon - triggers manual sync
        this.addRibbonIcon('sync', 'Think Forge Sync', async () => {
            await this.triggerManualSync();
        });

        // Add commands
        this.addCommand({
            id: 'start-server',
            name: 'Start sync server',
            callback: async () => {
                await this.startServer();
            }
        });

        this.addCommand({
            id: 'stop-server',
            name: 'Stop sync server',
            callback: async () => {
                await this.stopServer();
            }
        });

        this.addCommand({
            id: 'toggle-server',
            name: 'Toggle sync server',
            callback: async () => {
                if (this.httpServer.isServerRunning()) {
                    await this.stopServer();
                } else {
                    await this.startServer();
                }
            }
        });

        this.addCommand({
            id: 'manual-sync',
            name: 'Sync now',
            callback: async () => {
                await this.triggerManualSync();
            }
        });

        this.addCommand({
            id: 'show-status',
            name: 'Show sync status',
            callback: () => {
                const running = this.httpServer.isServerRunning();
                
                new Notice(
                    `Think Forge Status:\n` +
                    `• Server: ${running ? '✅ Running' : '❌ Stopped'}\n` +
                    `• Port: ${this.settings.serverPort}\n` +
                    `• Base path: ${this.settings.basePath || 'ThinkForge'}\n` +
                    `• Mode: Extension → Obsidian (one-way)`
                );
            }
        });

        // Start server if enabled (use onLayoutReady for proper initialization)
        if (this.settings.serverEnabled) {
            this.app.workspace.onLayoutReady(async () => {
                try {
                    await this.startServer();
                } catch (e) {
                    console.error('Think Forge Sync: Failed to start server:', e);
                }
            });
        }

        // Start auto sync if enabled
        if (this.settings.autoSync) {
            this.syncService.startAutoSync();
        }

        if (this.settings.debugMode) {
            console.log('Think Forge Sync: Plugin loaded (one-way: Extension → Obsidian)');
            console.log('Think Forge Sync: Settings:', {
                serverPort: this.settings.serverPort,
                serverEnabled: this.settings.serverEnabled,
                basePath: this.settings.basePath || 'ThinkForge',
            });
        }
    }

    async onunload(): Promise<void> {
        // Stop server
        await this.stopServer();
        
        // Stop auto sync
        this.syncService.stopAutoSync();

        if (this.settings.debugMode) {
            console.log('Think Forge Sync: Plugin unloaded');
        }
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        
        // Update services with new settings
        this.syncService.updateSettings(this.settings);
        this.httpServer.updateSettings(this.settings);
        this.apiEndpoints.updateSettings(this.settings);
    }

    // ============================================================
    // Server Control
    // ============================================================

    async startServer(): Promise<void> {
        try {
            await this.httpServer.start();
            new Notice(`Think Forge Sync: Server started on port ${this.settings.serverPort}`);
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Unknown error';
            new Notice(`Think Forge Sync: Failed to start server - ${message}`);
            console.error('Think Forge Sync:', e);
        }
    }

    async stopServer(): Promise<void> {
        await this.httpServer.stop();
        new Notice('Think Forge Sync: Server stopped');
    }

    isServerRunning(): boolean {
        return this.httpServer?.isServerRunning() ?? false;
    }

    // ============================================================
    // Public API for other plugins or scripts
    // ============================================================

    getSettings(): ThinkForgeSyncSettings {
        return { ...this.settings };
    }

    async triggerSync(): Promise<void> {
        if (!this.httpServer.isServerRunning()) {
            throw new Error('Server is not running');
        }
        await this.triggerManualSync();
    }

    /**
     * Trigger a manual sync - useful for testing and user-initiated syncs
     * Note: This is one-way sync (Extension → Obsidian). The extension pushes data via HTTP.
     * This command just confirms the server is ready to receive.
     */
    async triggerManualSync(): Promise<void> {
        if (!this.httpServer.isServerRunning()) {
            new Notice('⚠️ Think Forge server is not running. Enable it in settings.');
            return;
        }

        new Notice(
            `✅ Think Forge server ready!\n` +
            `• Port: ${this.settings.serverPort}\n` +
            `• Use the Chrome extension to push data to Obsidian.`
        );
    }
}

