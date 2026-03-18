<!-- src/routes/dashboard/sales/quotes/+page.svelte -->
<script lang="ts">
  import { FileText, Search, Filter, Plus } from 'lucide-svelte';
  let { data } = $props();
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <FileText size={40} class="text-brand-500" />
        {data.title}
      </h1>
      <p class="text-text-muted mt-2 text-lg">Gestiona y consulta todas las cotizaciones del sistema Profit Plus.</p>
    </div>
    
    <button class="flex items-center justify-center gap-3 bg-brand-600 hover:bg-brand-500 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-brand-500/20 transition-all active:scale-95">
      <Plus size={20} />
      Nueva Cotización
    </button>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div class="md:col-span-2 glass p-12 rounded-[40px] border border-white/5 flex flex-col items-center justify-center text-center space-y-4 min-h-[400px]">
      <div class="h-20 w-20 rounded-3xl bg-white/5 flex items-center justify-center text-text-muted/20">
        <FileText size={48} />
      </div>
      <h2 class="text-2xl font-bold text-text-muted">No hay datos para mostrar</h2>
      <p class="text-text-muted/60 max-w-sm">Esta sección aún no ha sido vinculada al API de Profit Plus para esta empresa.</p>
    </div>

    <div class="space-y-6">
      <div class="glass p-8 rounded-[32px] border border-white/5 space-y-6">
        <h3 class="font-black uppercase tracking-widest text-xs text-brand-400">Filtros Rápidos</h3>
        <div class="space-y-4">
          <div class="h-12 bg-white/5 rounded-xl border border-white/5"></div>
          <div class="h-12 bg-white/5 rounded-xl border border-white/5"></div>
          <div class="h-12 bg-white/5 rounded-xl border border-white/5"></div>
        </div>
      </div>
    </div>
  </div>
</div>
