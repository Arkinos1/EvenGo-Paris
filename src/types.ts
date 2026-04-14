export type AppState = 'PRESET_PICKER' | 'SUMMARY' | 'STEPS_LIST' | 'STEP_DETAIL' | 'DISRUPTIONS';
export type EvenButtonEvent = 'click' | 'double_click' | 'scroll_top' | 'scroll_bottom';

export interface RouteData {
    summary: string;
    shortSteps: string[];
    detailedSteps: string[];
    relevantDisruptions: string[];
}