<script lang="ts">
  import { fade } from "svelte/transition";
  import { enhance } from "$app/forms";
  import { goto } from "$app/navigation";
  import {
    ArrowLeft, Save, ImagePlus, X, Package, Tag, ListFilter,
    MapPin, DollarSign, Percent, AlertCircle, Plus, Edit2, Box,
    Check, Settings, ChevronRight, Lock, Trash2
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import Combobox from "$lib/components/ui/Combobox.svelte";

  let { data, form } = $props();

  let isEditing = $state(!!data.article);
  let loading = $state(false);
  let activeTab = $state(0); // 0=General, 1=Adicional, 2=Precios

  // ── General ──
  let co_art = $state(data.article?.co_art || "");
  let art_des = $state(data.article?.art_des || "");
  let tipo = $state(data.article?.tipo || "V");
  let co_lin = $state(data.article?.co_lin || "");
  let co_subl = $state(data.article?.co_subl || "");
  let co_cat = $state(data.article?.co_cat || "");
  let co_color = $state(data.article?.co_color || "");
  let co_ubicacion = $state(data.article?.co_ubicacion || "");
  let cod_proc = $state(data.article?.cod_proc || "");
  let modelo = $state(data.article?.modelo || "");
  let referencia = $state(data.article?.ref || "");

  // ── Adicional ──
  let co_uni = $state(data.article?.uni_venta || data.article?.co_uni || "");
  let sCo_Uni_Sec = $state(data.article?.sSco_Uni || "");
  let bManeja_Serial = $state(data.article?.bManeja_Serial ?? false);
  let bManeja_Lote = $state(data.article?.bManeja_Lote ?? false);
  let tipo_imp = $state(data.article?.tipo_imp || "1");
  let peso = $state(data.article?.peso || 0);
  let volumen = $state(data.article?.volumen || 0);
  let stock_min = $state(data.article?.stock_min || 0);
  let stock_max = $state(data.article?.stock_max || 0);
  let garantia = $state(data.article?.garantia || "0");
  let comentario = $state(data.article?.comentario || "");

  // ── Precios / Márgenes Dinámicos ──
  let costo_act = $state(data.article?.costo_act || 0);
  let priceEntries = $state<Array<{tipo: string, margen: number}>>(
    (data.article?.precios || [])
      .filter((p: any) => (p.margen || 0) > 0)
      .map((p: any) => ({
        tipo: String(parseInt(p.id_precio)),
        margen: p.margen || 0
      }))
  );

  const usedPriceTypes = $derived(priceEntries.map(e => e.tipo));
  const availablePriceTypes = $derived(
    ['1','2','3','4','5'].filter(t => !usedPriceTypes.includes(t))
  );

  function addPriceEntry() {
    if (availablePriceTypes.length === 0) return;
    priceEntries = [...priceEntries, { tipo: availablePriceTypes[0], margen: 0 }];
  }

  function removePriceEntry(index: number) {
    priceEntries = priceEntries.filter((_, i) => i !== index);
  }

  // ── Imagen ──
  let imageBase64 = $state(data.article?.image_base64 || "");
  let imageFile = $state<File | null>(null);
  let imagePreviewUrl = $state(imageBase64);

  function handleImageUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > 2 * 1024 * 1024) { toast.error("La imagen debe pesar menos de 2MB"); return; }
      imageFile = file;
      const reader = new FileReader();
      reader.onload = (ev) => { imagePreviewUrl = ev.target?.result as string; imageBase64 = ev.target?.result as string; };
      reader.readAsDataURL(file);
    }
  }

  // ── Cascade Filtering ──
  const filteredSublineas = $derived(
    !co_lin ? (data.catalogs?.sublineas || [])
    : (data.catalogs?.sublineas || []).filter((s: any) => s.co_subl?.startsWith(co_lin.trim()))
  );

  const filteredCategorias = $derived(() => {
    const all = data.catalogs?.categorias || [];
    if (!co_subl) return all;
    const linTrim = co_lin.trim();
    const sublTrim = co_subl.trim();
    const sublSuffix = sublTrim.slice(-2);
    const linShort = parseInt(linTrim, 10).toString();
    const prefix = linShort + sublSuffix;
    return all.filter((c: any) => c.co_cat?.startsWith(prefix));
  });

  const codePrefix = $derived(() => {
    if (!co_lin || !co_subl || !co_cat) return "";
    const linTrim = co_lin.trim();
    const sublSuffix = co_subl.trim().slice(-2);
    const catSuffix = co_cat.trim().slice(-3);
    return linTrim + sublSuffix + catSuffix;
  });

  $effect(() => {
    if (co_lin && !isEditing) {
      const valid = filteredSublineas.some((s: any) => s.co_subl === co_subl);
      if (!valid) { co_subl = ""; co_cat = ""; }
    }
  });

  $effect(() => {
    if (co_subl && !isEditing) {
      const cats = filteredCategorias();
      const valid = cats.some((c: any) => c.co_cat === co_cat);
      if (!valid) co_cat = "";
    }
  });

  // Auto-completar el código sumando 1
  let lastFetchedPrefix = "";
  let fetchingCode = false;

  $effect(() => {
    const prefix = codePrefix();
    if (prefix && !isEditing && prefix.length === 7) {
      if (prefix !== lastFetchedPrefix) {
        lastFetchedPrefix = prefix;
        fetchingCode = true;
        fetch(`/api/next-code?prefix=${prefix}`)
          .then(res => res.json())
          .then(res => {
            fetchingCode = false;
            if (res.success && res.nextCode) {
              if (!co_art || co_art.length <= 7 || co_art.startsWith(prefix)) {
                co_art = res.nextCode;
              }
            }
          })
          .catch(() => fetchingCode = false);
      }
    }
  });



  $effect(() => {
    if (form?.success) {
      if (form.warning) {
        toast.warning(form.warning as string, { duration: 10000 });
      } else {
        toast.success(isEditing ? "Artículo actualizado" : "Artículo creado exitosamente");
      }
      goto("/dashboard/purchases/articles");
    } else if (form?.error) {
      toast.error(form.error as string);
    }
  });

  function handleEnhance({ cancel }) {
    if (!co_art || !co_art.trim()) {
      toast.error("No se puede guardar el artículo sin código");
      activeTab = 0;
      cancel();
      return;
    }
    if (!art_des || !art_des.trim()) {
      toast.error("No se puede guardar el artículo sin descripción");
      activeTab = 0;
      cancel();
      return;
    }
    if (!co_uni || !co_uni.trim()) {
      toast.error("No se puede guardar el artículo sin unidad de medida");
      activeTab = 0;
      cancel();
      return;
    }
    if (priceEntries.length === 0) {
      toast.error("No se puede guardar el artículo sin márgenes de precio");
      activeTab = 2;
      cancel();
      return;
    }
    for (const entry of priceEntries) {
      if (entry.margen === undefined || entry.margen === null || isNaN(entry.margen) || entry.margen <= 0) {
        toast.error(`El margen para el Precio ${entry.tipo} debe ser mayor a 0%`);
        activeTab = 2;
        cancel();
        return;
      }
    }
    loading = true;

    return async ({ update }) => {
      loading = false;
      await update();
    };
  }

  const steps = [
    { icon: Package, label: "General" },
    { icon: Settings, label: "Adicional" },
    { icon: DollarSign, label: "Venta" }
  ];
