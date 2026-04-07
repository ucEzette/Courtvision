/**
 * Utility to check the current execution platform.
 * Returns true if running inside a Tauri shell.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
}

export function isWeb(): boolean {
  return !isTauri();
}
