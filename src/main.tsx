import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

/**
 * На Android интерфейс живёт в WebView, а «движок» — это нативный мост.
 * Подключаем его до первого рендера, чтобы приложение сразу видело window.shuzu.
 */
async function bootstrap() {
  try {
    const { isNativeAndroid, setupAndroidEngine } = await import('./engine/android');
    if (isNativeAndroid()) {
      await setupAndroidEngine();
    }
  } catch (e) {
    console.error('android bridge failed', e);
  }

  createRoot(root!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
