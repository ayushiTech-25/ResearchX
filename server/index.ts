import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db.js";
import { requireAuth, type AuthenticatedRequest } from "./middleware/auth.js";
import { getDashboardOverview, getPaper, getPublicationYears, getResearcher, getResearcherSummary, getTrends, ResearchProviderError, searchResearchers, searchWorks } from "./services/research.js";
import { AIProviderError, generateGeminiContent } from "./services/ai.js";
import { persistPaper, persistResearcher } from "./services/persistence.js";

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.API_PORT) || (isProduction ? Number(process.env.PORT) || 3001 : 3001);
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

function getSessionSecret() {
  const secret = process.env.JWT_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(128),
});
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128) });

function issueSession(res: express.Response, userId: string) {
  const secret = getSessionSecret();
  if (!secret) throw new Error("JWT_SECRET must contain at least 32 characters.");
  const token = jwt.sign({}, secret, { subject: userId, expiresIn: "7d" });
  res.cookie("session", token, { httpOnly: true, secure: isProduction, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000, path: "/" });
}

app.post("/api/auth/register", async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid registration details." });
  if (!process.env.DATABASE_URL?.trim()) return res.status(503).json({ error: "Account features require PostgreSQL. Configure DATABASE_URL in the server environment." });
  if (!getSessionSecret()) return res.status(503).json({ error: "Authentication is not configured. Set JWT_SECRET to at least 32 characters." });
  try {
    const email = parsed.data.email.toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ error: "An account with this email already exists." });
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({ data: { name: parsed.data.name, email, passwordHash } });
    issueSession(res, user.id);
    return res.status(201).json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    return next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email and password." });
  if (!process.env.DATABASE_URL?.trim()) return res.status(503).json({ error: "Account features require PostgreSQL. Configure DATABASE_URL in the server environment." });
  if (!getSessionSecret()) return res.status(503).json({ error: "Authentication is not configured. Set JWT_SECRET to at least 32 characters." });
  try {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: "Email or password is incorrect." });
    issueSession(res, user.id);
    return res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) { return next(error); }
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("session", { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/" });
  res.status(204).end();
});
app.get("/api/auth/me", async (req, res, next) => {
  const token = req.cookies?.session as string | undefined;
  const secret = getSessionSecret();
  if (!token || !secret) return res.json({ user: null });
  let userId: string;
  try {
    const payload = jwt.verify(token, secret);
    if (typeof payload === "string" || typeof payload.sub !== "string") return res.json({ user: null });
    userId = payload.sub;
  } catch {
    return res.json({ user: null });
  }
  if (!process.env.DATABASE_URL?.trim()) {
    return res.status(503).json({ error: "Account features require PostgreSQL. Configure DATABASE_URL in the server environment." });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
    if (!user) return res.json({ user: null });
    return res.json({ user });
  } catch (error) { return next(error); }
});

const paginationSchema = {
  page: z.coerce.number().int().min(1).max(1000).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(10),
};

