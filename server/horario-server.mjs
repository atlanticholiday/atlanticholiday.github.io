import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(serverDir, '..');
const dataDir = path.resolve(process.env.HORARIO_DATA_DIR || path.join(rootDir, 'server-data'));
const uploadDir = path.join(dataDir, 'uploads');
const databasePath = path.join(dataDir, 'horario.sqlite');
const host = process.env.HORARIO_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.HORARIO_PORT || '5500', 10);
const maxUploadBytes = 100 * 1024 * 1024;
const sessionDays = 30;
const firebaseApiKey = process.env.HORARIO_FIREBASE_API_KEY || 'AIzaSyBd4x0WVWC0CjSG98C1521oFPRE5TO5lms';
const configuredAdmins = new Set(String(process.env.HORARIO_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean));

fs.mkdirSync(uploadDir, { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        firebase_uid TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        employee_id TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_departments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#8b5cf6',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS task_comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        author_user_id TEXT NOT NULL REFERENCES users(id),
        author_email TEXT NOT NULL,
        author_name TEXT NOT NULL,
        author_employee_id TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS task_attachments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        uploaded_at TEXT NOT NULL,
        uploaded_by_user_id TEXT NOT NULL REFERENCES users(id),
        uploaded_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id, uploaded_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
`);

const contentTypes = new Map([
    ['.css', 'text/css; charset=utf-8'], ['.gif', 'image/gif'], ['.html', 'text/html; charset=utf-8'],
    ['.ico', 'image/x-icon'], ['.jpeg', 'image/jpeg'], ['.jpg', 'image/jpeg'],
    ['.js', 'application/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
    ['.png', 'image/png'], ['.svg', 'image/svg+xml'], ['.webp', 'image/webp']
]);

function nowIso() {
    return new Date().toISOString();
}

function hash(value) {
    return createHash('sha256').update(value).digest('hex');
}

function json(response, status, payload, headers = {}) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    response.end(JSON.stringify(payload));
}

function apiError(response, status, message, code = 'request-failed') {
    json(response, status, { error: { code, message } });
}

async function readJson(request, limit = 1024 * 1024) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > limit) throw Object.assign(new Error('Request is too large.'), { status: 413 });
        chunks.push(chunk);
    }
    if (!chunks.length) return {};
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        throw Object.assign(new Error('Invalid JSON body.'), { status: 400 });
    }
}

function parseCookies(request) {
    return Object.fromEntries(String(request.headers.cookie || '').split(';').map((part) => {
        const index = part.indexOf('=');
        if (index < 0) return ['', ''];
        return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
    }).filter(([key]) => key));
}

function currentUser(request) {
    const token = parseCookies(request).horario_session;
    if (!token) return null;
    return db.prepare(`
        SELECT users.* FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.active = 1
    `).get(hash(token), nowIso()) || null;
}

function requireUser(request, response) {
    const user = currentUser(request);
    if (!user) apiError(response, 401, 'Please sign in again.', 'unauthenticated');
    return user;
}

function isAdmin(user) {
    return user?.role === 'admin';
}

function parseTask(row) {
    const task = JSON.parse(row.payload);
    return { id: row.id, ...task, attachments: listAttachments(row.id) };
}

function listAttachments(taskId) {
    return db.prepare('SELECT * FROM task_attachments WHERE task_id = ? ORDER BY uploaded_at').all(taskId).map((row) => ({
        id: row.id,
        name: row.original_name,
        contentType: row.content_type,
        size: row.size,
        url: `/api/files/${row.id}`,
        storagePath: row.id,
        uploadedAt: row.uploaded_at,
        uploadedBy: safeParse(row.uploaded_by, {})
    }));
}

function safeParse(value, fallback) {
    try { return JSON.parse(value); } catch { return fallback; }
}

function getTask(taskId) {
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    return row ? parseTask(row) : null;
}

function canAccessTask(user, task) {
    return Boolean(user && task && (isAdmin(user) || (user.employee_id && task.assigneeIds?.includes(user.employee_id))));
}

function taskPayload(input = {}) {
    const allowed = [
        'title', 'description', 'departmentId', 'departmentName', 'section', 'priority', 'dueDate',
        'status', 'assigneeIds', 'assignees', 'updatedAt', 'updatedBy', 'completedAt', 'createdAt', 'createdBy'
    ];
    return Object.fromEntries(allowed.filter((key) => Object.hasOwn(input, key)).map((key) => [key, input[key]]));
}

async function verifyFirebaseToken(idToken) {
    if (!idToken || typeof idToken !== 'string') throw Object.assign(new Error('Missing sign-in token.'), { status: 401 });
    const result = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
    });
    if (!result.ok) throw Object.assign(new Error('The sign-in token could not be verified.'), { status: 401 });
    const payload = await result.json();
    const account = payload.users?.[0];
    if (!account?.localId || !account?.email) throw Object.assign(new Error('The signed-in account has no verified email.'), { status: 401 });
    return { uid: account.localId, email: account.email.toLowerCase(), name: account.displayName || '' };
}

function setSecurityHeaders(response) {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'SAMEORIGIN');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

async function handleAuth(request, response, requestUrl) {
    if (requestUrl.pathname === '/api/auth/exchange' && request.method === 'POST') {
        const body = await readJson(request);
        const identity = await verifyFirebaseToken(body.idToken);
        const timestamp = nowIso();
        const existing = db.prepare('SELECT * FROM users WHERE firebase_uid = ? OR email = ?').get(identity.uid, identity.email);
        const totalUsers = db.prepare('SELECT COUNT(*) count FROM users').get().count;
        const role = configuredAdmins.has(identity.email) || totalUsers === 0 ? 'admin' : (existing?.role || 'member');
        const userId = existing?.id || randomUUID();
        db.prepare(`
            INSERT INTO users (id, firebase_uid, email, display_name, employee_id, role, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET firebase_uid=excluded.firebase_uid, email=excluded.email,
                display_name=excluded.display_name, employee_id=excluded.employee_id, role=excluded.role,
                active=1, updated_at=excluded.updated_at
        `).run(userId, identity.uid, identity.email, String(body.name || identity.name || ''), String(body.employeeId || existing?.employee_id || ''), role, existing?.created_at || timestamp, timestamp);

        const token = randomBytes(32).toString('base64url');
        const expires = new Date(Date.now() + sessionDays * 86400000).toISOString();
        db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(timestamp);
        db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(hash(token), userId, expires, timestamp);
        const secure = request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
        return json(response, 200, { user: { id: userId, email: identity.email, role, employeeId: String(body.employeeId || existing?.employee_id || '') } }, {
            'Set-Cookie': `horario_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionDays * 86400}${secure}`
        });
    }
    if (requestUrl.pathname === '/api/auth/logout' && request.method === 'POST') {
        const token = parseCookies(request).horario_session;
        if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token));
        return json(response, 200, { ok: true }, { 'Set-Cookie': 'horario_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
    }
    if (requestUrl.pathname === '/api/session' && request.method === 'GET') {
        const user = currentUser(request);
        return user
            ? json(response, 200, { user: { id: user.id, email: user.email, role: user.role, employeeId: user.employee_id } })
            : apiError(response, 401, 'Please sign in again.', 'unauthenticated');
    }
    return false;
}

async function handleDepartments(request, response, requestUrl, user) {
    if (requestUrl.pathname === '/api/task-departments' && request.method === 'GET') {
        const departments = db.prepare('SELECT * FROM task_departments ORDER BY sort_order, name').all().map((row) => ({
            id: row.id, name: row.name, color: row.color, order: row.sort_order, createdAt: row.created_at, createdBy: safeParse(row.created_by, {})
        }));
        return json(response, 200, { departments });
    }
    if (requestUrl.pathname === '/api/task-departments' && request.method === 'POST') {
        if (!isAdmin(user)) return apiError(response, 403, 'Only administrators can create departments.', 'permission-denied');
        const body = await readJson(request);
        const id = randomUUID();
        db.prepare('INSERT INTO task_departments (id, name, color, sort_order, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')
            .run(id, String(body.name || '').trim(), String(body.color || '#8b5cf6'), Number(body.order) || 0, nowIso(), JSON.stringify(body.createdBy || {}));
        return json(response, 201, { id });
    }
    const match = requestUrl.pathname.match(/^\/api\/task-departments\/([^/]+)$/);
    if (match && request.method === 'DELETE') {
        if (!isAdmin(user)) return apiError(response, 403, 'Only administrators can delete departments.', 'permission-denied');
        const count = db.prepare("SELECT COUNT(*) count FROM tasks WHERE json_extract(payload, '$.departmentId') = ?").get(match[1]).count;
        if (count) return apiError(response, 409, 'Move or delete this department’s tasks first.', 'department-not-empty');
        db.prepare('DELETE FROM task_departments WHERE id = ?').run(match[1]);
        return json(response, 200, { ok: true });
    }
    return false;
}

async function handleTasks(request, response, requestUrl, user) {
    if (requestUrl.pathname === '/api/tasks' && request.method === 'GET') {
        const tasks = db.prepare('SELECT * FROM tasks ORDER BY updated_at DESC').all().map(parseTask).filter((task) => canAccessTask(user, task));
        return json(response, 200, { tasks });
    }
    if (requestUrl.pathname === '/api/tasks' && request.method === 'POST') {
        const body = taskPayload(await readJson(request));
        if (!body.title?.trim()) return apiError(response, 400, 'A task name is required.', 'validation-error');
        if (!isAdmin(user) && !(user.employee_id && body.assigneeIds?.includes(user.employee_id))) {
            return apiError(response, 403, 'You can only create tasks assigned to you.', 'permission-denied');
        }
        const id = randomUUID();
        const timestamp = nowIso();
        body.createdAt ||= timestamp;
        body.updatedAt ||= timestamp;
        db.prepare('INSERT INTO tasks (id, payload, created_at, updated_at, created_by_user_id) VALUES (?, ?, ?, ?, ?)')
            .run(id, JSON.stringify(body), body.createdAt, body.updatedAt, user.id);
        return json(response, 201, { id, task: getTask(id) });
    }

    const taskMatch = requestUrl.pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch) {
        const task = getTask(taskMatch[1]);
        if (!task) return apiError(response, 404, 'Task not found.', 'not-found');
        if (!canAccessTask(user, task)) return apiError(response, 403, 'You do not have access to this task.', 'permission-denied');
        if (request.method === 'PATCH') {
            const current = db.prepare('SELECT payload FROM tasks WHERE id = ?').get(task.id);
            const merged = { ...JSON.parse(current.payload), ...taskPayload(await readJson(request)) };
            if (!isAdmin(user) && !(user.employee_id && merged.assigneeIds?.includes(user.employee_id))) {
                return apiError(response, 403, 'You cannot remove yourself from this task.', 'permission-denied');
            }
            merged.updatedAt ||= nowIso();
            db.prepare('UPDATE tasks SET payload = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(merged), merged.updatedAt, task.id);
            return json(response, 200, { task: getTask(task.id) });
        }
        if (request.method === 'DELETE') {
            if (!isAdmin(user)) return apiError(response, 403, 'Only administrators can delete tasks.', 'permission-denied');
            for (const attachment of db.prepare('SELECT stored_name FROM task_attachments WHERE task_id = ?').all(task.id)) {
                fs.rmSync(path.join(uploadDir, attachment.stored_name), { force: true });
            }
            db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
            return json(response, 200, { ok: true });
        }
    }

    const commentsMatch = requestUrl.pathname.match(/^\/api\/tasks\/([^/]+)\/comments$/);
    if (commentsMatch) {
        const task = getTask(commentsMatch[1]);
        if (!task) return apiError(response, 404, 'Task not found.', 'not-found');
        if (!canAccessTask(user, task)) return apiError(response, 403, 'You do not have access to this task.', 'permission-denied');
        if (request.method === 'GET') {
            const comments = db.prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at').all(task.id).map((row) => ({
                id: row.id, body: row.body, createdAt: row.created_at, authorEmail: row.author_email,
                authorName: row.author_name, authorEmployeeId: row.author_employee_id
            }));
            return json(response, 200, { comments });
        }
        if (request.method === 'POST') {
            const body = await readJson(request);
            if (!String(body.body || '').trim()) return apiError(response, 400, 'A comment cannot be empty.', 'validation-error');
            const id = randomUUID();
            db.prepare(`INSERT INTO task_comments
                (id, task_id, body, created_at, author_user_id, author_email, author_name, author_employee_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(id, task.id, String(body.body).trim(), nowIso(), user.id, user.email, user.display_name || user.email, user.employee_id);
            return json(response, 201, { id });
        }
    }

    const uploadMatch = requestUrl.pathname.match(/^\/api\/tasks\/([^/]+)\/attachments$/);
    if (uploadMatch && request.method === 'POST') {
        const task = getTask(uploadMatch[1]);
        if (!task) return apiError(response, 404, 'Task not found.', 'not-found');
        if (!canAccessTask(user, task)) return apiError(response, 403, 'You do not have access to this task.', 'permission-denied');
        const length = Number(request.headers['content-length'] || 0);
        if (length > maxUploadBytes) return apiError(response, 413, 'File is larger than 100 MB.', 'file-too-large');
        const id = randomUUID();
        const originalName = decodeURIComponent(String(request.headers['x-file-name'] || 'attachment')).slice(0, 240);
        const extension = path.extname(originalName).replace(/[^.a-zA-Z0-9]/g, '').slice(0, 12);
        const storedName = `${id}${extension}`;
        const targetPath = path.join(uploadDir, storedName);
        let size = 0;
        const stream = fs.createWriteStream(targetPath, { flags: 'wx' });
        try {
            for await (const chunk of request) {
                size += chunk.length;
                if (size > maxUploadBytes) throw Object.assign(new Error('File is larger than 100 MB.'), { status: 413 });
                if (!stream.write(chunk)) await new Promise((resolve) => stream.once('drain', resolve));
            }
            await new Promise((resolve, reject) => stream.end((error) => error ? reject(error) : resolve()));
        } catch (error) {
            stream.destroy();
            fs.rmSync(targetPath, { force: true });
            throw error;
        }
        const contentType = String(request.headers['content-type'] || 'application/octet-stream').slice(0, 120);
        const timestamp = nowIso();
        db.prepare(`INSERT INTO task_attachments
            (id, task_id, original_name, stored_name, content_type, size, uploaded_at, uploaded_by_user_id, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, task.id, originalName, storedName, contentType, size, timestamp, user.id, JSON.stringify({ email: user.email, employeeId: user.employee_id, name: user.display_name || user.email }));
        return json(response, 201, { attachment: listAttachments(task.id).find((entry) => entry.id === id) });
    }
    return false;
}

async function handleFiles(request, response, requestUrl, user) {
    const match = requestUrl.pathname.match(/^\/api\/files\/([^/]+)$/);
    if (!match) return false;
    const row = db.prepare('SELECT * FROM task_attachments WHERE id = ?').get(match[1]);
    if (!row) return apiError(response, 404, 'File not found.', 'not-found');
    const task = getTask(row.task_id);
    if (!canAccessTask(user, task)) return apiError(response, 403, 'You do not have access to this file.', 'permission-denied');
    if (request.method === 'DELETE') {
        fs.rmSync(path.join(uploadDir, row.stored_name), { force: true });
        db.prepare('DELETE FROM task_attachments WHERE id = ?').run(row.id);
        return json(response, 200, { ok: true });
    }
    if (request.method === 'GET') {
        const filePath = path.join(uploadDir, row.stored_name);
        if (!fs.existsSync(filePath)) return apiError(response, 404, 'File is missing from disk.', 'not-found');
        response.writeHead(200, {
            'Content-Type': row.content_type,
            'Content-Length': row.size,
            'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.original_name)}`,
            'Cache-Control': 'private, max-age=300'
        });
        fs.createReadStream(filePath).pipe(response);
        return true;
    }
    return false;
}

