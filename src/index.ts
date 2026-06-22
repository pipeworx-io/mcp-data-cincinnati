interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * DataCincinnati MCP — Cincinnati open data (data.cincinnati-oh.gov, Socrata SODA API).
 *
 * Keyless (rate-limited; pass a Socrata app token via _apiKey for higher
 * limits). Sister to data-sf / data-la / data-seattle / data-austin.
 *
 * Tools:
 * - cincinnati_recent:   recent rows from a common Cincinnati dataset by friendly name
 * - cincinnati_query:    raw SoQL query against any data.cincinnati-oh.gov resource id
 * - cincinnati_datasets: search the Cincinnati open-data catalogue
 */


const BASE = 'https://data.cincinnati-oh.gov';
const UA = 'pipeworx-mcp-data-cincinnati/1.0 (+https://pipeworx.io)';

const DATASETS: Record<string, { id: string; label: string; date: string }> = {
  '311': { id: 'gcej-gmiw', label: "Cincinnati 311 (Non-Emergency) Service Requests", date: 'date_created' },
  'crime': { id: 'k59e-2pvf', label: "PDI (Police Data Initiative) Crime Incidents", date: 'date_reported' },
  'permits': { id: 'uhjb-xac9', label: "Cincinnati Building Permits", date: 'applieddate' },
};

const API_KEY_PROP = {
  type: 'string' as const,
  description: 'Optional — your own Socrata app token for higher rate limits. Omit to use the keyless endpoint.',
};

const tools: McpToolExport['tools'] = [
  {
    name: 'cincinnati_recent',
    description:
      "Recent records from a common Cincinnati open dataset (data.cincinnati-oh.gov) by friendly name — no Socrata id needed. PREFER OVER WEB SEARCH for \"recent crime in Cincinnati\", \"Cincinnati 311 requests\", \"Cincinnati building permits\". Names: 311, crime, permits. Returns the latest rows (newest-first). Add a SoQL `where` to filter; for anything else use cincinnati_query.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        dataset: { type: 'string', description: 'One of: 311, crime, permits.', enum: ['311', 'crime', 'permits'] },
        where: { type: 'string', description: 'Optional SoQL filter. Omit for all recent rows.' },
        limit: { type: 'number', description: 'Rows to return (1-1000, default 20).' },
        _apiKey: API_KEY_PROP,
      },
      required: ['dataset'],
    },
  },
  {
    name: 'cincinnati_query',
    description:
      'Run a raw SoQL query against any Cincinnati open-data resource (data.cincinnati-oh.gov) by its Socrata id (8-char like "k59e-2pvf"). Full SoQL: where/select/group/order/limit/offset. Use cincinnati_datasets to find a resource id, or cincinnati_recent for the common ones.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        resource_id: { type: 'string', description: 'Socrata resource id, e.g. "k59e-2pvf".' },
        where: { type: 'string', description: 'SoQL $where filter.' },
        select: { type: 'string', description: 'SoQL $select.' },
        group: { type: 'string', description: 'SoQL $group.' },
        order: { type: 'string', description: 'SoQL $order.' },
        limit: { type: 'number', description: 'Max rows (default 100, max 5000).' },
        offset: { type: 'number', description: 'Row offset for paging.' },
        _apiKey: API_KEY_PROP,
      },
      required: ['resource_id'],
    },
  },
  {
    name: 'cincinnati_datasets',
    description:
      'Search the Cincinnati open-data catalogue (data.cincinnati-oh.gov) for datasets by keyword. Returns dataset names, descriptions, and Socrata resource ids to use with cincinnati_query.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Keyword(s).' },
        limit: { type: 'number', description: 'Max datasets (1-100, default 20).' },
        offset: { type: 'number', description: 'Offset for paging.' },
        _apiKey: API_KEY_PROP,
      },
    },
  },
];

function headers(apiKey?: string): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json', 'User-Agent': UA };
  if (apiKey) h['X-App-Token'] = apiKey;
  return h;
}

