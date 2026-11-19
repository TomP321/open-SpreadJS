import { notImplemented } from '../not-implemented.js';

type ReadRequest = {
  url: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  options?: RequestInit;
};

export async function readRemote(request: unknown): Promise<unknown> {
  if (!request || typeof request !== 'object' || typeof (request as ReadRequest).url !== 'string') {
    return notImplemented('GC.Data.Table.fetch HTTP transport');
  }
  const config = request as ReadRequest;
  const method = config.method ?? 'GET';
  const init = { ...config, method, url: config.url } as RequestInit & { url: string; options?: RequestInit };
  if (config.body !== undefined) {
    init.body = JSON.stringify(config.body);
    init.headers = {
      'Content-Type': 'application/json; charset=utf-8',
      ...(config.options?.headers as Record<string, string> | undefined),
      ...config.headers,
    };
  } else if (config.options?.headers || config.headers) {
    init.headers = { ...(config.options?.headers as Record<string, string> | undefined), ...config.headers };
  }
  const response = await fetch(config.url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function sendRemote(request: unknown, data: unknown, defaultMethod: string): Promise<unknown> {
  const body = JSON.stringify(data);
  const options = { method: defaultMethod, body, headers: { 'Content-Type': 'application/json; charset=utf-8' } };
  if (typeof request === 'function') return (request as (data: unknown, options: object) => Promise<unknown>)(data, options);
  if (!request || typeof request !== 'object' || typeof (request as ReadRequest).url !== 'string') {
    return notImplemented('GC.Data.Table.submitChanges remote transport');
  }
  const config = request as ReadRequest;
  const init = {
    ...config, method: config.method ?? defaultMethod,
    headers: { ...options.headers, ...(config.options?.headers as Record<string, string> | undefined), ...config.headers },
    body,
  };
  const response = await fetch(config.url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
