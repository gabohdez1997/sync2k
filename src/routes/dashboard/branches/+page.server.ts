// src/routes/dashboard/branches/+page.server.ts
// Migrado de Firestore + Firebase API → Supabase (tabla branches) + Supabase Auth

import { protectLoad, protectAction } from '$lib/server/permissions';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const config = {
  maxDuration: 300
};

// ─── Load ──────────────────────────────────────────────────────
export const load: PageServerLoad = protectLoad('sec_branches', async ({ locals, fetch }) => {
  try {
    // Intentamos obtener todos los campos, incluyendo 'default_warehouse' y 'allow_decimals_units'
    let { data: branches, error } = await supabaseAdmin
      .from('branches')
      .select('id, name, business_name, agent_url, agent_token, profit_branch_codes, sql_config, profit_server_id, local_dns_alias, active, sort_order, updated_at, rif, address, latitude, longitude, logo_url, phone, default_warehouse, allow_decimals_units')
      .order('sort_order')
      .order('name');

    // Si falla específicamente por la columna default_warehouse (migración no aplicada)
    if (error && error.message.includes('default_warehouse')) {
      console.warn('[BRANCHES] La columna default_warehouse no existe. Reintentando sin ella...');
      const fallback = await supabaseAdmin
        .from('branches')
        .select('id, name, business_name, agent_url, agent_token, profit_branch_codes, sql_config, profit_server_id, local_dns_alias, active, sort_order, updated_at, rif, address, latitude, longitude, logo_url, phone, allow_decimals_units')
        .order('sort_order')
        .order('name');
      
      branches = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('[BRANCHES] Error cargando sucursales:', error.message);
      return { branches: [], agentServers: [], branchStats: {}, loadError: error.message };
    }

    // Consultar servidores SQL y estadísticas de todas las sucursales activas en paralelo
    let agentServers: any[] = [];
    let branchStats: Record<string, { articulos: number; clientes: number; proveedores: number; online: boolean }> = {};
    let loadError: string | null = null;
    const activeBranches = (branches ?? []).filter(b => b.active && b.agent_url);

    if (activeBranches.length > 0) {
      await Promise.allSettled(
        activeBranches.map(async (branch) => {
          try {
            const client = new AgentClient(
              {
                slug:          branch.id,
                agent_url:     branch.agent_url!,
                agent_api_key: branch.agent_token
              },
              locals.profile || undefined,
              fetch
            );

            const [dbConfigRes, statsRes] = await Promise.all([
              client.getDatabaseConfig().catch(() => null),
              client.getBranchStats(branch.id).catch(() => null)
            ]);

            if (dbConfigRes) {
              const resAny = dbConfigRes as any;
              const servers = resAny?.data?.servers || resAny?.servers || [];
              if (Array.isArray(servers) && servers.length > 0) {
                // Combinar servidores evitando duplicados por id
                for (const s of servers) {
                  if (!agentServers.some(exist => exist.id === s.id)) {
                    agentServers.push(s);
                  }
                }
              }
            }

            if (statsRes && statsRes.success) {
              const statsArray = Array.isArray(statsRes.data) ? statsRes.data : [statsRes.data];
              for (const s of statsArray) {
                if (!s) continue;
                const statObj = {
                  articulos: Number(s.articulos) || 0,
                  clientes: Number(s.clientes) || 0,
                  proveedores: Number(s.proveedores) || 0,
                  condiciones_pago: Number(s.condiciones_pago) || 0,
                  online: Boolean(s.online ?? true)
                };

                // Indexar por todas las posibles claves para máxima compatibilidad
                if (s.sede_id) branchStats[s.sede_id] = statObj;
                if (s.sede_nombre) branchStats[s.sede_nombre] = statObj;
                branchStats[branch.id] = statObj;
                if (branch.name) branchStats[branch.name] = statObj;
                if (branch.profit_server_id) branchStats[branch.profit_server_id] = statObj;
              }
            }
          } catch (e: any) {
            console.warn(`[BRANCH STATS WARNING] Error en sucursal ${branch.name}:`, e.message);
          }
        })
      );
    }

    return {
      branches:     branches ?? [],
      agentServers,
      branchStats,
      loadError
    };
  } catch (fatalErr: any) {
    console.error('[BRANCHES FATAL LOAD ERROR]:', fatalErr);
    return {
      branches: [],
      agentServers: [],
      branchStats: {},
      loadError: fatalErr.message || 'Error inesperado al cargar sucursales'
    };
  }
});

