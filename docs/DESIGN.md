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
| Icons | **Lucide** (data + components); **morphicons** (`morphicons/react`) renders state-transition icons with spring morph animations — see §7 | ✅ Decided |
| Dark mode | **next-themes** (class strategy) | ✅ Decided |
| Fonts | **Inter** (body/UI) · **Outfit** (display/brand) · **JetBrains Mono** (code/tool output) — via `next/font` | ✅ Decided |
| Toasts | **sonner** | ✅ Decided |
| Forms | **react-hook-form + zod** (+ `@hookform/resolvers`) with existing Input/Label primitives and accessible inline errors (§4.2/§5.7) | ✅ Decided |
| Motion | CSS transitions / `tw-animate-css` by default; `motion` (Framer Motion) only for home/marketing pages | ✅ Decided |
| Tables / charts | TanStack Table / Recharts **via shadcn wrappers**, only when a tool needs them | ✅ Decided |
| Client state | React built-ins; URL search params for shareable tool settings; Zustand only with written justification in a PR | ✅ Decided |
| i18n | **next-intl**, cookie-based locale (no URL prefixes): `en` + `zh`, default = visitor's `Accept-Language`, manual switch persists via `NEXT_LOCALE` cookie | ✅ Decided |

**Rejected alternatives** (do not reintroduce without a written ADR in this file):

- **Mantine / MUI / Ant Design / Chakra / HeroUI** — capable libraries, but package-based theming fights Tailwind, adds bundle weight, and gives a "library look"; shadcn's copy-in model gives us full ownership, which matters for an open-source product and for AI agents editing code directly.
- **styled-components / CSS Modules as primary styling** — dead end for this stack; Tailwind is the only styling system.
- **daisyUI** — class-based components conflict with shadcn's token model.

Why shadcn/ui + Tailwind v4 (2026 context): shadcn/ui has fully migrated to Tailwind v4's CSS-first architecture (no `tailwind.config.ts`; tokens as oklch CSS variables), React 19 compatible (no `forwardRef`), and it is the dominant Next.js ecosystem choice — which maximizes both contributor familiarity and AI-agent priors.

---

## 2. Design principles

1. **Utility-first, speed-first.** Tools should feel instant. No page animations on tool screens; optimize for perceived latency.
2. **Content over chrome.** Minimal headers, no decorative blocks. One screen = one tool's job.
3. **Owner identity.** utils is the lzhdev tools website: reuse the portfolio's identity — Inter/Outfit typography, teal primary, purple accent.
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
  --destructive: oklch(0.57 0.245 27.325);
  --destructive-foreground: oklch(0.985 0.005 240);
  --success: oklch(0.51 0.12 152);              /* green, AA on card; local diff/validation additions */
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
  --destructive-foreground: oklch(0.16 0.015 250);
  --success: oklch(0.72 0.15 152);              /* dark-theme pairing for the light value above */
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
- **Introduction flow (standing rule from the owner, 2026-10-04):** anything new to the UI layer — a component library, an icon set, a UI pattern family, or a shadcn component not yet in the registry below — is **written into this document first** (with a one-line rationale), then installed. The DESIGN.md change precedes the code usage and ships in the same commit. Within-stack additions update the registry below; out-of-stack additions go through the §1 decision table (and the rejected-alternatives list).
- **Adopted `ui/` component registry** — the source of truth for which base components exist/are approved. The set below was installed at M1 (2026-10-04); every later addition is appended here *before* it is installed:
  button · card · input · textarea · label · select · checkbox · switch · slider · dialog · alert-dialog · dropdown-menu · popover · sheet · tabs · tooltip · collapsible · badge · separator · skeleton · alert · table · sonner (toaster)

  **`form` is NOT in the adopted shadcn 4.x radix registry** (the CLI skipped it). Account forms use react-hook-form + zod with existing Input/Label primitives and accessible inline errors in project wrappers (§5.7/§5.9). Do not assume a `ui/form` component exists or add one merely to match outdated instructions.

### 4.2 Usage rules

- **Buttons**: `default` = primary action (one per view) · `secondary` = supporting actions · `outline` = actions on cards/neutral surfaces · `ghost` = icon buttons/toolbar actions · `destructive` = irreversible actions. Size `sm` in dense tool UIs; default elsewhere. All icon-only buttons need `aria-label` + a `Tooltip`.
- Destructive buttons use the solid semantic destructive background and its contrast
  foreground in both themes (dark foreground in dark mode). Hover adds a shadow without
  fading either color; the former tinted background failed small-text contrast. Both
  destructive tokens are registered in Tailwind's inline theme.
- **Forms**: use react-hook-form + zod with existing Input/Label primitives and project wrappers. Every control has a visible Label; inline errors are associated with `aria-describedby` and invalid controls with `aria-invalid`. Submit shows pending feedback and is disabled while pending. Validate on submit, then revalidate corrected fields. Server validation remains authoritative.
- **Feedback**: success/error → `sonner` toast (there is exactly one `<Toaster />` in the root layout). Waiting data → `Skeleton`, never spinners-in-cards. Empty states → centered lucide icon + one-line explanation + primary CTA. Errors → route-level `error.tsx` with a retry button; destructive `Alert` for user-fixable problems.
- **Overlays**: `Dialog` for focused single tasks, `Sheet` for mobile settings panels, `Popover`/`DropdownMenu` for secondary controls. Confirm destructive actions with an `AlertDialog`.
- **Copy tool output / long values** always in `font-mono` with a copy button.

---

## 5. Layout & page patterns

### 5.1 App shell

```
Header (sticky, bg-background/80 backdrop-blur, border-b):
  [logo: "utils" in Outfit + teal dot] [nav: Tools · About] …… [AccountMenu] [GitHub icon] [LanguageSwitcher] [ThemeToggle]
Main: <main id="main-content" class="mx-auto max-w-6xl …">
Footer: lzhdev.com · GitHub ("Open source (MIT)") — muted, single row. **No copyright line** (owner decision 2026-10-05 — do not re-add "© …").
```

- `ThemeToggle` (next-themes): light / dark / system cycle or dropdown; suppress hydration warning.
- Skip-to-content link as the first focusable element.

### 5.2 Tool index (home)

