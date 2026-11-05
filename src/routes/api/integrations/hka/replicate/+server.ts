// src/routes/api/integrations/hka/replicate/+server.ts
// Endpoint de replicación transaccional hacia Profit Plus 2kDoce (con protección dry_run por defecto)

import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import { logAction } from '$lib/server/audit';
import { getHkaConfig, type HkaConfig } from '$lib/server/services/hka';
import {
  extractHkaDocuments,
  loadProfitAuditContext,
  buildHkaReplicationPlan,
  generateHkaReplicationSql,
  executeHkaReplicationInProfit,
  backfillMissingArticlePricesFromProfit,
  type HkaReplicationOptions
} from '$lib/server/services/hkaReplication';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
  const profile = (locals as any).profile;
  if (!profile) {
    return json({ success: false, message: 'No autenticado.' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // Por seguridad es true a menos que se envíe explícitamente dry_run: false
    const confirmed = body.confirm === true;

    const branchId = body.branch_id ? String(body.branch_id).trim() : '';
    const allowedBranches = profile.allowed_branches || [];
    const targetBranch = branchId
      ? allowedBranches.find((b: any) => String(b.id) === branchId)
      : allowedBranches[0] || null;

    if (!targetBranch || !targetBranch.agent_url) {
      return json(
        {
          success: false,
          message: 'No se encontró una sucursal con Agente Sync2K configurado para conectar con Profit Plus.'
        },
        { status: 400 }
      );
    }

    const agentClient = new AgentClient(
      {
        slug: targetBranch.id,
        agent_url: targetBranch.agent_url,
        agent_api_key: targetBranch.agent_token
      },
      profile,
      fetch
    );

    const sedeId = targetBranch.profit_server_id || targetBranch.id;
    const monedaPrecioArticulo: 'USD' | 'BS' =
      String(body.moneda_precio_articulo || 'USD').toUpperCase() === 'BS' ? 'BS' : 'USD';

    // Modo directo: completar precios faltantes (saArtPrecio) desde facturas ya replicadas en Profit Plus (<1 seg, sin redescargar HKA)
    if (body.mode === 'backfill_prices') {
      const executeNow = !dryRun && confirmed;
      const backfillRes = await backfillMissingArticlePricesFromProfit(agentClient, sedeId, {
        moneda_precio_articulo: monedaPrecioArticulo,
        dry_run: !executeNow
      });

      if (body.format === 'sql') {
        const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const filename = `Precios_Faltantes_saArtPrecio_${backfillRes.databaseName}_${dateStamp}.sql`;
        return new Response(backfillRes.sqlScript, {
          status: 200,
          headers: {
            'Content-Type': 'application/sql; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store'
          }
        });
      }

      if (executeNow && backfillRes.count > 0) {
        await logAction({
          uid: profile.id,
          user_email: profile.email || 'system',
          action: 'UPDATE',
          module: 'integrations',
          record_id: 'hka_profit_backfill_prices',
          branch_id: targetBranch.id,
          new_data: {
            success: backfillRes.success,
            database: backfillRes.databaseName,
            moneda_precio: backfillRes.monedaPrecio,
            articles_updated: backfillRes.count
          }
        });
      }

      return json(backfillRes, { status: backfillRes.success ? 200 : 500 });
    }

    const hkaOverride: Partial<HkaConfig> | undefined =
      body.hka_base_url || body.hka_token_empresa || body.hka_token_clave
        ? {
            ...(body.hka_base_url ? { base_url: String(body.hka_base_url) } : {}),
            ...(body.hka_environment ? { environment: body.hka_environment === 'production' ? 'production' : 'demo' } : {}),
            ...(body.hka_token_empresa ? { token_empresa: String(body.hka_token_empresa) } : {}),
            ...(body.hka_token_clave ? { token_clave: String(body.hka_token_clave) } : {})
          }
        : undefined;

    const currentHkaCfg = hkaOverride ? { ...(await getHkaConfig(fetch)), ...hkaOverride } : await getHkaConfig(fetch);

    // 1. Extraer documentos de HKA
    const extractRes = await extractHkaDocuments(
      {
        serie: body.serie !== undefined ? String(body.serie) : undefined,
        tipoDocumento: body.tipo_documento ? String(body.tipo_documento) : undefined,
        numeroDocumentoInicio: body.doc_inicio || undefined,
        numeroDocumentoFin: body.doc_fin || undefined,
        fechaInicio: body.fecha_inicio || undefined,
        fechaFin: body.fecha_fin || undefined
      },
      hkaOverride
    );

    if (!extractRes.success) {
      return json(
        { success: false, message: extractRes.mensaje || 'Error al extraer documentos desde HKA.' },
        { status: 400 }
      );
    }

    let docs = extractRes.documents;
    if (Array.isArray(body.selected_hka_docs) && body.selected_hka_docs.length > 0) {
      const selectedSet = new Set(body.selected_hka_docs.map((x: any) => String(x).trim()));
      docs = docs.filter((d) => selectedSet.has(d.numeroDocumento));
    }

    const replicationOptions: HkaReplicationOptions = {
      pad_doc_num: body.pad_doc_num ?? true,
      doc_num_length: body.doc_num_length ? Number(body.doc_num_length) : undefined,
      include_serie_prefix: body.include_serie_prefix ?? false,
      moneda_profit: String(body.moneda_profit || 'BS').toUpperCase() === 'USD' ? 'USD' : 'BS',
      moneda_precio_articulo: monedaPrecioArticulo,
      saldo_mode: String(body.saldo_mode || 'pendiente').toLowerCase() === 'cero' ? 'cero' : 'pendiente',
      skip_zero_amount: body.skip_zero_amount ?? true,
      include_annulled: body.include_annulled ?? true,
      force_service_articles: body.force_service_articles ?? true,
      default_warehouse: targetBranch?.default_warehouse || '01',
      default_zone: body.default_zone || targetBranch?.default_zone || '004',
      default_client_type: body.default_client_type || targetBranch?.default_client_type || 'DET',
      default_cta_ingr_egr: body.default_cta_ingr_egr || targetBranch?.default_cta_ingr_egr || 'I-001',
      default_seller: body.default_seller || targetBranch?.default_seller || '01',
      default_segment: body.default_segment || targetBranch?.default_segment || '01'
    };

    const profitCtx = await loadProfitAuditContext(agentClient, sedeId, replicationOptions);

    if (!profitCtx.agentConnected) {
      return json(
        {
          success: false,
          message: 'El Agente Sync2K de la sucursal no respondió en vivo. Verifique que esté encendido antes de replicar.'
        },
        { status: 503 }
      );
    }

    const plan = buildHkaReplicationPlan(
      docs,
      profitCtx,
      {
        environment: currentHkaCfg.environment,
        baseUrl: currentHkaCfg.base_url
      },
      replicationOptions
    );

    if (dryRun || !confirmed) {
      return json({
        success: true,
        dry_run: true,
        message: 'Simulación generada exitosamente (sin cambios escritos en Profit Plus). Envíe dry_run: false y confirm: true para ejecutar.',
        plan,
        sql_script: generateHkaReplicationSql(plan, profitCtx)
      });
    }

    // 2. Ejecución real transaccional en Profit Plus
    const execResult = await executeHkaReplicationInProfit(plan, profitCtx, agentClient, sedeId);

    await logAction({
      uid: profile.id,
      user_email: profile.email || 'system',
      action: 'CREATE',
      module: 'integrations',
      record_id: 'hka_profit_replication',
      branch_id: targetBranch.id,
      new_data: {
        success: execResult.success,
        database: plan.databaseName,
        hka_environment: plan.hkaEnvironment,
        invoices_replicated: plan.summary.invoicesToCreate,
        clients_created: plan.summary.clientsToCreate,
        articles_created: plan.summary.articlesToCreate,
        total_neto_bs: plan.summary.totalNetoBsToReplicate
      }
    });

    if (!execResult.success) {
      return json(
        {
          success: false,
          message: execResult.message,
          details: execResult.details,
          plan
        },
        { status: 500 }
      );
    }

    return json({
      success: true,
      dry_run: false,
      message: execResult.message,
      details: execResult.details,
      plan
    });
  } catch (err: any) {
    return json(
      { success: false, message: `Error en replicación HKA -> Profit Plus: ${err.message}` },
      { status: 500 }
    );
  }
};