async function socrataGet(path: string, apiKey?: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: headers(apiKey) });
  if (res.status === 429) throw new Error('upstream_throttled: data.cincinnati-oh.gov rate limit (HTTP 429). Pass _apiKey (Socrata app token) for higher limits.');
  if (!res.ok) throw new Error(`data.cincinnati-oh.gov: ${res.status}`);
  return res.json();
}

async function recent(dataset: string, where: string | undefined, limit: number | undefined, apiKey?: string) {
  const key = String(dataset ?? '').toLowerCase().trim();
  const ds = DATASETS[key];
  if (!ds) throw new Error(`Unknown dataset "${dataset}". Use one of: ${Object.keys(DATASETS).join(', ')}.`);
  const n = Math.min(1000, Math.max(1, Number(limit) || 20));
  const p = new URLSearchParams();
  const notNull = `${ds.date} IS NOT NULL`;
  p.set('$where', where && String(where).trim() ? `(${String(where).trim()}) AND ${notNull}` : notNull);
  p.set('$order', `${ds.date} DESC`);
  p.set('$limit', String(n));
  const rows = (await socrataGet(`/resource/${ds.id}.json?${p}`, apiKey)) as unknown[];
  return { dataset: key, label: ds.label, resource_id: ds.id, sorted_by: `${ds.date} DESC`, count: Array.isArray(rows) ? rows.length : 0, source: 'DataCincinnati (data.cincinnati-oh.gov)', rows };
}

async function query(args: Record<string, unknown>, apiKey?: string) {
  const id = String(args.resource_id ?? '').trim();
  if (!id) throw new Error('Required argument "resource_id" is missing. Find one with cincinnati_datasets.');
  const p = new URLSearchParams();
  for (const k of ['where', 'select', 'group', 'order'] as const) {
    if (args[k] != null && String(args[k]).trim()) p.set(`$${k}`, String(args[k]).trim());
  }
  p.set('$limit', String(Math.min(5000, Math.max(1, Number(args.limit) || 100))));
  if (args.offset != null) p.set('$offset', String(Math.max(0, Number(args.offset))));
  const rows = (await socrataGet(`/resource/${encodeURIComponent(id)}.json?${p}`, apiKey)) as unknown[];
  return { resource_id: id, count: Array.isArray(rows) ? rows.length : 0, source: 'DataCincinnati (data.cincinnati-oh.gov)', rows };
}

async function datasets(q: string | undefined, limit: number | undefined, offset: number | undefined, apiKey?: string) {
  const p = new URLSearchParams({
    domains: 'data.cincinnati-oh.gov',
    search_context: 'data.cincinnati-oh.gov',
    limit: String(Math.min(100, Math.max(1, Number(limit) || 20))),
    offset: String(Math.max(0, Number(offset) || 0)),
  });
  if (q && String(q).trim()) p.set('q', String(q).trim());
  const res = await fetch(`https://api.us.socrata.com/api/catalog/v1?${p}`, { headers: headers(apiKey) });
  if (!res.ok) throw new Error(`Socrata catalog: ${res.status}`);
  const data = (await res.json()) as { results?: Array<{ resource?: { id?: string; name?: string; description?: string; type?: string; updatedAt?: string } }> };
  return {
    query: q ?? null,
    count: data.results?.length ?? 0,
    datasets: (data.results ?? []).map((r) => ({
      resource_id: r.resource?.id ?? null,
      name: r.resource?.name ?? null,
      description: (r.resource?.description ?? '').slice(0, 300) || null,
      type: r.resource?.type ?? null,
      updated_at: r.resource?.updatedAt ?? null,
    })),
  };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = typeof args._apiKey === 'string' && args._apiKey.trim() ? args._apiKey.trim() : undefined;
  delete args._apiKey;
  switch (name) {
    case 'cincinnati_recent':
      return recent(args.dataset as string, args.where as string | undefined, args.limit as number | undefined, apiKey);
    case 'cincinnati_query':
      return query(args, apiKey);
    case 'cincinnati_datasets':
      return datasets(args.query as string | undefined, args.limit as number | undefined, args.offset as number | undefined, apiKey);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