- **Site introduction (owner decision, 2026-10-16):** home, About and metadata identify utils simply as the lzhdev tools website. Keep the owner link; avoid personal-audience or brand-lineage descriptions and future-milestone copy in these introductions.
- Responsive card grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`.
- Tool card: lucide icon on `bg-primary/10` rounded tile + tool name (medium) + one-line description (`text-sm text-muted-foreground`) + optional category badge. Entire card is one link (`Card` + hover `shadow-sm` + `-translate-y-0.5` transition).

### 5.3 Tool page template (`ToolShell`)

A tool ships at `/${slug}`: the path comes from `src/lib/tools.ts` and the home
card links to it directly (§10). There is no `/tools/` prefix — the earlier
wording in this section was stale and was corrected on 2026-10-16 when
`/text-diff` shipped, because two different route spellings had already started
to spread into prompts and notes. The registry status (`planned` / `live`) is the
only switch for the home entry; the page itself does not gate on it.

Every tool route renders the same shell, in this order:

1. **Header block**: `h1` (tool name) + one-line description + optional category badge.
2. **Input area**: form/settings — inline if small, inside a `Card` if structured.
3. **Result area**: mono output / table / preview; persistent while tweaking inputs (no modal results).
4. **Footnote** (optional): "How it works" collapsed `Collapsible` — data source, limitations, privacy note ("processed locally in your browser").

- Tool state that users would share → encode in URL search params (shareable links are a feature).
  **Exception:** a browser-only local tool (§5.18) never puts user text, or anything
  derived from it, into a URL, query string, storage key or download name. Pasting a
  private document into such a tool must not create a link that carries it.
- Client-side-only tools (no server call) should say so in the footnote — privacy is a selling point.
- "ToolShell" names this template, not a component: each tool page currently
  composes the four blocks from `ui/` primitives directly. Extract a shared
  component when the second local tool lands, and record it here first.

### 5.4 System pages

- `not-found.tsx`: friendly, link back to tools index.
- `error.tsx` per route segment: error message + retry; never a bare stack trace.
- `loading.tsx`: skeletons matching the page layout.

### 5.5 Responsive & breakpoints

Mobile-first. Test widths: 360 / 768 / 1280. Settings panels that are sidebars on desktop become `Sheet` on mobile. No horizontal scroll at 360px, ever.

### 5.6 Chat (agent) pattern — M4

**Approved optimization, 2026-10-07 (PLANNING §10):**
- One shared conversation controller owns desktop/mobile messages, drafts and requests.
  Desktop sidebar begins at `lg`; narrower screens use the adopted Radix Sheet.
- Header: title + new chat/close. Model control sits on its own secondary row.
  Reading-shell settings reuse ThemeToggle/LanguageSwitcher. Touch actions are >=40 px.
  The full-screen reader replaces the site's ordinary header/footer; covered chrome
  is removed from the focus order and accessibility tree.
- Composer uses the adopted Textarea, grows up to 160 px, and stays visible with
  the visual viewport. Desktop Enter sends (except IME composition), Shift+Enter
  inserts a line break; touch Enter inserts a line break. Draft editing remains available
  during generation; send becomes Stop. Failed/interrupted turns offer manual Retry.
- Answers have explicit completion status, Markdown and copy; scrolling follows only
  when the reader is near the bottom, with a Jump to latest action otherwise.
- Empty/locked states explain the assistant and show starter questions. Progress
  describes real preparation/search/generation events, never invented percentages.
- Selected-book excerpts appear as removable context. Confirmed citation locations
  navigate/highlight a version-matched book entry; they do not certify factual accuracy.
- **New render dependencies registered before installation:** `react-markdown`
  (React answer rendering without raw HTML) and `remark-gfm` (tables/lists). Use semantic
  classes through component overrides; no raw HTML, remote images, or highlighter library.
  No additional base UI library/components are introduced.

- Surfaces: right-hand sidebar on the `/htlb` reading page (overlay panel on mobile) + future standalone page; one shared client component.
- Layout: user bubbles on `bg-primary/10`, assistant on `bg-muted/50`; composer pinned to the bottom. The short footer asks readers to check the original entries and conditions when deciding.
- **Access**: verified email/password accounts, a login/register locked state,
  visible identity and logout; actual auth/session contract is ARCHITECTURE §5.
- Streaming: SSE from `/api/agent/chat`; owned messages persist in SQLite;
  concurrent queries are rejected with a "busy" message (single 1GB VM).
- Model picker: separate secondary-row dropdown with localized neutral book-Q&A hints (no unmeasured performance claims). Existing dropdown reads runtime model metadata; disable while loading or unavailable. Allowlist/default/preference persistence are described in ARCHITECTURE §3.
- Embedded third-party content (the HowToLiveBetter book HTML) stays single-language — i18n applies to our chrome only.
- **Book isolation registered 2026-10-15:** executable upstream HTML runs in an
  opaque-origin sandbox, enforced by both the iframe and the HTML response's CSP
  (including direct navigation). It has no application storage, account API or parent
  DOM access. The bridge checks the configured parent origin and exact parent window;
  the shell accepts only bounded messages from its exact opaque-origin reader window.
  Parent-to-reader messages use `*` solely because an opaque origin has no target URL.
  Preserve theme, selection, pinned citations and the existing unavailable/retry UI;
  readiness comes from the bridge handshake, not cross-frame DOM inspection. Upstream
  inline scripts/styles and embedded images remain usable; remote fonts are limited to
  the existing Google Fonts hosts, and fetch/form/frame access is denied. User-activated
  outbound links may open separate windows without granting the reader origin access.
  No new UI component, dependency or token is introduced.

---

### 5.6.1 Per-message details — owner request, 2026-10-08

- Register the project MessageDetails wrapper before use: a compact footer below
  each message, using existing Button/Collapsible primitives and semantic tokens.
  User messages show their send time; assistant messages show status, elapsed
  time and reported token total, with an expandable breakdown.
- Live progress remains attached to its answer: actual preparation/search/text
  stages, elapsed time and observed search/read counts. No fabricated progress,
  reasoning transcript, credentials, provider logs or billing estimate is shown.
- Details include the model used for that turn, first-text wait, input/output and
  reported cache tokens, tool counts and pinned source revision. Old/unreported
  values are explicitly unavailable. Unconfirmed termination retains recovery
  state until a server snapshot supplies final timing. Token scope and cache
  inclusion are explained; it is not a billing statement.
- Keep summary text wrapping at 360 px, use accessible disclosure controls,
  and avoid announcing the ticking timer to screen readers every second.
  No additional dependency or base component is introduced.

### 5.6.2 Recovery and conversation history — A+B approved 2026-10-09

- Register ConversationHistory and ChatAvailability project wrappers before use.
  Reuse existing Button/Input/Label/Collapsible/DropdownMenu and semantic tokens;
  no new base component, dependency or token. History replaces the message area
  while open, preserving the existing Sheet and composer state. Search, archived
  filter, open, rename, archive/restore and pagination have accessible labels.
  Rename follows the registered §5.7 RHF/Zod/Label/inline-error form contract,
  with a pending spinner and disabled mutations.
- Personal quota and local reset time use an expandable compact summary. Service
  availability exposes no other reader's identity. Status checks invoke no model.
  Distinguish requesting Stop, confirmed terminal state and confirmation unavailable;
  bounded reconciliation offers manual refresh instead of automatic paid retry.
- Drafts belong to an account and conversation, including an unsent new draft.
  Switching/new-chat waits for confirmed cancellation; failed confirmation keeps
  the current conversation and draft visible. Archive is reversible, not deletion.
- Incomplete-copy actions are labeled; clipboard failure uses the adopted toast.
  All new copy is bilingual and touch controls remain at least 40px. Answer code
  and table scroll containers are keyboard focusable; references use a named group.

### 5.6.3 Source previews and reading continuity — C+D, 2026-10-09

- Register CitationPreview before use: existing Button/Collapsible/Skeleton show
  the pinned entry title, bounded original excerpt, source revision and full-source
  action. Fetch on explicit disclosure only; rendering a location never certifies
  an answer's claims. Missing/wrong-version sources show a clear localized fallback.
  No model call, new dependency, base component or token is introduced.
- Desktop reading has two explicit chat widths: existing sidebar and expanded
  (up to 48rem, leaving room for the original). Reuse labeled icon buttons;
  resizing/opening cannot replace the shared controller or lose draft/scroll.
- On mobile, citation navigation closes the existing Sheet and offers Return to
  answer. Retain disclosed text/open state outside Sheet and restore the same
  message position and draft; do not jump to the latest
  message merely because a panel remounts. Keep touch controls at least 40px,
  existing visualViewport/IME behavior and accessible focus restoration.
- Account identity/logout move into an existing DropdownMenu; model/quota stay
  compact. Answer copy, source disclosures and message-detail summaries remain
  visible and wrap at 360px. Code/tables scroll within the message, not the page.

### 5.7 Public accounts — approved 2026-10-07

- `/login`, `/register`, `/verify-email`, and `/reset-password` use the existing
  Card, Input, Label, Alert and Button primitives. One pasteable OTP field,
  explicit resend/status, password-manager autocomplete and visible validation.
- Registered `better-auth` (server lifecycle) and `better-sqlite3` for self-hosted
  credentials/sessions/OTP and persisted ownership. Shared client state uses the
  project AccountProvider, not an additional Better Auth React client.
  Registered `react-hook-form`, `zod`, and `@hookform/resolvers` for account forms;
  project wrappers use existing Label and accessible inline errors
  (shadcn 4 has no Form registry entry). These implement §4.2's form contract.
- Register Cloudflare's official explicit Turnstile widget for public auth forms;
  no additional CAPTCHA/UI wrapper library. Local QA uses official test keys.
  A container below 300 px uses the compact widget; wider forms use flexible
  size. Widget language/theme follows the form; reflow invalidates the old token.
- Locked chat links to login/register. Authenticated chat shows account and logout;
  private UI and browser state are scoped to the authenticated user.

### 5.8 Administrator operations — owner request, 2026-10-09

- Register OperationsDashboard before implementation: server-authorized `/admin`
  page and read-only `/api/admin/operations`, using existing Card, Button, Badge,
  Skeleton and Table primitives. No dependency, base component or color token.
- Show bounded 24-hour/7-day aggregate request outcomes, reported token totals,
  elapsed/first-text summaries with sample counts and missing fields, current
  application guard state and backup success/failure/freshness. No message text,
  email lists, provider logs, keys or native identifiers.
- Manual refresh only, with bounded request timeout and clear failure/empty
  states. Localize all labels; wrap long values at 360px, semantic light/dark
  styling and 40px touch controls. Refresh never submits an AI request.
- Add an administrator-only link to the existing account menu; access is enforced
  from current database role/status on every API/page request.
- Keyboard-aware mobile reading uses the visible viewport height only while a
  text control is focused; otherwise preserve existing dynamic viewport layout.
  Keep the same controller/draft/disclosure state, respect safe-area padding,
  and never submit Enter during IME composition.

### 5.9 Site-wide account UI — owner approved A+B+C, 2026-10-09

- Registered wrappers: AccountProvider (shared identity state), AccountMenu (one
  dropdown in ordinary header, reader toolbar and chat), HomeAccount (compact home
  entry), and AccountCenter (profile/password/login sessions).
- Reuse existing Card, Button, Input, Label, Alert, Skeleton, DropdownMenu and
  AlertDialog primitives, react-hook-form/Zod and lucide icons; no new dependency,
  upload service, base component or color token.
- Header uses a compact account icon at narrow widths and hides the redundant
  header GitHub shortcut below sm (the footer retains it). Tools/About remain visible.
- Account center uses stacked cards at 360px, labeled fields, password-manager
  autocomplete, inline validation and pending controls. Sensitive session removal
  uses AlertDialog confirmation and current-password input; show the account-wide
  AI cancellation effect before security actions. Nickname is editable; email is read-only.
  Controls meet the 40px target; controlled dialogs restore the initiating button
  through an explicit close-focus target after cancellation (GOTCHAS).
- Session list shows inferred browser/system, login and expiry times, current
  marker, safe row IDs only. Loading uses Skeleton; retry/reauthentication/empty
  states are localized. Never label inferred sessions as exact physical devices.
- Login and related forms retain validated site-local returnTo throughout the flow.
  Global login/account menus work while AI is disabled and reader chat is closed.

### 5.10 Account operations clarity — batch A approved 2026-10-13

- Registered patterns in the account center: a compact summary card (name,
  verified email, initial avatar) with profile/security/sessions anchor
  navigation and a back-to-site link. Section wrappers carry the stable ids
  `#profile` / `#security` / `#sessions` with scroll margins clearing the sticky
  header; reauthentication returnTo links target those anchors. Reuse Card,
  Button and Link; mobile stays single-column.
