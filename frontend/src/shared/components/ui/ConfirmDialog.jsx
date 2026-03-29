/**
 * Global confirmation dialog — replaces all native window.confirm() calls.
 *
 * Usage:
 *   const confirm = useConfirm();
 *   if (await confirm({ message: "Delete this?", confirmLabel: "Delete", variant: "destructive" })) {
 *     doDelete();
 *   }
 *
 * Mount <ConfirmDialog /> once in AppShell.
 */
import { create } from "zustand";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "./dialog";
import { Button } from "./button";
import { AlertTriangle } from "lucide-react";

// ── Store ──────────────────────────────────────────────────────────────────────

const useConfirmStore = create((set) => ({
  open: false,
  title: "Confirm",
  message: "",
  confirmLabel: "Confirm",
  variant: "default",   // "default" | "destructive"
  _resolve: null,

  show(opts) {
    return new Promise((resolve) => {
      set({
        open: true,
        title: opts.title ?? "Confirm",
        message: opts.message ?? "",
        confirmLabel: opts.confirmLabel ?? "Confirm",
        variant: opts.variant ?? "default",
        _resolve: resolve,
      });
    });
  },

  close(result) {
    set((s) => {
      s._resolve?.(result);
      return { open: false, _resolve: null };
    });
  },
}));

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useConfirm() {
  return useConfirmStore((s) => s.show);
}

// ── Modal component (mount once in AppShell) ───────────────────────────────────

export function ConfirmDialog() {
  const { open, title, message, confirmLabel, variant, close } =
    useConfirmStore();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close(false)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {variant === "destructive" && (
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            )}
            {title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-1">{message}</p>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            variant={variant}
            size="sm"
            onClick={() => close(true)}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
