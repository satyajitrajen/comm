'use client';

import { parseMentions } from './mentions';

export function isTabularMessage(content: string): boolean {
  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length < 2) return false;
  const tabbedLines = lines.filter((line) => line.includes('\t'));
  return tabbedLines.length >= 2;
}

export function parseTabularMessage(content: string): string[][] {
  const lines = content.split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  return lines.map((row) => row.split('\t'));
}

type FormattedMessageContentProps = {
  content: string;
  className?: string;
  tableClassName?: string;
  tone?: 'default' | 'dm' | 'dm-own';
  /** Used to highlight a mention of the reader. */
  currentUserId?: string | null;
};

export function FormattedMessageContent({
  content,
  className = '',
  tableClassName = '',
  tone = 'default',
  currentUserId,
}: FormattedMessageContentProps) {
  if (!content) return null;

  if (isTabularMessage(content)) {
    const rows = parseTabularMessage(content);
    const colCount = Math.max(...rows.map((row) => row.length), 1);
    const borderClass =
      tone === 'dm-own' ? 'border-blue-400/60' : 'border-slate-200';
    const headerClass =
      tone === 'dm-own'
        ? `bg-blue-700/50 font-semibold text-white ${borderClass}`
        : `bg-slate-50 font-semibold text-slate-800 ${borderClass}`;
    const bodyClass = tone === 'dm-own' ? `text-white ${borderClass}` : `text-inherit ${borderClass}`;

    return (
      <div className={`overflow-x-auto max-w-full ${tableClassName}`}>
        <table className="min-w-full border-collapse text-sm">
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${rowIndex}:${row[0] ?? ''}`}>
                {Array.from({ length: colCount }, (_, colIndex) => {
                  const cell = row[colIndex] ?? '';
                  const isHeader = rowIndex === 0;
                  return (
                    <td
                      key={`${colIndex}:${cell}`}
                      className={`border px-2 py-1 align-top whitespace-pre-wrap ${
                        isHeader ? headerClass : bodyClass
                      }`}
                    >
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <p className={`whitespace-pre-wrap text-sm leading-6 ${className}`}>
      <MentionText content={content} currentUserId={currentUserId} tone={tone} />
    </p>
  );
}

/**
 * Renders `@[Name](userId)` markup as chips. A mention of the reader is given
 * a stronger treatment so it is findable when skimming a busy channel.
 */
function MentionText({
  content,
  currentUserId,
  tone,
}: {
  content: string;
  currentUserId?: string | null;
  tone?: string;
}) {
  const segments = parseMentions(content);
  if (segments.length === 1 && segments[0].type === 'text') {
    return <>{content}</>;
  }

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === 'text') return <span key={index}>{segment.value}</span>;

        const isSelf = !!currentUserId && segment.userId === currentUserId;
        const onOwnBubble = tone === 'dm-own';
        const chipClass = isSelf
          ? onOwnBubble
            ? 'bg-white/30 font-semibold text-white'
            : 'bg-amber-100 font-semibold text-amber-900'
          : onOwnBubble
            ? 'bg-white/15 font-medium text-blue-50'
            : 'bg-blue-50 font-medium text-blue-700';

        return (
          <span
            key={index}
            className={`rounded px-1 py-0.5 ${chipClass}`}
            title={segment.displayName}
          >
            @{segment.displayName}
          </span>
        );
      })}
    </>
  );
}
