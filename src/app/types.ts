// App states
export type AppState = 
  | 'PRESET_PICKER'
  | 'TIME_PREFERENCE'
  | 'LOADING'
  | 'SUMMARY'
  | 'STEPS_LIST'
  | 'STEP_DETAIL'
  | 'DISRUPTIONS';

export type Language = 'fr' | 'en' | 'es' | 'de' | 'zh';

// Glasses button events
export type EvenButtonEvent = 
  | 'click'
  | 'double_click'
  | 'scroll_top'
  | 'scroll_bottom';

// Travel preset
export interface TravelPreset {
  id: string;
  label: string;
  depart: string;
  arrivee: string;
}

// Route data from IDFM API
export interface RouteData {
  summary: string;
  departureTime: string;
  arrivalTime: string;
  durationMin: number;
  transportLabels: string[];
  walkMin: number;
  shortSteps: string[];
  detailedSteps: string[];
  relevantDisruptions: string[];
  stepLogos?: Array<string | null>;
}

export interface PlaceSuggestion {
  label: string;
  location: string;
}

// Place from IDFM API search
export interface IdfmPlace {
  id?: string;
  name?: string;
  label?: string;
  type?: string;
  embedded_type?: string;
  coord?: { lon: number; lat: number };
  stop_area?: { coord?: { lon: number; lat: number } };
  stop_point?: { coord?: { lon: number; lat: number } };
  address?: { coord?: { lon: number; lat: number } };
  poi?: { coord?: { lon: number; lat: number } };
  administrative_region?: { coord?: { lon: number; lat: number } };
}

// Journey coordinates
export interface JourneyCoords {
  lon: number;
  lat: number;
}

// App context
export interface AppContext {
  // UI DOM references
  btnRecherche: HTMLButtonElement | null;
  inputDepart: HTMLInputElement | null;
  inputArrivee: HTMLInputElement | null;
  divLogs: HTMLElement | null;
  routeOptionsContainer: HTMLElement | null;
  presetList: HTMLElement | null;
  apiStatus: HTMLElement | null;
  apiDescription: HTMLElement | null;
  addPresetButton: HTMLButtonElement | null;
  resetPresetsButton: HTMLButtonElement | null;
  confirmResetButton: HTMLButtonElement | null;

  // State
  currentState: AppState;
  currentRoute: RouteData | null;
  availableRoutes: RouteData[];
  currentRouteIndex: number;
  lastJourneyFrom: string;
  lastJourneyTo: string;
  currentStepIndex: number;
  currentPresetIndex: number;
  editingPresetId: string | null;
  travelPresets: TravelPreset[];
  language: Language;
  
  // Time preference state for shortcuts
  selectedPresetForTime: TravelPreset | null;
  currentTimeOffset: number; // In minutes
  isLoading: boolean; // Prevent multiple clicks during journey loading
  summaryActionIndex: number; // 0 = view journey, 1 = traffic info, 2 = switch route option
  apiConnectionState: 'checking' | 'ok' | 'unauthorized' | 'error';
}
