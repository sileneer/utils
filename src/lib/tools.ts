import {
  Binary,
  FileDiff,
  MessageSquareText,
  QrCode,
  Ruler,
  type LucideIcon,
} from "lucide-react";

export type ToolStatus = "live" | "planned";

export type ToolCategory = "Agent" | "Text" | "Convert" | "Generate";

export type Tool = {
  slug: string;
  name: string;
  description: string;
  category: ToolCategory;
  status: ToolStatus;
  icon: LucideIcon;
};

/**
 * Registry of tools shown on the home page.
 * A tool ships at `/${slug}` when its status flips to "live".
 */
export const tools: Tool[] = [
  {
    slug: "agent-chat",
    name: "AI Agent Chat",
    description: "Chat with AI coding agents (Claude Code) running on the server.",
    category: "Agent",
    status: "planned",
    icon: MessageSquareText,
  },
  {
    slug: "text-diff",
    name: "Text Diff",
    description: "Compare two texts and highlight the differences.",
    category: "Text",
    status: "planned",
    icon: FileDiff,
  },
  {
    slug: "qr-studio",
    name: "QR Studio",
    description: "Generate and style QR codes, right in your browser.",
    category: "Generate",
    status: "planned",
    icon: QrCode,
  },
  {
    slug: "json-formatter",
    name: "JSON Formatter",
    description: "Format, validate and inspect JSON — processed locally.",
    category: "Text",
    status: "planned",
    icon: Binary,
  },
  {
    slug: "unit-converter",
    name: "Unit Converter",
    description: "Convert lengths, weights, temperatures and more.",
    category: "Convert",
    status: "planned",
    icon: Ruler,
  },
];
