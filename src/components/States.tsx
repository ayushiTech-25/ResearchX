import { AlertCircle, LoaderCircle, SearchX } from "lucide-react";

export function LoadingState({ label = "Loading research data..." }: { label?: string }) {
  return <div className="state-panel" role="status"><LoaderCircle className="state-spinner animate-spin" size={21} /><span>{label}</span></div>;
}

export function ErrorState({ title = "We couldn’t load this yet.", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return <div className="state-panel state-error" role="alert"><AlertCircle size={21} /><div><strong>{title}</strong><p>{message}</p>{onRetry && <button className="text-button" onClick={onRetry}>Try again</button>}</div></div>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="state-panel"><SearchX size={22} className="state-empty-icon" /><div><strong>{title}</strong><p>{detail}</p></div></div>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}
