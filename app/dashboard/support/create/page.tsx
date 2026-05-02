import SupportTicketCreateWizard from "@/components/dashboard/support/support-ticket-create-wizard";

export const dynamic = "force-dynamic";

export default function CreateSupportTicketPage() {
  return (
    <div className="dashboard-bg flex-1 min-h-screen px-6 py-5 text-white sm:px-8 sm:py-8 xl:px-9 [&_button]:cursor-pointer [&_a]:cursor-pointer [&_[role=tab]]:cursor-pointer">
      <SupportTicketCreateWizard />
    </div>
  );
}
