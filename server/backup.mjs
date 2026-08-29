import fs from 'node:fs';
import path from 'node:path';

const source = path.resolve(process.env.HORARIO_DATA_DIR || path.join(process.cwd(), 'server-data'));
const destinationRoot = path.resolve(process.env.HORARIO_BACKUP_DIR || path.join(process.cwd(), 'backups'));
if (!fs.existsSync(source)) throw new Error(`Data directory does not exist: ${source}`);
fs.mkdirSync(destinationRoot, { recursive: true });

const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
const destination = path.join(destinationRoot, `horario-${stamp}`);
fs.cpSync(source, destination, { recursive: true, errorOnExist: true });

const backups = fs.readdirSync(destinationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('horario-'))
    .sort((a, b) => b.name.localeCompare(a.name));
for (const old of backups.slice(30)) fs.rmSync(path.join(destinationRoot, old.name), { recursive: true, force: true });
console.log(`Backup created: ${destination}`);

