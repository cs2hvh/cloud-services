import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getTemplateDeployStats } from '@/lib/templates/queries/marketplace';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const db = await createServiceClient();
  const { data } = await db
    .from('templates')
    .select('id')
    .eq('slug', slug)
    .eq('visibility', 'published')
    .single();

  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const stats = await getTemplateDeployStats(data.id);

  return NextResponse.json(stats, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
  });
}
