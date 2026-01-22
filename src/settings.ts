/**
 * Think Forge Sync - Settings Tab
 * Plugin settings UI
 */

import { App, PluginSettingTab, Setting, Notice, Modal, TextComponent, DropdownComponent } from 'obsidian';
import type ThinkForgeSyncPlugin from './main';
import { ThinkForgeSyncSettings, FolderMapping } from './types';

// ============================================================
// Add Mapping Modal
// ============================================================

interface ThinkForgeFolder {
    id: string;
    name: string;
}

class AddMappingModal extends Modal {
    plugin: ThinkForgeSyncPlugin;
    onSave: () => void;
    
    private tfFolders: ThinkForgeFolder[] = [];
    private obsidianFolders: string[] = [];
    private selectedTfFolder: ThinkForgeFolder | null = null;
    private obsidianPath: string = '';

    constructor(app: App, plugin: ThinkForgeSyncPlugin, onSave: () => void) {
        super(app);
        this.plugin = plugin;
        this.onSave = onSave;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('think-forge-mapping-modal');

        contentEl.createEl('h2', { text: 'Add Folder Mapping' });

        // Loading state
        const loadingEl = contentEl.createEl('p', { text: 'Loading folders...' });

        // Fetch folders from both sides
        await this.loadFolders();
        loadingEl.remove();

        // Check if we have TF folders
        if (this.tfFolders.length === 0) {
            contentEl.createEl('p', { 
                text: '⚠️ No Think Forge folders found.',
                cls: 'think-forge-warning'
            });
            contentEl.createEl('p', { 
                text: 'Make sure the Think Forge Chrome extension is running and connected.',
                cls: 'setting-item-description'
            });
            
            const closeBtn = contentEl.createEl('button', { text: 'Close' });
            closeBtn.addEventListener('click', () => this.close());
            return;
        }

        // Think Forge folder dropdown
        new Setting(contentEl)
            .setName('Think Forge Folder')
            .setDesc('Select a folder from Think Forge to sync')
            .addDropdown(dropdown => {
                dropdown.addOption('', 'Select a folder...');
                for (const folder of this.tfFolders) {
                    dropdown.addOption(folder.id, folder.name);
                }
                dropdown.onChange(value => {
                    this.selectedTfFolder = this.tfFolders.find(f => f.id === value) || null;
                    // Auto-suggest obsidian path
                    if (this.selectedTfFolder) {
                        this.obsidianPath = `Think Forge/${this.selectedTfFolder.name}`;
                        (obsidianPathInput as any).setValue(this.obsidianPath);
                    }
                });
            });

        // Obsidian folder input with suggestions
        let obsidianPathInput: TextComponent;
        new Setting(contentEl)
            .setName('Obsidian Vault Path')
            .setDesc('Where to save synced items (folder will be created if needed)')
            .addText(text => {
                obsidianPathInput = text;
                text.setPlaceholder('Think Forge/MyFolder')
                    .setValue(this.obsidianPath)
                    .onChange(value => {
                        this.obsidianPath = value;
                    });
            });

        // Existing vault folders (for reference)
        if (this.obsidianFolders.length > 0) {
            const suggestionEl = contentEl.createEl('div', { cls: 'think-forge-folder-suggestions' });
            suggestionEl.createEl('span', { text: 'Existing folders: ', cls: 'setting-item-description' });
            
            const folderList = suggestionEl.createEl('div', { cls: 'think-forge-folder-list' });
            for (const folder of this.obsidianFolders.slice(0, 10)) {
                const btn = folderList.createEl('button', { text: folder, cls: 'think-forge-folder-btn' });
                btn.addEventListener('click', () => {
                    this.obsidianPath = folder;
                    (obsidianPathInput as any).setValue(folder);
                });
            }
        }

        // Buttons
        const buttonContainer = contentEl.createEl('div', { cls: 'think-forge-modal-buttons' });
        
        const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const saveBtn = buttonContainer.createEl('button', { text: 'Add Mapping', cls: 'mod-cta' });
        saveBtn.addEventListener('click', async () => {
            await this.saveMapping();
        });

        // Add styles
        this.addStyles(contentEl);
    }

    async loadFolders() {
        // Note: Folder mappings are typically created from the Chrome extension side
        // This modal allows manual mapping if needed

        // Get Obsidian vault folders
        try {
            const folders: string[] = [];
            const files = this.app.vault.getAllLoadedFiles();
            for (const file of files) {
                if (file.hasOwnProperty('children')) {
                    folders.push(file.path);
                }
            }
            this.obsidianFolders = folders.sort();
        } catch (e) {
            if (this.plugin.settings.debugMode) {
                console.error('Think Forge Sync: Failed to load vault folders:', e);
            }
        }
    }

