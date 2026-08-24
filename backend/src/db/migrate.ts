import fs from 'fs';
import path from 'path';
import pool from './pool';

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Get already-applied migrations
    const { rows: applied } = await client.query(
      'SELECT filename FROM _migrations ORDER BY id'
    );
    const appliedSet = new Set(applied.map((r: { filename: string }) => r.filename));

    // Read migration files
    let migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      migrationsDir = path.join(__dirname, '../../src/db/migrations');
    }
    if (!fs.existsSync(migrationsDir)) {
      migrationsDir = path.join(process.cwd(), 'src/db/migrations');
    }
    
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      for (const file of files) {
        if (appliedSet.has(file)) {
          console.log(`  ✓ Already applied: ${file}`);
          continue;
        }

        console.log(`  → Applying: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query(
            'INSERT INTO _migrations (filename) VALUES ($1)',
            [file]
          );
          await client.query('COMMIT');
          console.log(`  ✓ Applied: ${file}`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`  ✗ Failed: ${file}`, err);
          throw err;
        }
      }
    }

    console.log('\n[Database] All migrations applied successfully.');
  } finally {
    client.release();
  }
}

// Allow direct CLI execution: node dist/db/migrate.js or tsx src/db/migrate.ts
if (require.main === module) {
  runMigrations()
    .then(() => pool.end())
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
