// One-shot helper: takes a list of original iCount doc numbers (or doc_ids),
// fetches their cc_deal_id via /doc/info, and triggers a REAL credit-card
// refund via /cc/refund. Does NOT touch the local DB — pure passthrough to iCount.
// Body: { docs: Array<{ doc_number?: string|number, doc_id?: string|number, amount?: number, reason?: string }> }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ICOUNT_BASE = "https://api.icount.co.il/api/v3.php";

function auth() {
  const cid = Deno.env.get("ICOUNT_COMPANY_ID");
  const user = Deno.env.get("ICOUNT_USERNAME");
  const pass = Deno.env.get("ICOUNT_PASSWORD");
  if (!cid || !user || !pass) throw new Error("ICOUNT credentials missing");
  return { cid, user, pass };
}

async function getDocInfo(creds: any, key: { doc_id?: string|number; doc_number?: string|number; doctype?: string }) {
  const payload: any = { ...creds, doctype: key.doctype ?? "receipt" };
  if (key.doc_id) payload.doc_id = key.doc_id;
  if (key.doc_number) payload.docnum = key.doc_number;
  const res = await fetch(`${ICOUNT_BASE}/doc/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await res.json().catch(() => ({}));
}

async function ccRefund(creds: any, args: { cc_deal_id: string; sum: number; reason?: string; based_on?: any[] }) {
  const payload: any = {
    ...creds,
    cc_deal_id: args.cc_deal_id,
    transaction_id: args.cc_deal_id,
    sum: args.sum,
    reason: args.reason || "החזר טסט",
    description: args.reason || "החזר טסט",
  };
  if (args.based_on) payload.based_on = args.based_on;
  const res = await fetch(`${ICOUNT_BASE}/cc/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await res.json().catch(() => ({}));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const docs: Array<any> = Array.isArray(body?.docs) ? body.docs : [];
    if (!docs.length) {
      return new Response(JSON.stringify({ error: "docs[] required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const creds = auth();
    const results: any[] = [];
    for (const d of docs) {
      const tag = d.doc_number ?? d.doc_id;
      try {
        const info = await getDocInfo(creds, { doc_id: d.doc_id, doc_number: d.doc_number, doctype: d.doctype });
        // Try common locations for the CC deal id in iCount's response
        const deal =
          info?.cc_deal_id ?? info?.cc?.cc_deal_id ?? info?.cc?.deal_id ??
          info?.cc?.tid ?? info?.doc?.cc_deal_id ?? info?.payments?.cc?.[0]?.cc_deal_id ?? null;
        const docSum = Number(info?.doc?.sum ?? info?.sum ?? d.amount ?? 0);
        const refundSum = Math.abs(Number(d.amount ?? docSum));
        if (!deal) {
          results.push({ doc: tag, ok: false, stage: "doc/info", error: "cc_deal_id not found", raw: info });
          continue;
        }
        if (!refundSum || refundSum <= 0) {
          results.push({ doc: tag, ok: false, stage: "validate", error: "no positive amount to refund", raw: info });
          continue;
        }
        const r = await ccRefund(creds, { cc_deal_id: String(deal), sum: refundSum, reason: d.reason, based_on: d.doc_id ? [d.doc_id] : undefined });
        results.push({
          doc: tag, ok: !!r?.status, deal_id: deal, refund_sum: refundSum,
          new_doc_id: r?.doc_id ?? null, new_doc_number: r?.docnum ?? r?.doc_number ?? null,
          url: r?.doc_url ?? r?.pdf_link ?? r?.url ?? null,
          raw: r,
        });
      } catch (e) {
        results.push({ doc: tag, ok: false, error: String(e) });
      }
    }
    return new Response(JSON.stringify({ ok: true, results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
