"use client";

import React, { createContext, useContext } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { DashboardIconChip } from "@/components/dashboard";

type OverlayKind = "form" | "detail";

interface OverlayContextValue {
  desktop: boolean;
  kind: OverlayKind;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

function useOverlay() {
  const value = useContext(OverlayContext);
  if (!value) throw new Error("Responsive overlay parts must be used inside its Root.");
  return value;
}

interface RootProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function OverlayRoot({ kind, open, onOpenChange, children }: RootProps & { kind: OverlayKind }) {
  const desktop = useMediaQuery("(min-width: 768px)");
  const content = (
    <OverlayContext.Provider value={{ desktop, kind }}>{children}</OverlayContext.Provider>
  );

  if (!desktop) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        {content}
      </Drawer>
    );
  }
  if (kind === "detail") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        {content}
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {content}
    </Dialog>
  );
}

function FormRoot(props: RootProps) {
  return <OverlayRoot kind="form" {...props} />;
}

function DetailRoot(props: RootProps) {
  return <OverlayRoot kind="detail" {...props} />;
}

function Trigger({ children }: { children: React.ReactElement }) {
  const { desktop, kind } = useOverlay();
  if (!desktop) return <DrawerTrigger asChild>{children}</DrawerTrigger>;
  if (kind === "detail") return <SheetTrigger asChild>{children}</SheetTrigger>;
  return <DialogTrigger asChild>{children}</DialogTrigger>;
}

function Content({ className, children }: React.ComponentProps<"div">) {
  const { desktop, kind } = useOverlay();
  if (!desktop) {
    return (
      <DrawerContent
        className={cn(
          "max-h-[96dvh] overscroll-contain rounded-t-2xl p-0",
          className,
        )}
      >
        {children}
      </DrawerContent>
    );
  }
  if (kind === "detail") {
    return (
      <SheetContent className={cn("w-full gap-0 p-0 sm:max-w-md", className)}>
        {children}
      </SheetContent>
    );
  }
  return (
    <DialogContent
      className={cn(
        "max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0",
        className,
      )}
    >
      {children}
    </DialogContent>
  );
}

// Overlay headers lead with an icon in a quiet gray chip so every dialog opens
// with the same visual anchor. Pass `icon` from the call site; header text
// renders below it.
// Delegates to THE icon chip so overlays can't drift from the app-wide
// treatment (light gray wrapper, icon carries any color).
export function OverlayHeaderChip({ icon }: { icon: LucideIcon }) {
  return <DashboardIconChip icon={icon} size="lg" className="mb-3" />;
}

function HeaderChip({ icon }: { icon: LucideIcon }) {
  return <OverlayHeaderChip icon={icon} />;
}

function Header({
  icon,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { icon?: LucideIcon }) {
  const { desktop, kind } = useOverlay();
  const chip = icon ? <HeaderChip icon={icon} /> : null;
  if (!desktop) {
    return (
      <DrawerHeader className={cn("px-5 pb-3 pt-5 text-left", className)} {...props}>
        {chip}
        {children}
      </DrawerHeader>
    );
  }
  if (kind === "detail") {
    return (
      <SheetHeader className={cn("border-b px-5 py-4", className)} {...props}>
        {chip}
        {children}
      </SheetHeader>
    );
  }
  return (
    <DialogHeader className={cn("px-6 pb-3 pt-6", className)} {...props}>
      {chip}
      {children}
    </DialogHeader>
  );
}

function Title(props: React.ComponentProps<"h2">) {
  const { desktop, kind } = useOverlay();
  if (!desktop) return <DrawerTitle {...props} />;
  if (kind === "detail") return <SheetTitle {...props} />;
  return <DialogTitle {...props} />;
}

function Description(props: React.ComponentProps<"p">) {
  const { desktop, kind } = useOverlay();
  if (!desktop) return <DrawerDescription {...props} />;
  if (kind === "detail") return <SheetDescription {...props} />;
  return <DialogDescription {...props} />;
}

function Body({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("min-h-0 overflow-y-auto overscroll-contain px-5 py-4 md:px-6", className)}
      {...props}
    />
  );
}

function Footer({ className, ...props }: React.ComponentProps<"div">) {
  const { desktop, kind } = useOverlay();
  if (!desktop) {
    return (
      <DrawerFooter
        className={cn(
          "border-t bg-muted/40 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4",
          className,
        )}
        {...props}
      />
    );
  }
  if (kind === "detail") {
    return <SheetFooter className={cn("border-t bg-muted/40 px-5 py-4", className)} {...props} />;
  }
  return <DialogFooter className={cn("border-t bg-muted/40 px-6 py-4", className)} {...props} />;
}

const sharedParts = { Trigger, Content, Header, Title, Description, Body, Footer };

export const ResponsiveFormOverlay = { Root: FormRoot, ...sharedParts };
export const ResponsiveDetailOverlay = { Root: DetailRoot, ...sharedParts };
