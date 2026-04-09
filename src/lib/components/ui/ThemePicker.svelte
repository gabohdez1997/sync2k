<script lang="ts">
    import { getThemeConfig, updateThemeConfig, type ThemeMode } from '$lib/theme.svelte';
    import { Monitor, Sun, Moon, Check } from 'lucide-svelte';

    let config = $derived(getThemeConfig());

    const colors = [
        { name: 'Azul', hue: 217, sat: 91 },
        { name: 'Índigo', hue: 239, sat: 84 },
        { name: 'Morado', hue: 271, sat: 91 },
        { name: 'Rosa', hue: 330, sat: 81 },
        { name: 'Rojo', hue: 0, sat: 72 },
        { name: 'Naranja', hue: 24, sat: 95 },
        { name: 'Ámbar', hue: 38, sat: 92 },
        { name: 'Amarillo', hue: 45, sat: 93 },
        { name: 'Verde', hue: 142, sat: 70 },
        { name: 'Esmeralda', hue: 160, sat: 84 },
        { name: 'Teal', hue: 174, sat: 70 },
        { name: 'Cian', hue: 188, sat: 78 }
    ];

    const modes: { id: ThemeMode; label: string; icon: any }[] = [
        { id: 'light', label: 'Claro', icon: Sun },
        { id: 'dark', label: 'Oscuro', icon: Moon },
        { id: 'system', label: 'Sistema', icon: Monitor }
    ];

    function setHue(hue: number, sat: number) {
        updateThemeConfig({ accentHue: hue, accentSaturation: sat }, true);
    }

    function setMode(mode: ThemeMode) {
        updateThemeConfig({ mode }, true);
    }
</script>

<div class="space-y-8">
    <!-- Modo de Tema -->
    <div class="space-y-4">
        <label class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted ml-1">Aspecto</label>
        <div class="grid grid-cols-3 gap-3">
            {#each modes as m}
                <button
                    type="button"
                    onclick={() => setMode(m.id)}
                    class="flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all duration-300 group
                    {config.mode === m.id 
                        ? 'bg-brand-500/10 border-brand-500/40 ring-1 ring-brand-500/30' 
                        : 'bg-surface-raised/50 border-white/5 hover:border-white/10 hover:bg-surface-raised'}"
                >
                    <div class="p-2.5 rounded-xl transition-colors
                        {config.mode === m.id ? 'bg-brand-500 text-white' : 'bg-white/5 text-text-muted group-hover:text-text-base'}">
                        <m.icon size={20} />
                    </div>
                    <span class="text-xs font-bold {config.mode === m.id ? 'text-brand-500' : 'text-text-muted'}">{m.label}</span>
                </button>
            {/each}
        </div>
    </div>

    <!-- Paleta de Colores -->
    <div class="space-y-4">
        <label class="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted ml-1">Color de Acento</label>
        <div class="grid grid-cols-4 sm:grid-cols-6 gap-4">
            {#each colors as color}
                <button
                    type="button"
                    onclick={() => setHue(color.hue, color.sat)}
                    class="relative aspect-square rounded-full transition-all duration-300 hover:scale-110 active:scale-95 group flex items-center justify-center"
                    style="background-color: hsl({color.hue}, {color.sat}%, 60%);"
                    title={color.name}
                >
                    {#if config.accentHue === color.hue}
                        <div class="bg-white/20 backdrop-blur-sm p-1.5 rounded-full ring-2 ring-white/50 animate-in zoom-in duration-300">
                            <Check size={16} class="text-white" strokeWidth={4} />
                        </div>
                    {/if}
                    
                    <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </button>
            {/each}
        </div>
    </div>
</div>

<style>
    /* Efecto premium para los circulos de color */
    button[style*="background-color"] {
        box-shadow: 
            0 4px 12px -2px rgba(0,0,0,0.2),
            inset 0 2px 4px rgba(255,255,255,0.2),
            inset 0 -2px 4px rgba(0,0,0,0.1);
    }
    
    button[style*="background-color"]:hover {
        box-shadow: 
            0 8px 16px -4px rgba(0,0,0,0.3),
            inset 0 2px 4px rgba(255,255,255,0.3);
    }
</style>
