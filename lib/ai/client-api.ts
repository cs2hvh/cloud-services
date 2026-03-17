'use client';

import { createClient } from '@/lib/supabase/client';

async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function fetchAIAgentApi(
  input: string,
  init: RequestInit = {}
) {
  const accessToken = await getAccessToken();
  const headers = new Headers(init.headers);

  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: 'omit',
  });
}

export const fetchAuthenticatedApi = fetchAIAgentApi;
