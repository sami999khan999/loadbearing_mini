import { cn } from "../../class-name/index.js";
import { ReactMarkdown, rehypeSanitize, remarkGfm } from "../../import.js";

export interface MarkdownTextProps {
  // Untrusted text, such as a model's answer. Raw HTML in it is dropped, not rendered.
  readonly text: string;
  readonly className?: string;
}

const REMARK = [remarkGfm];
const REHYPE = [rehypeSanitize];

// Markdown rendered in the browser, for text that arrives a piece at a time. `Prose` is for
// HTML the server already sanitised; this parses, sanitises and renders on every change.
export function MarkdownText({ text, className }: MarkdownTextProps) {
  return (
    <div className={cn("ui-prose ui-markdown-text", className)}>
      <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}
