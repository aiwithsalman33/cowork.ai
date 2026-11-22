/* global process, console */
// Runs DB migrations, then the API (port 4000) and the web app (port 3000) in one container.
// If either process exits, the other is stopped so Docker restarts the container cleanly.
import { spawn, spawnSync } from 'node:child_process';

const API_MEM = process.env.API_MAX_MEMORY_MB ?? '384';
const WEB_MEM = process.env.WEB_MAX_MEMORY_MB ?? '256';

const migrate = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: '/app/apps/api', stdio: 'inherit' });
if (migrate.status !== 0) {
  console.error('[start] prisma migrate deploy failed');
  process.exit(1);
}

const children = [];
function run(name, args, opts) {
  const child = spawn('node', args, { stdio: 'inherit', ...opts });
  child.on('exit', (code, signal) => {
    console.error(`[start] ${name} exited (code ${code}, signal ${signal}) — stopping container`);
    for (const c of children) if (c !== child && c.exitCode === null) c.kill('SIGTERM');
    process.exit(code ?? 1);
  });
  children.push(child);
}

run('api', [`--max-old-space-size=${API_MEM}`, 'dist/index.js'], {
  cwd: '/app/apps/api',
  env: { ...process.env, PORT: '4000', HOST: '0.0.0.0' },
});
run('web', [`--max-old-space-size=${WEB_MEM}`, 'apps/web/server.js'], {
  cwd: '/app/web',
  env: { ...process.env, PORT: '3000', HOSTNAME: '0.0.0.0' },
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    for (const c of children) if (c.exitCode === null) c.kill(sig);
  });
}
