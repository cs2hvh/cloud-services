import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SupportTicketCreateWizard from "@/components/dashboard/support/support-ticket-create-wizard";

const mockPush = vi.fn();

vi.mock("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/components/dashboard/support/support-rich-text-editor", () => ({
  default: ({ value, onChange, placeholder }: any) => (
    <textarea
      aria-label="Issue description editor"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

describe("SupportTicketCreateWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should validate topic selection before moving to next step", async () => {
    const user = userEvent.setup();
    render(<SupportTicketCreateWizard />);

    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(screen.getByText("Please choose a topic.")).toBeInTheDocument();
  });

  it("should load topic resources and proceed to step 2", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "cluster-1", name: "Production cluster", type: "kubernetes" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    render(<SupportTicketCreateWizard />);

    await user.selectOptions(screen.getByRole("combobox"), "kubernetes");
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText("Sub-topic")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/support/resources?topic=kubernetes",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("should display supported attachment types in step 2", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [{ id: "cluster-1", name: "Production cluster", type: "kubernetes" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(<SupportTicketCreateWizard />);

    await user.selectOptions(screen.getByRole("combobox"), "kubernetes");
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText("Sub-topic")).toBeInTheDocument();
    });

    expect(screen.getByText(/allowed: png, jpg, jpeg, pdf, docx, csv, xlsx, txt, doc/i)).toBeInTheDocument();
  });

  it("should submit successfully and navigate to created ticket page", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/support/resources")) {
        return new Response(
          JSON.stringify({
            data: [{ id: "cluster-1", name: "Production cluster", type: "kubernetes" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.endsWith("/api/support/tickets") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            data: { id: "ticket-99" },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ error: "Unexpected request" }), { status: 500 });
    });

    render(<SupportTicketCreateWizard />);

    await user.selectOptions(screen.getByRole("combobox"), "kubernetes");
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText("Sub-topic")).toBeInTheDocument();
    });

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "cluster_health");
    await user.selectOptions(selects[1], "node_not_ready");
    await user.type(
      screen.getByPlaceholderText(/kubernetes cluster stuck on ready state/i),
      "Kubernetes control plane issue"
    );
    await user.type(
      screen.getByLabelText("Issue description editor"),
      "Detailed investigation data and exact error sequence."
    );

    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /submit ticket/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /submit ticket/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard/support/ticket-99");
    });
  });
});
