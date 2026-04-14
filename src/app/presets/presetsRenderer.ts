import { VISIBLE_PRESETS_WINDOW } from '../constants';
import type { AppContext, TravelPreset } from '../types';
import { escapeHtml } from '../utils/index';
import { t } from '../i18n';

/**
 * Render preset picker for glasses display
 */
export function renderPresetPickerForGlasses(
  presets: TravelPreset[],
  currentIndex: number,
  language: AppContext['language'],
  apiState: 'checking' | 'ok' | 'unauthorized' | 'error'
): string {
  if (presets.length === 0) {
    const apiLabel = apiState === 'ok'
      ? t(language, 'apiOk')
      : apiState === 'checking'
        ? t(language, 'apiChecking')
        : t(language, 'apiUnavailable');

    return `${t(language, 'presetsTitle')}\n\n${t(language, 'noPresetSaved')}\n${apiLabel}\n\n${t(language, 'createOnPhone')}`;
  }

  let text = `${t(language, 'presetsTitle')}\n\n`;
  const startIndex = Math.max(0, currentIndex - VISIBLE_PRESETS_WINDOW);
  const endIndex = Math.min(presets.length - 1, currentIndex + VISIBLE_PRESETS_WINDOW);

  if (startIndex > 0) {
    text += '   ...\n';
  }

  for (let i = startIndex; i <= endIndex; i++) {
    const preset = presets[i];
    if (!preset) continue;
    const cursor = i === currentIndex ? '▶ ' : '   ';
    text += `${cursor}${preset.label}\n`;
  }

  if (endIndex < presets.length - 1) {
    text += '   ...\n';
  }

  const apiLabel = apiState === 'ok'
    ? t(language, 'apiOk')
    : apiState === 'checking'
      ? t(language, 'apiChecking')
      : t(language, 'apiUnavailable');

  text += `\n${apiLabel}\n${t(language, 'presetPickerHint')}`;
  return text;
}

/**
 * Render DOM presets list for web UI
 */
export function renderPresetsDOM(ctx: AppContext, presets: TravelPreset[], editingPresetId: string | null): void {
  if (!ctx.presetList) return;

  if (presets.length === 0) {
    ctx.presetList.innerHTML = `
      <div class="preset-empty">
        <strong>${t(ctx.language, 'webNoPresetTitle')}</strong>
        <span>${t(ctx.language, 'webNoPresetHint')}</span>
      </div>
    `;
    return;
  }

  ctx.presetList.innerHTML = presets
    .map((preset, index) => `
      <div class="preset-item ${editingPresetId === preset.id ? 'is-editing' : ''}" data-preset-id="${preset.id}" style="--preset-index:${index};">
        <div class="preset-header">
          ${
            editingPresetId === preset.id
              ? `
            <input class="preset-name preset-name-input" data-preset-field="label" data-preset-id="${preset.id}"
              value="${escapeHtml(preset.label)}" aria-label="${t(ctx.language, 'presetNameAria')}">
          `
              : `
            <div class="preset-name-display" aria-label="${t(ctx.language, 'presetNameAria')}">
              <span class="preset-name-value">${escapeHtml(preset.label)}</span>
              <span class="preset-name-hint">Modifier pour renommer</span>
            </div>
          `
          }
          <div class="preset-actions">
            ${
              editingPresetId === preset.id
                ? `
              <button type="button" class="preset-action save" data-action="save" data-preset-id="${preset.id}" title="${t(ctx.language, 'save')}">${t(ctx.language, 'save')}</button>
              <button type="button" class="preset-action cancel" data-action="cancel" data-preset-id="${preset.id}" title="${t(ctx.language, 'cancel')}">${t(ctx.language, 'cancel')}</button>
            `
                : `
              <button type="button" class="preset-action use" data-action="use" data-preset-id="${preset.id}" title="${t(ctx.language, 'use')}">${t(ctx.language, 'use')}</button>
              <button type="button" class="preset-action edit" data-action="edit" data-preset-id="${preset.id}" title="${t(ctx.language, 'edit')}">${t(ctx.language, 'edit')}</button>
            `
            }
            <button type="button" class="preset-action delete" data-action="delete" data-preset-id="${preset.id}" title="${t(ctx.language, 'delete')}">${t(ctx.language, 'delete')}</button>
          </div>
        </div>

        ${
          editingPresetId === preset.id
            ? `
          <div class="preset-grid">
            <label>${t(ctx.language, 'departure')}
              <input data-preset-field="depart" data-preset-id="${preset.id}"
                value="${escapeHtml(preset.depart)}" placeholder="${t(ctx.language, 'addressOrStation')}">
            </label>
            <label>${t(ctx.language, 'arrival')}
              <input data-preset-field="arrivee" data-preset-id="${preset.id}"
                value="${escapeHtml(preset.arrivee)}" placeholder="${t(ctx.language, 'addressOrStation')}">
            </label>
          </div>
        `
            : ''
        }
      </div>
    `)
    .join('');
}