- Register the password form as a collapsed-by-default disclosure (existing
  Collapsible): the trigger toggles the form, opening focuses the first field,
  and pending/success states stay inside the panel. No Tabs/sidebar is added.
- Register the PasswordField project wrapper (account and auth forms): existing
  Input/Label/Button/Tooltip around a labeled show/hide toggle rendered through
  MorphIcon (Eye/EyeOff — a genuine two-state control, §7) with `aria-pressed`,
  a state-specific accessible name, keyboard operation and a 40px target.
  The Caps Lock hint appears only while an actual key event reports the
  modifier and clears on blur; there is no strength meter or password egress.
  Autocomplete, paste and the existing password rules are preserved.
- Profile save follows the §4.2 RHF/Zod form contract. The display-name field
  receives the server-confirmed value through `values` only while it still
  exactly matches it; an unsaved draft is never overwritten. A rename from
  another window surfaces a conflict notice offering "keep my edit" (draft
  retained) or "use the saved name" (form reset); Save/Cancel appear only for a
  trimmed-value change, pending blocks duplicate submits, and success refreshes
  the site-wide name and initial avatar. No credential or OTP enters storage.
- Security errors map per section (src/lib/auth/errors.ts): stale login
  (re-verify with the 24-hour explanation), invalidated login (log in), wrong
  password, rate limiting (server-known wording only, no invented countdown),
  revoked target (list refresh — never a password error), service failure,
  account busy, unconfirmed stop, and unconfirmed transport outcomes (result
  unknown; no automatic retry, refresh before retrying). Profile failures never
  present password copy; service failures are not described as pending setup.
- The login `reauth=1` variant changes only title/description/primary-label
  copy and keeps the same password form, safe returnTo and section anchor; it
  grants nothing server-side and carries no sensitive form content.
- Sessions: current session first, then most recent login; the section states
  the active and other-session counts. Single-target confirmation shows the
  inferred browser/system and login time; batch confirmation states the
  other-session count and that the current session stays signed in. Per-row
  controls carry target-specific accessible names (same-browser sessions remain
  distinguishable). A refresh failure keeps the last loaded list with a stale
  notice; an invalidated identity clears it. After a confirmed revoke focus
  moves to the still-present section heading (tabindex=-1); cancel returns to
  the initiating button. Same-account security changes (revoke/password) refresh
  identity without unmounting the account UI, so open dialogs and focus survive.
- The verification challenge renders explicit loading, expired, failed and
  script-unavailable states with a bounded manual retry; only code-sending
  actions depend on a fresh token. Reset keeps its own purpose-correct resend
  and offers "start over with a different email", clearing the old OTP/password
  and re-running the challenge; sending acceptance is not described as
  delivery. No new dependency, base component or color token is introduced.

### 5.11 Account preferences and personal usage — batch B approved 2026-10-14

- **Two layers, one visible precedence.** Theme and language exist as a device
  setting (theme in localStorage `utils_theme_device`, language in the
  `NEXT_LOCALE` cookie) and, optionally, as an account setting. An explicitly
  saved account value wins; an unset one falls through to the device value and
  then to the system default. The header `ThemeToggle` and `LanguageSwitcher`
  stay device-scoped and keep working anonymously; they do not write to the
  account. When an account preference overrides the layer the header just
  changed, the control says so in a status line naming the active value instead
  of silently doing nothing, and points at `#preferences`.
- **Preferences section** (`#preferences`) is an account-centre card using the
  batch A Card/Label pattern plus the registered `ui/select` primitive (its first
  use in this project). Its trigger sizes itself with
  `data-[size=default]:h-8`, which outranks a plain height class, so the trigger
  carries `h-11!` to reach the §5.10 40px target; one
  select per setting, each including an explicit follow-device choice that stores
  nothing. Choices are theme
  device / system / light / dark and language
  device default / English / Simplified Chinese. Saving follows the batch A profile
  contract — compare
  against the server-confirmed value, show Save/Cancel only for a real change,
  block duplicate submits, and keep saving/saved/failed feedback inside the card.
  An external save is adopted while nothing is pending locally, and a local edit
  survives an external save; the comparison is against the last confirmed value so
  an incoming save is not mistaken for a local edit.
  Nothing is uploaded on first login, and applying an account value never
  rewrites the device value.
