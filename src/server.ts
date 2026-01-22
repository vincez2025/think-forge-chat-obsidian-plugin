/**
 * Think Forge Sync - HTTP Server
 * Local HTTP server for extension communication (one-way sync)
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { ApiEndpoints } from './api/endpoints';
import { ThinkForgeSyncSettings } from './types';

// Allowed origins for CORS (Chrome extension)
const ALLOWED_ORIGINS = [
    'chrome-extension://',  // Any Chrome extension
    'moz-extension://',     // Firefox extensions
    'null',                 // Local file or extension context
];

export class HttpServer {
    private server: Server | null = null;
    private endpoints: ApiEndpoints;
    private settings: ThinkForgeSyncSettings;
    private isRunning: boolean = false;

    constructor(endpoints: ApiEndpoints, settings: ThinkForgeSyncSettings) {
        this.endpoints = endpoints;
        this.settings = settings;
    }

    updateSettings(settings: ThinkForgeSyncSettings): void {
        this.settings = settings;
        this.endpoints.updateSettings(settings);
    }

    isServerRunning(): boolean {
        return this.isRunning;
    }

    async start(): Promise<void> {
        if (this.isRunning) {
            if (this.settings.debugMode) {
                console.log('Think Forge: Server already running');
            }
            return;
        }

        return new Promise((resolve, reject) => {
            this.server = createServer((req, res) => {
                this.handleRequest(req, res);
            });

            this.server.on('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'EADDRINUSE') {
                    console.error(`Think Forge: Port ${this.settings.serverPort} is already in use`);
                    reject(new Error(`Port ${this.settings.serverPort} is already in use`));
                } else {
                    console.error('Think Forge: Server error:', err);
                    reject(err);
                }
            });

            this.server.listen(this.settings.serverPort, '127.0.0.1', () => {
                this.isRunning = true;
                if (this.settings.debugMode) {
                    console.log(`Think Forge: Server started on http://127.0.0.1:${this.settings.serverPort}`);
                }
                resolve();
            });
        });
    }

    async stop(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.server || !this.isRunning) {
                resolve();
                return;
            }

            this.server.close(() => {
                this.isRunning = false;
                this.server = null;
                if (this.settings.debugMode) {
                    console.log('Think Forge: Server stopped');
                }
                resolve();
            });
        });
    }

    // ============================================================
    // HTTP Request Handling
    // ============================================================

    private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const origin = req.headers.origin || '';
        
        // Security: Validate origin for CORS
        const isAllowedOrigin = this.isOriginAllowed(origin);
        
        if (isAllowedOrigin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        } else {
            // Allow localhost requests without origin (direct API calls, Obsidian itself)
            res.setHeader('Access-Control-Allow-Origin', 'null');
        }
        
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Think-Forge-Token');
        res.setHeader('Content-Type', 'application/json');
        
        // Security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');

        // Handle preflight requests
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const url = new URL(req.url || '/', `http://127.0.0.1:${this.settings.serverPort}`);
        const path = url.pathname;
        const method = req.method || 'GET';

        // Log request in debug mode
        if (this.settings.debugMode) {
            console.log(`Think Forge: ${method} ${path}`);
        }

        try {
            // Parse body for POST/PUT requests
            let body: unknown = undefined;
            if (method === 'POST' || method === 'PUT') {
                body = await this.parseBody(req);
            }

            // Route to endpoint handler
            const response = await this.endpoints.handleRequest(method, path, body);

            // Send response
            const statusCode = response.success ? 200 : 400;
            res.writeHead(statusCode);
            res.end(JSON.stringify(response));

        } catch (e) {
            console.error('Think Forge: Request error:', e);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: e instanceof Error ? e.message : 'Internal server error',
                timestamp: Date.now(),
            }));
        }
    }

    /**
     * Check if the request origin is allowed
     */
    private isOriginAllowed(origin: string): boolean {
        if (!origin) return true; // No origin = same-origin or server-to-server
        
        return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
    }

    private parseBody(req: IncomingMessage): Promise<unknown> {
        return new Promise((resolve, reject) => {
            let body = '';
            let size = 0;
            const maxSize = 10 * 1024 * 1024; // 10MB limit for large sync payloads
            
            req.on('data', (chunk) => {
                size += chunk.length;
                // Limit body size
                if (size > maxSize) {
                    reject(new Error('Request body too large (max 10MB)'));
                    req.destroy();
                    return;
                }
                body += chunk.toString();
            });

            req.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) : undefined);
                } catch {
                    reject(new Error('Invalid JSON body'));
                }
            });

            req.on('error', reject);
        });
    }
}
