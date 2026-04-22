import type { AppContext, TravelPreset } from '../types';
import type { Navigator } from '../router/navigator';
import { PresetsManager, renderPresetsDOM } from '../presets';
import { writeLog } from '../core/context';
import { t } from '../i18n';

export function setupWebUIHandlers(ctx: AppContext, navigator: Navigator): void {
  let resetConfirmArmed = false;
  setupPlaceSuggestions(ctx, navigator);
  renderRouteOptions(ctx, navigator);

  const bindTap = (button: HTMLButtonElement | null, handler: () => Promise<void> | void): void => {
    if (!button) return;

    let lastTouchTs = 0;

    button.addEventListener('touchend', (event) => {
      lastTouchTs = Date.now();
      event.preventDefault();
      void handler();
    }, { passive: false });

    button.addEventListener('click', () => {
      if (Date.now() - lastTouchTs < 700) return;
      void handler();
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
      renderRouteOptions(ctx, navigator);
    } catch (err) {
      writeLog(ctx, `${t(ctx.language, 'errorPrefix')}: ${err}`);
    } finally {
      if (ctx.btnRecherche) {
        ctx.btnRecherche.innerText = t(ctx.language, 'calculateItinerary');
        ctx.btnRecherche.disabled = false;
      }
    }
  });

  bindTap(ctx.addPresetButton, async () => {
    try {
      setResetConfirmMode(false);
      const newPreset = PresetsManager.create();
      ctx.travelPresets = [...ctx.travelPresets, newPreset];
      ctx.editingPresetId = newPreset.id;
      await PresetsManager.save(ctx.travelPresets);
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

  bindTap(ctx.confirmResetButton, async () => {
    ctx.travelPresets = [];
    ctx.editingPresetId = null;
    await PresetsManager.save([]);
    renderPresetsDOM(ctx, [], null);
    setResetConfirmMode(false);
  });

  document.addEventListener('click', async (event) => {
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
        if (ctx.inputDepart) delete ctx.inputDepart.dataset.navitiaLocation;
        if (ctx.inputArrivee) delete ctx.inputArrivee.dataset.navitiaLocation;
        break;

      case 'edit':
        ctx.editingPresetId = presetId;
        renderPresetsDOM(ctx, ctx.travelPresets, ctx.editingPresetId);
        break;

      case 'save':
        await savePresetFromDOM(ctx, presetId);
        break;

      case 'cancel':
        ctx.editingPresetId = null;
        renderPresetsDOM(ctx, ctx.travelPresets, null);
        break;

      case 'delete':
        ctx.travelPresets = PresetsManager.delete(ctx.travelPresets, presetId);
        ctx.editingPresetId = null;
        await PresetsManager.save(ctx.travelPresets);
        renderPresetsDOM(ctx, ctx.travelPresets, null);
        break;
    }
  });
}

async function savePresetFromDOM(ctx: AppContext, presetId: string): Promise<void> {
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
  await PresetsManager.save(ctx.travelPresets);
  renderPresetsDOM(ctx, ctx.travelPresets, null);
}

function setupPlaceSuggestions(ctx: AppContext, navigator: Navigator): void {
  bindSuggestionsForInput(ctx, navigator, ctx.inputDepart, 'depart');
  bindSuggestionsForInput(ctx, navigator, ctx.inputArrivee, 'arrivee');
}

function bindSuggestionsForInput(
  ctx: AppContext,
  navigator: Navigator,
  input: HTMLInputElement | null,
  kind: 'depart' | 'arrivee'
): void {
  if (!input) return;

  const listId = kind === 'depart' ? 'depart-suggestions-list' : 'arrivee-suggestions-list';
  let list = document.getElementById(listId) as HTMLDivElement | null;
  if (!list) {
    list = document.createElement('div');
    list.id = listId;
    list.className = 'place-suggestions is-hidden';
    input.insertAdjacentElement('afterend', list);
  }

  let debounceTimer: number | undefined;
  let isProcessingSelection = false;

  const hideList = (): void => {
    if (!list) return;
    list.classList.add('is-hidden');
    list.innerHTML = '';
  };

  const renderSuggestions = async (): Promise<void> => {
    const query = input.value.trim();

    // If a location has been selected, don't show suggestions
    if (input.dataset.navitiaLocation) {
      hideList();
      return;
    }

    if (query.length < 2) {
      hideList();
      return;
    }

    const suggestions = await navigator.getPlaceSuggestions(query);
    if (!list) return;

    if (suggestions.length === 0) {
      list.innerHTML = `<button type="button" class="place-suggestion-item" disabled>${t(ctx.language, 'suggestionNoResults')}</button>`;
      list.classList.remove('is-hidden');
      return;
    }

    list.innerHTML = suggestions
      .map((suggestion, index) => `<button type="button" class="place-suggestion-item" data-location="${escapeHtmlAttribute(suggestion.location)}" data-label="${escapeHtmlAttribute(suggestion.label)}">${escapeHtmlText(suggestion.label)}</button>`)
      .join('');

    for (const item of Array.from(list.querySelectorAll<HTMLButtonElement>('.place-suggestion-item'))) {
      item.addEventListener('click', () => {
        const nextLabel = item.dataset.label || '';
        const location = item.dataset.location || '';
        input.value = nextLabel;
        input.dataset.navitiaLocation = location;
        isProcessingSelection = true;
        hideList();
        // Reset flag after input event has fired
        window.setTimeout(() => {
          isProcessingSelection = false;
        }, 50);
      });
    }

    list.classList.remove('is-hidden');
  };

  input.addEventListener('input', () => {
    if (isProcessingSelection) return;

    // Editing text after selecting a suggestion must reopen autocomplete.
    if (input.dataset.navitiaLocation) {
      delete input.dataset.navitiaLocation;
    }
    
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      void renderSuggestions();
    }, 220);
  });

  input.addEventListener('focus', () => {
    // Hide suggestions from all other inputs
    document.querySelectorAll<HTMLDivElement>('.place-suggestions').forEach((el) => {
      if (el !== list) {
        el.classList.add('is-hidden');
        el.innerHTML = '';
      }
    });

    // Only show suggestions if no location is already selected
    if (!input.dataset.navitiaLocation && input.value.trim().length >= 2) {
      void renderSuggestions();
    }
  });

  input.addEventListener('blur', () => {
    window.setTimeout(() => hideList(), 150);
  });
}