    async saveMapping() {
        if (!this.selectedTfFolder) {
            new Notice('Please select a Think Forge folder');
            return;
        }

        if (!this.obsidianPath.trim()) {
            new Notice('Please enter an Obsidian vault path');
            return;
        }

        // Check for duplicate
        const existing = this.plugin.settings.folderMappings.find(
            m => m.thinkForgeFolderId === this.selectedTfFolder!.id
        );
        if (existing) {
            new Notice('This Think Forge folder is already mapped');
            return;
        }

        // Create mapping
        const mapping: FolderMapping = {
            thinkForgeFolderId: this.selectedTfFolder.id,
            thinkForgeFolderName: this.selectedTfFolder.name,
            obsidianPath: this.obsidianPath.trim(),
            createdAt: Date.now(),
            lastSync: 0,
        };

        this.plugin.settings.folderMappings.push(mapping);
        await this.plugin.saveSettings();

        new Notice(`Mapping added: ${this.selectedTfFolder.name} → ${this.obsidianPath}`);
        this.onSave();
        this.close();
    }

    addStyles(container: HTMLElement) {
        const style = container.createEl('style');
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
}

export class ThinkForgeSyncSettingTab extends PluginSettingTab {
    plugin: ThinkForgeSyncPlugin;

    constructor(app: App, plugin: ThinkForgeSyncPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Header
        containerEl.createEl('h1', { text: 'Think Forge Sync' });
        containerEl.createEl('p', { 
            text: 'Sync your Think Forge conversations, Forge Docs, and DocKits with your Obsidian vault.',
            cls: 'setting-item-description'
        });

        // ============================================================
        // Server Settings
        // ============================================================
        
        containerEl.createEl('h2', { text: 'Server Settings' });

        new Setting(containerEl)
            .setName('Enable sync server')
            .setDesc('Start a local HTTP server to receive data from the Think Forge extension')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.serverEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.serverEnabled = value;
                    await this.plugin.saveSettings();
                    
                    if (value) {
                        await this.plugin.startServer();
                    } else {
                        await this.plugin.stopServer();
                    }
                })
            );

        new Setting(containerEl)
            .setName('Server port')
            .setDesc('Port number for the local sync server (default: 9879)')
            .addText(text => text
                .setPlaceholder('9879')
                .setValue(String(this.plugin.settings.serverPort))
                .onChange(async (value) => {
                    const port = parseInt(value, 10);
                    if (!isNaN(port) && port > 0 && port < 65536) {
                        this.plugin.settings.serverPort = port;
                        await this.plugin.saveSettings();
                    }
                })
            );

        // Server status indicator
        const serverStatus = containerEl.createEl('div', { cls: 'think-forge-server-status' });
        this.updateServerStatus(serverStatus);

        // ============================================================
        // Sync Location
        // ============================================================

        containerEl.createEl('h2', { text: 'Sync Location' });

        new Setting(containerEl)
            .setName('Base folder')
            .setDesc('Files are saved to: BasePath/ProjectName/Chats/ and BasePath/ProjectName/Forge Docs/')
            .addText(text => text
                .setPlaceholder('ThinkForge')
                .setValue(this.plugin.settings.basePath || 'ThinkForge')
                .onChange(async (value) => {
                    this.plugin.settings.basePath = value || 'ThinkForge';
                    await this.plugin.saveSettings();
                })
            );

        // Show example path
        containerEl.createEl('p', {
            text: `Example: ${this.plugin.settings.basePath || 'ThinkForge'}/My Project/Chats/conversation.md`,
            cls: 'setting-item-description'
        });

        // ============================================================
        // Auto Sync Settings
        // ============================================================

        containerEl.createEl('h2', { text: 'Auto Sync' });

        new Setting(containerEl)
            .setName('Enable auto sync')
            .setDesc('Automatically sync changes at regular intervals')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSync)
                .onChange(async (value) => {
                    this.plugin.settings.autoSync = value;
                    await this.plugin.saveSettings();
                    new Notice(value ? 'Auto sync enabled' : 'Auto sync disabled');
                })
            );

        new Setting(containerEl)
            .setName('Sync interval')
            .setDesc('How often to check for changes (in minutes)')
            .addDropdown(dropdown => dropdown
                .addOption('1', '1 minute')
                .addOption('5', '5 minutes')
                .addOption('15', '15 minutes')
                .addOption('30', '30 minutes')
                .addOption('60', '1 hour')
                .setValue(String(this.plugin.settings.syncIntervalMinutes))
                .onChange(async (value) => {
                    this.plugin.settings.syncIntervalMinutes = parseInt(value, 10);
                    await this.plugin.saveSettings();
                })
            );

        // ============================================================
        // Sync Direction Info
        // ============================================================

        containerEl.createEl('h2', { text: 'Sync Direction' });
        const syncInfoDiv = containerEl.createEl('div', { cls: 'think-forge-sync-info' });
        syncInfoDiv.createEl('p', {
            text: '→ One-way sync: Think Forge Extension → Obsidian',
            cls: 'setting-item-description'
        });
        syncInfoDiv.createEl('p', {
            text: 'Changes made in the Think Forge extension are automatically exported to your Obsidian vault. Edits made in Obsidian stay local to your vault.',
            cls: 'setting-item-description'
        });

        // ============================================================
        // Debug Settings
        // ============================================================

        containerEl.createEl('h2', { text: 'Debug' });

        new Setting(containerEl)
            .setName('Debug mode')
            .setDesc('Log detailed information to the console')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debugMode)
                .onChange(async (value) => {
                    this.plugin.settings.debugMode = value;
                    await this.plugin.saveSettings();
                })
            );

        // Last sync info
        if (this.plugin.settings.lastSync) {
            const lastSyncDate = new Date(this.plugin.settings.lastSync).toLocaleString();
            containerEl.createEl('p', {
                text: `Last sync: ${lastSyncDate}`,
                cls: 'setting-item-description'
            });
        }

        // Add custom styles
        this.addStyles(containerEl);
    }

    private displayMappings(container: HTMLElement): void {
        container.empty();

        const mappings = this.plugin.settings.folderMappings;

        if (mappings.length === 0) {
            container.createEl('p', {
                text: 'No folder mappings configured. Mappings will be created when you sync from Think Forge.',
                cls: 'setting-item-description think-forge-no-mappings'
            });
        } else {
            for (const mapping of mappings) {
                this.createMappingItem(container, mapping);
            }
        }

        // Info about adding mappings
        const addContainer = container.createEl('div', { cls: 'think-forge-add-mapping-info' });
        addContainer.createEl('p', {
            text: '💡 To add a mapping, use the Think Forge Chrome extension:',
            cls: 'think-forge-add-tip'
        });
        addContainer.createEl('ol', {}).innerHTML = `
            <li>Open Think Forge extension panel</li>
            <li>Go to Settings → Plugins → Obsidian</li>
            <li>Click "Add Folder Mapping"</li>
            <li>Select a Think Forge folder and Obsidian path</li>
        `;

        // Advanced: manual mapping for power users
        const advancedContainer = container.createEl('details', { cls: 'think-forge-advanced-mapping' });
        advancedContainer.createEl('summary', { text: '⚙️ Advanced: Add manual mapping' });
        
        new Setting(advancedContainer)
            .setDesc('For power users who know the folder ID')
            .addButton(button => button
                .setButtonText('Add Manual Mapping')
                .onClick(() => {
                    this.showAddMappingModal();
                })
            );
    }

    private createMappingItem(container: HTMLElement, mapping: FolderMapping): void {
        const item = container.createEl('div', { cls: 'think-forge-mapping-item' });
        
        const info = item.createEl('div', { cls: 'think-forge-mapping-info' });
        info.createEl('span', { 
            text: mapping.thinkForgeFolderName || mapping.thinkForgeFolderId,
            cls: 'think-forge-mapping-name'
        });
        info.createEl('span', { text: ' → ' });
        info.createEl('span', { 
            text: mapping.obsidianPath,
            cls: 'think-forge-mapping-path'
        });

        const lastSync = mapping.lastSync 
            ? new Date(mapping.lastSync).toLocaleDateString()
            : 'Never';
        info.createEl('span', {
            text: ` (Last sync: ${lastSync})`,
            cls: 'think-forge-mapping-date'
        });

        const actions = item.createEl('div', { cls: 'think-forge-mapping-actions' });
        const deleteBtn = actions.createEl('button', { text: 'Remove' });
        deleteBtn.addEventListener('click', async () => {
            this.plugin.settings.folderMappings = this.plugin.settings.folderMappings.filter(
                m => m.thinkForgeFolderId !== mapping.thinkForgeFolderId
            );
            await this.plugin.saveSettings();
            this.displayMappings(container.parentElement as HTMLElement);
            new Notice('Mapping removed');
        });
    }

    private showAddMappingModal(): void {
        const modal = new AddMappingModal(this.app, this.plugin, () => {
            this.display(); // Refresh settings view after save
        });
        modal.open();
    }

    private updateServerStatus(container: HTMLElement): void {
        container.empty();
        
        const isRunning = this.plugin.isServerRunning();
        const statusClass = isRunning ? 'think-forge-status-running' : 'think-forge-status-stopped';
        const statusText = isRunning 
            ? `✓ Server running on port ${this.plugin.settings.serverPort}`
            : '✗ Server stopped';

        container.createEl('span', {
            text: statusText,
            cls: `think-forge-status ${statusClass}`
        });

        if (isRunning) {
            const testBtn = container.createEl('button', { text: 'Test Connection' });
            testBtn.addEventListener('click', async () => {
                try {
                    const response = await fetch(`http://127.0.0.1:${this.plugin.settings.serverPort}/health`);
                    const data = await response.json();
                    if (data.success) {
                        new Notice('✓ Connection successful!');
                    } else {
                        new Notice('✗ Connection failed: ' + data.error);
                    }
                } catch (e) {
                    new Notice('✗ Connection failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
                }
            });
        }
    }

    private addStyles(container: HTMLElement): void {
        const style = container.createEl('style');
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
}

