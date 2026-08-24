import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonBody } from "./validate";

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().positive(),
});

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function malformedJsonRequest(): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not valid json",
  });
}

describe("parseJsonBody", () => {
  it("returns typed data when the body matches the schema", async () => {
    const result = await parseJsonBody(jsonRequest({ email: "a@b.com", age: 30 }), schema);
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({ email: "a@b.com", age: 30 });
  });

  it("returns a 400 NextResponse with issues when the body fails schema validation", async () => {
    const result = await parseJsonBody(jsonRequest({ email: "not-an-email", age: -5 }), schema);
    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error!.status).toBe(400);

    const payload = await result.error!.json();
    expect(payload.error.code).toBe("validation_error");
    expect(Array.isArray(payload.error.issues)).toBe(true);
    expect(payload.error.issues.length).toBeGreaterThan(0);
  });

  it("returns a 400 with invalid_json code when the body is not valid JSON", async () => {
    const result = await parseJsonBody(malformedJsonRequest(), schema);
    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error!.status).toBe(400);

    const payload = await result.error!.json();
    expect(payload.error.code).toBe("invalid_json");
  });

  it("rejects a body missing a required field", async () => {
    const result = await parseJsonBody(jsonRequest({ age: 30 }), schema);
    expect(result.data).toBeUndefined();
    const payload = await result.error!.json();
    expect(payload.error.issues.some((i: { path: string[] }) => i.path.includes("email"))).toBe(
      true
    );
  });
});
