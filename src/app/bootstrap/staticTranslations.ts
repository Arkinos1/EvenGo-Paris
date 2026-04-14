import type { AppContext } from '../types';
import { t } from '../i18n';

export function applyStaticTranslations(ctx: AppContext): void {
  const title = document.getElementById('app-title');
  const subtitle = document.getElementById('app-subtitle');
  const journeyCardTitle = document.getElementById('journey-card-title');
  const shortcutsCardTitle = document.getElementById('shortcuts-card-title');
  const logsCardTitle = document.getElementById('logs-card-title');
  const apiCardTitle = document.getElementById('api-card-title');
  const footerCreditIntro = document.getElementById('footer-credit-intro');
  const departureLabel = document.getElementById('departure-label');
  const arrivalLabel = document.getElementById('arrival-label');

  if (title) title.textContent = 'EvenGo Paris';
  if (subtitle) subtitle.textContent = t(ctx.language, 'appSubtitle');
  if (journeyCardTitle) journeyCardTitle.textContent = t(ctx.language, 'journeyCardTitle');
  if (shortcutsCardTitle) shortcutsCardTitle.textContent = t(ctx.language, 'shortcutsCardTitle');
  if (logsCardTitle) logsCardTitle.textContent = t(ctx.language, 'logsCardTitle');
  if (apiCardTitle) apiCardTitle.textContent = t(ctx.language, 'apiCardTitle');
  if (footerCreditIntro) footerCreditIntro.textContent = t(ctx.language, 'footerCreditIntro');
  if (departureLabel) departureLabel.textContent = t(ctx.language, 'departure');
  if (arrivalLabel) arrivalLabel.textContent = t(ctx.language, 'arrival');

  if (ctx.btnRecherche) ctx.btnRecherche.textContent = t(ctx.language, 'calculateItinerary');
  if (ctx.addPresetButton) ctx.addPresetButton.textContent = t(ctx.language, 'addShortcut');
  if (ctx.resetPresetsButton) ctx.resetPresetsButton.textContent = t(ctx.language, 'clearAll');
  if (ctx.confirmResetButton) ctx.confirmResetButton.textContent = t(ctx.language, 'confirmAction');
}
