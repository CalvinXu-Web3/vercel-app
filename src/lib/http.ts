import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "The request did not pass validation." },
      { status: 422 },
    );
  }

  console.error("Unhandled API error", error);
  return NextResponse.json({ error: "Internal server error." }, { status: 500 });
}
