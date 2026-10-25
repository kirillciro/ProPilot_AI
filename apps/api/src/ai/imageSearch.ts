import { env } from "../env.js";
import { braveMonthSummary, recordBraveSearch } from "../lib/usage.js";
import type { Tool } from "./openrouter.js";

export type ImageHit = {
  /** Thumbnail URL that the app can hotlink. */
  url: string;
  pageUrl: string;
  title: string;
};

const USER_AGENT = "ProPilotAI/0.1 (image search)";

export const IMAGE_SEARCH_TOOL: Tool = {
  type: "function",
  function: {
    name: "search_images",
    description:
      "Search the web for real photos or pictures. The images are shown to the user in the chat automatically. If it finds nothing, retry once with a shorter, broader query.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Specific image search query, e.g. 'Toyota 2JZ-GTE engine bay'.",
        },
      },
      required: ["query"],
    },
  },
};

async function getJson<T>(url: URL, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      ...headers,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Image search failed (${res.status})`);
  return (await res.json()) as T;
}

async function brave(query: string, count: number): Promise<ImageHit[]> {
  const url = new URL("https://api.search.brave.com/res/v1/images/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  url.searchParams.set("safesearch", "strict");
  const body = await getJson<{
    results?: { title?: string; url?: string; thumbnail?: { src?: string } }[];
  }>(url, { "X-Subscription-Token": env.BRAVE_SEARCH_API_KEY! });
  await recordBraveSearch();
  return (body.results ?? []).flatMap((r) =>
    r.thumbnail?.src?.startsWith("https://")
      ? [{ url: r.thumbnail.src, pageUrl: r.url ?? "", title: r.title ?? "" }]
      : [],
  );
}

async function openverse(query: string, count: number): Promise<ImageHit[]> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", String(count));
  url.searchParams.set("mature", "false");
  const body = await getJson<{
    results?: {
      title?: string;
      thumbnail?: string;
      url?: string;
      foreign_landing_url?: string;
    }[];
  }>(url);
  return (body.results ?? []).flatMap((r) => {
    const src = r.thumbnail ?? r.url;
    return src?.startsWith("https://")
      ? [
          {
            url: src,
            pageUrl: r.foreign_landing_url ?? "",
            title: r.title ?? "",
          },
        ]
      : [];
  });
}

async function wikimedia(query: string, count: number): Promise<ImageHit[]> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  const params = {
    action: "query",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: query,
    gsrlimit: String(count * 2),
    prop: "imageinfo",
    iiprop: "url|mime",
    iiurlwidth: "500",
    format: "json",
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const body = await getJson<{
    query?: {
      pages?: Record<
        string,
        {
          title?: string;
          index?: number;
          imageinfo?: {
            thumburl?: string;
            descriptionurl?: string;
            mime?: string;
          }[];
        }
      >;
    };
  }>(url);
  return Object.values(body.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .flatMap((p) => {
      const info = p.imageinfo?.[0];
      return info?.thumburl?.startsWith("https://") &&
        /^image\/(jpeg|png|webp)$/.test(info.mime ?? "")
        ? [
            {
              url: info.thumburl,
              pageUrl: info.descriptionurl ?? "",
              title: (p.title ?? "").replace(/^File:/, ""),
            },
          ]
        : [];
    });
}

// Niche queries often return nothing, so trailing words are dropped until two remain.
const variantsOf = (query: string) => {
  const words = query.trim().split(/\s+/).slice(0, 12);
  const out = [words.join(" ")];
  for (let n = words.length - 1; n >= 2 && out.length < 3; n--)
    out.push(words.slice(0, n).join(" "));
  return out;
};

// Repeated queries are served from memory so they don't use up the paid search quota.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map<string, { at: number; hits: ImageHit[] }>();

export async function searchImages(
  query: string,
  count = 6,
): Promise<ImageHit[]> {
  const key = `${count}:${query.trim().toLowerCase().replace(/\s+/g, " ")}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.hits;

  // Stops paid calls once the estimated spend reaches the monthly free credit.
  const braveStats = env.BRAVE_SEARCH_API_KEY
    ? await braveMonthSummary()
    : null;
  const braveAllowed =
    braveStats !== null &&
    braveStats.spentUsd + braveStats.costPerSearchUsd <= braveStats.creditUsd;
  const providers = [...(braveAllowed ? [brave] : []), openverse, wikimedia];
  let lastError: unknown;
  for (const variant of variantsOf(query.slice(0, 200))) {
    for (const provider of providers) {
      try {
        const hits = (await provider(variant, count)).slice(0, count);
        if (hits.length) {
          if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
          cache.set(key, { at: Date.now(), hits });
          return hits;
        }
      } catch (err) {
        lastError = err;
      }
    }
  }
  if (lastError) throw lastError;
  return [];
}
