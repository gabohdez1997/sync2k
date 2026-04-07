import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	// Recrear agente con vars de entorno (si tenemos acceso a .env, o mock)
	// Como esto corre del lado del servidor, usaremos una configuración hardcodeada o sacada de Firestore
	try {
        const adminDb = (await import('$lib/server/firebase-admin')).adminDb;
		const snap = await adminDb!.collection((await import('$lib/server/firebase-admin')).MasterCollections.CONNECTIONS).doc('galpe2021').get();
		
        const data = snap.data();
        if(!data) return json({error: "no data"});

        const agentClient = new AgentClient({
            slug: data.slug,
            agent_url: data.agent_url,
            agent_api_key: data.agent_api_key
        });

        const resData = await agentClient.request<any>('/articulos?page=1');
        return json(resData);
	} catch(e:any) {
        return json({error: e.message});
    }
};

