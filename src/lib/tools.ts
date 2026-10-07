import {
  BookOpen,
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
  category: ToolCategory;
  status: ToolStatus;
  icon: LucideIcon;
};

/**
 * Registry of tools shown on the home page. A tool ships at `/${slug}` when
 * its status flips to "live". Names and descriptions are NOT stored here —
 * they live in messages/en.json + messages/zh.json under `tools.<slug>`
 * (DESIGN.md §10).
 */
export const tools: Tool[] = [
  {
    slug: "htlb",
    category: "Agent",
    status: "live",
    icon: BookOpen,
  },
  {
    slug: "agent-chat",
    category: "Agent",
    status: "planned",
    icon: MessageSquareText,
  },
  {
    slug: "text-diff",
    category: "Text",
    status: "planned",
    icon: FileDiff,
  },
  {
    slug: "qr-studio",
    category: "Generate",
    status: "planned",
    icon: QrCode,
  },
  {
    slug: "json-formatter",
    category: "Text",
    status: "planned",
    icon: Binary,
  },
  {
    slug: "unit-converter",
    category: "Convert",
    status: "planned",
    icon: Ruler,
  },
];