// ─── Actions ───────────────────────────────────────────────────
export const actions: Actions = {

  saveBranch: protectAction('sec_branches', async ({ request, locals }) => {
    const formData        = await request.formData();
    const branchId        = (formData.get('branchId') as string)?.trim() || null;
    const name            = (formData.get('name') as string)?.trim();
    const business_name   = (formData.get('business_name') as string)?.trim() || null;
    const agentUrl        = (formData.get('agent_url') as string)?.trim() || null;
    const agentToken      = (formData.get('agent_token') as string)?.trim() || null;
    const logoFile        = formData.get('logo_file') as File;
    const existingLogoUrl = formData.get('logo_url') as string;
    
    // Parsear el array de códigos JSON
    const profitBranchCodesStr = formData.get('profit_branch_codes') as string;
    let profitBranchCodes = [];
    try {
      if (profitBranchCodesStr) profitBranchCodes = JSON.parse(profitBranchCodesStr);
    } catch(e) { }

    // Parsear configuración SQL local JSON
    const sqlConfigStr = formData.get('sql_config') as string;
    let sqlConfig = {};
    try {
      if (sqlConfigStr) sqlConfig = JSON.parse(sqlConfigStr);
    } catch(e) { }

    const profitServer    = (formData.get('profit_server_id') as string)?.trim() || null;
    const localDns        = (formData.get('local_dns_alias') as string)?.trim() || null;
    const sortOrder       = parseInt(formData.get('sort_order') as string || '0');
    const active          = formData.get('active') !== 'false';

    // Nuevos campos Legales y Ubicación
    const rif             = (formData.get('rif') as string)?.trim() || null;
    const address         = (formData.get('address') as string)?.trim() || null;
    const phone           = (formData.get('phone') as string)?.trim() || null;
    let logoUrl           = (formData.get('logo_url') as string)?.trim() || null;
    const latitude        = formData.get('latitude') ? parseFloat(formData.get('latitude') as string) : null;
    const longitude       = formData.get('longitude') ? parseFloat(formData.get('longitude') as string) : null;
    const defaultWarehouse = (formData.get('default_warehouse') as string)?.trim() || null;
    const allowDecimalsUnits = (formData.get('allow_decimals_units') as string)?.trim() || 'MTS, MTS2, KG';

    // ─── Proceso de Subida de Logo ─────────────────────────────
    if (logoFile && logoFile.size > 0 && logoFile.name) {
      const fileName = `${branchId || 'new'}_${Date.now()}_${logoFile.name.replace(/\s+/g, '_')}`;
      const filePath = `logos/${fileName}`;

      const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
        .from('brand-assets')
        .upload(filePath, logoFile, { upsert: true });

      if (uploadErr) {
        console.error('[STORAGE] Error subiendo logo:', uploadErr.message);
      } else {
        const { data: publicData } = supabaseAdmin.storage
          .from('brand-assets')
          .getPublicUrl(filePath);
        
        logoUrl = publicData.publicUrl;
      }
    }

    if (!name) return fail(400, { message: 'El nombre de la sucursal es requerido.' });

    const payload: any = {
      name,
      business_name,
      agent_url:           agentUrl,
      profit_branch_codes: profitBranchCodes,
      sql_config:          sqlConfig,
      profit_server_id:    profitServer,
      local_dns_alias:     localDns,
      sort_order:          sortOrder,
      active,
      rif,
      address,
      phone,
      logo_url:            logoUrl,
      latitude,
      longitude,
      default_warehouse:   defaultWarehouse,
      allow_decimals_units: allowDecimalsUnits,
      updated_at:          new Date().toISOString()
    };

    // Solo actualizar agent_token si se envió uno nuevo
    if (agentToken) payload.agent_token = agentToken;

    let savedId: string;
    let oldData: any = null;

    if (branchId) {
      // Obtener datos actuales para la auditoría (Estado Anterior)
      const { data: current } = await supabaseAdmin.from('branches').select('*').eq('id', branchId).single();
      oldData = current;

      let { error } = await supabaseAdmin
        .from('branches')
        .update(payload)
        .eq('id', branchId);

      // Reintento sin default_warehouse si falla por columna inexistente
      if (error && error.message.includes('default_warehouse')) {
        console.warn('[BRANCHES] Reintentando actualización sin default_warehouse...');
        const { default_warehouse, ...safePayload } = payload;
        const retry = await supabaseAdmin
          .from('branches')
          .update(safePayload)
          .eq('id', branchId);
        error = retry.error;
      }

      if (error) return fail(500, { message: error.message });
      savedId = branchId;
    } else {
      let { data, error } = await supabaseAdmin
        .from('branches')
        .insert(payload)
        .select('id')
        .single();

      // Reintento sin default_warehouse si falla por columna inexistente
      if (error && error.message.includes('default_warehouse')) {
        console.warn('[BRANCHES] Reintentando inserción sin default_warehouse...');
        const { default_warehouse, ...safePayload } = payload;
        const retry = await supabaseAdmin
          .from('branches')
          .insert(safePayload)
          .select('id')
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) return fail(500, { message: error.message });
      savedId = data.id;
    }

    await supabaseAdmin.rpc('log_action', {
      p_user_id:    locals.profile?.id ?? null,
      p_user_email: locals.profile?.email ?? 'system',
      p_action:     branchId ? 'UPDATE' : 'CREATE',
      p_module:     'sec_branches',
      p_record_id:  savedId,
      p_branch_id:  savedId,
      p_old_data:   oldData ? JSON.stringify(oldData) : null,
      p_new_data:   JSON.stringify(payload)
    });

    return { success: true, savedId };
  }),

  testConnection: protectAction('sec_branches', async ({ request, locals, fetch }) => {
    const formData = await request.formData();
    const branchId = (formData.get('branchId') as string)?.trim();

    if (!branchId) return fail(400, { message: 'ID de sucursal requerido.' });

    // Buscar los datos de la sucursal de la base de datos
    const { data: branch, error: dbErr } = await supabaseAdmin
      .from('branches')
      .select('id, name, agent_url, agent_token')
      .eq('id', branchId)
      .single();

    if (dbErr || !branch) {
      return fail(404, { message: `Sucursal no encontrada: ${dbErr?.message || ''}` });
    }

    if (!branch.agent_url) {
      return fail(400, { message: 'La sucursal no tiene configurada una URL de agente.' });
    }

    try {
      const client = new AgentClient(
        {
          slug:          branch.id,
          agent_url:     branch.agent_url,
          agent_api_key: branch.agent_token
        },
        locals.profile || undefined,
        fetch
      );

      const res = await client.testConnection(branch.id);
      
      if (!res.success) {
        return fail(500, { message: res.message || 'Error al conectar con la base de datos SQL del agente.' });
      }

      return { success: true, message: res.message || 'Conexión exitosa.' };
    } catch (e: any) {
      return fail(500, { message: `Error de red o conexión al Agente local: ${e.message}` });
    }
  }),

  deleteBranch: protectAction('sec_branches', async ({ request, locals }) => {
    const formData  = await request.formData();
    const branchId  = (formData.get('branchId') as string)?.trim();
    const password  = (formData.get('password') as string)?.trim();

    if (!branchId) return fail(400, { message: 'ID de sucursal requerido.' });
    if (!password) return fail(400, { message: 'La contraseña es requerida para confirmar.' });

    // Verificar contraseña del admin con Supabase Auth
    const email = locals.session?.user?.email;
    if (!email) return fail(401, { message: 'Sesión no válida.' });

    const { error: authErr } = await supabaseAdmin.auth.signInWithPassword({ email, password });
    if (authErr) return fail(401, { message: 'Contraseña de confirmación incorrecta.' });

    const { error } = await supabaseAdmin
      .from('branches')
      .delete()
      .eq('id', branchId);

    if (error) return fail(500, { message: error.message });

    await supabaseAdmin.rpc('log_action', {
      p_user_id:    locals.profile?.id ?? null,
      p_user_email: locals.profile?.email ?? 'system',
      p_action:     'DELETE',
      p_module:     'sec_branches',
      p_record_id:  branchId,
      p_branch_id:  branchId
    });

    return { success: true };
  }),

  syncEntity: protectAction('sec_branches', async ({ request, locals, fetch }) => {
    const formData = await request.formData();
    const entity = (formData.get('entity') as string)?.trim() || 'suppliers'; // 'suppliers' | 'customers' | 'articles'

    // Obtener las sucursales activas con agent_url
    const { data: branches } = await supabaseAdmin
      .from('branches')
      .select('id, name, agent_url, agent_token, active')
      .eq('active', true);

    const activeBranches = (branches || []).filter(b => b.agent_url);
    if (activeBranches.length < 2) {
      return fail(400, { message: 'Se requieren al menos 2 sucursales activas con conexión configurada para sincronizar.' });
    }

    let moduleName = 'PROVEEDORES';
    let endpoint = 'proveedores';
    let keyField = 'co_prov';

    if (entity === 'customers') {
      moduleName = 'CLIENTES';
      endpoint = 'clientes';
      keyField = 'co_cli';
    } else if (entity === 'articles') {
      moduleName = 'ARTICULOS';
      endpoint = 'articulos';
      keyField = 'co_art';
    } else if (entity === 'payment_conditions' || entity === 'payment-conditions') {
      moduleName = 'CONDICIONES_PAGO';
      endpoint = 'catalogos/condiciones-pago';
      keyField = 'co_cond';
    }

    try {
      // 1. Exportar datos de todas las sedes activas en paralelo
      const branchExports = await Promise.all(
        activeBranches.map(async (branch) => {
          const client = new AgentClient(
            {
              slug:          branch.id,
              agent_url:     branch.agent_url!,
              agent_api_key: branch.agent_token
            },
            locals.profile || undefined,
            fetch
          );

          try {
            const res = await client.exportAll(endpoint, branch.id);
            const items = (res && res.success && Array.isArray(res.data)) ? res.data : [];
            const keyMap = new Set(items.map((i: any) => String(i[keyField] || i.rif || '').trim().toUpperCase()).filter(Boolean));
            return { branch, client, items, keyMap, error: null };
          } catch (err: any) {
            return { branch, client, items: [], keyMap: new Set<string>(), error: err.message };
          }
        })
      );

      // Filtrar sedes que respondieron exitosamente
      const validBranches = branchExports.filter(b => !b.error);
      if (validBranches.length < 2) {
        const errorDetails = branchExports.filter(b => b.error).map(b => `${b.branch.name}: ${b.error}`).join(' | ');
        return fail(500, { message: `No se pudo conectar con suficientes sedes activas. ${errorDetails}` });
      }

      // 2. Unificar todos los registros únicos
      const allUniqueItems = new Map<string, any>();
      for (const b of validBranches) {
        for (const item of b.items) {
          const key = String(item[keyField] || item.rif || '').trim().toUpperCase();
          if (key && !allUniqueItems.has(key)) {
            allUniqueItems.set(key, item);
          }
        }
      }

      // 3. Para cada sede, detectar faltantes e importar el lote
      let totalSynced = 0;
      const summary: Array<{ sede_id: string; sede_nombre: string; migrated: number; errors: string[] }> = [];

      await Promise.all(
        validBranches.map(async (b) => {
          const missingItems: any[] = [];
          for (const [key, item] of allUniqueItems.entries()) {
            if (!b.keyMap.has(key)) {
              missingItems.push(item);
            }
          }

          if (missingItems.length === 0) {
            summary.push({
              sede_id: b.branch.id,
              sede_nombre: b.branch.name,
              migrated: 0,
              errors: []
            });
            return;
          }

          const chunkSize = 250;
          let branchMigrated = 0;
          const branchErrors: string[] = [];

          for (let i = 0; i < missingItems.length; i += chunkSize) {
            const chunk = missingItems.slice(i, i + chunkSize);
            try {
              const importRes = await b.client.importBatch(endpoint, chunk, b.branch.id);
              const count = importRes?.migrated || 0;
              branchMigrated += count;
              if (importRes?.errors && importRes.errors.length > 0) {
                branchErrors.push(...importRes.errors);
              }
            } catch (chunkErr: any) {
              branchErrors.push(`Lote ${Math.floor(i / chunkSize) + 1}: ${chunkErr.message}`);
            }
          }

          totalSynced += branchMigrated;
          summary.push({
            sede_id: b.branch.id,
            sede_nombre: b.branch.name,
            migrated: branchMigrated,
            errors: branchErrors
          });
        })
      );

      // Agregar sedes con error de conexión al resumen si las hubiera
      for (const b of branchExports) {
        if (b.error) {
          summary.push({
            sede_id: b.branch.id,
            sede_nombre: b.branch.name,
            migrated: 0,
            errors: [`Error de conexión: ${b.error}`]
          });
        }
      }

      // 4. Registrar en Auditoría Supabase
      await supabaseAdmin.rpc('log_action', {
        p_user_id:    locals.profile?.id ?? null,
        p_user_email: locals.profile?.email ?? 'system',
        p_action:     'SYNC',
        p_module:     moduleName,
        p_record_id:  'MULTI-SEDE',
        p_branch_id:  validBranches[0]?.branch.id || null,
        p_new_data:   JSON.stringify({ entity, total_synced: totalSynced, summary, timestamp: new Date().toISOString() })
      });

      return {
        success: true,
        entity,
        message: totalSynced > 0
          ? `Sincronización completada. Se migraron ${totalSynced} registros en total.`
          : 'Todas las sucursales ya se encuentran sincronizadas.',
        total_synced: totalSynced,
        summary
      };
    } catch (e: any) {
      return fail(500, { message: `Error en la sincronización: ${e.message}` });
    }
  })
};
