import { Spinner } from "@/components/ui/spinner";

export function PaymentLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-4">
      <Spinner className="size-12" />
      <p className="text-muted-foreground">Loading payment...</p>
    </div>
  );
}
