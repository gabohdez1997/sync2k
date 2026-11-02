// src/lib/server/services/exchangeRates.ts
import { supabaseAdmin } from '$lib/server/supabase';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export interface ExchangeRateRecord {
  id?: string;
  rate: number;
  currency: string;
  source: string;
  rate_date: string; // YYYY-MM-DD
  notes?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ExchangeRateLookupResult {
  rate: number;
  rate_date: string;
  source: string;
  is_exact: boolean;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const RATES_FILE = path.join(DATA_DIR, 'exchange_rates.json');

const INITIAL_FALLBACK_RATES: ExchangeRateRecord[] = [
  {
    rate: 52.4500,
    currency: 'USD',
    source: 'Banco Central de Venezuela / BCV',
    rate_date: '2026-11-01',
    notes: 'Tasa oficial BCV noviembre 2026'
  },
  {
    rate: 51.8200,
    currency: 'USD',
    source: 'Banco Central de Venezuela / BCV',
    rate_date: '2026-10-31',
    notes: 'Tasa oficial BCV fin de mes'
  },
  {
    rate: 46.8540,
    currency: 'USD',
    source: 'Banco Central de Venezuela / BCV',
    rate_date: '2026-09-30',
    notes: 'Tasa oficial BCV septiembre 2026'
  }
];

function readLocalRates(): ExchangeRateRecord[] {
  try {
    if (fs.existsSync(RATES_FILE)) {
      const raw = fs.readFileSync(RATES_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (err) {
    console.warn('[EXCHANGE RATES] Error leyendo fallback local:', err);
  }
  return [...INITIAL_FALLBACK_RATES];
}

function saveLocalRates(rates: ExchangeRateRecord[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(RATES_FILE, JSON.stringify(rates, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[EXCHANGE RATES] Error guardando fallback local:', err);
  }
}

/**
 * Consulta la lista de tasas registradas en Supabase o en el fallback local
 */
export async function getExchangeRates(params: {
  currency?: string;
  limit?: number;
} = {}): Promise<ExchangeRateRecord[]> {
  const currency = (params.currency || 'USD').toUpperCase();
  const limit = params.limit || 365;

  try {
    const { data, error } = await supabaseAdmin
      .from('exchange_rates')
      .select('*')
      .eq('currency', currency)
      .order('rate_date', { ascending: false })
      .limit(limit);

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((d: any) => ({
        id: d.id,
        rate: Number(d.rate),
        currency: d.currency,
        source: d.source || 'BCV',
        rate_date: d.rate_date,
        notes: d.notes,
        is_active: d.is_active ?? true,
        created_at: d.created_at,
        updated_at: d.updated_at
      }));
    }
  } catch {
    // Si la tabla no existe en Supabase, recurre al fallback local
  }

  const local = readLocalRates();
  return local
    .filter(r => r.currency.toUpperCase() === currency)
    .sort((a, b) => new Date(b.rate_date).getTime() - new Date(a.rate_date).getTime());
}

/**
 * Guarda o actualiza una tasa de cambio en Supabase y localmente
 */
export async function saveExchangeRate(record: ExchangeRateRecord): Promise<ExchangeRateRecord> {
  const cleanDate = record.rate_date.includes('T') ? record.rate_date.split('T')[0] : record.rate_date;
  const item: ExchangeRateRecord = {
    ...record,
    rate: Number(record.rate),
    currency: (record.currency || 'USD').toUpperCase(),
    rate_date: cleanDate,
    updated_at: new Date().toISOString()
  };

  // 1. Guardar en local JSON
  const local = readLocalRates();
  const existingIdx = local.findIndex(r => r.rate_date === item.rate_date && r.currency === item.currency);
  if (existingIdx >= 0) {
    local[existingIdx] = { ...local[existingIdx], ...item };
  } else {
    local.push(item);
  }
  saveLocalRates(local);

  // 2. Intentar guardar en Supabase
  try {
    await supabaseAdmin
      .from('exchange_rates')
      .upsert({
        rate: item.rate,
        currency: item.currency,
        source: item.source || 'Banco Central de Venezuela / BCV',
        rate_date: item.rate_date,
        notes: item.notes,
        updated_at: item.updated_at
      }, { onConflict: 'rate_date,currency' });
  } catch {
    // Supabase no disponible o tabla no creada aún
  }

  return item;
}

/**
 * Genera un resolvedor síncrono en memoria para convertir montos por fecha de emisión de factura
 */
export async function getExchangeRateResolver(
  currency = 'USD'
): Promise<(dateStr?: string | null) => ExchangeRateLookupResult> {
  const cur = (currency || 'USD').toUpperCase();
  const rates = await getExchangeRates({ currency: cur, limit: 500 });

  return function resolveRate(dateStr?: string | null): ExchangeRateLookupResult {
    if (rates.length === 0) {
      return {
        rate: 52.45,
        rate_date: new Date().toISOString().split('T')[0],
        source: 'Default BCV',
        is_exact: false
      };
    }

    // Si no se especifica fecha, devolver la más reciente
    if (!dateStr) {
      const latest = rates[0];
      return {
        rate: latest.rate,
        rate_date: latest.rate_date,
        source: latest.source,
        is_exact: false
      };
    }

    const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : String(dateStr).slice(0, 10);

    // 1. Coincidencia exacta de fecha
    const exact = rates.find(r => r.rate_date === cleanDate);
    if (exact) {
      return {
        rate: exact.rate,
        rate_date: exact.rate_date,
        source: exact.source,
        is_exact: true
      };
    }

    // 2. Tasa anterior más cercana en el tiempo
    const targetTime = new Date(cleanDate).getTime();
    const candidate = rates.find(r => new Date(r.rate_date).getTime() <= targetTime);
    if (candidate) {
      return {
        rate: candidate.rate,
        rate_date: candidate.rate_date,
        source: candidate.source,
        is_exact: false
      };
    }

    // 3. Fallback: la más antigua disponible
    const oldest = rates[rates.length - 1];
    return {
      rate: oldest.rate,
      rate_date: oldest.rate_date,
      source: oldest.source,
      is_exact: false
    };
  };
}