</script>

<div class="flex flex-col gap-6" in:fade>
  <!-- Cabecera -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div class="flex items-center gap-4">

      <div>
        <h1 class="text-3xl font-black tracking-tight text-text-base flex items-center gap-3">
          {#if isEditing}<Edit2 size={32} class="text-brand-500" /> Editar Artículo{:else}<Plus size={32} class="text-brand-500" /> Nuevo Artículo{/if}
        </h1>
        <p class="text-text-muted text-sm mt-1 font-mono">{co_art || "SIN_CÓDIGO"}</p>
      </div>
    </div>
    <button onclick={() => goto('/dashboard/purchases/articles')} class="h-14 px-8 bg-surface-base hover:bg-surface-soft border border-border-subtle text-text-muted hover:text-text-base font-bold rounded-2xl flex items-center gap-3 transition-all active:scale-95">
      <ListFilter size={20} /> Ver Artículos
    </button>
  </div>

  <!-- Step Bar -->
  <div class="glass rounded-3xl border border-white/5 shadow-xl p-6">
    <div class="flex items-center justify-center gap-0 relative max-w-2xl mx-auto">
      <div class="absolute left-[16.67%] right-[16.67%] top-1/2 -translate-y-[calc(50%+12px)] h-[2px] bg-white/10 z-0"></div>
      <div class="absolute left-[16.67%] top-1/2 -translate-y-[calc(50%+12px)] h-[2px] bg-brand-500 transition-all duration-500 z-0" style="width: {activeTab === 0 ? '0%' : activeTab === 1 ? '33.33%' : '66.67%'}"></div>
      {#each steps as step, i}
        <button onclick={() => activeTab = i} class="relative z-10 flex flex-col items-center gap-2 group flex-1">
          <div class={`h-12 w-12 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 ${activeTab >= i ? 'bg-brand-600 border-brand-500 shadow-lg shadow-brand-500/20' : 'bg-surface-base border-white/5'}`}>
            <svelte:component this={step.icon} size={20} class={activeTab >= i ? 'text-white' : 'text-text-muted'} />
          </div>
          <span class={`text-[10px] font-black uppercase tracking-widest ${activeTab === i ? 'text-brand-400' : 'text-text-muted'}`}>{step.label}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Contenido: 2 Columnas -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
    <!-- Imagen -->
    <div class="col-span-1 lg:col-span-3 flex flex-col gap-4">
      <div class="glass p-6 rounded-3xl border border-white/5 shadow-xl flex flex-col items-center">
        <h3 class="text-xs font-bold uppercase tracking-widest text-text-muted w-full mb-4">Fotografía</h3>
        <label class="w-full aspect-square border-2 border-dashed rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative group {imagePreviewUrl ? 'border-brand-500/50 bg-black/20' : 'border-white/10 hover:border-brand-500/30 bg-surface-base hover:bg-surface-soft'}">
          <input type="file" accept="image/*" class="hidden" onchange={handleImageUpload} />
          {#if imagePreviewUrl}
            <img src={imagePreviewUrl} alt="Preview" class="w-full h-full object-cover" />
            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
              <span class="text-white font-bold flex items-center gap-2 bg-brand-500/80 px-4 py-2 rounded-xl backdrop-blur-sm"><ImagePlus size={18} /> Cambiar</span>
            </div>
            <button type="button" onclick={(e) => { e.preventDefault(); imagePreviewUrl = ""; imageBase64 = ""; imageFile = null; }} class="absolute top-2 right-2 p-2 bg-red-500/80 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg backdrop-blur-sm">
              <X size={16} />
            </button>
          {:else}
            <ImagePlus size={48} class="text-text-muted/50 mb-4 group-hover:scale-110 transition-transform group-hover:text-brand-500" />
            <span class="text-sm font-bold text-text-muted group-hover:text-text-base transition-colors">Subir Imagen</span>
            <span class="text-[10px] text-text-muted mt-2">JPG, PNG (Max 2MB)</span>
          {/if}
        </label>
      </div>

      <!-- Código Auto-Generado (sidebar info) -->
      {#if codePrefix() && !isEditing}
        <div class="glass p-4 rounded-2xl border border-brand-500/20 bg-brand-500/5" in:fade>
          <h4 class="text-[10px] font-black uppercase tracking-widest text-brand-400 mb-2">Código Sugerido</h4>
          <div class="flex items-center gap-2">
            <p class="font-mono text-lg font-bold text-brand-300">{co_art || codePrefix() + "___"}</p>
            {#if fetchingCode}
               <div class="w-3 h-3 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin"></div>
            {/if}
          </div>
          <p class="text-[10px] text-text-muted mt-1">Prefijo: {codePrefix()} + secuencial</p>
        </div>
      {/if}
    </div>

    <!-- Formulario -->
    <div class="col-span-1 lg:col-span-9">
      <div class="glass rounded-3xl border border-white/5 shadow-xl flex flex-col h-full">
        <form id="articleForm" method="POST" use:enhance={handleEnhance} novalidate class="p-6 flex-1 bg-surface-base/20 rounded-3xl">
          <input type="hidden" name="co_art_ori" value={data.article?.co_art || ""} />
          <input type="hidden" name="is_new" value={isEditing ? 'false' : 'true'} />
          <input type="hidden" name="imageBase64" value={imageBase64} />

          <!-- TAB 0: GENERAL -->
          <div class:hidden={activeTab !== 0}>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div class="space-y-2 lg:col-span-1">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted flex gap-1">Código <span class="text-brand-500">*</span>{#if isEditing}<Lock size={10} class="text-text-muted/40 ml-1" />{/if}</label>
                <div class="relative">
                  <input type="text" name="co_art" bind:value={co_art} readonly={isEditing} required maxlength="30" class="w-full bg-surface-base h-12 px-4 {isEditing ? 'pr-10' : ''} rounded-xl border border-border-subtle outline-none font-mono text-sm transition-all uppercase {isEditing ? 'opacity-60 cursor-not-allowed bg-surface-raised !border-white/5 select-none' : 'focus:border-brand-500'}" placeholder="Ej: 0101001001" />
                  {#if isEditing}<Lock size={16} class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted/40" />{/if}
                </div>
              </div>
              <div class="space-y-2 lg:col-span-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted flex gap-1">Descripción <span class="text-brand-500">*</span></label>
                <input type="text" name="art_des" bind:value={art_des} required maxlength="60" class="w-full bg-surface-base h-12 px-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm transition-all" placeholder="Nombre del artículo" />
              </div>
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Tipo</label>
                <select name="tipo" bind:value={tipo} class="w-full bg-surface-base h-12 px-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm transition-all">
                  <option value="V">Venta</option><option value="S">Servicio</option><option value="C">Consumo</option>
                </select>
              </div>
              <!-- Línea -->
              <div class="space-y-2 relative">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Línea</label>
                <Combobox options={data.catalogs?.lineas.map(c => ({value: c.co_lin, label: `${c.co_lin} - ${c.lin_des}`})) || []} bind:value={co_lin} name="co_lin" placeholder="Línea..." class="w-full h-12" />
              </div>
              <!-- Sub-Línea (filtrada) -->
              <div class="space-y-2 relative">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Sub-Línea {#if co_lin}<span class="text-brand-500/60 text-[9px]">({filteredSublineas.length})</span>{/if}</label>
                <Combobox options={filteredSublineas.map(c => ({value: c.co_subl, label: `${c.co_subl} - ${c.subl_des}`})) || []} bind:value={co_subl} name="co_subl" placeholder="Sub-Línea..." class="w-full h-12" />
              </div>
              <!-- Categoría (filtrada) -->
              <div class="space-y-2 relative">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Categoría {#if co_subl}<span class="text-brand-500/60 text-[9px]">({filteredCategorias().length})</span>{/if}</label>
                <Combobox options={filteredCategorias().map(c => ({value: c.co_cat, label: `${c.co_cat} - ${c.cat_des}`})) || []} bind:value={co_cat} name="co_cat" placeholder="Categoría..." class="w-full h-12" />
              </div>
              <!-- Color -->
              <div class="space-y-2 relative">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Color</label>
                <Combobox options={data.catalogs?.colores?.map(c => ({value: c.co_color, label: `${c.co_color} - ${c.des_color}`})) || []} bind:value={co_color} name="co_color" placeholder="Color..." class="w-full h-12" />
              </div>
              <!-- Unidad Primaria -->
              <div class="space-y-2 relative">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Unidad de Medida <span class="text-brand-500">*</span></label>
                <Combobox options={data.catalogs?.unidades.map(u => ({value: u.co_uni, label: `${u.co_uni} - ${u.des_uni}`})) || []} bind:value={co_uni} name="co_uni" placeholder="Unidad principal..." class="w-full h-12" />
              </div>
              <!-- Procedencia -->
              <div class="space-y-2 relative">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Procedencia</label>
                <Combobox options={data.catalogs?.procedencias?.map(c => ({value: c.cod_proc, label: `${c.cod_proc} - ${c.des_proc}`})) || []} bind:value={cod_proc} name="cod_proc" placeholder="Procedencia..." class="w-full h-12" />
              </div>
              <!-- Modelo / Ref -->
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Modelo</label>
                <input type="text" name="modelo" bind:value={modelo} maxlength="20" class="w-full bg-surface-base h-12 px-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm transition-all" placeholder="Modelo..." />
              </div>
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Referencia</label>
                <input type="text" name="ref" bind:value={referencia} maxlength="20" class="w-full bg-surface-base h-12 px-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm transition-all" placeholder="Referencia..." />
              </div>
            </div>

            <div class="flex justify-end mt-6">
              <button type="button" onclick={() => activeTab = 1} class="px-6 py-3 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl flex items-center gap-2 transition-all">
                Siguiente <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <!-- TAB 1: ADICIONAL -->
          <div class:hidden={activeTab !== 1}>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <!-- ADICIONAL: Peso, Volumen, Min, Max, Garantia, Comentario -->
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Peso</label>
                <input type="number" step="0.01" name="peso" bind:value={peso} class="w-full bg-surface-base h-12 px-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm font-mono text-right" />
              </div>
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Volumen</label>
                <input type="number" step="0.01" name="volumen" bind:value={volumen} class="w-full bg-surface-base h-12 px-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm font-mono text-right" />
              </div>
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Existencia Mínima</label>
                <input type="number" step="0.01" name="stock_min" bind:value={stock_min} class="w-full bg-surface-base h-12 px-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm font-mono text-right" />
              </div>
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Existencia Máxima</label>
                <input type="number" step="0.01" name="stock_max" bind:value={stock_max} class="w-full bg-surface-base h-12 px-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm font-mono text-right" />
              </div>
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Garantía (Días)</label>
                <input type="number" step="1" name="garantia" bind:value={garantia} class="w-full bg-surface-base h-12 px-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm font-mono text-right" placeholder="0" />
              </div>
              <div class="space-y-2">
                <label class="text-xs uppercase font-black tracking-widest text-text-muted">Comentario del Artículo</label>
                <textarea name="comentario" bind:value={comentario} class="w-full bg-surface-base h-12 px-4 py-3 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm transition-all resize-none"></textarea>
              </div>
            </div>

            <div class="flex justify-between mt-6">
              <button type="button" onclick={() => activeTab = 0} class="px-6 py-3 bg-surface-base hover:bg-surface-soft border border-border-subtle text-text-muted font-bold rounded-xl flex items-center gap-2 transition-all">
                <ArrowLeft size={18} /> Anterior
              </button>
              <button type="button" onclick={() => activeTab = 2} class="px-6 py-3 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl flex items-center gap-2 transition-all">
                Siguiente <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <!-- TAB 2: VENTA -->
          <div class:hidden={activeTab !== 2}>
            <div class="flex flex-col gap-6">
              
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <!-- IVA -->
                <div class="space-y-2">
                  <label class="text-xs uppercase font-black tracking-widest text-text-muted">I.V.A.</label>
                  <select name="tipo_imp" bind:value={tipo_imp} class="w-full bg-surface-base h-12 px-4 rounded-xl border border-border-subtle focus:border-brand-500 outline-none text-sm transition-all">
                    <option value="1">Tasa General</option>
                    <option value="4">Exento</option>
                    <option value="2">Tasa Reducida</option>
                    <option value="3">Tasa Suntuaria</option>
                  </select>
                </div>
              </div>

              <!-- Márgenes Dinámicos -->
              <div class="space-y-4">
                <div class="flex items-center justify-between">
                  <h3 class="text-xs uppercase font-black tracking-widest text-text-muted">Márgenes de Precio</h3>
                  {#if availablePriceTypes.length > 0}
                    <button type="button" onclick={addPriceEntry} class="h-9 px-4 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all active:scale-95 shadow-md shadow-brand-600/20">
                      <Plus size={14} /> Agregar Margen
                    </button>
                  {/if}
                </div>

                {#if priceEntries.length === 0}
                  <div class="text-center py-10 border border-dashed border-white/10 rounded-2xl bg-surface-base/30">
                    <DollarSign size={36} class="mx-auto mb-3 text-text-muted/30" />
                    <p class="text-sm text-text-muted/60 font-medium">Sin márgenes configurados</p>
                    <p class="text-xs text-text-muted/40 mt-1">Presiona "Agregar Margen" para establecer precios de venta.</p>
                  </div>
                {:else}
                  <div class="flex flex-col gap-3">
                    {#each priceEntries as entry, i}
                      <div class="flex items-center gap-3 bg-surface-base/60 border border-border-subtle rounded-xl p-3 group hover:border-brand-500/30 transition-all" in:fade={{duration: 150}}>
                        <select bind:value={entry.tipo} class="bg-surface-raised h-10 px-3 rounded-lg border border-border-subtle focus:border-brand-500 outline-none text-sm font-bold transition-all min-w-[140px]">
                          {#each ['1','2','3','4','5'] as t}
                            {#if t === entry.tipo || !usedPriceTypes.includes(t)}
                              <option value={t}>Precio {t}</option>
                            {/if}
                          {/each}
                        </select>
                        <div class="relative flex-1">
                          <input type="number" step="0.01" min="0" max="1000" bind:value={entry.margen} class="w-full bg-surface-base h-10 px-3 pr-8 rounded-lg border border-border-subtle focus:border-brand-500 outline-none text-sm font-mono text-right transition-all" placeholder="0" />
                          <Percent size={14} class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted/50" />
                        </div>
                        <button type="button" onclick={() => removePriceEntry(i)} class="h-10 w-10 flex items-center justify-center rounded-lg text-text-muted/40 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all">
                          <Trash2 size={16} />
                        </button>
                        <input type="hidden" name={`margen_${entry.tipo}`} value={entry.margen} />
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

              <div class="flex justify-between mt-2">
                <button type="button" onclick={() => activeTab = 1} class="px-6 py-3 bg-surface-base hover:bg-surface-soft border border-border-subtle text-text-muted font-bold rounded-xl flex items-center gap-2 transition-all">
                  <ArrowLeft size={18} /> Anterior
                </button>
                <button type="submit" disabled={loading} class="px-8 py-3 bg-brand-600 hover:bg-brand-500 shadow-lg shadow-brand-600/20 text-white font-bold rounded-xl flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50">
                  {#if loading}<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>{:else}<Check size={18} />{/if}
                  Guardar Artículo
                </button>
              </div>
            </div>
          </div>

        </form>
      </div>
    </div>
  </div>
</div>
