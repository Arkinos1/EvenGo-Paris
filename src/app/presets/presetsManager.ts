import { LEGACY_PRESET_STORAGE_KEY, PRESET_STORAGE_KEY } from '../constants';
import type { TravelPreset } from '../types';
import { generateUUID } from '../utils/index';

/**
 * Manage travel presets in localStorage
 */
export class PresetsManager {
  /**
   * Load presets from localStorage
   */
  static load(): TravelPreset[] {
    try {
      const rawCurrent = localStorage.getItem(PRESET_STORAGE_KEY);
      const rawLegacy = rawCurrent ? null : localStorage.getItem(LEGACY_PRESET_STORAGE_KEY);
      const raw = rawCurrent ?? rawLegacy;
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      const cleaned = parsed
        .map((preset: Partial<TravelPreset>) => ({
          id: typeof preset.id === 'string' && preset.id.trim().length > 0 ? preset.id : generateUUID(),
          label: typeof preset.label === 'string' && preset.label.trim().length > 0 ? preset.label : 'Preset',
          depart: typeof preset.depart === 'string' ? preset.depart : '',
          arrivee: typeof preset.arrivee === 'string' ? preset.arrivee : '',
        }))
        .filter((preset: TravelPreset) => preset.depart.trim().length > 0 || preset.arrivee.trim().length > 0);

      // One-shot migration from old storage key to new branded key.
      if (!rawCurrent && rawLegacy) {
        this.save(cleaned);
        try {
          localStorage.removeItem(LEGACY_PRESET_STORAGE_KEY);
        } catch {
          // Ignore storage cleanup errors.
        }
      }

      return cleaned;
    } catch {
      return [];
    }
  }

  /**
   * Save presets to localStorage
   */
  static save(presets: TravelPreset[]): void {
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
    } catch {
      // Some mobile browsers/webviews can block or fail localStorage writes.
      // Keep the app functional even if persistence is unavailable.
    }
  }

  /**
   * Create new preset
   */
  static create(label: string = 'Nouveau raccourci', depart: string = '', arrivee: string = ''): TravelPreset {
    return {
      id: generateUUID(),
      label,
      depart,
      arrivee,
    };
  }

  /**
   * Update preset by ID
   */
  static update(presets: TravelPreset[], id: string, changes: Partial<TravelPreset>): TravelPreset[] {
    return presets.map((preset) => (preset.id === id ? { ...preset, ...changes } : preset));
  }

  /**
   * Delete preset by ID
   */
  static delete(presets: TravelPreset[], id: string): TravelPreset[] {
    return presets.filter((preset) => preset.id !== id);
  }

  /**
   * Get preset by index (with bounds checking)
   */
  static getByIndex(presets: TravelPreset[], index: number): TravelPreset | null {
    const bounded = Math.max(0, Math.min(index, presets.length - 1));
    return presets[bounded] || null;
  }
}
