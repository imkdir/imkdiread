import type { ReactNode } from "react";

export type AssistantMessageBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[]; start: number | null }
  | { type: "heading"; level: number; text: string }
  | { type: "blockquote"; lines: string[] }
  | { type: "code"; language: string | null; code: string };

export interface AssistantMessageSections {
  contentBlocks: AssistantMessageBlock[];
  translatorNoteBlocks: AssistantMessageBlock[] | null;
}

function parseAssistantMessageBlocks(content: string): AssistantMessageBlock[] {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: AssistantMessageBlock[] = [];
  let paragraphLines: string[] = [];
  let listBlock: Extract<AssistantMessageBlock, { type: "list" }> | null = null;
  let blockquoteLines: string[] = [];
  let codeBlock: { language: string | null; lines: string[] } | null = null;

  const flushParagraph = () => {
    if (!paragraphLines.length) {
      return;
    }

    blocks.push({
      type: "paragraph",
      text: paragraphLines.map((line) => line.trim()).join(" "),
    });
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listBlock) {
      return;
    }

    blocks.push(listBlock);
    listBlock = null;
  };

  const flushBlockquote = () => {
    if (!blockquoteLines.length) {
      return;
    }

    blocks.push({
      type: "blockquote",
      lines: blockquoteLines,
    });
    blockquoteLines = [];
  };

  const flushCodeBlock = () => {
    if (!codeBlock) {
      return;
    }

    blocks.push({
      type: "code",
      language: codeBlock.language,
      code: codeBlock.lines.join("\n"),
    });
    codeBlock = null;
  };

  for (const rawLine of lines) {
    const trimmedLine = rawLine.trim();

    if (codeBlock) {
      if (/^```/.test(trimmedLine)) {
        flushCodeBlock();
      } else {
        codeBlock.lines.push(rawLine);
      }
      continue;
    }

    const codeFenceMatch = trimmedLine.match(/^```([a-zA-Z0-9_-]+)?\s*$/);
    if (codeFenceMatch) {
      flushParagraph();
      flushList();
      flushBlockquote();
      codeBlock = {
        language: codeFenceMatch[1] || null,
        lines: [],
      };
      continue;
    }

    if (!trimmedLine) {
      flushParagraph();
      flushList();
      flushBlockquote();
      continue;
    }

    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushBlockquote();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    const blockquoteMatch = rawLine.match(/^\s*>\s?(.*)$/);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      blockquoteLines.push(blockquoteMatch[1]);
      continue;
    }

    flushBlockquote();

    const unorderedMatch = trimmedLine.match(/^[-*+]\s+(.+)$/);
    const orderedMatch = trimmedLine.match(/^(\d+)\.\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      const ordered = Boolean(orderedMatch);
      const itemText = (orderedMatch?.[2] || unorderedMatch?.[1] || "").trim();
      const orderedStart = orderedMatch
        ? Number.parseInt(orderedMatch[1], 10) || 1
        : null;

      if (
        !listBlock ||
        listBlock.type !== "list" ||
        listBlock.ordered !== ordered
      ) {
        flushList();
        listBlock = {
          type: "list",
          ordered,
          items: [],
          start: ordered ? orderedStart : null,
        };
      }

      listBlock.items.push(itemText);
      continue;
    }

    flushList();
    paragraphLines.push(rawLine);
  }

  flushParagraph();
  flushList();
  flushBlockquote();
  flushCodeBlock();

  return blocks.length
    ? blocks
    : [{ type: "paragraph", text: String(content || "").trim() }];
}

function stripLeadingSectionLabel(content: string, label: string) {
  const labelPattern = new RegExp(`^\\s*${label}\\s*:?\\s*(?:\\n+)?`, "i");

  return String(content || "").replace(labelPattern, "").trim();
}

function splitAssistantMessageAtSeparator(content: string) {
  const normalizedContent = String(content || "").replace(/\r\n/g, "\n").trim();
  if (!normalizedContent) {
    return null;
  }

  const blockSeparatorMatch = normalizedContent.match(
    /(?:^|\n)\s*---+\s*(?:\n|$)/,
  );
  if (blockSeparatorMatch && typeof blockSeparatorMatch.index === "number") {
    const separatorStart = blockSeparatorMatch.index;
    const separatorEnd = separatorStart + blockSeparatorMatch[0].length;

    return {
      primaryContent: normalizedContent.slice(0, separatorStart).trim(),
      secondaryContent: normalizedContent.slice(separatorEnd).trim(),
    };
  }

  const inlineSeparatorIndex = normalizedContent.indexOf("---");
  if (inlineSeparatorIndex >= 0) {
    return {
      primaryContent: normalizedContent.slice(0, inlineSeparatorIndex).trim(),
      secondaryContent: normalizedContent.slice(inlineSeparatorIndex + 3).trim(),
    };
  }

  return null;
}

