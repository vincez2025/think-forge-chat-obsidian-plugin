/**
 * Think Forge Sync - Storage Service
 * Handles reading/writing files to the Obsidian vault
 */

import { App, TFile, TFolder, normalizePath } from 'obsidian';
import {
    ThinkForgeBranch,
    ForgeDoc,
    DocKit,
    BranchFrontmatter,
    ForgeDocFrontmatter,
    DocKitFrontmatter,
    FolderMapping,
} from '../types';

export class StorageService {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    // ============================================================
    // Security: Path Validation
    // ============================================================

    /**
     * Validate and sanitize a path to prevent directory traversal attacks
     * @throws Error if path is invalid or contains traversal attempts
     */
    private validatePath(path: string): string {
        // Normalize the path first
        const normalized = normalizePath(path);
        
        // Check for path traversal attempts
        if (normalized.includes('..')) {
            throw new Error('Invalid path: directory traversal not allowed');
        }
        
        // Check for absolute paths (Windows drive letters or Unix root)
        if (/^[A-Za-z]:/.test(normalized) || normalized.startsWith('/')) {
            throw new Error('Invalid path: absolute paths not allowed');
        }
        
        // Check for null bytes (potential injection)
        if (normalized.includes('\0')) {
            throw new Error('Invalid path: contains null bytes');
        }
        
        return normalized;
    }

    /**
     * Sanitize a folder path from external input
     */
    private sanitizeFolderPath(path: string | undefined): string {
        if (!path) return '';
        
        // Remove any leading/trailing slashes and validate
        const cleaned = path.replace(/^[/\\]+|[/\\]+$/g, '');
        
        // Split and sanitize each segment
        const segments = cleaned.split(/[/\\]+/).filter(Boolean);
        const sanitizedSegments = segments.map(seg => {
            // Remove path traversal
            if (seg === '.' || seg === '..') return '';
            // Sanitize each segment as a filename
            return this.sanitizeFilename(seg);
        }).filter(Boolean);
        
        return sanitizedSegments.join('/');
    }

    // ============================================================
    // Folder Operations
    // ============================================================

    async ensureFolderExists(path: string): Promise<TFolder> {
        const normalizedPath = this.validatePath(path);
        const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
        
        if (existing instanceof TFolder) {
            return existing;
        }
        
        // Check if a file exists at this path (can't create folder)
        if (existing instanceof TFile) {
            throw new Error(`Cannot create folder: a file already exists at ${normalizedPath}`);
        }

        // Create folder recursively
        await this.app.vault.createFolder(normalizedPath);
        const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
        
        if (!(folder instanceof TFolder)) {
            throw new Error(`Failed to create folder at ${normalizedPath}`);
        }
        
        return folder;
    }

    async getFolderContents(path: string): Promise<TFile[]> {
        const normalizedPath = normalizePath(path);
        const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
        
        if (!(folder instanceof TFolder)) {
            return [];
        }

        return folder.children.filter((f): f is TFile => f instanceof TFile);
    }

    // ============================================================
    // Branch Operations
    // ============================================================

    /**
     * Save branch to project path (preserves folder structure)
     */
    async saveBranchToProject(branch: ThinkForgeBranch, projectPath: string): Promise<string> {
        // Sanitize external folder path input
        const safeFolderPath = this.sanitizeFolderPath(branch.folderPath);
        
        // Build full path
        let folderPath: string;
        if (safeFolderPath) {
            folderPath = this.validatePath(`${projectPath}/${safeFolderPath}`);
        } else {
            folderPath = this.validatePath(projectPath);
        }
        await this.ensureFolderExists(folderPath);

        const filename = this.sanitizeFilename(branch.title || `Chat ${branch.id}`);
        const filePath = normalizePath(`${folderPath}/${filename}.md`);

        const frontmatter: BranchFrontmatter = {
            thinkforge_id: branch.id,
            thinkforge_type: 'branch',
            folder_id: branch.folderId,
            platform: branch.platform,
            url: branch.url,
            created: new Date(branch.createdAt).toISOString(),
            updated: new Date(branch.updatedAt).toISOString(),
            synced: new Date().toISOString(),
        };

        const content = this.formatBranchAsMarkdown(branch, frontmatter);
        
        const existingFile = this.app.vault.getAbstractFileByPath(filePath);
        if (existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, content);
        } else {
            await this.app.vault.create(filePath, content);
        }

