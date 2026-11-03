export interface ResearchAuthor {
  id: string | null;
  name: string | null;
  institution: string | null;
  institutionId: string | null;
}

export interface ResearchRecord {
  id: string;
  doi: string | null;
  title: string | null;
  authors: ResearchAuthor[];
  year: number | null;
  publicationDate: string | null;
  abstract: string | null;
  venue: string | null;
  url: string | null;
  citations: number | null;
  source: string;
  topics: string[];
}

export class ResearchProviderError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ResearchProviderError";
    this.status = status;
  }
}

const providerCacheTtlMs = 10 * 60 * 1000;
const providerCache = new Map<string, { expiresAt: number; value: unknown }>();
const providerRequests = new Map<string, Promise<unknown>>();
const providerCooldowns = new Map<string, number>();
let crossrefRequestQueue = Promise.resolve();
let nextCrossrefRequestAt = 0;
const crossrefResearchConcepts = [
  "artificial intelligence",
  "machine learning",
  "computer vision",
  "natural language processing",
  "robotics",
  "bioinformatics",
  "climate change",
  "quantum computing",
];

interface ProviderResponse<T> {
  results?: T[];
  meta?: { count?: number; page?: number; per_page?: number };
}

interface OpenAlexAuthorship {
  author?: { id?: string; display_name?: string };
  institutions?: Array<{ id?: string; display_name?: string }>;
}

interface OpenAlexWork {
  id: string;
  doi?: string | null;
  display_name?: string | null;
  title?: string | null;
  publication_year?: number | null;
  publication_date?: string | null;
  authorships?: OpenAlexAuthorship[];
  abstract_inverted_index?: Record<string, number[]> | null;
  cited_by_count?: number | null;
  primary_location?: {
    landing_page_url?: string | null;
    source?: { display_name?: string | null } | null;
  } | null;
  topics?: Array<{ id?: string; display_name?: string; score?: number }>;
}

interface OpenAlexAuthor {
  id: string;
  display_name?: string | null;
  works_count?: number | null;
  cited_by_count?: number | null;
  last_known_institutions?: Array<{ id?: string; display_name?: string }>;
  topics?: Array<{ id?: string; display_name?: string; score?: number }>;
  x_concepts?: Array<{ display_name?: string }>;
  orcid?: string | null;
  ids?: { orcid?: string | null };
}

interface CrossrefWork {
  DOI?: string;
  title?: string[];
  author?: Array<{ given?: string; family?: string; ORCID?: string; affiliation?: Array<{ name?: string }> }>;
  published?: { "date-parts"?: number[][] };
  abstract?: string;
  "container-title"?: string[];
  URL?: string;
  "is-referenced-by-count"?: number;
}

interface CrossrefWorksResponse {
  message?: {
    "total-results"?: number;
    items?: CrossrefWork[];
  };
}

function decodeAbstract(invertedIndex: Record<string, number[]> | null | undefined): string | null {
  if (!invertedIndex) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const position of positions) words[position] = word;
  }
  return words.filter((word) => word !== undefined).join(" ") || null;
}

function withCrossrefRequest<T>(origin: string, execute: () => Promise<T>) {
  const request = crossrefRequestQueue.then(async () => {
    const waitMs = Math.max(0, nextCrossrefRequestAt - Date.now());
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    if ((providerCooldowns.get(origin) ?? 0) > Date.now()) {
      throw new ResearchProviderError("A research data provider is rate limiting requests. Please wait a moment and try again.", 429);
    }
    try {
      return await execute();
    } finally {
      nextCrossrefRequestAt = Date.now() + (process.env.CROSSREF_MAILTO?.trim() ? 100 : 1100);
    }
  });
  crossrefRequestQueue = request.then(() => undefined, () => undefined);
  return request;
}