export function parseAssistantMessageSections(
  content: string,
): AssistantMessageSections {
  const normalizedContent = String(content || "").replace(/\r\n/g, "\n").trim();
  if (!normalizedContent) {
    return {
      contentBlocks: [],
      translatorNoteBlocks: null,
    };
  }

  const translatorNoteMatch = normalizedContent.match(
    /(?:^|\n{2,})(?:translator(?:'|’)s?\s+note|translator\s+note)\s*:?\s*(?:\n+)?/i,
  );

  let primaryContent = normalizedContent;
  let translatorNoteContent: string | null = null;

  const separatorSplit = splitAssistantMessageAtSeparator(normalizedContent);
  if (separatorSplit && separatorSplit.secondaryContent) {
    primaryContent = separatorSplit.primaryContent;
    translatorNoteContent = separatorSplit.secondaryContent;
  } else if (
    translatorNoteMatch &&
    typeof translatorNoteMatch.index === "number"
  ) {
    primaryContent = normalizedContent.slice(0, translatorNoteMatch.index).trim();
    translatorNoteContent = normalizedContent
      .slice(translatorNoteMatch.index + translatorNoteMatch[0].length)
      .trim();
  }

  const cleanedPrimaryContent = stripLeadingSectionLabel(
    primaryContent,
    "translation",
  );
  const cleanedTranslatorNoteContent = translatorNoteContent
    ? stripLeadingSectionLabel(
        stripLeadingSectionLabel(
          translatorNoteContent,
          "translator(?:'|’)s?\\s+note",
        ),
        "note",
      )
    : "";

  return {
    contentBlocks: parseAssistantMessageBlocks(
      cleanedPrimaryContent || primaryContent || normalizedContent,
    ),
    translatorNoteBlocks: cleanedTranslatorNoteContent
      ? parseAssistantMessageBlocks(cleanedTranslatorNoteContent)
      : null,
  };
}

const INLINE_FORMAT_DELIMITERS = ["***", "___", "**", "__", "*", "_"] as const;

type InlineFormatType = "text" | "strong" | "emphasis" | "strong-emphasis";

interface InlineFormatSegment {
  type: InlineFormatType;
  content: string;
}

interface PlainInlineMarkdownSegment {
  type: "text" | "code" | "link";
  content: string;
  href?: string;
}

function resolveInlineFormatType(
  delimiter: (typeof INLINE_FORMAT_DELIMITERS)[number],
): InlineFormatType {
  if (delimiter === "***" || delimiter === "___") {
    return "strong-emphasis";
  }

  if (delimiter === "**" || delimiter === "__") {
    return "strong";
  }

  return "emphasis";
}

function findNextInlineDelimiter(text: string, startIndex: number) {
  let nextMatch: {
    delimiter: (typeof INLINE_FORMAT_DELIMITERS)[number];
    index: number;
  } | null = null;

  for (const delimiter of INLINE_FORMAT_DELIMITERS) {
    const index = text.indexOf(delimiter, startIndex);
    if (index < 0 || text[index - 1] === "\\") {
      continue;
    }

    if (
      !nextMatch ||
      index < nextMatch.index ||
      (index === nextMatch.index && delimiter.length > nextMatch.delimiter.length)
    ) {
      nextMatch = { delimiter, index };
    }
  }

  return nextMatch;
}

function findClosingInlineDelimiter(
  text: string,
  delimiter: (typeof INLINE_FORMAT_DELIMITERS)[number],
  startIndex: number,
) {
  let searchIndex = startIndex;

  while (searchIndex < text.length) {
    const matchIndex = text.indexOf(delimiter, searchIndex);
    if (matchIndex < 0) {
      return -1;
    }

    if (text[matchIndex - 1] !== "\\") {
      return matchIndex;
    }

    searchIndex = matchIndex + delimiter.length;
  }

  return -1;
}

function parseAssistantInlineSegments(text: string): InlineFormatSegment[] {
  const segments: InlineFormatSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const nextDelimiter = findNextInlineDelimiter(text, cursor);
    if (!nextDelimiter) {
      segments.push({ type: "text", content: text.slice(cursor) });
      break;
    }

    if (nextDelimiter.index > cursor) {
      segments.push({
        type: "text",
        content: text.slice(cursor, nextDelimiter.index),
      });
    }

    const contentStart = nextDelimiter.index + nextDelimiter.delimiter.length;
    const closingIndex = findClosingInlineDelimiter(
      text,
      nextDelimiter.delimiter,
      contentStart,
    );

    if (closingIndex < 0) {
      segments.push({
        type: "text",
        content: nextDelimiter.delimiter,
      });
      cursor = contentStart;
      continue;
    }

    const content = text.slice(contentStart, closingIndex);
    if (!content.trim()) {
      segments.push({
        type: "text",
        content: `${nextDelimiter.delimiter}${content}${nextDelimiter.delimiter}`,
      });
      cursor = closingIndex + nextDelimiter.delimiter.length;
      continue;
    }

    segments.push({
      type: resolveInlineFormatType(nextDelimiter.delimiter),
      content,
    });
    cursor = closingIndex + nextDelimiter.delimiter.length;
  }

  return segments;
}

function normalizeAssistantMarkdownHref(rawHref: string) {
  const href = rawHref.trim();
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
    return href;
  }

  return null;
}

