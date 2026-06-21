import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

interface MarkdownRendererProps {
  text: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ text }) => {
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null);

  if (!text) return null;

  // Split by ``` to separate code blocks from normal markdown text
  const parts = text.split(/```/);

  const copyToClipboard = (codeText: string, blockId: string) => {
    navigator.clipboard.writeText(codeText.trim());
    setCopiedBlock(blockId);
    setTimeout(() => setCopiedBlock(null), 2000);
  };

  return (
    <div className="space-y-2 leading-relaxed text-gray-100 max-w-full overflow-hidden text-sm md:text-base">
      {parts.map((part, index) => {
        // Odd indices in the split result represent the contents of code blocks
        const isCodeBlock = index % 2 === 1;

        if (isCodeBlock) {
          const lines = part.split("\n");
          // The first word of a fenced block often tells us the programming language
          const language = lines[0]?.trim() || "code";
          const codeContent = lines.slice(1).join("\n");
          const blockId = `code-block-${index}`;
          const isCopied = copiedBlock === blockId;

          return (
            <div
              key={index}
              id={blockId}
              className="my-3 overflow-hidden rounded-xl border border-white/10 bg-[#121319] font-mono shadow-xl relative"
            >
              {/* Faux Window Header bar resembling VS Code */}
              <div className="flex items-center justify-between bg-[#191b22] px-4 py-2 text-xs text-gray-400 border-b border-white/5 selection:bg-transparent">
                <div className="flex items-center gap-2">
                  <span className="flex gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/80"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500/80"></span>
                  </span>
                  <span className="font-semibold text-gray-300 uppercase tracking-wider text-[10px] ml-2">
                    {language || "CODE"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => copyToClipboard(codeContent, blockId)}
                  className="flex items-center gap-1.5 rounded bg-white/5 hover:bg-white/10 active:scale-95 text-gray-300 hover:text-white px-2 py-1 transition-all text-[11px]"
                >
                  {isCopied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400 font-medium">Nusxalandi!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Nusxa olish</span>
                    </>
                  )}
                </button>
              </div>

              {/* Native code area styled beautifully */}
              <div className="p-4 overflow-x-auto text-xs md:text-sm text-gray-200 scrollbar-thin leading-6">
                <pre className="whitespace-pre select-text">{codeContent.trim()}</pre>
              </div>
            </div>
          );
        } else {
          // Regular text block - split by lines and translate basic HTML formats
          const lines = part.split("\n");
          return (
            <React.Fragment key={index}>
              {lines.map((line, lineIdx) => {
                const trimmedLine = line.trim();
                if (!trimmedLine) {
                  return <div key={lineIdx} className="h-2" />;
                }

                // Check for high headings: e.g. #, ##, ###, ####
                if (trimmedLine.startsWith("#")) {
                  const hashCount = trimmedLine.match(/^#+/)?.[0].length || 1;
                  const headingText = trimmedLine.replace(/^#+\s*/, "");
                  const formattedText = parseInlineStyling(headingText);

                  if (hashCount === 1) {
                    return (
                      <h1
                        key={lineIdx}
                        className="text-lg md:text-2xl font-bold font-display text-white mt-4 border-b border-white/5 pb-1 tracking-tight"
                      >
                        {formattedText}
                      </h1>
                    );
                  }
                  if (hashCount === 2) {
                    return (
                      <h2
                        key={lineIdx}
                        className="text-md md:text-xl font-bold font-display text-[#c084fc] mt-3 tracking-tight"
                      >
                        {formattedText}
                      </h2>
                    );
                  }
                  return (
                    <h3 key={lineIdx} className="text-sm md:text-lg font-semibold font-display text-white mt-2">
                      {formattedText}
                    </h3>
                  );
                }

                // Check for bullet list item: starts with '- ' or '* ' or '• '
                if (trimmedLine.startsWith("- ") || trimmedLine.startsWith("* ") || trimmedLine.startsWith("• ")) {
                  const bulletText = trimmedLine.replace(/^[-*•]\s*/, "");
                  return (
                    <ul key={lineIdx} className="list-disc pl-5 my-1 space-y-1">
                      <li className="text-gray-300 font-sans text-sm md:text-[15px]">
                        {parseInlineStyling(bulletText)}
                      </li>
                    </ul>
                  );
                }

                // Check for numbered lists: e.g., "1. Bla bla"
                if (/^\d+\.\s+/.test(trimmedLine)) {
                  const bulletText = trimmedLine.replace(/^\d+\.\s+/, "");
                  return (
                    <ol key={lineIdx} className="list-decimal pl-5 my-1 space-y-1">
                      <li className="text-gray-300 font-sans text-sm md:text-[15px]" style={{ listStyleType: "decimal" }}>
                        {parseInlineStyling(bulletText)}
                      </li>
                    </ol>
                  );
                }

                // If starting with horizontal line
                if (trimmedLine === "---" || trimmedLine === "***") {
                  return <hr key={lineIdx} className="my-4 border-white/10" />;
                }

                // Standard paragraph text
                return (
                  <p key={lineIdx} className="text-gray-300 text-sm md:text-[15.5px]/relaxed leading-relaxed my-1 font-sans">
                    {parseInlineStyling(line)}
                  </p>
                );
              })}
            </React.Fragment>
          );
        }
      })}
    </div>
  );
};

// Simple helper to parse inline blocks: **bold**, *italic*, more `code` tags
function parseInlineStyling(text: string) {
  if (!text) return "";

  // Split content using capturing groups: **Bold**, *Italic*, `code`
  const inlineRegex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
  const parts = text.split(inlineRegex);

  return parts.map((part, i) => {
    // Bold element
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-bold text-white selection:bg-purple-500/30">
          {part.slice(2, -2)}
        </strong>
      );
    }
    // Italic element
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={i} className="italic text-gray-100 selection:bg-purple-500/30">
          {part.slice(1, -1)}
        </em>
      );
    }
    // Inline code element
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-xs text-pink-400 font-medium selection:bg-purple-500/30"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    // Otherwise regular text
    return part;
  });
}
