<script lang="ts">
  import { fade, slide } from "svelte/transition";
  import { enhance } from "$app/forms";
  import { goto } from "$app/navigation";
  import {
    ArrowLeft,
    Save,
    ImagePlus,
    X,
    Package,
    Tag,
    ListFilter,
    MapPin,
    DollarSign,
    Percent,
    AlertCircle,
    CheckCircle2,
    Plus,
    Edit2,
    Box
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import Combobox from "$lib/components/ui/Combobox.svelte";

  let { data, form } = $props();
  
  let isEditing = $state(!!data.article);
  let loading = $state(false);
  let activeTab = $state("general"); // 'general', 'additional', 'sales'

  // Datos Base (General)
  let co_art = $state(data.article?.co_art || "");
  let art_des = $state(data.article?.art_des || "");
  let tipo = $state(data.article?.tipo || "V"); // V=Venta
  let co_lin = $state(data.article?.co_lin || "");
  let co_subl = $state(data.article?.co_subl || "");
  let co_cat = $state(data.article?.co_cat || "");
  let co_color = $state(data.article?.co_color || "");
  let co_ubicacion = $state(data.article?.co_ubicacion || "");
  let procedencia = $state(data.article?.procedencia || "N"); // N=Nacional
  let modelo = $state(data.article?.modelo || "");
  let referencia = $state(data.article?.ref || "");

  // Datos Adicionales (Tributarios y Unidades)
  let co_uni = $state(data.article?.uni_venta || "");
  let sCo_Uni_Sec = $state(data.article?.sSco_Uni || "");
  let bManeja_Serial = $state(data.article?.bManeja_Serial ?? false);
  let bManeja_Lote = $state(data.article?.bManeja_Lote ?? false);
  let tipo_imp = $state(data.article?.tipo_imp || "1"); // 1=Tasa General

  // Datos de Venta (Márgenes, Características)
  let costo_act = $state(data.article?.costo_act || 0); // Readonly
  let peso = $state(data.article?.peso || 0);
  let volumen = $state(data.article?.volumen || 0);
  let comentario = $state(data.article?.comentario || "");

  // Matriz de Precios y Márgenes
  // Si el artículo ya tiene precios (saArtPrecio) y márgenes (saArtMargen), los inicializamos,
  // si no, creamos una estructura vacía para 5 tipos de precio.
  let priceMargins = $state([
    { tipo: "1", margen: 0, precio: 0 },
    { tipo: "2", margen: 0, precio: 0 },
    { tipo: "3", margen: 0, precio: 0 },
    { tipo: "4", margen: 0, precio: 0 },
    { tipo: "5", margen: 0, precio: 0 }
  ]);

  // Image handling
  let imageBase64 = $state(data.article?.image_base64 || "");
  let imageFile = $state<File | null>(null);
  let imagePreviewUrl = $state(imageBase64);

  function handleImageUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > 2 * 1024 * 1024) {
        toast.error("La imagen debe pesar menos de 2MB");
        return;
      }
      imageFile = file;
      const reader = new FileReader();
      reader.onload = (ev) => {
        imagePreviewUrl = ev.target?.result as string;
        imageBase64 = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  // Reactive price calculation
  $effect(() => {
    priceMargins = priceMargins.map(pm => {
      // Precio = Costo / (1 - (Margen / 100)) --- Fórmula Profit Plus
      // O Precio = Costo * (1 + Margen/100) dependiendo de cómo lo manejen.
      // Generalmente Markup: Precio = Costo + (Costo * Margen/100)
      const calculatedPrice = costo_act + (costo_act * (pm.margen / 100));
      return { ...pm, precio: calculatedPrice };
    });
  });

  $effect(() => {
    if (form?.success) {
      toast.success(isEditing ? "Artículo actualizado correctamente" : "Artículo creado exitosamente");
      goto("/dashboard/purchases/articles");
    } else if (form?.error) {
      toast.error(form.error as string);
    }
  });
</script>

<div class="flex flex-col gap-6" in:fade>
  <!-- Cabecera -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div class="flex items-center gap-4">
      <button 
        onclick={() => goto('/dashboard/purchases/articles')}
        class="h-12 w-12 bg-surface-base hover:bg-surface-soft border border-border-subtle rounded-2xl flex items-center justify-center transition-all text-text-muted hover:text-text-base"
      >
        <ArrowLeft size={20} />
      </button>
      <div>
        <h1 class="text-3xl font-black tracking-tight text-text-base flex items-center gap-3">
          {#if isEditing}
            <Edit2 size={32} class="text-brand-500" /> Editar Artículo
          {:else}
            <Plus size={32} class="text-brand-500" /> Nuevo Artículo
          {/if}
        </h1>
        <p class="text-text-muted text-sm mt-1 font-mono">
          {co_art || "NUEVO_ARTICULO"}
        </p>
      </div>
    </div>
    
    <button 
      type="submit" 
      form="articleForm"
      disabled={loading}
      class="h-14 px-8 bg-brand-600 hover:bg-brand-500 shadow-lg shadow-brand-600/20 text-white font-bold rounded-2xl flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50"
    >
      {#if loading}
        <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
        Guardando...
      {:else}
        <Save size={20} /> Guardar
      {/if}
    </button>
  </div>

  <!-- Contenido Principal: 2 Columnas -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-4">
    
    <!-- Lado Izquierdo: Imagen -->
    <div class="col-span-1 lg:col-span-3 flex flex-col gap-4">
      <div class="glass p-6 rounded-3xl border border-white/5 shadow-xl flex flex-col items-center">
        <h3 class="text-xs font-bold uppercase tracking-widest text-text-muted w-full mb-4">Fotografía</h3>
        
        <label 
          class="w-full aspect-square border-2 border-dashed rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative group
          {imagePreviewUrl ? 'border-brand-500/50 bg-black/20' : 'border-white/10 hover:border-brand-500/30 bg-surface-base hover:bg-surface-soft'}"
        >
          <input type="file" accept="image/*" class="hidden" onchange={handleImageUpload} />
          
          {#if imagePreviewUrl}
            <img src={imagePreviewUrl} alt="Preview" class="w-full h-full object-cover" />
            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
              <span class="text-white font-bold flex items-center gap-2 bg-brand-500/80 px-4 py-2 rounded-xl backdrop-blur-sm">
                <ImagePlus size={18} /> Cambiar Foto
              </span>
            </div>
            <button 
              type="button"
              onclick={(e) => { e.preventDefault(); imagePreviewUrl = ""; imageBase64 = ""; imageFile = null; }}
              class="absolute top-2 right-2 p-2 bg-red-500/80 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg backdrop-blur-sm"
            >
              <X size={16} />
            </button>
          {:else}
            <ImagePlus size={48} class="text-text-muted/50 mb-4 group-hover:scale-110 transition-transform group-hover:text-brand-500" />
            <span class="text-sm font-bold text-text-muted group-hover:text-text-base transition-colors">Subir Imagen</span>
            <span class="text-[10px] text-text-muted mt-2">Formatos: JPG, PNG (Max 2MB)</span>
          {/if}
        </label>
      </div>
    </div>

    <!-- Lado Derecho: Tabs y Formulario -->
    <div class="col-span-1 lg:col-span-9">
      <div class="glass rounded-3xl border border-white/5 shadow-xl overflow-hidden flex flex-col h-full">
        
        <!-- Tabs Header -->
        <div class="flex overflow-x-auto custom-scrollbar border-b border-border-subtle bg-surface-base/50 p-2 gap-2">
          <button 
            onclick={() => activeTab = "general"}
            class="px-6 py-3 rounded-2xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap
            {activeTab === 'general' ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'text-text-muted hover:bg-surface-soft hover:text-text-base'}"
          >
            <Package size={16} /> General
          </button>
          <button 
            onclick={() => activeTab = "additional"}
            class="px-6 py-3 rounded-2xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap
            {activeTab === 'additional' ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'text-text-muted hover:bg-surface-soft hover:text-text-base'}"
          >
            <ListFilter size={16} /> Datos Adicionales
          </button>
          <button 
            onclick={() => activeTab = "sales"}
            class="px-6 py-3 rounded-2xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap
            {activeTab === 'sales' ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'text-text-muted hover:bg-surface-soft hover:text-text-base'}"
          >
            <DollarSign size={16} /> Datos de Venta (Márgenes)
          </button>
        </div>

        <form id="articleForm" method="POST" use:enhance class="p-6 flex-1 bg-surface-base/20" onsubmit={() => loading = true}>
          <input type="hidden" name="imageBase64" value={imageBase64} />
          <!-- Tab: GENERAL -->
          {#if activeTab === "general"}
            <div in:fade class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              <!-- Código -->
              <div class="space-y-2 lg:col-span-1">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted flex gap-1">Código <span class="text-brand-500">*</span></label>
                <input type="text" name="co_art" bind:value={co_art} readonly={isEditing} required maxlength="30" class="w-full bg-surface-base h-12 px-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none font-mono text-sm transition-all uppercase {isEditing ? 'opacity-50 cursor-not-allowed' : ''}" placeholder="Ej: 0101001001" />
              </div>

              <!-- Descripción -->
              <div class="space-y-2 lg:col-span-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted flex gap-1">Descripción <span class="text-brand-500">*</span></label>
                <input type="text" name="art_des" bind:value={art_des} required maxlength="60" class="w-full bg-surface-base h-12 px-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm transition-all uppercase" placeholder="Nombre completo del artículo" />
              </div>

              <!-- Tipo -->
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Tipo</label>
                <select name="tipo" bind:value={tipo} class="w-full bg-surface-base h-12 px-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm transition-all">
                  <option value="V">Venta</option>
                  <option value="S">Servicio</option>
                  <option value="C">Consumo</option>
                </select>
              </div>

              <!-- Línea -->
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Línea</label>
                <Combobox options={data.catalogs?.lineas.map(c => ({value: c.co_lin, label: `${c.co_lin} - ${c.lin_des}`})) || []} bind:value={co_lin} name="co_lin" placeholder="Línea..." class="w-full h-12" />
              </div>

              <!-- Sub-Línea -->
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Sub-Línea</label>
                <Combobox options={data.catalogs?.sublineas.map(c => ({value: c.co_subl, label: `${c.co_subl} - ${c.subl_des}`})) || []} bind:value={co_subl} name="co_subl" placeholder="Sub-Línea..." class="w-full h-12" />
              </div>

              <!-- Categoría -->
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Categoría</label>
                <Combobox options={data.catalogs?.categorias.map(c => ({value: c.co_cat, label: `${c.co_cat} - ${c.cat_des}`})) || []} bind:value={co_cat} name="co_cat" placeholder="Categoría..." class="w-full h-12" />
              </div>

              <!-- Ubicación Básica -->
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Ubicación</label>
                <Combobox options={data.catalogs?.ubicaciones.map(c => ({value: c.co_ubicacion, label: `${c.co_ubicacion} - ${c.des_ubicacion || c.descripcion}`})) || []} bind:value={co_ubicacion} name="co_ubicacion" placeholder="Ubicación..." class="w-full h-12" />
              </div>

              <!-- Procedencia -->
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Procedencia</label>
                <select name="procedencia" bind:value={procedencia} class="w-full bg-surface-base h-12 px-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm transition-all">
                  <option value="N">Nacional</option>
                  <option value="I">Importado</option>
                </select>
              </div>

            </div>
          {/if}

          <!-- Tab: ADICIONALES -->
          {#if activeTab === "additional"}
            <div in:fade class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              <div class="col-span-full mb-2 border-b border-white/5 pb-2">
                <h4 class="text-brand-400 font-bold uppercase tracking-widest text-xs flex items-center gap-2"><Box size={14} /> Unidades de Medida</h4>
              </div>

              <!-- Unidad Primaria -->
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Unidad Primaria <span class="text-brand-500">*</span></label>
                <Combobox options={data.catalogs?.unidades.map(u => ({value: u.co_uni, label: `${u.co_uni} - ${u.des_uni}`})) || []} bind:value={co_uni} name="co_uni" placeholder="Unidad principal..." class="w-full h-12" />
              </div>

              <!-- Unidad Secundaria -->
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Unidad Secundaria</label>
                <Combobox options={data.catalogs?.unidades.map(u => ({value: u.co_uni, label: `${u.co_uni} - ${u.des_uni}`})) || []} bind:value={sCo_Uni_Sec} name="sCo_Uni_Sec" placeholder="Unidad alterna (Opcional)..." class="w-full h-12" />
              </div>

              <div class="space-y-2 flex flex-col justify-end">
                <label class="flex items-center gap-3 cursor-pointer group">
                  <div class="relative w-10 h-6 bg-surface-base border border-border-subtle rounded-full transition-colors group-hover:border-brand-500 {bManeja_Serial ? 'bg-brand-500 border-brand-500' : ''}">
                    <input type="checkbox" name="bManeja_Serial" bind:checked={bManeja_Serial} class="sr-only" />
                    <div class="absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform {bManeja_Serial ? 'translate-x-4' : ''}"></div>
                  </div>
                  <span class="text-sm font-bold text-text-muted group-hover:text-text-base">Maneja Serial</span>
                </label>
                <label class="flex items-center gap-3 cursor-pointer group mt-2">
                  <div class="relative w-10 h-6 bg-surface-base border border-border-subtle rounded-full transition-colors group-hover:border-brand-500 {bManeja_Lote ? 'bg-brand-500 border-brand-500' : ''}">
                    <input type="checkbox" name="bManeja_Lote" bind:checked={bManeja_Lote} class="sr-only" />
                    <div class="absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform {bManeja_Lote ? 'translate-x-4' : ''}"></div>
                  </div>
                  <span class="text-sm font-bold text-text-muted group-hover:text-text-base">Maneja Lote</span>
                </label>
              </div>

              <div class="col-span-full mt-4 mb-2 border-b border-white/5 pb-2">
                <h4 class="text-brand-400 font-bold uppercase tracking-widest text-xs flex items-center gap-2"><Percent size={14} /> Tributarios</h4>
              </div>

              <!-- IVA -->
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">I.V.A.</label>
                <select name="tipo_imp" bind:value={tipo_imp} class="w-full bg-surface-base h-12 px-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm transition-all">
                  <option value="1">Tasa General</option>
                  <option value="2">Tasa Reducida</option>
                  <option value="3">Tasa Suntuaria</option>
                  <option value="4">Exento</option>
                </select>
              </div>

              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Peso</label>
                <input type="number" step="0.01" name="peso" bind:value={peso} class="w-full bg-surface-base h-12 px-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm font-mono text-right" />
              </div>

              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Volumen</label>
                <input type="number" step="0.01" name="volumen" bind:value={volumen} class="w-full bg-surface-base h-12 px-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm font-mono text-right" />
              </div>

            </div>
          {/if}

          <!-- Tab: VENTAS -->
          {#if activeTab === "sales"}
            <div in:fade class="flex flex-col gap-6">
              
              <div class="flex items-center gap-4 bg-brand-500/10 border border-brand-500/20 p-4 rounded-2xl">
                <AlertCircle class="text-brand-500" size={24} />
                <div>
                  <h4 class="text-brand-400 font-bold text-sm">Costo Base Calculado: Bs. {Number(costo_act).toLocaleString('de-DE', {minimumFractionDigits: 2})}</h4>
                  <p class="text-xs text-brand-500/70">Este costo proviene de la última factura de compra. El precio se calculará en base al margen que establezcas.</p>
                </div>
              </div>

              <!-- Matriz de Márgenes -->
              <div class="border border-border-subtle rounded-2xl overflow-hidden bg-surface-base/50">
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr class="bg-surface-raised border-b border-border-subtle text-xs uppercase font-black tracking-widest text-text-muted">
                      <th class="p-4">Tipo de Precio</th>
                      <th class="p-4 w-40 text-right">% Margen (Min/Max)</th>
                      <th class="p-4 w-48 text-right">Precio Sugerido (Bs)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each priceMargins as pm, index}
                      <tr class="border-b border-border-subtle/50 hover:bg-surface-soft/50 transition-colors">
                        <td class="p-4 font-bold">Precio {pm.tipo}</td>
                        <td class="p-3">
                          <div class="relative">
                            <input 
                              type="number" 
                              step="0.01" 
                              min="0" max="1000"
                              bind:value={pm.margen} 
                              class="w-full bg-surface-base h-10 px-3 pr-8 rounded-lg border border-border-subtle focus:border-brand-500 outline-none text-sm font-mono text-right transition-all" 
                            />
                            <Percent size={14} class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
                          </div>
                          <!-- Enviar la matriz de margenes al backend en un input hidden -->
                          <input type="hidden" name="margen_{pm.tipo}" value={pm.margen} />
                        </td>
                        <td class="p-4 text-right font-mono font-bold text-brand-400">
                          Bs. {Number(pm.precio).toLocaleString('de-DE', {minimumFractionDigits: 2})}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>

              <!-- Comentarios -->
              <div class="space-y-2 mt-4">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Comentario del Artículo</label>
                <textarea name="comentario" bind:value={comentario} class="w-full bg-surface-base h-24 p-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm transition-all resize-none"></textarea>
              </div>

            </div>
          {/if}

        </form>
      </div>
    </div>

  </div>
</div>
