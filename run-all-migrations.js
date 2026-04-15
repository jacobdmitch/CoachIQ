import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './services/database.js';
import logger from './services/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations(){
  const migrationsDir = path.join(__dirname,'migrations');
  try{
    if(!fs.existsSync(migrationsDir)){
      logger.warn('Migrations directory not found');
      return;
    }
    const migrationFiles = fs.readdirSync(migrationsDir).filter(f=>f.endsWith('.sql')).sort();
    if(migrationFiles.length===0){logger.warn('No migration files found');return;}
    logger.info(`Found ${migrationFiles.length} migration file(s)`);
    for(const file of migrationFiles){
      const filePath = path.join(migrationsDir,file);
      const sql = fs.readFileSync(filePath,'utf-8');
      logger.info(`Running migration: ${file}`);
      try{await pool.query(sql);logger.info(`Migration completed: ${file}`);}catch(err){logger.error(`Migration failed: ${file}`,err);throw err;}
    }
    logger.info('All migrations completed successfully');
  }catch(err){
    logger.error('Migration process failed:',err);
    process.exit(1);
  }finally{
    await pool.end();
  }
}

runMigrations();
