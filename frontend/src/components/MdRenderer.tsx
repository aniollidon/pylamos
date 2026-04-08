import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import hljs from 'highlight.js';
import remarkGfm from 'remark-gfm';
import 'highlight.js/styles/vs2015.css';

interface Props {
  children: string;
}

interface HighlightCodeBlockProps {
  code: string;
  language: string;
}

const highlightCache = new Map<string, string>();

function getLanguageAlias(language: string): string {
  const normalized = language.toLowerCase();
  const aliases: Record<string, string> = {
    py: 'python',
    js: 'javascript',
    ts: 'typescript',
    sh: 'bash',
    shell: 'bash',
    yml: 'yaml',
    md: 'markdown',
  };

  return aliases[normalized] ?? normalized;
}

function HighlightCodeBlock({ code, language }: HighlightCodeBlockProps) {
  const finalLanguage = useMemo(() => getLanguageAlias(language), [language]);
  const cacheKey = useMemo(() => `${finalLanguage}::${code}`, [code, finalLanguage]);

  const html = useMemo(() => {
    const cached = highlightCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const highlighted = hljs.highlight(code, { language: finalLanguage, ignoreIllegals: true }).value;
      highlightCache.set(cacheKey, highlighted);
      return highlighted;
    } catch (error) {
      console.warn(`[highlight.js] Failed to highlight ${finalLanguage}:`, error);
      // Fallback to unhighlighted
      return code;
    }
  }, [cacheKey, code, finalLanguage]);

  return (
    <pre
      style={{
        margin: '6px 0',
        borderRadius: '4px',
        fontSize: '12px',
        padding: '10px 12px',
        backgroundColor: 'transparent',
        border: 'none',
        overflow: 'auto',
      }}
    >
      <code
        className="hljs"
        style={{
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-primary)',
          backgroundColor: 'transparent',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </pre>
  );
}

function MdRenderer({ children }: Props) {
  const markdownComponents = useMemo(
    () => ({
      table({ children }: { children?: React.ReactNode }) {
        return (
          <div className="md-table-wrap">
            <table className="md-table">{children}</table>
          </div>
        );
      },
      thead({ children }: { children?: React.ReactNode }) {
        return <thead className="md-thead">{children}</thead>;
      },
      tbody({ children }: { children?: React.ReactNode }) {
        return <tbody className="md-tbody">{children}</tbody>;
      },
      tr({ children }: { children?: React.ReactNode }) {
        return <tr className="md-tr">{children}</tr>;
      },
      th({ children }: { children?: React.ReactNode }) {
        return <th className="md-th">{children}</th>;
      },
      td({ children }: { children?: React.ReactNode }) {
        return <td className="md-td">{children}</td>;
      },
      code({ className, children: codeChildren, ...rest }: { className?: string; children?: React.ReactNode }) {
        const match = /language-([A-Za-z0-9_-]+)/.exec(className ?? '');
        const codeText = String(codeChildren).trim();
        if (match) {
          return <HighlightCodeBlock code={codeText} language={match[1]} />;
        }
        // Inline code
        return (
          <code
            className={className}
            style={{
              fontFamily: 'var(--font-mono)',
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '3px',
              padding: '1px 4px',
            }}
            {...rest}
          >
            {codeChildren}
          </code>
        );
      },
    }),
    []
  );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}
    >
      {children}
    </ReactMarkdown>
  );
}

export default memo(MdRenderer);
