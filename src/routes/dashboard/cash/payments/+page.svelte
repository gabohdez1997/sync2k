<!-- src/routes/dashboard/cash/payments/+page.svelte -->
<script lang="ts">
  import { Wallet, Search, Filter, Plus } from 'lucide-svelte';
  let { data } = $props();
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
        <Wallet size={40} class="text-amber-500" />
        {data.title}
      </h1>
      <p class="text-text-muted mt-2 text-lg">Registro y conciliación de pagos de clientes.</p>
    </div>
    
    <button class="flex items-center justify-center gap-3 bg-amber-600 hover:bg-amber-500 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-amber-500/20 transition-all active:scale-95">
      <Plus size={20} />
      Nuevo Cobro
    </button>
  </div>

  <div class="glass p-12 rounded-[40px] border border-white/5 flex flex-col items-center justify-center text-center space-y-4 min-h-[400px]">
    <div class="h-20 w-20 rounded-3xl bg-white/5 flex items-center justify-center text-text-muted/20">
      <Wallet size={48} />
    </div>
    <h2 class="text-2xl font-bold text-text-muted">Sin movimientos registrados</h2>
    <p class="text-text-muted/60 max-w-sm">Los cobros aparecerán aquí una vez se sincronice la cartera de clientes.</p>
  </div>
</div>
