"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye as EyeNode, EyeOff as EyeOffNode } from "lucide";
import { MorphIcon } from "morphicons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Show/hide wrapper for password inputs: labeled toggle, MorphIcon state icon,
 * and a Caps Lock hint driven only by actual key events. Autocomplete, paste and
 * the existing password rules stay on the underlying input. */
export function PasswordField({ id, label, error, descriptionId, ...props }: Omit<React.ComponentProps<typeof Input>, "type"> & {
  id: string;
  label: string;
  error?: string;
  descriptionId?: string;
}) {
  const t = useTranslations("account");
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const readModifiers = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof event.getModifierState === "function") setCapsLock(event.getModifierState("CapsLock"));
  };
  const describedBy = [error ? `${id}-error` : descriptionId, capsLock ? `${id}-caps` : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          {...props}
          id={id}
          type={visible ? "text" : "password"}
          className="h-11 pr-12"
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          onKeyDown={(event) => { readModifiers(event); props.onKeyDown?.(event); }}
          onKeyUp={(event) => { readModifiers(event); props.onKeyUp?.(event); }}
          onBlur={(event) => { setCapsLock(false); props.onBlur?.(event); }}
        />
        <span className="absolute inset-y-0 right-1 flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10"
                aria-label={visible ? t("hidePassword") : t("showPassword")}
                aria-pressed={visible}
                onClick={() => setVisible((value) => !value)}
              >
                <MorphIcon icon={visible ? EyeOffNode : EyeNode} size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{visible ? t("hidePassword") : t("showPassword")}</TooltipContent>
          </Tooltip>
        </span>
      </div>
      {capsLock && <p id={`${id}-caps`} role="status" className="text-xs text-muted-foreground">{t("capsLockOn")}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
