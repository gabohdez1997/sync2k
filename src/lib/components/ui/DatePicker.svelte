<!-- src/lib/components/ui/DatePicker.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { fade, slide, scale } from "svelte/transition";
  import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    X,
    Sparkles,
    Check
  } from "lucide-svelte";
  import dayjs from "dayjs";
  import "dayjs/locale/es";

  dayjs.locale("es");

  interface Props {
    value?: string; // Formato YYYY-MM-DD
    max?: string; // Formato YYYY-MM-DD
    min?: string; // Formato YYYY-MM-DD
    placeholder?: string;
    label?: string;
    onchange?: (val: string) => void;
    class?: string;
  }

  let {
    value = $bindable(dayjs().format("YYYY-MM-DD")),
    max = undefined,
    min = undefined,
    placeholder = "Selecciona una fecha",
    label = undefined,
    onchange = undefined,
    class: customClass = ""
  }: Props = $props();

  let isOpen = $state(false);
  let containerRef = $state<HTMLDivElement | null>(null);
  let openDirection = $state<"down" | "up">("down");
  let alignDirection = $state<"left" | "right">("left");

  // Fecha visible en el calendario (año y mes)
  let viewDate = $state(value ? dayjs(value) : dayjs());

  // Sincronizar viewDate cuando cambie el value externamente
  $effect(() => {
    if (value && dayjs(value).isValid()) {
      viewDate = dayjs(value);
    }
  });

  const weekDays = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

  // Matriz de días del mes
  let daysMatrix = $derived.by(() => {
    const startOfMonth = viewDate.startOf("month");
    const endOfMonth = viewDate.endOf("month");

    // En Dayjs: 0 es Domingo, 1 es Lunes... ajustamos para que la semana empiece en Lunes (0)
    let startDayOfWeek = startOfMonth.day() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const days = [];

    // Días del mes anterior para rellenar
    const prevMonth = viewDate.subtract(1, "month");
    const prevMonthDaysCount = prevMonth.daysInMonth();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonth.date(prevMonthDaysCount - i);
      days.push({
        date: d,
        isCurrentMonth: false,
        dateStr: d.format("YYYY-MM-DD")
      });
    }

    // Días del mes actual
    const currentMonthDaysCount = viewDate.daysInMonth();
    for (let i = 1; i <= currentMonthDaysCount; i++) {
      const d = viewDate.date(i);
      days.push({
        date: d,
        isCurrentMonth: true,
        dateStr: d.format("YYYY-MM-DD")
      });
    }

    // Días del mes siguiente para completar cuadrícula de 35 o 42
    const totalSlots = days.length > 35 ? 42 : 35;
    const nextMonth = viewDate.add(1, "month");
    let nextMonthDay = 1;
    while (days.length < totalSlots) {
      const d = nextMonth.date(nextMonthDay++);
      days.push({
        date: d,
        isCurrentMonth: false,
        dateStr: d.format("YYYY-MM-DD")
      });
    }

    return days;
  });

  function isDateDisabled(dateStr: string) {
    if (max && dateStr > max) return true;
    if (min && dateStr < min) return true;
    return false;
  }

  function selectDate(dateStr: string) {
    if (isDateDisabled(dateStr)) return;
    value = dateStr;
    viewDate = dayjs(dateStr);
    isOpen = false;
    if (onchange) onchange(dateStr);
  }

  function calculatePosition() {
    if (!containerRef || typeof window === "undefined") return;
    const rect = containerRef.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const requiredHeight = 360;

    // Si el espacio abajo es menor que el requerido y arriba hay más espacio, abrir hacia arriba
    if (spaceBelow < requiredHeight && spaceAbove > spaceBelow) {
      openDirection = "up";
    } else {
      openDirection = "down";
    }

    // Ajustar si se desborda horizontalmente hacia la derecha
    if (rect.left + 350 > window.innerWidth) {
      alignDirection = "right";
    } else {
      alignDirection = "left";
    }
  }

  function toggleDropdown() {
    if (!isOpen) {
      calculatePosition();
    }
    isOpen = !isOpen;
  }

  function prevMonth() {
    viewDate = viewDate.subtract(1, "month");
  }

  function nextMonth() {
    const nextM = viewDate.add(1, "month").startOf("month");
    if (max && nextM.format("YYYY-MM-DD") > max && nextM.month() !== dayjs(max).month()) {
      return;
    }
    viewDate = viewDate.add(1, "month");
  }

  function prevYear() {
    viewDate = viewDate.subtract(1, "year");
  }

  function nextYear() {
    const nextY = viewDate.add(1, "year").startOf("year");
    if (max && nextY.format("YYYY-MM-DD") > max) return;
    viewDate = viewDate.add(1, "year");
  }

  // Atajos rápidos
  function selectToday() {
    const today = dayjs().format("YYYY-MM-DD");
    selectDate(today);
  }

  function selectYesterday() {
    const yesterday = dayjs().subtract(1, "day").format("YYYY-MM-DD");
    selectDate(yesterday);
  }

  function selectDaysAgo(num: number) {
    const target = dayjs().subtract(num, "day").format("YYYY-MM-DD");
    selectDate(target);
  }

  // Manejador de click fuera
  function handleClickOutside(event: MouseEvent) {
    if (containerRef && !containerRef.contains(event.target as Node)) {
      isOpen = false;
    }
  }

  onMount(() => {
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", calculatePosition);
    window.addEventListener("scroll", calculatePosition, true);
  });

  onDestroy(() => {
    if (typeof document !== "undefined") {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", calculatePosition);
      window.removeEventListener("scroll", calculatePosition, true);
    }
  });

  let displayLabel = $derived.by(() => {
    if (!value || !dayjs(value).isValid()) return placeholder;
    const d = dayjs(value);
    const today = dayjs().format("YYYY-MM-DD");
    const yesterday = dayjs().subtract(1, "day").format("YYYY-MM-DD");

    if (value === today) return `Hoy, ${d.format("DD [de] MMMM YYYY")}`;
    if (value === yesterday) return `Ayer, ${d.format("DD [de] MMMM YYYY")}`;
    return d.format("dddd, DD [de] MMMM YYYY");
  });
