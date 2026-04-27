import type { AppContext } from '../types';
import { IDFM_API_KEY_STORAGE_KEY } from '../constants';
import { writeLog } from '../core/context';
import { t } from '../i18n';
import { readPersistentValue, removePersistentValue, writePersistentValue } from '../storage/persistentStorage';

const IDFM_PORTAL_URL = 'https://prim.iledefrance-mobilites.fr/';

export async function resolveIdfmApiKey(): Promise<string> {
  const fromStorage = (await readPersistentValue(IDFM_API_KEY_STORAGE_KEY) || '').trim();
  if (fromStorage.length > 0) return fromStorage;

  return '';
}

export function setupApiKeyEditor(ctx: AppContext, currentApiKey: string): void {
  const apiCard = document.getElementById('api-card') as HTMLElement | null;
  const editor = document.getElementById('api-key-editor') as HTMLElement | null;
  const input = document.getElementById('input-api-key') as HTMLInputElement | null;
  const saveButton = document.getElementById('btn-api-key-save') as HTMLButtonElement | null;
  const cancelButton = document.getElementById('btn-api-key-cancel') as HTMLButtonElement | null;
  const preview = document.getElementById('api-key-preview') as HTMLElement | null;
  const editHint = document.getElementById('api-edit-hint') as HTMLElement | null;
  if (!apiCard || !editor || !input || !saveButton || !cancelButton || !preview || !editHint) return;

  const hasKey = currentApiKey.trim().length > 0;
  apiCard.setAttribute('aria-label', hasKey ? t(ctx.language, 'apiKeyCardHintEdit') : t(ctx.language, 'apiKeyCardHintAdd'));
  editHint.textContent = hasKey
    ? t(ctx.language, 'apiKeyCardHintEdit')
    : t(ctx.language, 'apiKeyCardHintAdd');
  renderApiKeyPreview(ctx, preview, hasKey, currentApiKey);
  input.placeholder = t(ctx.language, 'apiKeyPlaceholder');
  input.value = currentApiKey;

  const openEditor = (): void => {
    editor.classList.remove('is-hidden');
    input.focus();
    input.select();
  };

  apiCard.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, button, textarea, select, a')) return;
    openEditor();
  });

  apiCard.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openEditor();
    }
  });

  editor.addEventListener('click', (event) => event.stopPropagation());

  cancelButton.addEventListener('click', () => {
    editor.classList.add('is-hidden');
    input.value = currentApiKey;
  });

  saveButton.addEventListener('click', async () => {
    const nextKey = input.value.trim();
    try {
      if (nextKey.length > 0) {
        await writePersistentValue(IDFM_API_KEY_STORAGE_KEY, nextKey);
      } else {
        await removePersistentValue(IDFM_API_KEY_STORAGE_KEY);
      }
    } catch {
      writeLog(ctx, `${t(ctx.language, 'errorPrefix')}: ${t(ctx.language, 'apiKeyStorageUnavailable')}`);
      return;
    }

    writeLog(ctx, t(ctx.language, 'apiKeySaved'));
    window.location.reload();
  });
}

export function updateApiStatus(ctx: AppContext, message: string): void {
  if (!ctx.apiStatus) return;
  ctx.apiStatus.classList.remove('is-ok', 'is-error');
  if (ctx.apiDescription) ctx.apiDescription.textContent = message;

  if (message === t(ctx.language, 'apiOk')) {
    ctx.apiStatus.classList.add('is-ok');
  } else if (message === t(ctx.language, 'apiInvalid') || message === t(ctx.language, 'apiUnavailable')) {
    ctx.apiStatus.classList.add('is-error');
  }
}

function maskApiKey(value: string): string {
  if (!value) return '';
  if (value.length <= 6) return '***';
  return `${value.slice(0, 3)}...${value.slice(-3)}`;
}

function renderApiKeyPreview(ctx: AppContext, preview: HTMLElement, hasKey: boolean, currentApiKey: string): void {
  preview.replaceChildren();

  if (hasKey) {
    preview.classList.remove('with-link');
    preview.textContent = `${t(ctx.language, 'apiKeyConfigured')}: ${maskApiKey(currentApiKey)}`;
    return;
  }

  preview.classList.add('with-link');

  const text = document.createElement('span');
  text.textContent = t(ctx.language, 'apiKeyNotConfigured');

  const urlText = document.createElement('span');
  urlText.className = 'api-key-url-text';
  urlText.textContent = IDFM_PORTAL_URL;

  preview.append(text, urlText);
}
