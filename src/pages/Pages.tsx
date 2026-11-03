import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowRight, ArrowUpRight, Bookmark, BookMarked, BookOpen, BrainCircuit, Check, ChevronRight, CircleHelp, Clipboard, ExternalLink, FileSearch, Filter, FlaskConical, FolderPlus, Lightbulb, LoaderCircle, LockKeyhole, MessageSquareText, Moon, Network, Plus, Search, Send, Settings, Sparkles, Sun, Trash2, UsersRound, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ApiError, api } from "../services/api";
import type { Paper, PaperAnalysis, Researcher } from "../types";
import { EmptyState, ErrorState, LoadingState, Skeleton } from "../components/States";
import { useToast } from "../components/Toast";

function PageHeading({ eyebrow, title, detail, action }: { eyebrow?: string; title: React.ReactNode; detail?: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{detail && <p className="page-description">{detail}</p>}</div>{action && <div className="heading-action">{action}</div>}</div>;
}

function isAIProviderConfigurationError(error: unknown) {
  return error instanceof ApiError && error.status === 503 && /AI provider is not configured/i.test(error.message);
}

function renderAssistantInline(text: string) {
  const parts: React.ReactNode[] = [];
  const markdown = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g;
  let cursor = 0;
  for (const match of text.matchAll(markdown)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(text.slice(cursor, index));
    const token = match[0];
    const content = token.slice(token.startsWith("**") || token.startsWith("__") || token.startsWith("`") ? 2 : 1, token.startsWith("**") || token.startsWith("__") || token.startsWith("`") ? -2 : -1);
    parts.push(token.startsWith("**") || token.startsWith("__") ? <strong key={index}>{content}</strong> : token.startsWith("`") ? <code key={index}>{content}</code> : <em key={index}>{content}</em>);
    cursor = index + token.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function renderAssistantMarkdown(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (heading) {
      const level = line.match(/^#+/)?.[0].length ?? 2;
      const content = renderAssistantInline(heading[1]);
      const key = `heading-${index}`;
      blocks.push(level === 1 ? <h3 key={key}>{content}</h3> : level === 2 ? <h4 key={key}>{content}</h4> : <h5 key={key}>{content}</h5>);
      index += 1;
      continue;
    }

    const isTable = (row: string) => row.includes("|");
    const isTableSeparator = (row: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(row);
    if (index + 1 < lines.length && isTable(line) && isTableSeparator(lines[index + 1])) {
      const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
      const headers = cells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && isTable(lines[index].trim()) && lines[index].trim()) {
        rows.push(cells(lines[index]));
        index += 1;
      }
      blocks.push(<div className="response-table-wrap" key={`table-${index}`} role="region" aria-label="Assistant response table" tabIndex={0}><table><thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex}>{renderAssistantInline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex}>{renderAssistantInline(row[cellIndex] ?? "")}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }

    const unordered = line.match(/^[-*+]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const items: string[] = [];
      while (index < lines.length) {
        const itemLine = lines[index].trim();
        const item = orderedList ? itemLine.match(/^\d+[.)]\s+(.+)$/) : itemLine.match(/^[-*+]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      const List = orderedList ? "ol" : "ul";
      blocks.push(<List key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderAssistantInline(item)}</li>)}</List>);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^#{1,6}\s+/.test(lines[index].trim()) && !/^[-*+]\s+/.test(lines[index].trim()) && !/^\d+[.)]\s+/.test(lines[index].trim()) && !(index + 1 < lines.length && isTable(lines[index].trim()) && isTableSeparator(lines[index + 1]))) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{renderAssistantInline(paragraph.join(" "))}</p>);
  }
  return blocks;
}

function isPaperIdentifier(value: string) {
  const normalized = value.trim();
  if (/^https?:\/\/(?:api\.)?openalex\.org\/(?:works\/)?W\d+$/i.test(normalized) || /^W\d+$/i.test(normalized)) return true;
  const doi = normalized.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:/i, "");
  return /^\S+\/\S+$/.test(doi);
}

function isResearcherIdentifier(value: string) {
  const normalized = value.trim().replace(/^https?:\/\/(?:api\.)?openalex\.org\/(?:authors\/)?/i, "").replace(/^authors\//i, "");
  return /^A\d+$/i.test(normalized) || /^crossref:[^/?#\s]+$/i.test(normalized);
}

export function PaperDetailsPage() {
  const { id = "" } = useParams();
  const paperId = id;
  const paperQuery = useQuery({ queryKey: ["research", "paper", paperId], queryFn: ({ signal }) => api.paper(paperId, signal), enabled: isPaperIdentifier(paperId) });
  const paper = paperQuery.data?.paper;
  return <div className="page-stack">
    <PageHeading eyebrow="PAPER DETAILS" title={paper?.title ?? "Paper details"} detail="Bibliographic record from OpenAlex or Crossref." action={<Link className="subtle-link" to="/papers"><ArrowRight size={14} /> Back to papers</Link>} />
    {paperQuery.isLoading ? <LoadingState label="Loading scholarly record..." /> : paperQuery.isError ? <ErrorState title="Unable to load this paper right now." message={paperQuery.error.message} onRetry={() => void paperQuery.refetch()} /> : paper ? <article className="surface-card paper-detail"><div className="paper-card-top"><span className="source-badge">{paper.source}</span><span className="paper-year">{paper.year ?? "Data unavailable"}</span></div><h2>{paper.title ?? "Data unavailable"}</h2><p className="paper-detail-authors">{formatAuthors(paper.authors)}</p><div className="paper-detail-stats"><span><Activity size={15} /> {formatCount(paper.citations)} citations</span><span><BookOpen size={15} /> {paper.publicationDate ?? paper.year ?? "Data unavailable"}</span><span>{paper.venue ?? "Venue not available"}</span>{paper.doi && <a href={`https://doi.org/${encodeURIComponent(paper.doi)}`} target="_blank" rel="noreferrer">DOI: {paper.doi} <ExternalLink size={12} /></a>}</div><div className="paper-detail-abstract"><h3>Abstract</h3><p>{paper.abstract ?? "Data unavailable"}</p></div><div className="paper-detail-actions"><Link to="/analyzer" state={{ title: paper.title, text: [paper.title, paper.abstract].filter(Boolean).join("\n\n") }} className="primary-button"><BrainCircuit size={15} /> Analyze with AI</Link>{paper.url && <a className="secondary-button" href={paper.url} target="_blank" rel="noreferrer">Open source <ExternalLink size={14} /></a>}</div>
      <ResearchActions externalId={paper.id} title={paper.title ?? "Data unavailable"} kind="paper" />
      <CitationFormats paper={paper} />
      <p className="provider-note"><CircleHelp size={14} /> Bibliographic metadata is supplied by {paper.source}. Review the original source before citing.</p></article> : <EmptyState title="Paper not found" detail="This identifier could not be resolved by the scholarly providers." />}
  </div>;
}

function MetricCard({ label, value, detail, icon: Icon, change }: { label: string; value: string; detail: string; icon: React.ElementType; change?: string }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17} /></span></div><div className="metric-value">{value}</div><div className="metric-foot"><span>{detail}</span>{change && <span className="metric-change"><ArrowUpRight size={13} /> {change}</span>}</div></div>;
}

function PaperCard({ paper }: { paper: Paper }) {
  return <article className="paper-card">
    <div className="paper-card-top"><span className="source-badge">{paper.source}</span><span className="paper-year">{paper.year ?? "Data unavailable"}</span></div>
    <Link className="paper-title" to={`/papers/${encodeURIComponent(paper.id)}`}>{paper.title ?? "Data unavailable"}</Link>
    {paper.venue && <p className="paper-venue">{paper.venue}</p>}
    <p className="paper-authors">{formatAuthors(paper.authors)}</p>
    <p className="paper-abstract">{paper.abstract ?? "Data unavailable"}</p>
    <div className="paper-card-footer"><span><Activity size={14} /> {formatCount(paper.citations)} citations</span>{paper.url ? <a href={paper.url} target="_blank" rel="noreferrer">View paper <ExternalLink size={13} /></a> : <span>Data unavailable</span>}</div>
    <ResearchActions externalId={paper.id} title={paper.title ?? "Data unavailable"} kind="paper" compact />
  </article>;
}

function ResearcherCard({ person }: { person: Researcher }) {
  const queryClient = useQueryClient();
  const notify = useToast();
  const save = useMutation({
    mutationFn: () => api.saveResearcher(person.id),
    onSuccess: () => {
      notify("Researcher saved to your Saved Research collection.");
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => notify(error.message, "error"),
  });
  const currentUser = useQuery({ queryKey: ["auth", "me"], queryFn: api.me, retry: false });
  const initials = (person.name ?? "?").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return <article className="researcher-card">
    <Link to={`/researchers/${encodeURIComponent(person.id.split("/").pop() ?? person.id)}`} className="researcher-card-link"><div className="researcher-card-head"><div className="researcher-avatar">{initials}</div><div><strong>{person.name ?? "Data unavailable"}</strong><span>{person.institution ?? (person.source === "Crossref" ? "Affiliation not provided by Crossref" : "Institution not provided")}</span></div><ChevronRight size={17} /></div>
    <div className="topic-pills">{person.topics.length ? person.topics.map((topic) => <span key={topic}>{topic}</span>) : person.source === "Crossref" ? <span>Crossref contributor</span> : <span>Research interests unavailable</span>}</div>
    <div className="researcher-stats"><span><BookOpen size={14} /> {person.source === "Crossref" ? `${person.worksInResults ?? 0} works in results` : `${formatCount(person.works)} works`}</span><span><Activity size={14} /> {person.source === "Crossref" ? `${(person.citationsInResults ?? 0).toLocaleString()} citations in results` : `${formatCount(person.citations)} citations`}</span></div></Link>
    <div className="researcher-card-actions">{currentUser.data?.user ? <button className="text-action" disabled={save.isPending || save.isSuccess} onClick={() => save.mutate()}><Bookmark size={14} /> {save.isSuccess ? "Saved" : "Save researcher"}</button> : <Link className="text-action" to="/login"><Bookmark size={14} /> Sign in to save</Link>}<ResearchActions externalId={person.id} title={person.name ?? "Data unavailable"} kind="researcher" workspaceOnly compact /></div>
    {save.isError && <p className="form-error" role="alert">{save.error.message}</p>}
  </article>;
}

function formatCount(value: number | null) {
  return value === null ? "Data unavailable" : value.toLocaleString();
}

function formatAuthors(authors: Paper["authors"]) {
  const names = authors.filter((author) => Boolean(author.name)).map((author) => `${author.name}${author.institution ? ` (${author.institution})` : ""}`);
  return names.length ? names.join(", ") : "Data unavailable";
}

function activityHref(activity: NonNullable<Awaited<ReturnType<typeof api.dashboard>>["recentActivity"]>[number]) {
  if (activity.targetType === "workspace" || activity.action === "workspace_created") return "/workspace";
  if (activity.targetType === "collection" || activity.action === "collection_created") return "/saved";
  if (!activity.externalId) return "/saved";
  return activity.targetType === "researcher"
    ? `/researchers/${encodeURIComponent(activity.externalId.split("/").pop() ?? activity.externalId)}`
    : `/papers/${encodeURIComponent(activity.externalId)}`;
}

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    paper_saved: "Saved a paper",
    paper_unsaved: "Removed a saved paper",
    researcher_saved: "Saved a researcher",
    paper_added_to_collection: "Added paper to collection",
    researcher_added_to_collection: "Added researcher to collection",
    paper_removed_from_collection: "Removed paper from collection",
    researcher_removed_from_collection: "Removed researcher from collection",
    collection_created: "Created a collection",
    workspace_created: "Created a workspace",
    paper_added_to_workspace: "Added paper to workspace",
    researcher_added_to_workspace: "Added researcher to workspace",
    paper_removed_from_workspace: "Removed paper from workspace",
    researcher_removed_from_workspace: "Removed researcher from workspace",
  };
  return labels[action] ?? "Updated research library";
}

function relativeActivityTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Time unavailable";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(value).toLocaleDateString();
}

