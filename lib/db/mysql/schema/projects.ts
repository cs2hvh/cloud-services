import type { ResultSetHeader } from 'mysql2';
import db from '../lib';
import { DB_Project, DB_Count, DB_ProjectLog } from '../types';

const Projects = {
    // Get a project by ID
    get_by_id: async (id: string): Promise<DB_Project | null> => {
        try {
            const [rows] = await db.query<DB_Project[]>('SELECT * FROM projects WHERE id = ?', [id]);
            if (!rows.length) return null;
            return rows[0];
        } catch (err) {
            console.log(`[DB] Error while getting project by id: ${err}`);
            return null;
        }
    },

    // Get all projects where user is involved
    get_all_by_user: async (userId: string): Promise<DB_Project[]> => {
        try {
            const [rows] = await db.query<DB_Project[]>(
                'SELECT * FROM projects WHERE JSON_CONTAINS(users, ?)',
                [JSON.stringify(userId)]
            );
            return rows;
        } catch (err) {
            console.log(`[DB] Error while getting projects by userId: ${err}`);
            return [];
        }
    },

    create: async (props: Partial<DB_Project>): Promise<string | null> => {
        try {
            const processedProps = {
                ...props,
                users: props.users ? JSON.stringify(props.users) : '[]', // ✅ make it JSON
            };

            const keys = Object.keys(processedProps);
            const values = Object.values(processedProps);

            const [result] = await db.query<ResultSetHeader>(
                `INSERT INTO projects (${keys.join(', ')}, created) VALUES (${keys.map(() => '?').join(', ')}, NOW())`,
                values
            );

            return props.id ?? null;
        } catch (err) {
            console.log(`[DB] Error while creating project: ${err}`);
            return null;
        }
    },

    // Update an existing project
    update: async (id: string, props: Partial<DB_Project>): Promise<boolean> => {
        try {
            const keys = Object.keys(props);
            const [result] = await db.query<ResultSetHeader>(
                `UPDATE projects SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
                [...Object.values(props), id]
            );
            return result.affectedRows > 0;
        } catch (err) {
            console.log(`[DB] Error while updating project: ${err}`);
            return false;
        }
    },

    // Delete a project
    delete: async (id: string): Promise<boolean> => {
        try {
            const [result] = await db.query<ResultSetHeader>('DELETE FROM projects WHERE id = ?', [id]);
            return result.affectedRows > 0;
        } catch (err) {
            console.log(`[DB] Error while deleting project: ${err}`);
            return false;
        }
    },

    get_logs: async (projectId: string): Promise<DB_ProjectLog[] | null> => {
        try {
            const [rows] = await db.query<DB_ProjectLog[]>('SELECT * FROM project_logs WHERE project_id = ?', [projectId]);
            if (!rows.length) return null;
            return rows;
        } catch (err) {
            console.log(`[DB] Error while getting project logs by project id: ${err}`);
            return null;
        }
    },

    add_log: async (props: Partial<DB_Project>): Promise<boolean> => {
        try {

            const keys = Object.keys(props);
            const values = Object.values(props);

            const [result] = await db.query<ResultSetHeader>(
                `INSERT INTO project_logs (${keys.join(', ')}, created) VALUES (${keys.map(() => '?').join(', ')}, NOW())`,
                values
            );

            return result.affectedRows > 0;
        } catch (err) {
            console.log(`[DB] Error while creating project: ${err}`);
            return false;
        }
    },

    // Optional: count all projects
    count_all: async (): Promise<number> => {
        try {
            const [rows] = await db.query<DB_Count[]>('SELECT COUNT(*) FROM projects');
            return rows[0]['COUNT(*)'];
        } catch (err) {
            console.log(`[DB] Error while counting projects: ${err}`);
            return 0;
        }
    }
};

export default Projects;
