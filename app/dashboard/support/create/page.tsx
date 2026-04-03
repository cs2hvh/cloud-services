import SupportTicketCreateWizard from "@/components/dashboard/support/support-ticket-create-wizard";

export const dynamic = "force-dynamic";

export default function CreateSupportTicketPage() {
  return (
    <div className="flex-1 bg-[#0a0a0a] min-h-screen p-4 sm:p-6 lg:p-8">
      <SupportTicketCreateWizard />
    </div>
  );
}