</script>

<div class="relative inline-block w-full {customClass}" bind:this={containerRef}>
  {#if label}
    <label class="block text-xs font-black uppercase tracking-wider text-text-muted mb-2 flex items-center gap-2">
      <CalendarIcon size={14} class="text-brand-400" />
      {label}
    </label>
  {/if}

  <!-- Botón Trigger -->
  <button
    type="button"
    onclick={toggleDropdown}
    class="w-full h-14 bg-surface-raised hover:bg-surface-soft border {isOpen
      ? 'border-brand-500 ring-2 ring-brand-500/20'
      : 'border-border-subtle hover:border-brand-500/40'} rounded-2xl px-4 flex items-center justify-between gap-3 text-left transition-all duration-200 cursor-pointer group shadow-sm relative z-10"
  >
    <div class="flex items-center gap-3 min-w-0">
      <div
        class="h-9 w-9 rounded-xl flex items-center justify-center {isOpen
          ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30'
          : 'bg-surface-soft text-brand-400 group-hover:bg-brand-500/10'} transition-all"
      >
        <CalendarIcon size={18} />
      </div>

      <div class="truncate">
        <span class="text-[10px] font-black uppercase tracking-widest text-text-muted/70 block">
          Fecha seleccionada
        </span>
        <span class="text-sm font-bold text-text-base capitalize block truncate">
          {displayLabel}
        </span>
      </div>
    </div>

    <div class="flex items-center gap-1.5 shrink-0 text-text-muted group-hover:text-brand-400 transition-colors">
      <span class="text-xs font-mono font-bold bg-surface-soft border border-border-subtle px-2 py-1 rounded-lg">
        {value || "--/--/----"}
      </span>
    </div>
  </button>

  <!-- POPUP DROPDOWN CALENDARIO -->
  {#if isOpen}
    <div
      transition:scale={{ duration: 180, start: 0.95 }}
      class="absolute z-[100] w-full min-w-[320px] sm:min-w-[360px] max-w-[390px] border border-border-bold rounded-3xl p-5 shadow-2xl space-y-4
        {openDirection === 'up' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]'}
        {alignDirection === 'right' ? 'right-0' : 'left-0'}
      "
      style="background-color: var(--bg-secondary, #0e1017); box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.12);"
    >
      <!-- HEADER DEL CALENDARIO: Mes y Año con flechas de navegación -->
      <div class="flex items-center justify-between gap-2 border-b border-border-subtle pb-3">
        <!-- Navegación Año Anterior / Mes Anterior -->
        <div class="flex items-center gap-1">
          <button
            type="button"
            onclick={prevYear}
            class="p-2 rounded-xl hover:bg-surface-soft text-text-muted hover:text-text-base transition-colors cursor-pointer"
            title="Año anterior"
          >
            <ChevronsLeft size={16} />
          </button>
          <button
            type="button"
            onclick={prevMonth}
            class="p-2 rounded-xl hover:bg-surface-soft text-text-muted hover:text-text-base transition-colors cursor-pointer"
            title="Mes anterior"
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        <!-- Título del Mes y Año -->
        <div class="text-center font-black text-sm text-text-base capitalize flex items-center gap-1.5">
          <span class="text-brand-400">{viewDate.format("MMMM")}</span>
          <span class="text-text-muted font-bold font-mono">{viewDate.format("YYYY")}</span>
        </div>

        <!-- Navegación Mes Siguiente / Año Siguiente -->
        <div class="flex items-center gap-1">
          <button
            type="button"
            onclick={nextMonth}
            class="p-2 rounded-xl hover:bg-surface-soft text-text-muted hover:text-text-base transition-colors cursor-pointer"
            title="Mes siguiente"
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onclick={nextYear}
            class="p-2 rounded-xl hover:bg-surface-soft text-text-muted hover:text-text-base transition-colors cursor-pointer"
            title="Año siguiente"
          >
            <ChevronsRight size={16} />
          </button>
        </div>
      </div>

      <!-- DÍAS DE LA SEMANA -->
      <div class="grid grid-cols-7 gap-1 text-center">
        {#each weekDays as wd}
          <span class="text-[11px] font-black uppercase text-text-muted/60 py-1">
            {wd}
          </span>
        {/each}
      </div>

      <!-- MATRIZ DE DÍAS -->
      <div class="grid grid-cols-7 gap-1">
        {#each daysMatrix as dayItem}
          {@const isSelected = value === dayItem.dateStr}
          {@const isToday = dayItem.dateStr === dayjs().format("YYYY-MM-DD")}
          {@const isDisabled = isDateDisabled(dayItem.dateStr)}

          <button
            type="button"
            disabled={isDisabled}
            onclick={() => selectDate(dayItem.dateStr)}
            class="h-9 w-full rounded-xl text-xs font-bold font-mono flex items-center justify-center relative transition-all duration-150 cursor-pointer
              {isDisabled ? 'opacity-20 cursor-not-allowed' : ''}
              {!dayItem.isCurrentMonth && !isSelected ? 'text-text-muted/30 hover:bg-surface-soft/40' : ''}
              {dayItem.isCurrentMonth && !isSelected ? 'text-text-base hover:bg-brand-500/10 hover:text-brand-400' : ''}
              {isToday && !isSelected ? 'border border-brand-500/50 text-brand-400 font-black' : ''}
              {isSelected ? 'bg-brand-500 text-white font-black shadow-md shadow-brand-500/30 scale-105 z-10' : ''}
            "
          >
            {dayItem.date.date()}

            {#if isToday && !isSelected}
              <span class="absolute bottom-1 w-1 h-1 rounded-full bg-brand-400"></span>
            {/if}
          </button>
        {/each}
      </div>

      <!-- ATAJOS RÁPIDOS INFERIORES -->
      <div class="pt-3 border-t border-border-subtle flex flex-wrap items-center justify-between gap-1.5">
        <button
          type="button"
          onclick={selectToday}
          class="px-2.5 py-1 rounded-lg bg-surface-soft hover:bg-surface-strong text-[10px] font-bold text-text-muted hover:text-brand-400 transition-colors cursor-pointer"
        >
          Hoy
        </button>
        <button
          type="button"
          onclick={selectYesterday}
          class="px-2.5 py-1 rounded-lg bg-surface-soft hover:bg-surface-strong text-[10px] font-bold text-text-muted hover:text-brand-400 transition-colors cursor-pointer"
        >
          Ayer
        </button>
        <button
          type="button"
          onclick={() => selectDaysAgo(7)}
          class="px-2.5 py-1 rounded-lg bg-surface-soft hover:bg-surface-strong text-[10px] font-bold text-text-muted hover:text-brand-400 transition-colors cursor-pointer"
        >
          -7 días
        </button>
        <button
          type="button"
          onclick={() => selectDaysAgo(30)}
          class="px-2.5 py-1 rounded-lg bg-surface-soft hover:bg-surface-strong text-[10px] font-bold text-text-muted hover:text-brand-400 transition-colors cursor-pointer"
        >
          -30 días
        </button>
        <button
          type="button"
          onclick={() => (isOpen = false)}
          class="px-2.5 py-1 rounded-lg hover:bg-surface-soft text-[10px] font-bold text-text-muted hover:text-red-400 transition-colors cursor-pointer ml-auto"
        >
          Cerrar
        </button>
      </div>
    </div>
  {/if}
</div>
