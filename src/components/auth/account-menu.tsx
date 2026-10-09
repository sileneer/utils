"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Activity, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { accountLink, safeReturnTo } from "@/lib/auth/navigation";
import { accountAction, useAccount } from "./account-provider";

export function AccountMenu({ onlyAuthenticated = false }: { onlyAuthenticated?: boolean }) {
  const { user, loading, failed, refresh } = useAccount();
  const pathname = usePathname();
  const t = useTranslations("account");
  const menuTrigger = useRef<HTMLButtonElement | null>(null);
  const [destination, setDestination] = useState(pathname);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const target = () => safeReturnTo(window.location.pathname + window.location.search + window.location.hash);
  if (onlyAuthenticated && !user) return null;
  if (loading && !user) return <Skeleton className="size-10 rounded-md" />;
  async function logout() {
    setPending(true); setError("");
    try {
      await accountAction("/api/auth/sign-out", {});
      setConfirm(false);
      toast.success(t("loggedOut"));
    } catch { setError(t("securityFailed")); }
    finally { setPending(false); }
  }
  return <>
    <DropdownMenu onOpenChange={(open) => { if (open) setDestination(target()); }}>
      <Tooltip>
        <TooltipTrigger asChild><DropdownMenuTrigger asChild>
          <Button ref={menuTrigger} variant="ghost" size="icon" className="size-10 shrink-0" aria-label={t("accountMenu")}>
            {user ? <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">{Array.from(user.name.trim())[0]?.toUpperCase() || "U"}</span> : <UserRound />}
          </Button>
        </DropdownMenuTrigger></TooltipTrigger>
        <TooltipContent>{t("accountMenu")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)]">
        {user ? <>
          <DropdownMenuLabel className="max-w-64 break-words"><p>{user.name}</p><p className="text-xs font-normal text-muted-foreground">{user.email}</p></DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="min-h-10"><Link href="/account"><UserRound />{t("center")}</Link></DropdownMenuItem>
          {user.isAdmin && <DropdownMenuItem asChild className="min-h-10"><Link href="/admin"><Activity />{t("operations")}</Link></DropdownMenuItem>}
          <DropdownMenuItem className="min-h-10" onSelect={() => setConfirm(true)}><LogOut />{t("logout")}</DropdownMenuItem>
        </> : failed ? <DropdownMenuItem onSelect={() => void refresh()} className="min-h-10">{t("retryAccount")}</DropdownMenuItem> : <>
          <DropdownMenuLabel>{t("sharedAccount")}</DropdownMenuLabel>
          <DropdownMenuItem asChild className="min-h-10"><Link href={accountLink("login", destination)}>{t("login")}</Link></DropdownMenuItem>
          <DropdownMenuItem asChild className="min-h-10"><Link href={accountLink("register", destination)}>{t("register")}</Link></DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
    <AlertDialog open={confirm} onOpenChange={(open) => { if (!pending) { setConfirm(open); setError(""); } }}>
      <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); menuTrigger.current?.focus(); }}>
        <AlertDialogHeader><AlertDialogTitle>{t("logoutConfirm")}</AlertDialogTitle><AlertDialogDescription>{t("securityEffect")}</AlertDialogDescription></AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel className="min-h-10" disabled={pending}>{t("cancel")}</AlertDialogCancel><AlertDialogAction className="min-h-10" disabled={pending} onClick={(e) => { e.preventDefault(); void logout(); }}>{pending ? t("working") : t("logout")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
