#!/usr/bin/env node
// scripts/sync-daemon.mjs
// Daemon de sincronización bidireccional entre Supabase Cloud y PostgreSQL Local.
// Diseñado para ejecutarse periódicamente (ej: cron cada 15 min o pm2).
//
// Modo Offline-First:
//   - Cloud a Local (Downsync): Perfiles, Roles, User_Roles, Branches (Cloud es maestro)
//   - Local a Cloud (Upsync): Audit Log offline

import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Cargar variables de entorno del .env en la raíz
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const { Pool } = pg;

// ─── Configuración ─────────────────────────────────────────────
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOCAL_PG_URL = process.env.LOCAL_PG_URL || 'postgresql://postgres:Galpe2021*@localhost:5432/sync2k';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Faltan credenciales de Supabase en .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const localPool = new Pool({ connectionString: LOCAL_PG_URL });

// ─── Helpers ───────────────────────────────────────────────────
async function getLastSyncTime(client, table) {
  const { rows } = await client.query(`SELECT MAX(updated_at) as last_updated FROM ${table}`);
  let last = rows[0]?.last_updated;
  if (last && last instanceof Date) return last.toISOString();
  return last || new Date(0).toISOString();
}

// ─── Lógica de Sincronización ──────────────────────────────────
async function runSync() {
  const localClient = await localPool.connect();
  let syncStatus = 'success';
  let tablesSynced = [];
  let recordsSynced = 0;
  let errorMsg = null;

  console.log(`\n[${new Date().toISOString()}] 🔄 Iniciando sincronización Cloud ↔ Local...`);

  try {
    // ==========================================
    // 1. DOWNSYNC (Cloud -> Local)
    // ==========================================
    
    // Tabla: ROLES
    console.log('   Sincronizando roles...');
    const lastRoleUpdate = await getLastSyncTime(localClient, 'roles');
    const { data: cloudRoles, error: errRoles } = await supabase
      .from('roles')
      .select('*')
      .gt('updated_at', lastRoleUpdate);

    if (errRoles) throw errRoles;

    if (cloudRoles && cloudRoles.length > 0) {
      for (const role of cloudRoles) {
        await localClient.query(`
          INSERT INTO roles (id, name, permissions, branch_ids, warehouse_ids, updated_at, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            permissions = EXCLUDED.permissions,
            branch_ids = EXCLUDED.branch_ids,
            warehouse_ids = EXCLUDED.warehouse_ids,
            updated_at = EXCLUDED.updated_at
        `, [role.id, role.name, role.permissions, role.branch_ids, role.warehouse_ids, role.updated_at, role.created_at]);
      }
      tablesSynced.push('roles');
      recordsSynced += cloudRoles.length;
      console.log(`   ✓ ${cloudRoles.length} roles sincronizados.`);
    }

    // Tabla: BRANCHES
    console.log('   Sincronizando sucursales...');
    // Obtenemos todas las sucursales de la nube para un mirror completo
    const { data: cloudBranches, error: errBranches } = await supabase
      .from('branches')
      .select('*');

    if (errBranches) throw errBranches;

    if (cloudBranches && cloudBranches.length > 0) {
      const cloudIds = cloudBranches.map(b => b.id);
      
      for (const branch of cloudBranches) {
        await localClient.query(`
          INSERT INTO branches (id, name, agent_url, agent_token, profit_branch_codes, sql_config, profit_server_id, local_dns_alias, active, sort_order, updated_at, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            agent_url = EXCLUDED.agent_url,
            agent_token = EXCLUDED.agent_token,
            profit_branch_codes = EXCLUDED.profit_branch_codes,
            sql_config = EXCLUDED.sql_config,
            profit_server_id = EXCLUDED.profit_server_id,
            local_dns_alias = EXCLUDED.local_dns_alias,
            active = EXCLUDED.active,
            sort_order = EXCLUDED.sort_order,
            updated_at = EXCLUDED.updated_at
        `, [
          branch.id, 
          branch.name, 
          branch.agent_url, 
          branch.agent_token, 
          branch.profit_branch_codes ? JSON.stringify(branch.profit_branch_codes) : '[]', 
          branch.sql_config ? JSON.stringify(branch.sql_config) : '{}', 
          branch.profit_server_id, 
          branch.local_dns_alias, 
          branch.active, 
          branch.sort_order, 
          branch.updated_at, 
          branch.created_at
        ]);
      }

      // Limpieza: Desactivar sucursales locales que ya no existen en la Nube
      const { rowCount: deactivatedCount } = await localClient.query(`
        UPDATE branches 
        SET active = false 
        WHERE id NOT IN (${cloudIds.map((_, i) => `$${i + 1}`).join(', ')})
        AND active = true
      `, cloudIds);

      if (deactivatedCount > 0) {
        console.log(`   ⚠ ${deactivatedCount} sucursales locales desactivadas (no existen en la Nube).`);
      }

      tablesSynced.push('branches');
      recordsSynced += cloudBranches.length;
      console.log(`   ✓ ${cloudBranches.length} sucursales procesadas.`);
    }

    // Tabla: SYSTEM_SETTINGS
    console.log('   Sincronizando ajustes del sistema...');
    const { data: settings, error: errSettings } = await supabase
      .from('system_settings')
      .select('*')
      .single();

    if (errSettings && errSettings.code !== 'PGRST116') throw errSettings;

    if (settings) {
      await localClient.query(`
        INSERT INTO system_settings (id, app_name, app_title, app_logo_url, app_logo_width, primary_color, footer_text, pwa_enabled, updated_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          app_name = EXCLUDED.app_name,
          app_title = EXCLUDED.app_title,
          app_logo_url = EXCLUDED.app_logo_url,
          app_logo_width = EXCLUDED.app_logo_width,
          primary_color = EXCLUDED.primary_color,
          footer_text = EXCLUDED.footer_text,
          pwa_enabled = EXCLUDED.pwa_enabled,
          updated_at = EXCLUDED.updated_at
      `, [
        settings.id, 
        settings.app_name, 
        settings.app_title, 
        settings.app_logo_url, 
        settings.app_logo_width, 
        settings.primary_color, 
        settings.footer_text, 
        settings.pwa_enabled, 
        settings.updated_at, 
        settings.created_at
      ]);
      console.log('   ✓ Ajustes del sistema sincronizados.');
      tablesSynced.push('system_settings');
    }

    // Tabla: PROFILES & USER_ROLES
    console.log('   Sincronizando perfiles de usuario...');
    const lastProfileUpdate = await getLastSyncTime(localClient, 'profiles');
    const { data: cloudProfiles, error: errProfiles } = await supabase
      .from('profiles')
      .select('*, user_roles(role_id)') // Join para traer los roles
      .gt('updated_at', lastProfileUpdate);

    if (errProfiles) throw errProfiles;

    if (cloudProfiles && cloudProfiles.length > 0) {
      await localClient.query('BEGIN'); // Transacción para consistencia
      for (const profile of cloudProfiles) {
        // Upsert Profile
        await localClient.query(`
          INSERT INTO profiles (id, full_name, email, password_hash, profit_user, profit_pass, active, updated_at, created_at, synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            email = EXCLUDED.email,
            password_hash = EXCLUDED.password_hash,
            profit_user = EXCLUDED.profit_user,
            profit_pass = EXCLUDED.profit_pass,
            active = EXCLUDED.active,
            updated_at = EXCLUDED.updated_at,
            synced_at = NOW()
        `, [profile.id, profile.full_name, profile.email, profile.password_hash, profile.profit_user, profile.profit_pass, profile.active, profile.updated_at, profile.created_at]);

        // Sincronizar roles asociados
        await localClient.query(`DELETE FROM user_roles WHERE user_id = $1`, [profile.id]);
        
        const roles = profile.user_roles || [];
        for (const ur of roles) {
          await localClient.query(`
            INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING
          `, [profile.id, ur.role_id]);
        }
      }
      await localClient.query('COMMIT');
      
      tablesSynced.push('profiles', 'user_roles');
      recordsSynced += cloudProfiles.length;
      console.log(`   ✓ ${cloudProfiles.length} perfiles sincronizados.`);
    }

    // ==========================================
    // 2. DOWNSYNC: AUDIT_LOG (Cloud -> Local)
    // ==========================================
    console.log('   Sincronizando auditoría...');
    try {
      // audit_log es inmutable (solo INSERT), usamos created_at para sync incremental
      const { rows: lastAuditRows } = await localClient.query(
        `SELECT MAX(created_at) as last_created FROM audit_log`
      );
      let lastAuditSync = lastAuditRows[0]?.last_created;
      if (lastAuditSync && lastAuditSync instanceof Date) lastAuditSync = lastAuditSync.toISOString();
      lastAuditSync = lastAuditSync || new Date(0).toISOString();

      const { data: cloudAuditLogs, error: errAudit } = await supabase
        .from('audit_log')
        .select('*')
        .gt('created_at', lastAuditSync)
        .order('created_at', { ascending: true })
        .limit(500);

      if (errAudit) throw errAudit;

      if (cloudAuditLogs && cloudAuditLogs.length > 0) {
        for (const log of cloudAuditLogs) {
          await localClient.query(`
            INSERT INTO audit_log (id, user_id, user_email, action, module, record_id, old_data, new_data, metadata, branch_id, source, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (id) DO NOTHING
          `, [
            log.id,
            log.user_id,
            log.user_email,
            log.action,
            log.module,
            log.record_id,
            log.old_data ? JSON.stringify(log.old_data) : null,
            log.new_data ? JSON.stringify(log.new_data) : null,
            log.metadata ? JSON.stringify(log.metadata) : null,
            log.branch_id,
            log.source,
            log.created_at
          ]);
        }
        tablesSynced.push('audit_log');
        recordsSynced += cloudAuditLogs.length;
        console.log(`   ✓ ${cloudAuditLogs.length} registros de auditoría sincronizados.`);
      }
    } catch (auditErr) {
      console.warn('   ⚠ Error sincronizando audit_log:', auditErr.message);
    }
    // Registrar éxito
    if (recordsSynced > 0) {
      await localClient.query(`
        INSERT INTO sync_log (direction, status, tables_synced, records_synced, finished_at)
        VALUES ('cloud_to_local', 'success', $1, $2, NOW())
      `, [tablesSynced, recordsSynced]);
    }
    
    console.log(`[${new Date().toISOString()}] ✅ Sincronización completada.`);

  } catch (err) {
    syncStatus = 'error';
    errorMsg = err.message;
    console.error(`[${new Date().toISOString()}] ❌ Error de sincronización:`, errorMsg);
    
    await localClient.query(`
      INSERT INTO sync_log (direction, status, error_msg, finished_at)
      VALUES ('cloud_to_local', 'error', $1, NOW())
    `, [errorMsg]);
    
  } finally {
    localClient.release();
  }
}

// ─── Ejecución principal ───────────────────────────────────────
async function startDaemon() {
  const syncIntervalMinutes = 15;
  const syncIntervalMs = syncIntervalMinutes * 60 * 1000;

  console.log(`\n🚀 Sync Daemon iniciado.`);
  console.log(`   Modo: Background`);
  console.log(`   Intervalo: ${syncIntervalMinutes} minutos\n`);

  // Ejecutar inmediatamente la primera vez
  await runSync();

  // Programar ejecuciones subsecuentes
  setInterval(async () => {
    await runSync();
  }, syncIntervalMs);
}

startDaemon().catch(err => {
  console.error('Fatal error in sync daemon:', err);
  process.exit(1);
});
