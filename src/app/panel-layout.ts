import type { AppContext, AppModule } from '@/app/app-context';
import { replayPendingCalls, clearAllPendingCalls } from '@/app/pending-panel-data';
import type { RelatedAsset } from '@/types';
import type { TheaterPostureSummary } from '@/services/military-surge';
import {
  MapContainer,
  NewsPanel,
  MarketPanel,
  StockAnalysisPanel,
  StockBacktestPanel,
  HeatmapPanel,
  CommoditiesPanel,
  CryptoPanel,
  PredictionPanel,
  MonitorPanel,
  EconomicPanel,
  GdeltIntelPanel,
  LiveNewsPanel,
  LiveWebcamsPanel,
  CIIPanel,
  CascadePanel,
  StrategicRiskPanel,
  StrategicPosturePanel,
  TechEventsPanel,
  ServiceStatusPanel,
  RuntimeConfigPanel,
  InsightsPanel,
  MacroSignalsPanel,
  ETFFlowsPanel,
  StablecoinPanel,
  UcdpEventsPanel,
  InvestmentsPanel,
  TradePolicyPanel,
  SupplyChainPanel,
  GulfEconomiesPanel,
  WorldClockPanel,
  AirlineIntelPanel,
  AviationCommandBar,
} from '@/components';
import { SatelliteFiresPanel } from '@/components/SatelliteFiresPanel';
import { focusInvestmentOnMap } from '@/services/investments-focus';
import { debounce, saveToStorage, loadFromStorage } from '@/utils';
import { escapeHtml } from '@/utils/sanitize';
import {
  FEEDS,
  INTEL_SOURCES,
  DEFAULT_PANELS,
  STORAGE_KEYS,
  SITE_VARIANT,
} from '@/config';
import { BETA_MODE } from '@/config/beta';
import { t } from '@/services/i18n';
import { getCurrentTheme } from '@/utils';
import { trackCriticalBannerAction } from '@/services/analytics';
import { getSecretState } from '@/services/runtime-config';

export interface PanelLayoutCallbacks {
  openCountryStory: (code: string, name: string) => void;
  openCountryBrief: (code: string) => void;
  loadAllData: () => Promise<void>;
  updateMonitorResults: () => void;
  loadSecurityAdvisories?: () => Promise<void>;
}

export class PanelLayoutManager implements AppModule {
  private ctx: AppContext;
  private callbacks: PanelLayoutCallbacks;
  private panelDragCleanupHandlers: Array<() => void> = [];
  private resolvedPanelOrder: string[] = [];
  private bottomSetMemory: Set<string> = new Set();
  private criticalBannerEl: HTMLElement | null = null;
  private aviationCommandBar: AviationCommandBar | null = null;
  private readonly applyTimeRangeFilterDebounced: (() => void) & { cancel(): void };

  constructor(ctx: AppContext, callbacks: PanelLayoutCallbacks) {
    this.ctx = ctx;
    this.callbacks = callbacks;
    this.applyTimeRangeFilterDebounced = debounce(() => {
      this.applyTimeRangeFilterToNewsPanels();
    }, 120);
  }

  init(): void {
    this.renderLayout();
  }

  destroy(): void {
    clearAllPendingCalls();
    this.applyTimeRangeFilterDebounced.cancel();
    this.panelDragCleanupHandlers.forEach((cleanup) => cleanup());
    this.panelDragCleanupHandlers = [];
    if (this.criticalBannerEl) {
      this.criticalBannerEl.remove();
      this.criticalBannerEl = null;
    }
    // Clean up happy variant panels
    this.ctx.tvMode?.destroy();
    this.ctx.tvMode = null;
    this.ctx.countersPanel?.destroy();
    this.ctx.progressPanel?.destroy();
    this.ctx.breakthroughsPanel?.destroy();
    this.ctx.heroPanel?.destroy();
    this.ctx.digestPanel?.destroy();
    this.ctx.speciesPanel?.destroy();
    this.ctx.renewablePanel?.destroy();

    // Clean up aviation components
    this.aviationCommandBar?.destroy();
    this.aviationCommandBar = null;
    this.ctx.panels['airline-intel']?.destroy();

    window.removeEventListener('resize', this.ensureCorrectZones);
  }

