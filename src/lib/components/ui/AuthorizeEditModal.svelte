<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import {
    ShieldCheck,
    KeyRound,
    Lock,
    X,
    Loader2,
    UserCheck,
    AlertCircle,
    Check,
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";

  interface Authorizer {
    id: string;
    email: string;
    full_name: string;
    roles: string[];
  }

  let {
    open = $bindable(false),
    module,
    branchId = "",
    title = "Autorización Requerida",
    description = "",
    fieldLabel = "Nuevo Monto",
    currencySymbol = "Bs.",
    initialValue = 0,
    recordId = "",
    currentUserEmail = "",
    onAuthorized,
    onCancel,
  }: {
    open: boolean;
    module: string;
    branchId?: string;
    title?: string;
    description?: string;
    fieldLabel?: string;
    currencySymbol?: string;
    initialValue?: number;
    recordId?: string;
    currentUserEmail?: string;
    onAuthorized: (
      newValue: number,
      authorizer: { email: string; full_name: string }
    ) => void | Promise<void>;
    onCancel?: () => void;
  } = $props();

  let authorizers = $state<Authorizer[]>([]);
  let loadingAuthorizers = $state(false);
  let selectedEmail = $state("");
  let password = $state("");
  let newValue = $state<number>(0);
  let submitting = $state(false);
  let errorMsg = $state("");
  let lastOpenedKey = "";

  $effect(() => {
    if (open) {
      const openKey = `${module}_${branchId}_${initialValue}_${recordId}`;
      if (lastOpenedKey !== openKey) {
        lastOpenedKey = openKey;
        newValue = Number(initialValue || 0);
        password = "";
        errorMsg = "";
        loadAuthorizers();
      }
    } else {
      lastOpenedKey = "";
    }
  });

  async function loadAuthorizers() {
    loadingAuthorizers = true;
    errorMsg = "";
    try {
      const params = new URLSearchParams();
      params.set("module", module);
      if (branchId) params.set("branch_id", branchId);

      const res = await fetch(`/api/auth/authorize-edit?${params.toString()}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.authorizers)) {
        authorizers = json.authorizers;
        const currMatch = authorizers.find(
          (a) =>
            currentUserEmail &&
            a.email.toLowerCase() === currentUserEmail.trim().toLowerCase()
        );
        selectedEmail = currMatch?.email || authorizers[0]?.email || "";
      } else {
        authorizers = [];
        errorMsg = json.message || "No se pudieron cargar los usuarios autorizadores.";
      }
    } catch (err: any) {
      authorizers = [];
      errorMsg = err?.message || "Error consultando autorizadores.";
    } finally {
      loadingAuthorizers = false;
    }
  }

  function close() {
    if (submitting) return;
    open = false;
    onCancel?.();
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    errorMsg = "";

    const parsedValue = Number(newValue);
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      errorMsg = "Ingresa un monto numérico válido mayor o igual a cero.";
      return;
    }

    if (!selectedEmail.trim()) {
      errorMsg = "Selecciona o ingresa el correo del usuario autorizador.";
      return;
    }

    if (!password) {
      errorMsg = "Ingresa la contraseña del usuario autorizador.";
      return;
    }

    submitting = true;
    try {
      const res = await fetch("/api/auth/authorize-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module,
          branch_id: branchId,
          authorizer_email: selectedEmail.trim(),
          password,
          description,
          metadata: {
            record_id: recordId || undefined,
            previous_value: Number(initialValue || 0),
            new_value: parsedValue,
            currency: currencySymbol,
          },
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        errorMsg = json.message || "Autorización rechazada.";
        return;
      }

      toast.success(
        `Edición autorizada por ${json.authorizer?.full_name || selectedEmail}`
      );
      open = false;
      await onAuthorized(parsedValue, json.authorizer);
    } catch (err: any) {
      errorMsg = err?.message || "Error de conexión validando autorización.";
    } finally {
      submitting = false;
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md text-text-base"
    transition:fade={{ duration: 150 }}
    onmousedown={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <div
      class="bg-surface-raised w-full max-w-md rounded-[32px] border border-amber-500/30 shadow-2xl overflow-hidden"
      transition:fly={{ y: 24, duration: 220 }}
      onmousedown={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === "Escape" && close()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <!-- Header -->
      <div
        class="p-6 border-b border-border-subtle bg-amber-500/5 flex items-start justify-between gap-4"
      >
        <div class="flex items-center gap-3.5">
          <div
            class="h-12 w-12 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0"
          >
            <KeyRound size={22} />
          </div>
          <div>
            <h3 class="text-lg font-black text-text-base leading-tight">
              {title}
            </h3>
            {#if description}
              <p class="text-xs text-text-muted mt-0.5 leading-snug">
                {description}
              </p>
            {/if}
          </div>
        </div>
        <button
          type="button"
          onclick={close}
          disabled={submitting}
          class="p-2 rounded-xl text-text-muted hover:text-text-base hover:bg-surface-soft transition-colors cursor-pointer disabled:opacity-40"
        >
          <X size={20} />
        </button>
      </div>

      <!-- Body -->
      <form onsubmit={handleSubmit} class="p-6 space-y-4">
        {#if errorMsg}
          <div
            class="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs font-bold flex items-start gap-2"
          >
            <AlertCircle size={15} class="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        {/if}

        <!-- Nuevo Valor -->
        <div class="space-y-1.5">
          <label
            for="auth-new-value"
            class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1 flex items-center justify-between"
          >
            <span>{fieldLabel}</span>
            <span class="font-mono text-brand-400">
              Actual: {currencySymbol} {Number(initialValue || 0).toLocaleString("de-DE", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </label>
          <div class="relative">
            <span
              class="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-text-muted font-mono"
            >
              {currencySymbol}
            </span>
            <input
              id="auth-new-value"
              type="number"
              step="0.01"
              min="0"
              required
              bind:value={newValue}
              class="w-full h-12 bg-surface-base border border-border-bold rounded-2xl pl-12 pr-4 text-right font-mono font-black text-base text-text-base focus:border-amber-500 outline-none transition-all"
            />
          </div>
        </div>

        <!-- Selector de Usuario Autorizador -->
        <div class="space-y-1.5">
          <label
            for="auth-user-select"
            class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1 flex items-center gap-1.5"
          >
            <UserCheck size={12} class="text-amber-400" />
            Usuario Autorizador (con permiso Autorizar)
          </label>
          {#if loadingAuthorizers}
            <div
              class="h-12 bg-surface-base border border-border-subtle rounded-2xl px-4 flex items-center gap-2 text-xs text-text-muted"
            >
              <Loader2 size={15} class="animate-spin text-amber-400" />
              <span>Consultando usuarios autorizados...</span>
            </div>
          {:else if authorizers.length > 0}
            <select
              id="auth-user-select"
              bind:value={selectedEmail}
              required
              class="w-full h-12 bg-surface-base border border-border-bold rounded-2xl px-4 text-xs font-bold text-text-base focus:border-amber-500 outline-none transition-all cursor-pointer"
            >
              {#each authorizers as authUser}
                <option value={authUser.email}>
                  {authUser.full_name} ({authUser.email}){authUser.roles?.length
                    ? ` · ${authUser.roles.join(", ")}`
                    : ""}
                </option>
              {/each}
            </select>
          {:else}
            <div class="space-y-1.5">
              <input
                id="auth-user-select"
                type="email"
                required
                placeholder="correo@autorizador.com"
                bind:value={selectedEmail}
                class="w-full h-12 bg-surface-base border border-border-bold rounded-2xl px-4 text-xs text-text-base focus:border-amber-500 outline-none transition-all"
              />
              <p class="text-[10px] text-amber-400/90 px-1">
                No se detectaron otros usuarios con el permiso "Autorizar" activo en esta sucursal.
              </p>
            </div>
          {/if}
        </div>

        <!-- Contraseña del Autorizador -->
        <div class="space-y-1.5">
          <label
            for="auth-password"
            class="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1 flex items-center gap-1.5"
          >
            <Lock size={12} class="text-amber-400" />
            Clave del Autorizador
          </label>
          <div class="relative">
            <Lock
              size={16}
              class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted opacity-50"
            />
            <input
              id="auth-password"
              type="password"
              required
              placeholder="Contraseña web del autorizador..."
              bind:value={password}
              autocomplete="off"
              class="w-full h-12 bg-surface-base border border-border-bold rounded-2xl pl-11 pr-4 text-sm text-text-base focus:border-amber-500 outline-none transition-all font-mono"
            />
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-3 pt-2">
          <button
            type="button"
            onclick={close}
            disabled={submitting}
            class="flex-1 h-12 rounded-2xl font-bold text-xs bg-surface-soft hover:bg-surface-strong text-text-muted hover:text-text-base border border-border-subtle transition-all cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting || loadingAuthorizers}
            class="flex-1 h-12 rounded-2xl font-black text-xs bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {#if submitting}
              <Loader2 size={16} class="animate-spin" />
              <span>Verificando...</span>
            {:else}
              <ShieldCheck size={16} />
              <span>Autorizar y Aplicar</span>
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

