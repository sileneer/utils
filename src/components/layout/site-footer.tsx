import { GithubIcon } from "@/components/icons/github-icon";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row md:px-6 lg:px-8">
        <p>© {new Date().getFullYear()} Zihao Liu</p>
        <div className="flex items-center gap-4">
          <a
            className="transition-colors hover:text-foreground"
            href="https://lzhdev.com"
            target="_blank"
            rel="noreferrer"
          >
            lzhdev.com
          </a>
          <a
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            href="https://github.com/sileneer/utils"
            target="_blank"
            rel="noreferrer"
          >
            <GithubIcon className="size-3.5" />
            Open source (MIT)
          </a>
        </div>
      </div>
    </footer>
  );
}
