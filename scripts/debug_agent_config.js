// scripts/debug_agent_config.js
import { AgentClient } from '../src/lib/server/agent.js';
import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

async function main() {
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
    
    const tenantSnap = await db.collection('conexiones').where('slug', '==', tenantSlug).limit(1).get();
    if (tenantSnap.empty) {
        console.log('❌ Tenant not found');
        return;
    }

    const t = tenantSnap.docs[0].data();
    console.log(`✅ Tenant: ${t.name}`);
    console.log(`🌐 Agent URL: ${t.agent_url}`);

    const agent = new AgentClient({
        slug: t.slug,
        agent_url: t.agent_url,
        agent_api_key: t.agent_api_key
    });

    try {
        const config = await agent.getDatabaseConfig();
        console.log(`\n📦 AGENT SERVERS (Configured in Agent):`);
        console.log(JSON.stringify(config, null, 2));

        const fsBranches = await db.collection('conexiones').doc(tenantSnap.docs[0].id).collection('branches').get();
        console.log(`\n📂 FIRESTORE BRANCHES (Our Truth):`);
        fsBranches.forEach(doc => {
            console.log(`- ID: ${doc.id} | Name: ${doc.data().name} | Code: ${doc.data().co_sucur}`);
        });

    } catch (err) {
        console.error('❌ Error hitting Agent:', err.message);
    }
}

main().catch(console.error);