        return filePath;
    }

    /**
     * Legacy: Save branch using folder mapping
     */
    async saveBranch(branch: ThinkForgeBranch, mapping: FolderMapping): Promise<string> {
        return this.saveBranchToProject(branch, mapping.obsidianPath);
    }

    private formatBranchAsMarkdown(branch: ThinkForgeBranch, frontmatter: BranchFrontmatter): string {
        const fm = this.formatFrontmatter(frontmatter as unknown as Record<string, unknown>);
        
        let content = `${fm}\n`;
        content += `# ${branch.title || 'Untitled Chat'}\n\n`;
        content += `> Platform: ${branch.platform} | [Original Link](${branch.url})\n\n`;
        
        // Add tags if present
        if ((branch as any).tags && Array.isArray((branch as any).tags) && (branch as any).tags.length > 0) {
            content += `Tags: ${(branch as any).tags.map((t: string) => `#${t}`).join(' ')}\n\n`;
        }
        
        content += `---\n\n`;

        // Only process messages if they exist (conversations from storage may not have messages)
        if (branch.messages && Array.isArray(branch.messages)) {
            for (const msg of branch.messages) {
                const roleLabel = msg.role === 'user' ? '**You**' : '**Assistant**';
                const timestamp = new Date(msg.timestamp).toLocaleString();
                
                content += `### ${roleLabel}\n`;
                content += `*${timestamp}*\n\n`;
                content += `${msg.content}\n\n`;
                content += `---\n\n`;
            }
        } else {
            // No messages - this is just a reference/bookmark
            content += `*This is a saved reference to a conversation. Visit the original link to view the full chat.*\n`;
        }

        return content;
    }

    // ============================================================
    // Forge Doc Operations
    // ============================================================

    /**
     * Save Forge Doc to project path (preserves folder structure)
     */
    async saveForgeDocToProject(doc: ForgeDoc, projectPath: string): Promise<string> {
        // Sanitize external folder path input
        const safeFolderPath = this.sanitizeFolderPath(doc.folderPath);
        
        // Build full path
        let folderPath: string;
        if (safeFolderPath) {
            folderPath = this.validatePath(`${projectPath}/${safeFolderPath}`);
        } else {
            folderPath = this.validatePath(projectPath);
        }
        await this.ensureFolderExists(folderPath);

        const filename = this.sanitizeFilename(doc.title || `Doc ${doc.id}`);
        const filePath = normalizePath(`${folderPath}/${filename}.md`);

        const frontmatter: ForgeDocFrontmatter = {
            thinkforge_id: doc.id,
            thinkforge_type: 'forgeDoc',
            folder_id: doc.folderId,
            tags: doc.tags,
            created: new Date(doc.createdAt).toISOString(),
            updated: new Date(doc.updatedAt).toISOString(),
            synced: new Date().toISOString(),
        };

        const content = this.formatForgeDocAsMarkdown(doc, frontmatter);
        
        const existingFile = this.app.vault.getAbstractFileByPath(filePath);
        if (existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, content);
        } else {
            await this.app.vault.create(filePath, content);
        }

        return filePath;
    }

    /**
     * Legacy: Save Forge Doc using folder mapping
     */
    async saveForgeDoc(doc: ForgeDoc, mapping: FolderMapping): Promise<string> {
        return this.saveForgeDocToProject(doc, mapping.obsidianPath);
    }

    private formatForgeDocAsMarkdown(doc: ForgeDoc, frontmatter: ForgeDocFrontmatter): string {
        const fm = this.formatFrontmatter(frontmatter as unknown as Record<string, unknown>);
        
        let content = `${fm}\n`;
        content += `# ${doc.title}\n\n`;
        
        if (doc.tags && doc.tags.length > 0) {
            content += `Tags: ${doc.tags.map(t => `#${t}`).join(' ')}\n\n`;
        }
        
        content += `---\n\n`;
        // Handle undefined/null content gracefully
        content += doc.content || '';

        return content;
    }

    // ============================================================
    // DocKit Operations
    // ============================================================

    /**
     * Save DocKit to project path (preserves folder structure)
     */
    async saveDocKitToProject(docKit: DocKit, projectPath: string): Promise<string> {
        // Sanitize external folder path and name input
        const safeFolderPath = this.sanitizeFolderPath(docKit.folderPath);
        const safeName = this.sanitizeFilename(docKit.name || 'Untitled DocKit');
        
        // DocKit creates a folder with its name, inside its parent folder path
        let folderPath: string;
        if (safeFolderPath) {
            folderPath = this.validatePath(`${projectPath}/${safeFolderPath}/${safeName}`);
        } else {
            folderPath = this.validatePath(`${projectPath}/${safeName}`);
        }
        await this.ensureFolderExists(folderPath);

        // Create index file
        const indexPath = normalizePath(`${folderPath}/_index.md`);
        
        const frontmatter: DocKitFrontmatter = {
            thinkforge_id: docKit.id,
            thinkforge_type: 'docKit',
            folder_id: docKit.folderId,
            description: docKit.description,
            created: new Date(docKit.createdAt).toISOString(),
            updated: new Date(docKit.updatedAt).toISOString(),
            synced: new Date().toISOString(),
        };

        const indexContent = this.formatDocKitIndex(docKit, frontmatter);
        
        const existingIndex = this.app.vault.getAbstractFileByPath(indexPath);
        if (existingIndex instanceof TFile) {
            await this.app.vault.modify(existingIndex, indexContent);
        } else {
            await this.app.vault.create(indexPath, indexContent);
        }

        // Save individual items
        for (const item of docKit.items || []) {
            await this.saveDocKitItem(item, folderPath);
        }

        return folderPath;
    }

    /**
     * Legacy: Save DocKit using folder mapping
     */
    async saveDocKit(docKit: DocKit, mapping: FolderMapping): Promise<string> {
        const folderPath = normalizePath(`${mapping.obsidianPath}/DocKits/${this.sanitizeFilename(docKit.name)}`);
        await this.ensureFolderExists(folderPath);

        // Create index file
        const indexPath = normalizePath(`${folderPath}/_index.md`);
        
        const frontmatter: DocKitFrontmatter = {
            thinkforge_id: docKit.id,
            thinkforge_type: 'docKit',
            folder_id: docKit.folderId,
            description: docKit.description,
            created: new Date(docKit.createdAt).toISOString(),
            updated: new Date(docKit.updatedAt).toISOString(),
            synced: new Date().toISOString(),
        };

        const indexContent = this.formatDocKitIndex(docKit, frontmatter);
        
        const existingIndex = this.app.vault.getAbstractFileByPath(indexPath);
        if (existingIndex instanceof TFile) {
            await this.app.vault.modify(existingIndex, indexContent);
        } else {
            await this.app.vault.create(indexPath, indexContent);
        }

        // Save individual items
        for (const item of docKit.items) {
            await this.saveDocKitItem(item, folderPath);
        }

        return folderPath;
    }

    private async saveDocKitItem(item: DocKit['items'][0], folderPath: string): Promise<void> {
        const filename = this.sanitizeFilename(item.title || `Item ${item.id}`);
        const filePath = normalizePath(`${folderPath}/${filename}.md`);

        let content = `---\n`;
        content += `item_id: ${item.id}\n`;
        content += `type: ${item.type}\n`;
        if (item.url) {
            content += `url: ${item.url}\n`;
        }
        content += `---\n\n`;
        content += `# ${item.title}\n\n`;
        content += item.content;

        const existingFile = this.app.vault.getAbstractFileByPath(filePath);
        if (existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, content);
        } else {
            await this.app.vault.create(filePath, content);
        }
    }

    private formatDocKitIndex(docKit: DocKit, frontmatter: DocKitFrontmatter): string {
        const fm = this.formatFrontmatter(frontmatter as unknown as Record<string, unknown>);
        
        let content = `${fm}\n`;
        content += `# ${docKit.name}\n\n`;
        content += `${docKit.description}\n\n`;
        content += `---\n\n`;
        content += `## Items\n\n`;
        
        for (const item of docKit.items) {
            const filename = this.sanitizeFilename(item.title || `Item ${item.id}`);
            content += `- [[${filename}]] (${item.type})\n`;
        }

        return content;
    }

    // ============================================================
    // Reading Operations
    // ============================================================

    async readThinkForgeFiles(folderPath: string): Promise<{
        branches: ThinkForgeBranch[];
        forgeDocs: ForgeDoc[];
        docKits: DocKit[];
    }> {
        const branches: ThinkForgeBranch[] = [];
        const forgeDocs: ForgeDoc[] = [];
        const docKits: DocKit[] = [];

        const files = await this.getFolderContents(folderPath);
        
        for (const file of files) {
            const content = await this.app.vault.read(file);
            const parsed = this.parseFrontmatter(content);
            
            if (!parsed.frontmatter?.thinkforge_type) {
                continue;
            }

            switch (parsed.frontmatter.thinkforge_type) {
                case 'branch':
                    // Note: Full branch parsing would need message extraction
                    // For now, we just track the ID for sync state
                    break;
                case 'forgeDoc':
                    // Similar - track for sync
                    break;
                case 'docKit':
                    // DocKits are folders, handled differently
                    break;
            }
        }

        return { branches, forgeDocs, docKits };
    }

    // ============================================================
    // Utility Methods
    // ============================================================

    private formatFrontmatter(data: Record<string, unknown>): string {
        let fm = '---\n';
        for (const [key, value] of Object.entries(data)) {
            if (Array.isArray(value)) {
                fm += `${key}:\n`;
                for (const item of value) {
                    fm += `  - ${item}\n`;
                }
            } else {
                fm += `${key}: ${value}\n`;
            }
        }
        fm += '---';
        return fm;
    }

    private parseFrontmatter(content: string): { frontmatter: Record<string, unknown> | null; body: string } {
        const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!match) {
            return { frontmatter: null, body: content };
        }

        try {
            const frontmatter: Record<string, unknown> = {};
            const lines = match[1].split('\n');
            let currentKey = '';
            let currentArray: string[] | null = null;

            for (const line of lines) {
                if (line.startsWith('  - ')) {
                    if (currentArray) {
                        currentArray.push(line.slice(4));
                    }
                } else if (line.includes(': ')) {
                    if (currentArray && currentKey) {
                        frontmatter[currentKey] = currentArray;
                    }
                    const [key, ...valueParts] = line.split(': ');
                    const value = valueParts.join(': ');
                    currentKey = key;
                    if (value === '') {
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
        } catch {
            return { frontmatter: null, body: content };
        }
    }

    private sanitizeFilename(name: string): string {
        // Remove/replace characters not allowed in filenames
        return name
            .replace(/[\\/:*?"<>|]/g, '-')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 100);  // Limit length
    }
}

