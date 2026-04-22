import type { EvenBridge } from '../bridge/evenBridge';

let storageBridge: EvenBridge | null = null;
const pendingWrites = new Map<string, string>();

export function setStorageBridge(bridge: EvenBridge | null): void {
  storageBridge = bridge;
  void flushPendingWrites();
}

export async function readPersistentValue(key: string): Promise<string | null> {
  const fromBridge = await storageBridge?.getLocalStorage(key);
  if (typeof fromBridge === 'string' && fromBridge.length > 0) {
    mirrorToBrowserStorage(key, fromBridge);
    return fromBridge;
  }

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function writePersistentValue(key: string, value: string): Promise<void> {
  pendingWrites.set(key, value);

  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore browser storage write failures on constrained webviews.
  }

  await flushPendingWrites();
}

export async function removePersistentValue(key: string): Promise<void> {
  pendingWrites.set(key, '');

  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore browser storage write failures on constrained webviews.
  }

  await flushPendingWrites();
}

async function flushPendingWrites(): Promise<void> {
  if (!storageBridge) return;

  for (const [key, value] of pendingWrites) {
    const ok = await storageBridge.setLocalStorage(key, value);
    if (ok) {
      pendingWrites.delete(key);
    }
  }
}

function mirrorToBrowserStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore browser storage write failures on constrained webviews.
  }
}
