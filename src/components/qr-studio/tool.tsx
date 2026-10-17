"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeftRight,
  Download,
  QrCode,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { PasswordField } from "@/components/auth/password-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  contrastRatio,
  buildQr,
  luminance,
  minQuietZone,
  qrLayout,
  qrLimits,
  qrPayload,
  qrSvg,
  type QrEncryption,
  type QrEcc,
  type QrKind,
  type QrMatrix,
} from "@/lib/tools/qr";
import { markUnsaved } from "@/lib/unsaved";

const quietZones = [4, 6, 8];
const sizes = [256, 512, 1024];
const eccLevels = [
  { level: "L", percent: 7 },
  { level: "M", percent: 15 },
  { level: "Q", percent: 25 },
  { level: "H", percent: 30 },
] as const;
/** Below this WCAG ratio most phone cameras stop resolving the symbol. */
const lowContrastRatio = 3;

/** Horizontal runs, so a large symbol stays a few hundred nodes, not thousands. */
function runs(matrix: QrMatrix) {
  const out: { x: number; y: number; width: number }[] = [];
  for (let row = 0; row < matrix.size; row++) {
    let column = 0;
    while (column < matrix.size) {
      if (!matrix.cells[row][column]) {
        column++;
        continue;
      }
      let end = column;
      while (end + 1 < matrix.size && matrix.cells[row][end + 1]) end++;
      out.push({ x: column, y: row, width: end - column + 1 });
      column = end + 1;
    }
  }
  return out;
}