function SavedResearchRow({ item, collectionId }: { item: { id: string; externalId: string; kind: string; title: string }; collectionId: string }) {
  const queryClient = useQueryClient();
  const notify = useToast();
  const remove = useMutation({
    mutationFn: () => api.removeCollectionItem(collectionId, item.id),
    onSuccess: () => {
      notify("Research removed from this collection.");
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => notify(error.message, "error"),
  });
  const href = item.kind === "paper"
    ? `/papers/${encodeURIComponent(item.externalId)}`
    : `/researchers/${encodeURIComponent(item.externalId.split("/").pop() ?? item.externalId)}`;
  return <div className="saved-research-row"><Link to={href}><BookOpen size={13} /><span>{item.title}</span><ArrowUpRight size={13} /></Link><button className="icon-button remove-research-button" aria-label={`Remove ${item.title} from collection`} title="Remove from collection" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <Trash2 size={13} />}</button></div>;
}

function WorkspaceResearchRow({ workspaceId, externalId, kind, title, detail, href }: { workspaceId: string; externalId: string; kind: "paper" | "researcher"; title: string; detail: string | number; href: string }) {
  const queryClient = useQueryClient();
  const notify = useToast();
  const remove = useMutation({
    mutationFn: () => api.removeWorkspaceItem(workspaceId, externalId, kind),
    onSuccess: () => {
      notify("Research removed from workspace.");
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => notify(error.message, "error"),
  });
  return <div className="saved-research-row"><Link to={href}>{kind === "paper" ? <BookOpen size={13} /> : <UsersRound size={13} />}<span>{title}</span><small>{detail}</small></Link><button className="icon-button remove-research-button" aria-label={`Remove ${title} from workspace`} title="Remove from workspace" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <Trash2 size={13} />}</button></div>;
}

function CitationFormats({ paper }: { paper: Paper }) {
  const [format, setFormat] = useState<"APA" | "IEEE" | "BibTeX">("APA");
  const notify = useToast();
  const authors = paper.authors.map((author) => author.name).filter((name): name is string => Boolean(name));
  const year = paper.year?.toString() ?? "n.d.";
  const citationKey = `${(authors[0]?.split(/\s+/).at(-1) ?? "record").replace(/[^\p{L}\p{N}]/gu, "")}${paper.year ?? "nd"}`.toLowerCase();
  const doiOrUrl = paper.doi ? `https://doi.org/${paper.doi}` : paper.url;
  const citation = format === "APA"
    ? [authors.length ? authors.join(", ") : null, `(${year}).`, paper.title ? `${paper.title}.` : null, doiOrUrl].filter(Boolean).join(" ")
    : format === "IEEE"
      ? [authors.length ? `${authors.join(", ")},` : null, paper.title ? `“${paper.title},”` : null, `${paper.year ?? "n.d."}.`, doiOrUrl ? paper.doi ? `doi: ${paper.doi}.` : `[Online]. Available: ${doiOrUrl}` : null].filter(Boolean).join(" ")
      : `@misc{${citationKey},${paper.title ? `\n  title = {${paper.title}},` : ""}${authors.length ? `\n  author = {${authors.join(" and ")}},` : ""}${paper.year ? `\n  year = {${paper.year}},` : ""}${paper.doi ? `\n  doi = {${paper.doi}},` : ""}${paper.url ? `\n  url = {${paper.url}},` : ""}\n  note = {Source: ${paper.source}}\n}`;
  return <section className="citation-panel"><div className="section-title-row"><div><h3>Citation</h3><p>Generated from available metadata. Missing fields are omitted or marked unavailable.</p></div><div className="citation-tabs">{(["APA", "IEEE", "BibTeX"] as const).map((item) => <button key={item} className={format === item ? "citation-tab-active" : ""} onClick={() => setFormat(item)}>{item}</button>)}</div></div><pre>{citation}</pre><button className="text-action" onClick={() => void navigator.clipboard.writeText(citation).then(() => notify(`${format} citation copied.`)).catch(() => notify("Clipboard access is unavailable in this browser.", "error"))}><Clipboard size={14} /> Copy {format}</button></section>;
}

