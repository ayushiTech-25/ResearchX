export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Paper {
  id: string;
  doi: string | null;
  title: string | null;
  authors: Array<{ id: string | null; name: string | null; institution: string | null; institutionId: string | null }>;
  year: number | null;
  publicationDate: string | null;
  abstract: string | null;
  venue: string | null;
  url: string | null;
  citations: number | null;
  source: string;
  topics: string[];
}

export interface Researcher {
  id: string;
  source?: string;
  sourceUrl?: string;
  name: string | null;
  works: number | null;
  citations: number | null;
  worksInResults?: number;
  citationsInResults?: number;
  institution: string | null;
  institutionId: string | null;
  topics: string[];
  orcid?: string | null;
}

export interface ResearcherProfile extends Researcher {
  externalLinks: { record: string; orcid: string | null };
  publications: { results: Paper[]; total: number | null; page: number; perPage: number };
  relatedResearchers: Array<{ researcher: Researcher; sharedPapers: number }>;
  relationEvidence: string;
}

export interface Trend {
  id: string;
  topic: string;
  papers: number | null;
  citations: number | null;
  description: string | null;
}

export interface PaperAnalysis {
  paperInformation: {
    problemStatement: string | null;
    researchObjective: string | null;
    methodology: string | null;
    algorithmsOrModels: string[];
    dataset: string | null;
    results: string | null;
    contributions: string[];
    limitations: string[];
    futureWork: string[];
    importantTerms: string[];
  };
  aiGenerated: {
    simpleSummary: string | null;
    interpretation: string | null;
    suggestions: string[];
  };
}
