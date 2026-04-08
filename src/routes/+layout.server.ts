import type { LayoutServerLoad } from './$types';
import { getSystemSettings } from '$lib/server/settings';

export const load: LayoutServerLoad = async ({ locals }) => {
  const systemSettings = await getSystemSettings();
  
  return {
    session: locals.session,
    profile: locals.profile,
    systemSettings
  };
};
