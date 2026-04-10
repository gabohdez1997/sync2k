// src/lib/theme.svelte.ts
import { browser } from '$app/environment';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeConfig {
    mode: ThemeMode;
    accentHue: number;
    accentSaturation: number;
}

export const DEFAULT_CONFIG: ThemeConfig = {
    mode: 'system',
    accentHue: 217, // Azul por defecto
    accentSaturation: 91
};

// State managed with Svelte 5 Runes
let config = $state<ThemeConfig>(
    browser ? JSON.parse(localStorage.getItem('theme_config') || JSON.stringify(DEFAULT_CONFIG)) : DEFAULT_CONFIG
);

export function getThemeConfig() {
    return config;
}

export function updateThemeConfig(partial: Partial<ThemeConfig>, saveToServer = false) {
    config = { ...config, ...partial };
    if (browser) {
        localStorage.setItem('theme_config', JSON.stringify(config));
        applyTheme();

        if (saveToServer) {
            fetch('/api/theme', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme_config: config })
            }).catch(e => console.error("Error auto-saving theme:", e));
        }
    }
}

function applyTheme() {
    if (!browser) return;
    
    const root = document.documentElement;
    const isDark = config.mode === 'dark' || (config.mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    if (isDark) {
        root.classList.add('dark');
        root.classList.remove('light');
    } else {
        root.classList.add('light');
        root.classList.remove('dark');
    }

    // Aplicar variables HSL
    root.style.setProperty('--brand-h', config.accentHue.toString());
    root.style.setProperty('--brand-s', `${config.accentSaturation}%`);
    
    // Ajustar luminosidad base segun el tema para mejor contraste
    root.style.setProperty('--brand-l', isDark ? '60%' : '50%');

    // Update theme-color meta tag
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        meta.setAttribute('content', isDark ? '#0a0a0c' : '#ffffff');
    }
}

// Initial hydration/sync
export function initTheme() {
    if (browser) {
        applyTheme();
        
        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (config.mode === 'system') applyTheme();
        });
    }
}

export function getTheme() {
    return config.mode;
}

export function toggleTheme() {
    const isDark = config.mode === 'dark' || (config.mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    updateThemeConfig({ mode: isDark ? 'light' : 'dark' }, true);
}
