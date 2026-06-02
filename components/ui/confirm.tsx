"use client";

// Promise-based confirmation dialog — a styled replacement for window.confirm().
//
// Mounted once (ConfirmProvider in the root layout); call sites use the
// useConfirm() hook:
//
//   const confirm = useConfirm();
//   if (!(await confirm({ title: "Delete?", description: "…", danger: true }))) return;
//
// Resolves true on confirm, false on cancel / dismiss. Backed by the shadcn
// AlertDialog so it matches the dark theme and is keyboard/focus accessible.

import {
    createContext,
    useCallback,
    useContext,
    useRef,
    useState,
    type ReactNode,
} from "react";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmOptions {
    title?: string;
    description?: ReactNode;
    confirmText?: string;
    cancelText?: string;
    /** Red destructive styling on the confirm button. */
    danger?: boolean;
}

type ConfirmFn = (opts?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const [opts, setOpts] = useState<ConfirmOptions>({});
    const resolver = useRef<((value: boolean) => void) | null>(null);

    const confirm = useCallback<ConfirmFn>((o) => {
        setOpts(o ?? {});
        setOpen(true);
        return new Promise<boolean>((resolve) => {
            resolver.current = resolve;
        });
    }, []);

    const settle = useCallback((value: boolean) => {
        setOpen(false);
        resolver.current?.(value);
        resolver.current = null;
    }, []);

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <AlertDialog
                open={open}
                onOpenChange={(next) => {
                    if (!next) settle(false);
                }}
            >
                <AlertDialogContent className="border-white/10 bg-[#111216] text-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">
                            {opts.title ?? "Are you sure?"}
                        </AlertDialogTitle>
                        {opts.description != null && (
                            <AlertDialogDescription className="whitespace-pre-line text-white/55">
                                {opts.description}
                            </AlertDialogDescription>
                        )}
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            onClick={() => settle(false)}
                            className="border-white/10 bg-transparent text-white/70 hover:bg-white/[0.04] hover:text-white"
                        >
                            {opts.cancelText ?? "Cancel"}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => settle(true)}
                            className={
                                opts.danger
                                    ? "bg-rose-600 text-white hover:bg-rose-500"
                                    : "bg-[#0095FF] text-white hover:bg-[#0aa0ff]"
                            }
                        >
                            {opts.confirmText ?? "Confirm"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ConfirmContext.Provider>
    );
}

export function useConfirm(): ConfirmFn {
    const ctx = useContext(ConfirmContext);
    if (!ctx) {
        throw new Error("useConfirm must be used within a ConfirmProvider");
    }
    return ctx;
}
