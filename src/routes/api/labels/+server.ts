// src/routes/api/labels/+server.ts
// Returns a self-contained HTML page with printable labels.
// No SvelteKit layout — completely clean for printing.

import type { RequestHandler } from './$types';
import { AgentClient } from '$lib/server/agent';
import { adminDb, MasterCollections } from '$lib/server/firebase-admin';

export const GET: RequestHandler = async ({ url, locals }) => {
  const profile = (locals as any).profile;
  if (!profile) {
    return htmlError('No autorizado. Por favor inicia sesión.', 401);
  }

  try {
    // ── 1. Resolve company ─────────────────────────────────────────────────
    const urlTenant = url.searchParams.get('tenant_id');
    const profileSlug = profile?.company?.slug;
    const targetId = urlTenant || profileSlug;

    if (!targetId) return htmlError('Empresa no especificada.');

    let companyInfo: any = null;
    const snap = await adminDb!.collection(MasterCollections.CONNECTIONS).doc(targetId).get();
    if (snap.exists) {
      companyInfo = snap.data();
    } else {
      const q = await adminDb!
        .collection(MasterCollections.CONNECTIONS)
        .where('slug', '==', targetId)
        .get();
      if (!q.empty) companyInfo = q.docs[0].data();
    }

    if (!companyInfo?.agent_url) return htmlError('No se encontró la configuración del Agente.');

    const agentClient = new AgentClient({
      slug: companyInfo.slug,
      agent_url: companyInfo.agent_url,
      agent_api_key: companyInfo.agent_api_key
    });

    // ── 2. Fetch articles ──────────────────────────────────────────────────
    const branchId = url.searchParams.get('branch_id');
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
    const companyName = companyInfo.name || targetId;
    const companyLogo: string = companyInfo.logo || '';

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
    }
    .btn {
      border: none; cursor: pointer; border-radius: 14px;
      font-size: .95rem; font-weight: 800; padding: .85rem 1.8rem;
      display: flex; align-items: center; gap: .5rem;
    }
    .btn-print { background: #2563eb; color: #fff; box-shadow: 0 6px 24px rgba(37,99,235,.4); }
    .btn-print:hover { background: #1d4ed8; }
    .btn-close  { background: rgba(0,0,0,.55); color: #fff; }
    .btn-close:hover { background: rgba(0,0,0,.75); }

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
    <button class="btn btn-print" onclick="window.print()">🖨️ IMPRIMIR ETIQUETAS</button>
    <button class="btn btn-close" onclick="window.close()">✕ CERRAR</button>
  </div>
</body>
</html>`;
}