app.get("/api/dashboard", async (_req, res, next) => {
  try {
    const overview = await getDashboardOverview();
    let userId: string | null = null;
    const token = _req.cookies?.session as string | undefined;
    const secret = getSessionSecret();
    if (token && secret) {
      try {
        const payload = jwt.verify(token, secret);
        if (typeof payload !== "string" && typeof payload.sub === "string") userId = payload.sub;
      } catch {
        userId = null;
      }
    }
    if (!userId) return res.json({ ...overview, authenticated: false, savedCount: null, collectionCount: null, workspaceCount: null, recentActivity: [] });
    const [savedCount, collectionCount, workspaceCount, recentActivity] = await Promise.all([
      prisma.savedItem.count({ where: { userId } }),
      prisma.researchCollection.count({ where: { userId } }),
      prisma.researchWorkspace.count({ where: { userId } }),
      prisma.researchActivity.findMany({
        where: { userId },
        select: { id: true, action: true, targetType: true, targetId: true, targetName: true, contextName: true, externalId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);
    return res.json({ ...overview, authenticated: true, savedCount, collectionCount, workspaceCount, recentActivity });
  } catch (error) { return next(error); }
});
app.get("/api/research/papers", async (req, res, next) => {
  const parsed = z.object({
    q: z.string().trim().max(180).optional(),
    title: z.string().trim().max(180).optional(),
    author: z.string().trim().max(180).optional(),
    topic: z.string().trim().max(180).optional(),
    yearFrom: z.coerce.number().int().min(1500).max(2100).optional(),
    yearTo: z.coerce.number().int().min(1500).max(2100).optional(),
    ...paginationSchema,
  }).refine((value) => Boolean(value.q || value.title || value.author || value.topic), "Enter a query, title, author, or topic.")
    .refine((value) => !value.yearFrom || !value.yearTo || value.yearFrom <= value.yearTo, "The starting year must be before the ending year.")
    .safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Enter valid research search filters." });
  const { q, ...filters } = parsed.data;
  try { return res.json(await searchWorks({ ...filters, query: q })); } catch (error) { return next(error); }
});
app.get("/api/research/paper", async (req, res, next) => {
  const parsed = z.object({ id: z.string().trim().min(2).max(500) }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "A valid paper identifier is required." });
  try { return res.json({ paper: await getPaper(parsed.data.id) }); } catch (error) { return next(error); }
});
app.get("/api/research/researchers", async (req, res, next) => {
  const parsed = z.object({
    q: z.string().trim().max(180).optional(),
    topic: z.string().trim().max(180).optional(),
    institution: z.string().trim().max(180).optional(),
    ...paginationSchema,
  }).refine((value) => Boolean(value.q || value.topic || value.institution), "Enter a researcher, topic, or institution search.")
    .safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Enter valid researcher search filters." });
  const { q, ...filters } = parsed.data;
  try { return res.json(await searchResearchers({ ...filters, query: q })); } catch (error) { return next(error); }
});
app.get("/api/research/researcher", async (req, res, next) => {
  const parsed = z.object({ id: z.string().trim().min(2).max(200), ...paginationSchema }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "A valid researcher identifier is required." });
  try { return res.json({ researcher: await getResearcher(parsed.data.id, parsed.data.page, parsed.data.perPage) }); } catch (error) { return next(error); }
});
app.get("/api/research/trends", async (_req, res, next) => {
  try { return res.json(await getTrends()); } catch (error) { return next(error); }
});
app.get("/api/research/works-by-year", async (req, res, next) => {
  const parsed = z.object({ topic: z.string().trim().max(180).optional() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid trend filters." });
  try {
    return res.json(await getPublicationYears(parsed.data.topic));
  } catch (error) { return next(error); }
});

app.post("/api/ai/assistant", requireAuth, async (req, res, next) => {
  const parsed = z.object({ message: z.string().trim().min(1).max(4000), context: z.string().max(12000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a message of up to 4,000 characters." });
  try {
    const answer = await generateGeminiContent({
      systemInstruction: "You are an evidence-conscious AI research assistant. Help users refine research questions, explore research directions, compare methods, and structure literature reviews. Be clear about uncertainty. Never invent papers, citations, authors, datasets, or results. Clearly identify ideas as AI-generated suggestions, not verified sources.",
      prompt: `${parsed.data.context ? `Research context:\n${parsed.data.context}\n\n` : ""}Research question:\n${parsed.data.message}`,
    });
    return res.json({ answer });
  } catch (error) {
    if (error instanceof AIProviderError) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
});

const analysisSchema = z.object({
  paperInformation: z.object({
    problemStatement: z.string().nullable(),
    researchObjective: z.string().nullable(),
    methodology: z.string().nullable(),
    algorithmsOrModels: z.array(z.string()),
    dataset: z.string().nullable(),
    results: z.string().nullable(),
    contributions: z.array(z.string()),
    limitations: z.array(z.string()),
    futureWork: z.array(z.string()),
    importantTerms: z.array(z.string()),
  }),
  aiGenerated: z.object({
    simpleSummary: z.string().nullable(),
    interpretation: z.string().nullable(),
    suggestions: z.array(z.string()),
  }),
});

app.post("/api/ai/paper-analysis", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({
    title: z.string().trim().max(500).optional(),
    content: z.string().trim().min(80).max(12000),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Provide paper text between 80 and 12,000 characters." });
  try {
    const content = await generateGeminiContent({
      responseFormat: "json",
      systemInstruction: [
        "Analyze only the title and paper text supplied by the user. You have not read any paper, appendix, dataset, or result outside that supplied text.",
        "Return valid JSON only with exactly these top-level keys: paperInformation and aiGenerated.",
        "paperInformation must contain problemStatement, researchObjective, methodology, dataset, results (each string or null), and algorithmsOrModels, contributions, limitations, futureWork, importantTerms (each an array of strings).",
        "Only populate a paperInformation field when the supplied text explicitly supports it. Use null or [] when it does not. Never infer missing results, datasets, methods, limitations, or citations.",
        "aiGenerated must contain simpleSummary, interpretation (each string or null) and suggestions (array of strings). Label these as AI-created reasoning from the supplied text, not claims from the paper. Suggestions must be questions or ideas to verify, not asserted results.",
        "Do not add citations, author names, results, or background facts that are absent from the supplied text.",
      ].join(" "),
      prompt: `Title supplied by user: ${parsed.data.title || "Not provided"}\n\nPaper content supplied by user (the only source to analyze):\n${parsed.data.content}`,
    });
    let unvalidated: unknown;
    try { unvalidated = JSON.parse(content); } catch { return res.status(502).json({ error: "The AI provider returned malformed structured analysis." }); }
    const result = analysisSchema.safeParse(unvalidated);
    if (!result.success) return res.status(502).json({ error: "The AI provider returned an incomplete paper analysis. Please try again." });
    const savedAnalysis = await prisma.paperAnalysis.create({
      data: {
        userId: req.userId!,
        sourceTitle: parsed.data.title,
        suppliedText: parsed.data.content,
        result: result.data,
        model: "gemini-3.5-flash-lite",
      },
      select: { id: true, createdAt: true },
    });
    return res.json({ analysis: result.data, analysisId: savedAnalysis.id, analyzedAt: savedAnalysis.createdAt.toISOString() });
  } catch (error) {
    if (error instanceof AIProviderError) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
});

app.get("/api/collections", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const collections = await prisma.researchCollection.findMany({ where: { userId: req.userId }, include: { items: { orderBy: { createdAt: "desc" }, include: { paper: true, researcher: true } }, _count: { select: { items: true } } }, orderBy: { updatedAt: "desc" } });
    return res.json({ collections });
  } catch (error) { return next(error); }
});
app.post("/api/collections", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(500).optional(), workspaceId: z.string().trim().min(1).max(100).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid collection." });
  try {
    if (parsed.data.workspaceId) {
      const workspace = await prisma.researchWorkspace.findFirst({ where: { id: parsed.data.workspaceId, userId: req.userId }, select: { id: true } });
      if (!workspace) return res.status(404).json({ error: "Workspace not found." });
    }
    const existing = await prisma.researchCollection.findFirst({
      where: { userId: req.userId, name: parsed.data.name, workspaceId: parsed.data.workspaceId ?? null },
    });
    if (existing) return res.json({ collection: existing, created: false });
    const collection = await prisma.$transaction(async (tx) => {
      const created = await tx.researchCollection.create({ data: { ...parsed.data, userId: req.userId! } });
      await tx.researchActivity.create({
        data: { userId: req.userId!, action: "collection_created", targetType: "collection", targetId: created.id, targetName: created.name },
      });
      return created;
    });
    return res.status(201).json({ collection, created: true });
  } catch (error) { return next(error); }
});
app.get("/api/workspaces", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspaces = await prisma.researchWorkspace.findMany({
      where: { userId: req.userId },
      include: {
        _count: { select: { collections: true, papers: true, researchers: true } },
        collections: { select: { id: true, name: true, description: true, updatedAt: true } },
        papers: { include: { paper: { select: { id: true, externalId: true, title: true, publicationYear: true, source: true } } }, orderBy: { addedAt: "desc" } },
        researchers: { include: { researcher: { select: { id: true, externalId: true, displayName: true, institutionName: true } } }, orderBy: { addedAt: "desc" } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return res.json({ workspaces });
  } catch (error) { return next(error); }
});
app.post("/api/workspaces", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(500).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid workspace." });
  try {
    const existing = await prisma.researchWorkspace.findFirst({ where: { userId: req.userId, name: parsed.data.name } });
    if (existing) return res.json({ workspace: existing, created: false });
    const workspace = await prisma.$transaction(async (tx) => {
      const created = await tx.researchWorkspace.create({ data: { ...parsed.data, userId: req.userId! } });
      await tx.researchActivity.create({
        data: { userId: req.userId!, action: "workspace_created", targetType: "workspace", targetId: created.id, targetName: created.name },
      });
      return created;
    });
    return res.status(201).json({ workspace, created: true });
  } catch (error) { return next(error); }
});
app.post("/api/collections/:collectionId/items", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({
    externalId: z.string().trim().min(2).max(500),
    kind: z.enum(["paper", "researcher"]),
    title: z.string().trim().min(1).max(500),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid saved research item." });
  try {
    const collectionId = z.string().min(1).max(100).parse(req.params.collectionId);
    const collection = await prisma.researchCollection.findFirst({ where: { id: collectionId, userId: req.userId }, select: { id: true, name: true } });
    if (!collection) return res.status(404).json({ error: "Collection not found." });
    const record = parsed.data.kind === "paper"
      ? await persistPaper(prisma, await getPaper(parsed.data.externalId))
      : await persistResearcher(prisma, await getResearcherSummary(parsed.data.externalId));
    const externalId = record.externalId;
    const item = await prisma.$transaction(async (tx) => {
      const existing = await tx.savedItem.findUnique({
        where: { collectionId_externalId: { collectionId, externalId } },
        select: { id: true },
      });
      const saved = await tx.savedItem.upsert({
        where: { collectionId_externalId: { collectionId, externalId } },
        create: {
          ...parsed.data,
          externalId,
          collectionId,
          userId: req.userId!,
          paperId: parsed.data.kind === "paper" ? record.id : null,
          researcherId: parsed.data.kind === "researcher" ? record.id : null,
        },
        update: {
          title: parsed.data.title,
          kind: parsed.data.kind,
          paperId: parsed.data.kind === "paper" ? record.id : null,
          researcherId: parsed.data.kind === "researcher" ? record.id : null,
        },
      });
      if (!existing) {
        await tx.researchActivity.create({
          data: {
            userId: req.userId!,
            action: parsed.data.kind === "paper" ? "paper_added_to_collection" : "researcher_added_to_collection",
            targetType: parsed.data.kind,
            targetId: collectionId,
            targetName: parsed.data.title,
            contextName: collection.name,
            externalId,
          },
        });
      }
      return saved;
    });
    return res.status(201).json({ item });
  } catch (error) { return next(error); }
});
app.delete("/api/collections/:collectionId/items/:itemId", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({
    collectionId: z.string().trim().min(1).max(100),
    itemId: z.string().trim().min(1).max(100),
  }).safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: "A valid collection item is required." });
  try {
    const item = await prisma.savedItem.findFirst({
      where: { id: parsed.data.itemId, collectionId: parsed.data.collectionId, userId: req.userId },
      select: { id: true, kind: true, title: true, externalId: true, collection: { select: { name: true } } },
    });
    if (!item) return res.status(404).json({ error: "Saved research item not found." });
    await prisma.$transaction([
      prisma.savedItem.delete({ where: { id: item.id } }),
      prisma.researchActivity.create({
        data: {
          userId: req.userId!,
          action: item.kind === "paper" ? "paper_removed_from_collection" : "researcher_removed_from_collection",
          targetType: item.kind,
          targetId: parsed.data.collectionId,
          targetName: item.title,
          contextName: item.collection.name,
          externalId: item.externalId,
        },
      }),
    ]);
    return res.status(204).end();
  } catch (error) { return next(error); }
});
app.post("/api/saved/papers", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({ externalId: z.string().trim().min(2).max(500), title: z.string().trim().min(1).max(500) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "A valid paper is required." });
  try {
    const collectionName = "Saved research";
    const collection = await prisma.researchCollection.findFirst({ where: { userId: req.userId, name: collectionName, workspaceId: null } })
      ?? await prisma.researchCollection.create({ data: { userId: req.userId!, name: collectionName, description: "Papers and researchers saved for later." } });
    const existing = await prisma.savedItem.findUnique({
      where: { collectionId_externalId: { collectionId: collection.id, externalId: parsed.data.externalId } },
      select: { id: true },
    });
    if (existing) return res.json({ saved: true, itemId: existing.id });
    const record = await persistPaper(prisma, await getPaper(parsed.data.externalId));
    let item: { id: string };
    try {
      item = await prisma.$transaction(async (tx) => {
        const existingItem = await tx.savedItem.findUnique({
          where: { collectionId_externalId: { collectionId: collection.id, externalId: record.externalId } },
          select: { id: true },
        });
        if (existingItem) return existingItem;
        const saved = await tx.savedItem.create({
          data: {
            externalId: record.externalId,
            kind: "paper",
            title: record.title ?? parsed.data.title,
            collectionId: collection.id,
            userId: req.userId!,
            paperId: record.id,
          },
        });
        await tx.researchActivity.create({
          data: { userId: req.userId!, action: "paper_saved", targetType: "paper", targetName: record.title ?? parsed.data.title, externalId: record.externalId },
        });
        return saved;
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const existingItem = await prisma.savedItem.findUnique({
        where: { collectionId_externalId: { collectionId: collection.id, externalId: record.externalId } },
        select: { id: true },
      });
      if (!existingItem) throw error;
      return res.json({ saved: true, itemId: existingItem.id });
    }
    return res.status(201).json({ saved: true, itemId: item.id });
  } catch (error) { return next(error); }
});
app.delete("/api/saved/papers", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({ externalId: z.string().trim().min(2).max(500) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A valid paper identifier is required." });
  try {
    const collection = await prisma.researchCollection.findFirst({
      where: { userId: req.userId, name: "Saved research", workspaceId: null },
      select: { id: true },
    });
    if (!collection) return res.json({ saved: false });
    const item = await prisma.savedItem.findFirst({
      where: { collectionId: collection.id, userId: req.userId, externalId: parsed.data.externalId, kind: "paper" },
      select: { id: true },
    });
    if (!item) return res.json({ saved: false });
    await prisma.$transaction([
      prisma.savedItem.delete({ where: { id: item.id } }),
      prisma.researchActivity.create({
        data: { userId: req.userId!, action: "paper_unsaved", targetType: "paper", externalId: parsed.data.externalId },
      }),
    ]);
    return res.json({ saved: false });
  } catch (error) { return next(error); }
});
app.post("/api/workspaces/:workspaceId/items", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({ externalId: z.string().trim().min(2).max(500), kind: z.enum(["paper", "researcher"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid workspace item." });
  try {
    const workspaceId = z.string().min(1).max(100).parse(req.params.workspaceId);
    const workspace = await prisma.researchWorkspace.findFirst({ where: { id: workspaceId, userId: req.userId }, select: { id: true, name: true } });
    if (!workspace) return res.status(404).json({ error: "Workspace not found." });
    let recordId: string;
    let recordExternalId: string;
    let activityTargetName: string | null;
    if (parsed.data.kind === "paper") {
      const record = await persistPaper(prisma, await getPaper(parsed.data.externalId));
      recordId = record.id;
      recordExternalId = record.externalId;
      activityTargetName = record.title;
    } else {
      const record = await persistResearcher(prisma, await getResearcherSummary(parsed.data.externalId));
      recordId = record.id;
      recordExternalId = record.externalId;
      activityTargetName = record.displayName;
    }
    await prisma.$transaction(async (tx) => {
      let created = false;
      if (parsed.data.kind === "paper") {
        const existing = await tx.workspacePaper.findUnique({ where: { workspaceId_paperId: { workspaceId, paperId: recordId } }, select: { paperId: true } });
        await tx.workspacePaper.upsert({
          where: { workspaceId_paperId: { workspaceId, paperId: recordId } },
          create: { workspaceId, paperId: recordId },
          update: {},
        });
        created = !existing;
      } else {
        const existing = await tx.workspaceResearcher.findUnique({ where: { workspaceId_researcherId: { workspaceId, researcherId: recordId } }, select: { researcherId: true } });
        await tx.workspaceResearcher.upsert({
          where: { workspaceId_researcherId: { workspaceId, researcherId: recordId } },
          create: { workspaceId, researcherId: recordId },
          update: {},
        });
        created = !existing;
      }
      if (created) {
        await tx.researchActivity.create({
          data: {
            userId: req.userId!,
            action: parsed.data.kind === "paper" ? "paper_added_to_workspace" : "researcher_added_to_workspace",
            targetType: parsed.data.kind,
            targetName: activityTargetName,
            targetId: workspace.id,
            contextName: workspace.name,
            externalId: recordExternalId,
          },
        });
      }
    });
    return res.status(201).json({ added: true });
  } catch (error) { return next(error); }
});
app.delete("/api/workspaces/:workspaceId/items", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({
    workspaceId: z.string().trim().min(1).max(100),
    externalId: z.string().trim().min(2).max(500),
    kind: z.enum(["paper", "researcher"]),
  }).safeParse({ ...req.params, ...req.body });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "A valid workspace item is required." });
  try {
    const workspace = await prisma.researchWorkspace.findFirst({
      where: { id: parsed.data.workspaceId, userId: req.userId },
      select: { id: true, name: true },
    });
    if (!workspace) return res.status(404).json({ error: "Workspace not found." });
    if (parsed.data.kind === "paper") {
      const paper = await prisma.paper.findUnique({ where: { externalId: parsed.data.externalId }, select: { id: true, title: true } });
      if (!paper) return res.status(404).json({ error: "Paper not found in this workspace." });
      const removed = await prisma.$transaction(async (tx) => {
        const deleted = await tx.workspacePaper.deleteMany({ where: { workspaceId: workspace.id, paperId: paper.id } });
        if (!deleted.count) return false;
        await tx.researchActivity.create({
          data: { userId: req.userId!, action: "paper_removed_from_workspace", targetType: "paper", targetId: workspace.id, targetName: paper.title, contextName: workspace.name, externalId: parsed.data.externalId },
        });
        return true;
      });
      if (!removed) return res.status(404).json({ error: "Paper not found in this workspace." });
    } else {
      const researcher = await prisma.researcher.findUnique({ where: { externalId: parsed.data.externalId }, select: { id: true, displayName: true } });
      if (!researcher) return res.status(404).json({ error: "Researcher not found in this workspace." });
      const removed = await prisma.$transaction(async (tx) => {
        const deleted = await tx.workspaceResearcher.deleteMany({ where: { workspaceId: workspace.id, researcherId: researcher.id } });
        if (!deleted.count) return false;
        await tx.researchActivity.create({
          data: { userId: req.userId!, action: "researcher_removed_from_workspace", targetType: "researcher", targetId: workspace.id, targetName: researcher.displayName, contextName: workspace.name, externalId: parsed.data.externalId },
        });
        return true;
      });
      if (!removed) return res.status(404).json({ error: "Researcher not found in this workspace." });
    }
    return res.status(204).end();
  } catch (error) { return next(error); }
});
app.post("/api/research/researchers/:researcherId/save", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.string().trim().min(2).max(200).safeParse(req.params.researcherId);
  if (!parsed.success) return res.status(400).json({ error: "A valid researcher identifier is required." });
  try {
    const researcher = await persistResearcher(prisma, await getResearcherSummary(parsed.data));
    const collection = await prisma.researchCollection.findFirst({
      where: { userId: req.userId!, name: "Saved researchers" },
      orderBy: { createdAt: "asc" },
    }) ?? await prisma.researchCollection.create({
      data: { userId: req.userId!, name: "Saved researchers", description: "Researchers saved from the researcher explorer." },
    });
    await prisma.$transaction(async (tx) => {
      const existing = await tx.savedItem.findUnique({
        where: { collectionId_externalId: { collectionId: collection.id, externalId: researcher.externalId } },
        select: { id: true },
      });
      await tx.savedItem.upsert({
        where: { collectionId_externalId: { collectionId: collection.id, externalId: researcher.externalId } },
        create: {
          collectionId: collection.id, externalId: researcher.externalId,
          kind: "researcher", title: researcher.displayName ?? "Data unavailable", userId: req.userId!, researcherId: researcher.id,
        },
        update: { title: researcher.displayName ?? "Data unavailable", researcherId: researcher.id },
      });
      if (!existing) {
        await tx.researchActivity.create({
          data: {
            userId: req.userId!,
            action: "researcher_saved",
            targetType: "researcher",
            targetName: researcher.displayName,
            contextName: collection.name,
            externalId: researcher.externalId,
          },
        });
      }
    });
    return res.status(201).json({ saved: true, collectionId: collection.id });
    } catch (error) { return next(error); }
});

app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ResearchProviderError) {
    console.warn(`Research provider request failed (${error.status}): ${error.message}`);
    return res.status(error.status).json({ error: error.message });
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    const errorMessage = req.path.startsWith("/api/ai/")
      ? "The AI provider took too long to respond. Please try again."
      : "Research service is taking too long to respond. Please try again.";
    return res.status(504).json({ error: errorMessage });
  }
  console.error("API error:", error);
  if (res.headersSent) return;
  return res.status(500).json({ error: "Something went wrong while processing your request." });
});

if (isProduction) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const clientBuild = path.resolve(currentDir, "../../dist");
  app.use(express.static(clientBuild));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(clientBuild, "index.html")));
}

app.listen(port, "0.0.0.0", () => console.log(`ResearchX API listening on ${port}`));
