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
- **Introduction flow (standing rule from the owner, 2026-10-04):** anything new to the UI layer — a component library, an icon set, a UI pattern family, or a shadcn component not yet in the registry below — is **written into this document first** (with a one-line rationale), then installed. The DESIGN.md change precedes the code usage and ships in the same commit. Within-stack additions update the registry below; out-of-stack additions go through the §1 decision table (and the rejected-alternatives list).
- **Adopted `ui/` component registry** — the source of truth for which base components exist/are approved. The set below was installed at M1 (2026-10-04); every later addition is appended here *before* it is installed:
  button · card · input · textarea · label · select · checkbox · switch · slider · dialog · alert-dialog · dropdown-menu · popover · sheet · tabs · tooltip · collapsible · badge · separator · skeleton · alert · table · sonner (toaster)

  **`form` is NOT in the adopted shadcn 4.x radix registry** (the CLI skipped it). Account forms use react-hook-form + zod with existing Input/Label primitives and accessible inline errors in project wrappers (§5.7/§5.9). Do not assume a `ui/form` component exists or add one merely to match outdated instructions.

### 4.2 Usage rules

- **Buttons**: `default` = primary action (one per view) · `secondary` = supporting actions · `outline` = actions on cards/neutral surfaces · `ghost` = icon buttons/toolbar actions · `destructive` = irreversible actions. Size `sm` in dense tool UIs; default elsewhere. All icon-only buttons need `aria-label` + a `Tooltip`.
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
