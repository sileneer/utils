import type { Metadata } from "next";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        About utils
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
        utils is a collection of self-hosted web utilities built and maintained
        by{" "}
        <a
          className="text-foreground underline-offset-4 hover:underline"
          href="https://lzhdev.com"
          target="_blank"
          rel="noreferrer"
        >
          Zihao Liu
        </a>
        . It exists for three reasons: everyday tools for personal use, simple
        apps for family, and an open-source starting point for anyone who wants
        to self-host their own toolbox.
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
        The next big milestone is the agent chat: a browser UI for talking to AI
        coding agents (like Claude Code) running on our own server, inside
        Docker — your conversations never depend on a third-party hosted
        frontend.
      </p>
      <ul className="space-y-2 text-sm">
        <li>
          <a
            className="text-primary underline-offset-4 hover:underline"
            href="https://github.com/sileneer/utils"
            target="_blank"
            rel="noreferrer"
          >
            GitHub repository
          </a>{" "}
          <span className="text-muted-foreground">— MIT licensed, PRs welcome.</span>
        </li>
        <li>
          <a
            className="text-primary underline-offset-4 hover:underline"
            href="https://lzhdev.com"
            target="_blank"
            rel="noreferrer"
          >
            lzhdev.com
          </a>{" "}
          <span className="text-muted-foreground">— the parent site.</span>
        </li>
      </ul>
    </div>
  );
}
