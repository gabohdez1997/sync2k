import pg from 'pg';
import { env } from '$env/dynamic/private';

const { Pool } = pg;

// Singleton del Pool para la instancia SvelteKit
let localPool: pg.Pool | null = null;

export function getLocalPool(): pg.Pool {
  if (!localPool) {
    if (!env.LOCAL_PG_URL) {
      throw new Error('LOCAL_PG_URL no está definido en las variables de entorno.');
    }
    localPool = new Pool({
      connectionString: env.LOCAL_PG_URL,
      // Configuración extra para estabilidad
      max:         10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return localPool;
}

/**
 * Función útil para consultas rápidas sin preocuparse por la liberación del cliente
 */
export async function queryLocalDb(text: string, params?: any[]) {
  const pool = getLocalPool();
  return pool.query(text, params);
}
