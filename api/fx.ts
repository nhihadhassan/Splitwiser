import { errorResponse, HttpError, json, methodNotAllowed } from "./_lib/http.js";

const CURRENCY = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    try {
      const url = new URL(request.url);
      const base = url.searchParams.get("base")?.toUpperCase() ?? "";
      const quote = url.searchParams.get("quote")?.toUpperCase() ?? "";
      const date = url.searchParams.get("date") ?? "";
      if (!CURRENCY.test(base) || !CURRENCY.test(quote) || !DATE.test(date)) throw new HttpError(400, "Use ISO base, quote, and date values.");
      if (base === quote) return json({ base, quote, date, rate: "1", source: "identity" }, 200, { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" });
      const upstream = await fetch(`https://api.frankfurter.dev/v2/rate/${base}/${quote}?date=${date}`, { headers: { Accept: "application/json" } });
      if (!upstream.ok) throw new HttpError(503, "A saved or manual conversion rate is needed right now.");
      const payload = await upstream.json() as { rate?: number; date?: string };
      if (typeof payload.rate !== "number" || !Number.isFinite(payload.rate) || payload.rate <= 0) throw new HttpError(503, "The conversion rate response was invalid.");
      return json({ base, quote, date: payload.date ?? date, rate: String(payload.rate), source: "frankfurter", fetchedAt: new Date().toISOString() }, 200, { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" });
    } catch (error) {
      return errorResponse(error, "A saved or manual conversion rate is needed right now.");
    }
  },
};
