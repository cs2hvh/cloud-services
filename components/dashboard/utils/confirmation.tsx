"use client"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { RotateCw } from "lucide-react"
import * as React from "react"

interface Props extends React.ComponentPropsWithoutRef<typeof Dialog> {
    title: string
    text: string
    button_text?: string
    onAction: () => Promise<void>
}

export function ConfirmationDialog({
    title,
    text,
    onAction,
    button_text = "Delete",
    ...props
}: Props) {
    const [isConfirmationPending, startConfirmationTransition] =
        React.useTransition()

    return (
        <Dialog {...props}>
            <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{text}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:space-x-0">
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button
                        aria-label="Confirm deletion"
                        variant="destructive"
                        onClick={() => {
                            startConfirmationTransition(async () => {
                                await onAction()
                                props.onOpenChange?.(false)
                            })
                        }}
                        disabled={isConfirmationPending}
                    >
                        {isConfirmationPending && (
                            <RotateCw
                                className="w-4 h-4 animate-spin"
                                aria-hidden="true"
                            />
                        )}
                        {button_text}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