- **Language changes reload the document** because messages are server-rendered,
  so any control that changes language first checks for unsaved form edits and
  confirms through the registered AlertDialog pattern (same shape as the account
  menu's logout confirm). Theme changes apply live and need no confirm. No
  password, OTP or form secret is persisted to make a reload survivable.
- **Signing out restores independent device settings**: the account layer drops
  out of resolution and the applied theme returns to the device value, so one
  account's preference cannot leak into the next identity or into anonymous use.
  Other tabs re-resolve through the existing account event.
- **Personal usage card** is a collapsed-by-default, lazily loaded card in the
  account centre — not part of identity loading and not in the header menu. It
  reads only the personal read-only usage wrapper and renders used/limit/remaining
  for the current UTC day, the reset instant formatted in the browser's own time
  zone with the zone name shown, and one of the four existing
  `chat.availability_*` states. AI being switched off reads as unavailable, never
  as an exhausted quota, and no token or cost figure is estimated or implied — the
  card repeats the existing request-count scope note. Its failure shows a retry
  inside the card only; identity, profile, security and public reading keep
  working. Reuse `chat.quotaSummary` / `quotaReset` / `quotaScope` wording rather
  than inventing a second vocabulary for the same numbers.
- No new dependency, base component or color token is introduced.

### 5.12 Personal data export — C2 approved 2026-10-14

- Register the export as a collapsed-by-default card in the account centre, after
  the usage card, reusing the batch A Collapsible disclosure: the trigger names the
  action, opening focuses the first control, and every result stays inside the
  panel. It adds a `#export` anchor to the summary navigation. No new base
  component, dialog or route is introduced.
- The card reads a scale summary first and shows what is about to be exported —
  conversation, message and usage-record counts plus the account's oldest and newest
  activity — before offering any download. Download controls are plain same-origin
  links to the export endpoint with `format=json` or `format=markdown`; the browser
  handles the attachment, so exported text never enters localStorage, sessionStorage,
  a cookie or the URL.
- Scope controls are a format pair and optional narrowing (one conversation, or a
  date range). Narrowing is offered, not hidden, when the summary reports the
  request exceeds the single-response limits, and the wording states the scope of
  what each link produces. A partial export is labelled partial in both the card and
  the file; the interface never presents a segment as the whole account.
- States: loading summary, summary unavailable with manual retry, re-verification
  required with the existing in-place entry, within limits, over limits, empty
  (no conversations yet — profile export is still offered and explained), and
  download unavailable. Failure text says the export changed nothing. There is no
  progress promise, polling or background job in this release.
- Confirm nothing destructive: export is read-only, so no AlertDialog is registered
  for it, and no copy may imply deletion, revocation or a shareable link.
- Both locales, light and dark, and 360/768/1280px apply; long conversation titles
  and file names wrap or truncate with CSS rather than forcing horizontal
  overflow, and every control keeps the §5.10 40px target.

### 5.13 Secure email change — C1 approved 2026-10-14

- The flow is a collapsed-by-default card in the account centre, on the batch A
  Collapsible disclosure pattern, with an `#email` anchor added to the summary
  navigation. It reuses the registered `PasswordField`, `Alert`, `Badge`, `Button`,
  `Field`/`Input` and the same Turnstile `Challenge` the auth forms use — that
  component was lifted out of `account-form.tsx` into `challenge.tsx` so both surfaces
  share one implementation rather than a copy. No new dependency or token.
- `Challenge` loads the api.js tag with `strategy="afterInteractive"` and derives
  readiness from the presence of `window.turnstile`, not only from the script
  callback: the default `lazy` strategy waits for the node to enter the viewport, so a
  widget mounted inside a collapsed card below the fold would sit on "loading"
  forever. If the API never appears within ~10s the component reports the existing
  script-error state with its retry button instead of hanging.
- The card is a small state machine, one visible state at a time, and every state says
  what happens next: closed, idle (current password + new address + challenge),
  pending (masked target, expiry countdown, per-slot attempt counts, two code fields,
  resend with a cooldown, cancel), committing, done, plus the failure states below. A
  page reload restores `pending` from the account's live transaction; a transaction
  opened for an address the account no longer signs in with is not offered at all.
- **Two codes, two fields.** The pending panel asks for the code sent to the current
  address and the one sent to the target side by side (stacked at narrow widths), and
  says so in the field labels, because the change needs both mailboxes and neither
  code substitutes for the other. The panel carries its own `Challenge`: a new code
  requires a fresh challenge, exactly like the reset flow's resend, so the resend
  buttons are disabled until one is issued. The client cooldown matches the server's
  one-send-per-address-per-minute bucket rather than inviting a refused attempt.
- Old-mailbox access is never the only proof, and never an optional one: the form asks
  for the current password and the card states plainly that an account which cannot
  receive at its old address cannot be self-served here, with no dead-end affordance
  that pretends otherwise.
- Stale-login and signed-out states reuse the batch A distinction, with the in-place
  re-verification entry pointing back at `#email`. A wrong password, a wrong code, an
  exhausted attempt budget, a rate limit, an expired or cancelled transaction, a
  target that turned out to be unusable and an unconfirmed AI stop each get their own
  wording — and none of them may claim the address changed.
- After a successful commit the result is a page-level state, not a card state:
  committing revokes every session, so the signed-in page is replaced by a notice
  naming the new address, explaining that all sessions were signed out and offering
  that login as the only next step. A different login clears it.
- A post-commit notice failure is reported as "the change is already applied; the
  notification could not be sent", never as a failed change, and never re-submits.
- Cancelling a pending transaction and the sign-out implied by committing both confirm
  through the registered AlertDialog pattern, with a "Back" dismiss action — not the
  generic "Back to the site" navigation label. Both locales, both themes,
  360/768/1280px, keyboard operation and the §5.10 40px target apply. The trigger's
  masked-address badge wraps to its own line when it cannot share the label row, so
  neither it nor the countdown can force horizontal overflow.

### 5.14 Security activity card — approved 2026-10-14

- Register it as a collapsed-by-default card in the account centre on the batch A
  Collapsible disclosure pattern, with an `#activity` anchor added to the summary
  navigation, placed after the sessions card because it explains what happened to
  those sessions rather than what is live now. It reuses `Card`, `Collapsible`,
  `Badge`, `Button`, `Alert` and `Skeleton`; no new dependency, primitive or token.
- The card is read-only and loads lazily on first expand, on the batch B usage-card
  shape: a trigger that carries no private content, a skeleton while fetching, a
  failure alert with an explicit retry that re-reads rather than replaying anything,
  and a `reauth_required` alert pointing at the in-place re-verification entry,
  because this is a gated security read.
- Every row is one confirmed event: a verb-first label naming the operation, the local
  date and time with the browser's own time-zone label, and the coarse inferred
  device (`Chrome · Windows`) in the same words the session list already uses. Single
  and batch revocation read differently and the batch row states the number of
  sessions that actually went away, so the two can never be confused.
- The empty state is a real state and must stay honest: "no recorded activity yet",
  plus one line saying that operations performed before this record existed are not
  shown. Never imply that an empty list means an untouched account, and never derive
  rows from the current session list.
- Two standing notes belong in the card, not in a tooltip: what is deliberately not
  recorded (no IP or location, no device identifier, no address, no codes), and the
  retention window with its exact length, so a missing old entry is explained instead
  of looking like a deletion by someone else.
- Copy must not overstate the guarantee. Say "confirmed changes to your account" and
  "sign-in sessions", not "security log", "audit trail" or "protected".
- Both locales, both themes, 360/768/1280px, keyboard operation and the §5.10 40px
  target apply; long masked addresses and device labels must wrap rather than force
  horizontal overflow.

### 5.15 Two-factor authentication — TOTP approved 2026-10-14

- The **sign-in challenge is a step of the existing login form, not a new route**.
  `safeReturnTo` allowlists the destinations a login may return to, and adding a
  `/two-factor` page would mean widening that list for no benefit; the form already
  owns a multi-step shape from the reset flow. When sign-in answers `twoFactorRequired`
  the form swaps to the challenge step in place — the credentials are never re-asked,
  and the step states plainly that no session exists until the code is accepted.
- The challenge step offers exactly two ways in — an authenticator code and a recovery
  code — as separate labelled inputs, because they are different credentials with
  different consequences (one is reusable, the other is spent). No "trust this device"
  control exists anywhere in the product, and the copy says the challenge must be
  completed on every sign-in.
- Six-digit code inputs reuse the registered `Field`/`Input` with
  `inputMode="numeric"`, `autoComplete="one-time-code"` and `maxLength={6}`; the
  recovery-code input takes the `xxxxx-xxxxx` form instead and must not inherit the
  numeric constraints. A visible countdown mirrors the server's 600-second window and,
  when it lapses, says the sign-in must be restarted rather than pretending a retry of
  the same code can work.
- Enrolment, recovery-code regeneration and disabling live in one collapsed-by-default
  account-centre card on the batch A disclosure pattern, with a `#two-factor` anchor in
  the summary navigation, placed with the other security sections. It reuses `Card`,
  `Collapsible`, `Alert`, `Badge`, `Button`, `Field`, `PasswordField`, `Input`,
  `Textarea` and the registered AlertDialog; **no new dependency, primitive or token**.
- Enrolment is shown as an explicit two-step sequence with the second step gated: the
  secret and the recovery codes are revealed first and the "enabled" action stays
  unavailable until the user confirms they have stored the codes, because they are
  shown once and cannot be recovered afterwards. That confirmation is a `Button` with
  `aria-pressed` rather than a checkbox, so the row keeps the §5.10 40px target and the
  sentence is the control's own accessible name. Until the code is confirmed the card
  must say the second factor is **not yet on** — an abandoned enrolment is not
  protection.
- **No QR code is offered.** Rendering one would need a new dependency, so the card
  shows the setup key for manual entry in an authenticator app and says so, rather than
  implying a scanner is supported. The key is a wrapping, selectable `Textarea` with its
  own copy control, never a single-line field: a 52-character secret has to be readable
  in full at 360px, because reading it is the only way to enter it. This is a known
  functional limitation of the card, not an omission to discover later.
- Factor material is held in component state only, for the lifetime of that one
  expanded step: the secret, the provisioning URI and the plaintext recovery codes
  never enter localStorage or sessionStorage, a URL, a query string, a toast, an error
  message or a rendered status line. They are cleared when the step is closed, when
  enrolment completes or fails, and when the account identity changes. The status view
  reports only whether 2FA is on and how many recovery codes remain.
- Recovery codes are presented as a list the user is told to save themselves, with a
  copy-all control and an explicit statement that the server cannot resend them; each
  regeneration replaces the set and invalidates the previous one, which the confirm
  dialog says before acting.
- Disabling and regenerating both confirm through the AlertDialog pattern and both ask
  for the current password **and** a live second factor, so the dialog explains that a
  code from the authenticator or one unused recovery code is required.
- The irreversible consequence is stated before enrolment completes, not after: losing
  the device and every recovery code means self-service cannot restore access, and
  there is no support bypass. The card says this in one plain sentence rather than
  burying it in help text.
- Failure copy stays distinct per cause and never implies the factor was turned off or
  that a session exists: wrong code, spent challenge, expired challenge, exhausted
  attempt budget, account-level temporary lock, already-enabled, and a rejected
  password each read differently. A wrong code at the challenge must not fall back to
  "check your email and password". The plugin's own three-per-ten-seconds cap on its
  routes is reported as **too many attempts**, never as a wrong code — telling someone
  their authenticator is wrong when the answer is to wait sends them back to guessing.
- Enabling, disabling and regenerating all broadcast the cross-tab `security` event, so
  no window keeps showing a signed-in page for an identity the server just revoked.
  Confirming and disabling also end *this* window's session, so their result is a
  page-level notice in the §5.13 shape — the card that raised it no longer has the
  identity it was describing, and "your login has expired" would misreport a change the
  user just made on purpose.
- The challenge step replaces the credential form in place, so the login form's "you are
  already signed in" banner is suppressed while it is open: another window's live
  session is not this request's business, and showing both reads as a contradiction. The
  challenge copy therefore speaks about **this request** granting no access, not about
  the browser having no session.
- Both locales, both themes, 360/768/1280px, keyboard operation, focus return and the
  §5.10 40px target apply. Long recovery codes and masked values wrap rather than
  forcing horizontal overflow.

### 5.16 Passkeys — approved 2026-10-15

- Passkeys are managed in one collapsed-by-default account-centre card on the batch A
  disclosure pattern, with a `#passkeys` anchor in the summary navigation placed next to
  the other security sections, and the sign-in affordance is a button **below** the
  existing password form on `/login` — never a replacement for it and never competing
  with it for the primary action. It reuses `Card`, `Collapsible`, `Alert`, `Badge`,
  `Button`, `Field`, `PasswordField`, `Input` and the registered AlertDialog; **no new UI
  dependency, primitive or token**, and no client-side authentication library: the
  ceremony calls `navigator.credentials` directly and only converts between base64url and
  `ArrayBuffer`.
- The browser is asked for the ceremony **only** from an explicit user action, and every
  outcome has its own state, because WebAuthn fails in several unrelated ways that look
  identical if one message is reused: no `navigator.credentials` at all (unsupported
  browser — the card explains that passkeys need a current browser and offers nothing
  else), a non-secure context (the page says the address is why rather than blaming the
  browser), the user dismissing the dialog (`NotAllowedError`) — which is reported as
  **cancelled**, with no retry loop and no error styling, because dismissing is a normal
  choice — a device with no enrollable authenticator, and a server-side refusal, which
  keeps its own per-cause copy.
- A passkey is named by the person using it, at the moment of registration, in a normal
  labelled field with a length cap and a suggested default, because a credential the user
  cannot tell apart from their other credentials cannot be safely removed later. The list
  shows the chosen name, a best-effort provider label derived server-side from the
  authenticator's AAGUID (shown as "unrecognised authenticator" when the AAGUID is the
  all-zero privacy value, which Apple and others report — never as a guess), the creation
  date in the browser's own zone with the zone named, and whether the credential is
  **synced** to the account's other devices or held on this one alone, because that
  changes what losing the device means. No public key, credential id or AAGUID is
  rendered.
