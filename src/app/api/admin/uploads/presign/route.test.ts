import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { auth } from "@/auth";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { generatePresignedUploadUrl, createR2Client } from "@/lib/uploads/r2";
import type { Session } from "next-auth";

type AuthMock = () => Promise<Session | null>;
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn<AuthMock>>;

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/uploads/r2", async () => {
  const actual = await vi.importActual<typeof import("@/lib/uploads/r2")>("@/lib/uploads/r2");
  return {
    ...actual,
    createR2Client: vi.fn(() => ({ mockClient: true })),
    generatePresignedUploadUrl: vi.fn(),
  };
});

const ADMIN_SESSION = {
  user: { id: "admin-1", email: "admin@hurbad.com", role: "ADMIN" as const },
};
const CUSTOMER_SESSION = {
  user: { id: "cust-1", email: "cust@hurbad.com", role: "CUSTOMER" as const },
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/uploads/presign (HUB-28)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
    process.env.CLOUDFLARE_R2_BUCKET = "test-bucket";
    vi.mocked(generatePresignedUploadUrl).mockResolvedValue({
      uploadUrl: "https://example.r2.cloudflarestorage.com/signed",
      key: "products/mock-key.jpg",
      expiresIn: 300,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValue(null);

    const res = await POST(
      makeRequest({ filename: "a.jpg", contentType: "image/jpeg", sizeBytes: 1000 })
    );

    expect(res.status).toBe(401);
    expect(generatePresignedUploadUrl).not.toHaveBeenCalled();
    expect(createR2Client).not.toHaveBeenCalled();
  });

  it("returns 403 when authenticated but not admin", async () => {
    mockedAuth.mockResolvedValue(CUSTOMER_SESSION as unknown as Session);

    const res = await POST(
      makeRequest({ filename: "a.jpg", contentType: "image/jpeg", sizeBytes: 1000 })
    );

    expect(res.status).toBe(403);
    expect(generatePresignedUploadUrl).not.toHaveBeenCalled();
    expect(createR2Client).not.toHaveBeenCalled();
  });

  it("returns a presigned URL response for a valid admin request", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);

    const res = await POST(
      makeRequest({ filename: "charger.jpg", contentType: "image/jpeg", sizeBytes: 500_000 })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      uploadUrl: "https://example.r2.cloudflarestorage.com/signed",
      key: "products/mock-key.jpg",
      expiresIn: 300,
    });
    expect(createR2Client).toHaveBeenCalledTimes(1);
    expect(generatePresignedUploadUrl).toHaveBeenCalledWith(
      { mockClient: true },
      expect.objectContaining({ bucket: "test-bucket", contentType: "image/jpeg" })
    );
  });

  it("rejects an oversized declared upload with 400 before any R2 call", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);

    const res = await POST(
      makeRequest({
        filename: "huge.png",
        contentType: "image/png",
        sizeBytes: 11 * 1024 * 1024,
      })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("file_too_large");
    expect(createR2Client).not.toHaveBeenCalled();
    expect(generatePresignedUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects an unsupported MIME type with 400 before any R2 call", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);

    const res = await POST(
      makeRequest({
        filename: "doc.pdf",
        contentType: "application/pdf",
        sizeBytes: 1000,
      })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("invalid_content_type");
    expect(createR2Client).not.toHaveBeenCalled();
    expect(generatePresignedUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects a malformed request body with 400", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);

    const res = await POST(makeRequest({ filename: "a.jpg" }));

    expect(res.status).toBe(400);
    expect(createR2Client).not.toHaveBeenCalled();
  });
});
