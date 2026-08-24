import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getCorrelationId } from "./request-context";

// Mock next/headers module
vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

describe("getCorrelationId", () => {
  let headersMock: Map<string, string>;

  beforeEach(() => {
    headersMock = new Map();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the correlation ID when x-request-id header is present", async () => {
    const { headers } = await import("next/headers");
    headersMock.set("x-request-id", "550e8400-e29b-41d4-a716-446655440000");

    const mockHeadersList = {
      get: (key: string) => headersMock.get(key) ?? null,
    } as unknown as Awaited<ReturnType<typeof headers>>;

    vi.mocked(headers).mockResolvedValue(mockHeadersList);

    const result = await getCorrelationId();
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("returns undefined when x-request-id header is not present", async () => {
    const { headers } = await import("next/headers");
    const mockHeadersList = {
      get: () => null,
    } as unknown as Awaited<ReturnType<typeof headers>>;

    vi.mocked(headers).mockResolvedValue(mockHeadersList);

    const result = await getCorrelationId();
    expect(result).toBeUndefined();
  });

  it("returns undefined when x-request-id is null (header explicitly not found)", async () => {
    const { headers } = await import("next/headers");
    const mockHeadersList = {
      get: () => null,
    } as unknown as Awaited<ReturnType<typeof headers>>;

    vi.mocked(headers).mockResolvedValue(mockHeadersList);

    const result = await getCorrelationId();
    expect(result).toBeUndefined();
  });

  it("preserves the exact UUID value from the header", async () => {
    const { headers } = await import("next/headers");
    const expectedId = "abcdef01-2345-6789-abcd-ef0123456789";
    headersMock.set("x-request-id", expectedId);

    const mockHeadersList = {
      get: (key: string) => headersMock.get(key) ?? null,
    } as unknown as Awaited<ReturnType<typeof headers>>;

    vi.mocked(headers).mockResolvedValue(mockHeadersList);

    const result = await getCorrelationId();
    expect(result).toBe(expectedId);
  });
});