- Removal is per-row, names the exact credential in the confirm dialog, and requires the
  current password (plus a live second factor when two-factor is on) like every other
  security mutation. The dialog states plainly that signing in with the password still
  works afterwards, because on this site a password credential always exists — that
  sentence is the removal safety story, and it must not be softened into "you can always
  recover this".
- The sign-in button is present on the login form even when the account has no passkey,
  because the server cannot know which credential the browser holds; when there is
  nothing to assert it reads **no passkey is available for this browser**, not "wrong".
  A completed passkey sign-in is an ordinary session: the same private-resource rules and
  the same sensitive-operation freshness apply, and the UI shows no different badge for
  it.
- Nothing about a passkey is persisted by the browser on this site's behalf: the challenge
  lives in a server-side row addressed by an HttpOnly signed cookie, so no credential,
  challenge, public key or credential id is written to localStorage, sessionStorage, a
  cookie the page can read, a URL, a toast or an error message. The in-flight ceremony
  object exists only in component state and is dropped when the step is closed.
- Failure copy stays distinct per cause and never implies a password problem:
  cancelled, expired challenge, challenge already used, unverified ceremony, unrecognised
  credential, duplicate credential, credential limit reached, and a rejected password each
  read differently. A failed passkey sign-in always leaves the password form usable and
  never reports the account as locked.