function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  // The object URL is opaque, so nothing derived from the input is exposed here.
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function QrStudioTool() {
  const t = useTranslations("qrStudio");
  const [kind, setKind] = useState<QrKind>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [encryption, setEncryption] = useState<QrEncryption>("wpa");
  const [hidden, setHidden] = useState(false);
  const [ecc, setEcc] = useState<QrEcc>("M");
  const [size, setSize] = useState<number>(512);
  const [quietZone, setQuietZone] = useState<number>(minQuietZone);
  const [dark, setDark] = useState("#000000");
  const [light, setLight] = useState("#ffffff");

  const payload = useMemo(
    () => qrPayload(kind, { text, url, wifi: { ssid, password, encryption, hidden } }),
    [kind, text, url, ssid, password, encryption, hidden],
  );
  // An SSID is mandatory: a WIFI: record without a network name scans as broken.
  const missing = kind === "wifi" ? ssid.trim() === "" : payload === "";
  const built = useMemo(
    () => (missing ? ({ ok: false, reason: "empty" } as const) : buildQr(payload, ecc)),
    [missing, payload, ecc],
  );

  const dirty = text !== "" || url !== "" || ssid !== "" || password !== "";
  // Switching locale reloads the document, so entered text needs confirming away.
  useEffect(() => {
    if (!dirty) return;
    return markUnsaved("qr-studio");
  }, [dirty]);

  const ratio = contrastRatio(dark, light);
  const darkLuminance = luminance(dark);
  const lightLuminance = luminance(light);
  const inverted =
    darkLuminance !== null && lightLuminance !== null && darkLuminance > lightLuminance;
  const lowContrast = ratio !== null && ratio < lowContrastRatio;

  const style = { size, quietZone, dark, light };

  async function download(format: "png" | "svg") {
    if (!built.ok) return;
    if (format === "svg") {
      saveBlob(new Blob([qrSvg(built.matrix, style)], { type: "image/svg+xml;charset=utf-8" }), "qr-code.svg");
      toast.success(t("savedSvg"));
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) {
      toast.error(t("exportFailed"));
      return;
    }
    const { scale, shift, quietZone: zone } = qrLayout(built.matrix, style);
    context.fillStyle = light;
    context.fillRect(0, 0, size, size);
    context.fillStyle = dark;
    for (const run of runs(built.matrix)) {
      context.fillRect(
        shift + (run.x + zone) * scale,
        shift + (run.y + zone) * scale,
        run.width * scale,
        scale,
      );
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) {
      toast.error(t("exportFailed"));
      return;
    }
    saveBlob(blob, "qr-code.png");
    toast.success(t("savedPng"));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("content")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs
              value={kind}
              onValueChange={(value) => setKind(value as QrKind)}
            >
              <TabsList aria-label={t("types")} className="h-12 flex-wrap group-data-horizontal/tabs:h-12">
                <TabsTrigger value="text" className="px-3">
                  {t("typeText")}
                </TabsTrigger>
                <TabsTrigger value="url" className="px-3">
                  {t("typeUrl")}
                </TabsTrigger>
                <TabsTrigger value="wifi" className="px-3">
                  {t("typeWifi")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="space-y-2">
                <Label htmlFor="qr-text">{t("typeText")}</Label>
                <Textarea
                  id="qr-text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={t("textPlaceholder")}
                  spellCheck={false}
                  className="max-h-64 min-h-24 overflow-y-auto font-mono text-sm"
                />
              </TabsContent>

              <TabsContent value="url" className="space-y-2">
                <Label htmlFor="qr-url">{t("typeUrl")}</Label>
                <Input
                  id="qr-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/page"
                  spellCheck={false}
                  autoComplete="off"
                  className="h-11 min-h-10 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">{t("urlNote")}</p>
              </TabsContent>

              <TabsContent value="wifi" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="qr-ssid">{t("ssid")}</Label>
                  <Input
                    id="qr-ssid"
                    value={ssid}
                    onChange={(event) => setSsid(event.target.value)}
                    maxLength={qrLimits.ssid}
                    autoComplete="off"
                    className="h-11 min-h-10"
                  />
                </div>
                {encryption !== "none" && (
                  <PasswordField
                    id="qr-password"
                    label={t("password")}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    maxLength={qrLimits.password}
                    autoComplete="off"
                  />
                )}
                <div className="space-y-2">
                  <Label htmlFor="qr-encryption">{t("encryption")}</Label>
                  <Select
                    value={encryption}
                    onValueChange={(value) => setEncryption(value as QrEncryption)}
                  >
                    <SelectTrigger id="qr-encryption" className="h-11! w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wpa">{t("encryptionWpa")}</SelectItem>
                      <SelectItem value="wep">{t("encryptionWep")}</SelectItem>
                      <SelectItem value="none">{t("encryptionNone")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-h-10 items-center gap-2">
                  <Switch
                    id="qr-hidden"
                    className="after:-inset-y-3"
                    checked={hidden}
                    onCheckedChange={setHidden}
                  />
                  <Label htmlFor="qr-hidden">{t("hiddenNetwork")}</Label>
                </div>
                <p className="text-xs text-muted-foreground">{t("wifiNote")}</p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("appearance")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="qr-ecc">{t("ecc")}</Label>
                <Select value={ecc} onValueChange={(value) => setEcc(value as QrEcc)}>
                  <SelectTrigger id="qr-ecc" className="h-11! w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {eccLevels.map((option) => (
                      <SelectItem key={option.level} value={option.level}>
                        {t("eccLevel", {
                          level: option.level,
                          percent: option.percent,
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="qr-size">{t("size")}</Label>
                <Select value={String(size)} onValueChange={(value) => setSize(Number(value))}>
                  <SelectTrigger id="qr-size" className="h-11! w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sizes.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {t("sizeValue", { size: option })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="qr-quiet">{t("quietZone")}</Label>
                <Select
                  value={String(quietZone)}
                  onValueChange={(value) => setQuietZone(Number(value))}
                >
                  <SelectTrigger id="qr-quiet" className="h-11! w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {quietZones.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {t("quietValue", { modules: option })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("eccNote")}</p>

            <div className="flex flex-wrap items-end gap-4">
              <ColorField id="qr-dark" label={t("foreground")} value={dark} onChange={setDark} />
              <ColorField id="qr-light" label={t("background")} value={light} onChange={setLight} />
              <Button
                variant="outline"
                className="min-h-10"
                onClick={() => {
                  setDark(light);
                  setLight(dark);
                }}
              >
                <ArrowLeftRight />
                {t("swapColors")}
              </Button>
              <Button
                variant="ghost"
                className="min-h-10"
                onClick={() => {
                  setDark("#000000");
                  setLight("#ffffff");
                }}
              >
                {t("resetColors")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="qr-preview" className="min-w-0 space-y-4 lg:sticky lg:top-20">
        <h2 id="qr-preview" className="text-lg font-semibold md:text-xl">
          {t("preview")}
        </h2>

        {built.ok ? (
          <div className="space-y-3">
            {lowContrast && (
              <Alert>
                <TriangleAlert />
                <AlertTitle>{t("lowContrast")}</AlertTitle>
                <AlertDescription>
                  {t("lowContrastBody", {
                    ratio: ratio === null ? "" : ratio.toFixed(2),
                    min: lowContrastRatio,
                  })}
                </AlertDescription>
              </Alert>
            )}
            {inverted && (
              <p className="text-xs text-muted-foreground">{t("invertedNote")}</p>
            )}
            <div className="rounded-xl border border-border/60 p-3">
              <Preview matrix={built.matrix} dark={dark} light={light} quietZone={quietZone} />
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {t("symbol", {
                version: built.matrix.version,
                modules: built.matrix.size,
                bytes: built.matrix.bytes,
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-10" onClick={() => download("png")}>
                <Download />
                {t("downloadPng")}
              </Button>
              <Button variant="outline" className="min-h-10" onClick={() => download("svg")}>
                <Download />
                {t("downloadSvg")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-10 text-center">
            <QrCode className="size-8 text-muted-foreground" aria-hidden />
            {built.reason === "tooLong" ? (
              <p className="max-w-sm text-sm">
                {t("tooLong", { max: qrLimits.bytes.toLocaleString() })}
              </p>
            ) : (
              <p className="max-w-sm text-sm text-muted-foreground">
                {kind === "wifi" && ssid.trim() === "" ? t("needSsid") : t("empty")}
              </p>
            )}
          </div>
        )}
      </section>

      <div className="lg:col-span-2">
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="min-h-10 px-0">
              {t("footnote")}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="max-w-2xl space-y-2 pt-2 text-sm text-muted-foreground">
            <p>{t("privacy")}</p>
            <p>{t("howItWorks")}</p>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

function Preview({
  matrix,
  dark,
  light,
  quietZone,
}: {
  matrix: QrMatrix;
  dark: string;
  light: string;
  quietZone: number;
}) {
  const t = useTranslations("qrStudio");
  const zone = Math.max(minQuietZone, quietZone);
  const side = matrix.size + zone * 2;
  const shapes = useMemo(
    () => runs(matrix).map((run) => ({ ...run, x: run.x + zone, y: run.y + zone })),
    [matrix, zone],
  );
  return (
    <svg
      viewBox={`0 0 ${side} ${side}`}
      role="img"
      aria-label={t("previewLabel")}
      shapeRendering="crispEdges"
      className="mx-auto h-auto w-full max-w-[260px]"
    >
      <rect width={side} height={side} fill={light} />
      {shapes.map((run) => (
        <rect
          key={run.y + ":" + run.x}
          x={run.x}
          y={run.y}
          width={run.width}
          height={1}
          fill={dark}
        />
      ))}
    </svg>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="size-10 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
        />
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
      </div>
    </div>
  );
}
