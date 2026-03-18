// src/lib/theme.svelte.ts
import { browser } from '$app/environment';

type Theme = 'light' | 'dark';

// State managed with Svelte 5 Runes
let currentTheme = $state<Theme>(
  browser ? (localStorage.getItem('theme') as Theme) || 'dark' : 'dark'
);

export function getTheme() {
  return currentTheme;
}

export function toggleTheme() {
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  currentTheme = newTheme;

  if (browser) {
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  }
}

function applyTheme(theme: Theme) {
  if (!browser) return;
  
  const root = document.documentElement;
  if (theme === 'light') {
    root.classList.add('light');
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
  }

  // Update theme-color meta tag
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#0e0e11' : '#ffffff');
  }
}

// Initial hydration/sync
export function initTheme() {
  if (browser) {
    const saved = localStorage.getItem('theme') as Theme || 'dark';
    currentTheme = saved;
    applyTheme(saved);
  }
}
