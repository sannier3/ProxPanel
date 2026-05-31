import axios from 'axios';
import https from 'https';
import PQueue from 'p-queue';
import { config } from '../config.js';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

function apiBase(url) {
  return `${url.replace(/\/$/, '')}/api2/json`;
}

/**
 * @param {string} url
 * @param {string} username full user@realm
 * @param {string} password
 */
export async function getProxmoxTicket(url, username, password) {
  const apiUrl = `${apiBase(url)}/access/ticket`;
  try {
    const { data, status } = await axios.post(
      apiUrl,
      new URLSearchParams({ username, password }),
      {
        httpsAgent,
        timeout: 10000,
        validateStatus: () => true,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );
    if (status === 200 && data?.data) return data.data;
    return null;
  } catch (err) {
    console.error('getProxmoxTicket:', err.message);
    return null;
  }
}

/**
 * @param {object} ticket { ticket, CSRFPreventionToken }
 */
export async function proxmoxApiCall(url, ticket, apiPath, method = 'GET', body = null, extraHeaders = {}) {
  const fullUrl = `${apiBase(url)}${apiPath}`;
  const headers = { Cookie: `PVEAuthCookie=${ticket.ticket}`, ...extraHeaders };
  if (['POST', 'PUT', 'DELETE'].includes(method) && ticket.CSRFPreventionToken) {
    headers.CSRFPreventionToken = ticket.CSRFPreventionToken;
  }

  const opts = {
    method,
    url: fullUrl,
    headers,
    httpsAgent,
    timeout: 10000,
    validateStatus: () => true,
  };

  if (body != null && (method === 'POST' || method === 'PUT')) {
    opts.data =
      typeof body === 'object' && !(body instanceof URLSearchParams)
        ? new URLSearchParams(body)
        : body;
    if (!opts.headers['Content-Type']) {
      opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }

  try {
    const { data, status } = await axios(opts);
    if (status === 200) return data?.data ?? null;
    return null;
  } catch (err) {
    console.error(`proxmoxApiCall ${apiPath}:`, err.message);
    return null;
  }
}

/**
 * Comme proxmoxApiCall mais renvoie ok/error pour l'UI d'édition.
 */
export async function proxmoxApiCallResult(url, ticket, apiPath, method = 'GET', body = null) {
  const fullUrl = `${apiBase(url)}${apiPath}`;
  const headers = { Cookie: `PVEAuthCookie=${ticket.ticket}` };
  if (['POST', 'PUT', 'DELETE'].includes(method) && ticket.CSRFPreventionToken) {
    headers.CSRFPreventionToken = ticket.CSRFPreventionToken;
  }
  const opts = {
    method,
    url: fullUrl,
    headers,
    httpsAgent,
    timeout: 30000,
    validateStatus: () => true,
  };
  if (body != null && (method === 'POST' || method === 'PUT')) {
    opts.data =
      typeof body === 'object' && !(body instanceof URLSearchParams)
        ? new URLSearchParams(body)
        : body;
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  try {
    const { data, status } = await axios(opts);
    if (status >= 200 && status < 300) {
      return { ok: true, data: data?.data ?? null };
    }
    let error = `HTTP ${status}`;
    if (data?.errors && typeof data.errors === 'object') {
      error = Object.entries(data.errors)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' - ');
    } else if (data?.message) {
      error = data.message;
    }
    return { ok: false, error };
  } catch (err) {
    return { ok: false, error: err.message || 'Erreur réseau' };
  }
}

/**
 * Appels parallèles avec limite de concurrence.
 * @param {Array<{key: string, path: string, method?: string, data?: object}>} requests
 */
export async function proxmoxApiCallMulti(url, ticket, requests) {
  const queue = new PQueue({
    concurrency: config.collector.maxParallelProxmoxCalls,
  });
  const results = {};

  await Promise.all(
    requests.map(({ key, path: apiPath, method, data }) =>
      queue.add(async () => {
        results[key] = await proxmoxApiCall(url, ticket, apiPath, method || 'GET', data);
      })
    )
  );

  return results;
}

export async function fetchRealms(url, rootUser, rootPassword) {
  const ticket = await getProxmoxTicket(url, `${rootUser}@pam`, rootPassword);
  if (!ticket) return [];
  const domains = await proxmoxApiCall(url, ticket, '/access/domains');
  if (!Array.isArray(domains)) return [];
  return domains
    .filter((r) => r.realm && (r.type ?? '') !== 'tfa')
    .map((r) => ({ realm: r.realm, type: r.type ?? 'unknown' }));
}
