# DESIGN.md — UI/UX Design System Specification

> Version 1.0 · 2026-10-04 · Status: **BINDING**
> This document is the single source of truth for all UI/UX decisions in this project.
> It is referenced from [AGENTS.md](../AGENTS.md) and **must be followed by every human or AI agent** contributing UI code. Any change to this file is an explicit design decision and must be called out in the commit message.
>
> Purpose: prevent UI churn. Once a rule is written here, agents must not re-litigate it in later tasks.

---

## 1. Stack decision (final)

| Layer | Choice | Status |
|-------|--------|--------|
| Styling | **Tailwind CSS v4** (CSS-first config, `@theme` in globals.css) | ✅ Decided |
| Component library | **shadcn/ui** (components copied into `src/components/ui`, built on Radix primitives) | ✅ Decided |
| Icons | **lucide-react** | ✅ Decided |
| Dark mode | **next-themes** (class strategy) | ✅ Decided |
| Fonts | **Inter** (body/UI) · **Outfit** (display/brand) · **JetBrains Mono** (code/tool output) — via `next/font` | ✅ Decided |
| Toasts | **sonner** | ✅ Decided |
| Forms | **react-hook-form + zod** (+ `@hookform/resolvers`) via shadcn `Form` | ✅ Decided |
| Motion | CSS transitions / `tw-animate-css` by default; `motion` (Framer Motion) only for home/marketing pages | ✅ Decided |
| Tables / charts | TanStack Table / Recharts **via shadcn wrappers**, only when a tool needs them | ✅ Decided |
| Client state | React built-ins; URL search params for shareable tool settings; Zustand only with written justification in a PR | ✅ Decided |

**Rejected alternatives** (do not reintroduce without a written ADR in this file):

- **Mantine / MUI / Ant Design / Chakra / HeroUI** — capable libraries, but package-based theming fights Tailwind, adds bundle weight, and gives a "library look"; shadcn's copy-in model gives us full ownership, which matters for an open-source product and for AI agents editing code directly.
- **styled-components / CSS Modules as primary styling** — dead end for this stack; Tailwind is the only styling system.
- **daisyUI** — class-based components conflict with shadcn's token model.

Why shadcn/ui + Tailwind v4 (2026 context): shadcn/ui has fully migrated to Tailwind v4's CSS-first architecture (no `tailwind.config.ts`; tokens as oklch CSS variables), React 19 compatible (no `forwardRef`), and it is the dominant Next.js ecosystem choice — which maximizes both contributor familiarity and AI-agent priors.

---

## 2. Design principles

1. **Utility-first, speed-first.** Tools should feel instant. No page animations on tool screens; optimize for perceived latency.
2. **Content over chrome.** Minimal headers, no decorative blocks. One screen = one tool's job.
3. **Brand family.** utils is part of the lzhdev.com family: reuse the portfolio's identity — Inter/Outfit typography, teal primary, purple accent. Same person's brand, adjacent product.
4. **Dark mode is a first-class citizen.** Every component and every change must look correct in both themes.
5. **Accessible by default.** WCAG AA contrast, keyboard operability, visible focus — enforced via Radix primitives plus the rules in §9.
6. **Tokens over literals.** No magic colors/spacing/z-index in components. Everything goes through the semantic tokens in §3.

---

## 3. Design tokens

### 3.1 Color system (semantic CSS variables, oklch)

Base palette: **slate** neutrals (cool gray, matches the portfolio), **teal** primary, **violet** accent.
Paste-ready block for `globals.css` (shadcn v4 convention; adjust only through this file):

