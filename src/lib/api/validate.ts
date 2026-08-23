import { NextResponse } from 'next/server'
import type { ZodType } from 'zod'

// The validation convention every Route Handler follows (PRD §4.2 / §9.1):
// parse the request body against a Zod schema and get back either the typed
// data or a ready-to-return 400 response, so callers never hand-roll either.
type ParseResult<T> =
  | { data: T; error?: undefined }
  | { data?: undefined; error: NextResponse }

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>
): Promise<ParseResult<T>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return {
      error: NextResponse.json(
        { error: { message: 'Request body must be valid JSON', code: 'invalid_json' } },
        { status: 400 }
      ),
    }
  }

  const result = schema.safeParse(body)
  if (!result.success) {
    return {
      error: NextResponse.json(
        {
          error: {
            message: 'Request body failed validation',
            code: 'validation_error',
            issues: result.error.issues,
          },
        },
        { status: 400 }
      ),
    }
  }

  return { data: result.data }
}
