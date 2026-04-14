import type { TravelPreset, RouteData, AppState, Language, AppContext } from '../types';
import { detectLanguage } from '../i18n';

/**
 * Create and initialize app context
 */
export function createAppContext(): AppContext {
  return {
    // DOM
    btnRecherche: document.getElementById('btn-recherche') as HTMLButtonElement | null,
    inputDepart: document.getElementById('input-depart') as HTMLInputElement | null,
    inputArrivee: document.getElementById('input-arrivee') as HTMLInputElement | null,
    divLogs: document.getElementById('logs'),
    presetList: document.getElementById('preset-list'),
    apiStatus: document.getElementById('api-status'),
    apiDescription: document.getElementById('api-description'),
    addPresetButton: document.getElementById('btn-add-preset') as HTMLButtonElement | null,
    resetPresetsButton: document.getElementById('btn-reset-presets') as HTMLButtonElement | null,
    confirmResetButton: document.getElementById('btn-confirm-reset') as HTMLButtonElement | null,

    // State
    currentState: 'PRESET_PICKER',
    currentRoute: null,
    lastJourneyFrom: '',
    lastJourneyTo: '',
    currentStepIndex: 0,
    currentPresetIndex: 0,
    editingPresetId: null,
    travelPresets: [],
    language: detectLanguage(),
    selectedPresetForTime: null,
    currentTimeOffset: 0,
    isLoading: false,
    summaryActionIndex: 0,
    apiConnectionState: 'checking',
  };
}

/**
 * Write log message to UI
 */
export function writeLog(ctx: AppContext, msg: string): void {
  if (ctx.divLogs) {
    ctx.divLogs.innerHTML += `<p>➔ ${msg}</p>`;
  }
}