```css
:root {
  --radius: 0.625rem;
  --background: oklch(0.985 0.005 240);
  --foreground: oklch(0.20 0.02 250);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.20 0.02 250);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.20 0.02 250);
  --primary: oklch(0.51 0.09 195);            /* deep teal (AA on white) */
  --primary-foreground: oklch(0.985 0.005 240);
  --secondary: oklch(0.96 0.008 240);         /* muted cool gray */
  --secondary-foreground: oklch(0.25 0.02 250);
  --muted: oklch(0.96 0.008 240);
  --muted-foreground: oklch(0.50 0.02 250);
  --accent: oklch(0.94 0.03 295);             /* violet tint bg */
  --accent-foreground: oklch(0.40 0.15 295);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0.005 240);
  --border: oklch(0.91 0.01 240);
  --input: oklch(0.91 0.01 240);
  --ring: oklch(0.55 0.10 195);
}
.dark {
  --background: oklch(0.16 0.015 250);
  --foreground: oklch(0.95 0.008 240);
  --card: oklch(0.20 0.02 250);
  --card-foreground: oklch(0.95 0.008 240);
  --popover: oklch(0.20 0.02 250);
  --popover-foreground: oklch(0.95 0.008 240);
  --primary: oklch(0.72 0.11 190);            /* brighter teal for dark bg */
  --primary-foreground: oklch(0.16 0.015 250);
  --secondary: oklch(0.26 0.02 250);
  --secondary-foreground: oklch(0.95 0.008 240);
  --muted: oklch(0.26 0.02 250);
  --muted-foreground: oklch(0.68 0.015 250);
  --accent: oklch(0.30 0.06 295);
  --accent-foreground: oklch(0.90 0.05 295);
  --destructive: oklch(0.65 0.20 25);
  --destructive-foreground: oklch(0.97 0.01 25);
  --border: oklch(0.28 0.02 250);
  --input: oklch(0.28 0.02 250);
  --ring: oklch(0.60 0.10 195);
}
```

Rules:

- Components reference **semantic classes only** (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `border-border`, …). Never raw palette classes (`text-teal-600`) and never inline `#hex`/`rgb()`/`oklch()` literals.
- Brand gradients (marketing/home only): teal → violet (`from-primary to-accent` style), used sparingly.
- New semantic tokens (e.g. `--success`, `--warning`) get added here first, then used.

### 3.2 Typography

| Role | Font | Classes |
|------|------|---------|
| Brand wordmark, home hero, page titles | Outfit | `font-display text-3xl md:text-4xl font-semibold tracking-tight` |
| Section/UI headings | Inter | `text-lg md:text-xl font-semibold` |
| Body / default UI | Inter | `text-sm md:text-base` |
| Helper/meta text | Inter | `text-xs text-muted-foreground` |
| Code, tool output, values | JetBrains Mono | `font-mono text-sm` |

- Load via `next/font/google` with CSS variables `--font-sans`, `--font-display`, `--font-mono`; map in `@theme inline` (`--font-sans` → Tailwind `font-sans`, etc.).
- Body line-height ≥ 1.5; headings ≤ 1.2. Never below `text-xs` (12px) for readable text.

### 3.3 Spacing, radius, elevation, z-index

- **Spacing**: Tailwind default 4px grid. Page container: `mx-auto max-w-6xl px-4 md:px-6 lg:px-8`. Vertical rhythm between sections: `py-10 md:py-14`.
- **Radius**: from `--radius` (0.625rem). Cards `rounded-xl`, buttons/inputs `rounded-md` (shadcn derives these from `--radius` automatically — do not hardcode).
- **Elevation**: minimal. Default `border` + `bg-card`; `shadow-sm` on hover for interactive cards; no large drop shadows.
- **z-index scale**: dropdowns 50 · sticky header 40 · overlays/dialogs 100 (Radix managed) · toasts 200 (sonner managed). No other values.

---

## 4. Components

### 4.1 Source of truth