function renderRouteOptions(ctx: AppContext, navigator: Navigator): void {
  const container = ctx.routeOptionsContainer;
  if (!container) return;
  const card = container.closest('.card');

  const routes = ctx.availableRoutes;
  if (routes.length <= 1) {
    container.innerHTML = '';
    container.classList.add('is-hidden');
    if (card) card.classList.add('is-hidden');
    return;
  }

  container.classList.remove('is-hidden');
  if (card) card.classList.remove('is-hidden');
  const shortestDuration = Math.min(...routes.map((route) => route.durationMin || Number.POSITIVE_INFINITY));
  container.innerHTML = routes
    .map((route, index) => {
      const isActive = index === ctx.currentRouteIndex;
      const transportLabels = route.transportLabels.length > 0 ? route.transportLabels : [t(ctx.language, 'trainFallback')];
      const transportPreview = transportLabels.slice(0, 4);
      const hiddenTransportCount = Math.max(0, transportLabels.length - transportPreview.length);
      const durationDelta = route.durationMin - shortestDuration;
      const durationLabel = durationDelta > 0
        ? `${route.durationMin} ${t(ctx.language, 'min')} (+${durationDelta})`
        : `${route.durationMin} ${t(ctx.language, 'min')}`;
      const walkLabel = route.walkMin > 0 ? `${t(ctx.language, 'walk')} ${route.walkMin} ${t(ctx.language, 'min')}` : '';

      return `
        <button type="button" class="chip-btn route-option-card ${isActive ? 'is-active' : ''}" data-route-index="${index}">
          <div class="route-option-header">
            <div class="route-option-heading">
              <span class="chip-title">${t(ctx.language, 'routeOption')} ${index + 1}</span>
              <span class="route-option-time">${escapeHtmlText(route.departureTime)} → ${escapeHtmlText(route.arrivalTime)}</span>
            </div>
            <span class="route-option-duration">${escapeHtmlText(durationLabel)}</span>
          </div>
          <div class="route-option-badges">
            ${transportPreview.map((label) => `<span class="route-option-badge">${escapeHtmlText(label)}</span>`).join('')}
            ${hiddenTransportCount > 0 ? `<span class="route-option-badge route-option-badge-more">+${hiddenTransportCount}</span>` : ''}
          </div>
          <div class="route-option-meta">
            ${walkLabel ? `<span class="route-option-subline">${escapeHtmlText(walkLabel)}</span>` : ''}
          </div>
        </button>
      `;
    })
    .join('');

  for (const button of Array.from(container.querySelectorAll<HTMLButtonElement>('[data-route-index]'))) {
    button.addEventListener('click', () => {
      const raw = button.dataset.routeIndex;
      if (!raw) return;
      const index = Number.parseInt(raw, 10);
      if (!Number.isFinite(index)) return;
      void navigator.selectRouteOption(index).then(() => {
        renderRouteOptions(ctx, navigator);
      });
    });
  }
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value)
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
