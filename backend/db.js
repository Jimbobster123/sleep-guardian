import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool, types } = pkg;

// TIMESTAMP WITHOUT TIME ZONE: return the value as text from Postgres instead of a JS Date.
// Otherwise JSON.stringify turns it into an ISO UTC string and the client mis-reads wall times.
types.setTypeParser(1114, (val) => val);

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Test database connection
export async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Successfully connected to PostgreSQL database');
    client.release();
    return true;
  } catch (err) {
    console.error('❌ Failed to connect to database:', err.message);
    return false;
  }
}

export default pool;
