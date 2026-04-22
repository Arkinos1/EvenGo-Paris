import type { AppContext, AppState, RouteData } from '../types';
import { PresetsManager, renderPresetPickerForGlasses } from '../presets';
import { writeLog } from '../core/context';

/**
 * State machine for managing app navigation
 */
export class StateManager {
  /**
   * Transition to preset picker state
   */
  static async goToPresetPicker(ctx: AppContext): Promise<void> {
    ctx.currentState = 'PRESET_PICKER';
    ctx.currentStepIndex = 0;
  }

  /**
   * Transition to loading state
   */
  static async goToLoading(ctx: AppContext): Promise<void> {
    ctx.currentState = 'LOADING';
    ctx.isLoading = true;
  }

  /**
   * Exit loading state
   */
  static async exitLoading(ctx: AppContext): Promise<void> {
    ctx.isLoading = false;
  }

  /**
   * Transition to summary state
   */
  static async goToSummary(ctx: AppContext): Promise<void> {
    ctx.currentState = 'SUMMARY';
    ctx.summaryActionIndex = ctx.summaryActionIndex ?? 0;
  }

  /**
   * Transition to steps list state
   */
  static async goToStepsList(ctx: AppContext, resetIndex: boolean = true): Promise<void> {
    ctx.currentState = 'STEPS_LIST';
    if (resetIndex) {
      ctx.currentStepIndex = 0;
    }
  }

  /**
   * Transition to step detail state
   */
  static async goToStepDetail(ctx: AppContext, stepIndex: number): Promise<void> {
    ctx.currentState = 'STEP_DETAIL';
    ctx.currentStepIndex = stepIndex;
  }

  /**
   * Transition to disruptions state
   */
  static async goToDisruptions(ctx: AppContext): Promise<void> {
    ctx.currentState = 'DISRUPTIONS';
  }

  /**
   * Transition to time preference state
   */
  static async goToTimePreference(ctx: AppContext, preset: any): Promise<void> {
    ctx.currentState = 'TIME_PREFERENCE';
    ctx.selectedPresetForTime = preset;
    ctx.currentTimeOffset = 0;
  }

  /**
   * Navigate to next step
   */
  static nextStep(ctx: AppContext): void {
    if (ctx.currentRoute && ctx.currentStepIndex < ctx.currentRoute.shortSteps.length - 1) {
      ctx.currentStepIndex++;
    }
  }

  /**
   * Navigate to previous step
   */
  static prevStep(ctx: AppContext): void {
    if (ctx.currentStepIndex > 0) {
      ctx.currentStepIndex--;
    }
  }

  /**
   * Navigate to next preset
   */
  static nextPreset(ctx: AppContext): void {
    if (ctx.travelPresets.length > 0) {
      ctx.currentPresetIndex = Math.min(ctx.currentPresetIndex + 1, ctx.travelPresets.length - 1);
    }
  }

  /**
   * Navigate to previous preset
   */
  static prevPreset(ctx: AppContext): void {
    if (ctx.currentPresetIndex > 0) {
      ctx.currentPresetIndex--;
    }
  }

  /**
   * Navigate to next time offset
   */
  static nextTimeOffset(ctx: AppContext): void {
    const offsets = [0, 5, 10, 30, 60];
    const currentIndex = offsets.indexOf(ctx.currentTimeOffset);
    if (currentIndex < offsets.length - 1) {
      const nextOffset = offsets[currentIndex + 1];
      if (nextOffset !== undefined) {
        ctx.currentTimeOffset = nextOffset;
      }
    }
  }

  /**
   * Navigate to previous time offset
   */
  static prevTimeOffset(ctx: AppContext): void {
    const offsets = [0, 5, 10, 30, 60];
    const currentIndex = offsets.indexOf(ctx.currentTimeOffset);
    if (currentIndex > 0) {
      const prevOffset = offsets[currentIndex - 1];
      if (prevOffset !== undefined) {
        ctx.currentTimeOffset = prevOffset;
      }
    }
  }

  /**
   * Get smart back state depending on current state
   */
  static getSmartBackState(ctx: AppContext): AppState {
    const { currentState, currentRoute } = ctx;

    if (currentState === 'TIME_PREFERENCE' || currentState === 'LOADING') {
      return 'PRESET_PICKER';
    } else if (currentState === 'STEP_DETAIL') {
      return 'STEPS_LIST';
    } else if (currentState === 'DISRUPTIONS' || currentState === 'STEPS_LIST') {
      return 'SUMMARY';
    } else if (currentState === 'SUMMARY' && currentRoute?.relevantDisruptions.length) {
      return 'DISRUPTIONS';
    }

    return 'PRESET_PICKER';
  }

  /**
   * Navigate to next summary action
   */
  static nextSummaryAction(ctx: AppContext, actionCount: number = 2): void {
    if (actionCount <= 0) {
      ctx.summaryActionIndex = 0;
      return;
    }

    ctx.summaryActionIndex = (ctx.summaryActionIndex + 1) % actionCount;
  }

  /**
   * Navigate to previous summary action
   */
  static prevSummaryAction(ctx: AppContext, actionCount: number = 2): void {
    if (actionCount <= 0) {
      ctx.summaryActionIndex = 0;
      return;
    }

    ctx.summaryActionIndex = (ctx.summaryActionIndex - 1 + actionCount) % actionCount;
  }
}