  renderLayout(): void {
    this.ctx.container.innerHTML = `
      ${this.ctx.isDesktopApp ? '<div class="tauri-titlebar" data-tauri-drag-region></div>' : ''}
      <div class="header">
        <div class="header-left">
          <button class="hamburger-btn" id="hamburgerBtn" aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div class="variant-switcher">${(() => {
        const local = this.ctx.isDesktopApp || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        const vHref = (v: string, prod: string) => local || SITE_VARIANT === v ? '#' : prod;
        const vTarget = (_v: string) => '';
        return `
            <a href="${vHref('full', 'https://worldmonitor.app')}"
               class="variant-option ${SITE_VARIANT === 'full' ? 'active' : ''}"
               data-variant="full"
               ${vTarget('full')}
               title="${t('header.world')}${SITE_VARIANT === 'full' ? ` ${t('common.currentVariant')}` : ''}">
              <span class="variant-icon">🌍</span>
              <span class="variant-label">${t('header.world')}</span>
            </a>
            <span class="variant-divider"></span>
            <a href="${vHref('tech', 'https://zintelligence.vercel.app/?lat=24.3460&lon=50.6964&zoom=3.77&view=global&timeRange=7d&layers=cables%2Coutages%2Cdatacenters%2Cnatural%2CstartupHubs%2CcloudRegions%2CtechHQs%2CtechEvents')}"
               class="variant-option ${SITE_VARIANT === 'tech' ? 'active' : ''}"
               data-variant="tech"
               ${vTarget('tech')}
               title="${t('header.tech')}${SITE_VARIANT === 'tech' ? ` ${t('common.currentVariant')}` : ''}">
              <span class="variant-icon">💻</span>
              <span class="variant-label">${t('header.tech')}</span>
            </a>
            <span class="variant-divider"></span>
            <a href="${vHref('finance', 'https://finance.worldmonitor.app')}"
               class="variant-option ${SITE_VARIANT === 'finance' ? 'active' : ''}"
               data-variant="finance"
               ${vTarget('finance')}
               title="${t('header.finance')}${SITE_VARIANT === 'finance' ? ` ${t('common.currentVariant')}` : ''}">
              <span class="variant-icon">📈</span>
              <span class="variant-label">${t('header.finance')}</span>
            </a>
            ${SITE_VARIANT === 'commodity' ? `<span class="variant-divider"></span>
            <a href="${vHref('commodity', 'https://commodity.worldmonitor.app')}"
               class="variant-option active"
               data-variant="commodity"
               ${vTarget('commodity')}
               title="${t('header.commodity')} ${t('common.currentVariant')}">
              <span class="variant-icon">⛏️</span>
              <span class="variant-label">${t('header.commodity')}</span>
            </a>` : ''}
            ${SITE_VARIANT === 'happy' ? `<span class="variant-divider"></span>
            <a href="${vHref('happy', 'https://happy.worldmonitor.app')}"
               class="variant-option active"
               data-variant="happy"
               ${vTarget('happy')}
               title="Good News ${t('common.currentVariant')}">
              <span class="variant-icon">☀️</span>
              <span class="variant-label">Good News</span>
            </a>` : ''}`;
      })()}</div>
          <span class="logo"><svg class="zb-logo-full" width="120" height="22" viewBox="0 0 120 22" fill="none"><g clip-path="url(#zbLogoClip)"><path d="M15.7143 1.85781V7.74894C15.7143 8.07797 15.5287 8.37877 15.2343 8.52555L12.7106 9.78684C12.4161 9.93361 12.2305 10.2344 12.2305 10.5635V20.1425C12.2305 20.6223 11.8416 21.011 11.3616 21.011H8.74589C8.26584 21.011 7.87695 20.6223 7.87695 20.1425V12.3022C7.87695 11.9731 8.06252 11.6723 8.357 11.5255L10.8807 10.2643C11.1752 10.1175 11.3608 9.81668 11.3608 9.48765V1.85781C11.3608 1.37797 11.7496 0.989258 12.2297 0.989258H14.8454C15.3254 0.989258 15.7143 1.37797 15.7143 1.85781Z" fill="#5CA3E5"/><path d="M7.87446 6.2123V7.74698C7.87446 8.07601 7.68889 8.37681 7.39441 8.52359L4.87071 9.78488C4.57622 9.93165 4.39066 10.2325 4.39066 10.5615V15.7897C4.39066 16.2696 4.00177 16.6583 3.52172 16.6583H0.906044C0.425992 16.6583 0.0371094 16.2696 0.0371094 15.7897V12.3002C0.0371094 11.9712 0.222676 11.6704 0.517161 11.5236L3.04086 10.2623C3.33535 10.1155 3.52091 9.81472 3.52091 9.48569V6.2123C3.52091 5.73246 3.9098 5.34375 4.38985 5.34375H7.00553C7.48558 5.34375 7.87446 5.73246 7.87446 6.2123Z" fill="#5CA3E5"/><path d="M20.0692 11.2882V15.7882C20.0692 16.2696 19.6787 16.66 19.197 16.66H16.587C16.1053 16.66 15.7148 16.2696 15.7148 15.7882V12.3067C15.7148 11.9769 15.9012 11.6745 16.1965 11.5269L18.5508 10.3503C19.2479 10.0019 20.0676 10.5084 20.0676 11.2874L20.0692 11.2882Z" fill="#5CA3E5"/><path d="M37.6207 14.9421H31.8036C31.614 14.9421 31.5083 14.7236 31.6261 14.5752L37.611 7.0131C37.6425 6.97278 37.6602 6.92359 37.6602 6.87278V5.57036C37.6602 5.44536 37.5586 5.34375 37.4335 5.34375H29.6421C29.5171 5.34375 29.4154 5.44536 29.4154 5.57036V6.83488C29.4154 6.95988 29.5171 7.06149 29.6421 7.06149H34.7872C34.9768 7.06149 35.0825 7.28004 34.9647 7.42843L28.9652 14.9905C28.9338 15.0308 28.916 15.08 28.916 15.1308V16.4333C28.916 16.5583 29.0177 16.6599 29.1427 16.6599H37.6215C37.7465 16.6599 37.8482 16.5583 37.8482 16.4333V15.1688C37.8482 15.0438 37.7465 14.9421 37.6215 14.9421H37.6207Z" fill="currentColor"/><path d="M64.3276 6.77198V5.57036C64.3276 5.44536 64.2259 5.34375 64.1009 5.34375H38.838C38.713 5.34375 38.6113 5.44536 38.6113 5.57036V16.4325C38.6113 16.5575 38.713 16.6591 38.838 16.6591H46.3954C46.5205 16.6591 46.6221 16.5575 46.6221 16.4325V15.2147C46.6221 15.0897 46.5205 14.9881 46.3954 14.9881H40.8212C40.6961 14.9881 40.5945 14.8865 40.5945 14.7615V11.8897C40.5945 11.7647 40.6961 11.6631 40.8212 11.6631H46.0671C46.1921 11.6631 46.2938 11.5615 46.2938 11.4365V10.2502C46.2938 10.1252 46.1921 10.0236 46.0671 10.0236H40.8212C40.6961 10.0236 40.5945 9.92198 40.5945 9.79698V7.22198C40.5945 7.09698 40.6961 6.99536 40.8212 6.99536H49.705C49.83 6.99536 49.9317 7.09698 49.9317 7.22198V16.43C49.9317 16.555 50.0333 16.6567 50.1584 16.6567H51.6889C51.814 16.6567 51.9156 16.555 51.9156 16.43V7.22198C51.9156 7.09698 52.0173 6.99536 52.1423 6.99536H58.5589C58.6839 6.99536 58.7856 7.09698 58.7856 7.22198V16.43C58.7856 16.555 58.8873 16.6567 59.0123 16.6567H60.5428C60.6679 16.6567 60.7696 16.555 60.7696 16.43V7.22198C60.7696 7.09698 60.8712 6.99536 60.9963 6.99536H64.1033C64.2283 6.99536 64.33 6.89375 64.33 6.76875L64.3276 6.77198Z" fill="currentColor"/><path d="M68.8948 5.4915C68.8617 5.4036 68.777 5.34473 68.6826 5.34473H66.9044C66.81 5.34473 66.7253 5.4036 66.6922 5.49231L62.6452 16.3544C62.5904 16.502 62.6993 16.66 62.8574 16.66H64.4C64.4961 16.66 64.5824 16.5988 64.6139 16.5084L65.3827 14.2996C65.4142 14.2084 65.5005 14.148 65.5965 14.148H69.8662C69.9622 14.148 70.0477 14.2084 70.08 14.2988L70.8634 16.5101C70.8957 16.6004 70.9812 16.6609 71.0772 16.6609H72.761C72.9192 16.6609 73.0289 16.5028 72.9732 16.3552L68.8964 5.49231L68.8948 5.4915ZM69.1134 12.4923H66.3332C66.1774 12.4923 66.0677 12.3383 66.1194 12.1915L67.503 8.24553C67.574 8.04392 67.8588 8.04392 67.9298 8.24553L69.3264 12.1915C69.3789 12.3391 69.2691 12.4931 69.1126 12.4931L69.1134 12.4923Z" fill="currentColor"/><path d="M80.8421 10.8149C80.7058 10.7367 80.6856 10.5488 80.805 10.4463C81.0608 10.2286 81.2819 9.93586 81.469 9.56811C81.6732 9.16811 81.7789 8.72295 81.7837 8.27456C81.8039 6.32134 80.4452 5.34473 77.7085 5.34473H73.672C73.547 5.34473 73.4453 5.44634 73.4453 5.57134V16.4334C73.4453 16.5584 73.547 16.66 73.672 16.66H77.9893C79.2487 16.66 80.2685 16.3867 81.0495 15.8407C81.8305 15.2947 82.2202 14.4496 82.2202 13.3044C82.2202 12.1592 81.7603 11.3415 80.8413 10.8157L80.8421 10.8149ZM75.4293 7.16247C75.4293 7.03747 75.5309 6.93586 75.656 6.93586H77.8965C78.4685 6.93586 78.9244 7.06569 79.2624 7.32618C79.6005 7.58666 79.7699 7.96086 79.7699 8.44956C79.7699 9.53182 79.1454 10.073 77.8965 10.073H75.656C75.5309 10.073 75.4293 9.97134 75.4293 9.84634V7.16166V7.16247ZM78.0675 15.0673H75.6552C75.5301 15.0673 75.4285 14.9657 75.4285 14.8407V11.8133C75.4285 11.6883 75.5301 11.5867 75.6552 11.5867H77.9578C79.4359 11.5867 80.1749 12.1592 80.1749 13.3036C80.1749 14.448 79.4722 15.0673 78.0667 15.0673H78.0675Z" fill="currentColor"/><path d="M103.214 6.99859H108.788C108.913 6.99859 109.015 6.89698 109.015 6.77198V5.57036C109.015 5.44536 108.913 5.34375 108.788 5.34375H89.77C89.6885 5.34375 89.6134 5.3873 89.5731 5.45746L86.9493 10.051C86.8622 10.2042 86.6403 10.2026 86.5548 10.0486L84.0045 5.45988C83.965 5.38811 83.8891 5.34375 83.8068 5.34375H82.0706C81.8955 5.34375 81.7866 5.53327 81.8753 5.68407L85.6891 12.2042C85.7093 12.2389 85.7198 12.2784 85.7198 12.3188V16.4325C85.7198 16.5575 85.8214 16.6591 85.9465 16.6591H87.477C87.6021 16.6591 87.7037 16.5575 87.7037 16.4325V12.3518C87.7037 12.3107 87.715 12.2704 87.736 12.2357L90.814 7.10827C90.8551 7.03972 90.9285 6.99859 91.0084 6.99859H94.8004C94.9255 6.99859 95.0271 7.1002 95.0271 7.2252V16.4333C95.0271 16.5583 95.1288 16.6599 95.2538 16.6599H96.7844C96.9094 16.6599 97.0111 16.5583 97.0111 16.4333V7.2252C97.0111 7.1002 97.1127 6.99859 97.2378 6.99859H101.009V16.4333C101.009 16.5583 101.11 16.6599 101.236 16.6599H108.793C108.918 16.6599 109.02 16.5583 109.02 16.4333V15.2155C109.02 15.0905 108.918 14.9889 108.793 14.9889H103.219C103.094 14.9889 102.992 14.8873 102.992 14.7623V11.8905C102.992 11.7655 103.094 11.6639 103.219 11.6639H108.465C108.59 11.6639 108.691 11.5623 108.691 11.4373V10.251C108.691 10.126 108.59 10.0244 108.465 10.0244H103.219C103.094 10.0244 102.992 9.92278 102.992 9.79778V7.22278C102.992 7.09778 103.094 6.99617 103.219 6.99617L103.214 6.99859Z" fill="currentColor"/></g><defs><clipPath id="zbLogoClip"><rect width="109" height="20" fill="white" transform="translate(0 1)"/></clipPath></defs></svg></span><span class="logo-mobile"><svg class="zb-logo-full" width="22" height="22" viewBox="0 0 21 22" fill="none"><path d="M15.71 1.86v5.89c0 .33-.19.63-.48.78l-2.52 1.26c-.3.15-.48.45-.48.78v9.58c0 .48-.39.87-.87.87H8.75c-.48 0-.87-.39-.87-.87v-7.84c0-.33.19-.63.48-.78l2.52-1.26c.3-.15.48-.45.48-.78V1.86c0-.48.39-.87.87-.87h2.62c.48 0 .87.39.87.87z" fill="#5CA3E5"/><path d="M7.87 6.21v1.53c0 .33-.19.63-.48.78L4.87 9.78c-.3.15-.48.45-.48.78v5.23c0 .48-.39.87-.87.87H.91c-.48 0-.87-.39-.87-.87v-3.49c0-.33.19-.63.48-.78l2.52-1.26c.3-.15.48-.45.48-.78V6.21c0-.48.39-.87.87-.87h2.62c.48 0 .87.39.87.87z" fill="#5CA3E5"/><path d="M20.07 11.29v4.5c0 .48-.39.87-.87.87h-2.61c-.48 0-.87-.39-.87-.87v-3.48c0-.33.19-.63.48-.78l2.35-1.18c.7-.35 1.52.15 1.52.93z" fill="#5CA3E5"/></svg></span><span class="version">v${__APP_VERSION__}</span>${BETA_MODE ? '<span class="beta-badge">BETA</span>' : ''}
          <!-- credit + github links removed -->
          <button class="mobile-settings-btn" id="mobileSettingsBtn" title="${t('header.settings')}">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <div class="status-indicator">
            <span class="status-dot"></span>
            <span>${t('header.live')}</span>
          </div>
          <div class="region-selector">
            <select id="regionSelect" class="region-select">
              <option value="global">${t('components.deckgl.views.global')}</option>
              <option value="america">${t('components.deckgl.views.americas')}</option>
              <option value="mena">${t('components.deckgl.views.mena')}</option>
              <option value="eu">${t('components.deckgl.views.europe')}</option>
              <option value="asia">${t('components.deckgl.views.asia')}</option>
              <option value="latam">${t('components.deckgl.views.latam')}</option>
              <option value="africa">${t('components.deckgl.views.africa')}</option>
              <option value="oceania">${t('components.deckgl.views.oceania')}</option>
            </select>
          </div>
          <button class="mobile-search-btn" id="mobileSearchBtn" aria-label="${t('header.search')}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
        <div class="header-right">
          <!-- download button removed -->
          <button class="search-btn" id="searchBtn"><kbd>⌘K</kbd> ${t('header.search')}</button>
          ${this.ctx.isDesktopApp ? '' : `<button class="copy-link-btn" id="copyLinkBtn">${t('header.copyLink')}</button>`}
          <button class="theme-toggle-btn" id="headerThemeToggle" title="${t('header.toggleTheme')}">
            ${getCurrentTheme() === 'dark'
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>'}
          </button>
          ${this.ctx.isDesktopApp ? '' : `<button class="fullscreen-btn" id="fullscreenBtn" title="${t('header.fullscreen')}">⛶</button>`}
          ${SITE_VARIANT === 'happy' ? `<button class="tv-mode-btn" id="tvModeBtn" title="TV Mode (Shift+T)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></button>` : ''}
          <span id="unifiedSettingsMount"></span>
        </div>
      </div>
      <div class="mobile-menu-overlay" id="mobileMenuOverlay"></div>
      <nav class="mobile-menu" id="mobileMenu">
        <div class="mobile-menu-header">
          <span class="mobile-menu-title"><svg width="120" height="22" viewBox="0 0 120 22" fill="none"><g clip-path="url(#zbMenuClip)"><path d="M15.7143 1.85781V7.74894C15.7143 8.07797 15.5287 8.37877 15.2343 8.52555L12.7106 9.78684C12.4161 9.93361 12.2305 10.2344 12.2305 10.5635V20.1425C12.2305 20.6223 11.8416 21.011 11.3616 21.011H8.74589C8.26584 21.011 7.87695 20.6223 7.87695 20.1425V12.3022C7.87695 11.9731 8.06252 11.6723 8.357 11.5255L10.8807 10.2643C11.1752 10.1175 11.3608 9.81668 11.3608 9.48765V1.85781C11.3608 1.37797 11.7496 0.989258 12.2297 0.989258H14.8454C15.3254 0.989258 15.7143 1.37797 15.7143 1.85781Z" fill="#5CA3E5"/><path d="M7.87446 6.2123V7.74698C7.87446 8.07601 7.68889 8.37681 7.39441 8.52359L4.87071 9.78488C4.57622 9.93165 4.39066 10.2325 4.39066 10.5615V15.7897C4.39066 16.2696 4.00177 16.6583 3.52172 16.6583H0.906044C0.425992 16.6583 0.0371094 16.2696 0.0371094 15.7897V12.3002C0.0371094 11.9712 0.222676 11.6704 0.517161 11.5236L3.04086 10.2623C3.33535 10.1155 3.52091 9.81472 3.52091 9.48569V6.2123C3.52091 5.73246 3.9098 5.34375 4.38985 5.34375H7.00553C7.48558 5.34375 7.87446 5.73246 7.87446 6.2123Z" fill="#5CA3E5"/><path d="M20.0692 11.2882V15.7882C20.0692 16.2696 19.6787 16.66 19.197 16.66H16.587C16.1053 16.66 15.7148 16.2696 15.7148 15.7882V12.3067C15.7148 11.9769 15.9012 11.6745 16.1965 11.5269L18.5508 10.3503C19.2479 10.0019 20.0676 10.5084 20.0676 11.2874L20.0692 11.2882Z" fill="#5CA3E5"/><path d="M37.6207 14.9421H31.8036C31.614 14.9421 31.5083 14.7236 31.6261 14.5752L37.611 7.0131C37.6425 6.97278 37.6602 6.92359 37.6602 6.87278V5.57036C37.6602 5.44536 37.5586 5.34375 37.4335 5.34375H29.6421C29.5171 5.34375 29.4154 5.44536 29.4154 5.57036V6.83488C29.4154 6.95988 29.5171 7.06149 29.6421 7.06149H34.7872C34.9768 7.06149 35.0825 7.28004 34.9647 7.42843L28.9652 14.9905C28.9338 15.0308 28.916 15.08 28.916 15.1308V16.4333C28.916 16.5583 29.0177 16.6599 29.1427 16.6599H37.6215C37.7465 16.6599 37.8482 16.5583 37.8482 16.4333V15.1688C37.8482 15.0438 37.7465 14.9421 37.6215 14.9421H37.6207Z" fill="currentColor"/><path d="M64.3276 6.77198V5.57036C64.3276 5.44536 64.2259 5.34375 64.1009 5.34375H38.838C38.713 5.34375 38.6113 5.44536 38.6113 5.57036V16.4325C38.6113 16.5575 38.713 16.6591 38.838 16.6591H46.3954C46.5205 16.6591 46.6221 16.5575 46.6221 16.4325V15.2147C46.6221 15.0897 46.5205 14.9881 46.3954 14.9881H40.8212C40.6961 14.9881 40.5945 14.8865 40.5945 14.7615V11.8897C40.5945 11.7647 40.6961 11.6631 40.8212 11.6631H46.0671C46.1921 11.6631 46.2938 11.5615 46.2938 11.4365V10.2502C46.2938 10.1252 46.1921 10.0236 46.0671 10.0236H40.8212C40.6961 10.0236 40.5945 9.92198 40.5945 9.79698V7.22198C40.5945 7.09698 40.6961 6.99536 40.8212 6.99536H49.705C49.83 6.99536 49.9317 7.09698 49.9317 7.22198V16.43C49.9317 16.555 50.0333 16.6567 50.1584 16.6567H51.6889C51.814 16.6567 51.9156 16.555 51.9156 16.43V7.22198C51.9156 7.09698 52.0173 6.99536 52.1423 6.99536H58.5589C58.6839 6.99536 58.7856 7.09698 58.7856 7.22198V16.43C58.7856 16.555 58.8873 16.6567 59.0123 16.6567H60.5428C60.6679 16.6567 60.7696 16.555 60.7696 16.43V7.22198C60.7696 7.09698 60.8712 6.99536 60.9963 6.99536H64.1033C64.2283 6.99536 64.33 6.89375 64.33 6.76875L64.3276 6.77198Z" fill="currentColor"/><path d="M68.8948 5.4915C68.8617 5.4036 68.777 5.34473 68.6826 5.34473H66.9044C66.81 5.34473 66.7253 5.4036 66.6922 5.49231L62.6452 16.3544C62.5904 16.502 62.6993 16.66 62.8574 16.66H64.4C64.4961 16.66 64.5824 16.5988 64.6139 16.5084L65.3827 14.2996C65.4142 14.2084 65.5005 14.148 65.5965 14.148H69.8662C69.9622 14.148 70.0477 14.2084 70.08 14.2988L70.8634 16.5101C70.8957 16.6004 70.9812 16.6609 71.0772 16.6609H72.761C72.9192 16.6609 73.0289 16.5028 72.9732 16.3552L68.8964 5.49231L68.8948 5.4915ZM69.1134 12.4923H66.3332C66.1774 12.4923 66.0677 12.3383 66.1194 12.1915L67.503 8.24553C67.574 8.04392 67.8588 8.04392 67.9298 8.24553L69.3264 12.1915C69.3789 12.3391 69.2691 12.4931 69.1126 12.4931L69.1134 12.4923Z" fill="currentColor"/><path d="M80.8421 10.8149C80.7058 10.7367 80.6856 10.5488 80.805 10.4463C81.0608 10.2286 81.2819 9.93586 81.469 9.56811C81.6732 9.16811 81.7789 8.72295 81.7837 8.27456C81.8039 6.32134 80.4452 5.34473 77.7085 5.34473H73.672C73.547 5.34473 73.4453 5.44634 73.4453 5.57134V16.4334C73.4453 16.5584 73.547 16.66 73.672 16.66H77.9893C79.2487 16.66 80.2685 16.3867 81.0495 15.8407C81.8305 15.2947 82.2202 14.4496 82.2202 13.3044C82.2202 12.1592 81.7603 11.3415 80.8413 10.8157L80.8421 10.8149ZM75.4293 7.16247C75.4293 7.03747 75.5309 6.93586 75.656 6.93586H77.8965C78.4685 6.93586 78.9244 7.06569 79.2624 7.32618C79.6005 7.58666 79.7699 7.96086 79.7699 8.44956C79.7699 9.53182 79.1454 10.073 77.8965 10.073H75.656C75.5309 10.073 75.4293 9.97134 75.4293 9.84634V7.16166V7.16247ZM78.0675 15.0673H75.6552C75.5301 15.0673 75.4285 14.9657 75.4285 14.8407V11.8133C75.4285 11.6883 75.5301 11.5867 75.6552 11.5867H77.9578C79.4359 11.5867 80.1749 12.1592 80.1749 13.3036C80.1749 14.448 79.4722 15.0673 78.0667 15.0673H78.0675Z" fill="currentColor"/><path d="M103.214 6.99859H108.788C108.913 6.99859 109.015 6.89698 109.015 6.77198V5.57036C109.015 5.44536 108.913 5.34375 108.788 5.34375H89.77C89.6885 5.34375 89.6134 5.3873 89.5731 5.45746L86.9493 10.051C86.8622 10.2042 86.6403 10.2026 86.5548 10.0486L84.0045 5.45988C83.965 5.38811 83.8891 5.34375 83.8068 5.34375H82.0706C81.8955 5.34375 81.7866 5.53327 81.8753 5.68407L85.6891 12.2042C85.7093 12.2389 85.7198 12.2784 85.7198 12.3188V16.4325C85.7198 16.5575 85.8214 16.6591 85.9465 16.6591H87.477C87.6021 16.6591 87.7037 16.5575 87.7037 16.4325V12.3518C87.7037 12.3107 87.715 12.2704 87.736 12.2357L90.814 7.10827C90.8551 7.03972 90.9285 6.99859 91.0084 6.99859H94.8004C94.9255 6.99859 95.0271 7.1002 95.0271 7.2252V16.4333C95.0271 16.5583 95.1288 16.6599 95.2538 16.6599H96.7844C96.9094 16.6599 97.0111 16.5583 97.0111 16.4333V7.2252C97.0111 7.1002 97.1127 6.99859 97.2378 6.99859H101.009V16.4333C101.009 16.5583 101.11 16.6599 101.236 16.6599H108.793C108.918 16.6599 109.02 16.5583 109.02 16.4333V15.2155C109.02 15.0905 108.918 14.9889 108.793 14.9889H103.219C103.094 14.9889 102.992 14.8873 102.992 14.7623V11.8905C102.992 11.7655 103.094 11.6639 103.219 11.6639H108.465C108.59 11.6639 108.691 11.5623 108.691 11.4373V10.251C108.691 10.126 108.59 10.0244 108.465 10.0244H103.219C103.094 10.0244 102.992 9.92278 102.992 9.79778V7.22278C102.992 7.09778 103.094 6.99617 103.219 6.99617L103.214 6.99859Z" fill="currentColor"/></g><defs><clipPath id="zbMenuClip"><rect width="109" height="20" fill="white" transform="translate(0 1)"/></clipPath></defs></svg></span>
          <button class="mobile-menu-close" id="mobileMenuClose" aria-label="Close menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="mobile-menu-divider"></div>
        ${(() => {
        const variants = [
          { key: 'full', icon: '🌍', label: t('header.world') },
          { key: 'tech', icon: '💻', label: t('header.tech') },
          { key: 'finance', icon: '📈', label: t('header.finance') },
        ];
        if (SITE_VARIANT === 'happy') variants.push({ key: 'happy', icon: '☀️', label: 'Good News' });
        return variants.map(v =>
          `<button class="mobile-menu-item mobile-menu-variant ${v.key === SITE_VARIANT ? 'active' : ''}" data-variant="${v.key}">
            <span class="mobile-menu-item-icon">${v.icon}</span>
            <span class="mobile-menu-item-label">${v.label}</span>
            ${v.key === SITE_VARIANT ? '<span class="mobile-menu-check">✓</span>' : ''}
          </button>`
        ).join('');
      })()}
        <div class="mobile-menu-divider"></div>
        <button class="mobile-menu-item" id="mobileMenuRegion">
          <span class="mobile-menu-item-icon">🌐</span>
          <span class="mobile-menu-item-label">${t('components.deckgl.views.global')}</span>
          <span class="mobile-menu-chevron">▸</span>
        </button>
        <div class="mobile-menu-divider"></div>
        <button class="mobile-menu-item" id="mobileMenuSettings">
          <span class="mobile-menu-item-icon">⚙️</span>
          <span class="mobile-menu-item-label">${t('header.settings')}</span>
        </button>
        <button class="mobile-menu-item" id="mobileMenuTheme">
          <span class="mobile-menu-item-icon">${getCurrentTheme() === 'dark' ? '☀️' : '🌙'}</span>
          <span class="mobile-menu-item-label">${getCurrentTheme() === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <!-- mobile X link removed -->
        <div class="mobile-menu-divider"></div>
        <div class="mobile-menu-version">v${__APP_VERSION__}</div>
      </nav>
      <div class="region-sheet-backdrop" id="regionSheetBackdrop"></div>
      <div class="region-bottom-sheet" id="regionBottomSheet">
        <div class="region-sheet-header">${t('header.selectRegion')}</div>
        <div class="region-sheet-divider"></div>
        ${[
        { value: 'global', label: t('components.deckgl.views.global') },
        { value: 'america', label: t('components.deckgl.views.americas') },
        { value: 'mena', label: t('components.deckgl.views.mena') },
        { value: 'eu', label: t('components.deckgl.views.europe') },
        { value: 'asia', label: t('components.deckgl.views.asia') },
        { value: 'latam', label: t('components.deckgl.views.latam') },
        { value: 'africa', label: t('components.deckgl.views.africa') },
        { value: 'oceania', label: t('components.deckgl.views.oceania') },
      ].map(r =>
        `<button class="region-sheet-option ${r.value === 'global' ? 'active' : ''}" data-region="${r.value}">
          <span>${r.label}</span>
          <span class="region-sheet-check">${r.value === 'global' ? '✓' : ''}</span>
        </button>`
      ).join('')}
      </div>
      <div class="main-content">
        <div class="map-section" id="mapSection">
          <div class="panel-header">
            <div class="panel-header-left">
              <span class="panel-title">${SITE_VARIANT === 'tech' ? t('panels.techMap') : SITE_VARIANT === 'happy' ? 'Good News Map' : t('panels.map')}</span>
            </div>
            <span class="header-clock" id="headerClock" translate="no"></span>
            <div class="map-header-actions">
              <div class="map-dimension-toggle" id="mapDimensionToggle">
                <button class="map-dim-btn${loadFromStorage<string>(STORAGE_KEYS.mapMode, 'flat') === 'globe' ? '' : ' active'}" data-mode="flat" title="2D Map">2D</button>
                <button class="map-dim-btn${loadFromStorage<string>(STORAGE_KEYS.mapMode, 'flat') === 'globe' ? ' active' : ''}" data-mode="globe" title="3D Globe">3D</button>
              </div>
              <button class="map-pin-btn" id="mapFullscreenBtn" title="Fullscreen">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
              </button>
              <button class="map-pin-btn" id="mapPinBtn" title="${t('header.pinMap')}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 17v5M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 1 1 0 001-1V4a1 1 0 00-1-1H8a1 1 0 00-1 1v1a1 1 0 001 1 1 1 0 011 1v3.76z"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="map-container" id="mapContainer"></div>
          ${SITE_VARIANT === 'happy' ? '<button class="tv-exit-btn" id="tvExitBtn">Exit TV Mode</button>' : ''}
          <div class="map-resize-handle" id="mapResizeHandle"></div>
          <div class="map-bottom-grid" id="mapBottomGrid"></div>
        </div>
        <div class="panels-grid" id="panelsGrid"></div>
        <button class="search-mobile-fab" id="searchMobileFab" aria-label="Search">\u{1F50D}</button>
      </div>
    `;

    this.createPanels();

    if (this.ctx.isMobile) {
      this.setupMobileMapToggle();
    }
  }

  private setupMobileMapToggle(): void {
    const mapSection = document.getElementById('mapSection');
    const headerLeft = mapSection?.querySelector('.panel-header-left');
    if (!mapSection || !headerLeft) return;

    const stored = localStorage.getItem('mobile-map-collapsed');
    const collapsed = stored === 'true';
    if (collapsed) mapSection.classList.add('collapsed');

    const updateBtn = (btn: HTMLButtonElement, isCollapsed: boolean) => {
      btn.textContent = isCollapsed ? `▶ ${t('components.map.showMap')}` : `▼ ${t('components.map.hideMap')}`;
    };

    const btn = document.createElement('button');
    btn.className = 'map-collapse-btn';
    updateBtn(btn, collapsed);
    headerLeft.after(btn);

    btn.addEventListener('click', () => {
      const isCollapsed = mapSection.classList.toggle('collapsed');
      updateBtn(btn, isCollapsed);
      localStorage.setItem('mobile-map-collapsed', String(isCollapsed));
      if (!isCollapsed) window.dispatchEvent(new Event('resize'));
    });
  }

  renderCriticalBanner(postures: TheaterPostureSummary[]): void {
    if (this.ctx.isMobile) {
      if (this.criticalBannerEl) {
        this.criticalBannerEl.remove();
        this.criticalBannerEl = null;
      }
      document.body.classList.remove('has-critical-banner');
      return;
    }

    const dismissedAt = sessionStorage.getItem('banner-dismissed');
    if (dismissedAt && Date.now() - parseInt(dismissedAt, 10) < 30 * 60 * 1000) {
      return;
    }

    const critical = postures.filter(
      (p) => p.postureLevel === 'critical' || (p.postureLevel === 'elevated' && p.strikeCapable)
    );

    if (critical.length === 0) {
      if (this.criticalBannerEl) {
        this.criticalBannerEl.remove();
        this.criticalBannerEl = null;
        document.body.classList.remove('has-critical-banner');
      }
      return;
    }

    const top = critical[0]!;
    const isCritical = top.postureLevel === 'critical';

    if (!this.criticalBannerEl) {
      this.criticalBannerEl = document.createElement('div');
      this.criticalBannerEl.className = 'critical-posture-banner';
      const header = document.querySelector('.header');
      if (header) header.insertAdjacentElement('afterend', this.criticalBannerEl);
    }

    document.body.classList.add('has-critical-banner');
    this.criticalBannerEl.className = `critical-posture-banner ${isCritical ? 'severity-critical' : 'severity-elevated'}`;
    this.criticalBannerEl.innerHTML = `
      <div class="banner-content">
        <span class="banner-icon">${isCritical ? '🚨' : '⚠️'}</span>
        <span class="banner-headline">${escapeHtml(top.headline)}</span>
        <span class="banner-stats">${top.totalAircraft} aircraft • ${escapeHtml(top.summary)}</span>
        ${top.strikeCapable ? '<span class="banner-strike">STRIKE CAPABLE</span>' : ''}
      </div>
      <button class="banner-view" data-lat="${top.centerLat}" data-lon="${top.centerLon}">View Region</button>
      <button class="banner-dismiss">×</button>
    `;

    this.criticalBannerEl.querySelector('.banner-view')?.addEventListener('click', () => {
      console.log('[Banner] View Region clicked:', top.theaterId, 'lat:', top.centerLat, 'lon:', top.centerLon);
      trackCriticalBannerAction('view', top.theaterId);
      if (typeof top.centerLat === 'number' && typeof top.centerLon === 'number') {
        this.ctx.map?.setCenter(top.centerLat, top.centerLon, 4);
      } else {
        console.error('[Banner] Missing coordinates for', top.theaterId);
      }
    });

    this.criticalBannerEl.querySelector('.banner-dismiss')?.addEventListener('click', () => {
      trackCriticalBannerAction('dismiss', top.theaterId);
      this.criticalBannerEl?.classList.add('dismissed');
      document.body.classList.remove('has-critical-banner');
      sessionStorage.setItem('banner-dismissed', Date.now().toString());
    });
  }

  applyPanelSettings(): void {
    Object.entries(this.ctx.panelSettings).forEach(([key, config]) => {
      if (key === 'map') {
        const mapSection = document.getElementById('mapSection');
        if (mapSection) {
          mapSection.classList.toggle('hidden', !config.enabled);
          const mainContent = document.querySelector('.main-content');
          if (mainContent) {
            mainContent.classList.toggle('map-hidden', !config.enabled);
          }
          this.ensureCorrectZones();
        }
        return;
      }
      const panel = this.ctx.panels[key];
      panel?.toggle(config.enabled);
    });
  }

  private shouldCreatePanel(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(DEFAULT_PANELS, key);
  }

  private createNewsPanel(key: string, labelKey: string): NewsPanel | null {
    if (!this.shouldCreatePanel(key)) return null;
    const panel = new NewsPanel(key, t(labelKey));
    this.attachRelatedAssetHandlers(panel);
    this.ctx.newsPanels[key] = panel;
    this.ctx.panels[key] = panel;
    return panel;
  }

  private createPanel<T extends import('@/components/Panel').Panel>(key: string, factory: () => T): T | null {
    if (!this.shouldCreatePanel(key)) return null;
    const panel = factory();
    this.ctx.panels[key] = panel;
    return panel;
  }

  private createPanels(): void {
    const panelsGrid = document.getElementById('panelsGrid')!;

    const mapContainer = document.getElementById('mapContainer') as HTMLElement;
    const preferGlobe = loadFromStorage<string>(STORAGE_KEYS.mapMode, 'flat') === 'globe';
    this.ctx.map = new MapContainer(mapContainer, {
      zoom: this.ctx.isMobile ? 2.5 : 1.0,
      pan: { x: 0, y: 0 },
      view: this.ctx.isMobile ? this.ctx.resolvedLocation : 'global',
      layers: this.ctx.mapLayers,
      timeRange: '7d',
    }, preferGlobe);

    this.ctx.map.initEscalationGetters();
    this.ctx.currentTimeRange = this.ctx.map.getTimeRange();

    this.createNewsPanel('politics', 'panels.politics');
    this.createNewsPanel('tech', 'panels.tech');
    this.createNewsPanel('finance', 'panels.finance');

    this.createPanel('heatmap', () => new HeatmapPanel());
    this.createPanel('markets', () => new MarketPanel());
    const stockAnalysisPanel = this.createPanel('stock-analysis', () => new StockAnalysisPanel());
    if (stockAnalysisPanel && !getSecretState('WORLDMONITOR_API_KEY').present) {
      stockAnalysisPanel.showLocked([
        'AI stock briefs with technical + news synthesis',
        'Trend scoring from MA, MACD, RSI, and volume structure',
        'Actionable watchlist monitoring for your premium workspace',
      ]);
    }
    const stockBacktestPanel = this.createPanel('stock-backtest', () => new StockBacktestPanel());
    if (stockBacktestPanel && !getSecretState('WORLDMONITOR_API_KEY').present) {
      stockBacktestPanel.showLocked([
        'Historical replay of premium stock-analysis signals',
        'Win-rate, accuracy, and simulated-return metrics',
        'Recent evaluation samples for your tracked symbols',
      ]);
    }

    const monitorPanel = this.createPanel('monitors', () => new MonitorPanel(this.ctx.monitors));
    monitorPanel?.onChanged((monitors) => {
      this.ctx.monitors = monitors;
      saveToStorage(STORAGE_KEYS.monitors, monitors);
      this.callbacks.updateMonitorResults();
    });

    this.createPanel('commodities', () => new CommoditiesPanel());
    this.createPanel('polymarket', () => new PredictionPanel());

    this.createNewsPanel('gov', 'panels.gov');
    this.createNewsPanel('intel', 'panels.intel');

    this.createPanel('crypto', () => new CryptoPanel());
    this.createNewsPanel('middleeast', 'panels.middleeast');
    this.createNewsPanel('layoffs', 'panels.layoffs');
    this.createNewsPanel('ai', 'panels.ai');
    this.createNewsPanel('startups', 'panels.startups');
    this.createNewsPanel('vcblogs', 'panels.vcblogs');
    this.createNewsPanel('regionalStartups', 'panels.regionalStartups');
    this.createNewsPanel('unicorns', 'panels.unicorns');
    this.createNewsPanel('accelerators', 'panels.accelerators');
    this.createNewsPanel('funding', 'panels.funding');
    this.createNewsPanel('producthunt', 'panels.producthunt');
    this.createNewsPanel('security', 'panels.security');
    this.createNewsPanel('policy', 'panels.policy');
    this.createNewsPanel('hardware', 'panels.hardware');
    this.createNewsPanel('cloud', 'panels.cloud');
    this.createNewsPanel('dev', 'panels.dev');
    this.createNewsPanel('github', 'panels.github');
    this.createNewsPanel('ipo', 'panels.ipo');
    this.createNewsPanel('thinktanks', 'panels.thinktanks');
    this.createPanel('economic', () => new EconomicPanel());

    this.createPanel('trade-policy', () => new TradePolicyPanel());
    this.createPanel('supply-chain', () => new SupplyChainPanel());

    this.createNewsPanel('africa', 'panels.africa');
    this.createNewsPanel('latam', 'panels.latam');
    this.createNewsPanel('asia', 'panels.asia');
    this.createNewsPanel('energy', 'panels.energy');

    for (const key of Object.keys(FEEDS)) {
      if (this.ctx.newsPanels[key]) continue;
      if (!Array.isArray((FEEDS as Record<string, unknown>)[key])) continue;
      const panelKey = this.ctx.panels[key] && !this.ctx.newsPanels[key] ? `${key}-news` : key;
      if (this.ctx.panels[panelKey]) continue;
      if (!DEFAULT_PANELS[panelKey] && !DEFAULT_PANELS[key]) continue;
      const panelConfig = DEFAULT_PANELS[panelKey] ?? DEFAULT_PANELS[key];
      const label = panelConfig?.name ?? key.charAt(0).toUpperCase() + key.slice(1);
      const panel = new NewsPanel(panelKey, label);
      this.attachRelatedAssetHandlers(panel);
      this.ctx.newsPanels[key] = panel;
      this.ctx.panels[panelKey] = panel;
    }

    this.createPanel('gdelt-intel', () => new GdeltIntelPanel());

    if (SITE_VARIANT === 'full' && this.ctx.isDesktopApp) {
      import('@/components/DeductionPanel').then(({ DeductionPanel }) => {
        const deductionPanel = new DeductionPanel(() => this.ctx.allNews);
        this.ctx.panels['deduction'] = deductionPanel;
        const el = deductionPanel.getElement();
        this.makeDraggable(el, 'deduction');
        const grid = document.getElementById('panelsGrid');
        if (grid) {
          const gdeltEl = this.ctx.panels['gdelt-intel']?.getElement();
          if (gdeltEl?.nextSibling) {
            grid.insertBefore(el, gdeltEl.nextSibling);
          } else {
            grid.appendChild(el);
          }
        }
      });
    }

    if (this.shouldCreatePanel('cii')) {
      const ciiPanel = new CIIPanel();
      ciiPanel.setShareStoryHandler((code, name) => {
        this.callbacks.openCountryStory(code, name);
      });
      ciiPanel.setCountryClickHandler((code) => {
        this.callbacks.openCountryBrief(code);
      });
      this.ctx.panels['cii'] = ciiPanel;
    }

    this.createPanel('cascade', () => new CascadePanel());
    this.createPanel('satellite-fires', () => new SatelliteFiresPanel());

    if (this.shouldCreatePanel('strategic-risk')) {
      const strategicRiskPanel = new StrategicRiskPanel();
      strategicRiskPanel.setLocationClickHandler((lat, lon) => {
        this.ctx.map?.setCenter(lat, lon, 4);
      });
      this.ctx.panels['strategic-risk'] = strategicRiskPanel;
    }

    if (this.shouldCreatePanel('strategic-posture')) {
      const strategicPosturePanel = new StrategicPosturePanel(() => this.ctx.allNews);
      strategicPosturePanel.setLocationClickHandler((lat, lon) => {
        console.log('[App] StrategicPosture handler called:', { lat, lon, hasMap: !!this.ctx.map });
        this.ctx.map?.setCenter(lat, lon, 4);
      });
      this.ctx.panels['strategic-posture'] = strategicPosturePanel;
    }

    if (this.shouldCreatePanel('ucdp-events')) {
      const ucdpEventsPanel = new UcdpEventsPanel();
      ucdpEventsPanel.setEventClickHandler((lat, lon) => {
        this.ctx.map?.setCenter(lat, lon, 5);
      });
      this.ctx.panels['ucdp-events'] = ucdpEventsPanel;
    }

    this.lazyPanel('displacement', () =>
      import('@/components/DisplacementPanel').then(m => {
        const p = new m.DisplacementPanel();
        p.setCountryClickHandler((lat: number, lon: number) => { this.ctx.map?.setCenter(lat, lon, 4); });
        return p;
      }),
    );

    this.lazyPanel('climate', () =>
      import('@/components/ClimateAnomalyPanel').then(m => {
        const p = new m.ClimateAnomalyPanel();
        p.setZoneClickHandler((lat: number, lon: number) => { this.ctx.map?.setCenter(lat, lon, 4); });
        return p;
      }),
    );

    this.lazyPanel('population-exposure', () =>
      import('@/components/PopulationExposurePanel').then(m => new m.PopulationExposurePanel()),
    );

    this.lazyPanel('security-advisories', () =>
      import('@/components/SecurityAdvisoriesPanel').then(m => {
        const p = new m.SecurityAdvisoriesPanel();
        p.setRefreshHandler(() => { void this.callbacks.loadSecurityAdvisories?.(); });
        return p;
      }),
    );

    const _wmKeyPresent = getSecretState('WORLDMONITOR_API_KEY').present;
    const _lockPanels = this.ctx.isDesktopApp && !_wmKeyPresent;

    this.lazyPanel('daily-market-brief', () =>
      import('@/components/DailyMarketBriefPanel').then(m => new m.DailyMarketBriefPanel()),
      undefined,
      !_wmKeyPresent ? ['Pre-market watchlist priorities', 'Action plan for the session', 'Risk watch tied to current finance headlines'] : undefined,
    );

    this.lazyPanel('oref-sirens', () =>
      import('@/components/OrefSirensPanel').then(m => new m.OrefSirensPanel()),
      undefined,
      _lockPanels ? [t('premium.features.orefSirens1'), t('premium.features.orefSirens2')] : undefined,
    );

    this.lazyPanel('telegram-intel', () =>
      import('@/components/TelegramIntelPanel').then(m => new m.TelegramIntelPanel()),
      undefined,
      _lockPanels ? [t('premium.features.telegramIntel1'), t('premium.features.telegramIntel2')] : undefined,
    );

    if (this.shouldCreatePanel('gcc-investments')) {
      const investmentsPanel = new InvestmentsPanel((inv) => {
        focusInvestmentOnMap(this.ctx.map, this.ctx.mapLayers, inv.lat, inv.lon);
      });
      this.ctx.panels['gcc-investments'] = investmentsPanel;
    }

    if (this.shouldCreatePanel('world-clock')) {
      this.ctx.panels['world-clock'] = new WorldClockPanel();
    }

    if (this.shouldCreatePanel('airline-intel')) {
      this.ctx.panels['airline-intel'] = new AirlineIntelPanel();
      this.aviationCommandBar = new AviationCommandBar();
    }

    if (this.shouldCreatePanel('gulf-economies') && !this.ctx.panels['gulf-economies']) {
      this.ctx.panels['gulf-economies'] = new GulfEconomiesPanel();
    }

    if (this.shouldCreatePanel('live-news')) {
      this.ctx.panels['live-news'] = new LiveNewsPanel();
    }

    if (this.shouldCreatePanel('live-webcams')) {
      this.ctx.panels['live-webcams'] = new LiveWebcamsPanel();
    }

    this.createPanel('events', () => new TechEventsPanel('events', () => this.ctx.allNews));
    this.createPanel('service-status', () => new ServiceStatusPanel());

    this.lazyPanel('tech-readiness', () =>
      import('@/components/TechReadinessPanel').then(m => {
        const p = new m.TechReadinessPanel();
        void p.refresh();
        return p;
      }),
    );

    this.createPanel('macro-signals', () => new MacroSignalsPanel());
    this.createPanel('etf-flows', () => new ETFFlowsPanel());
    this.createPanel('stablecoins', () => new StablecoinPanel());

    if (this.ctx.isDesktopApp) {
      const runtimeConfigPanel = new RuntimeConfigPanel({ mode: 'alert' });
      this.ctx.panels['runtime-config'] = runtimeConfigPanel;
    }

    this.createPanel('insights', () => new InsightsPanel());

    // Global Giving panel (all variants)
    this.lazyPanel('giving', () =>
      import('@/components/GivingPanel').then(m => new m.GivingPanel()),
    );

    // Happy variant panels (lazy-loaded — only relevant for happy variant)
    if (SITE_VARIANT === 'happy') {
      this.lazyPanel('positive-feed', () =>
        import('@/components/PositiveNewsFeedPanel').then(m => {
          const p = new m.PositiveNewsFeedPanel();
          this.ctx.positivePanel = p;
          return p;
        }),
      );

      this.lazyPanel('counters', () =>
        import('@/components/CountersPanel').then(m => {
          const p = new m.CountersPanel();
          p.startTicking();
          this.ctx.countersPanel = p;
          return p;
        }),
      );

      this.lazyPanel('progress', () =>
        import('@/components/ProgressChartsPanel').then(m => {
          const p = new m.ProgressChartsPanel();
          this.ctx.progressPanel = p;
          return p;
        }),
      );

      this.lazyPanel('breakthroughs', () =>
        import('@/components/BreakthroughsTickerPanel').then(m => {
          const p = new m.BreakthroughsTickerPanel();
          this.ctx.breakthroughsPanel = p;
          return p;
        }),
      );

      this.lazyPanel('spotlight', () =>
        import('@/components/HeroSpotlightPanel').then(m => {
          const p = new m.HeroSpotlightPanel();
          p.onLocationRequest = (lat: number, lon: number) => {
            this.ctx.map?.setCenter(lat, lon, 4);
            this.ctx.map?.flashLocation(lat, lon, 3000);
          };
          this.ctx.heroPanel = p;
          return p;
        }),
      );

      this.lazyPanel('digest', () =>
        import('@/components/GoodThingsDigestPanel').then(m => {
          const p = new m.GoodThingsDigestPanel();
          this.ctx.digestPanel = p;
          return p;
        }),
      );

      this.lazyPanel('species', () =>
        import('@/components/SpeciesComebackPanel').then(m => {
          const p = new m.SpeciesComebackPanel();
          this.ctx.speciesPanel = p;
          return p;
        }),
      );

      this.lazyPanel('renewable', () =>
        import('@/components/RenewableEnergyPanel').then(m => {
          const p = new m.RenewableEnergyPanel();
          this.ctx.renewablePanel = p;
          return p;
        }),
      );
    }

    const defaultOrder = Object.keys(DEFAULT_PANELS).filter(k => k !== 'map');
    const activePanelKeys = Object.keys(this.ctx.panelSettings).filter(k => k !== 'map');
    const bottomSet = this.getSavedBottomSet();
    const savedOrder = this.getSavedPanelOrder();
    this.bottomSetMemory = bottomSet;
    const effectiveUltraWide = this.getEffectiveUltraWide();
    this.wasUltraWide = effectiveUltraWide;

    const hasSavedOrder = savedOrder.length > 0;
    let allOrder: string[];

    if (hasSavedOrder) {
      const valid = savedOrder.filter(k => activePanelKeys.includes(k));
      const missing = activePanelKeys.filter(k => !valid.includes(k));

      missing.forEach(k => {
        if (k === 'monitors') return;
        const defaultIdx = defaultOrder.indexOf(k);
        if (defaultIdx === -1) { valid.push(k); return; }
        let inserted = false;
        for (let i = defaultIdx + 1; i < defaultOrder.length; i++) {
          const afterIdx = valid.indexOf(defaultOrder[i]!);
          if (afterIdx !== -1) { valid.splice(afterIdx, 0, k); inserted = true; break; }
        }
        if (!inserted) valid.push(k);
      });

      const monitorsIdx = valid.indexOf('monitors');
      if (monitorsIdx !== -1) valid.splice(monitorsIdx, 1);
      if (SITE_VARIANT !== 'happy') valid.push('monitors');
      allOrder = valid;
    } else {
      allOrder = [...defaultOrder];

      if (SITE_VARIANT !== 'happy') {
        const liveNewsIdx = allOrder.indexOf('live-news');
        if (liveNewsIdx > 0) {
          allOrder.splice(liveNewsIdx, 1);
          allOrder.unshift('live-news');
        }

        const webcamsIdx = allOrder.indexOf('live-webcams');
        if (webcamsIdx !== -1 && webcamsIdx !== allOrder.indexOf('live-news') + 1) {
          allOrder.splice(webcamsIdx, 1);
          const afterNews = allOrder.indexOf('live-news') + 1;
          allOrder.splice(afterNews, 0, 'live-webcams');
        }
      }

      if (this.ctx.isDesktopApp) {
        const runtimeIdx = allOrder.indexOf('runtime-config');
        if (runtimeIdx > 1) {
          allOrder.splice(runtimeIdx, 1);
          allOrder.splice(1, 0, 'runtime-config');
        } else if (runtimeIdx === -1) {
          allOrder.splice(1, 0, 'runtime-config');
        }
      }
    }

    this.resolvedPanelOrder = allOrder;

    const sidebarOrder = effectiveUltraWide
      ? allOrder.filter(k => !this.bottomSetMemory.has(k))
      : allOrder;
    const bottomOrder = effectiveUltraWide
      ? allOrder.filter(k => this.bottomSetMemory.has(k))
      : [];

    sidebarOrder.forEach((key: string) => {
      const panel = this.ctx.panels[key];
      if (panel && !panel.getElement().parentElement) {
        const el = panel.getElement();
        this.makeDraggable(el, key);
        panelsGrid.appendChild(el);
      }
    });

    const bottomGrid = document.getElementById('mapBottomGrid');
    if (bottomGrid) {
      bottomOrder.forEach(key => {
        const panel = this.ctx.panels[key];
        if (panel && !panel.getElement().parentElement) {
          const el = panel.getElement();
          this.makeDraggable(el, key);
          this.insertByOrder(bottomGrid, el, key);
        }
      });
    }

    window.addEventListener('resize', () => this.ensureCorrectZones());

    this.ctx.map.onTimeRangeChanged((range) => {
      this.ctx.currentTimeRange = range;
      this.applyTimeRangeFilterDebounced();
    });

    this.applyPanelSettings();
    this.applyInitialUrlState();

    if (import.meta.env.DEV) {
      const configured = new Set(Object.keys(DEFAULT_PANELS).filter(k => k !== 'map'));
      const created = new Set(Object.keys(this.ctx.panels));
      const extra = [...created].filter(k => !configured.has(k) && k !== 'deduction' && k !== 'runtime-config');
      if (extra.length) console.warn('[PanelLayout] Panels created but not in DEFAULT_PANELS:', extra);
    }
  }

  private applyTimeRangeFilterToNewsPanels(): void {
    Object.entries(this.ctx.newsByCategory).forEach(([category, items]) => {
      const panel = this.ctx.newsPanels[category];
      if (!panel) return;
      const filtered = this.filterItemsByTimeRange(items);
      if (filtered.length === 0 && items.length > 0) {
        panel.renderFilteredEmpty(`No items in ${this.getTimeRangeLabel()}`);
        return;
      }
      panel.renderNews(filtered);
    });
  }

  private filterItemsByTimeRange(items: import('@/types').NewsItem[], range: import('@/components').TimeRange = this.ctx.currentTimeRange): import('@/types').NewsItem[] {
    if (range === 'all') return items;
    const ranges: Record<string, number> = {
      '1h': 60 * 60 * 1000, '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000, '48h': 48 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000, 'all': Infinity,
    };
    const cutoff = Date.now() - (ranges[range] ?? Infinity);
    return items.filter((item) => {
      const ts = item.pubDate instanceof Date ? item.pubDate.getTime() : new Date(item.pubDate).getTime();
      return Number.isFinite(ts) ? ts >= cutoff : true;
    });
  }

  private getTimeRangeLabel(): string {
    const labels: Record<string, string> = {
      '1h': 'the last hour', '6h': 'the last 6 hours',
      '24h': 'the last 24 hours', '48h': 'the last 48 hours',
      '7d': 'the last 7 days', 'all': 'all time',
    };
    return labels[this.ctx.currentTimeRange] ?? 'the last 7 days';
  }

  private applyInitialUrlState(): void {
    if (!this.ctx.initialUrlState || !this.ctx.map) return;

    const { view, zoom, lat, lon, timeRange, layers } = this.ctx.initialUrlState;

    if (view) {
      this.ctx.map.setView(view);
    }

    if (timeRange) {
      this.ctx.map.setTimeRange(timeRange);
    }

    if (layers) {
      this.ctx.mapLayers = layers;
      saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
      this.ctx.map.setLayers(layers);
    }

    if (lat !== undefined && lon !== undefined) {
      const effectiveZoom = zoom ?? this.ctx.map.getState().zoom;
      if (effectiveZoom > 2) this.ctx.map.setCenter(lat, lon, zoom);
    } else if (!view && zoom !== undefined) {
      this.ctx.map.setZoom(zoom);
    }

    const regionSelect = document.getElementById('regionSelect') as HTMLSelectElement;
    const currentView = this.ctx.map.getState().view;
    if (regionSelect && currentView) {
      regionSelect.value = currentView;
    }
  }

  private getSavedPanelOrder(): string[] {
    try {
      const saved = localStorage.getItem(this.ctx.PANEL_ORDER_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((v: unknown) => typeof v === 'string') as string[];
    } catch {
      return [];
    }
  }

  savePanelOrder(): void {
    const grid = document.getElementById('panelsGrid');
    const bottomGrid = document.getElementById('mapBottomGrid');
    if (!grid || !bottomGrid) return;

    const sidebarIds = Array.from(grid.children)
      .map((el) => (el as HTMLElement).dataset.panel)
      .filter((key): key is string => !!key);

    const bottomIds = Array.from(bottomGrid.children)
      .map((el) => (el as HTMLElement).dataset.panel)
      .filter((key): key is string => !!key);

    const allOrder = this.buildUnifiedOrder(sidebarIds, bottomIds);
    this.resolvedPanelOrder = allOrder;
    localStorage.setItem(this.ctx.PANEL_ORDER_KEY, JSON.stringify(allOrder));
    localStorage.setItem(this.ctx.PANEL_ORDER_KEY + '-bottom-set', JSON.stringify(Array.from(this.bottomSetMemory)));
  }

  private buildUnifiedOrder(sidebarIds: string[], bottomIds: string[]): string[] {
    const presentIds = [...sidebarIds, ...bottomIds];
    const uniqueIds: string[] = [];
    const seen = new Set<string>();

    presentIds.forEach((id) => {
      if (seen.has(id)) return;
      seen.add(id);
      uniqueIds.push(id);
    });

    const previousOrder = new Map<string, number>();
    this.resolvedPanelOrder.forEach((id, index) => {
      if (seen.has(id) && !previousOrder.has(id)) {
        previousOrder.set(id, index);
      }
    });
    uniqueIds.forEach((id, index) => {
      if (!previousOrder.has(id)) {
        previousOrder.set(id, this.resolvedPanelOrder.length + index);
      }
    });

    const edges = new Map<string, Set<string>>();
    const indegree = new Map<string, number>();
    uniqueIds.forEach((id) => {
      edges.set(id, new Set());
      indegree.set(id, 0);
    });

    const addConstraints = (ids: string[]) => {
      for (let i = 1; i < ids.length; i++) {
        const prev = ids[i - 1]!;
        const next = ids[i]!;
        if (prev === next || !seen.has(prev) || !seen.has(next)) continue;
        const nextIds = edges.get(prev);
        if (!nextIds || nextIds.has(next)) continue;
        nextIds.add(next);
        indegree.set(next, (indegree.get(next) ?? 0) + 1);
      }
    };

    addConstraints(sidebarIds);
    addConstraints(bottomIds);

    const compareIds = (a: string, b: string) =>
      (previousOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (previousOrder.get(b) ?? Number.MAX_SAFE_INTEGER);

    const available = uniqueIds
      .filter((id) => (indegree.get(id) ?? 0) === 0)
      .sort(compareIds);
    const merged: string[] = [];

    while (available.length > 0) {
      const current = available.shift()!;
      merged.push(current);

      edges.get(current)?.forEach((next) => {
        const nextIndegree = (indegree.get(next) ?? 0) - 1;
        indegree.set(next, nextIndegree);
        if (nextIndegree === 0) {
          available.push(next);
        }
      });
      available.sort(compareIds);
    }

    return merged.length === uniqueIds.length
      ? merged
      : uniqueIds.sort(compareIds);
  }

  private getSavedBottomSet(): Set<string> {
    try {
      const saved = localStorage.getItem(this.ctx.PANEL_ORDER_KEY + '-bottom-set');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return new Set(parsed.filter((v: unknown) => typeof v === 'string'));
        }
      }
    } catch { /* ignore */ }
    try {
      const legacy = localStorage.getItem(this.ctx.PANEL_ORDER_KEY + '-bottom');
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed)) {
          const bottomIds = parsed.filter((v: unknown) => typeof v === 'string') as string[];
          const set = new Set(bottomIds);
          // Merge old sidebar + bottom into unified PANEL_ORDER_KEY
          const sidebarOrder = this.getSavedPanelOrder();
          const seen = new Set(sidebarOrder);
          const unified = [...sidebarOrder];
          for (const id of bottomIds) {
            if (!seen.has(id)) { unified.push(id); seen.add(id); }
          }
          localStorage.setItem(this.ctx.PANEL_ORDER_KEY, JSON.stringify(unified));
          localStorage.setItem(this.ctx.PANEL_ORDER_KEY + '-bottom-set', JSON.stringify([...set]));
          localStorage.removeItem(this.ctx.PANEL_ORDER_KEY + '-bottom');
          return set;
        }
      }
    } catch { /* ignore */ }
    return new Set();
  }

  private getEffectiveUltraWide(): boolean {
    const mapSection = document.getElementById('mapSection');
    const mapEnabled = !mapSection?.classList.contains('hidden');
    return window.innerWidth >= 1600 && mapEnabled;
  }

  private insertByOrder(grid: HTMLElement, el: HTMLElement, key: string): void {
    const idx = this.resolvedPanelOrder.indexOf(key);
    if (idx === -1) { grid.appendChild(el); return; }
    for (let i = idx + 1; i < this.resolvedPanelOrder.length; i++) {
      const nextKey = this.resolvedPanelOrder[i]!;
      const nextEl = grid.querySelector(`[data-panel="${CSS.escape(nextKey)}"]`);
      if (nextEl) { grid.insertBefore(el, nextEl); return; }
    }
    grid.appendChild(el);
  }

  private wasUltraWide = false;

  public ensureCorrectZones(): void {
    const effectiveUltraWide = this.getEffectiveUltraWide();

    if (effectiveUltraWide === this.wasUltraWide) return;
    this.wasUltraWide = effectiveUltraWide;

    const grid = document.getElementById('panelsGrid');
    const bottomGrid = document.getElementById('mapBottomGrid');
    if (!grid || !bottomGrid) return;

    if (!effectiveUltraWide) {
      const panelsInBottom = Array.from(bottomGrid.querySelectorAll('.panel')) as HTMLElement[];
      panelsInBottom.forEach(panelEl => {
        const id = panelEl.dataset.panel;
        if (!id) return;
        this.insertByOrder(grid, panelEl, id);
      });
    } else {
      this.bottomSetMemory.forEach(id => {
        const el = grid.querySelector(`[data-panel="${CSS.escape(id)}"]`);
        if (el) {
          this.insertByOrder(bottomGrid, el as HTMLElement, id);
        }
      });
    }
  }

  private attachRelatedAssetHandlers(panel: NewsPanel): void {
    panel.setRelatedAssetHandlers({
      onRelatedAssetClick: (asset) => this.handleRelatedAssetClick(asset),
      onRelatedAssetsFocus: (assets) => this.ctx.map?.highlightAssets(assets),
      onRelatedAssetsClear: () => this.ctx.map?.highlightAssets(null),
    });
  }

  private handleRelatedAssetClick(asset: RelatedAsset): void {
    if (!this.ctx.map) return;

    switch (asset.type) {
      case 'pipeline':
        this.ctx.map.enableLayer('pipelines');
        this.ctx.mapLayers.pipelines = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerPipelineClick(asset.id);
        break;
      case 'cable':
        this.ctx.map.enableLayer('cables');
        this.ctx.mapLayers.cables = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerCableClick(asset.id);
        break;
      case 'datacenter':
        this.ctx.map.enableLayer('datacenters');
        this.ctx.mapLayers.datacenters = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerDatacenterClick(asset.id);
        break;
      case 'base':
        this.ctx.map.enableLayer('bases');
        this.ctx.mapLayers.bases = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerBaseClick(asset.id);
        break;
      case 'nuclear':
        this.ctx.map.enableLayer('nuclear');
        this.ctx.mapLayers.nuclear = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerNuclearClick(asset.id);
        break;
    }
  }

  private lazyPanel<T extends { getElement(): HTMLElement }>(
    key: string,
    loader: () => Promise<T>,
    setup?: (panel: T) => void,
    lockedFeatures?: string[],
  ): void {
    if (!this.shouldCreatePanel(key)) return;
    loader().then(async (panel) => {
      this.ctx.panels[key] = panel as unknown as import('@/components/Panel').Panel;
      if (lockedFeatures) {
        (panel as unknown as import('@/components/Panel').Panel).showLocked(lockedFeatures);
      } else {
        await replayPendingCalls(key, panel);
        if (setup) setup(panel);
      }
      const el = panel.getElement();
      this.makeDraggable(el, key);

      const bottomGrid = document.getElementById('mapBottomGrid');
      if (bottomGrid && this.getEffectiveUltraWide() && this.bottomSetMemory.has(key)) {
        this.insertByOrder(bottomGrid, el, key);
        return;
      }

      const grid = document.getElementById('panelsGrid');
      if (!grid) return;
      this.insertByOrder(grid, el, key);
    }).catch((err) => {
      console.error(`[panel] failed to lazy-load "${key}"`, err);
    });
  }

  private makeDraggable(el: HTMLElement, key: string): void {
    el.dataset.panel = key;
    let isDragging = false;
    let dragStarted = false;
    let startX = 0;
    let startY = 0;
    let rafId = 0;
    const DRAG_THRESHOLD = 8;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (el.dataset.resizing === 'true') return;
      if (
        target.classList?.contains('panel-resize-handle') ||
        target.closest?.('.panel-resize-handle') ||
        target.classList?.contains('panel-col-resize-handle') ||
        target.closest?.('.panel-col-resize-handle')
      ) return;
      if (target.closest('button, a, input, select, textarea, .panel-content')) return;

      isDragging = true;
      dragStarted = false;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      if (!dragStarted) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
        dragStarted = true;
        el.classList.add('dragging');
      }
      const cx = e.clientX;
      const cy = e.clientY;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        this.handlePanelDragMove(el, cx, cy);
        rafId = 0;
      });
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (dragStarted) {
        el.classList.remove('dragging');
        const isInBottom = !!el.closest('.map-bottom-grid');
        if (isInBottom) {
          this.bottomSetMemory.add(key);
        } else {
          this.bottomSetMemory.delete(key);
        }
        this.savePanelOrder();
      }
      dragStarted = false;
    };

    el.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    this.panelDragCleanupHandlers.push(() => {
      el.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      isDragging = false;
      dragStarted = false;
      el.classList.remove('dragging');
    });
  }

  private handlePanelDragMove(dragging: HTMLElement, clientX: number, clientY: number): void {
    const grid = document.getElementById('panelsGrid');
    const bottomGrid = document.getElementById('mapBottomGrid');
    if (!grid || !bottomGrid) return;

    dragging.style.pointerEvents = 'none';
    const target = document.elementFromPoint(clientX, clientY);
    dragging.style.pointerEvents = '';

    if (!target) return;

    // Check if we are over a grid or a panel inside a grid
    const targetGrid = (target.closest('.panels-grid') || target.closest('.map-bottom-grid')) as HTMLElement | null;
    const targetPanel = target.closest('.panel') as HTMLElement | null;

    if (!targetGrid && !targetPanel) return;

    const currentTargetGrid = targetGrid || (targetPanel ? targetPanel.parentElement as HTMLElement : null);
    if (!currentTargetGrid || (currentTargetGrid !== grid && currentTargetGrid !== bottomGrid)) return;

    if (targetPanel && targetPanel !== dragging && !targetPanel.classList.contains('hidden')) {
      const targetRect = targetPanel.getBoundingClientRect();
      const draggingRect = dragging.getBoundingClientRect();

      const children = Array.from(currentTargetGrid.children);
      const dragIdx = children.indexOf(dragging);
      const targetIdx = children.indexOf(targetPanel);

      const sameRow = Math.abs(draggingRect.top - targetRect.top) < 30;
      const targetMid = sameRow
        ? targetRect.left + targetRect.width / 2
        : targetRect.top + targetRect.height / 2;
      const cursorPos = sameRow ? clientX : clientY;

      if (dragIdx === -1) {
        // Moving from one grid to another
        if (cursorPos < targetMid) {
          currentTargetGrid.insertBefore(dragging, targetPanel);
        } else {
          currentTargetGrid.insertBefore(dragging, targetPanel.nextSibling);
        }
      } else {
        // Reordering within same grid
        if (dragIdx < targetIdx) {
          if (cursorPos > targetMid) {
            currentTargetGrid.insertBefore(dragging, targetPanel.nextSibling);
          }
        } else {
          if (cursorPos < targetMid) {
            currentTargetGrid.insertBefore(dragging, targetPanel);
          }
        }
      }
    } else if (currentTargetGrid !== dragging.parentElement) {
      // Dragging over an empty or near-empty grid zone
      currentTargetGrid.appendChild(dragging);
    }
  }

  getLocalizedPanelName(panelKey: string, fallback: string): string {
    if (panelKey === 'runtime-config') {
      return t('modals.runtimeConfig.title');
    }
    const key = panelKey.replace(/-([a-z])/g, (_match, group: string) => group.toUpperCase());
    const lookup = `panels.${key}`;
    const localized = t(lookup);
    return localized === lookup ? fallback : localized;
  }

  getAllSourceNames(): string[] {
    const sources = new Set<string>();
    Object.values(FEEDS).forEach(feeds => {
      if (feeds) feeds.forEach(f => sources.add(f.name));
    });
    INTEL_SOURCES.forEach(f => sources.add(f.name));
    return Array.from(sources).sort((a, b) => a.localeCompare(b));
  }
}
