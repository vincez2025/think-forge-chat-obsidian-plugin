# Think Forge Sync - Obsidian Plugin

Sync your Think Forge conversations, Forge Docs, and DocKits with your Obsidian vault.

## Features

- **One-Way Sync**: Push conversations and documents from Think Forge Chat extension to Obsidian
- **Project-Based Organization**: Content is organized by project: `BasePath/ProjectName/`
- **Local HTTP Server**: Receives sync requests from the browser extension
- **Markdown Format**: All synced content is stored as markdown with YAML frontmatter
- **Folder Structure Preservation**: Maintains your Think Forge folder hierarchy in Obsidian

## Installation

### From Obsidian Community Plugins (Coming Soon)

1. Open Obsidian Settings
2. Go to Community Plugins
3. Search for "Think Forge Sync"
4. Click Install, then Enable

### Manual Installation

1. Download the latest release (`main.js`, `manifest.json`)
2. Create a folder `think-forge-sync` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into this folder
4. Enable the plugin in Obsidian Settings > Community Plugins

### Building from Source

```bash
# Navigate to the plugin directory
cd "Obsidian Plugin"

# Install dependencies
npm install

# Build for production
npm run build

# Output files are in the Release/ folder
```

## Configuration

### Server Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Enable sync server | Start the local HTTP server | On |
| Server port | Port number for the server | 9879 |
| Base folder | Root folder for synced content | ThinkForge |
| Debug mode | Log detailed info to console | Off |

### Folder Structure

Content is organized by project within your base folder:

```
ThinkForge/                    # Base folder (configurable)
└── My Project/                # Project name from extension
    ├── Research/              # Folder structure preserved
    │   ├── conversation.md    # Chat conversations
    │   └── notes.md           # Forge Docs
    ├── My DocKit/             # DocKit as folder
    │   ├── _index.md          # DocKit metadata
    │   └── item1.md           # DocKit items
    └── standalone-doc.md      # Items without folder
```

## Sync Direction

**Extension → Obsidian (One-Way)**

Changes made in the Think Forge extension are exported to your Obsidian vault when you trigger a sync from the extension. Edits made directly in Obsidian stay local to your vault.

## API Endpoints

The plugin exposes a local REST API for the Think Forge extension:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check and status |
| `/ping` | GET | Connection check (alias for health) |
| `/status` | GET | Vault info and sync settings |
| `/folders` | GET | List vault folders |
| `/mappings` | GET | Get folder mappings |
| `/mappings` | POST | Create folder mapping |
| `/mappings/:id` | DELETE | Delete folder mapping |
| `/sync/push` | POST | Push items to vault |

## File Format

### Conversation (Branch)

```markdown
---
thinkforge_id: abc123
thinkforge_type: branch
folder_id: folder456
platform: ChatGPT
url: https://chatgpt.com/c/...
created: 2026-01-15T12:00:00Z
updated: 2026-01-15T12:30:00Z
synced: 2026-01-15T12:35:00Z
---

# Conversation Title

> Platform: ChatGPT | [Original Link](url)

---

### **You**
*1/15/2026, 12:00:00 PM*

Your message here...

---

### **Assistant**
*1/15/2026, 12:00:30 PM*

Response here...
```

### Forge Doc

```markdown
---
thinkforge_id: doc789
thinkforge_type: forgeDoc
folder_id: folder456
tags:
  - research
  - ai
created: 2026-01-15T12:00:00Z
updated: 2026-01-15T12:30:00Z
synced: 2026-01-15T12:35:00Z
---

# Document Title

Tags: #research #ai

---

Document content here...
```

## Commands

- **Start sync server**: Start the HTTP server
- **Stop sync server**: Stop the HTTP server  
- **Toggle sync server**: Toggle server on/off
- **Sync now**: Show server status and readiness
- **Show sync status**: Display current sync status

## Troubleshooting

### Port Already in Use

If you see "Port 9879 is already in use", either:
- Change the port in settings
- Close the application using that port
- Restart Obsidian

### Extension Not Connecting

1. Verify the server is running (green status in settings)
2. Check the port matches in both plugin and extension settings
3. Ensure no firewall is blocking localhost connections
4. Try the "Test Connection" button in settings

### Debug Mode

Enable Debug Mode in settings to see detailed logs in the Developer Console (Ctrl+Shift+I on Windows/Linux, Cmd+Option+I on Mac).

## Security

- The server only listens on `127.0.0.1` (localhost) - not accessible from other machines
- CORS is restricted to browser extensions only
- All paths are validated to prevent directory traversal attacks
- Input validation on all API endpoints

## Support

- [Think Forge Website](https://thinkforge.app)

## License

MIT License - See [LICENSE](LICENSE) for details.
