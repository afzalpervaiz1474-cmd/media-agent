import { defineConfig, loadEnv, type ViteDevServer, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins: any[] = [react(), tailwindcss()];
  try {
    // @ts-ignore
    const m = await import('./.vite-source-tags.js');
    plugins.push(m.sourceTags());
  } catch {}

  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  // Also load all .env files into process.env so API handlers can access server-side secrets
  const allEnv = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(allEnv)) {
    if (!(k in process.env)) process.env[k] = v;
  }
  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

function buildApiIndex(): Array<{ path: string; pattern: RegExp; specificity: number; paramNames: Record<string, string> }> {
    const results: Array<{ path: string; pattern: RegExp; specificity: number; paramNames: Record<string, string> }> = [];
    const apiBase = join(process.cwd(), 'api');
    function walk(dir: string, relative: string) {
      if (!existsSync(dir)) return;
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const relPath = relative ? relative + '/' + entry : entry;
        if (statSync(fullPath).isDirectory()) {
          walk(fullPath, relPath);
        } else if (entry.endsWith('.js')) {
          const placeholder = '__DYN_SEG__';
          const paramNames: Record<string, string> = {};
          const patternStr = relPath
            .replace(/\[([^\]]+)\]/g, (_, name) => { paramNames[name] = name; return placeholder; })
            .replace(/\.js$/, '')
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(new RegExp(placeholder, 'g'), '([^/]+)');
          try {
            const pattern = new RegExp('^' + patternStr + '$');
            const segments = (relPath.match(/[^/]+/g) || []);
            const paramCount = (relPath.match(/\[[^\]]+\]/g) || []).length;
            const specificity = segments.length - paramCount;
            results.push({ path: fullPath, pattern, specificity, paramNames });
          } catch { /* skip invalid patterns */ }
        }
      }
    }
    walk(apiBase, '');
    results.sort((a, b) => b.specificity - a.specificity || a.path.length - b.path.length);
    return results;
  }

  const apiIndex = buildApiIndex();

  async function handleApiRequest(req: any, res: any) {
    try {
      if (res.headersSent) return;
      if (req.method === 'OPTIONS') {
        for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
        res.statusCode = 204;
        res.end();
        return;
      }
      // Strip the /api prefix so patterns match (patterns are relative to api/)
      const rawUrl = req.url || '/';
      const urlPath = rawUrl.split('?')[0].replace(/^\/api\/?/, '');
      const urlObj = new URL(rawUrl, `http://${req.headers.host || process.env.APP_HOST || 'localhost'}`);
      const queryParams: Record<string, string> = {};
      urlObj.searchParams.forEach((value, key) => { queryParams[key] = value; });
      req.query = queryParams;
      let match: { path: string; pattern: RegExp; specificity: number; paramNames: Record<string, string> } | undefined;
      for (const entry of apiIndex) {
        if (entry.pattern.test(urlPath)) {
          match = entry;
          break;
        }
      }
      if (!match) {
        for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }
      const dynMatch = urlPath.match(match.pattern);
      if (dynMatch && dynMatch.length > 1) {
        const paramKeys = Object.keys(match.paramNames);
        for (let i = 0; i < paramKeys.length; i++) {
          req.query[paramKeys[i]] = dynMatch[i + 1];
        }
      }
      const mod = await import(pathToFileURL(match.path).href);
      const handler = mod.handler || mod.default;
      if (!handler || typeof handler !== 'function') {
        for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'No handler' }));
        return;
      }
      const origEnd = res.end.bind(res);
      let statusCode = res.statusCode || 200;
      const wrappedRes: any = Object.assign(res, {
        status(code: number) {
          statusCode = code;
          return wrappedRes;
        },
        json(data: any) {
          for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = statusCode;
          origEnd(JSON.stringify(data));
        },
      });
      await handler(req as any, wrappedRes);
      if (!res.writableEnded) {
        res.statusCode = statusCode;
        if (!res.headersSent) {
          for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
          res.setHeader('Content-Type', 'application/json');
        }
        origEnd('');
      }
    } catch (err: any) {
      console.error('[api]', err?.message || err);
      try {
        if (!res.headersSent) {
          for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
          res.setHeader('Content-Type', 'application/json');
        }
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err?.message || 'Internal error' }));
      } catch { /* ignore */ }
    }
  }

  // Plugin that serves the api/ serverless routes in dev.
  // Middleware added directly inside configureServer runs BEFORE Vite's
  // internal middlewares (static file serving / SPA fallback).
  const devApiPlugin: Plugin = {
    name: 'dev-api-routes',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && (req.url === '/api' || req.url.startsWith('/api/'))) {
          await handleApiRequest(req as any, res as any);
          return;
        }
        next();
      });
    },
  };
  plugins.push(devApiPlugin);

  return {
    plugins,
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: processEnvDefines,
  };
})
