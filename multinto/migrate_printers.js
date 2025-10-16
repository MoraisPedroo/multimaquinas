// migrate_printers.js
import pool from './db_connect.js'; // seu pool pg (ESModule)
import { initialPrinters, initialPrinters2floor } from './printers-data.js';

const UNIT_NAME = 'Hemes Pardini-NTO';

async function getOrCreateUnit(client, name) {
  const res = await client.query(
    `INSERT INTO units(name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [name]
  );
  return res.rows[0].id;
}

async function upsertPrinter(client, printer, unitId) {
  const query = `
    INSERT INTO printers (name, department, selb, ip, observations, floor, pos, unit_id, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now(), now())
    ON CONFLICT (name) DO UPDATE
    SET department = EXCLUDED.department,
        selb = EXCLUDED.selb,
        ip = EXCLUDED.ip,
        observations = EXCLUDED.observations,
        floor = EXCLUDED.floor,
        pos = EXCLUDED.pos,
        unit_id = EXCLUDED.unit_id,
        updated_at = now()
    RETURNING id;
  `;
  const params = [
    printer.name || null,
    printer.department || null,
    printer.selb || null,
    printer.ip || null,
    printer.observations || null,
    printer.floor ?? null,
    JSON.stringify(printer.pos ?? {}),
    unitId
  ];
  const res = await client.query(query, params);
  return res.rows[0].id;
}

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const unitId = await getOrCreateUnit(client, UNIT_NAME);
    console.log('Unit id:', unitId);

    const allPrinters = [...initialPrinters, ...initialPrinters2floor];

    for (const p of allPrinters) {
      const pid = await upsertPrinter(client, p, unitId);
      console.log(`Upserted printer ${p.name} -> id ${pid}`);
    }

    await client.query('COMMIT');
    console.log('✅ Migração concluída com sucesso.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erro na migração:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
