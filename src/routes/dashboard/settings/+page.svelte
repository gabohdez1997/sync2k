<script lang="ts">
  import { enhance } from "$app/forms";
  import { fade } from "svelte/transition";
  import { toast } from "svelte-sonner";
  import {
    Settings,
    Save,
    Layout,
    Type,
    Image as ImageIcon,
    Info,
    Loader2,
    ShieldCheck,
    Smartphone
  } from "lucide-svelte";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let loading = $state(false);

  // Valores locales vinculados a los datos actuales
  let appName = $state(data.systemSettings?.app_name || "");
  let appTitle = $state(data.systemSettings?.app_title || "");
  let appLogoUrl = $state(data.systemSettings?.app_logo_url || "");
  let footerText = $state(data.systemSettings?.footer_text || "");

  $effect(() => {
    if (form?.success) {
      toast.success("Configuración actualizada correctamente");
    } else if (form?.error) {
      toast.error(form.error as string);
    }
  });
</script>

<div class="space-y-8" in:fade>
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Settings size={40} class="text-brand-500" />
        Parametrización
      </h1>
      <p class="text-text-muted mt-2 text-lg">
        Personaliza la identidad y el comportamiento global de tu plataforma.
      </p>
    </div>
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
    <!-- Main Config Form -->
    <div class="xl:col-span-2 space-y-6">
      <form
        method="POST"
        action="?/saveSettings"
        enctype="multipart/form-data"
        use:enhance={() => {
          loading = true;
          return async ({ update }) => {
            await update({ reset: false });
            loading = false;
          };
        }}
        class="bg-surface-raised p-8 rounded-3xl border border-border-subtle shadow-xl space-y-8"
      >
        <!-- Branding Section -->
        <div class="space-y-6">
          <div class="flex items-center gap-3 text-brand-500 border-b border-white/5 pb-4">
            <Layout size={24} />
            <h2 class="text-xl font-bold uppercase tracking-wider">Identidad de Marca</h2>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <label for="app_name" class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 flex items-center gap-2">
                <Type size={14} /> Nombre de la Aplicación
              </label>
              <input
                id="app_name"
                name="app_name"
                type="text"
                bind:value={appName}
                class="w-full h-12 bg-surface-base border border-border-subtle rounded-xl px-4 text-sm font-bold focus:border-brand-500 outline-none transition-all"
                placeholder="Ej: GalpeApp"
              />
            </div>

            <div class="space-y-2">
              <label for="app_title" class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 flex items-center gap-2">
                <ShieldCheck size={14} /> Título del Navegador
              </label>
              <input
                id="app_title"
                name="app_title"
                type="text"
                bind:value={appTitle}
                class="w-full h-12 bg-surface-base border border-border-subtle rounded-xl px-4 text-sm font-bold focus:border-brand-500 outline-none transition-all"
                placeholder="Ej: GalpeApp | Dashboard"
              />
            </div>
          </div>

          <div class="space-y-4">
            <label for="app_logo_file" class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 flex items-center gap-2">
              <ImageIcon size={14} /> Logotipo Principal (Archivo)
            </label>
            <div class="flex flex-col md:flex-row gap-6 items-start">
              <div class="relative group">
                <div class="h-32 w-32 rounded-3xl bg-surface-base border-2 border-dashed border-border-subtle group-hover:border-brand-500/50 flex items-center justify-center overflow-hidden transition-all shadow-inner">
                  {#if appLogoUrl}
                    <img src={appLogoUrl} alt="Preview" class="max-w-full max-h-full object-contain p-4 transition-transform group-hover:scale-110" />
                  {:else}
                    <ImageIcon size={32} class="text-white/10" />
                  {/if}
                </div>
                <div class="absolute -bottom-2 -right-2 bg-brand-500 text-white p-2 rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                  <ImageIcon size={16} />
                </div>
              </div>

              <div class="flex-1 space-y-3 w-full">
                <input
                  id="app_logo_file"
                  name="app_logo_file"
                  type="file"
                  accept="image/*"
                  onchange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (re) => {
                        appLogoUrl = re.target?.result as string;
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  class="block w-full text-sm text-text-muted
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-xl file:border-0
                    file:text-xs file:font-black file:uppercase
                    file:bg-brand-500/10 file:text-brand-400
                    hover:file:bg-brand-500/20
                    transition-all cursor-pointer"
                />
                <p class="text-[10px] text-text-muted italic px-1">
                  Recomendado: Imagen cuadrada (PNG/SVG) para PWA y Favicon.
                </p>
                <input type="hidden" name="app_logo_url_current" value={data.systemSettings?.app_logo_url || ""} />
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <label for="footer_text" class="text-xs font-black uppercase tracking-widest text-text-muted ml-1 flex items-center gap-2">
              <Info size={14} /> Texto del Pie de Página (Copyright)
            </label>
            <input
              id="footer_text"
              name="footer_text"
              type="text"
              bind:value={footerText}
              class="w-full h-12 bg-surface-base border border-border-subtle rounded-xl px-4 text-sm font-bold focus:border-brand-500 outline-none transition-all"
              placeholder="Ej: © 2024 GalpeApp. Todos los derechos reservados."
            />
          </div>
        </div>

        <!-- PWA / App Info -->
        <div class="p-6 bg-brand-500/5 rounded-2xl border border-brand-500/10 space-y-4">
           <div class="flex items-center gap-3 text-brand-400">
             <Smartphone size={20} />
             <h3 class="font-bold uppercase tracking-widest text-sm">Configuración PWA</h3>
           </div>
           <p class="text-xs text-text-muted leading-relaxed">
             Los cambios realizados aquí se reflejarán automáticamente en el nombre de la aplicación instalable y en los iconos del sistema. Asegúrate de que la URL del logotipo sea una imagen cuadrada válida para una mejor visualización en móviles.
           </p>
        </div>

        <div class="pt-4 border-t border-white/5 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            class="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-8 py-3 rounded-xl font-bold hover:shadow-lg hover:shadow-brand-500/30 transition-all active:scale-95 disabled:opacity-50"
          >
            {#if loading}
              <Loader2 size={18} class="animate-spin" />
            {:else}
              <Save size={18} />
            {/if}
            Guardar Configuración
          </button>
        </div>
      </form>
    </div>

    <!-- Sidebar / Preview -->
    <div class="space-y-6">
      <div class="bg-surface-raised p-6 rounded-3xl border border-border-subtle shadow-sm space-y-4">
        <h3 class="text-sm font-bold uppercase tracking-widest text-brand-500">Vista Previa (Branding)</h3>
        
        <div class="space-y-6">
          <!-- Sidebar Mockup -->
          <div class="bg-surface-base rounded-2xl border border-border-subtle p-4 aspect-video flex flex-col gap-4 overflow-hidden relative">
            <div class="flex items-center gap-3 border-b border-white/5 pb-2">
               <img src={appLogoUrl} alt="Logo" class="h-6 w-auto" />
               <div class="font-black text-xs tracking-tighter">
                  <span class="text-brand-500">{appName?.slice(0,5)}</span>
                  <span class="opacity-50">{appName?.slice(5)}</span>
               </div>
            </div>
            <div class="flex-1 space-y-2">
               <div class="h-2 w-2/3 bg-white/5 rounded-full"></div>
               <div class="h-2 w-1/2 bg-white/5 rounded-full"></div>
            </div>
            <div class="text-[8px] text-text-muted italic border-t border-white/5 pt-2">
               {footerText}
            </div>
          </div>

          <div class="p-4 bg-white/5 rounded-2xl text-[10px] text-text-muted space-y-2">
             <p class="flex items-center gap-2 font-bold"><span class="w-1.5 h-1.5 rounded-full bg-green-500"></span> Base de Datos Conectada</p>
             <p class="opacity-60 leading-relaxed italic">Esta configuración se almacena en la tabla <b>system_settings</b> de Supabase para su persistencia global.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
