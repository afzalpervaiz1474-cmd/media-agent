import { parse } from 'node:url';

// Import all handler modules - each exports a named 'handler' function
import { handler as accounts } from '../lib/server/accounts.js';
import { handler as automations } from '../lib/server/automations.js';
import { handler as content } from '../lib/server/content.js';
import { handler as dashboard } from '../lib/server/dashboard.js';
import { handler as health } from '../lib/server/health.js';
import { handler as jobs } from '../lib/server/jobs.js';
import { handler as me } from '../lib/server/me.js';
import { handler as media } from '../lib/server/media.js';
import { handler as notifications } from '../lib/server/notifications.js';
import { handler as publish } from '../lib/server/publish.js';
import { handler as aiAnalyzeMedia } from '../lib/server/ai/analyze-media.js';
import { handler as aiChat } from '../lib/server/ai/chat.js';
import { handler as aiGenerate } from '../lib/server/ai/generate.js';
import { handler as aiModels } from '../lib/server/ai/models.js';
import { handler as aiProviders } from '../lib/server/ai/providers.js';
import { handler as aiUsage } from '../lib/server/ai/usage.js';
import { handler as aiChatId } from '../lib/server/ai/chat/[id].js';
import { handler as aiProvidersHealth } from '../lib/server/ai/providers/health.js';
import { handler as automationsId } from '../lib/server/automations/[id].js';
import { handler as automationsIdRun } from '../lib/server/automations/[id]/run.js';
import { handler as contentId } from '../lib/server/content/[id].js';
import { handler as contentIdPublish } from '../lib/server/content/[id]/publish.js';
import { handler as healthProvider } from '../lib/server/health/[provider].js';
import { handler as jobsId } from '../lib/server/jobs/[id].js';
import { handler as jobsIdApprove } from '../lib/server/jobs/[id]/approve.js';
import { handler as jobsIdCancel } from '../lib/server/jobs/[id]/cancel.js';
import { handler as jobsIdRetry } from '../lib/server/jobs/[id]/retry.js';
import { handler as jobsIdRun } from '../lib/server/jobs/[id]/run.js';
import { handler as mediaProxy } from '../lib/server/media/proxy.js';
import { handler as mediaId } from '../lib/server/media/[id].js';
import { handler as oauthCallback } from '../lib/server/oauth/[provider]/callback.js';
import { handler as oauthDisconnect } from '../lib/server/oauth/[provider]/disconnect.js';
import { handler as oauthStart } from '../lib/server/oauth/[provider]/start.js';
import { handler as otpRequest } from '../lib/server/otp/request.js';
import { handler as otpResend } from '../lib/server/otp/resend.js';
import { handler as otpVerify } from '../lib/server/otp/verify.js';
import { handler as socialCompose } from '../lib/server/social/compose.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function sendJson(res, status, data) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

function matchRoute(urlPath) {
  const parts = urlPath.split('/').filter(Boolean);
  // Build a route key from the URL parts
  return parts;
}

function findHandler(urlPath) {
  const parts = urlPath.split('/').filter(Boolean);
  
  // Try exact match first, then dynamic routes
  // oauth/[provider]/callback
  if (parts[0] === 'oauth' && parts.length >= 4 && parts[2] === 'callback') {
    return oauthCallback;
  }
  if (parts[0] === 'oauth' && parts.length >= 4 && parts[2] === 'disconnect') {
    return oauthDisconnect;
  }
  if (parts[0] === 'oauth' && parts.length >= 4 && parts[2] === 'start') {
    return oauthStart;
  }
  // oauth/[provider]/disconnect handled above
  
  // jobs/[id]/<action>
  if (parts[0] === 'jobs' && parts.length >= 3 && ['approve', 'cancel', 'retry', 'run'].includes(parts[2])) {
    const action = parts[2];
    if (action === 'approve') return jobsIdApprove;
    if (action === 'cancel') return jobsIdCancel;
    if (action === 'retry') return jobsIdRetry;
    if (action === 'run') return jobsIdRun;
  }
  // automations/[id]/run
  if (parts[0] === 'automations' && parts.length >= 3 && parts[2] === 'run') {
    return automationsIdRun;
  }
  // content/[id]/publish
  if (parts[0] === 'content' && parts.length >= 3 && parts[2] === 'publish') {
    return contentIdPublish;
  }
  // ai/chat/[id]
  if (parts[0] === 'ai' && parts[1] === 'chat' && parts.length >= 3) {
    return aiChatId;
  }
  // ai/providers/health
  if (parts[0] === 'ai' && parts[1] === 'providers' && parts[2] === 'health') {
    return aiProvidersHealth;
  }
  // health/[provider]
  if (parts[0] === 'health' && parts.length >= 2) {
    return healthProvider;
  }
  // media/proxy
  if (parts[0] === 'media' && parts[1] === 'proxy') {
    return mediaProxy;
  }
  // media/[id]
  if (parts[0] === 'media' && parts.length >= 2 && parts[1] !== 'proxy') {
    return mediaId;
  }
  // otp/*
  if (parts[0] === 'otp') {
    if (parts[1] === 'request') return otpRequest;
    if (parts[1] === 'resend') return otpResend;
    if (parts[1] === 'verify') return otpVerify;
  }
  // ai/*
  if (parts[0] === 'ai') {
    if (parts[1] === 'analyze-media') return aiAnalyzeMedia;
    if (parts[1] === 'chat') return aiChat;
    if (parts[1] === 'generate') return aiGenerate;
    if (parts[1] === 'models') return aiModels;
    if (parts[1] === 'providers') return aiProviders;
    if (parts[1] === 'usage') return aiUsage;
  }
  // content/[id]
  if (parts[0] === 'content' && parts.length >= 2) {
    return contentId;
  }
  // automations/[id]
  if (parts[0] === 'automations' && parts.length >= 2) {
    return automationsId;
  }
  // jobs/[id]
  if (parts[0] === 'jobs' && parts.length >= 2) {
    return jobsId;
  }
  // ai/[id] handled above
  // oauth/[provider] handled above
  
  // Top-level routes
  const routeMap = {
    accounts, automations, content, dashboard, health, jobs, me,
    media, notifications, publish, socialCompose,
  };
  return routeMap[parts[0]] || null;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const url = parse(req.url || '/', true);
    const urlPath = url.pathname || '/';
    const strippedPath = urlPath.replace(/^\/api\/?/, '');
    
    const Handler = findHandler(strippedPath);
    if (!Handler) {
      return sendJson(res, 404, { error: 'Not found' });
    }

    // Attach query params and body parsing
    req.query = url.query || {};
    
    const origEnd = res.end.bind(res);
    let statusCode = res.statusCode || 200;
    const wrappedRes = Object.assign(res, {
      status(code) { statusCode = code; return wrappedRes; },
      json(data) {
        for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = statusCode;
        origEnd(JSON.stringify(data));
      },
    });
    
    await Handler(req, wrappedRes);
    if (!res.writableEnded) {
      res.statusCode = statusCode;
      if (!res.headersSent) {
        for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
        res.setHeader('Content-Type', 'application/json');
      }
      origEnd('');
    }
  } catch (err) {
    console.error('[api]', err?.message || err);
    if (!res.headersSent) {
      for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
      res.setHeader('Content-Type', 'application/json');
    }
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err?.message || 'Internal error' }));
  }
}