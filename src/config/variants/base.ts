// Base configuration shared across all variants
import type { PanelConfig, MapLayers } from '@/types';

// Shared exports (re-exported by all variants)
export { SECTORS, COMMODITIES, MARKET_SYMBOLS } from '../markets';
export { UNDERSEA_CABLES } from '../geo';
export { AI_DATA_CENTERS } from '../ai-datacenters';

// Idle pause duration - shared across map and stream panels (5 minutes)
export const IDLE_PAUSE_MS = 5 * 60 * 1000;

// Refresh intervals - shared across all variants
export const REFRESH_INTERVALS = {
  feeds: 20 * 60 * 1000,
  markets: 12 * 60 * 1000,
  crypto: 12 * 60 * 1000,
  predictions: 15 * 60 * 1000,
  ais: 15 * 60 * 1000,
};

// Monitor colors — refined Zettabyte palette
export const MONITOR_COLORS = [
  '#34d399',
  '#f59e0b',
  '#4d94ff',
  '#a855f7',
  '#eab308',
  '#ef4444',
  '#22d3ee',
  '#22c55e',
  '#c084fc',
  '#6aadff',
];

// Storage keys - shared
export const STORAGE_KEYS = {
  panels: 'zettabyte-panels',
  monitors: 'zettabyte-monitors',
  mapLayers: 'zettabyte-layers',
  disabledFeeds: 'zettabyte-disabled-feeds',
  liveChannels: 'zettabyte-live-channels',
  mapMode: 'zettabyte-map-mode',          // 'flat' | 'globe'
} as const;

// Type definitions for variant configs
export interface VariantConfig {
  name: string;
  description: string;
  panels: Record<string, PanelConfig>;
  mapLayers: MapLayers;
  mobileMapLayers: MapLayers;
}
