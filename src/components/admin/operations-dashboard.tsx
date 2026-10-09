"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OperationsSnapshot, Samples } from "@/lib/admin/operations";
export function OperationsDashboard() {
    const t = useTranslations("operations"), locale = useLocale();
    const [hours, setHours] = useState<24 | 168>(24), [data, setData] = useState<OperationsSnapshot>(), [pending, setPending] = useState(true), [failed, setFailed] = useState(false);
    const current = useRef<AbortController>(null), epoch = useRef(0);
    const refresh = useCallback(async () => {
        const key = ++epoch.current;
        current.current?.abort();
        const controller = new AbortController();
        current.current = controller;
        const timer = setTimeout(() => controller.abort(), 5000);
        setPending(true);
        setFailed(false);
        try {
            const response = await fetch("/api/admin/operations?hours=" + hours, { cache: "no-store", signal: controller.signal });
            if (!response.ok)
                throw Error("operations_unavailable");
            const next: OperationsSnapshot = await response.json();
            if (key === epoch.current)
                setData(next);
        }
        catch {
            if (key === epoch.current)
                setFailed(true);
        }
        finally {
            clearTimeout(timer);
            if (key === epoch.current)
                setPending(false);
        }
    }, [hours]);
    const cancelRequest = useCallback(() => { epoch.current++; current.current?.abort(); }, []);
    useEffect(() => { const frame = requestAnimationFrame(() => void refresh()); return () => { cancelAnimationFrame(frame); cancelRequest(); }; }, [refresh, cancelRequest]);
    const selectPeriod = (value: 24 | 168) => { if (value === hours)
        return; cancelRequest(); setData(undefined); setPending(true); setFailed(false); setHours(value); };
    const number = (value: number) => new Intl.NumberFormat(locale).format(value);
    const time = (value?: number) => value === undefined ? t("unavailable") : new Date(value).toLocaleString(locale);
    const timing = (value: Samples) => (<div className="space-y-2 text-sm"><p>{t("median")}: {value.median === null ? t("unavailable") : t("milliseconds", { value: number(value.median) })}</p>
   <p>{t("p95")}: {value.p95 === null ? t("unavailable") : t("milliseconds", { value: number(value.p95) })}</p>
   <p className="text-xs text-muted-foreground">{t("samples", { count: number(value.count), missing: number(value.missing) })}</p></div>);
    return <div className="space-y-5">
  <div className="flex flex-wrap items-center gap-2">
   <Button className="h-10" variant={hours === 24 ? "secondary" : "outline"} aria-pressed={hours === 24} onClick={() => selectPeriod(24)}>{t("day")}</Button>
   <Button className="h-10" variant={hours === 168 ? "secondary" : "outline"} aria-pressed={hours === 168} onClick={() => selectPeriod(168)}>{t("week")}</Button>
   <Button className="h-10" variant="outline" disabled={pending} onClick={() => void refresh()}>{t(pending ? "loading" : "refresh")}</Button>
  </div>
  {failed && <p role="alert" className="text-sm text-destructive">{t("loadFailed")}</p>}
  {pending && !data ? <div className="grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-48"/>)}</div> : data && <>
   <p role="status" className="text-xs text-muted-foreground">{t("updated", { time: time(data.checkedAt) })}{failed && " · " + t("oldData")}</p>
   {data.truncated && <p className="text-sm text-destructive">{t("truncated")}</p>}
   <div className="grid gap-4 sm:grid-cols-2">
    <Card><CardHeader><CardTitle>{t("service")}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
     <Badge variant="secondary">{t(!data.service.enabled ? "disabled" : data.service.busy ? "busy" : "ready")}</Badge>
     <p>{t("limits", { user: number(data.service.userLimit), global: number(data.service.globalLimit) })}</p>
     <p className="text-xs text-muted-foreground">{t("serviceNote")}</p></CardContent></Card>
    <Card><CardHeader><CardTitle>{t("backup")}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
     <Badge variant={data.backup.state === "failed" || data.backup.state === "stale" ? "destructive" : "secondary"}>{t("backupState." + data.backup.state)}</Badge>
     <p>{t("lastSuccess")}: {time(data.backup.lastSuccessAt)}</p><p>{t("lastAttempt")}: {time(data.backup.lastAttemptAt)}</p>
     {data.backup.bytes !== undefined && <p>{t("backupBytes", { value: number(data.backup.bytes) })}</p>}
     <p className="text-xs text-muted-foreground">{t(data.backup.integrityVerified ? "integrityVerified" : "integrityUnknown")}</p>
     <p className="text-xs text-muted-foreground">{t("backupNote")}</p></CardContent></Card>
    <Card><CardHeader><CardTitle>{t("duration")}</CardTitle></CardHeader><CardContent>{timing(data.duration)}</CardContent></Card>
    <Card><CardHeader><CardTitle>{t("firstText")}</CardTitle></CardHeader><CardContent>{timing(data.firstText)}</CardContent></Card>
   </div>
   <Card><CardHeader><CardTitle>{t("attempts", { count: number(data.attempts) })}</CardTitle></CardHeader><CardContent>
    <Table><TableHeader><TableRow><TableHead>{t("outcome")}</TableHead><TableHead className="text-right">{t("count")}</TableHead></TableRow></TableHeader>
     <TableBody>{Object.entries(data.outcomes).map(([status, count]) => <TableRow key={status}><TableCell>{t("outcomes." + status)}</TableCell><TableCell className="text-right font-mono">{number(count)}</TableCell></TableRow>)}</TableBody></Table>
    <p className="mt-3 text-xs text-muted-foreground">{t("attemptNote")}</p></CardContent></Card>
   <Card><CardHeader><CardTitle>{t("tokens")}</CardTitle></CardHeader><CardContent className="space-y-3">
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">{(["input", "output", "cacheRead", "cacheWrite", "total"] as const).map(key => <div key={key}><dt className="text-muted-foreground">{t("tokenFields." + key)}</dt><dd className="mt-1 break-all font-mono">{key === "cacheRead" && !data.tokens.cacheReadSamples || key === "cacheWrite" && !data.tokens.cacheWriteSamples || !data.tokens.samples ? t("unavailable") : number(data.tokens[key])}</dd></div>)}</dl>
    <p className="text-xs text-muted-foreground">{t("samples", { count: number(data.tokens.samples), missing: number(data.tokens.missing) })}</p>
    <p className="text-xs text-muted-foreground">{t("cacheSamples", { read: number(data.tokens.cacheReadSamples), write: number(data.tokens.cacheWriteSamples) })}</p>
    <p className="text-xs text-muted-foreground">{t("tokenNote")}</p></CardContent></Card>
   <p className="text-xs text-muted-foreground">{t("statisticsNote")}</p>
  </>}
 </div>;
}
