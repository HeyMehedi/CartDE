import { ulid } from "ulid";

export const newId = (): string => ulid();
export const nowIso = (): string => new Date().toISOString();

export type ErrorCode = "not_found" | "conflict" | "invalid" | "forbidden";

/** Expected, user-facing failure. Route handlers map `code` to an HTTP status. */
export class CartdeError extends Error {
	constructor(
		public readonly code: ErrorCode,
		message: string,
		public readonly fields?: Record<string, string>,
	) {
		super(message);
	}
}

export function isUniqueViolation(err: unknown): boolean {
	return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}
