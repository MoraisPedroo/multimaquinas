import pool from './db_connect.js';

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Conexão com o banco Neon bem-sucedida!');

    const result = await client.query('SELECT 1 AS test');
    console.log('✅ Resultado do teste:', result.rows[0].test);

    client.release(); // devolve ao pool
  } catch (err) {
    console.error('❌ Erro ao conectar:', err.message);
  } finally {
    await pool.end(); // encerra o pool de conexões
  }
}

testConnection();
