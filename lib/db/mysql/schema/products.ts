import type { DB_Product } from '../types';
import db from '../lib';

const Products = {
    // Get all products by type (vps, vds, game, database)
    get_by_type: async (type: string): Promise<DB_Product[]> => {
        try {
            const [rows] = await db.query<DB_Product[]>(
                'SELECT * FROM products WHERE type = ? ORDER BY price ASC',
                [type]
            );
            return rows;
        } catch (err) {
            console.log(`[DB] Error while getting products by type: ${err}`);
            return [];
        }
    },

    // Get all products by type and sub (e.g. game + cs2, database + postgres)
    get_by_sub: async (type: string, sub: string): Promise<DB_Product[]> => {
        try {
            const [rows] = await db.query<DB_Product[]>(
                'SELECT * FROM products WHERE type = ? AND sub = ? ORDER BY price ASC',
                [type, sub]
            );
            return rows;
        } catch (err) {
            console.log(`[DB] Error while getting products by sub: ${err}`);
            return [];
        }
    },

    // Get a single product by ID
    get_by_id: async (id: string): Promise<DB_Product | null> => {
        try {
            const [rows] = await db.query<DB_Product[]>(
                'SELECT * FROM products WHERE id = ?',
                [id]
            );
            if (!rows.length) return null;
            return rows[0];
        } catch (err) {
            console.log(`[DB] Error while getting product by id: ${err}`);
            return null;
        }
    }
};

export default Products;
