import type { AppContext, TravelPreset } from '../types';
import type { Navigator } from '../router/navigator';
import { PresetsManager, renderPresetsDOM } from '../presets';
import { writeLog } from '../core/context';
import { t } from '../i18n';

export function setupWebUIHandlers(ctx: AppContext, navigator: Navigator): void {
  let resetConfirmArmed = false;

  const bindTap = (button: HTMLButtonElement | null, handler: () => void): void => {
    if (!button) return;

    let lastTouchTs = 0;

    button.addEventListener('touchend', (event) => {
      lastTouchTs = Date.now();
      event.preventDefault();
      handler();
    }, { passive: false });

    button.addEventListener('click', () => {
      if (Date.now() - lastTouchTs < 700) return;
      handler();
    });
  };

  const setResetConfirmMode = (armed: boolean): void => {
    resetConfirmArmed = armed;
    if (ctx.confirmResetButton) {
      ctx.confirmResetButton.classList.toggle('is-hidden', !armed);
    }
    if (ctx.resetPresetsButton) {
      ctx.resetPresetsButton.textContent = armed ? t(ctx.language, 'cancel') : t(ctx.language, 'clearAll');
      ctx.resetPresetsButton.classList.toggle('is-cancel', armed);
    }
  };

  ctx.btnRecherche?.addEventListener('click', async () => {
    if (ctx.divLogs) {
      ctx.divLogs.innerHTML = '';
    }

    try {
      if (ctx.btnRecherche) {
        ctx.btnRecherche.innerText = t(ctx.language, 'searchLoading');
        ctx.btnRecherche.disabled = true;
      }

      await navigator.runJourneyFromInputs();
    } catch (err) {
      writeLog(ctx, `${t(ctx.language, 'errorPrefix')}: ${err}`);
    } finally {
      if (ctx.btnRecherche) {
        ctx.btnRecherche.innerText = t(ctx.language, 'calculateItinerary');
        ctx.btnRecherche.disabled = false;
      }
    }
  });

  bindTap(ctx.addPresetButton, () => {
    try {
      setResetConfirmMode(false);
      const newPreset = PresetsManager.create();
      ctx.travelPresets = [...ctx.travelPresets, newPreset];
      ctx.editingPresetId = newPreset.id;
      PresetsManager.save(ctx.travelPresets);
      renderPresetsDOM(ctx, ctx.travelPresets, ctx.editingPresetId);
    } catch (err) {
      writeLog(ctx, `${t(ctx.language, 'errorPrefix')}: ${t(ctx.language, 'addShortcutFailed')} (${String(err)})`);
      console.error('Add preset failed:', err);
    }
  });

  bindTap(ctx.resetPresetsButton, () => {
    if (resetConfirmArmed) {
      setResetConfirmMode(false);
      return;
    }

    if (ctx.travelPresets.length === 0) return;
    setResetConfirmMode(true);
  });

  bindTap(ctx.confirmResetButton, () => {
    ctx.travelPresets = [];
    ctx.editingPresetId = null;
    PresetsManager.save([]);
    renderPresetsDOM(ctx, [], null);
    setResetConfirmMode(false);
  });

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const action = target.dataset.action;
    const presetId = target.dataset.presetId;

    if (!action || !presetId) return;

    setResetConfirmMode(false);

    const preset = ctx.travelPresets.find((p: TravelPreset) => p.id === presetId);
    if (!preset) return;

    switch (action) {
      case 'use':
        if (ctx.inputDepart) ctx.inputDepart.value = preset.depart;
        if (ctx.inputArrivee) ctx.inputArrivee.value = preset.arrivee;
        break;

      case 'edit':
        ctx.editingPresetId = presetId;
        renderPresetsDOM(ctx, ctx.travelPresets, ctx.editingPresetId);
        break;

      case 'save':
        savePresetFromDOM(ctx, presetId);
        break;

      case 'cancel':
        ctx.editingPresetId = null;
        renderPresetsDOM(ctx, ctx.travelPresets, null);
        break;

      case 'delete':
        ctx.travelPresets = PresetsManager.delete(ctx.travelPresets, presetId);
        ctx.editingPresetId = null;
        PresetsManager.save(ctx.travelPresets);
        renderPresetsDOM(ctx, ctx.travelPresets, null);
        break;
    }
  });
}

function savePresetFromDOM(ctx: AppContext, presetId: string): void {
  const item = ctx.presetList?.querySelector<HTMLElement>(`[data-preset-id="${presetId}"]`);
  if (!item) return;

  const labelInput = item.querySelector<HTMLInputElement>('[data-preset-field="label"]');
  const departInput = item.querySelector<HTMLInputElement>('[data-preset-field="depart"]');
  const arriveeInput = item.querySelector<HTMLInputElement>('[data-preset-field="arrivee"]');

  const defaultLabel = t(ctx.language, 'shortcutDefaultLabel');
  const label = labelInput?.value.trim() || defaultLabel;
  const depart = departInput?.value.trim() || '';
  const arrivee = arriveeInput?.value.trim() || '';

  ctx.travelPresets = PresetsManager.update(ctx.travelPresets, presetId, { label, depart, arrivee })
    .filter((preset) => preset.depart.length > 0 || preset.arrivee.length > 0);

  ctx.editingPresetId = null;
  PresetsManager.save(ctx.travelPresets);
  renderPresetsDOM(ctx, ctx.travelPresets, null);
}
