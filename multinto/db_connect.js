// server.js
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import pool from './db_connect.js'; // seu pool já configurado (Neon)

const app = express();
const PORT = process.env.PORT || 3001;
const DEFAULT_UNIT = 'Hemes Pardini-NTO';

app.use(cors()); // ajuste origins em produção
app.use(bodyParser.json());

// GET /api/printers?unit=...&floor=...
app.get('/api/printers', async (req, res) => {
  const unit = req.query.unit || DEFAULT_UNIT;
  const floor = req.query.floor ? parseInt(req.query.floor, 10) : null;

  try {
    // busca id da unit
    const unitRes = await pool.query('SELECT id FROM units WHERE name = $1', [unit]);
    if (unitRes.rowCount === 0) return res.json([]);
    const unitId = unitRes.rows[0].id;

    const params = [unitId];
    let sql = 'SELECT name, department, selb, ip, observations, floor, pos, created_at, updated_at FROM printers WHERE unit_id = $1';
    if (floor !== null) {
      params.push(floor);
      sql += ` AND floor = $2`;
    }
    const printersRes = await pool.query(sql, params);
    return res.json(printersRes.rows);
  } catch (err) {
    console.error('GET /api/printers error', err);
    return res.status(500).json({ error: 'Erro ao buscar impressoras' });
  }
});

// POST /api/printers  (cria ou upsert por name)
app.post('/api/printers', async (req, res) => {
  const unit = req.body.unit || DEFAULT_UNIT;
  const p = req.body.printer;
  if (!p || !p.name) return res.status(400).json({ error: 'printer.name obrigatório' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // garante unidade
    const unitRes = await client.query(
      `INSERT INTO units(name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET updated_at = now() RETURNING id`,
      [unit]
    );
    const unitId = unitRes.rows[0].id;

    const upsert = `
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
      RETURNING name, department, selb, ip, observations, floor, pos, unit_id;
    `;
    const params = [
      p.name,
      p.department || null,
      p.selb || null,
      p.ip || null,
      p.observations || null,
      p.floor ?? null,
      JSON.stringify(p.pos ?? {}),
      unitId
    ];
    const up = await client.query(upsert, params);
    await client.query('COMMIT');
    return res.status(201).json(up.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/printers error', err);
    return res.status(500).json({ error: 'Erro ao salvar impressora' });
  } finally {
    client.release();
  }
});

// PUT /api/printers/:selb  (atualiza completo por selb)
app.put('/api/printers/:selb', async (req, res) => {
  const selb = req.params.selb;
  const p = req.body.printer;
  if (!p) return res.status(400).json({ error: 'printer body obrigatório' });

  try {
    const update = `
      UPDATE printers
      SET name=$1, department=$2, selb=$3, ip=$4, observations=$5, floor=$6, pos=$7, updated_at = now()
      WHERE selb = $8
      RETURNING name, department, selb, ip, observations, floor, pos;
    `;
    const params = [
      p.name,
      p.department || null,
      p.selb || null,
      p.ip || null,
      p.observations || null,
      p.floor ?? null,
      JSON.stringify(p.pos ?? {}),
      selb
    ];
    const r = await pool.query(update, params);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Impressora não encontrada' });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error('PUT /api/printers/:selb error', err);
    return res.status(500).json({ error: 'Erro ao atualizar impressora' });
  }
});

// PATCH /api/printers/:selb/pos - atualiza apenas pos (reposicionar)
app.patch('/api/printers/:selb/pos', async (req, res) => {
  const selb = req.params.selb;
  const pos = req.body.pos;
  if (!pos) return res.status(400).json({ error: 'pos obrigatório' });
  try {
    const r = await pool.query(
      `UPDATE printers SET pos = $1, updated_at = now() WHERE selb = $2 RETURNING name, selb, pos;`,
      [JSON.stringify(pos), selb]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Impressora não encontrada' });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error('PATCH /api/printers/:selb/pos error', err);
    return res.status(500).json({ error: 'Erro ao atualizar posição' });
  }
});

// DELETE /api/printers/:selb
app.delete('/api/printers/:selb', async (req, res) => {
  const selb = req.params.selb;
  try {
    const r = await pool.query('DELETE FROM printers WHERE selb = $1 RETURNING name, selb;', [selb]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Impressora não encontrada' });
    return res.json({ deleted: true, printer: r.rows[0] });
  } catch (err) {
    console.error('DELETE /api/printers/:selb error', err);
    return res.status(500).json({ error: 'Erro ao remover impressora' });
  }
});

app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});
