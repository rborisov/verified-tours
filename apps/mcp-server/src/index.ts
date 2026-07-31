import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function portalBaseUrl(): string {
  return requireEnv("PORTAL_URL").replace(/\/$/, "");
}

async function portalPost(path: string, body: unknown) {
  const response = await fetch(`${portalBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": requireEnv("INTERNAL_API_KEY"),
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { response, data };
}

function createServer(): McpServer {
  const server = new McpServer({
    name: "verified-tours",
    version: "0.1.0",
  });

  server.registerTool(
    "lookup_verified_offers",
    {
      description:
        "Look up previously verified offers and rejected fingerprints matching the brief. Call this BEFORE searching OTAs.",
      inputSchema: {
        fromCity: z.string().min(1),
        countries: z.string().optional(),
        departFrom: z.string().optional(),
        departTo: z.string().optional(),
        adults: z.number().int().positive().optional(),
        childrenAges: z.string().optional(),
        includeRejected: z.boolean().optional(),
        limit: z.number().int().positive().max(50).optional(),
      },
    },
    async (args) => {
      const { response, data } = await portalPost("/api/internal/offers/lookup", args);
      if (!response.ok) {
        return {
          content: [{ type: "text", text: String(data.error ?? `lookup failed ${response.status}`) }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.registerTool(
    "submit_offer_candidate",
    {
      description:
        "Submit an L2/L3-verified BOOKABLE package offer for human confirmation. deepLink MUST be the buy/book offer page (city+dates+price visible), never a search list or hotel brochure. SaleTur list/brochure URLs are rejected. Prefer Level.Travel / Travelata / Onlinetours. Also rejects listing vs page price drift >15%.",
      inputSchema: {
        jobId: z.string().min(1),
        requestId: z.string().optional(),
        source: z.string().min(1),
        hotelName: z.string().min(1),
        hotelId: z.string().optional().nullable(),
        country: z.string().min(1),
        resort: z.string().optional().nullable(),
        deepLink: z
          .string()
          .url()
          .describe(
            "URL of the bookable offer/checkout page (city, dates, price, buy). Not a search list or brochure.",
          ),
        fromCity: z.string().min(1),
        startDate: z.string().min(1),
        endDate: z.string().min(1),
        nights: z.number().int().positive(),
        adults: z.number().int().positive(),
        childrenAges: z.string().default(""),
        listingPriceRub: z.number().int().positive().optional().nullable(),
        pagePriceRub: z.number().int().positive(),
        hasFlight: z.boolean().default(true),
        seaNote: z.string().optional().nullable(),
        hotBadge: z.string().optional().nullable(),
        visaOk: z.boolean().default(true),
        autoLevel: z.enum(["L1", "L2", "L3"]),
        autoNotes: z.string().optional().nullable(),
        expiresInHours: z.number().positive().optional(),
      },
    },
    async (args) => {
      const { response, data } = await portalPost("/api/internal/offers/submit", args);
      if (!response.ok) {
        return {
          content: [{ type: "text", text: String(data.error ?? `submit failed ${response.status}`) }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.registerTool(
    "mark_offer_rejected_auto",
    {
      description:
        "Record an auto-rejection (wrong city, price drift >15%, no flight, etc.) so future searches skip it.",
      inputSchema: {
        jobId: z.string().optional(),
        requestId: z.string().optional(),
        source: z.string().min(1),
        hotelName: z.string().min(1),
        hotelId: z.string().optional().nullable(),
        country: z.string().optional(),
        deepLink: z.string().url(),
        fromCity: z.string().min(1),
        startDate: z.string().min(1),
        nights: z.number().int().positive(),
        adults: z.number().int().positive(),
        childrenAges: z.string().default(""),
        listingPriceRub: z.number().int().optional().nullable(),
        pagePriceRub: z.number().int().optional().nullable(),
        reason: z.string().min(1),
        autoNotes: z.string().optional().nullable(),
      },
    },
    async (args) => {
      const { response, data } = await portalPost("/api/internal/offers/reject-auto", args);
      if (!response.ok) {
        return {
          content: [{ type: "text", text: String(data.error ?? `reject failed ${response.status}`) }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.registerTool(
    "finish_search_job",
    {
      description:
        "Mark the tour search job finished. Prefer status=awaiting_human when candidates need admin confirmation.",
      inputSchema: {
        jobId: z.string().min(1),
        requestId: z.string().optional(),
        status: z.enum(["awaiting_human", "done", "failed"]).default("awaiting_human"),
        error: z.string().optional().nullable(),
      },
    },
    async (args) => {
      const { response, data } = await portalPost("/api/internal/jobs/finish", args);
      if (!response.ok) {
        return {
          content: [{ type: "text", text: String(data.error ?? `finish failed ${response.status}`) }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
