import db from '@/lib/db/mysql/lib';
import { DB_User } from '@/lib/db/mysql/types';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const usersParam = searchParams.get('ids');

    if (!usersParam) {
        return NextResponse.json({ error: 'Missing users param' }, { status: 404 });
    }

    const usernames = usersParam.split(',').map(u => u.trim()).filter(Boolean);

    if (usernames.length === 0) {
        return NextResponse.json({ error: 'Invalid users param' }, { status: 404 });
    }

    try {
        const placeholders = usernames.map(() => '?').join(',');
        const [rows] = await db.query<DB_User[]>(
            `SELECT id, username, avatar, email FROM users WHERE id IN (${placeholders}) ORDER BY created_at DESC`,
            usernames
        );
        return NextResponse.json(rows);
    } catch (err) {
        console.error('[DB] Error while getting users:', err);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
}
