// IDFM API configuration
export const IDFM_BASE_URL = 'https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia';

// Storage keys
export const PRESET_STORAGE_KEY = 'evengo-paris-presets-v2';
export const LEGACY_PRESET_STORAGE_KEY = 'citymapper-hub-presets-v2';
export const IDFM_API_STATUS_CACHE_KEY = 'idfm-api-status-v1';
export const IDFM_API_KEY_STORAGE_KEY = 'idfm-api-key';

// API status cache TTLs (milliseconds)
export const IDFM_API_STATUS_OK_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const IDFM_API_STATUS_UNAUTHORIZED_TTL_MS = 10 * 60 * 1000; // 10min
export const IDFM_API_STATUS_ERROR_TTL_MS = 2 * 60 * 1000; // 2min

// UI thresholds
export const VISIBLE_PRESETS_WINDOW = 1; // Show current ± 1 preset
export const SUMMARY_MAX_LINES = 4;
export const STEP_TRUNCATE_STATIONS = 3;

// Event debouncing
export const SCROLL_COOLDOWN_MS = 300;
export const SCROLL_EVENT_DEBOUNCE_AFTER_MS = 180; // After scroll, ignore empty event within this time

// API search
export const SEARCH_RESULT_LIMIT = 20;
export const STOP_WORDS = new Set([
  'gare', 'station', 'arret', 'arrêt',
  'paris', 'de', 'du', 'des', 'la', 'le', 'les',
  'metro', 'métro', 'rer', 'tram', 'bus', 'train'
]);

// Glasses display dimensions
export const GLASSES_DISPLAY_WIDTH = 576;
export const GLASSES_DISPLAY_HEIGHT = 288;
