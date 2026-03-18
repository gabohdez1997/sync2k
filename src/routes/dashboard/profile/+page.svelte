<!-- src/routes/dashboard/profile/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { 
    User, 
    Mail, 
    Lock, 
    Save, 
    Loader2, 
    ShieldCheck, 
    KeyRound,
    AlertCircle,
    CheckCircle2
  } from 'lucide-svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let isSaving = $state(false);
  let showPassword = $state(false);

  // Reacción al form (Efecto secundario)
  $effect(() => {
    if (form?.success) {
      toast.success(form.message);
    } else if (form?.message) {
      toast.error(form.message);
    }
  });

  let profile = $derived(data.profile);
</script>

<svelte:head>
  <title>Mi Perfil | Sync2K</title>
</svelte:head>

<div class="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
  
  <!-- Standard Header -->
  <div class="space-y-2">
    <h1 class="text-4xl font-black tracking-tight flex items-center gap-3">
      <User size={40} class="text-brand-500" />
      Mi Perfil
    </h1>
    <p class="text-text-muted text-lg">Gestiona tu información personal y configuración de seguridad.</p>
  </div>
  
  <!-- Header Section -->
  <div class="flex flex-col md:flex-row items-center gap-8 bg-linear-to-br from-brand-600/10 to-indigo-600/10 p-8 rounded-[40px] border border-white/5 glass">
    <div class="relative">
      <div class="h-32 w-32 rounded-[32px] bg-linear-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white text-5xl font-black shadow-2xl shadow-brand-500/40">
        {profile?.full_name?.[0] ?? 'U'}
      </div>
      <div class="absolute -bottom-2 -right-2 bg-green-500 text-white p-2 rounded-2xl shadow-lg border-4 border-surface-base">
        <ShieldCheck size={20} />
      </div>
    </div>
    
    <div class="text-center md:text-left space-y-2">
      <h1 class="text-3xl md:text-4xl font-black tracking-tight">{profile?.full_name}</h1>
      <p class="text-text-muted flex items-center justify-center md:justify-start gap-2">
        <Mail size={16} />
        {profile?.email}
      </p>
      <div class="flex flex-wrap gap-2 justify-center md:justify-start pt-2">
        {#each (profile?.roles ?? []) as role}
          <span class="px-3 py-1 rounded-full bg-brand-500/10 text-brand-400 text-[10px] font-black uppercase tracking-widest border border-brand-500/20">
            {role.name}
          </span>
        {/each}
      </div>
    </div>
  </div>

  <form 
    method="POST" 
    action="?/updateProfile"
    use:enhance={() => {
      isSaving = true;
      return async ({ update }) => {
        await update();
        isSaving = false;
      };
    }}
    class="grid grid-cols-1 md:grid-cols-3 gap-8"
  >
    <!-- Left Col: Personal Info -->
    <div class="md:col-span-2 space-y-6">
      <div class="glass p-8 rounded-[32px] border border-white/5 space-y-6">
        <div class="flex items-center gap-3 text-brand-400">
          <User size={20} />
          <h2 class="text-sm font-black uppercase tracking-widest">Información Personal</h2>
        </div>

        <div class="space-y-4">
          <div class="space-y-2">
            <label class="text-xs font-bold text-text-muted ml-1" for="full_name">Nombre Completo</label>
            <div class="relative group">
              <User class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted transition-colors group-focus-within:text-brand-500" size={20} />
              <input 
                type="text" 
                id="full_name"
                name="full_name" 
                value={profile?.full_name}
                required
                placeholder="Tu nombre aquí..."
                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-brand-500 focus:bg-brand-500/5 outline-hidden transition-all font-medium"
              />
            </div>
          </div>

          <div class="space-y-2 opacity-60">
            <label class="text-xs font-bold text-text-muted ml-1" for="email">Correo Electrónico (No editable)</label>
            <div class="relative">
              <Mail class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
              <input 
                type="email" 
                id="email"
                value={profile?.email}
                disabled
                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 outline-hidden cursor-not-allowed italic"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Action Button Desktop -->
      <div class="hidden md:flex justify-end pt-4">
        <button 
          type="submit" 
          disabled={isSaving}
          class="h-16 px-12 rounded-2xl bg-linear-to-tr from-brand-600 to-indigo-600 text-white font-black shadow-xl shadow-brand-500/20 hover:shadow-brand-500/40 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center gap-3"
        >
          {#if isSaving}
            <Loader2 size={24} class="animate-spin" />
            Guardando Cambios...
          {:else}
            <Save size={24} />
            Actualizar Perfil
          {/if}
        </button>
      </div>
    </div>

    <!-- Right Col: Security -->
    <div class="space-y-6">
      <div class="glass p-8 rounded-[32px] border border-white/5 space-y-6">
        <div class="flex items-center gap-3 text-amber-400">
          <KeyRound size={20} />
          <h2 class="text-sm font-black uppercase tracking-widest">Seguridad</h2>
        </div>

        <div class="space-y-4">
          <p class="text-[10px] text-text-muted italic leading-relaxed">
            Deja estos campos en blanco si no deseas cambiar tu contraseña actual.
          </p>

          <div class="space-y-2">
            <label class="text-xs font-bold text-text-muted ml-1" for="password">Nueva Contraseña</label>
            <div class="relative group">
              <Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-amber-500" size={20} />
              <input 
                type={showPassword ? "text" : "password"} 
                id="password"
                name="password" 
                placeholder="••••••••"
                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-amber-500 outline-hidden transition-all font-mono"
              />
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold text-text-muted ml-1" for="confirm_password">Confirmar Contraseña</label>
            <div class="relative group">
              <Lock class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-amber-500" size={20} />
              <input 
                type={showPassword ? "text" : "password"} 
                id="confirm_password"
                name="confirm_password" 
                placeholder="••••••••"
                class="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-5 focus:border-amber-500 outline-hidden transition-all font-mono"
              />
            </div>
          </div>

          <label class="flex items-center gap-3 p-2 cursor-pointer group">
            <input type="checkbox" bind:checked={showPassword} class="hidden" />
            <div class="h-5 w-5 rounded-md border border-white/20 flex items-center justify-center transition-all group-hover:bg-white/5 {showPassword ? 'bg-amber-500 border-amber-500' : ''}">
              {#if showPassword}
                <div class="h-2 w-2 bg-white rounded-full"></div>
              {/if}
            </div>
            <span class="text-xs font-bold text-text-muted group-hover:text-text-base">Mostrar contraseñas</span>
          </label>
        </div>
      </div>

      <!-- Action Button Mobile -->
      <div class="md:hidden pt-4">
        <button 
          type="submit" 
          disabled={isSaving}
          class="w-full h-16 rounded-2xl bg-linear-to-tr from-brand-600 to-indigo-600 text-white font-black shadow-xl shadow-brand-500/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
        >
          {#if isSaving}
            <Loader2 size={24} class="animate-spin" />
            Guardando...
          {:else}
            <Save size={24} />
            Actualizar Perfil
          {/if}
        </button>
      </div>
    </div>
  </form>

  <!-- Security Advice -->
  <div class="flex items-start gap-4 p-6 rounded-[24px] bg-blue-500/5 border border-blue-500/10">
    <div class="p-2 bg-blue-500/10 rounded-xl text-blue-400">
      <AlertCircle size={20} />
    </div>
    <div>
      <h4 class="text-sm font-bold text-blue-300">Consejo de Seguridad</h4>
      <p class="text-xs text-blue-300/60 leading-relaxed mt-1">
        Usa una contraseña fuerte de al menos 8 caracteres que incluya letras, números y símbolos. 
        Nunca compartas tus credenciales de acceso con terceros.
      </p>
    </div>
  </div>

</div>

<style>
  input:focus {
    box-shadow: 0 0 20px -10px var(--brand-500);
  }
</style>
