import type { ResultSetHeader } from 'mysql2';
import db from '../lib';
import { DB_Count, DB_Session, DB_User } from '../types';

const Users = {
    // Get a user by ID
    get_by_id: async (userId: string): Promise<DB_User | null> => {
        try {
            const [rows] = await db.query<DB_User[]>('SELECT * FROM users WHERE id = ?', [userId]);
            if (!rows.length) return null;
            return rows[0];
        } catch (err) {
            console.log(`[DB] Error while getting user by id: ${err}`);
            return null;
        }
    },

    get_by_email: async (email: string): Promise<DB_User | null> => {
        try {
            const [rows] = await db.query<DB_User[]>('SELECT * FROM users WHERE email = ?', [email]);
            if (!rows.length) return null;
            return rows[0];
        } catch (err) {
            console.log(`[DB] Error while getting user by id: ${err}`);
            return null;
        }
    },

    // Get all users
    get_all: async (): Promise<DB_User[]> => {
        try {
            const [rows] = await db.query<DB_User[]>('SELECT * FROM users ORDER BY created_at DESC');
            return rows;
        } catch (err) {
            console.log(`[DB] Error while getting all users: ${err}`);
            return [];
        }
    },

    get_by_discord: async (discordId: string): Promise<DB_User | null> => {
        try {
            const [rows] = await db.query<DB_User[]>('SELECT * FROM users WHERE discord = ?', [discordId]);
            if (!rows.length) return null;
            return rows[0];
        } catch (err) {
            console.log(`[DB] Error while getting user by discord: ${err}`);
            return null;
        }
    },

    get_by_steam: async (steamId: string): Promise<DB_User | null> => {
        try {
            const [rows] = await db.query<DB_User[]>('SELECT * FROM users WHERE steam = ?', [steamId]);
            if (!rows.length) return null;
            return rows[0];
        } catch (err) {
            console.log(`[DB] Error while getting user by steamid: ${err}`);
            return null;
        }
    },

    get_sessions: async (userId: string): Promise<DB_Session[] | null> => {
        try {
            const [rows] = await db.query<DB_Session[]>('SELECT * FROM sa_session WHERE user_id = ?', [userId]);
            if (!rows.length) return null;
            return rows;
        } catch (err) {
            console.log(`[DB] Error while getting user by steamid: ${err}`);
            return null;
        }
    },

    // Create a new user
    create: async (props: Partial<DB_User>): Promise<number | null> => {
        // Acquire a connection from the pool
        const connection = await db.getConnection();

        try {
            // Begin the transaction
            await connection.beginTransaction();

            // Prepare the query parts for inserting a new user
            const keys = Object.keys(props);
            const values = Object.values(props);

            // Insert the user into the users table
            const [result] = await connection.query<ResultSetHeader>(
                `INSERT INTO users (${keys.join(', ')}, created_at) VALUES (${keys.map(() => '?').join(', ')}, NOW())`,
                values
            );

            // Get the new user's id (assuming auto-increment)
            const userId = result.insertId;

            // Insert a wallet record for the new user with an initial balance of 0.00.
            // await connection.query<ResultSetHeader>(
            //     `INSERT INTO user_wallet (user_id, balance, created_at, updated_at)
            //  VALUES (?, 0.00, NOW(), NOW())`,
            //     [userId]
            // );

            // Commit the transaction once both queries have succeeded.
            await connection.commit();
            connection.release();
            return userId;
        } catch (err) {
            // Roll back the transaction in case of an error.
            await connection.rollback();
            connection.release();
            console.log(`[DB] Error while creating user and wallet: ${err}`);
            return null;
        }
    },

    // Update an existing user
    update: async (id: string, props: Partial<DB_User>): Promise<boolean> => {
        try {
            const keys = Object.keys(props);

            const [result] = await db.query<ResultSetHeader>(
                `UPDATE users SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
                [...Object.values(props), id]
            );

            return result.affectedRows > 0;
        } catch (err) {
            console.log(`[DB] Error while updating user: ${err}`);
            return false;
        }
    },

    // Delete a user by ID
    delete: async (userId: string): Promise<boolean> => {
        try {
            const [result] = await db.query<ResultSetHeader>('DELETE FROM users WHERE id = ?', [userId]);
            return result.affectedRows > 0;
        } catch (err) {
            console.log(`[DB] Error while deleting user: ${err}`);
            return false;
        }
    },

    // Count all users
    count_all: async (): Promise<number> => {
        try {
            const [rows] = await db.query<DB_Count[]>('SELECT COUNT(*) FROM users');
            return rows[0]['COUNT(*)'];
        } catch (err) {
            console.log(`[DB] Error while counting users: ${err}`);
            return 0;
        }
    }
};

export default Users;
