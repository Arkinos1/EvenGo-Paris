import type { AppContext } from '../types';
import type { EvenBridge } from '../bridge/evenBridge';
import type { IdfmService } from '../idfm/idfmService';
import { IdfmService as IdfmServiceImpl } from '../idfm/idfmService';
import { writeLog } from '../core/context';
import { PresetsManager, renderPresetPickerForGlasses } from '../presets';
import { StateManager } from './stateManager';
import { SUMMARY_MAX_LINES } from '../constants';
import { t } from '../i18n';

/**
 * Coordinate navigation, display, and IDFM API calls
 */
export class Navigator {
  constructor(
    private ctx: AppContext,
    private bridge: EvenBridge,
    private idfmService: IdfmService
  ) {}

  private shortenAddress(value: string, max = 34): string {
    const text = value.trim();
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 3))}...`;
  }

  private compactForGlasses(text: string): string {
    return text;
  }

  /**
   * Display preset picker on glasses
   */
  async displayPresetPicker(): Promise<void> {
    await StateManager.goToPresetPicker(this.ctx);
    const text = renderPresetPickerForGlasses(
      this.ctx.travelPresets,
      this.ctx.currentPresetIndex,
      this.ctx.language,
      this.ctx.apiConnectionState
    );
    await this.bridge.displayText(text);
  }

  /**
   * Scroll through presets
   */
  async scrollPresets(direction: 'up' | 'down'): Promise<void> {
    if (direction === 'down') {
      StateManager.nextPreset(this.ctx);
    } else {
      StateManager.prevPreset(this.ctx);
    }
    await this.displayPresetPicker();
  }

  /**
   * Handle preset selection and start journey
   */
  async selectPresetAndRunJourney(): Promise<void> {
    const selected = PresetsManager.getByIndex(this.ctx.travelPresets, this.ctx.currentPresetIndex);
    if (!selected) return;

    if (!selected.depart.trim() || !selected.arrivee.trim()) {
      writeLog(this.ctx, `${t(this.ctx.language, 'incompleteShortcut')}: ${selected.label}`);
      this.applyPresetToInputs(selected);
      return;
    }

    // Show time preference screen instead of running journey directly
    await this.displayTimePreference();
  }

  /**
   * Run journey calculation from manual input
   */
  async runJourneyFromInputs(): Promise<void> {
    const depart = this.ctx.inputDepart?.value.trim();
    const arrivee = this.ctx.inputArrivee?.value.trim();

    if (!depart || !arrivee) return;

    await this.runJourney(depart, arrivee);
  }

  /**
   * Main journey computation: search places, fetch route, display
   */
  private async runJourney(depart: string, arrivee: string, origin?: string): Promise<void> {
    // Set loading state to prevent multiple clicks
    await StateManager.goToLoading(this.ctx);

    // Use a sequential ticker to avoid overlapping bridge writes that can disconnect glasses.
    let loadingActive = true;
    let dotCount = 0;
    const loadingTicker = (async () => {
      while (loadingActive && this.ctx.currentState === 'LOADING') {
        dotCount = (dotCount + 1) % 4;
        const dots = '.'.repeat(dotCount);
        const loadingMsg = `${t(this.ctx.language, 'computingRoute')}${dots}`;
        try {
          await this.bridge.displayText(loadingMsg);
        } catch {
          // Ignore transient bridge write errors while loading.
        }
        await new Promise((resolve) => setTimeout(resolve, 650));
      }
    })();

    const stopLoadingTicker = async (): Promise<void> => {
      loadingActive = false;
      try {
        await loadingTicker;
      } catch {
        // Ignore ticker shutdown errors.
      }
    };

    const logOrigin = origin || `${t(this.ctx.language, 'searchDeparture')}: ${depart}`;
    writeLog(this.ctx, logOrigin);

    const coordDepart = await this.idfmService.searchPlace(depart);
    if (!coordDepart) {
      await stopLoadingTicker();
      writeLog(this.ctx, `${t(this.ctx.language, 'departureNotFound')}: ${depart}`);
      await StateManager.exitLoading(this.ctx);
      await this.displayPresetPicker();
      return;
    }

    writeLog(this.ctx, `${t(this.ctx.language, 'searchArrival')}: ${arrivee}`);
    const coordArrivee = await this.idfmService.searchPlace(arrivee);
    if (!coordArrivee) {
      await stopLoadingTicker();
      writeLog(this.ctx, `${t(this.ctx.language, 'arrivalNotFound')}: ${arrivee}`);
      await StateManager.exitLoading(this.ctx);
      await this.displayPresetPicker();
      return;
    }

    this.ctx.currentRoute = await this.idfmService.getJourney(coordDepart, coordArrivee);

    if (!this.ctx.currentRoute) {
      await stopLoadingTicker();
      writeLog(this.ctx, t(this.ctx.language, 'noRouteBetweenPoints'));
      await StateManager.exitLoading(this.ctx);
      await this.displayPresetPicker();
      return;
    }

    await stopLoadingTicker();
    await StateManager.exitLoading(this.ctx);
    this.ctx.lastJourneyFrom = depart;
    this.ctx.lastJourneyTo = arrivee;
    writeLog(this.ctx, t(this.ctx.language, 'routeSent'));
    this.ctx.summaryActionIndex = 0;
    await this.displaySummary();
  }

  /**
   * Display summary on glasses
   */
  async displaySummary(): Promise<void> {
    if (!this.ctx.currentRoute) return;

    await StateManager.goToSummary(this.ctx);

    const lines = this.ctx.currentRoute.summary.split('\n');
    const titleLine = lines[0] || t(this.ctx.language, 'routeFound');
    const timeLine = lines[1] || '';
    const durationLine = lines[2] || '';
    const durationOnly = durationLine.split('•')[0]?.trim() || durationLine.trim();
    const fromLine = `${t(this.ctx.language, 'departure')}: ${this.shortenAddress(this.ctx.lastJourneyFrom || '-')}`;
    const toLine = `${t(this.ctx.language, 'arrival')}: ${this.shortenAddress(this.ctx.lastJourneyTo || '-')}`;
    const trafficMenuLabel = t(this.ctx.language, 'trafficDetails');
    const viewLine = `${this.ctx.summaryActionIndex === 0 ? '▶ ' : '   '}${t(this.ctx.language, 'viewJourney')}`;
    const trafficLine = `${this.ctx.summaryActionIndex === 1 ? '▶ ' : '   '}${trafficMenuLabel}`;

    const summaryText = [
      titleLine,
      fromLine,
      toLine,
      `${timeLine} ${durationOnly}`.trim(),
      '',
      viewLine,
      trafficLine,
    ].join('\n');

    // Temporary performance mode: disable image/logo rendering on glasses.
    await this.bridge.displayText(this.compactForGlasses(summaryText));
  }

  /**
   * Display steps list on glasses
   */
  async displayStepsList(): Promise<void> {
    if (!this.ctx.currentRoute) return;

    await StateManager.goToStepsList(this.ctx, false);
    const menuText = this.renderStepsMenu();
    await this.bridge.displayText(this.compactForGlasses(menuText));
  }

  /**
   * Display single step detail on glasses
   */
  async displayStepDetail(stepIndex: number): Promise<void> {
    if (!this.ctx.currentRoute) return;

    await StateManager.goToStepDetail(this.ctx, stepIndex);
    const detail = this.ctx.currentRoute.detailedSteps[stepIndex] + `\n\n${t(this.ctx.language, 'doubleClickBack')}`;
    await this.bridge.displayText(this.compactForGlasses(detail));
  }

  /**
   * Display disruptions on glasses
   */
  async displayDisruptions(): Promise<void> {
    await StateManager.goToDisruptions(this.ctx);
    const disruptions = this.ctx.currentRoute?.relevantDisruptions ?? [];

    const text = disruptions.length > 0
      ? `${t(this.ctx.language, 'disruptionsTitle')}\n\n${t(this.ctx.language, 'disruptionsImpactedLines')}\n\n${disruptions.join('\n\n')}\n\n${t(this.ctx.language, 'doubleClickBack')}`
      : `${t(this.ctx.language, 'trafficDetails')}\n\n${t(this.ctx.language, 'noTrafficInfo')}\n\n${t(this.ctx.language, 'doubleClickBack')}`;
    await this.bridge.displayText(this.compactForGlasses(text));
  }

  /**
   * Handle double-click back navigation
   */
  async handleBackNavigation(): Promise<void> {
    const nextState = StateManager.getSmartBackState(this.ctx);

    switch (nextState) {
      case 'PRESET_PICKER':
        await this.displayPresetPicker();
        break;
      case 'SUMMARY':
        await this.displaySummary();
        break;
      case 'STEPS_LIST':
        await StateManager.goToStepsList(this.ctx, false);
        await this.bridge.displayText(this.renderStepsMenu());
        break;
      case 'DISRUPTIONS':
        await this.displayDisruptions();
        break;
    }
  }

  /**
   * Handle scrolling in steps list
   */
  async scrollSteps(direction: 'up' | 'down'): Promise<void> {
    if (!this.ctx.currentRoute) return;

    if (direction === 'down') {
      StateManager.nextStep(this.ctx);
    } else {
      StateManager.prevStep(this.ctx);
    }

    const menuText = this.renderStepsMenu();
    await this.bridge.displayText(this.compactForGlasses(menuText));
  }

  /**
   * Toggle summary action selection
   */
  async scrollSummary(direction: 'up' | 'down'): Promise<void> {
    if (!this.ctx.currentRoute) return;

    if (direction === 'down') {
      StateManager.nextSummaryAction(this.ctx);
    } else {
      StateManager.prevSummaryAction(this.ctx);
    }

    await this.displaySummary();
  }

  /**
   * Execute the selected summary action
   */
  async activateSummaryAction(): Promise<void> {
    if (!this.ctx.currentRoute) return;

    if (this.ctx.summaryActionIndex === 0) {
      await this.displayStepsList();
      return;
    }

    await this.displayDisruptions();
  }

  /**
   * Render steps menu text
   */
  private renderStepsMenu(): string {
    if (!this.ctx.currentRoute) return '';

    let menuText = `${t(this.ctx.language, 'yourItinerary')}\n\n`;
    const startIndex = Math.max(0, this.ctx.currentStepIndex - 1);
    const endIndex = Math.min(this.ctx.currentRoute.shortSteps.length - 1, this.ctx.currentStepIndex + 1);

    if (startIndex > 0) {
      menuText += '   ...\n';
    }

    for (let i = startIndex; i <= endIndex; i++) {
      const cursor = i === this.ctx.currentStepIndex ? '▶ ' : '   ';
      menuText += `${cursor}${this.ctx.currentRoute.shortSteps[i]}\n`;
    }

    if (endIndex < this.ctx.currentRoute.shortSteps.length - 1) {
      menuText += '   ...\n';
    }

    menuText += `\n${t(this.ctx.language, 'scrollStepHint')}`;
    return menuText;
  }

  /**
   * Apply preset values to input fields
   */
  private applyPresetToInputs(preset: any): void {
    if (this.ctx.inputDepart) {
      this.ctx.inputDepart.value = preset.depart;
    }
    if (this.ctx.inputArrivee) {
      this.ctx.inputArrivee.value = preset.arrivee;
    }
  }

  /**
   * Display time preference screen for shortcuts
   */
  async displayTimePreference(): Promise<void> {
    const selected = PresetsManager.getByIndex(this.ctx.travelPresets, this.ctx.currentPresetIndex);
    if (!selected) return;

    // Only transition to TIME_PREFERENCE if not already there (don't reset offset on scroll)
    if (this.ctx.currentState !== 'TIME_PREFERENCE') {
      await StateManager.goToTimePreference(this.ctx, selected);
    }

    const offsets = [
      { key: 0, label: t(this.ctx.language, 'timeNow') },
      { key: 5, label: t(this.ctx.language, 'timePlus5') },
      { key: 10, label: t(this.ctx.language, 'timePlus10') },
      { key: 30, label: t(this.ctx.language, 'timePlus30') },
      { key: 60, label: t(this.ctx.language, 'timePlus60') },
    ];

    let menuText = `${t(this.ctx.language, 'timePreferenceTitle')}\n\n`;
    const currentIndex = offsets.findIndex(o => o.key === this.ctx.currentTimeOffset);
    for (let i = 0; i < offsets.length; i++) {
      const offset = offsets[i];
      if (!offset) continue;
      const cursor = i === currentIndex ? '▶ ' : '   ';
      menuText += `${cursor}${offset.label}\n`;
    }
    menuText += `\n${t(this.ctx.language, 'timePreferenceHint')}`;

    await this.bridge.displayText(this.compactForGlasses(menuText));
  }

  /**
   * Run journey with selected time offset
   */
  async runJourneyWithTimeOffset(): Promise<void> {
    const selected = this.ctx.selectedPresetForTime;
    if (!selected) return;

    const origin = `raccourci: ${selected.label}`;
    writeLog(this.ctx, origin);

    // Navigate back to preset picker state
    await this.displayPresetPicker();
    
    // Run the journey with the selected offset
    await this.runJourney(selected.depart, selected.arrivee, origin);
  }
}
