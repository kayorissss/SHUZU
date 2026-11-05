/**
 * Мост между UI и «движком».
 * В Electron используется настоящий IPC-мост (window.shuzu), в браузере — демо.
 */
import type { ShuzuApi } from '../../shared/types';
import { createDemoEngine } from './demo';

declare global {
  interface Window {
    shuzu?: ShuzuApi;
    shuzuAndroid?: boolean;
  }
}

export const isDesktop = typeof window !== 'undefined' && !!window.shuzu;
export const isAndroid = typeof window !== 'undefined' && !!window.shuzuAndroid;

let engine: ShuzuApi | null = null;

export function getEngine(): ShuzuApi {
  if (!engine) {
    engine = window.shuzu ?? createDemoEngine();
  }
  return engine;
}
