import type { ReactNode } from "react";

/**
 * Minimal, dependency-free renderer for the small subset of markdown a
 * short operator-grade AI answer actually uses: **bold** and "- " bullet
 * lists. Deliberately not a full markdown parser — this is a chat panel in
 * an OT-adjacent console, not a document viewer.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-ink-primary">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

export function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listBuf: string[] = [];

  const flushList = (key: string) => {
    if (listBuf.length === 0) return;
    blocks.push(
      <ul key={key} className="ml-4 list-disc space-y-0.5">
        {listBuf.map((item, i) => (
          <li key={i}>{renderInline(item, `${key}-li-${i}`)}</li>
        ))}
      </ul>,
    );
    listBuf = [];
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listBuf.push(trimmed.slice(2));
      return;
    }
    flushList(`list-${idx}`);
    if (trimmed.length === 0) {
      blocks.push(<div key={`sp-${idx}`} className="h-1.5" />);
    } else {
      blocks.push(<p key={`p-${idx}`}>{renderInline(line, `p-${idx}`)}</p>);
    }
  });
  flushList("list-end");

  return <div className="space-y-1">{blocks}</div>;
}
