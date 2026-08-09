# Legacy renderer stubs

These Vite React views were an incomplete product rewrite and are **not** loaded by Electron.

The desktop shell loads the Next.js frontend via `BrowserWindow.loadURL`.
Do not wire these back into `App.tsx` or treat them as the product UI.
