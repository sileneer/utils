"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { accountLink } from "@/lib/auth/navigation";
import { useAccount } from "./account-provider";
export function HomeAccount() {
  const { user, loading, failed, refresh } = useAccount();
  const t = useTranslations("account");
  return <section aria-label={t("sharedAccount")} className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border bg-card p-4">
    <div className="min-w-0 flex-1 basis-48">
      <h2 className="break-words text-sm font-medium">{user ? t("welcome", { name: user.name }) : t("sharedAccount")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("sharedDescription")}</p>
    </div>
    {loading && !user ? <Skeleton className="h-10 w-24" /> : failed && !user ? <Button className="min-h-10" variant="outline" onClick={() => void refresh()}>{t("retryAccount")}</Button> : user ? <Button className="min-h-10" variant="outline" asChild><Link href="/account">{t("center")}</Link></Button> : <div className="flex gap-2">
      <Button className="min-h-10" asChild><Link href={accountLink("login", "/")}>{t("login")}</Link></Button>
      <Button className="min-h-10" variant="outline" asChild><Link href={accountLink("register", "/")}>{t("register")}</Link></Button>
    </div>}
  </section>;
}
