import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { copyFileSync, mkdirSync, existsSync } from "fs";

const banner = `/*
Think Forge Sync - Obsidian Plugin
Sync notes with Think Forge Chat browser extension
*/
`;

const prod = process.argv[2] === "production";
const outDir = prod ? "Release" : ".";

// Ensure Release directory exists for production builds
if (prod && !existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

const context = await esbuild.context({
  banner: {
    js: banner,
  },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: `${outDir}/main.js`,
});

if (prod) {
  await context.rebuild();
  // Copy manifest.json and versions.json to Release folder
  copyFileSync("manifest.json", `${outDir}/manifest.json`);
  copyFileSync("versions.json", `${outDir}/versions.json`);
  console.log(`\n✅ Build complete! Files output to: ${outDir}/`);
  process.exit(0);
} else {
  await context.watch();
}

