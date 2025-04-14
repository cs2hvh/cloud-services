import query from '@/lib/db/mysql';
import { DB_Project } from '@/lib/db/mysql/types';
import { generateRandomUuid } from '@/lib/utils';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { name, description, owner } = await req.json();
        const id = generateRandomUuid();
        await query.projects.create({
            id,
            name,
            description,
            owner,
            users: [owner]
        } as Partial<DB_Project>)

        return NextResponse.json({ message: 'Project created successfully' }, { status: 201 });
    } catch (error) {
        console.error('[POST /projects]', error);
        return NextResponse.json(
            { message: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
