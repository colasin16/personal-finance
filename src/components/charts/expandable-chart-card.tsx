"use client";

import { useState, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Card whose content can be opened in a near-fullscreen dialog; `children` renders both the inline and the expanded view. */
export function ExpandableChartCard({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: (expanded: boolean) => ReactNode;
}) {
  const t = useTranslations("common.actions");
  const [open, setOpen] = useState(false);
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction className="flex gap-1">
          {actions}
          <Button size="icon-sm" variant="ghost" onClick={() => setOpen(true)} aria-label={t("fullView")} title={t("fullView")}>
            <Maximize2 />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>{children(false)}</CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[calc(100dvh-2rem)] flex-col sm:h-[calc(100dvh-4rem)] sm:max-w-[min(100rem,calc(100%-4rem))] sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg">{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col">{open && children(true)}</div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