async function fetchJson<T>(url: string): Promise<T> {
  const requestUrl = new URL(url);
  if (requestUrl.hostname === "api.openalex.org") {
    const apiKey = process.env.OPENALEX_API_KEY?.trim();
    const mailto = process.env.OPENALEX_MAILTO?.trim();
    if (apiKey) requestUrl.searchParams.set("api_key", apiKey);
    if (mailto) requestUrl.searchParams.set("mailto", mailto);
  }
  const requestKey = requestUrl.toString();
  const cached = providerCache.get(requestKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  if (cached) providerCache.delete(requestKey);
  const pending = providerRequests.get(requestKey);
  if (pending) return pending as Promise<T>;

  const origin = requestUrl.origin;
  const blockedUntil = providerCooldowns.get(origin) ?? 0;
  if (blockedUntil > Date.now()) {
    throw new ResearchProviderError("A research data provider is rate limiting requests. Please wait a moment and try again.", 429);
  }

  const executeRequest = async () => {
  let response: Response;
  try {
    response = await fetch(requestKey, {
      headers: {
        "User-Agent": `ResearchX/1.0 (academic research discovery${process.env.CROSSREF_MAILTO ? `; mailto:${process.env.CROSSREF_MAILTO}` : ""})`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw error;
    throw new ResearchProviderError("A research data provider could not be reached. Please try again.", 502);
  }
  if (!response.ok) {
    const status = response.status === 404 ? 404 : response.status === 408 ? 504 : response.status === 429 ? 429 : 502;
    if (status === 429) {
      const retryAfter = response.headers.get("retry-after");
      const retrySeconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : 60;
      const retryAt = retryAfter && !/^\d+$/.test(retryAfter) ? Date.parse(retryAfter) : Date.now() + retrySeconds * 1000;
      providerCooldowns.set(origin, Number.isFinite(retryAt) ? retryAt : Date.now() + 60_000);
    }
    throw new ResearchProviderError(
      status === 404
        ? "The requested scholarly record was not found."
        : status === 429
          ? "A research data provider is rate limiting requests. Please wait a moment and try again."
          : status === 504
            ? "Research service is taking too long to respond. Please try again."
          : "A research data provider is temporarily unavailable. Please try again.",
      status,
    );
  }
  const data = await response.json() as T;
  providerCache.set(requestKey, { expiresAt: Date.now() + providerCacheTtlMs, value: data });
  if (providerCache.size > 256) {
    const oldestKey = providerCache.keys().next().value;
    if (oldestKey) providerCache.delete(oldestKey);
  }
  return data;
  };
  const request = requestUrl.hostname === "api.crossref.org"
    ? withCrossrefRequest(origin, executeRequest)
    : executeRequest();
  providerRequests.set(requestKey, request);
  try {
    return await request as T;
  } finally {
    if (providerRequests.get(requestKey) === request) providerRequests.delete(requestKey);
  }
}

function paperFromOpenAlex(work: OpenAlexWork): ResearchRecord {
  const doi = work.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "") ?? null;
  return {
    id: work.id,
    doi,
    title: work.display_name ?? work.title ?? null,
    authors: (work.authorships ?? []).map((authorship) => ({
      id: authorship.author?.id ?? null,
      name: authorship.author?.display_name ?? null,
      institution: authorship.institutions?.[0]?.display_name ?? null,
      institutionId: authorship.institutions?.[0]?.id ?? null,
    })),
    year: work.publication_year ?? null,
    publicationDate: work.publication_date ?? null,
    abstract: decodeAbstract(work.abstract_inverted_index),
    venue: work.primary_location?.source?.display_name ?? null,
    url: work.primary_location?.landing_page_url ?? (doi ? `https://doi.org/${doi}` : work.id ?? null),
    citations: work.cited_by_count ?? null,
    source: "OpenAlex",
    topics: (work.topics ?? []).map((topic) => topic.display_name).filter((topic): topic is string => Boolean(topic)),
  };
}

function queryUrl(endpoint: string, params: Record<string, string | number | undefined>) {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function resolveTopicId(topic: string) {
  const response = await fetchJson<ProviderResponse<{ id: string }>>(
    queryUrl("https://api.openalex.org/topics", { search: topic, "per-page": 1, select: "id" }),
  );
  return response.results?.[0]?.id ?? null;
}

async function resolveInstitutionId(institution: string) {
  const response = await fetchJson<ProviderResponse<{ id: string }>>(
    queryUrl("https://api.openalex.org/institutions", { search: institution, "per-page": 1, select: "id" }),
  );
  return response.results?.[0]?.id ?? null;
}

async function resolveAuthorId(author: string) {
  const response = await fetchJson<ProviderResponse<{ id: string }>>(
    queryUrl("https://api.openalex.org/authors", { search: author, "per-page": 1, select: "id" }),
  );
  return response.results?.[0]?.id ?? null;
}

export interface SearchPapersOptions {
  query?: string;
  title?: string;
  author?: string;
  yearFrom?: number;
  yearTo?: number;
  topic?: string;
  page?: number;
  perPage?: number;
  sort?: string;
}

function normalizeAuthorId(id: string) {
  return id.trim()
    .replace(/^https?:\/\/(?:api\.)?openalex\.org\/(?:authors\/)?/i, "")
    .replace(/^authors\//i, "");
}

function normalizeCrossrefResearcherId(id: string) {
  return id.trim().replace(/^crossref:/i, "");
}

function crossrefResearcherId(name: string) {
  return `crossref:${encodeURIComponent(name.trim().toLocaleLowerCase())}`;
}

function decodeCrossrefResearcherId(id: string) {
  try {
    return decodeURIComponent(normalizeCrossrefResearcherId(id));
  } catch {
    throw new ResearchProviderError("The Crossref researcher identifier is invalid.", 400);
  }
}

export async function searchWorks(options: SearchPapersOptions) {
  const page = options.page ?? 1;
  const perPage = options.perPage ?? 10;
  try {
    const searchTerms = [options.query, options.title].filter(Boolean);
    const filters: string[] = [];
    if (options.author) {
      const authorId = await resolveAuthorId(options.author);
      if (!authorId) return await searchCrossrefWorks(options);
      filters.push(`authorships.author.id:${authorId.split("/").pop()}`);
    }
    if (options.yearFrom && options.yearTo) filters.push(`publication_year:${options.yearFrom}-${options.yearTo}`);
    else if (options.yearFrom) filters.push(`publication_year:>${options.yearFrom - 1}`);
    else if (options.yearTo) filters.push(`publication_year:<${options.yearTo + 1}`);
    if (options.topic) {
      const topicId = await resolveTopicId(options.topic);
      if (!topicId) return await searchCrossrefWorks(options);
      filters.push(`topics.id:${topicId.split("/").pop()}`);
    }
    const params: Record<string, string | number | undefined> = {
      search: searchTerms.join(" ") || undefined,
      filter: filters.length ? filters.join(",") : undefined,
      sort: options.sort,
      page,
      "per-page": perPage,
      select: "id,doi,display_name,title,publication_year,publication_date,authorships,abstract_inverted_index,cited_by_count,primary_location,topics",
    };
    const response = await fetchJson<ProviderResponse<OpenAlexWork>>(queryUrl("https://api.openalex.org/works", params));
    return {
      results: (response.results ?? []).map(paperFromOpenAlex),
      total: response.meta?.count ?? null,
      page,
      perPage,
      source: "OpenAlex",
    };
  } catch (error) {
    if (error instanceof ResearchProviderError && error.status === 404) throw error;
    return searchCrossrefWorks(options);
  }
}

async function searchCrossrefWorks(options: SearchPapersOptions) {
  const query = [options.query, options.topic].filter(Boolean).join(" ");
  const filters: string[] = [];
  if (options.yearFrom) filters.push(`from-pub-date:${options.yearFrom}`);
  if (options.yearTo) filters.push(`until-pub-date:${options.yearTo}`);
  const response = await fetchJson<CrossrefWorksResponse>(queryUrl("https://api.crossref.org/works", {
    query: query || undefined,
    "query.title": options.title,
    "query.author": options.author,
    filter: filters.length ? filters.join(",") : undefined,
    rows: options.perPage ?? 10,
    offset: ((options.page ?? 1) - 1) * (options.perPage ?? 10),
  }));
  const items = response.message?.items ?? [];
  return {
    results: items.map(paperFromCrossref).filter((work): work is ResearchRecord => work !== null),
    total: response.message?.["total-results"] ?? null,
    page: options.page ?? 1,
    perPage: options.perPage ?? 10,
    source: "Crossref",
  };
}

function paperFromCrossref(work: CrossrefWork): ResearchRecord | null {
  const doi = work.DOI ?? null;
  const resolvedUrl = doi ? `https://doi.org/${doi}` : work.URL;
  if (!resolvedUrl) return null;
  const year = work.published?.["date-parts"]?.[0]?.[0] ?? null;
  return {
    id: resolvedUrl,
    doi,
    title: work.title?.[0] ?? null,
    authors: (work.author ?? []).map((author) => ({
      id: author.ORCID ?? null,
      name: [author.given, author.family].filter(Boolean).join(" ") || null,
      institution: author.affiliation?.map((entry) => entry.name).filter(Boolean).join(", ") || null,
      institutionId: null,
    })),
    year,
    publicationDate: year ? `${year}` : null,
    abstract: work.abstract?.replace(/<[^>]*>/g, " ").trim() || null,
    venue: work["container-title"]?.[0] ?? null,
    url: work.URL ?? resolvedUrl,
    citations: work["is-referenced-by-count"] ?? null,
    source: "Crossref",
    topics: [],
  };
}

function mapResearcher(person: OpenAlexAuthor) {
  const institution = person.last_known_institutions?.[0];
  return {
    id: person.id,
    source: "OpenAlex",
    sourceUrl: person.id,
    name: person.display_name ?? null,
    works: person.works_count ?? null,
    citations: person.cited_by_count ?? null,
    institution: institution?.display_name ?? null,
    institutionId: institution?.id ?? null,
    topics: (person.topics ?? person.x_concepts ?? []).slice(0, 5).map((topic) => topic.display_name).filter((topic): topic is string => Boolean(topic)),
    orcid: person.orcid ?? person.ids?.orcid ?? null,
  };
}

export interface SearchResearcherOptions {
  query?: string;
  topic?: string;
  institution?: string;
  page?: number;
  perPage?: number;
}

export async function searchResearchers(options: SearchResearcherOptions) {
  const page = options.page ?? 1;
  const perPage = options.perPage ?? 10;
  try {
    const filters: string[] = [];
    if (options.topic) {
      const topicId = await resolveTopicId(options.topic);
      if (!topicId) return { results: [], total: 0, page, perPage, source: "OpenAlex", hasMore: false };
      filters.push(`topics.id:${topicId.split("/").pop()}`);
    }
    if (options.institution) {
      const institutionId = await resolveInstitutionId(options.institution);
      if (!institutionId) return { results: [], total: 0, page, perPage, source: "OpenAlex", hasMore: false };
      filters.push(`last_known_institutions.id:${institutionId.split("/").pop()}`);
    }
    const response = await fetchJson<ProviderResponse<OpenAlexAuthor>>(queryUrl("https://api.openalex.org/authors", {
      search: options.query,
      filter: filters.length ? filters.join(",") : undefined,
      "per-page": perPage,
      page,
    }));
    return {
      results: (response.results ?? []).map(mapResearcher),
      total: response.meta?.count ?? null,
      page,
      perPage,
      source: "OpenAlex",
      hasMore: (response.results?.length ?? 0) === perPage,
    };
  } catch (error) {
    if (!(error instanceof ResearchProviderError) || ![429, 502, 504].includes(error.status)) throw error;
    const fallbackQuery = [options.query, options.topic, options.institution].filter(Boolean).join(" ").trim();
    const fallback = await searchCrossrefResearchers(fallbackQuery, page, perPage);
    if (fallback.results.length || fallbackQuery) return fallback;
    throw error;
  }
}

async function searchCrossrefResearchers(query: string, page: number, perPage: number) {
  const offset = (page - 1) * perPage;
  const works = await searchCrossrefWorks({ query, page, perPage });
  const authors = new Map<string, { author: ResearchAuthor; works: number; citations: number }>();
  for (const work of works.results) {
    const seenOnWork = new Set<string>();
    for (const author of work.authors) {
      const name = author.name?.trim().replace(/\s+/g, " ");
      if (!name) continue;
      const key = normalizedAuthorName(name);
      if (seenOnWork.has(key)) continue;
      seenOnWork.add(key);
      const existing = authors.get(key);
      if (existing) {
        existing.works += 1;
        existing.citations += work.citations ?? 0;
      } else {
        authors.set(key, { author, works: 1, citations: work.citations ?? 0 });
      }
    }
  }
  const results = [...authors.values()].map(({ author, works: worksInResults, citations: citationsInResults }) => ({
    id: crossrefResearcherId(author.name!),
    source: "Crossref",
    sourceUrl: `https://search.crossref.org/?q=${encodeURIComponent(author.name!)}`,
    name: author.name,
    works: null,
    citations: null,
    worksInResults,
    citationsInResults,
    institution: author.institution,
    institutionId: null,
    topics: [],
    orcid: author.id,
  })).slice(0, perPage);
  const hasMore = works.total !== null && offset + perPage < works.total;
  return { results, total: null, page, perPage, source: "Crossref", hasMore };
}

function normalizedAuthorName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function isCrossrefAuthor(author: ResearchAuthor, name: string) {
  return Boolean(author.name && normalizedAuthorName(author.name) === normalizedAuthorName(name));
}

function mapCrossrefResearcher(author: ResearchAuthor) {
  const name = author.name?.trim().replace(/\s+/g, " ") ?? null;
  if (!name) throw new ResearchProviderError("Crossref did not return a researcher name.", 404);
  return {
    id: crossrefResearcherId(name),
    source: "Crossref",
    sourceUrl: `https://search.crossref.org/?q=${encodeURIComponent(name)}`,
    name,
    works: null,
    citations: null,
    institution: author.institution,
    institutionId: null,
    topics: [],
    orcid: author.id,
  };
}

async function getCrossrefResearcherSummary(name: string) {
  const works = await searchCrossrefWorks({ author: name, page: 1, perPage: 50 });
  const author = works.results.flatMap((work) => work.authors).find((entry) => isCrossrefAuthor(entry, name));
  if (!author) throw new ResearchProviderError("Crossref did not return works for this author-name search.", 404);
  return mapCrossrefResearcher(author);
}

async function getCrossrefResearcher(id: string, page: number, perPage: number) {
  const name = decodeCrossrefResearcherId(id);
  const offsetPage = Math.ceil(((page - 1) * perPage + 1) / 50);
  const works = await searchCrossrefWorks({ author: name, page: offsetPage, perPage: 50 });
  const matchingWorks = works.results.filter((work) => work.authors.some((author) => isCrossrefAuthor(author, name)));
  const matchedAuthor = matchingWorks.flatMap((work) => work.authors).find((author) => isCrossrefAuthor(author, name));
  if (!matchedAuthor) throw new ResearchProviderError("Crossref did not return works matching this author name.", 404);
  const researcher = {
    ...mapCrossrefResearcher(matchedAuthor),
    worksInResults: matchingWorks.length,
    citationsInResults: matchingWorks.reduce((total, work) => total + (work.citations ?? 0), 0),
  };
  const related = new Map<string, { researcher: ReturnType<typeof mapCrossrefResearcher>; sharedPapers: number }>();
  for (const work of matchingWorks) {
    for (const author of work.authors) {
      if (!author.name || isCrossrefAuthor(author, name)) continue;
      const key = normalizedAuthorName(author.name);
      const entry = related.get(key);
      if (entry) entry.sharedPapers += 1;
      else related.set(key, { researcher: mapCrossrefResearcher(author), sharedPapers: 1 });
    }
  }
  const worksToShow = matchingWorks.slice(((page - 1) * perPage) % 50, ((page - 1) * perPage) % 50 + perPage);
  return {
    ...researcher,
    externalLinks: { record: researcher.sourceUrl, orcid: researcher.orcid },
    publications: { results: worksToShow, total: null, page, perPage },
    relatedResearchers: [...related.values()],
    relationEvidence: "Co-authors are names listed with this author in the returned Crossref records. Crossref does not provide a canonical author identity for every name; same-name researchers may be ambiguous.",
  };
}

export async function getResearcher(id: string, page = 1, perPage = 10) {
  const normalized = normalizeAuthorId(id);
  if (/^crossref:/i.test(normalized)) return getCrossrefResearcher(normalized, page, perPage);
  if (!/^A\d+$/i.test(normalized)) throw new ResearchProviderError("The researcher identifier is invalid.", 400);
  const person = await fetchJson<OpenAlexAuthor>(`https://api.openalex.org/authors/${encodeURIComponent(normalized)}`);
  const researcher = mapResearcher(person);
  const works = await fetchJson<ProviderResponse<OpenAlexWork>>(queryUrl("https://api.openalex.org/works", {
    filter: `authorships.author.id:${person.id.replace("https://openalex.org/", "")}`,
    sort: "publication_date:desc",
    page,
    "per-page": perPage,
    select: "id,doi,display_name,title,publication_year,publication_date,authorships,abstract_inverted_index,cited_by_count,primary_location,topics",
  }));
  const papers = (works.results ?? []).map(paperFromOpenAlex);
  const related = new Map<string, { researcher: ReturnType<typeof mapResearcher>; sharedPapers: number }>();
  for (const work of works.results ?? []) {
    for (const author of work.authorships ?? []) {
      const authorId = author.author?.id;
      if (!authorId || authorId === person.id) continue;
      const entry = related.get(authorId);
      if (entry) entry.sharedPapers += 1;
      else related.set(authorId, {
        researcher: {
          id: authorId,
          source: "OpenAlex",
          sourceUrl: authorId,
          name: author.author?.display_name ?? null,
          works: null,
          citations: null,
          institution: author.institutions?.[0]?.display_name ?? null,
          institutionId: author.institutions?.[0]?.id ?? null,
          topics: [],
          orcid: null,
        },
        sharedPapers: 1,
      });
    }
  }
  const authorshipCounts = [...related.values()];
  return {
    ...researcher,
    externalLinks: {
      record: person.id,
      orcid: person.orcid ?? person.ids?.orcid ?? null,
    },
    publications: { results: papers, total: works.meta?.count ?? null, page, perPage },
    relatedResearchers: authorshipCounts,
    relationEvidence: "Co-authors are derived only from author lists on the returned OpenAlex works. Shared-work counts describe this fetched publication page.",
  };
}

export async function getResearcherSummary(id: string) {
  const normalized = normalizeAuthorId(id);
  if (/^crossref:/i.test(normalized)) {
    const name = decodeCrossrefResearcherId(normalized);
    return getCrossrefResearcherSummary(name);
  }
  if (!/^A\d+$/i.test(normalized)) throw new ResearchProviderError("The researcher identifier is invalid.", 400);
  const person = await fetchJson<OpenAlexAuthor>(`https://api.openalex.org/authors/${encodeURIComponent(normalized)}`);
  return mapResearcher(person);
}

export async function getPaper(id: string) {
  const normalized = id.trim();
  const openAlexId = normalized.match(/^https?:\/\/(api\.)?openalex\.org\/(?:works\/)?(W\d+)$/i);
  if (openAlexId || /^W\d+$/i.test(normalized)) {
    const workId = openAlexId?.[2] ?? normalized;
    const work = await fetchJson<OpenAlexWork>(`https://api.openalex.org/works/${encodeURIComponent(workId)}`);
    return paperFromOpenAlex(work);
  }
  const crossrefWorkId = normalized.match(/^https?:\/\/api\.crossref\.org\/works\/(.+)$/i);
  if (crossrefWorkId) {
    let decodedId: string;
    try {
      decodedId = decodeURIComponent(crossrefWorkId[1]);
    } catch {
      throw new ResearchProviderError("The Crossref work identifier is invalid.", 400);
    }
    const response = await fetchJson<{ message?: CrossrefWork }>(`https://api.crossref.org/works/${encodeURIComponent(decodedId)}`);
    const work = response.message ? paperFromCrossref(response.message) : null;
    if (!work) throw new ResearchProviderError("The requested scholarly record was not found.", 404);
    return work;
  }
  const doi = normalized.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:/i, "");
  if (!/^\S+\/\S+$/.test(doi)) throw new ResearchProviderError("The paper identifier must be an OpenAlex work ID or DOI.", 400);
  const response = await fetchJson<{ message?: CrossrefWork }>(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  const work = response.message ? paperFromCrossref(response.message) : null;
  if (!work) throw new ResearchProviderError("The requested scholarly record was not found.", 404);
  return work;
}

export async function getTrends() {
  try {
    const response = await fetchJson<ProviderResponse<{ id: string; display_name: string; works_count?: number | null; cited_by_count?: number | null; description?: string | null }>>(
      queryUrl("https://api.openalex.org/topics", {
        sort: "works_count:desc",
        "per-page": 20,
        select: "id,display_name,works_count,cited_by_count,description",
      }),
    );
    return {
      results: (response.results ?? []).map((topic) => ({
        id: topic.id,
        topic: topic.display_name,
        papers: topic.works_count ?? null,
        citations: topic.cited_by_count ?? null,
        description: topic.description ?? null,
      })),
      total: response.meta?.count ?? null,
      page: response.meta?.page ?? 1,
      perPage: response.meta?.per_page ?? 20,
      source: "OpenAlex",
    };
  } catch (error) {
    if (!(error instanceof ResearchProviderError) || ![429, 502, 504].includes(error.status)) throw error;
    const settled = await Promise.allSettled(crossrefResearchConcepts.map(async (term) => {
      const stats = await getCrossrefKeywordStats(term);
      return {
        id: `crossref:${encodeURIComponent(term)}`,
        topic: term,
        papers: stats.total,
        citations: null,
        description: null,
      };
    }));
    const results = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    if (!results.length) {
      const fallbackError = settled.find((result): result is PromiseRejectedResult => result.status === "rejected")?.reason;
      throw fallbackError instanceof Error ? fallbackError : error;
    }
    return {
      results: results.filter((trend) => trend.papers !== null),
      total: results.filter((trend) => trend.papers !== null).length,
      page: 1,
      perPage: crossrefResearchConcepts.length,
      source: "Crossref",
    };
  }
}

async function getCrossrefKeywordStats(query: string) {
  const response = await fetchJson<{
    message?: {
      "total-results"?: number;
      facets?: { published?: { values?: Record<string, number> } };
    };
  }>(queryUrl("https://api.crossref.org/works", {
    query,
    rows: 0,
    facet: "published:*",
  }));
  const currentYear = new Date().getFullYear();
  const results = Object.entries(response.message?.facets?.published?.values ?? {})
    .filter(([year]) => /^\d{4}$/.test(year) && Number(year) >= 2000 && Number(year) <= currentYear)
    .map(([year, papers]) => ({ year: Number(year), papers }))
    .sort((a, b) => a.year - b.year);
  return { total: response.message?.["total-results"] ?? null, results };
}

export async function getPublicationYears(topic?: string) {
  try {
    const filters = ["from_publication_date:2000-01-01"];
    if (topic) {
      const topicId = await resolveTopicId(topic);
      if (!topicId) return { results: [], source: "OpenAlex" };
      filters.push(`topics.id:${topicId.split("/").pop()}`);
    }
    const data = await fetchJson<{ group_by?: Array<{ key: string; count: number }> }>(queryUrl("https://api.openalex.org/works", {
      group_by: "publication_year",
      filter: filters.join(","),
      "per-page": 100,
    }));
    return {
      results: (data.group_by ?? [])
        .filter((item) => item.key !== "null" && Number(item.key) >= 2000 && Number(item.key) <= new Date().getFullYear())
        .map((item) => ({ year: Number(item.key), papers: item.count }))
        .sort((a, b) => a.year - b.year),
      source: "OpenAlex",
    };
  } catch (error) {
    if (!(error instanceof ResearchProviderError) || ![429, 502, 504].includes(error.status)) throw error;
    const stats = await getCrossrefKeywordStats(topic || "artificial intelligence");
    return { results: stats.results, source: "Crossref" };
  }
}

export async function getDashboardOverview() {
  const [trendsResult, papersResult, researchersResult] = await Promise.allSettled([
    getTrends(),
    searchWorks({ query: "artificial intelligence", perPage: 5, sort: "publication_date:desc" }),
    searchResearchers({ query: "artificial intelligence", perPage: 5 }),
  ]);
  const trends = trendsResult.status === "fulfilled" ? trendsResult.value : null;
  const papers = papersResult.status === "fulfilled" ? papersResult.value : null;
  const researchers = researchersResult.status === "fulfilled" ? researchersResult.value : null;
  if (!trends && !papers) {
    throw trendsResult.status === "rejected" ? trendsResult.reason : papersResult.status === "rejected" ? papersResult.reason : new ResearchProviderError("Research data is temporarily unavailable.", 502);
  }
  const dashboardTopics = trends?.results.slice(0, 7) ?? [];
  return {
    source: trends?.source ?? papers?.source ?? "Research providers",
    paperSource: papers?.source ?? null,
    researcherSource: researchers ? "OpenAlex" : null,
    topicCount: trends?.total ?? null,
    paperCount: papers?.total ?? null,
    researcherCount: researchers?.total ?? null,
    topicsReturned: dashboardTopics.length,
    papers: papers?.results.slice(0, 3) ?? [],
    trends: dashboardTopics,
    retrievedAt: new Date().toISOString(),
  };
}
