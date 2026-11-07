// Connection Fetch is shared by authenticated HTTP AND the Desktop carrier.
// A webServer-only route is invisible to Desktop's in-process API bridge.
export function registerPanelApi(ctx, status, start, configure, models) {
  const json = (value, code = 200) => new Response(JSON.stringify(value), { status: code, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  const clean = (value) => typeof value === 'string' ? value.trim() : '';
  const routes = [
    { path: '/api/session-title-summary/status', methods: ['GET'], requestBody: 'buffered', fetch: async (request) => {
      if (request.method !== 'GET') return json({ error: 'method-not-allowed' }, 405);
      return json(status());
    } },
    { path: '/api/session-title-summary/backfill', methods: ['POST'], requestBody: 'buffered', fetch: async (request) => {
      if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);
      // Authentication and origin admission are owned by Connection, for both carriers.
      const started = start('panel');
      return json({ running: true, started }, 202);
    } }
  ];
  if (typeof models === 'function') routes.push(
    { path: '/api/session-title-summary/models', methods: ['GET'], requestBody: 'buffered', fetch: async (request) => {
      if (request.method !== 'GET') return json({ error: 'method-not-allowed' }, 405);
      try { return json(await models()); } catch (error) { return json({ error: 'catalog-unavailable', detail: String(error?.message ?? error) }, 503); }
    } }
  );
  if (typeof configure === 'function') routes.push(
    { path: '/api/session-title-summary/config', methods: ['POST'], requestBody: 'buffered', fetch: async (request) => {
      if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);
      let body;
      try { body = await request.json(); } catch { return json({ error: 'invalid-json' }, 400); }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid-body' }, 400);
      const provider = clean(body.provider);
      const model = clean(body.model);
      // The pair is set together or cleared together; a half pair is a client bug.
      if ((provider === '') !== (model === '')) return json({ error: 'provider-and-model-together' }, 400);
      if (provider.length > 128 || model.length > 256) return json({ error: 'value-too-long' }, 400);
      const routeOverride = await configure(provider === '' ? undefined : { provider, model });
      return json({ routeOverride });
    } }
  );
  for (const route of routes) ctx.effect(() => ctx.connection.fetch.register(route), `session-title-summary: ${route.path}`);
}
