// src/routes/api/labels/+server.ts
// Returns a self-contained HTML page with printable labels.
// No SvelteKit layout — completely clean for printing.

import type { RequestHandler } from './$types';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ url, locals }) => {
  const profile = (locals as any).profile;
  if (!profile) {
    return htmlError('No autorizado. Por favor inicia sesión.', 401);
  }

  try {
    // ── 1. Resolve branch ───────────────────────────────────────────────────
    const branchId = url.searchParams.get('branch_id');
    if (!branchId) return htmlError('Sede no especificada.');
    
    const { data: dbBranch, error: branchErr } = await supabaseAdmin
      .from('branches')
      .select('id, name, agent_url, agent_token, logo_url')
      .eq('id', branchId)
      .single();

    if (branchErr || !dbBranch?.agent_url) {
      return htmlError('No se encontró la configuración del Agente para esta sede.');
    }

    const agentClient = new AgentClient({
      slug: dbBranch.id,
      agent_url: dbBranch.agent_url,
      agent_api_key: dbBranch.agent_token
    }, profile || undefined);

    const warehouseId = url.searchParams.get('co_alma');
    const coArtsParam = url.searchParams.get('co_arts');

    let articles: any[] = [];

    if (coArtsParam) {
      // Selection mode: fetch specific codes in parallel
      const codes = coArtsParam.split(',').map((c) => c.trim()).filter(Boolean);
      const baseP = new URLSearchParams();
      if (branchId) { baseP.set('sede_id', branchId); baseP.set('sede', branchId); }
      if (warehouseId) baseP.set('co_alma', warehouseId);

      const results = await Promise.allSettled(
        codes.map((code) => {
          const p = new URLSearchParams(baseP);
          p.set('co_art', code);
          p.set('limit', '1');
          return agentClient.request<any>(`/articulos/search?${p.toString()}`);
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const res = r.value as any;
          const items = res?.data?.items || res?.items || res?.data || (Array.isArray(res) ? res : []);
          if (Array.isArray(items) && items.length > 0) articles.push(items[0]);
        }
      }
    } else {
      // Filter mode: fetch up to 500
      const searchTerm = url.searchParams.get('search') || '';
      const lineaId = url.searchParams.get('linea') || '';
      const categoriaId = url.searchParams.get('categoria') || '';
      const ubicacionId = url.searchParams.get('co_ubicacion');

      const params = new URLSearchParams();
      params.set('limit', '500');
      if (searchTerm) {
        const isCode = /^\d/.test(searchTerm.trim());
        params.set(isCode ? 'co_art' : 'descripcion', searchTerm);
      }
      if (lineaId) params.set('linea', lineaId);
      if (categoriaId) params.set('categoria', categoriaId);
      if (branchId) { params.set('sede_id', branchId); params.set('sede', branchId); }
      if (warehouseId) params.set('co_alma', warehouseId);
      if (ubicacionId) params.set('co_ubicacion', ubicacionId);

      const endpoint =
        searchTerm || lineaId || categoriaId || ubicacionId
          ? `/articulos/search?${params.toString()}`
          : `/articulos?${params.toString()}`;

      const resData = await agentClient.request<any>(endpoint);
      const rawItems =
        (resData as any).data?.items ||
        (resData as any).items ||
        (resData as any).data ||
        (Array.isArray(resData) ? resData : []);
      articles = Array.isArray(rawItems) ? rawItems : [];
    }

    // ── 3. Generate HTML ───────────────────────────────────────────────────
    const companyName = dbBranch.name || 'Galpe';
    const companyLogo: string = dbBranch.logo_url || '';

    const html = buildHtml(articles, companyName, companyLogo);
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  } catch (e: any) {
    console.error('[API/LABELS] Error:', e);
    return htmlError(`Error interno: ${e.message}`);
  }
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function htmlError(msg: string, status = 400): Response {
  return new Response(
    `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Error</title>
     <style>body{font-family:sans-serif;padding:3rem;background:#fff0f0;color:#c00}</style></head>
     <body><h2>⚠️ ${esc(msg)}</h2><button onclick="window.close()">Cerrar</button></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function qrUrl(code: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(code)}`;
}

function esc(str: string) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(articles: any[], companyName: string, companyLogo: string): string {
  const labelsHtml = articles
    .map((article) => {
      const code = esc(article.co_art || article.codigo || article.id || '');
      const name = esc(article.art_des || article.descripcion || article.name || 'SIN DESCRIPCIÓN');
      const watermark = companyLogo
        ? `<div class="wm"><img src="${companyLogo}" alt="" /></div>`
        : '';
      return `
      <div class="label-box">
        ${watermark}
        <div class="label-content">
          <div class="article-info">
            <h2 class="article-name">${name}</h2>
            <div class="article-code-row">
              <span class="code-label">Código del Artículo</span>
              <span class="code-value">${code}</span>
            </div>
          </div>
          <div class="article-qr">
            <img src="${qrUrl(article.co_art || article.codigo || article.id || '')}" alt="QR" class="qr-img" />
          </div>
        </div>
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Etiquetas — ${esc(companyName)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #f4f4f7;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    }

    .sheet {
      background: white;
      box-shadow: 0 0 50px rgba(0,0,0,.12);
      width: 21.59cm;
      min-height: 27.94cm;
      margin: 40px auto;
      padding: 0.5cm;
    }

    .label-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      border-top: 1px solid #000;
      border-left: 1px solid #000;
    }

    .label-box {
      border-right: 1px solid #000;
      border-bottom: 1px solid #000;
      height: 4.5cm;
      padding: 18px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      background: white;
      position: relative;
      overflow: hidden;
    }

    /* Watermark */
    .wm {
      position: absolute;
      top: 55%; left: 0px;
      right: calc(95px + 0px + 18px + 15px);
      transform: translateY(-50%);
      display: flex; align-items: center; justify-content: center;
      pointer-events: none; z-index: 0;
    }
    .wm img {
      max-height: 150px; max-width: 100%; width: auto;
      object-fit: contain; opacity: 1;
    }

    .label-content {
      display: flex; justify-content: space-between;
      align-items: center; gap: 15px;
      height: 100%; position: relative; z-index: 1;
    }

    .article-info {
      flex: 1; display: flex; flex-direction: column;
      justify-content: space-between; height: 100%; min-width: 0;
    }

    .article-name {
     text-align: center;
      font-size: 13.5px; font-weight: 800; line-height: 1.25;
      text-transform: uppercase;
      display: -webkit-box; -webkit-line-clamp: 4;
      line-clamp: 4; -webkit-box-orient: vertical;
      overflow: hidden; color: #000;
    }

    .article-code-row { 
      position: relative;
      top: 10px;
      text-align: center; 
    }

    .code-label {
      font-size: 10px; text-transform: uppercase; font-weight: bold;
      display: block; color: #555; letter-spacing: .5px;
    }

    .code-value {
      font-size: 20px; font-weight: 900; letter-spacing: 1.5px;
      color: #000; font-family: "Courier New", Courier, monospace;
    }

    .article-qr { flex-shrink: 0; background: #fff; padding: 4px; border: 1px solid #eee; }
    .qr-img { width: 95px; height: 95px; display: block; image-rendering: pixelated; }

    /* Toolbar */
    .toolbar {
      position: fixed; bottom: 2rem; right: 2rem;
      display: flex; gap: 1rem; z-index: 999;
      pointer-events: auto;
    }
    .btn {
      border: none; cursor: pointer; border-radius: 1rem;
      padding: 1rem 2rem; display: flex; align-items: center; gap: 0.5rem;
      color: #fff; transition: all 0.2s;
    }
    .btn:active { transform: scale(0.95); }
    .btn-print { 
      background: #2563eb; 
      font-weight: 900; 
      box-shadow: 0 25px 50px -12px rgba(37,99,235,0.4); 
    }
    .btn-print:hover { background: #3b82f6; }
    .btn-close { 
      background: rgba(31, 41, 55, 0.8); 
      backdrop-filter: blur(12px);
      font-weight: 700;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    }
    .btn-close:hover { background: rgba(55, 65, 81, 1); }

    /* ──── Print ──────────────────────────────────────────── */
    @media print {
      body  { background: white; }
      .toolbar { display: none !important; }
      .sheet {
        width: 100%; margin: 0; padding: 0;
        box-shadow: none; min-height: unset;
      }
      .label-box { page-break-inside: avoid; break-inside: avoid; }
      @page { size: letter; margin: 0.5cm; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="label-grid">
      ${labelsHtml}
    </div>
  </div>
  <div class="toolbar">
    <button class="btn btn-print" onclick="window.print()">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14" rx="1"/><path d="M6 8V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/></svg>
      IMPRIMIR ETIQUETAS
    </button>
    <button class="btn btn-close" onclick="window.close()">CERRAR</button>
  </div>
</body>
</html>`;
}

