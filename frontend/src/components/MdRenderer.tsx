import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Props {
  children: string;
}

export default function MdRenderer({ children }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table({ children }) {
          return (
            <div className="md-table-wrap">
              <table className="md-table">{children}</table>
            </div>
          );
        },
        thead({ children }) {
          return <thead className="md-thead">{children}</thead>;
        },
        tbody({ children }) {
          return <tbody className="md-tbody">{children}</tbody>;
        },
        tr({ children }) {
          return <tr className="md-tr">{children}</tr>;
        },
        th({ children }) {
          return <th className="md-th">{children}</th>;
        },
        td({ children }) {
          return <td className="md-td">{children}</td>;
        },
        code({ className, children: codeChildren, ...rest }) {
          const match = /language-(\w+)/.exec(className ?? '');
          const codeText = String(codeChildren).trim();
          if (match) {
            return (
              <SyntaxHighlighter
                language={match[1]}
                style={vscDarkPlus}
                PreTag="div"
                customStyle={{
                  margin: '6px 0',
                  borderRadius: '4px',
                  fontSize: '12px',
                  padding: '10px 12px',
                }}
                codeTagProps={{ style: { fontFamily: 'var(--font-mono)' } }}
              >
                {codeText}
              </SyntaxHighlighter>
            );
          }
          // Inline code
          return (
            <code className={className} {...rest}>
              {codeChildren}
            </code>
          );
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
