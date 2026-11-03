import { Prisma, type PrismaClient } from "@prisma/client";
import type { ResearchRecord } from "./research.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface ResearcherRecord {
  id: string;
  name: string | null;
  works: number | null;
  citations: number | null;
  institution: string | null;
  institutionId: string | null;
  topics: string[];
}

export async function persistResearcher(client: DbClient, researcher: ResearcherRecord) {
  return client.researcher.upsert({
    where: { externalId: researcher.id },
    create: {
      externalId: researcher.id,
      displayName: researcher.name,
      worksCount: researcher.works,
      citedByCount: researcher.citations,
      institutionName: researcher.institution,
      institutionId: researcher.institutionId,
      externalUrl: researcher.id,
      lastFetchedAt: new Date(),
    },
    update: {
      displayName: researcher.name,
      worksCount: researcher.works,
      citedByCount: researcher.citations,
      institutionName: researcher.institution,
      institutionId: researcher.institutionId,
      lastFetchedAt: new Date(),
    },
  });
}

export async function persistPaper(client: DbClient, work: ResearchRecord) {
  const existing = await client.paper.findFirst({
    where: { OR: [{ externalId: work.id }, ...(work.doi ? [{ doi: work.doi }] : [])] },
    select: { id: true },
  });
  const base = {
    externalId: work.id,
    doi: work.doi,
    title: work.title,
    abstract: work.abstract,
    publicationYear: work.year,
    publicationDate: work.publicationDate ? new Date(work.publicationDate) : null,
    citedByCount: work.citations,
    source: work.source,
    externalUrl: work.url,
    lastFetchedAt: new Date(),
  };
  const paper = existing
    ? await client.paper.update({ where: { id: existing.id }, data: base })
    : await client.paper.create({ data: base });
  for (const [authorOrder, entry] of work.authors.entries()) {
    let researcherId: string | null = null;
    if (entry.id?.includes("openalex.org/authors/")) {
      const linkedResearcher = await persistResearcher(client, {
        id: entry.id,
        name: entry.name,
        works: null,
        citations: null,
        institution: entry.institution,
        institutionId: entry.institutionId,
        topics: [],
      });
      researcherId = linkedResearcher.id;
    }
    let author = entry.id
      ? await client.author.findUnique({ where: { externalId: entry.id } })
      : null;
    if (!author) {
      author = await client.author.create({
        data: {
          externalId: entry.id,
          displayName: entry.name,
          researcherId,
        },
      });
    } else if (researcherId && author.researcherId !== researcherId) {
      author = await client.author.update({ where: { id: author.id }, data: { researcherId } });
    }
    await client.authorPaper.upsert({
      where: { authorId_paperId: { authorId: author.id, paperId: paper.id } },
      create: { authorId: author.id, paperId: paper.id, authorOrder, institution: entry.institution },
      update: { authorOrder, institution: entry.institution },
    });
    if (researcherId) {
      await client.researcherPaper.upsert({
        where: { researcherId_paperId: { researcherId, paperId: paper.id } },
        create: { researcherId, paperId: paper.id, authorOrder, institution: entry.institution },
        update: { authorOrder, institution: entry.institution },
      });
    }
  }
  return paper;
}
