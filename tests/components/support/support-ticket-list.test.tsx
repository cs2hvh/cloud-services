import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SupportTicketList from "@/components/dashboard/support/support-ticket-list";

vi.mock("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

const baseTicket = {
  id: "ticket-1",
  ticket_number: "TCK-1001",
  status: "open" as const,
  topic: "kubernetes",
  sub_topic: "cluster_health",
  tertiary_topic: "node_not_ready",
  subject: "Cluster node is not ready",
  affected_resource_type: "kubernetes",
  affected_resource_id: "cluster-1",
  affected_resource_name: "Production cluster",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  latest_message_at: "2026-01-02T00:00:00.000Z",
  resolved_at: null,
};

describe("SupportTicketList", () => {
  it("should show empty-state CTA when no tickets are available", () => {
    render(<SupportTicketList openTickets={[]} closedTickets={[]} />);

    expect(screen.getByText("No tickets in this view")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create ticket/i })).toHaveAttribute(
      "href",
      "/dashboard/support/create"
    );
  });

  it("should filter open tickets using search input", async () => {
    const user = userEvent.setup();

    render(
      <SupportTicketList
        openTickets={[
          baseTicket,
          {
            ...baseTicket,
            id: "ticket-2",
            ticket_number: "TCK-1002",
            subject: "Billing issue with top-up",
          },
        ]}
        closedTickets={[]}
      />
    );

    expect(screen.getByText("Cluster node is not ready")).toBeInTheDocument();
    expect(screen.getByText("Billing issue with top-up")).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText(/search by ticket number or subject/i),
      "billing"
    );

    expect(screen.queryByText("Cluster node is not ready")).not.toBeInTheDocument();
    expect(screen.getByText("Billing issue with top-up")).toBeInTheDocument();
  });

  it("should render closed tickets when closed tab is selected", async () => {
    const user = userEvent.setup();

    render(
      <SupportTicketList
        openTickets={[baseTicket]}
        closedTickets={[
          {
            ...baseTicket,
            id: "ticket-3",
            status: "resolved",
            ticket_number: "TCK-1003",
            subject: "DNS route is fixed",
          },
        ]}
      />
    );

    expect(screen.queryByText("DNS route is fixed")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /closed/i }));

    expect(screen.getByText("DNS route is fixed")).toBeInTheDocument();
    expect(screen.getByText("RESOLVED")).toBeInTheDocument();
  });
});
