import { describe, expect, it } from "vitest";

import { v1DatabaseServiceError } from "@/lib/api/v1-database-helpers";

describe("v1DatabaseServiceError", () => {
  it("maps duplicate-like message to 409 ALREADY_EXISTS", async () => {
    const response = v1DatabaseServiceError(
      { success: false, error: "database name is not available" } as never,
      "CREATE_FAILED",
      "Failed to create database"
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("ALREADY_EXISTS");
  });

  it("maps defaultdb delete protection message to 400 INVALID_PARAMETER", async () => {
    const response = v1DatabaseServiceError(
      { success: false, error: "cannot delete defaultdb database" } as never,
      "DELETE_FAILED",
      "Failed to delete database"
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("INVALID_PARAMETER");
  });

  it("maps explicit INVALID_PARAMETER errorCode to 400", async () => {
    const response = v1DatabaseServiceError(
      { success: false, error: "invalid request", errorCode: "INVALID_PARAMETER" },
      "UPDATE_FAILED",
      "Failed to update database"
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("INVALID_PARAMETER");
  });
});
