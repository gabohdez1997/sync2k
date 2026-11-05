// src/routes/api/integrations/hka/extract/+server.ts
// Endpoint de consulta y exportación previa (JSON / Excel .xlsx / Script .sql)
// Extrae las facturas emitidas en The Factory HKA y las audita contra Profit Plus antes de replicar.

import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import { getHkaConfig, type HkaConfig } from '$lib/server/services/hka';
import {
  extractHkaDocuments,
  loadProfitAuditContext,
  buildHkaReplicationPlan,
  generateHkaReplicationSql,
  generateHkaAuditExcelBuffer,
  type HkaReplicationOptions
} from '$lib/server/services/hkaReplication';
import type { RequestHandler } from './$types';

async function handleExtraction(params: Record<string, any>, locals: any, fetchFn: typeof fetch) {
  const profile = locals?.profile;
  if (!profile) {
    return json({ success: false, message: 'No autenticado.' }, { status: 401 });
  }

  const format = String(params.format || 'json').trim().toLowerCase();
  const branchId = params.branch_id ? String(params.branch_id).trim() : '';

  // Resolver sucursal destino y sus defaults de Profit Plus
  const allowedBranches = profile.allowed_branches || [];
  const targetBranch = branchId
    ? allowedBranches.find((b: any) => String(b.id) === branchId)
    : allowedBranches[0] || null;

  let agentClient: AgentClient | null = null;
  if (targetBranch?.agent_url) {
    agentClient = new AgentClient(
      {
        slug: targetBranch.id,
        agent_url: targetBranch.agent_url,
        agent_api_key: targetBranch.agent_token
      },
      profile,
      fetchFn
    );
  }

  // Overrides opcionales de entorno/credenciales HKA (útil para consultar Producción o Demo al vuelo)
  const hkaOverride: Partial<HkaConfig> | undefined =
    params.hka_base_url || params.hka_token_empresa || params.hka_token_clave
      ? {
          ...(params.hka_base_url ? { base_url: String(params.hka_base_url) } : {}),
          ...(params.hka_environment ? { environment: params.hka_environment === 'production' ? 'production' : 'demo' } : {}),
          ...(params.hka_token_empresa ? { token_empresa: String(params.hka_token_empresa) } : {}),
          ...(params.hka_token_clave ? { token_clave: String(params.hka_token_clave) } : {})
        }
      : undefined;

  const currentHkaCfg = hkaOverride ? { ...(await getHkaConfig(fetchFn)), ...hkaOverride } : await getHkaConfig(fetchFn);

  // 1. Extraer documentos desde The Factory HKA
  const extractRes = await extractHkaDocuments(
    {
      serie: params.serie !== undefined ? String(params.serie) : undefined,
      tipoDocumento: params.tipo_documento ? String(params.tipo_documento) : undefined,
      numeroDocumentoInicio: params.doc_inicio || undefined,
      numeroDocumentoFin: params.doc_fin || undefined,
      fechaInicio: params.fecha_inicio || undefined,
      fechaFin: params.fecha_fin || undefined
    },
    hkaOverride
  );

  if (!extractRes.success) {
    return json(
      {
        success: false,
        message: extractRes.mensaje || 'Error al extraer documentos desde The Factory HKA.'
      },
      { status: 400 }
    );
  }

  let docs = extractRes.documents;
  if (Array.isArray(params.selected_hka_docs) && params.selected_hka_docs.length > 0) {
    const selectedSet = new Set(params.selected_hka_docs.map((x: any) => String(x).trim()));
    docs = docs.filter((d) => selectedSet.has(d.numeroDocumento));
  }

  // 2. Opciones de replicación combinadas con los profit_defaults de la sucursal
  const parseBool = (val: any, def: boolean): boolean => {
    if (val === undefined || val === null || val === '') return def;
    if (typeof val === 'boolean') return val;
    return String(val).toLowerCase() === 'true' || String(val) === '1';
  };

  const replicationOptions: HkaReplicationOptions = {
    pad_doc_num: parseBool(params.pad_doc_num, true),
    doc_num_length: params.doc_num_length ? Number(params.doc_num_length) : undefined,
    include_serie_prefix: parseBool(params.include_serie_prefix, false),
    moneda_profit: String(params.moneda_profit || 'BS').toUpperCase() === 'USD' ? 'USD' : 'BS',
    moneda_precio_articulo: String(params.moneda_precio_articulo || 'USD').toUpperCase() === 'BS' ? 'BS' : 'USD',
    saldo_mode: String(params.saldo_mode || 'pendiente').toLowerCase() === 'cero' ? 'cero' : 'pendiente',
    skip_zero_amount: parseBool(params.skip_zero_amount, true),
    include_annulled: parseBool(params.include_annulled, true),
    force_service_articles: parseBool(params.force_service_articles, true),
    default_warehouse: targetBranch?.default_warehouse || '01',
    default_zone: params.default_zone || targetBranch?.default_zone || '004',
    default_client_type: params.default_client_type || targetBranch?.default_client_type || 'DET',
    default_cta_ingr_egr: params.default_cta_ingr_egr || targetBranch?.default_cta_ingr_egr || 'I-001',
    default_seller: params.default_seller || targetBranch?.default_seller || '01',
    default_segment: params.default_segment || targetBranch?.default_segment || '01'
  };

  // 3. Cargar contexto en vivo desde Profit Plus (ALDANET)
  const sedeId = targetBranch?.profit_server_id || targetBranch?.id || null;
  const profitCtx = await loadProfitAuditContext(agentClient, sedeId, replicationOptions);

  // 4. Construir plan de replicación y auditoría
  const plan = buildHkaReplicationPlan(
    docs,
    profitCtx,
    {
      environment: currentHkaCfg.environment,
      baseUrl: currentHkaCfg.base_url
    },
    replicationOptions
  );

  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // 5. Retornar en el formato solicitado (Excel .xlsx, Script .sql, o JSON interactivo)
  if (format === 'excel' || format === 'xlsx') {
    const excelBuffer = generateHkaAuditExcelBuffer(plan);
    const filename = `Auditoria_HKA_Profit_${plan.databaseName}_${dateStamp}.xlsx`;
    return new Response(new Uint8Array(excelBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store'
      }
    });
  }

  const sqlScript = generateHkaReplicationSql(plan, profitCtx);

  if (format === 'sql') {
    const filename = `Replicacion_HKA_Profit_${plan.databaseName}_${dateStamp}.sql`;
    return new Response(sqlScript, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store'
      }
    });
  }

  return json({
    success: true,
    message: extractRes.mensaje,
    branch: targetBranch ? { id: targetBranch.id, name: targetBranch.name } : null,
    plan,
    sql_script: sqlScript
  });
}

export const GET: RequestHandler = async ({ url, locals, fetch }) => {
  try {
    const params: Record<string, any> = {};
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    if (params.selected_hka_docs) {
      params.selected_hka_docs = String(params.selected_hka_docs)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return await handleExtraction(params, locals, fetch);
  } catch (err: any) {
    return json(
      { success: false, message: `Error en extracción HKA: ${err.message}` },
      { status: 500 }
    );
  }
};

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
  try {
    const body = await request.json().catch(() => ({}));
    return await handleExtraction(body, locals, fetch);
  } catch (err: any) {
    return json(
      { success: false, message: `Error en extracción HKA: ${err.message}` },
      { status: 500 }
    );
  }
};