function serveStatic(request, response, requestUrl) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false;
    const decoded = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
    const filePath = path.resolve(rootDir, `.${decoded}`);
    if (!filePath.startsWith(`${rootDir}${path.sep}`) || filePath.startsWith(`${dataDir}${path.sep}`)) {
        response.writeHead(403); response.end('Forbidden'); return true;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not Found'); return true;
    }
    response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream' });
    if (request.method === 'HEAD') response.end(); else fs.createReadStream(filePath).pipe(response);
    return true;
}

const server = createServer(async (request, response) => {
    setSecurityHeaders(response);
    const requestUrl = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);
    try {
        if (requestUrl.pathname === '/api/health') return json(response, 200, { ok: true, storage: 'local', database: path.basename(databasePath) });
        if (await handleAuth(request, response, requestUrl) !== false) return;
        if (requestUrl.pathname.startsWith('/api/')) {
            const user = requireUser(request, response);
            if (!user) return;
            if (await handleDepartments(request, response, requestUrl, user) !== false) return;
            if (await handleTasks(request, response, requestUrl, user) !== false) return;
            if (await handleFiles(request, response, requestUrl, user) !== false) return;
            return apiError(response, 404, 'API endpoint not found.', 'not-found');
        }
        serveStatic(request, response, requestUrl);
    } catch (error) {
        console.error(error);
        apiError(response, error.status || 500, error.status ? error.message : 'Internal server error.', error.status ? 'request-failed' : 'internal');
    }
});

server.listen(port, host, () => {
    console.log(`Horario server is running at http://${host}:${port}/`);
    console.log(`Local data: ${dataDir}`);
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Horario may already be running.`);
        process.exit(1);
    }
    throw error;
});