- Both locales, both themes, 360/768/1280px, keyboard operation, focus return and the
  §5.10 40px target apply. Credential names are user text and wrap rather than forcing
  horizontal overflow.
- Passkey and deletion step-up fields accept either a six-digit authenticator code or
  an eleven-character unused recovery code, with the existing factor hint beside the
  field. Initial security-card reads run once per opening attempt: loading, failure and
  reauthentication are terminal until the user chooses a recovery action, never retry loops.

### 5.17 Account deletion — approved 2026-10-15

- One account-centre card, last in the security group, with a `#deletion` anchor in the
  summary navigation. Collapsed by default like the other security cards, because its
  first line is a question, not an action. It reuses `Card`, `Collapsible`, `Alert`,
  `Button`, `PasswordField`, the registered `AlertDialog` and the existing factor-code
  field; **no new UI primitive, token or dependency**, and the destructive action uses the
  registered `destructive` button variant rather than a bespoke red.
- **The export comes first, inside the card.** The pending state renders the export entry
  point, whether a full export was generated since the request, and an explicit refresh
  action after a download. Large accounts can save the existing scoped segments. As
  approved during the 2026-10-15 review fixes, the final dialog also offers an initially
  unselected acknowledgement that the person is proceeding without a complete export.
  It reuses the recovery-code card's labelled, 40px `Button` toggle with `aria-pressed`;
  no new primitive. Without a full export or this explicit acknowledgement, final
  submission is disabled. This choice lives only in the open dialog and resets on close.
- Three states, each rendered distinctly, and no fourth: **none** (the request form with the
  impact statement), **pending** (the date the final step unlocks, the date the request
  lapses, the export precondition, and a withdraw action), and **refused** (a distinct
  message per cause). There is deliberately no "scheduled", "processing" or "deleted later"
  state: nothing happens to the data until the final ceremony completes, and the copy says
  so.