- All base components live in `src/components/ui/` (shadcn-owned). Add new ones with `npx shadcn@latest add <component>` — never vendor components from the web.
- **Never hand-roll a component that `ui/` already provides** (button, dialog, dropdown, select, tabs, tooltip, …). Extend instead: wrap the shadcn component in a project component (`src/components/…`) or use its props/variants.
- shadcn components are ours to edit (copy-in model), but edits to `ui/` files must be minimal, generic, and justified — tool-specific logic belongs in wrappers above them.

### 4.2 Usage rules

- **Buttons**: `default` = primary action (one per view) · `secondary` = supporting actions · `outline` = actions on cards/neutral surfaces · `ghost` = icon buttons/toolbar actions · `destructive` = irreversible actions. Size `sm` in dense tool UIs; default elsewhere. All icon-only buttons need `aria-label` + a `Tooltip`.
- **Forms**: always shadcn `Form` (react-hook-form + zod schema as the single validation source). Every control has a visible `FormLabel`; errors via `FormMessage`; submit button shows a spinner and is `disabled` while pending. Validate on submit, then on change for corrected fields.
- **Feedback**: success/error → `sonner` toast (there is exactly one `<Toaster />` in the root layout). Waiting data → `Skeleton`, never spinners-in-cards. Empty states → centered lucide icon + one-line explanation + primary CTA. Errors → route-level `error.tsx` with a retry button; destructive `Alert` for user-fixable problems.
- **Overlays**: `Dialog` for focused single tasks, `Sheet` for mobile settings panels, `Popover`/`DropdownMenu` for secondary controls. Confirm destructive actions with an `AlertDialog`.
- **Copy tool output / long values** always in `font-mono` with a copy button.

---

## 5. Layout & page patterns

### 5.1 App shell

```
Header (sticky, bg-background/80 backdrop-blur, border-b):
  [logo: "utils" in Outfit + teal dot] [nav: Tools · About] …… [GitHub icon] [ThemeToggle]
Main: <main id="main-content" class="mx-auto max-w-6xl …">
Footer: © Zihao Liu · GitHub · built with Next.js — muted, single row
```

- `ThemeToggle` (next-themes): light / dark / system cycle or dropdown; suppress hydration warning.
- Skip-to-content link as the first focusable element.

### 5.2 Tool index (home)

