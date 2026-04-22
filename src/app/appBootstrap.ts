import type { EvenButtonEvent } from './types';
import { EvenBridge as EvenBridgeImpl } from './bridge/evenBridge';
import { IdfmService as IdfmServiceImpl } from './idfm/idfmService';
import { Navigator as NavigatorImpl } from './router/navigator';
import { PresetsManager, renderPresetsDOM } from './presets';
import { createAppContext, writeLog } from './core/context';
import { resolveIdfmApiKey, setupApiKeyEditor, updateApiStatus } from './bootstrap/apiKey';
import { applyStaticTranslations } from './bootstrap/staticTranslations';
import { handleGlassesButton } from './bootstrap/glassesButtons';
import { setupWebUIHandlers } from './bootstrap/webUiHandlers';
import { t } from './i18n';
import { setStorageBridge } from './storage/persistentStorage';

export async function initializeApp(): Promise<void> {
  const ctx = createAppContext();
  document.documentElement.lang = ctx.language;
  applyStaticTranslations(ctx);
  const bridge = new EvenBridgeImpl();

  try {
    await bridge.connect();
    setStorageBridge(bridge);
  } catch {
    setStorageBridge(null);
  }

  const resolvedApiKey = await resolveIdfmApiKey();
  const idfmService = new IdfmServiceImpl(resolvedApiKey, ctx.language);
  const navigator = new NavigatorImpl(ctx, bridge, idfmService);

  // Load presets
  ctx.travelPresets = await PresetsManager.load();
  renderPresetsDOM(ctx, ctx.travelPresets, null);
  setupApiKeyEditor(ctx, resolvedApiKey);

  updateApiStatus(ctx, t(ctx.language, 'apiChecking'));

  if (!resolvedApiKey) {
    ctx.apiConnectionState = 'unauthorized';
    updateApiStatus(ctx, t(ctx.language, 'apiInvalid'));
    writeLog(ctx, t(ctx.language, 'apiKeyMissing'));
  } else {
    void (async () => {
      const status = await idfmService.checkApiStatus();
      console.log(`API status check result: ${status}`);

      if (status === 'ok') {
        ctx.apiConnectionState = 'ok';
        updateApiStatus(ctx, t(ctx.language, 'apiOk'));
      } else if (status === 'unauthorized') {
        ctx.apiConnectionState = 'unauthorized';
        updateApiStatus(ctx, t(ctx.language, 'apiInvalid'));
        writeLog(ctx, `${t(ctx.language, 'errorPrefix')}: ${t(ctx.language, 'apiInvalid')}`);
      } else {
        ctx.apiConnectionState = 'error';
        updateApiStatus(ctx, t(ctx.language, 'apiUnavailable'));
        writeLog(ctx, `${t(ctx.language, 'errorPrefix')}: ${t(ctx.language, 'apiUnavailable')}`);
      }

      if (ctx.currentState === 'PRESET_PICKER') {
        void navigator.displayPresetPicker();
      }
    })();
  }

  // Connect to glasses
  try {
    let isHandlingGlassesEvent = false;
    let pendingGlassesEvent: EvenButtonEvent | null = null;

    const dispatchGlassesEvent = (btn: EvenButtonEvent): void => {
      if (isHandlingGlassesEvent) {
        pendingGlassesEvent = btn;
        return;
      }

      isHandlingGlassesEvent = true;
      void (async () => {
        try {
          await handleGlassesButton(ctx, navigator, btn);
        } finally {
          isHandlingGlassesEvent = false;
          if (pendingGlassesEvent) {
            const next = pendingGlassesEvent;
            pendingGlassesEvent = null;
            dispatchGlassesEvent(next);
          }
        }
      })();
    };

    await bridge.connect();
    bridge.setButtonHandler((btn: EvenButtonEvent) => {
      dispatchGlassesEvent(btn);
    });
  } catch (err) {
    writeLog(ctx, `${t(ctx.language, 'glassesConnectionError')}: ${err}`);
  }

  // Web UI event listeners
  setupWebUIHandlers(ctx, navigator);

  // Initialize glasses display
  await navigator.displayPresetPicker();
}
