'use server';

import { createServiceClient } from '@/lib/supabase/server';
import type { DatabasePlan } from '@/components/dashboard/integrations/types';

/**
 * Server action to fetch available database plans
 * Used by integrations to show pricing and options when creating databases
 */
export async function fetchDatabasePlansAction(): Promise<{
  success: boolean;
  plans?: DatabasePlan[];
  error?: string;
}> {
  try {
    const supabase = await createServiceClient();

    // Query products table for database type, only valid engine subs
    const { data, error } = await supabase
      .from('products')
      .select('id, name, description, type, sub, price, fixed_price, resources, slug, discount')
      .eq('type', 'database')
      .in('sub', ['pg', 'mysql', 'mongodb'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[fetchDatabasePlans] Supabase error:', error);
      return {
        success: false,
        error: 'Failed to fetch database plans',
      };
    }

    // Map products to DatabasePlan format
    const plans: DatabasePlan[] = (data || []).map((product) => {
      const res = (product.resources as Record<string, number> | null) || {};
      return {
        id: product.id,
        name: product.name || '',
        description: product.description || '',
        price: product.price ?? null,
        discount: product.discount ?? null,
        sub: product.sub,
        slug: (product as Record<string, unknown>).slug as string | undefined,
        resources: {
          cpu: res.cpu || undefined,
          ram: res.ram || undefined,
          storage: res.storage || undefined,
        },
      };
    });

    return {
      success: true,
      plans,
    };
  } catch (err) {
    console.error('[fetchDatabasePlans] Error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