function ResearchActions({ externalId, title, kind, compact = false, workspaceOnly = false }: { externalId: string; title: string; kind: "paper" | "researcher"; compact?: boolean; workspaceOnly?: boolean }) {
  const queryClient = useQueryClient();
  const user = useQuery({ queryKey: ["auth", "me"], queryFn: api.me, retry: false });
  const collections = useQuery({ queryKey: ["collections"], queryFn: api.collections, retry: false, enabled: Boolean(user.data?.user) && !workspaceOnly });
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: api.workspaces, retry: false, enabled: Boolean(user.data?.user) });
  const [collectionId, setCollectionId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const notify = useToast();
  useEffect(() => {
    if (!collectionId && collections.data?.collections[0]) setCollectionId(collections.data.collections[0].id);
    if (!workspaceId && workspaces.data?.workspaces[0]) setWorkspaceId(workspaces.data.workspaces[0].id);
  }, [collectionId, collections.data, workspaceId, workspaces.data]);
  useEffect(() => {
    if (!collectionDialogOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCollectionDialogOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [collectionDialogOpen]);
  const savedCollection = collections.data?.collections.find((collection) => collection.name === "Saved research" && collection.items.some((item) => item.externalId === externalId && item.kind === "paper"));
  const isSaved = kind === "paper" && Boolean(savedCollection);
  const toggleSaved = useMutation({
    mutationFn: (save: boolean) => save ? api.savePaper(externalId, title) : api.unsavePaper(externalId),
    onSuccess: (_result, save) => {
      notify(save ? "Paper saved to your research library." : "Paper removed from your saved research.");
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => notify(error.message, "error"),
  });
  const saveToCollection = useMutation({
    mutationFn: () => api.saveItem(collectionId, { externalId, kind, title }),
    onSuccess: () => {
      setCollectionDialogOpen(false);
      notify("Research added to your collection.");
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => notify(error.message, "error"),
  });
  const createCollection = useMutation({
    mutationFn: () => api.createCollection(newCollectionName.trim()),
    onSuccess: ({ collection }) => {
      setCollectionId(collection.id);
      setNewCollectionName("");
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      notify("Collection created. Add this research when you are ready.");
    },
    onError: (error: Error) => notify(error.message, "error"),
  });
  const add = useMutation({
    mutationFn: () => api.addToWorkspace(workspaceId, externalId, kind),
    onSuccess: () => {
      setWorkspacePickerOpen(false);
      notify("Added to your research workspace.");
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => notify(error.message, "error"),
  });
  if (user.isLoading) return <div className={`research-actions${compact ? " research-actions-compact" : ""}`}><LoadingState label="Checking account..." /></div>;
  if (user.isError) return <div className={`research-actions${compact ? " research-actions-compact" : ""}`}><span className="form-error" role="alert">{user.error.message}</span></div>;
  if (!user.data?.user) return <div className={`research-actions${compact ? " research-actions-compact" : ""}`}><Link className="text-action" to="/login"><Bookmark size={14} /> Sign in to save or add to workspace</Link></div>;
  return <div className={`research-actions${compact ? " research-actions-compact" : ""}`}>
    {!workspaceOnly && <>
      {kind === "paper" && <button className={`text-action${isSaved ? " saved-action" : ""}`} aria-label={isSaved ? "Remove paper from saved research" : "Save paper"} title={isSaved ? "Remove from saved research" : "Save paper"} disabled={toggleSaved.isPending} onClick={() => toggleSaved.mutate(!isSaved)}>{isSaved ? <BookMarked size={14} /> : <Bookmark size={14} />}{!compact && (toggleSaved.isPending ? "Saving…" : isSaved ? "Saved" : "Save paper")}</button>}
      <button className="text-action" aria-label="Add to collection" aria-expanded={collectionDialogOpen} onClick={() => setCollectionDialogOpen(true)}><FolderPlus size={14} />{!compact && "Add to collection"}</button>
    </>}
    {workspaces.isLoading ? <span className="data-unavailable">Loading workspaces…</span> : workspaces.isError ? <span className="form-error" role="alert">{workspaces.error.message}</span> : workspaces.data?.workspaces.length ? <button className="text-action" aria-label="Add to workspace" aria-expanded={workspacePickerOpen} onClick={() => setWorkspacePickerOpen((open) => !open)}><Plus size={14} />{!compact && "Add to workspace"}</button> : <Link className="text-action" to="/workspace"><Plus size={14} />{compact ? "" : "Create a workspace"}</Link>}
    {workspacePickerOpen && workspaces.data?.workspaces.length ? <div className="workspace-picker"><label htmlFor={`workspace-${kind}-${externalId}`}>Add to workspace</label><div><select id={`workspace-${kind}-${externalId}`} aria-label="Select research workspace" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>{workspaces.data.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><button className="primary-button" disabled={!workspaceId || add.isPending} onClick={() => add.mutate()}>{add.isPending ? "Adding…" : "Add"}</button></div></div> : null}
    {collectionDialogOpen && !workspaceOnly && <div className="research-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCollectionDialogOpen(false); }}>
      <section className="research-dialog" role="dialog" aria-modal="true" aria-labelledby="add-research-title">
        <div className="research-dialog-heading"><div><p className="eyebrow">PERSONAL LIBRARY</p><h2 id="add-research-title">Add to a collection</h2><p>{title}</p></div><button className="icon-button" aria-label="Close collection dialog" onClick={() => setCollectionDialogOpen(false)}><X size={17} /></button></div>
        {collections.isLoading ? <LoadingState label="Loading your collections..." /> : collections.isError ? <p className="form-error" role="alert">{collections.error.message}</p> : <>
          {collections.data?.collections.length ? <label className="dialog-field">Collection<select autoFocus aria-label="Select collection" value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>{collections.data.collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label> : <p className="dialog-hint">Create a collection to organize this research.</p>}
          <div className="research-dialog-actions">{collections.data?.collections.length ? <button className="primary-button" disabled={!collectionId || saveToCollection.isPending} onClick={() => saveToCollection.mutate()}>{saveToCollection.isPending ? "Adding…" : "Add research"}</button> : null}<button className="secondary-button" onClick={() => createCollection.isPending ? undefined : setCollectionDialogOpen(false)}>Cancel</button></div>
          <form className="dialog-create-collection" onSubmit={(event) => { event.preventDefault(); if (newCollectionName.trim()) createCollection.mutate(); }}><label className="dialog-field">New collection<input autoFocus={!collections.data?.collections.length} value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} maxLength={80} placeholder="e.g. Thesis literature review" /></label><button className="secondary-button" type="submit" disabled={!newCollectionName.trim() || createCollection.isPending}>{createCollection.isPending ? "Creating…" : "Create collection"}</button></form>
        </>}
      </section>
    </div>}
  </div>;
}

export function DashboardPage() {
  const overview = useQuery({ queryKey: ["dashboard"], queryFn: ({ signal }) => api.dashboard(signal), staleTime: 120_000 });
  const dashboard = overview.data;
  const topTopics = dashboard?.trends ?? [];
  const countValue = (value: number | null | undefined) => value === null || value === undefined ? "Data unavailable" : value.toLocaleString();
  return <div className="page-stack">
    <PageHeading eyebrow={new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase()} title={<>Welcome to your research space <span className="heading-wave">✳</span></>} detail="Your research workspace is ready. Where will your curiosity take you?" action={<Link className="primary-button" to="/papers"><Search size={16} /> Explore research</Link>} />
    {overview.isError ? <ErrorState title="Dashboard data is unavailable." message={overview.error.message} onRetry={() => void overview.refetch()} /> : <>
      <div className="metrics-grid">
        <MetricCard label={dashboard?.source === "Crossref" ? "Research concepts searched" : "Indexed research topics"} value={overview.isLoading ? "Loading…" : countValue(dashboard?.topicCount)} detail={dashboard?.source === "Crossref" ? "Live Crossref keyword searches · matched records shown below" : "OpenAlex topic index · ranked topics shown below"} icon={Activity} />
        <MetricCard label="AI-related papers" value={overview.isLoading ? "Loading…" : countValue(dashboard?.paperCount)} detail={`${dashboard?.paperSource ?? "Research provider"} matches for “artificial intelligence”`} icon={BookOpen} />
        <MetricCard label="AI-related researchers" value={overview.isLoading ? "Loading…" : countValue(dashboard?.researcherCount)} detail={dashboard?.researcherSource ? `${dashboard.researcherSource} matches for “artificial intelligence”` : "Researcher totals unavailable from providers"} icon={UsersRound} />
        <MetricCard label={dashboard?.authenticated ? "Your saved research" : "Personal library"} value={overview.isLoading ? "Loading…" : dashboard?.authenticated ? countValue(dashboard.savedCount) : "Sign in"} detail={dashboard?.authenticated ? `${countValue(dashboard.collectionCount)} collections · ${countValue(dashboard.workspaceCount)} workspaces` : "Sign in to save papers and organize projects"} icon={Bookmark} />
      </div>
      <div className="dashboard-grid">
        <section className="surface-card chart-card">
          <div className="section-title-row"><div><p className="eyebrow">THE BIG PICTURE</p><h2>Research landscape</h2><p>{dashboard?.source === "Crossref" ? "Crossref keyword matches · live search totals, not a global topic index" : "OpenAlex research topics, ranked by indexed works"}</p></div><Link to="/trends" className="subtle-link">Explore trends <ArrowRight size={14} /></Link></div>
          {overview.isLoading ? <div className="chart-loading"><Skeleton className="chart-skeleton" /></div> : topTopics.length === 0 ? <EmptyState title="No research trend data is available right now." detail="The research provider returned no topic information." /> :
            <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={topTopics} layout="vertical" margin={{ top: 5, right: 18, bottom: 0, left: 4 }}><CartesianGrid horizontal={false} stroke="var(--chart-grid)" /><XAxis type="number" hide /><YAxis type="category" dataKey="topic" axisLine={false} tickLine={false} width={132} tickFormatter={(value: string) => value.length > 19 ? `${value.slice(0, 18)}…` : value} tick={{ fill: "var(--chart-label)", fontSize: 11 }} /><Tooltip cursor={{ fill: "rgba(99,102,241,.06)" }} formatter={(value: number) => [value.toLocaleString(), "Works"]} contentStyle={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text-primary)" }} /><Bar dataKey="papers" fill="var(--chart-bar)" radius={[0, 5, 5, 0]} barSize={16} /></BarChart></ResponsiveContainer></div>}
        </section>
        <section className="insight-panel"><div className="insight-orb"><Sparkles size={20} /></div><p className="eyebrow">YOUR RESEARCH COPILOT</p><h2>From a question to a clearer direction.</h2><p>Explore a field, find the right papers, then use AI to synthesize what you’ve found.</p><Link to="/assistant" className="insight-link">Ask your research assistant <ArrowRight size={15} /></Link><div className="insight-foot"><span><Check size={14} /> AI-generated responses</span><span><Check size={14} /> Verify claims and citations</span></div></section>
      </div>
      <div className="dashboard-grid">
        <section className="section-block"><div className="section-title-row"><div><p className="eyebrow">A PLACE TO START</p><h2>Recent research</h2><p>Live {dashboard?.paperSource ?? "provider"} results for artificial intelligence</p></div><Link to="/papers" className="subtle-link">Browse all papers <ArrowRight size={14} /></Link></div>
          {overview.isLoading ? <div className="paper-grid">{[1, 2, 3].map((n) => <Skeleton className="paper-skeleton" key={n} />)}</div> : dashboard?.papers.length ? <div className="paper-grid">{dashboard.papers.map((paper) => <PaperCard key={paper.id} paper={paper} />)}</div> : <EmptyState title="No papers available" detail="The research provider returned no records for this query." />}
        </section>
        <section className="section-block"><div className="section-title-row"><div><p className="eyebrow">{dashboard?.authenticated ? "YOUR RESEARCH" : "PERSONAL WORKSPACE"}</p><h2>{dashboard?.authenticated ? "Recent activity" : "Make it yours"}</h2><p>{dashboard?.authenticated ? "Recent actions in your saved research and workspaces" : "Sign in to collect papers and organize projects"}</p></div>{dashboard?.authenticated && <Link to="/workspace" className="subtle-link">Workspaces <ArrowRight size={14} /></Link>}</div>
          {!dashboard?.authenticated ? <div className="dashboard-personal-card"><p>Saved papers, researchers, collections, and project workspaces stay linked to your account.</p><Link to="/login" className="primary-button">Sign in <ArrowRight size={14} /></Link></div> : <div className="dashboard-personal-card"><div className="dashboard-library-counts"><span><Bookmark size={13} /> {countValue(dashboard.savedCount)} saved items</span><span><FolderPlus size={13} /> {countValue(dashboard.collectionCount)} collections</span><span><Network size={13} /> {countValue(dashboard.workspaceCount)} workspaces</span></div>{dashboard.recentActivity.length ? dashboard.recentActivity.map((item) => <Link key={item.id} to={activityHref(item)} className="recent-activity-row"><Activity size={14} /><span>{item.targetName ?? activityLabel(item.action)}<small>{activityLabel(item.action)}{item.contextName ? ` · ${item.contextName}` : ""}</small></span><time dateTime={item.createdAt}>{relativeActivityTime(item.createdAt)}</time><ArrowUpRight size={13} /></Link>) : <p>No activity yet. Save a paper or create a collection or workspace to get started.</p>}</div>}
        </section>
      </div>
      <p className="provider-note"><CircleHelp size={14} /> Public figures are live provider totals, not ResearchX database totals. Research landscape: {dashboard?.source ?? "Data unavailable"}; papers: {dashboard?.paperSource ?? "Data unavailable"}; researcher totals: {dashboard?.researcherSource ?? "Data unavailable"}. Retrieved {dashboard ? new Date(dashboard.retrievedAt).toLocaleString() : "Data unavailable"}.</p>
    </>}
  </div>;
}

export function LandingPage() {
  const trends = useQuery({ queryKey: ["research", "trends"], queryFn: ({ signal }) => api.trends(signal) });
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [dark, setDark] = useState(() => localStorage.getItem("researchos-theme") === "dark");
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  return <div className="landing-shell">
    <header className="landing-nav">
      <Link to="/" className="landing-brand"><span className="brand-mark"><BrainCircuit size={20} /></span><span className="brand-name">Research<span>OS</span></span></Link>
      <nav aria-label="Landing page navigation"><Link to="/papers">Explore papers</Link><Link to="/researchers">Researchers</Link><Link to="/trends">Research trends</Link></nav>
      <div className="landing-nav-actions"><button className="icon-button" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={() => { const next = !dark; setDark(next); localStorage.setItem("researchos-theme", next ? "dark" : "light"); }}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button><Link to="/login" className="landing-signin">Sign in</Link><Link to="/register" className="primary-button">Get started <ArrowRight size={15} /></Link></div>
    </header>
    <main>
      <section className="landing-hero">
        <div className="landing-hero-copy"><div className="landing-eyebrow"><span /> AI RESEARCH INTELLIGENCE</div><h1>Find the signal<br />in <span>research.</span></h1><p>Discover the people, papers, and ideas moving science forward. One considered workspace, built for curious minds.</p>
          <form className="landing-search" onSubmit={(event) => { event.preventDefault(); if (topic.trim().length >= 2) navigate(`/papers?q=${encodeURIComponent(topic.trim())}`); }}><Search size={18} /><input aria-label="Search research" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Search papers, topics, or ideas..." /><button type="submit" aria-label="Search"><ArrowRight size={17} /></button></form>
          <div className="landing-actions"><Link to="/dashboard" className="primary-button">Explore your workspace <ArrowRight size={15} /></Link><span>Free to explore · Scholarly sources</span></div>
        </div>
        <div className="landing-visual"><div className="orbit orbit-outer" /><div className="orbit orbit-middle" /><div className="orbit orbit-inner" /><div className="landing-visual-core"><BrainCircuit size={35} /></div><div className="orbit-node node-paper"><BookOpen size={16} /></div><div className="orbit-node node-author"><UsersRound size={16} /></div><div className="orbit-node node-topic"><Network size={16} /></div><div className="visual-caption"><span /> CONNECTING IDEAS</div></div>
      </section>
      <section className="landing-trends">
        <div className="landing-trends-heading"><div><p className="eyebrow">A LIVING VIEW OF SCIENCE</p><h2>Research moves. Stay close to it.</h2></div><Link to="/trends" className="subtle-link">Explore the landscape <ArrowRight size={14} /></Link></div>
        {trends.isLoading ? <div className="landing-trend-grid">{[1, 2, 3].map((item) => <Skeleton key={item} className="landing-trend-skeleton" />)}</div> : trends.isError ? <ErrorState message={trends.error.message} onRetry={() => void trends.refetch()} /> : trends.data?.results.length ? <div className="landing-trend-grid">{trends.data.results.slice(0, 3).map((trend, index) => <Link to={`/papers?q=${encodeURIComponent(trend.topic)}`} className="landing-trend-card" key={trend.id}><span className="trend-rank">{String(index + 1).padStart(2, "0")}</span><div><strong>{trend.topic}</strong><span>{formatCount(trend.papers)} indexed works · OpenAlex</span></div><ArrowUpRight size={16} /></Link>)}</div> : <EmptyState title="No research trends are available right now." detail="Live topic data is supplied by OpenAlex." />}
      </section>
      <section className="landing-feature-strip" id="platform"><div><Search size={18} /><strong>Discover</strong><span>Search scholarly work and researcher profiles from live academic indexes.</span></div><div><BrainCircuit size={18} /><strong>Understand</strong><span>Analyze paper abstracts and think through questions with an AI assistant.</span></div><div><Network size={18} /><strong>Connect</strong><span>Explore emerging fields and build personal collections that stay yours.</span></div></section>
    </main>
    <footer className="landing-footer"><Link to="/" className="landing-brand"><span className="brand-mark"><BrainCircuit size={17} /></span><span className="brand-name">Research<span>OS</span></span></Link><span>Research intelligence for a world of questions.</span><span>Scholarly metadata via OpenAlex & Crossref</span></footer>
  </div>;
}

export function ExplorerPage({ kind }: { kind: "papers" | "researchers" }) {
  const isPapers = kind === "papers";
  const location = useLocation();
  const initialQuery = new URLSearchParams(location.search).get("q")?.trim() ?? "";
  const [input, setInput] = useState(initialQuery);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [topic, setTopic] = useState("");
  const [institution, setInstitution] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const normalizedAuthor = author.trim().toLowerCase() === "leave empty" ? "" : author.trim();
  const [page, setPage] = useState(1);
  const [submitted, setSubmitted] = useState(initialQuery.length >= 2);
  const [appliedFilters, setAppliedFilters] = useState({ query: initialQuery, title: "", author: "", topic: "", institution: "", yearFrom: "", yearTo: "" });
  useEffect(() => {
    const nextQuery = new URLSearchParams(location.search).get("q")?.trim() ?? "";
    setInput(nextQuery);
    setTitle("");
    setAuthor("");
    setTopic("");
    setInstitution("");
    setYearFrom("");
    setYearTo("");
    setAppliedFilters({ query: nextQuery, title: "", author: "", topic: "", institution: "", yearFrom: "", yearTo: "" });
    setSubmitted(nextQuery.length >= 2);
    setPage(1);
  }, [location.search]);
  const paperFilters = {
    q: appliedFilters.query || undefined,
    title: appliedFilters.title || undefined,
    author: appliedFilters.author || undefined,
    topic: appliedFilters.topic || undefined,
    yearFrom: appliedFilters.yearFrom || undefined,
    yearTo: appliedFilters.yearTo || undefined,
    page,
    perPage: 10,
  };
  const researcherFilters = {
    q: appliedFilters.query || undefined,
    topic: appliedFilters.topic || undefined,
    institution: appliedFilters.institution || undefined,
    page,
    perPage: 10,
  };
  const papers = useQuery({ queryKey: ["research", "papers", paperFilters], queryFn: ({ signal }) => api.papers(paperFilters, signal), enabled: isPapers && submitted });
  const researchers = useQuery({ queryKey: ["research", "researchers", researcherFilters], queryFn: ({ signal }) => api.researchers(researcherFilters, signal), enabled: !isPapers && submitted });
  const results = isPapers ? papers.data?.results : researchers.data?.results;
  const total = isPapers ? papers.data?.total : researchers.data?.total;
  const currentPage = isPapers ? papers.data?.page : researchers.data?.page;
  const perPage = isPapers ? papers.data?.perPage : researchers.data?.perPage;
  const error = isPapers ? papers.error : researchers.error;
  const loading = isPapers ? papers.isFetching : researchers.isFetching;
  const parsedFromYear = yearFrom === "" ? null : Number(yearFrom);
  const parsedToYear = yearTo === "" ? null : Number(yearTo);
  const invalidFromYear = parsedFromYear !== null && (!Number.isInteger(parsedFromYear) || parsedFromYear < 1500 || parsedFromYear > 2100);
  const invalidToYear = parsedToYear !== null && (!Number.isInteger(parsedToYear) || parsedToYear < 1500 || parsedToYear > 2100);
  const yearError = isPapers
    ? invalidFromYear || invalidToYear
      ? "Enter whole publication years between 1500 and 2100."
      : parsedFromYear !== null && parsedToYear !== null && parsedFromYear > parsedToYear
        ? "Starting year must not be after ending year."
        : ""
    : "";
  const runSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const clean = input.trim();
    const hasFilter = isPapers ? Boolean(clean || title.trim() || normalizedAuthor || topic.trim()) : Boolean(clean || topic.trim() || institution.trim());
    if (hasFilter && !yearError) {
      setSubmitted(true);
      setAppliedFilters({
        query: clean,
        title: title.trim(),
        author: normalizedAuthor,
        topic: topic.trim(),
        institution: institution.trim(),
        yearFrom: yearFrom.trim(),
        yearTo: yearTo.trim(),
      });
      setPage(1);
    }
  };
  const pageCount = total !== null && total !== undefined && perPage ? Math.max(1, Math.ceil(total / perPage)) : null;
  const hasSearchFilter = isPapers
    ? Boolean(input.trim() || title.trim() || normalizedAuthor || topic.trim())
    : Boolean(input.trim() || topic.trim() || institution.trim());
  return <div className="page-stack">
    <PageHeading eyebrow={isPapers ? "THE LITERATURE" : "THE PEOPLE BEHIND THE RESEARCH"} title={isPapers ? "Discover papers" : "Researcher explorer"} detail={isPapers ? "Search and filter scholarly works from live OpenAlex data, with Crossref fallback." : researchers.data?.source === "Crossref" ? "OpenAlex is temporarily unavailable. Crossref fallback lists author names from matching works; counts are unavailable, field and institution terms are broad text matches, and same-name profiles may be ambiguous." : "Find researchers by name, field, and institution using OpenAlex, with Crossref fallback when OpenAlex is unavailable."} />
    <form className="explorer-form" onSubmit={runSearch} noValidate>
      <div className="explorer-search"><Search size={19} /><input aria-label={isPapers ? "Search papers" : "Search researchers"} value={input} onChange={(event) => setInput(event.target.value)} placeholder={isPapers ? "Search papers, authors, topics..." : "Search researcher names..."} /><button className="primary-button" type="submit" disabled={!hasSearchFilter || Boolean(yearError)}>Search <ArrowRight size={15} /></button></div>
      <div className={`filter-row${isPapers ? "" : " researcher-filters"}`}>{isPapers ? <><input aria-label="Title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title (optional)" /><input aria-label="Author" value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Author (optional)" /><input aria-label="Research topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Research topic (optional)" /><input aria-label="From year" type="number" min="1500" max="2100" step="1" value={yearFrom} onChange={(event) => setYearFrom(event.target.value)} placeholder="From year" aria-invalid={Boolean(yearError)} /><input aria-label="To year" type="number" min="1500" max="2100" step="1" value={yearTo} onChange={(event) => setYearTo(event.target.value)} placeholder="To year" aria-invalid={Boolean(yearError)} /></> : <><input aria-label="Research field" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Research field" /><input aria-label="Institution" value={institution} onChange={(event) => setInstitution(event.target.value)} placeholder="Institution" /></>}</div>
      {yearError && <p className="form-error" role="alert">{yearError}</p>}
    </form>
    <div className="results-toolbar"><span>{submitted ? `Results${appliedFilters.query ? ` for “${appliedFilters.query}”` : ""}` : "Search the scholarly record"}</span>{results && <span className="result-count">{total === null || total === undefined ? "Total count unavailable" : `${total.toLocaleString()} total results`} <span>·</span> Page {currentPage} <span>·</span> <Filter size={13} /> {isPapers ? (papers.data as { source?: string } | undefined)?.source ?? "OpenAlex" : researchers.data?.source ?? "OpenAlex"}</span>}</div>
    {!submitted ? <div className="explorer-welcome"><div className="welcome-icon">{isPapers ? <BookOpen size={23} /> : <UsersRound size={23} />}</div><h2>Start with a question or a name.</h2><p>{isPapers ? "Search peer-reviewed research, preprints, and scholarly works from live academic indexes." : "Discover scholars by name and topic. Open a profile to explore their work and scholarly footprint."}</p><div className="suggestion-row">{(isPapers ? ["large language models", "graph neural networks", "AI for healthcare"] : ["machine learning", "computer vision", "climate research"]).map((suggestion) => <button key={suggestion} onClick={() => { setInput(suggestion); setAppliedFilters({ query: suggestion, title: "", author: "", topic: "", institution: "", yearFrom: "", yearTo: "" }); setSubmitted(true); setPage(1); }}>{suggestion} <ArrowUpRight size={13} /></button>)}</div></div> :
      loading ? <LoadingState label={isPapers ? "Searching scholarly indexes..." : "Searching researchers..."} /> : error ? <ErrorState title={isPapers ? "Unable to load papers right now." : "Unable to load researchers right now."} message={error.message} onRetry={() => isPapers ? void papers.refetch() : void researchers.refetch()} /> :
      !results?.length ? isPapers
        ? <EmptyState title="No results found" detail="Try different keywords, a broader topic, or a researcher’s full name." />
        : <div className="explorer-welcome"><EmptyState title="No researchers found" detail={appliedFilters.query ? `“${appliedFilters.query}” may be a research topic or question rather than a person’s name. Search papers for this phrase instead, or try a researcher’s full name.` : "Try a researcher’s full name or broaden your research-field and institution filters."} />{appliedFilters.query && <Link className="primary-button" to={`/papers?q=${encodeURIComponent(appliedFilters.query)}`}><BookOpen size={15} /> Search papers for “{appliedFilters.query}” <ArrowRight size={14} /></Link>}</div> :
      <><div className={isPapers ? "paper-grid" : "researcher-grid"}>{isPapers ? (results as Paper[]).map((paper) => <PaperCard key={paper.id} paper={paper} />) : (results as Researcher[]).map((person) => <ResearcherCard key={person.id} person={person} />)}</div><div className="pagination-row"><span>{currentPage && perPage ? `Page ${currentPage}${pageCount ? ` of ${pageCount}` : ""}` : "Page information unavailable"}</span><div><button className="secondary-button" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button className="secondary-button" disabled={loading || (pageCount !== null ? page >= pageCount : isPapers ? (results?.length ?? 0) < 10 : !researchers.data?.hasMore)} onClick={() => setPage((value) => value + 1)}>Next</button></div></div></>}
  </div>;
}

export function TrendsPage() {
  const [selectedTopic, setSelectedTopic] = useState("");
  const trends = useQuery({ queryKey: ["research", "trends"], queryFn: ({ signal }) => api.trends(signal) });
  const years = useQuery({ queryKey: ["research", "publication-years", selectedTopic], queryFn: ({ signal }) => api.publicationYears(selectedTopic || undefined, signal), staleTime: 300_000 });
  const visibleTrends = trends.data?.results.filter((trend) => !selectedTopic || trend.topic === selectedTopic) ?? [];
  return <div className="page-stack"><PageHeading eyebrow="FIELD INTELLIGENCE" title="Research trends" detail={trends.data?.source === "Crossref" ? "Live Crossref keyword matches and publication-year facets. These are search totals, not a global subject index." : "Explore broad fields and concepts using live OpenAlex scholarly metadata."} action={<span className="live-badge"><span /> {trends.data?.source ? `LIVE · ${trends.data.source.toUpperCase()}` : "LIVE DATA"}</span>} />
    {trends.isLoading ? <LoadingState label="Loading live research trends..." /> : trends.isError ? <ErrorState title="Unable to load research trends right now." message={trends.error.message} onRetry={() => void trends.refetch()} /> : !trends.data?.results.length ? <EmptyState title="No research trend data is available right now." detail="The research provider returned no concepts." /> :
      <><div className="surface-card trend-chart-card"><div className="section-title-row"><div><h2>Research activity by concept</h2><p>{trends.data.source === "Crossref" ? `Crossref works matching each search phrase · ${trends.data.results.length} live concepts` : `Works indexed across major OpenAlex topics · ${trends.data.total?.toLocaleString() ?? "Data unavailable"} topics indexed`}</p></div><label className="trend-topic-filter">Filter topic<select aria-label="Filter research trends by topic" value={selectedTopic} onChange={(event) => setSelectedTopic(event.target.value)}><option value="">All topics</option>{trends.data.results.map((trend) => <option value={trend.topic} key={trend.id}>{trend.topic}</option>)}</select></label></div>{visibleTrends.length ? <div className="trend-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={visibleTrends.slice(0, 10)} margin={{ top: 8, right: 20, bottom: 56, left: 12 }}><CartesianGrid vertical={false} stroke="var(--chart-grid)" /><XAxis dataKey="topic" axisLine={false} tickLine={false} angle={-30} textAnchor="end" interval={0} height={80} tickFormatter={(value: string) => value.length > 19 ? `${value.slice(0, 18)}…` : value} tick={{ fill: "var(--chart-label)", fontSize: 10 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--chart-label)", fontSize: 10 }} /><Tooltip contentStyle={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text-primary)" }} /><Bar dataKey="papers" name={trends.data.source === "Crossref" ? "Matching works" : "Works"} fill="var(--chart-bar)" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyState title="No research trend data is available right now." detail="No topic matched this filter." />}</div>
      <div className="surface-card trend-chart-card"><div className="section-title-row"><div><h2>Publications by year</h2><p>{years.data?.source === "Crossref" ? `Crossref publications matching “${selectedTopic || "artificial intelligence"}”` : selectedTopic ? `OpenAlex records for ${selectedTopic}` : "Actual OpenAlex works grouped by publication year, from 2000 onward"}</p></div></div>{years.isLoading ? <LoadingState label="Loading yearly publication counts..." /> : years.isError ? <ErrorState title="Unable to load yearly publication counts." message={years.error.message} onRetry={() => void years.refetch()} /> : !years.data?.results.length ? <EmptyState title="No yearly publication data is available." detail="The publication provider returned no grouped data." /> : <div className="year-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={years.data.results} margin={{ top: 10, right: 18, bottom: 3, left: 8 }}><CartesianGrid vertical={false} stroke="var(--chart-grid)" /><XAxis dataKey="year" axisLine={false} tickLine={false} minTickGap={25} tick={{ fill: "var(--chart-label)", fontSize: 10 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--chart-label)", fontSize: 10 }} /><Tooltip contentStyle={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text-primary)" }} /><Bar dataKey="papers" name={years.data.source === "Crossref" ? "Matching works" : "Works"} fill="var(--chart-bar)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>}</div>
      <div className="trend-list">{visibleTrends.map((item, index) => <div className="trend-row" key={item.id}><span className="trend-rank">{String(index + 1).padStart(2, "0")}</span><div className="trend-name"><strong>{item.topic}</strong><span>{trends.data.source === "Crossref" ? "Crossref keyword query · not an indexed subject classification" : `OpenAlex topic · ${item.description ? "Description available" : "Description not supplied"}`}</span></div><div className="trend-number"><strong>{formatCount(item.papers)}</strong><span>{trends.data.source === "Crossref" ? "matching works" : "works"}</span></div><div className="trend-number"><strong>{formatCount(item.citations)}</strong><span>citations</span></div><Link to={`/papers?q=${encodeURIComponent(item.topic)}`} aria-label={`Explore papers about ${item.topic}`}><ArrowUpRight size={16} /></Link></div>)}</div></>}
  </div>;
}

export function AssistantPage() {
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [providerNotConfigured, setProviderNotConfigured] = useState(false);
  const currentUser = useQuery({ queryKey: ["auth", "me"], queryFn: api.me, retry: false });
  const suggestions = ["Help me refine a research question", "How should I compare two methods?", "Suggest a literature review structure"];
  const mutation = useMutation({ mutationFn: (prompt: string) => api.assistant(prompt), onSuccess: (data) => { setAnswer(data.answer); setError(""); setProviderNotConfigured(false); }, onError: (issue: Error) => { setError(issue.message); setProviderNotConfigured(isAIProviderConfigurationError(issue)); } });
  function submit(event: React.FormEvent) { event.preventDefault(); const prompt = message.trim(); if (!prompt || mutation.isPending) return; setAnswer(""); setError(""); setProviderNotConfigured(false); mutation.mutate(prompt); setMessage(""); }
  return <div className="page-stack assistant-page"><PageHeading eyebrow="THINK WITH YOUR RESEARCH COPILOT" title="AI research assistant" detail="Explore ideas, sharpen questions, and reason about methods. AI responses require server-side provider configuration and should be independently verified." />
    <div className="assistant-banner"><div className="assistant-banner-icon"><Sparkles size={20} /></div><div><strong>Evidence-minded by design</strong><p>Ask for reasoning and exploration, not fabricated citations. Always verify claims against the original literature.</p></div></div>
    <div className="chat-workspace"><div className="chat-welcome"><div className="assistant-emblem"><BrainCircuit size={28} /></div><h2>What are you working on?</h2><p>Start with an open question. Your research assistant can help you think through it.</p><div className="prompt-suggestions">{suggestions.map((item) => <button key={item} onClick={() => setMessage(item)}><Lightbulb size={15} /> {item} <ArrowUpRight size={14} /></button>)}</div></div>
      {(mutation.isPending || answer || error) && <div className="assistant-response">{mutation.isPending ? <LoadingState label="Thinking through your question..." /> : error ? <ErrorState title={providerNotConfigured ? "AI provider is not configured" : undefined} message={error} /> : <><div className="response-label"><Sparkles size={15} /> RESEARCHOS ASSISTANT</div><div className="response-copy">{renderAssistantMarkdown(answer)}</div><p className="response-disclaimer">AI-generated response. Independently verify important claims and sources.</p></>}</div>}
      {currentUser.isLoading ? <LoadingState label="Checking your sign-in..." /> : currentUser.data?.user ? <form className="chat-composer" onSubmit={submit}><textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={2} maxLength={4000} aria-label="Ask your research question" placeholder="Ask a research question... (Enter to send, Shift + Enter for a new line)" /><div className="composer-bottom"><span><span className="composer-dot" /> Responses require server-side AI configuration</span><button type="submit" className="send-button" aria-label="Send message" disabled={!message.trim() || mutation.isPending}>{mutation.isPending ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}</button></div></form> : <div className="sign-in-prompt"><div className="settings-icon"><LockKeyhole size={19} /></div><div><strong>Sign in to use your AI research assistant</strong><p>Your research conversations are available to your account.</p></div><Link to="/login" className="primary-button">Sign in <ArrowRight size={14} /></Link></div>}
    </div>
  </div>;
}

export function UtilityPage({ type }: { type: "analyzer" | "network" | "settings" | "notFound" }) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const notify = useToast();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [networkQuery, setNetworkQuery] = useState("");
  const [submittedNetworkQuery, setSubmittedNetworkQuery] = useState("");
  const [selectedResearcherId, setSelectedResearcherId] = useState("");
  const [analysis, setAnalysis] = useState<PaperAnalysis | null>(null);
  const [error, setError] = useState("");
  const [analysisConfigurationError, setAnalysisConfigurationError] = useState(false);
  const researchers = useQuery({ queryKey: ["research", "network", submittedNetworkQuery], queryFn: ({ signal }) => api.researchers({ q: submittedNetworkQuery }, signal), enabled: type === "network" && submittedNetworkQuery.length >= 2 });
  const networkProfile = useQuery({ queryKey: ["research", "researcher", selectedResearcherId, "network"], queryFn: ({ signal }) => api.researcher(selectedResearcherId, 1, signal), enabled: type === "network" && Boolean(selectedResearcherId) });
  const currentUser = useQuery({ queryKey: ["auth", "me"], queryFn: api.me, retry: false });
  const mutation = useMutation({
    mutationFn: () => api.analyzePaper(title, text),
    onSuccess: (data) => { setAnalysis(data.analysis); setError(""); setAnalysisConfigurationError(false); notify("Paper analysis saved to your account."); void queryClient.invalidateQueries({ queryKey: ["dashboard"] }); },
    onError: (issue: Error) => { setError(issue.message); setAnalysisConfigurationError(isAIProviderConfigurationError(issue)); setAnalysis(null); },
  });
  useEffect(() => {
    const state = location.state as { text?: string; title?: string | null } | null;
    if (type === "analyzer" && state?.text) setText(state.text);
    if (type === "analyzer" && state?.title) setTitle(state.title);
  }, [location.state, type]);
  if (type === "settings") return <div className="page-stack"><PageHeading eyebrow="YOUR ACCOUNT" title="Settings" detail="Manage your account and research workspace preferences." /><div className="settings-card"><div className="settings-icon"><Settings size={19} /></div><div><strong>Appearance</strong><p>Switch between light and dark mode using the moon/sun control in the top bar.</p></div></div><div className="settings-card"><div className="settings-icon"><LockKeyhole size={19} /></div><div><strong>Account security</strong><p>Passwords are hashed before storage. Your sign-in session is protected in an HTTP-only cookie.</p></div></div><div className="settings-card"><div className="settings-icon"><Sparkles size={19} /></div><div><strong>AI provider</strong><p>AI features use Gemini through the server. Configure GEMINI_API_KEY in the server’s private environment; credentials are never sent to the browser.</p></div></div></div>;
  if (type === "notFound") return <div className="page-stack"><PageHeading eyebrow="404 — NOT FOUND" title="This page wandered off." detail="The page may have moved or the link may be incorrect." action={<Link to="/dashboard" className="primary-button">Back to dashboard <ArrowRight size={15} /></Link>} /></div>;
  if (type === "analyzer") return <div className="page-stack">
    <PageHeading eyebrow="READ LESS. UNDERSTAND MORE." title="AI paper analyzer" detail="Analyze only the title and paper text you supply. Unsupported details stay unavailable." />
    <div className="analyzer-grid">
      <div className="surface-card analyzer-input">
        <div className="section-title-row">
          <div><h2><FileSearch size={18} /> Paper text</h2><p>Paste an abstract or paper excerpt</p></div>
          <span className="source-badge">{currentUser.isLoading ? "CHECKING ACCOUNT" : currentUser.isError ? "ACCOUNT STATUS UNAVAILABLE" : currentUser.data?.user ? "PRIVATE TO ACCOUNT" : "SIGN IN TO SAVE"}</span>
        </div>
        <input className="analysis-title-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={500} placeholder="Paper title (optional)" aria-label="Paper title" />
        <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={12000} placeholder={"Paste the abstract or paper excerpt here...\n\nOnly this supplied text is sent to the configured AI provider and analyzed."} aria-label="Abstract or paper excerpt" aria-invalid={Boolean(text.trim() && text.trim().length < 80)} aria-describedby="analysis-character-count analysis-validation" />
        <div className="analyzer-footer">
          <span id="analysis-character-count" aria-live="polite">{text.length.toLocaleString()} / 12,000 characters</span>
          <button className="primary-button" disabled={text.trim().length < 80 || mutation.isPending || !currentUser.data?.user} onClick={() => { setAnalysis(null); setError(""); setAnalysisConfigurationError(false); mutation.mutate(); }}>
            {mutation.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />} Analyze supplied text
          </button>
        </div>
        <p id="analysis-validation" className="analysis-validation" role={text.trim() && text.trim().length < 80 ? "alert" : undefined}>
          {text.trim() && text.trim().length < 80 ? "Please provide enough paper text to analyze. Enter at least 80 characters." : " "}
        </p>
        {!currentUser.isLoading && !currentUser.data?.user && (
          <div className="analysis-notice" role={currentUser.isError ? "alert" : undefined}>
            {currentUser.isError
              ? <>{currentUser.error.message} <button className="text-button" onClick={() => void currentUser.refetch()}>Try again</button>.</>
              : <>Sign in to analyze and save a private analysis. <Link to="/login">Sign in</Link></>}
          </div>
        )}
      </div>
      <div className="surface-card analyzer-result">
        <div className="section-title-row"><div><h2><FlaskConical size={18} /> Analysis</h2><p>Extracted facts are separated from AI-generated reasoning</p></div></div>
        {mutation.isPending
          ? <div className="analysis-loading" role="status" aria-label="Analyzing supplied paper text">
              <p className="analysis-loading-label">Analyzing only the supplied text...</p>
              {[1, 2, 3].map((item) => <div className="analysis-loading-card" key={item}><Skeleton /><Skeleton /></div>)}
            </div>
          : error ? <ErrorState title={analysisConfigurationError ? "AI provider is not configured" : undefined} message={error} />
            : analysis ? <div className="analysis-sections">
              <section><h3>Extracted facts from supplied paper text</h3><p className="analysis-section-note">Only details explicitly present in the text you supplied are included. Missing details are unavailable.</p>{Object.entries({ "Problem statement": analysis.paperInformation.problemStatement, "Research objective": analysis.paperInformation.researchObjective, Methodology: analysis.paperInformation.methodology, "Algorithms / models": analysis.paperInformation.algorithmsOrModels, Dataset: analysis.paperInformation.dataset, Results: analysis.paperInformation.results, Contributions: analysis.paperInformation.contributions, "Future work": analysis.paperInformation.futureWork, "Important terms": analysis.paperInformation.importantTerms }).map(([label, value]) => <div className="analysis-field" key={label}><strong>{label}</strong><p>{Array.isArray(value) ? value.length ? value.join(", ") : "Data unavailable in supplied text" : value ?? "Data unavailable in supplied text"}</p></div>)}</section>
              <section><h3>Limitations stated in supplied paper text</h3><p className="analysis-section-note">These are extracted only when the provided excerpt explicitly states them.</p><div className="analysis-field"><p>{analysis.paperInformation.limitations.length ? analysis.paperInformation.limitations.join(", ") : "Data unavailable in supplied text"}</p></div></section>
              <section><h3>AI-generated interpretation</h3><p className="analysis-section-note">These are AI interpretations of the provided excerpt, not statements verified against the full paper.</p><div className="analysis-field"><strong>Simple summary</strong><p>{analysis.aiGenerated.simpleSummary ?? "Data unavailable"}</p></div><div className="analysis-field"><strong>Interpretation</strong><p>{analysis.aiGenerated.interpretation ?? "Data unavailable"}</p></div></section>
              <section><h3>AI-generated suggestions</h3><p className="analysis-section-note">Ideas to verify against the full paper and related literature.</p>{analysis.aiGenerated.suggestions.length ? analysis.aiGenerated.suggestions.map((item, index) => <p className="analysis-suggestion" key={`${index}-${item}`}>{item}</p>) : <p className="analysis-section-note">No suggestions returned.</p>}</section>
              <p className="response-disclaimer">The AI saw only the title and text entered above; it did not access a full paper or external sources. Analysis ID: {mutation.data?.analysisId ?? "Data unavailable"}.</p>
            </div>
              : <div className="analysis-empty"><div><MessageSquareText size={23} /></div><strong>Your analysis will appear here</strong><p>Enter at least 80 characters from a paper to analyze explicit content, interpretations, and suggestions separately.</p></div>}
      </div>
    </div>
  </div>;
  return <div className="page-stack"><PageHeading eyebrow="COLLABORATION MAP" title="Research network" detail="Connections below are only researchers listed together as authors on OpenAlex publication records." />
    <form className="explorer-search" onSubmit={(event) => { event.preventDefault(); if (networkQuery.trim().length >= 2) { setSubmittedNetworkQuery(networkQuery.trim()); setSelectedResearcherId(""); } }}><Search size={19} /><input value={networkQuery} onChange={(event) => setNetworkQuery(event.target.value)} placeholder="Search for a researcher by name..." aria-label="Search researcher for co-author network" /><button className="primary-button" type="submit" disabled={networkQuery.trim().length < 2}>Find researcher <ArrowRight size={15} /></button></form>
    {!submittedNetworkQuery ? <div className="network-empty"><div className="network-visual"><span /><span /><span /><Network size={30} /></div><h2>Start with a researcher.</h2><p>We show connections only when people appear together in actual publication author lists—not from shared topics or institutions.</p><div className="suggestion-row">{["Yoshua Bengio", "Fei-Fei Li", "Geoffrey Hinton"].map((term) => <button key={term} onClick={() => { setNetworkQuery(term); setSubmittedNetworkQuery(term); }}>{term} <ArrowUpRight size={13} /></button>)}</div></div> : researchers.isLoading ? <LoadingState label="Finding researchers..." /> : researchers.isError ? <ErrorState message={researchers.error.message} onRetry={() => void researchers.refetch()} /> : !researchers.data?.results.length ? <EmptyState title="No researcher records found" detail="Try another full name or a broader search." /> : <><p className="network-result-label"><UsersRound size={15} /> Choose a researcher in “{submittedNetworkQuery}”; candidates are not treated as collaborators.</p><div className="researcher-grid">    {researchers.data.results.map((person) => <div className="network-candidate" key={person.id}><ResearcherCard person={person} /><button className="text-action" onClick={() => setSelectedResearcherId(person.id)}><Network size={14} /> View verified co-authors</button></div>)}</div>{selectedResearcherId && <section className="surface-card network-results"><div className="section-title-row"><div><p className="eyebrow">PUBLICATION EVIDENCE</p><h2>Co-authors of {networkProfile.data?.researcher.name ?? "selected researcher"}</h2><p>{networkProfile.data?.researcher.relationEvidence ?? "Loading publications and authorship evidence."}</p></div></div>{networkProfile.isLoading ? <LoadingState label="Loading co-authorship evidence..." /> : networkProfile.isError ? <ErrorState message={networkProfile.error.message} onRetry={() => void networkProfile.refetch()} /> : networkProfile.data?.researcher.relatedResearchers.length ? <div className="researcher-grid">{networkProfile.data.researcher.relatedResearchers.map(({ researcher, sharedPapers }) => <div key={researcher.id}><ResearcherCard person={researcher} /><p className="relation-evidence">Listed as co-author on {sharedPapers} publication{sharedPapers === 1 ? "" : "s"} in this fetched set.</p></div>)}</div> : <EmptyState title="No co-authors in retrieved publications" detail="OpenAlex returned no matching co-author records for the selected publication page." />}</section>}</>}
  </div>;
}

export function ResearcherPage() {
  const { id = "" } = useParams();
  const [page, setPage] = useState(1);
  const researcherQuery = useQuery({ queryKey: ["research", "researcher", id, page], queryFn: ({ signal }) => api.researcher(id, page, signal), enabled: isResearcherIdentifier(id) });
  const person = researcherQuery.data?.researcher;
  const currentUser = useQuery({ queryKey: ["auth", "me"], queryFn: api.me, retry: false });
  const queryClient = useQueryClient();
  const notify = useToast();
  const saveResearcher = useMutation({
    mutationFn: () => api.saveResearcher(person!.id),
    onSuccess: () => {
      notify("Researcher saved to your Saved Research collection.");
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => notify(error.message, "error"),
  });
  return <div className="page-stack"><PageHeading eyebrow="RESEARCHER PROFILE" title={person?.name ?? "Researcher profile"} detail={person?.source === "Crossref" ? "Author-name match from Crossref works. Crossref may not distinguish researchers with the same name; unavailable metrics remain blank." : "Researcher record and metrics are supplied by OpenAlex."} />
    {researcherQuery.isLoading ? <LoadingState label="Loading researcher profile and publications..." /> : researcherQuery.isError ? <ErrorState message={researcherQuery.error.message} onRetry={() => void researcherQuery.refetch()} /> : person ? <><div className="profile-hero"><div className="profile-avatar">{(person.name ?? "?").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div><div><h2>{person.name ?? "Data unavailable"}</h2><p>{person.institution ?? (person.source === "Crossref" ? "Affiliation not provided by Crossref" : "Institution not provided")}</p><a href={person.sourceUrl ?? person.externalLinks.record} target="_blank" rel="noreferrer">Open {person.source ?? "researcher"} record <ExternalLink size={14} /></a>{person.externalLinks.orcid && <a href={person.externalLinks.orcid.startsWith("http") ? person.externalLinks.orcid : `https://orcid.org/${person.externalLinks.orcid}`} target="_blank" rel="noreferrer">ORCID <ExternalLink size={14} /></a>}</div>{currentUser.data?.user ? <button className="secondary-button profile-save" disabled={saveResearcher.isPending || saveResearcher.isSuccess} onClick={() => saveResearcher.mutate()}><Bookmark size={15} /> {saveResearcher.isSuccess ? "Saved Researcher" : "Save Researcher"}</button> : <Link className="secondary-button profile-save" to="/login"><Bookmark size={15} /> Sign in to save</Link>}</div><div className="metrics-grid profile-metrics"><MetricCard label={person.source === "Crossref" ? "Works retrieved" : "Works"} value={person.source === "Crossref" ? formatCount(person.worksInResults ?? null) : formatCount(person.works)} detail={person.source === "Crossref" ? "matching Crossref records on this page" : "indexed publications"} icon={BookOpen} /><MetricCard label={person.source === "Crossref" ? "Citations retrieved" : "Citations"} value={person.source === "Crossref" ? formatCount(person.citationsInResults ?? null) : formatCount(person.citations)} detail={person.source === "Crossref" ? "citations on retrieved records only" : "across indexed works"} icon={Activity} /><MetricCard label="Research areas" value={person.topics.length ? person.topics.length.toString() : "Not provided"} detail={person.source === "Crossref" ? "Crossref does not supply author topics" : "concepts associated"} icon={Network} /><MetricCard label="Source" value={person.source ?? "Data unavailable"} detail="scholarly metadata" icon={UsersRound} /></div><div className="surface-card profile-topics"><h2>Research interests</h2><div className="topic-pills">{person.topics.length ? person.topics.map((topic) => <Link key={topic} to={`/papers?q=${encodeURIComponent(topic)}`}>{topic}</Link>) : <span>{person.source === "Crossref" ? "Crossref does not provide author-level research interests." : "Research interests not provided by this source."}</span>}</div></div>
      <section className="section-block"><div className="section-title-row"><div><p className="eyebrow">PUBLISHED WORK</p><h2>Publications</h2><p>{person.publications.total?.toLocaleString() ?? "Data unavailable"} {person.source ?? "Research provider"} records · most recent first</p></div></div>{person.publications.results.length ? <div className="paper-grid">{person.publications.results.map((paper) => <PaperCard key={paper.id} paper={paper} />)}</div> : <EmptyState title="No publications returned" detail="The source returned no works for this researcher record." />}<div className="pagination-row"><span>Page {person.publications.page}{person.publications.total ? ` of ${Math.max(1, Math.ceil(person.publications.total / person.publications.perPage))}` : ""}</span><div><button className="secondary-button" disabled={page <= 1 || researcherQuery.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button className="secondary-button" disabled={researcherQuery.isFetching || person.publications.results.length < person.publications.perPage || (person.publications.total !== null && page * person.publications.perPage >= person.publications.total)} onClick={() => setPage((value) => value + 1)}>Next</button></div></div></section>
      <section className="section-block"><div className="section-title-row"><div><p className="eyebrow">VERIFIED AUTHORSHIP</p><h2>Related researchers</h2><p>{person.relationEvidence}</p></div></div>{person.relatedResearchers.length ? <div className="researcher-grid">{person.relatedResearchers.map(({ researcher, sharedPapers }) => <div key={researcher.id}><ResearcherCard person={researcher} /><p className="relation-evidence">Co-authored {sharedPapers} paper{sharedPapers === 1 ? "" : "s"} on the fetched publication page.</p></div>)}</div> : <EmptyState title="No co-authors in the returned records" detail="No relationships are inferred from shared topics or institutions." />}</section></> : <div className="surface-card profile-not-found"><UsersRound size={24} /><h2>Researcher record not found</h2><p>We could not resolve this public OpenAlex researcher identifier.</p><Link className="subtle-link" to="/researchers">Search researcher explorer <ArrowRight size={14} /></Link></div>}
  </div>;
}

export function SavedPage() {
  const [name, setName] = useState("");
  const [formError, setFormError] = useState("");
  const collectionNameInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const notify = useToast();
  const currentUser = useQuery({ queryKey: ["auth", "me"], queryFn: api.me, retry: false });
  const collections = useQuery({ queryKey: ["collections"], queryFn: api.collections, retry: false, enabled: Boolean(currentUser.data?.user) });
  const create = useMutation({ mutationFn: () => api.createCollection(name.trim()), onSuccess: async ({ created }) => { setName(""); setFormError(""); notify(created ? "Research collection created." : "You already have a collection with that name."); await Promise.all([queryClient.invalidateQueries({ queryKey: ["collections"] }), queryClient.invalidateQueries({ queryKey: ["dashboard"] })]); }, onError: (error: Error) => setFormError(error.message) });
  const submitCollection = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setFormError("Enter a collection name before creating it.");
      collectionNameInput.current?.focus();
      return;
    }
    setFormError("");
    create.mutate();
  };
  return <div className="page-stack"><PageHeading eyebrow="YOUR PERSONAL LIBRARY" title="Saved research" detail="Build curated collections of the papers and ideas you want to return to." action={<span className="private-badge"><Bookmark size={14} /> PRIVATE TO YOU</span>} />
    {currentUser.data?.user && <form className="create-collection" onSubmit={submitCollection}><div className="create-collection-copy"><div className="collection-add-icon"><Plus size={19} /></div><div><strong>Create a collection</strong><p>Organize literature around a question or project.</p></div></div><div className="create-collection-controls"><input ref={collectionNameInput} value={name} onChange={(event) => { setName(event.target.value); if (formError) setFormError(""); }} maxLength={80} placeholder="e.g. Thesis literature review" aria-label="New collection name" aria-describedby={formError ? "collection-form-error" : undefined} aria-invalid={Boolean(formError)} /><button className="primary-button" type="submit" disabled={create.isPending}>{create.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />} Create</button></div>{formError && <p id="collection-form-error" className="form-error collection-error" role="alert">{formError}</p>}</form>}
    {currentUser.isLoading ? <LoadingState label="Loading your account..." /> : currentUser.isError ? <ErrorState title="Unable to check your account." message={currentUser.error.message} onRetry={() => void currentUser.refetch()} /> : !currentUser.data?.user ? <div className="sign-in-prompt"><div className="settings-icon"><BookOpen size={19} /></div><div><strong>Sign in to see your saved research</strong><p>Your personal collections are securely linked to your account.</p></div><Link to="/login" className="primary-button">Sign in <ArrowRight size={14} /></Link></div> : collections.isLoading ? <LoadingState label="Loading your collections..." /> : collections.isError ? <ErrorState message={collections.error.message} onRetry={() => void collections.refetch()} /> : !collections.data?.collections.length ? <div className="library-empty"><div className="library-illustration"><BookMarked size={27} /></div><h2>Your research library starts here.</h2><p>Create your first collection, then add research as you explore the literature.</p><Link to="/papers" className="subtle-link">Explore papers <ArrowRight size={14} /></Link></div> : <div className="collection-grid">{collections.data.collections.map((collection) => <div className="collection-card" key={collection.id}><div className="collection-card-icon"><BookMarked size={19} /></div><h3>{collection.name}</h3><p>{collection.description || "A personal research collection"}</p><div className="collection-card-footer"><span>{collection._count.items} saved items</span><span>Created {new Date(collection.createdAt).toLocaleDateString()}</span></div><div className="saved-item-list">{collection.items.length ? collection.items.map((item) => <SavedResearchRow key={item.id} item={item} collectionId={collection.id} />) : <p className="saved-collection-empty">No items in this collection yet.</p>}</div></div>)}</div>}
  </div>;
}

export function WorkspacesPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState("");
  const queryClient = useQueryClient();
  const notify = useToast();
  const currentUser = useQuery({ queryKey: ["auth", "me"], queryFn: api.me, retry: false });
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: api.workspaces, retry: false, enabled: Boolean(currentUser.data?.user) });
  const create = useMutation({
    mutationFn: () => api.createWorkspace(name.trim(), description.trim() || undefined),
    onSuccess: ({ created }) => { setName(""); setDescription(""); setFormError(""); notify(created ? "Research workspace created." : "You already have a workspace with that name."); void queryClient.invalidateQueries({ queryKey: ["workspaces"] }); void queryClient.invalidateQueries({ queryKey: ["dashboard"] }); },
    onError: (error: Error) => setFormError(error.message),
  });
  return <div className="page-stack"><PageHeading eyebrow="PROJECT ORGANIZATION" title="Research workspaces" detail="Organize actual papers and researcher records around projects, courses, or questions." />
    {currentUser.isLoading ? <LoadingState label="Checking your account..." /> : currentUser.isError ? <ErrorState title="Unable to check your account." message={currentUser.error.message} onRetry={() => void currentUser.refetch()} /> : !currentUser.data?.user ? <div className="sign-in-prompt"><div className="settings-icon"><Network size={19} /></div><div><strong>Sign in to create research workspaces</strong><p>Workspaces and their research records are private to your account.</p></div><Link to="/login" className="primary-button">Sign in <ArrowRight size={14} /></Link></div> : <><form className="workspace-create-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) create.mutate(); }}><div className="create-collection-copy"><div className="collection-add-icon"><Plus size={19} /></div><div><strong>Create a research workspace</strong><p>Add papers and researchers from their live profile cards.</p></div></div><div className="workspace-create-fields"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Workspace name" aria-label="Workspace name" required /><input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="Description (optional)" aria-label="Workspace description" /><button className="primary-button" type="submit" disabled={!name.trim() || create.isPending}>{create.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />} Create</button></div>{formError && <p className="form-error collection-error" role="alert">{formError}</p>}</form>
      {workspaces.isLoading ? <LoadingState label="Loading workspaces..." /> : workspaces.isError ? <ErrorState message={workspaces.error.message} onRetry={() => void workspaces.refetch()} /> : !workspaces.data?.workspaces.length ? <div className="library-empty"><div className="library-illustration"><Network size={27} /></div><h2>No workspaces yet.</h2><p>Create a workspace, then add papers or researchers directly from explorer results.</p></div> : <div className="workspace-grid">{workspaces.data.workspaces.map((workspace) => <article className="workspace-card" key={workspace.id}><div className="workspace-card-heading"><div className="collection-card-icon"><Network size={19} /></div><div><h2>{workspace.name}</h2><p>{workspace.description ?? "No description"}</p></div></div><div className="workspace-count-row"><span>{workspace._count.papers} papers</span><span>{workspace._count.researchers} researchers</span><span>{workspace._count.collections} collections</span></div>{workspace.papers.length || workspace.researchers.length ? <div className="saved-item-list">{workspace.papers.map(({ paper }) => <WorkspaceResearchRow key={paper.id} workspaceId={workspace.id} externalId={paper.externalId} kind="paper" title={paper.title ?? "Data unavailable"} detail={paper.publicationYear ?? "Year unavailable"} href={`/papers/${encodeURIComponent(paper.externalId)}`} />)}{workspace.researchers.map(({ researcher }) => <WorkspaceResearchRow key={researcher.id} workspaceId={workspace.id} externalId={researcher.externalId} kind="researcher" title={researcher.displayName ?? "Data unavailable"} detail={researcher.institutionName ?? "Institution unavailable"} href={`/researchers/${encodeURIComponent(researcher.externalId.split("/").pop() ?? researcher.externalId)}`} />)}</div> : <p className="workspace-empty-items">No research added yet. Add papers or researchers from the explorer pages.</p>}<div className="collection-card-footer"><span>Updated {new Date(workspace.updatedAt).toLocaleDateString()}</span><Link to="/papers" className="subtle-link">Find research <ArrowRight size={13} /></Link></div></article>)}</div>}
    </>}
  </div>;
}

export function ProfilePage() {
  const user = useQuery({ queryKey: ["auth", "me"], queryFn: api.me, retry: false });
  return <div className="page-stack"><PageHeading eyebrow="YOUR ACCOUNT" title="Your profile" detail="Your researcher identity and connected workspace." />{user.isLoading ? <LoadingState label="Loading account..." /> : user.isError ? <ErrorState title="Unable to load your account." message={user.error.message} onRetry={() => void user.refetch()} /> : user.data?.user ? <div className="profile-account-card"><div className="profile-avatar">{user.data.user.name[0]?.toUpperCase()}</div><div><h2>{user.data.user.name}</h2><p>{user.data.user.email}</p><span>ResearchX member</span></div></div> : <div className="sign-in-prompt"><div className="settings-icon"><UsersRound size={19} /></div><div><strong>Sign in to view your profile</strong><p>Your account details will appear here.</p></div><Link to="/login" className="primary-button">Sign in <ArrowRight size={14} /></Link></div>}</div>;
}
