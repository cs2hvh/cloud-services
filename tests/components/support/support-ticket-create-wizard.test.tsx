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

// Radix selects do not work under jsdom (no pointer capture), so each option
// renders as a plain button that reports its value to the owning Select.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const SelectContext = React.createContext<(value: string) => void>(() => {});

  return {
    Select: ({ children, onValueChange }: any) => (
      <SelectContext.Provider value={onValueChange}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: any) => <div>{children}</div>,
    SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ children, value }: any) => {
      const onValueChange = React.useContext(SelectContext);
      return (
        <button type="button" role="option" onClick={() => onValueChange(value)}>
          {children}
        </button>
      );
    },
  };
});

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

const RESOURCES_RESPONSE = {
  data: [{ id: "cluster-1", name: "Production cluster", type: "kubernetes" }],
};

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("option", { name: "Kubernetes Clusters" }));
  await waitFor(() => {
    expect(screen.getByRole("option", { name: "Production cluster" })).toBeInTheDocument();
  });
  await user.type(screen.getByPlaceholderText("Subject"), "Kubernetes control plane issue");
  await user.type(
    screen.getByLabelText("Issue description editor"),
    "Detailed investigation data and exact error sequence."
  );
}

const GENERIC_ONLY_RESPONSE = {
  data: [{ id: "general", name: "General Managed Databases issue", type: "database" }],
};

describe("SupportTicketCreateWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should ask for a single topic without sub-topic selectors", () => {
    render(<SupportTicketCreateWizard />);

    expect(screen.getByText("Topic")).toBeInTheDocument();
    expect(screen.queryByText(/sub-topic/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/tertiary/i)).not.toBeInTheDocument();
  });

  it("should keep submit disabled until every field is filled", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(RESOURCES_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SupportTicketCreateWizard />);

    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();

    await fillForm(user);

    expect(screen.getByRole("button", { name: /submit/i })).toBeEnabled();
  });

  it("should load affected resources for the selected topic", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(RESOURCES_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SupportTicketCreateWizard />);

    await user.click(screen.getByRole("option", { name: "Kubernetes Clusters" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/support/resources?topic=kubernetes",
        expect.objectContaining({ cache: "no-store" })
      );
    });
  });

  it("should hide the resource dropdown when only the generic entry exists", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(GENERIC_ONLY_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SupportTicketCreateWizard />);

    await user.click(screen.getByRole("option", { name: "Managed Databases" }));

    await waitFor(() => {
      expect(screen.queryByText("Affected resource")).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole("option", { name: "General Managed Databases issue" })
    ).not.toBeInTheDocument();
  });

  it("should submit the topic only and navigate to the created ticket", async () => {
    const user = userEvent.setup();
    let submittedForm: FormData | null = null;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/support/resources")) {
        return new Response(JSON.stringify(RESOURCES_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/support/tickets") && init?.method === "POST") {
        submittedForm = init.body as FormData;
        return new Response(JSON.stringify({ data: { id: "ticket-99" } }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Unexpected request" }), { status: 500 });
    });

    render(<SupportTicketCreateWizard />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard/support/ticket-99");
    });

    expect(submittedForm!.get("topic")).toBe("kubernetes");
    expect(submittedForm!.get("subTopic")).toBeNull();
    expect(submittedForm!.get("tertiaryTopic")).toBeNull();
    expect(submittedForm!.get("affectedResourceId")).toBe("cluster-1");
  });
});
