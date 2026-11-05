/** Точка входа для дымового теста (не попадает в сборку приложения). */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const el = document.getElementById('root');
createRoot(el!).render(<App />);
