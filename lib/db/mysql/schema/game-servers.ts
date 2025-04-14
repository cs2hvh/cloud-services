import type { ResultSetHeader } from 'mysql2';
import db from '../lib';
import { DB_GameServer } from '../types';

const GameServers = {
    // Get a game server by ID
    get_by_id: async (id: number): Promise<DB_GameServer | null> => {
        try {
            const [rows] = await db.query<DB_GameServer[]>(
                'SELECT * FROM game_servers WHERE id = ?',
                [id]
            );
            if (!rows.length) return null;
            return rows[0];
        } catch (err) {
            console.log(`[DB] Error while getting game server by id: ${err}`);
            return null;
        }
    },

    get_by_userid: async (id: string): Promise<DB_GameServer[] | null> => {
        try {
            const [rows] = await db.query<DB_GameServer[]>(
                'SELECT * FROM game_servers WHERE userid = ?',
                [id]
            );
            if (!rows.length) return null;
            return rows;
        } catch (err) {
            console.log(`[DB] Error while getting game server by userid: ${err}`);
            return null;
        }
    },


    // Get all game servers by project ID
    get_by_projectid: async (projectid: string): Promise<DB_GameServer[]> => {
        try {
            const [rows] = await db.query<DB_GameServer[]>(
                'SELECT * FROM game_servers WHERE projectid = ?',
                [projectid]
            );
            return rows;
        } catch (err) {
            console.log(`[DB] Error while getting game servers by project id: ${err}`);
            return [];
        }
    },

    // Create a new game server
    create: async (props: Partial<DB_GameServer>): Promise<number | null> => {
        try {
            // Clone and safely serialize JSON fields
            const serializedProps = { ...props };
            if (serializedProps.resources) {
                serializedProps.resources = JSON.stringify(serializedProps.resources as object) as any;
            }

            const keys = Object.keys(serializedProps);
            const values = Object.values(serializedProps);

            const sql = `
                INSERT INTO game_servers (${keys.join(', ')})
                VALUES (${keys.map(() => '?').join(', ')})
            `;

            const [result] = await db.query<ResultSetHeader>(sql, values);

            return props.id!;
        } catch (err) {
            console.error(`[DB] Error while creating game server: ${err}`);
            return null;
        }
    },

    // Update a game server
    update: async (id: number, props: Partial<DB_GameServer>): Promise<boolean> => {
        try {
            const keys = Object.keys(props);
            const [result] = await db.query<ResultSetHeader>(
                `UPDATE game_servers SET ${keys.map(key => `${key} = ?`).join(', ')} WHERE id = ?`,
                [...Object.values(props), id]
            );
            return result.affectedRows > 0;
        } catch (err) {
            console.log(`[DB] Error while updating game server: ${err}`);
            return false;
        }
    },

    // Delete a game server
    delete: async (id: number): Promise<boolean> => {
        try {
            const [result] = await db.query<ResultSetHeader>(
                'DELETE FROM game_servers WHERE id = ?',
                [id]
            );
            return result.affectedRows > 0;
        } catch (err) {
            console.log(`[DB] Error while deleting game server: ${err}`);
            return false;
        }
    }
};

export default GameServers;
