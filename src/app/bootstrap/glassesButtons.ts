import type { AppContext, EvenButtonEvent } from '../types';
import type { Navigator } from '../router/navigator';
import { StateManager } from '../router/stateManager';

export async function handleGlassesButton(
  ctx: AppContext,
  navigator: Navigator,
  btn: EvenButtonEvent
): Promise<void> {
  if (ctx.isLoading && btn !== 'double_click') {
    return;
  }

  if (ctx.currentState === 'PRESET_PICKER') {
    switch (btn) {
      case 'scroll_bottom':
        if (ctx.currentPresetIndex < ctx.travelPresets.length - 1) {
          await navigator.scrollPresets('down');
        }
        break;

      case 'scroll_top':
        if (ctx.currentPresetIndex > 0) {
          await navigator.scrollPresets('up');
        }
        break;

      case 'click':
        await navigator.selectPresetAndRunJourney();
        break;

      case 'double_click':
        await navigator.requestExitDialog();
        break;
    }
    return;
  }

  if (ctx.currentState === 'LOADING') {
    if (btn === 'double_click') {
      await StateManager.exitLoading(ctx);
      await navigator.displayPresetPicker();
    }
    return;
  }

  if (ctx.currentState === 'TIME_PREFERENCE') {
    switch (btn) {
      case 'scroll_bottom':
        StateManager.nextTimeOffset(ctx);
        await navigator.displayTimePreference();
        break;

      case 'scroll_top':
        StateManager.prevTimeOffset(ctx);
        await navigator.displayTimePreference();
        break;

      case 'click':
        await navigator.runJourneyWithTimeOffset();
        break;

      case 'double_click':
        await navigator.displayPresetPicker();
        break;
    }
    return;
  }

  if (!ctx.currentRoute) return;

  if (btn === 'double_click') {
    if (ctx.currentState === 'SUMMARY') {
      await navigator.displayPresetPicker();
    } else {
      await navigator.handleBackNavigation();
    }
    return;
  }

  if (ctx.currentState === 'SUMMARY') {
    if (btn === 'scroll_bottom' || btn === 'scroll_top') {
      await navigator.scrollSummary(btn === 'scroll_bottom' ? 'down' : 'up');
      return;
    }

    if (btn === 'click') {
      await navigator.activateSummaryAction();
      return;
    }
  }

  if (btn === 'click') {
    switch (ctx.currentState) {
      case 'STEPS_LIST':
        await navigator.displayStepDetail(ctx.currentStepIndex);
        break;

      case 'STEP_DETAIL':
        await navigator.displayStepsList();
        break;

      case 'DISRUPTIONS':
        await navigator.displaySummary();
        break;
    }
    return;
  }

  if (btn === 'scroll_bottom' || btn === 'scroll_top') {
    if (ctx.currentState === 'STEPS_LIST') {
      await navigator.scrollSteps(btn === 'scroll_bottom' ? 'down' : 'up');
    }
  }
}
