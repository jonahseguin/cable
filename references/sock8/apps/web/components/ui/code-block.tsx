import { createHighlighter } from 'shiki';
import { cn } from '@sock8/ui/lib/utils';
import type { BundledLanguage, BundledTheme, Highlighter, ThemeRegistration } from 'shiki';

const sock8DarkTheme: ThemeRegistration = {
  name: 'sock8-dark',
  type: 'dark',
  colors: {
    'editor.background': 'rgba(0, 0, 0, 0)',
    'editor.foreground': 'hsl(222, 18%, 90%)',
  },
  tokenColors: [
    {
      settings: {
        foreground: 'hsl(222, 18%, 90%)',
      },
    },
    {
      scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
      settings: {
        foreground: 'hsl(222, 10%, 70%)',
      },
    },
    {
      scope: [
        'constant',
        'entity.name.constant',
        'variable.other.constant',
        'variable.other.object',
        'variable.language',
      ],
      settings: {
        foreground: 'hsl(260, 80%, 75%)',
      },
    },
    {
      scope: [
        'entity.name',
        'entity.name.tag',
        'entity.name.function',
        'entity.name.class',
        'entity.name.type',
      ],
      settings: {
        foreground: 'hsl(210, 70%, 70%)',
      },
    },
    {
      scope: ['keyword', 'storage.type', 'storage.modifier'],
      settings: {
        foreground: 'hsl(325, 80%, 70%)',
      },
    },
    {
      scope: ['string', 'punctuation.definition.string', 'string punctuation.section.embedded'],
      settings: {
        foreground: 'hsl(15, 80%, 65%)',
      },
    },
    {
      scope: ['variable', 'punctuation', 'meta.brace'],
      settings: {
        foreground: 'hsl(222, 15%, 80%)',
      },
    },
    {
      scope: ['number', 'constant.numeric'],
      settings: {
        foreground: 'hsl(160, 70%, 60%)',
      },
    },
    {
      scope: ['support.type.property-name', 'entity.other.attribute-name'],
      settings: {
        foreground: 'hsl(210, 60%, 70%)',
      },
    },
  ],
};

// Create a singleton highlighter instance
let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', sock8DarkTheme],
      langs: ['typescript', 'javascript', 'jsx', 'tsx', 'json', 'css', 'html', 'bash', 'markdown'],
    });
  }
  return highlighterPromise;
}

interface CodeBlockProps {
  code: string;
  language: string;
  theme?: 'dark' | 'light';
  showLineNumbers?: boolean;
  highlightLines?: number[];
  className?: string;
}

// This remains a server component - no 'use client' directive
async function CodeBlock({
  code,
  language,
  theme = 'dark',
  showLineNumbers = false,
  highlightLines = [],
  className,
}: CodeBlockProps) {
  const highlighter = await getHighlighter();

  const html = highlighter.codeToHtml(code, {
    lang: language,
    theme: theme === 'dark' ? 'sock8-dark' : 'github-light',
  });

  // Modify HTML to add line numbers and highlights if needed
  const modifiedHtml =
    showLineNumbers || highlightLines.length > 0
      ? addLineNumbersAndHighlights(html, showLineNumbers, highlightLines)
      : html;

  return (
    <div
      className={cn('overflow-x-auto rounded-md font-mono text-sm', className)}
      dangerouslySetInnerHTML={{ __html: modifiedHtml }}
    />
  );
}

function addLineNumbersAndHighlights(
  html: string,
  showLineNumbers: boolean,
  highlightLines: number[],
): string {
  // Extract the code content
  const codeMatch = html.match(/<code>([\s\S]*?)<\/code>/);
  if (!codeMatch) return html;

  const code = codeMatch[1] || '';
  const lines = code.split('\n');

  let newHtml = '<code><table class="shiki-line-table" style="border-spacing: 0; width: 100%;">';

  lines.forEach((line, i) => {
    const lineNumber = i + 1;
    const isHighlighted = highlightLines.includes(lineNumber);

    newHtml += `
      <tr class="${isHighlighted ? 'bg-primary/10 dark:bg-primary/20' : ''}">
        ${showLineNumbers ? `<td class="text-xs text-muted-foreground text-right pr-4 select-none" style="width: 1px; padding-left: 1rem; user-select: none;">${lineNumber}</td>` : ''}
        <td class="w-full pr-4 pl-4">${line || ' '}</td>
      </tr>
    `;
  });

  newHtml += '</table></code>';

  return html.replace(/<code>[\s\S]*?<\/code>/, newHtml);
}

export { CodeBlock };
