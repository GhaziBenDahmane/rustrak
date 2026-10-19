/**
 * @rustrak/client - TypeScript client for Rustrak API
 *
 * A type-safe, fully-featured client for interacting with Rustrak error tracking API.
 *
 * @packageDocumentation
 */

// Main client
export { RustrakClient } from './client.js';

// Configuration
export type { ClientConfig } from './config.js';
// Errors: one closed union, keyed on `kind`, replacing the nine classes.
export {
  FIELD_ERROR_CODES,
  type FieldError,
  type FieldErrorCode,
  isRetryable,
  NETWORK_ERROR_MESSAGE,
  type RustrakError,
  type RustrakErrorKind,
  SERVER_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from './errors.js';
// Every request and response type in openapi.json, named as the spec names
// them: `IssueResponse`, `ProjectResponse`, `IssuesListData`.
export type * from './generated/types.gen.js';
// Result: every method returns one of these.
export {
  Err,
  mapResult,
  Ok,
  type Result,
  unwrap,
  unwrapOr,
} from './result.js';