function parsePlainInlineMarkdownSegments(
  text: string,
): PlainInlineMarkdownSegment[] {
  const segments: PlainInlineMarkdownSegment[] = [];
  const tokenPattern = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let cursor = 0;

  let match = tokenPattern.exec(text);
  while (match) {
    const matchIndex = match.index;
    if (matchIndex > cursor) {
      segments.push({
        type: "text",
        content: text.slice(cursor, matchIndex),
      });
    }

    if (match[1]) {
      segments.push({
        type: "code",
        content: match[1],
      });
    } else {
      const href = normalizeAssistantMarkdownHref(match[3] || "");
      if (href) {
        segments.push({
          type: "link",
          content: match[2] || href,
          href,
        });
      } else {
        segments.push({
          type: "text",
          content: match[0],
        });
      }
    }

    cursor = matchIndex + match[0].length;
    match = tokenPattern.exec(text);
  }

  if (cursor < text.length) {
    segments.push({
      type: "text",
      content: text.slice(cursor),
    });
  }

  return segments;
}

function renderPlainInlineMarkdown(text: string, keyPrefix: string) {
  return parsePlainInlineMarkdownSegments(text).map((segment, index) => {
    const key = `${keyPrefix}-plain-${index}`;

    if (segment.type === "text") {
      return <span key={key}>{segment.content}</span>;
    }

    if (segment.type === "code") {
      return (
        <code key={key} className="quote-chat-message__code-inline">
          {segment.content}
        </code>
      );
    }

    return (
      <a
        key={key}
        href={segment.href}
        target="_blank"
        rel="noreferrer noopener"
        className="quote-chat-message__link"
      >
        {segment.content}
      </a>
    );
  });
}

function renderAssistantInlineFormatting(
  text: string,
  keyPrefix = "inline",
): ReactNode[] {
  return parseAssistantInlineSegments(text).map((segment, index) => {
    const key = `${keyPrefix}-${index}`;

    if (segment.type === "text") {
      return (
        <span key={key}>{renderPlainInlineMarkdown(segment.content, key)}</span>
      );
    }

    const children = renderAssistantInlineFormatting(segment.content, key);

    if (segment.type === "strong") {
      return (
        <strong key={key} className="quote-chat-message__strong">
          {children}
        </strong>
      );
    }

    if (segment.type === "strong-emphasis") {
      return (
        <strong key={key} className="quote-chat-message__strong">
          <em className="quote-chat-message__emphasis">{children}</em>
        </strong>
      );
    }

    return (
      <em key={key} className="quote-chat-message__emphasis">
        {children}
      </em>
    );
  });
}

export function renderAssistantBlocks(
  blocks: AssistantMessageBlock[],
  keyPrefix: string,
) {
  return blocks.map((block, index) => {
    if (block.type === "paragraph") {
      return (
        <p
          key={`${keyPrefix}-paragraph-${index}`}
          className="quote-chat-message__text quote-chat-message__paragraph"
        >
          {renderAssistantInlineFormatting(block.text)}
        </p>
      );
    }

    if (block.type === "heading") {
      return (
        <p
          key={`${keyPrefix}-heading-${index}`}
          className={`quote-chat-message__heading quote-chat-message__heading--${block.level}`}
        >
          {renderAssistantInlineFormatting(block.text)}
        </p>
      );
    }

    if (block.type === "blockquote") {
      return (
        <blockquote
          key={`${keyPrefix}-blockquote-${index}`}
          className="quote-chat-message__blockquote"
        >
          {block.lines.map((line, lineIndex) => (
            <p
              key={`${keyPrefix}-blockquote-line-${lineIndex}`}
              className="quote-chat-message__blockquote-line"
            >
              {renderAssistantInlineFormatting(
                line,
                `${keyPrefix}-blockquote-inline-${lineIndex}`,
              )}
            </p>
          ))}
        </blockquote>
      );
    }

    if (block.type === "code") {
      return (
        <pre
          key={`${keyPrefix}-code-${index}`}
          className="quote-chat-message__code-block"
        >
          <code>{block.code}</code>
        </pre>
      );
    }

    if (block.ordered) {
      return (
        <ol
          key={`${keyPrefix}-list-${index}`}
          className="quote-chat-message__list quote-chat-message__list--ordered"
          start={block.start || undefined}
        >
          {block.items.map((item, itemIndex) => (
            <li
              key={`${keyPrefix}-list-item-${itemIndex}`}
              className="quote-chat-message__list-item"
            >
              {renderAssistantInlineFormatting(item)}
            </li>
          ))}
        </ol>
      );
    }

    return (
      <ul
        key={`${keyPrefix}-list-${index}`}
        className="quote-chat-message__list"
      >
        {block.items.map((item, itemIndex) => (
          <li
            key={`${keyPrefix}-list-item-${itemIndex}`}
            className="quote-chat-message__list-item"
          >
            {renderAssistantInlineFormatting(item)}
          </li>
        ))}
      </ul>
    );
  });
}
