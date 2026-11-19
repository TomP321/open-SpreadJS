/// <reference types="vite/client" />

// Globals the black-box probe exposes to its Playwright/node drivers.
// `__addonUrls` carries URLs of the official add-on bundles (imported with `?url`,
// which never executes them — the probe loads them on the official side only).
interface Window {
  __addonUrls?: Record<string, string>;
  __probeRun?: number;
}
