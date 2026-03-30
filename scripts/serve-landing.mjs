import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, normalize, relative, resolve, sep } from 'node:path';
import process from 'node:process';

const ROOT_DIR = process.cwd();
const LANDING_DIR = resolve(ROOT_DIR, process.env.LANDING_STATIC_DIR ?? 'landing');
const PUBLIC_DIR = resolve(ROOT_DIR, process.env.LANDING_PUBLIC_DIR ?? 'frontend/public');
const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.LANDING_PORT ?? '4174', 10);
const LANDING_GA_MEASUREMENT_ID = (process.env.BUURTCHECK_GA_MEASUREMENT_ID ?? '').trim();
const GA_MEASUREMENT_PLACEHOLDER = '__BUURTCHECK_GA_MEASUREMENT_ID__';

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function escapeHtmlAttribute(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeRequestPath(urlPathname) {
  if (!urlPathname || urlPathname === '/') {
    return 'index.html';
  }

  const decoded = decodeURIComponent(urlPathname).replace(/^\/+/, '');
  return normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
}

function isSafeCandidate(baseDir, candidatePath) {
  const rel = relative(baseDir, candidatePath);
  return rel === '' || (!rel.startsWith('..') && !rel.includes(`..${sep}`));
}

function resolveAsset(requestPath) {
  const searchRoots = [
    { label: 'landing', root: LANDING_DIR },
    { label: 'public', root: PUBLIC_DIR },
  ];

  for (const { label, root } of searchRoots) {
    const candidate = resolve(root, requestPath);
    if (!isSafeCandidate(root, candidate)) {
      continue;
    }

    if (!existsSync(candidate)) {
      continue;
    }

    if (!statSync(candidate).isFile()) {
      continue;
    }

    return {
      filePath: candidate,
      source: label,
    };
  }

  return null;
}

function sendNotFound(response) {
  response.writeHead(404, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end('Not found');
}

function sendMethodNotAllowed(response) {
  response.writeHead(405, {
    Allow: 'GET, HEAD',
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end('Method not allowed');
}

const server = createServer((request, response) => {
  if (!request.url) {
    sendNotFound(response);
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendMethodNotAllowed(response);
    return;
  }

  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  const requestPath = normalizeRequestPath(url.pathname);
  const asset = resolveAsset(requestPath);

  if (!asset) {
    sendNotFound(response);
    return;
  }

  const fileExtension = extname(asset.filePath).toLowerCase();
  const contentType = CONTENT_TYPES[fileExtension] ?? 'application/octet-stream';

  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'X-Landing-Asset-Source': asset.source,
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  if (fileExtension === '.html') {
    const html = readFileSync(asset.filePath, 'utf8').replaceAll(
      GA_MEASUREMENT_PLACEHOLDER,
      escapeHtmlAttribute(LANDING_GA_MEASUREMENT_ID),
    );
    response.end(html);
    return;
  }

  const stream = createReadStream(asset.filePath);
  stream.on('error', () => {
    if (!response.headersSent) {
      response.writeHead(500, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      });
    }
    response.end('Unable to read file');
  });
  stream.pipe(response);
});

server.listen(PORT, HOST, () => {
  console.log(`Landing page available at http://${HOST}:${PORT}`);
});