- The impact statement is written as a list of outcomes, not a warning banner: what is
  removed (identity, logins, credentials, every conversation and message, usage history,
  preferences, security record), what is anonymized rather than deleted (mail metadata, so
  the site's own budget accounting stays honest), what is kept (shared book source versions,
  other people's data, and **existing backups, which this feature never prunes**). Saying
  "your data is gone everywhere right now" would be false, so the copy does not say it.
- Requesting needs the current password and a live second factor when one is enabled. The
  final step is an `AlertDialog` that additionally needs the same proof **again** and a
  typed confirmation matching the account's own email address: an irreversible action gets
  a physical cost, and the typed value is compared server-side, never trusted from the
  client. The dialog's title names the account being deleted so a shared browser cannot be
  confused about which identity is meant.
- Focus discipline: opening the confirmation moves focus to its first field, Escape and the
  cancel button return focus to the control that opened it, the destructive button is not
  the default focus target, and the dialog cannot be dismissed by clicking outside it while
  a deletion is in flight.
- The deletion confirmation stays within `100dvh - 2rem` and scrolls vertically when its
  copy and fields exceed a short/mobile viewport. Both the acknowledgement and the final
  destructive action remain keyboard-reachable; wrapping never widens the viewport.
- On completion the client clears **its own** leftovers — the deleted account's chat session,
  model and draft keys and the pending-verification email in `sessionStorage` — then routes
  to the signed-out site with a neutral notice. It does not clear the device theme keys,
  which describe the browser rather than the account, and it never touches another account's
  id-namespaced keys. The notice holds no personal data: no email, no counts, no "goodbye".
- Failure copy stays distinct per cause and never implies the deletion happened or that it
  is pending when it is not: cooling-off not elapsed, request lapsed, export missing,
  wrong password, wrong or expired factor, another change in flight on this account, an
  active answer that could not be confirmed stopped, the last administrator, and a session
  too old to authorize this. A refusal leaves the account exactly as it was and says which
  of those it is.
- The card is a security surface, so it inherits the §5.10 rules: 40px minimum targets, both
  locales, both themes, 360/768/1280, keyboard-only operation of the whole request →
  withdraw and request → confirm paths, and no state, email or token written to
  localStorage, a URL or a toast.

### 5.18 Local browser-only tools — shared contract, owner approved 2026-10-16

The public utility tools that need no account, no server and no AI. Their binding
contract (also ARCHITECTURE §2): the input is read from state only, never sent
anywhere, never written to `localStorage`/`sessionStorage`/IndexedDB, never
serialized into a URL, and cleared by navigation. The page must say so in the
footnote. Because a locale switch reloads the document, a tool holding unsaved
text registers through `src/lib/unsaved.ts` so the language switcher confirms
before discarding it (§5.10 rules apply unchanged).

`/text-diff` compares two pasted texts in the browser. Engine: `src/lib/tools/diff.ts`.

- **Layout.** Two labelled `Textarea` panes (§3.2 mono), side-by-side on desktop
  and stacked below `md`, each with its own copy and a shared swap, example and
  clear-all toolbar. Results stay on the page while inputs change; nothing opens
  in a dialog.
- **Comparison options.** `Switch` controls for ignore case and ignore trailing
  whitespace. They only change the comparison keys; the rendered text is always
  what the user typed, and the options never rewrite an input. Leading whitespace
  and line-ending style are deliberately significant.
- **Rows.** A contiguous difference is one hunk; inside a hunk, deletes and inserts
  pair up line by line into `change` rows. `equal` runs longer than the context
  (3 lines) collapse into one gap row that states the hidden line count — the same
  bound the copy control uses, so what is shown and what is copied agree.
- **Inline marks.** Inside a `change` row, the differing words are marked. Han,
  Hiragana, Katakana and Hangul are single-character tokens (they are not
  space-separated); an emoji sequence stays one token, so a surrogate pair can
  never be split. A pair too large to align inline marks the whole line instead.
- **Line endings.** `CRLF`, `CR` and a missing final newline are differences and
  are labelled in the row (a text-only diff would otherwise show a change the
  reader cannot see). The ending-only case gets its own wording and no inline marks.
- **Views.** `Tabs` for side-by-side and unified; in side-by-side mode a narrow
  column stacks each pair vertically rather than squeezing both columns. Previous/
  next buttons step through rendered hunks with a visible focus ring on the target
  row, and the count states "difference n of m".
- **Touch targets.** shadcn's horizontal `TabsList` is pinned to 32px, which leaves
  25px triggers, and the `Switch` pill is 18px tall — both under §9. The view tabs are
  raised by overriding the same `group-data-horizontal/tabs:` variant (41px triggers),
  and each switch gets `after:-inset-y-3` so its hit area is 42×56 while the pill keeps
  its shape. Verified by measured rects plus a hit test 10px outside the pill.
- **Status, not colour.** Added and removed rows always carry `+`/`−` markers and
  line numbers; the tint (`bg-success/10`, `bg-destructive/10`) and, inline,
  strikethrough versus underline, are secondary (§9).
- **Safety.** Lines render as React text children. No HTML, `dangerouslySetInnerHTML`,
  or markdown rendering of user content, in either direction.
- **Bounds.** `limits` in the engine (100 000 characters or 20 000 lines per pane,
  2 000 rendered rows) is the explicit answer to oversized input: the tool states
  the limit and refuses to compare rather than offering a cancellable computation.
  A range that exceeds the alignment budget degrades to one coarse block and says
  so. Typing uses `useDeferredValue`, so the panes keep responding while a large
  comparison is recomputed.

### 5.19 QR Studio — `/qr-studio`, owner approved 2026-10-16

Second browser-only public tool (§5.18 contract applies unchanged: no upload, no
storage, nothing in the URL, no AI). Engine `src/lib/tools/qr.ts`; the dependency is
registered in §12.

- **Three content kinds** as `Tabs`: text, link and Wi-Fi. A link is only encoded —
  the page never navigates to, requests or validates it. Wi-Fi carries network name,
  password, security (WPA2/WPA3, WEP, open) and a hidden-network switch; the `WIFI:`
  payload escapes `\ ; : , "` in the name and password, and an open network omits the
  password field while a visible network omits `H:`.
- **Settings.** Error correction (L/M/Q/H with the recovery share in the label), export
  size (256/512/1024 px), quiet zone (4/6/8 modules) and two colours. The default is
  black on white with a four-module quiet zone, which is what a camera reads best; the
  quiet zone is floored at four in code, not just in the control.
- **Colour fields.** Native `<input type="color">` at `size-10` with the hex value shown
  beside it in mono, plus swap and "black on white" affordances. No hex text box: the
  picker and the two buttons cover every reachable value without a second source of
  truth. These hexes are image content, not UI styling, so they are deliberately outside
  the token system — the preview keeps its own light background in the dark theme.
- **Failure states are never stale.** The preview is derived from the current input, so
  an over-long payload, an empty field or a missing network name replaces it with the
  reason; nothing previously rendered survives. A low-contrast palette keeps the code
  visible (it is valid) and states the measured ratio against the 3:1 floor.
- **Exports.** PNG is drawn on a canvas at the exact requested edge with a whole-pixel
  module size centred in the box; SVG is built from the same layout and contains only
  `<rect>` geometry and two validated colours — no script, no style, no external
  reference, and no user text at all. Both files are named `qr-code.png` / `qr-code.svg`
  so a download never carries the content in its name.
- **Secrecy.** The encoded payload is never rendered as text, so a Wi-Fi password cannot
  leak into a screenshot, the DOM or a log; it also never reaches a URL or storage. The
  password row reuses `auth/password-field` (masked, with the show/hide toggle and the
  Caps Lock hint) rather than adding a second control.

### 5.20 JSON Formatter — `/json-formatter`, owner approved 2026-10-16

Third browser-only public tool (§5.18 contract applies unchanged). Engine
`src/lib/tools/json.ts`; **no new dependency** — the parser is written here because
`JSON.parse`/`JSON.stringify` cannot meet the two hard rules below (PLANNING §15.7).

- **Layout.** Input `Textarea` and a read-only output `Textarea` stacked on mobile,
  one above the other, and a status line for each side. Toolbar: example, clear, the
  Formatted/Minified buttons in a labelled group (`aria-pressed`) and the indent
  `Select` (2 spaces, 4 spaces, Tab), which is
  disabled while Minified is chosen. Copy and Download sit under the output, where they
  belong.
- **Nothing is silently changed.** Numbers, strings and keys are printed from their own
  source text, so `123456789012345678901234567890`, `1.50`, `1e2`, `-0` and `"say \"hi\""`
  survive both formatting and minification, and object keys keep their document order.
  A key that repeats is an error naming the key and both positions, never a last-write-wins.
- **Validation is live and located.** The reason is a sentence, not an engine string, and
  it carries line and column plus the offending source line with a caret under the column
  (long lines are centred on it). Empty input, an invalid document and a valid one each get
  their own message. The output is derived from the current input, so a document that stops
  parsing removes the previous result instead of leaving it on screen.
- **Bounds.** Above 2 000 000 characters or 200 nesting levels the tool refuses with the
  limit named. Pretty output is measured before allocation and refused above 8 000 000
  characters; minification remains available for a document whose indentation would
  exceed that bound. The check runs on a deferred value.
- **Review correction, 2026-10-17:** output mode is a choice, so use the registered
  Button with `aria-pressed` rather than tabs that name missing panels. QR content
  tabs must own their real `TabsContent` panels. The light destructive token is
  darkened slightly to pass 4.5:1 on white alert surfaces (the earlier value measured
  4.49:1); dark-theme and destructive-foreground tokens stay unchanged.
- **Text only.** Input and output are `Textarea` values, so a document containing markup is
  never interpreted; the download is named `formatted.json` so no key can leak through a
  file name.

### 5.21 Unit Converter — `/unit-converter`, owner approved 2026-10-17

Fourth browser-only public tool (§5.18 contract applies unchanged). Engine
`src/lib/tools/units.ts`; **no new dependency** — the table and the arithmetic live here so
every definition stays checkable (PLANNING §15.8).

- **Categories.** Length, area, volume, mass, temperature, speed and time, each with its
  common metric and imperial/US-customary units. A unit whose size depends on tradition —
  cup, tablespoon, teaspoon, month — is left out rather than guessed. Where US and
  Imperial differ (gallon, quart, pint, fluid ounce, ton), both are listed and the system
  is part of both the name and the symbol. Currency is out of scope: a rate needs a live
  source and this page has no server.
- **One dimension at a time.** The category is a `Select`; both unit `Select`s are built
  from `unitsIn(category)`, so a mixed-dimension pair cannot be reached, and switching
  category resets source and target to that category's own defaults. `convert` still
  refuses a mismatch: the engine's contract does not depend on the UI being well behaved.
- **One base unit per category** — metre, square metre, litre, kilogram, kelvin, metre per
  second, second. Area, volume and speed factors are *derived* from the length and time
  tables (factor², factor³, length ÷ time) instead of being typed in again, so the
  square-cube relation is arithmetic a test can check rather than a remembered number.
- **Temperature is affine.** Its scales differ by an offset as well as a gradient, so they
  are stored as integer slope and intercept on 900 × kelvin and applied to the exact
  decimal that was typed, using BigInt until the final double result. `32 °F` is then
  `0 °C`, not `5.68e-14 °C` — the obvious
  `(°F + 459.67) × 5/9` double path does fail that. `convert` returns no factor for a
  temperature pair, and the relationship panel says so instead of inventing a multiplier.
- **Display precision is separate from calculation.** `formatQuantity` rounds to
  `displayDigits` (12 significant digits) for the screen only; `Conversion.result` keeps
  the full double and the next step always uses that. This removes float tails
  (`28.316846592000005`) without hiding real digits, and no branch can render `NaN` or
  `Infinity`.
- **The value box is a number, not an expression.** `inputMode="decimal"` and one strict
  token: optional sign, digits, optional fraction, optional exponent. Thousands
  separators, a unit suffix, `1/2`, `NaN` and `Infinity` are refused with the offending
  text quoted back. Empty, invalid, overflow, underflow and below-absolute-zero each get
  their own message; the physical-range one names that scale's own floor.
- Numeric tokens are bounded to 4 096 characters. Compose linear scale factors
  before applying the value; a finite result must not be lost through an overflowing
  or underflowing intermediate. Omit the explanatory base chain when that intermediate
  cannot be displayed, while retaining the valid requested result.
- **Layout.** Category, value, source, target, swap and clear; the result is a read-only
  field with the target symbol beside it and Copy underneath; the conversion relationship
  — the through-the-base line, each unit's factor and exact definition, the temperature
  notice — sits below. The result is derived state, so an invalid value removes it rather
  than leaving a stale number. Symbolic one-liners use `font-mono`; the two sentences
  ("no single multiplier", "same unit on both sides") do not. Choosing the same unit twice
  is a valid state, not an error: the factor line is replaced by that statement instead of
  rendering `1 gal (US) = 1 gal (US)`.
- **Select popups are touch targets too.** Radix renders the listbox in a portal outside
  `#main-content`, so a rect sweep of the page body misses it: every `SelectItem` here
  carries `min-h-10`, because the volume list has 13 entries and the registry default is
  28px. Measured with the popup open on an emulated touch viewport.
- **Symbols are engine data, names are catalog data.** `in`, `gal (imp)` and `°F` are
  locale-neutral and live in `units.ts`; translated names are `unitConverter.unit.<id>`,
  so the unit id doubles as the message key (§10).

## 6. Motion

- Micro-interactions (hover, focus, press): CSS transitions, `150ms ease-out`.
- Enter/exit of overlays/popovers: `tw-animate-css` classes shipped with shadcn components (200–300ms) — do not customize.
- `motion` (Framer Motion) is allowed **only** on the home/marketing layer (subtle fades/stagger on first load).
- Respect `prefers-reduced-motion`: wrap any non-trivial animation in `motion-reduce:transition-none` / `motion-reduce:animate-none`.

---

## 7. Icons

- **Data source: Lucide, two renderers.** Static icons are plain `lucide-react` components. **State-transitioning icons** — a control whose icon changes between two states (theme toggle Sun↔Moon; future play/pause, open/close) — render through **`MorphIcon` from `morphicons/react`**, fed with node data from the vanilla `lucide` package (`import { Sun } from "lucide"`). Adopted 2026-10-07 (owner decision).
- Morphicons is an **animation layer** (spring-morphs between two shapes, 6.5 KB core), **not an icon set** — it never replaces the Lucide data source. Use `MorphIcon` **only** for genuine two-state transitions; rendering every static icon through it is churn. Reduced-motion is handled by the library itself (honors `prefers-reduced-motion`, per §6).
- Sizing: static icons `size-4` inline, `size-5` buttons/nav, `size-8`+ feature tiles; `MorphIcon` uses the `size={16}` prop (stroke width default 2, lucide-compatible).
- lucide-react v1 has no brand icons — brand marks are inline SVG in `src/components/icons/`.
- **lucide-react only** for static icons — no other icon packs, no emoji as UI icons (emoji allowed inside user-facing *content* strings).
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
- Hit targets ≥ 40×40px (`size-10`) for interactive elements on touch layouts. Note: shadcn 4.x buttons are compact by default (`h-8`, icon `size-8`) — on touch layouts use `size="lg"`/`size="icon-lg"` or explicit `size-10` classes to meet this rule.
- Status never conveyed by color alone — pair with icon/text.
- Semantic landmarks (`header/main/footer/nav`), one `h1` per page, logical heading order.

---

## 10. Copy & i18n

- Locales: **English (fallback/default) + 简体中文**, implemented with **next-intl** in cookie mode (adopted 2026-10-05, owner request). No URL prefixes — the locale resolves per request: `NEXT_LOCALE` cookie → visitor's `Accept-Language` (system language) → `en`.
- The header language switcher writes `NEXT_LOCALE` (path=/, 1 year) and reloads. `html[lang]` follows the active locale (`en` / `zh-CN`).
- **All user-visible strings live in `messages/en.json` and `messages/zh.json`** — never hardcoded in components (tool names/descriptions included, keyed by slug).
- Copy style: English = sentence case, verb-first buttons ≤ 3 words, no marketing fluff; Chinese = 简体中文, natural phrasing, no 翻译腔. CJK renders via system font fallback (PingFang / Microsoft YaHei / Noto Sans SC) — a dedicated CJK webfont is future polish, not a requirement.
- **Every UI change ships both locales in the same commit.** Adding a tool = adding both `tools.<slug>` entries.

---

## 11. Agent rules — anti-churn checklist

**DO**

- Use semantic token classes and the components/patterns defined here.
- Check both themes and mobile width before considering UI work done.
- Extend shadcn components through wrappers in `src/components/`.
- Add new tools by following the `ToolShell` template (§5.3).
- Record any new UI component/library in this file **before** installing it (§4.1 introduction flow) and keep the registry current.
- Keep this document — and AGENTS.md — updated when a decision genuinely changes (with rationale).

**DON'T**

- ❌ Introduce any additional styling system or component library (MUI, Mantine, styled-components, …) — or any new UI component/library not yet recorded in this document (§4.1 flow).
- ❌ Use raw color literals (`#7c3aed`, `text-teal-600`) or magic spacing/z-index values in components.
- ❌ Hand-roll dropdowns/dialogs/toasts/tabs/tables that `ui/` already covers.
- ❌ Add a second icon library or emoji-as-icon.
- ❌ Add animation libraries or one-off keyframes outside §6.
- ❌ Ship UI without dark-mode verification.
- ❌ Redesign "on the fly" — if a pattern feels wrong, propose a change to this file instead of deviating silently.

---

## 12. Dependency baseline (reviewed 2026-10-11)

Exact installed versions are in `package-lock.json`; later additions are registered above.

| Package | Version / note |
|---------|----------------|
| next | 16.3.8 (App Router, Turbopack, `output: "standalone"`) |
| react | 19.2.8 |
| tailwindcss | v4 (via `@tailwindcss/postcss`; tokens in `src/app/globals.css` — keep in sync with §3.1) |
| shadcn CLI | 4.21.1 — init with base `radix`, preset `nova`; primitives come from the unified `radix-ui` package, `cn` from the `cn` package. The `shadcn` npm package lives in **devDependencies** (build-time only: CLI + the `shadcn/tailwind.css` theme import); its transitive braces/fast-glob advisory (Dependabot #1) never reaches the production image |
| lucide-react | 1.52 (no brand icons — see §1) |
| morphicons | 1.7.1 — spring morph animations for state-transition icons (§7) |
| @anthropic-ai/claude-agent-sdk | 0.3.x — server-side Claude Code (chat agent); `serverExternalPackages` in next.config |
| lucide (vanilla, node data) | 1.52 — data source for MorphIcon |
| next-themes | 0.4.6 |
| react-markdown / remark-gfm | 10.1.0 / 4.0.1 — approved answer rendering (§5.6) |
| sonner | 2.0.8 |
| tw-animate-css | 1.4 |
| react-hook-form / zod / @hookform/resolvers | 7.89.0 / 4.6.5 / 5.9.1 — public account forms (§5.7), locked versions in package-lock |
| better-auth / better-sqlite3 | 1.7.7 / 13.0.3 — self-hosted accounts and owned chat (§5.7) |
| motion | not installed yet (marketing pages only) |
| qrcode-generator | 2.0.4 — MIT, **zero dependencies**, ships its own types. `/qr-studio` uses only its encoder to get the module matrix; the SVG and PNG are drawn by `src/lib/tools/qr.ts` so colours, shapes and quiet zone stay under this site's control. Registered here before installation (2026-10-16, PLANNING §15.5) |
| jsqr | 1.4.0 — Apache-2.0, **devDependency only**: it decodes the generated matrix, the exported SVG geometry and the exported PNG bytes during QA. Never imported by the application, never in the image |

Tooling: ESLint Next core-web-vitals and TypeScript flat config in
`eslint.config.mjs`. Prettier and its Tailwind plugin are not installed; preserve
existing formatting rather than assuming an enforced formatter.

---

## 13. References

- shadcn/ui docs (Tailwind v4, theming, components) — https://ui.shadcn.com
- Tailwind CSS v4 (CSS-first, oklch tokens) — https://tailwindcss.com
- tweakcn (shadcn theme editor — palette experiments land back here as token changes) — https://tweakcn.com
- lucide-react — https://lucide.dev
- next-themes — https://github.com/pacocoursey/next-themes
- React UI library landscape 2026 (decision context) — see docs/PLANNING.md §9
