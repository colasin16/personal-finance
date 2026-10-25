/**
 * An error whose message is meant for the user. `code` is a key in messages/<locale>/errors.json;
 * it is translated when returned from a server action or shown in the UI.
 */
export class UserError extends Error {
  constructor(
    readonly code: string,
    readonly params: Record<string, string | number> = {},
  ) {
    super(code);
    this.name = "UserError";
  }
}
