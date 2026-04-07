// scripts/restore_agent_config.js
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch'; // Use node-fetch if global fetch not available, or just global fetch in Node 18+

async function main() {
    // 1. Init Firebase
    const localKeyPath = path.resolve('firebase');
    const files = fs.readdirSync(localKeyPath);
    const jsonFile = files.find(f => f.endsWith('.json'));
    const serviceAccount = JSON.parse(fs.readFileSync(path.join(localKeyPath, jsonFile), 'utf8'));

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }

    const db = admin.firestore();
    const tenantSlug = 'galpe2021';
    
    // 2. Get Tenant
    const tenantSnap = await db.collection('conexiones').where('slug', '==', tenantSlug).limit(1).get();
    if (tenantSnap.empty) throw new Error('Tenant not found');
    const tenantId = tenantSnap.docs[0].id;
    const tenantData = tenantSnap.docs[0].data();
    
    console.log(`📡 Restaurando Agente para: ${tenantData.name} (${tenantData.agent_url})`);

    // 3. Get Branches
    const branchesSnap = await db.collection('conexiones').doc(tenantId).collection('branches').get();
    const branches = branchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (branches.length === 0) {
        console.log('❌ No hay sucursales para restaurar.');
        return;
    }

    // 4. Push to Agent
    const agentBaseUrl = tenantData.agent_url.replace(/\/$/, '') + '/api/v1';
    
    for (const b of branches) {
        console.log(`📤 Inyectando sucursal: ${b.name} (ID: ${b.id}, Code: ${b.co_sucur || b.co_sucu})...`);
        
        try {
            const payload = {
                servers: [{
                    id: b.id,
                    name: b.name,
                    server: b.sql_config?.host || 'localhost',
                    database: b.sql_config?.database || '',
                    user: b.sql_config?.user || 'profit',
                    password: b.sql_config?.password || 'profit',
                    co_sucur: b.co_sucur || b.co_sucu || '',
                    is_default: !!b.is_default
                }]
            };

            const response = await fetch(`${agentBaseUrl}/config/database`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-api-key': tenantData.agent_api_key
                },
                body: JSON.stringify(payload)
            });

            const resData = await response.json();
            if (resData.success) {
                console.log(`✅ OK: ${b.name} sincronizada.`);
            } else {
                console.log(`⚠️ Falló ${b.name}: ${resData.message}`);
            }
        } catch (err) {
            console.error(`❌ Error inyectando ${b.name}:`, err.message);
        }
    }

    console.log('\n✨ Proceso de restauración completado.');
}

main().catch(err => {
    console.error('CRITICAL ERROR:', err);
    process.exit(1);
});