- Responsive card grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`.
- Tool card: lucide icon on `bg-primary/10` rounded tile + tool name (medium) + one-line description (`text-sm text-muted-foreground`) + optional category badge. Entire card is one link (`Card` + hover `shadow-sm` + `-translate-y-0.5` transition).

### 5.3 Tool page template (`ToolShell`)

Every tool route (`/tools/<slug>`) renders the same shell, in this order:

1. **Header block**: `h1` (tool name) + one-line description + optional category badge.
2. **Input area**: form/settings — inline if small, inside a `Card` if structured.
3. **Result area**: mono output / table / preview; persistent while tweaking inputs (no modal results).
4. **Footnote** (optional): "How it works" collapsed `Collapsible` — data source, limitations, privacy note ("processed locally in your browser").

- Tool state that users would share → encode in URL search params (shareable links are a feature).
- Client-side-only tools (no server call) should say so in the footnote — privacy is a selling point.

### 5.4 System pages

- `not-found.tsx`: friendly, link back to tools index.
- `error.tsx` per route segment: error message + retry; never a bare stack trace.
- `loading.tsx`: skeletons matching the page layout.

### 5.5 Responsive & breakpoints

Mobile-first. Test widths: 360 / 768 / 1280. Settings panels that are sidebars on desktop become `Sheet` on mobile. No horizontal scroll at 360px, ever.

---

## 6. Motion

- Micro-interactions (hover, focus, press): CSS transitions, `150ms ease-out`.
- Enter/exit of overlays/popovers: `tw-animate-css` classes shipped with shadcn components (200–300ms) — do not customize.
- `motion` (Framer Motion) is allowed **only** on the home/marketing layer (subtle fades/stagger on first load).
- Respect `prefers-reduced-motion`: wrap any non-trivial animation in `motion-reduce:transition-none` / `motion-reduce:animate-none`.

---

## 7. Icons

- **lucide-react only.** No other icon packs, no emoji as UI icons (emoji allowed inside user-facing *content* strings, e.g. tool descriptions).
- Sizes: `size-4` inline, `size-5` buttons/nav, `size-8`+ for feature tiles; stroke width default (2).
- Icon-only interactive elements require `aria-label` + `Tooltip`.

---

## 8. Theming & dark mode

- `next-themes`, `attribute="class"`, `defaultTheme="system"`, `enableSystem`.
- Developing UI without checking both themes = broken UI. Agent checklist for every UI change: **run light + dark, 360px + desktop.**
- No theme-dependent hardcoding (`dark:` variants are allowed only for fine-tuning outside the token system — e.g. an image filter — and need a comment explaining why).

---

## 9. Accessibility (non-negotiable)

- WCAG 2.1 AA: text contrast ≥ 4.5:1 (tokens above are chosen for this — don't override).
- Full keyboard operability (Radix gives this for free; custom widgets must preserve it). Visible `focus-visible` ring everywhere (shadcn default `ring` token); **never** `outline-none` without a replacement.
- Hit targets ≥ 40×40px (`size-10`) for interactive elements on touch layouts.
- Status never conveyed by color alone — pair with icon/text.
- Semantic landmarks (`header/main/footer/nav`), one `h1` per page, logical heading order.

---

## 10. Copy & i18n

- UI language: **English** (open-source product first). Sentence case everywhere; buttons = verb-first, ≤ 3 words; tool descriptions = one line, no marketing fluff.
- i18n: structure for future localization (user-visible strings concentrated in components, no string concatenation); adopt `next-intl` with zh-CN when family-facing features demand it (decision deferred to M4 — do not add i18n infrastructure before then).

---

## 11. Agent rules — anti-churn checklist

**DO**

- Use semantic token classes and the components/patterns defined here.
- Check both themes and mobile width before considering UI work done.
- Extend shadcn components through wrappers in `src/components/`.
- Add new tools by following the `ToolShell` template (§5.3).
- Keep this document updated when a decision genuinely changes (with rationale).

**DON'T**

- ❌ Introduce any additional styling system or component library (MUI, Mantine, styled-components, …).
- ❌ Use raw color literals (`#7c3aed`, `text-teal-600`) or magic spacing/z-index values in components.
- ❌ Hand-roll dropdowns/dialogs/toasts/tabs/tables that `ui/` already covers.
- ❌ Add a second icon library or emoji-as-icon.
- ❌ Add animation libraries or one-off keyframes outside §6.
- ❌ Ship UI without dark-mode verification.
- ❌ Redesign "on the fly" — if a pattern feels wrong, propose a change to this file instead of deviating silently.

---

## 12. Version pins (as of 2026-10, verify latest at M1)

| Package | Pin |
|---------|-----|
| tailwindcss | v4.x |
| shadcn/ui (CLI + components) | latest at scaffold time |
| lucide-react | latest |
| next-themes | latest |
| sonner | latest |
| react-hook-form / zod / @hookform/resolvers | latest |
| tw-animate-css | latest (replaces tailwindcss-animate in v4) |
| motion | latest (marketing pages only) |

Tooling: Prettier + `prettier-plugin-tailwindcss` (class order is enforced, not taste) · ESLint `next/core-web-vitals`.

---

## 13. References

- shadcn/ui docs (Tailwind v4, theming, components) — https://ui.shadcn.com
- Tailwind CSS v4 (CSS-first, oklch tokens) — https://tailwindcss.com
- tweakcn (shadcn theme editor — palette experiments land back here as token changes) — https://tweakcn.com
- lucide-react — https://lucide.dev
- next-themes — https://github.com/pacocoursey/next-themes
- React UI library landscape 2026 (decision context) — see docs/PLANNING.md §9
