import db from '@/lib/db/mysql/lib';
import { DB_ProjectLog } from '@/lib/db/mysql/types';
import { projectSchema } from '@/types/zod/project';
import { NextRequest, NextResponse } from 'next/server';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
    const { id } = await params;
    const conn = await db.getConnection(); // Get a connection for transaction
    try {
        const body = await req.json();
        const parsed = projectSchema.parse(body);

        const fields = Object.keys(parsed);
        const values = Object.values(parsed);

        const setClause = fields.map((key) => `\`${key}\` = ?`).join(', ');

        await conn.query(
            `UPDATE projects SET ${setClause} WHERE id = ?`,
            [...values, id]
        );

        const logEntry = {
            event: 'Settings',
            text: `Updated fields: ${fields.join(', ')}`,
            project_id: id,
        };

        const logFields = Object.keys(logEntry);
        const logValues = Object.values(logEntry);

        await conn.query(
            `INSERT INTO project_logs (${logFields.join(', ')}, created) VALUES (${logFields.map(() => '?').join(', ')}, NOW())`,
            logValues
        );

        await conn.commit();
        return NextResponse.json({ message: 'Project updated successfully' });
    } catch (error) {
        await conn.rollback();
        console.error('[PATCH /projects/:id]', error);
        return NextResponse.json(
            { message: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    } finally {
        conn.release(); // Important to release the connection
    }
}

export async function PUT(req: NextRequest, { params }: Params) {
    const { id } = await params;

    try {
        const body = await req.json();
        // console.log(body)
        const { event, users } = body as {
            event: 'add' | 'remove';
            users: string[];
        };

        if (!['add', 'remove'].includes(event) || !Array.isArray(users)) {
            return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
        }

        // Get current users from DB
        const [rows] = await db.query<any[]>(
            'SELECT users FROM projects WHERE id = ?',
            [id]
        );

        if (!rows.length) {
            return NextResponse.json({ message: 'Project not found' }, { status: 404 });
        }

        let currentUsers: string[] = [];

        try {
            currentUsers = JSON.parse(rows[0].users || '[]');
        } catch (err) {
            console.warn('Invalid JSON in existing users field');
            currentUsers = [];
        }

        let updatedUsers: string[];

        if (event === 'add') {
            const set = new Set([...currentUsers, ...users]);
            updatedUsers = Array.from(set);
        } else {
            updatedUsers = currentUsers.filter(u => !users.includes(u));
        }

        await db.query(
            'UPDATE projects SET users = ? WHERE id = ?',
            [JSON.stringify(updatedUsers), id]
        );

        return NextResponse.json({
            message: `Users ${event === 'add' ? 'added to' : 'removed from'} project.`,
            users: updatedUsers,
        });
    } catch (err) {
        console.error('[PUT /projects/:id/users]', err);
        return NextResponse.json(
            { message: 'Failed to update project users.' },
            { status: 500 }
        );
    }
}
