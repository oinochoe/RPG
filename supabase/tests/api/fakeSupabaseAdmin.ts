// Test stand-in for functions/api/supabaseAdmin.ts — an in-memory "admin client" whose RPCs and
// table reads are scripted per test. It exists to exercise the ROUTE logic (validation, gating,
// call order, response shape, refunds); the SQL itself is tested separately against Postgres.

export interface Call {
  kind: "rpc" | "from";
  name: string;
  args?: unknown;
  op?: string;
  filters?: Record<string, unknown>;
}

type RpcResult = { data: unknown; error: { message: string } | null };
type RpcHandler = (args: Record<string, unknown>) => RpcResult | Promise<RpcResult>;
export type TableHandler = (q: { table: string; op: string; filters: Record<string, unknown>; single: boolean; payload?: unknown }) =>
  | { data: unknown; error?: { message: string } | null }
  | Promise<{ data: unknown; error?: { message: string } | null }>;

export const state = {
  calls: [] as Call[],
  rpc: {} as Record<string, RpcHandler>,
  tables: {} as Record<string, TableHandler>,
};

export function reset() {
  state.calls = [];
  state.rpc = {};
  state.tables = {};
}

class Query {
  private op = "select";
  private filters: Record<string, unknown> = {};
  private payload: unknown;
  constructor(private table: string) {}
  select() { return this; }
  insert(payload: unknown) { this.op = "insert"; this.payload = payload; return this; }
  update(payload: unknown) { this.op = "update"; this.payload = payload; return this; }
  delete() { this.op = "delete"; return this; }
  eq(k: string, v: unknown) { this.filters[k] = v; return this; }
  gt(k: string, v: unknown) { this.filters[`${k}>`] = v; return this; }
  in(k: string, v: unknown) { this.filters[`${k} in`] = v; return this; }
  is(k: string, v: unknown) { this.filters[`${k} is`] = v; return this; }
  not(k: string, _o: string, v: unknown) { this.filters[`${k} not`] = v; return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return this.run(true); }
  single() { return this.run(true); }
  // deno-lint-ignore no-explicit-any
  then(resolve: (v: any) => unknown, reject?: (e: unknown) => unknown) { return this.run(false).then(resolve, reject); }
  private async run(single: boolean) {
    state.calls.push({ kind: "from", name: this.table, op: this.op, filters: this.filters });
    const handler = state.tables[this.table];
    const res = handler
      ? await handler({ table: this.table, op: this.op, filters: this.filters, single, payload: this.payload })
      : { data: single ? null : [] };
    return { data: res.data, error: res.error ?? null };
  }
}

export function getAdminClient() {
  return {
    from: (table: string) => new Query(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.calls.push({ kind: "rpc", name, args });
      const handler = state.rpc[name];
      if (!handler) return { data: null, error: { message: `unscripted rpc ${name}` } };
      return await handler(args);
    },
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
  };
}
