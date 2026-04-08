/**
 * Cloudflare D1 Backend Implementation
 * Uses standard fetch to talk to Cloudflare Pages Functions
 */

export async function webQuery<T>(sql: string, params: any[] = []): Promise<T> {
  const response = await fetch('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`D1 Query Failed: ${error}`);
  }

  return response.json();
}

export async function webExecute(sql: string, params: any[] = []): Promise<{ lastInsertId: number | null }> {
  const response = await fetch('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params, execute: true }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`D1 Execute Failed: ${error}`);
  }

  return response.json();
}
