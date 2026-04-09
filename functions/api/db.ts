interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const body: any = await request.json();
  const { sql, params, execute } = body;

  try {
    const p = params || [];
    if (execute) {
      const result = await env.DB.prepare(sql).bind(...p).run();
      return new Response(JSON.stringify({ 
        lastInsertId: result.meta.last_row_id || null,
        changes: result.meta.changes
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      const result = await env.DB.prepare(sql).bind(...p).all();
      return new Response(JSON.stringify(result.results), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (e: any) {
    return new Response(e.message, { status: 500 });
  }
};
