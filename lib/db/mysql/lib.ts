import { createPool, Pool } from 'mysql2/promise'

const globalForDb = global as unknown as { db: Pool }

const db = globalForDb.db || createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: parseInt(process.env.DB_PORT || '3306'),
  connectionLimit: 5, // Adjust as needed
})

if (!globalForDb.db) {
  globalForDb.db = db
}

let isReady = false

// This function initializes the tables within a transaction
async function initTables() {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()

    
    // Commit the transaction if all queries succeed
    await connection.commit()
    console.log('[DB] Tables created (or already exist) within a single transaction.')
  } catch (error) {
    // Rollback transaction on error
    await connection.rollback()
    console.error('[DB] Error during table initialization transaction:', error)
  } finally {
    // Always release the connection back to the pool
    connection.release()
  }
}

db.on('connection', async () => {
  if (isReady) return
  isReady = true
  console.log('[DB] Connected to database')

  // Initialize tables in one transaction when connection is ready
  await initTables()
})

export default db
