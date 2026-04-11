import type { LayoutServerLoad } from './$types';
import { getSystemSettings } from '$lib/server/settings';

export const load: LayoutServerLoad = async ({ locals, fetch }) => {
  const systemSettings = await getSystemSettings(fetch);
  
  return {
    session: locals.session,
    profile: locals.profile,
    systemSettings
  };
};
