import { HttpResponse, http } from 'msw/http';
import type { FieldError } from '../../src/errors.js';

const BASE_URL = 'http://localhost:8080';

/**
 * The eight `type` literals `AppError::error_response` can emit
 * (`apps/server/src/error.rs`). Declaring them as a union means a typo in a
 * fixture is a compile error rather than a body that silently stops matching
 * the server.
 */
export type AppErrorType =
  | 'NotFound'
  | 'ValidationError'
  | 'Conflict'
  | 'Unauthorized'
  | 'Forbidden'
  | 'PayloadTooLarge'
  | 'DatabaseError'
  | 'InternalError';

/**
 * The `Display` prefix `thiserror` puts in front of each variant's detail, from
 * the `#[error("...")]` attributes in `apps/server/src/error.rs`.
 *
 * `tests/unit/app-error-contract.test.ts` reads that Rust file and asserts this
 * table still matches it, so a reworded `#[error(...)]` fails the TypeScript
 * suite instead of drifting past it.
 */
export const APP_ERROR_PREFIXES = {
  NotFound: 'Resource not found: ',
  ValidationError: 'Validation error: ',
  Conflict: 'Conflict: ',
  Unauthorized: 'Unauthorized: ',
  Forbidden: 'Forbidden: ',
  PayloadTooLarge: 'Payload too large: ',
  DatabaseError: 'Database error: ',
  InternalError: 'Internal server error: ',
} as const satisfies Record<AppErrorType, string>;

/**
 * `AppError::status_code` (`apps/server/src/error.rs`) is a total function of
 * the variant, so the status is derived here rather than passed in: the server
 * cannot produce a `NotFound` that is not a 404, and neither can a fixture.
 * The same contract test above checks this table against the Rust `match`.
 */
export const APP_ERROR_STATUS = {
  NotFound: 404,
  ValidationError: 400,
  Conflict: 409,
  Unauthorized: 401,
  Forbidden: 403,
  PayloadTooLarge: 413,
  DatabaseError: 500,
  InternalError: 500,
} as const satisfies Record<AppErrorType, number>;

/**
 * The fixed `message` every 5xx body carries, mirroring
 * `INTERNAL_ERROR_MESSAGE` in `apps/server/src/error.rs`.
 *
 * `tests/unit/app-error-contract.test.ts` reads that constant out of the Rust
 * file and asserts it still equals this one, so rewording it on either side is
 * a failing test rather than a fixture that quietly stops matching the server.
 */
export const INTERNAL_ERROR_MESSAGE = 'Internal server error';

/**
 * Build the nested body every `AppError` produces:
 * `{"error": {"type": ..., "message": ...}}`, with the status derived from the
 * variant.
 *
 * **4xx**: `message` is `AppError`'s `Display`, so it always carries the
 * thiserror prefix: a 404 reads `Resource not found: <detail>`, never a bare
 * detail. Passing a message without its prefix throws here rather than
 * producing a body the server could never send.
 *
 * **5xx**: there is no caller-supplied message at all. `error_response`
 * replaces `Display` with {@link INTERNAL_ERROR_MESSAGE} so a `sqlx::Error`'s
 * constraint and column names never reach the wire (gh-233), which means a
 * fixture that passed its own 500 message would be testing a body the server
 * stopped emitting. Passing one throws. `incidentId` is what a 500 carries
 * instead, and it is optional here because a proxy-generated 5xx and a server
 * older than gh-233 both send a body without one.
 *
 * `fields` mirrors the server exactly: `ErrorDetail.fields` is
 * `#[serde(skip_serializing_if = "Vec::is_empty")]`, so an absent or empty list
 * means the key is absent from the body, never `[]` and never `null`. Fixtures
 * go through here rather than inlining a body precisely so that this stays true
 * in one place. `incident_id` is skipped the same way.
 */
export function appErrorResponse(
  type: AppErrorType,
  message?: string,
  fields?: FieldError[],
  options?: { incidentId?: string },
) {
  const status = APP_ERROR_STATUS[type];
  const isServerError = status >= 500;

  if (isServerError && message !== undefined) {
    throw new Error(
      `appErrorResponse('${type}', ...) takes no message: every 5xx body is ` +
        `${JSON.stringify(INTERNAL_ERROR_MESSAGE)}, fixed by the server.`,
    );
  }
  if (!isServerError && message === undefined) {
    throw new Error(`appErrorResponse('${type}', ...) requires a message.`);
  }

  const prefix = APP_ERROR_PREFIXES[type];
  if (message !== undefined && !message.startsWith(prefix)) {
    throw new Error(
      `appErrorResponse('${type}', ...) expects the server's Display prefix: ` +
        `message must start with ${JSON.stringify(prefix)}, got ${JSON.stringify(message)}`,
    );
  }

  return HttpResponse.json(
    {
      error: {
        type,
        message: isServerError ? INTERNAL_ERROR_MESSAGE : message,
        ...(fields !== undefined && fields.length > 0 ? { fields } : {}),
        ...(options?.incidentId !== undefined
          ? { incident_id: options.incidentId }
          : {}),
      },
    },
    { status },
  );
}

/**
 * The one flat error body the server still emits: the ingest rate limiter in
 * `apps/server/src/routes/ingest.rs`, which is not an `AppError` and so keeps
 * its own shape plus the `Retry-After` header.
 */
export function rateLimitResponse(retryAfter: number) {
  return HttpResponse.json(
    { error: 'rate_limit_exceeded', retry_after: retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}

/**
 * A missing project has two distinct wordings on the server and the actor
 * decides which one you get:
 *
 * - `ProjectService::get_by_id` (`services/project.rs:142`) says
 *   `Project with id {id} not found`. This is what an instance admin sees, and
 *   a Bearer token is either user-less (legacy, treated as admin) or owned by
 *   an admin in every fixture here, so `access::require` waves it through and
 *   the lookup is what 404s.
 * - `access::require` (`services/access.rs:65`) says `Project {id} not found`
 *   for a non-member, deliberately not leaking existence. Use
 *   `projectNotVisible` for endpoints whose only 404 comes from that guard.
 *
 * `services/project.rs:165` also has a bare `Project not found`, but it lives in
 * `get_by_sentry_key`, which is `#[allow(dead_code)]` and wired to no route, so
 * no client can ever observe it.
 */
export function projectNotFound(id: string | number | readonly string[]) {
  return `Resource not found: Project with id ${id} not found`;
}

/** `access::require`'s non-member 404 (`services/access.rs:65`). */
export function projectNotVisible(id: string | number | readonly string[]) {
  return `Resource not found: Project ${id} not found`;
}

// Mock data
export const mockProjects = [
  {
    id: 1,
    name: 'Test Project',
    slug: 'test-project',
    sentry_key: '123e4567-e89b-12d3-a456-426614174000',
    dsn: 'http://123e4567-e89b-12d3-a456-426614174000@localhost:8080/1',
    stored_event_count: 100,
    digested_event_count: 95,
    rate_limited_event_count: 0,
    rate_limit_per_minute: null,
    rate_limit_per_hour: null,
    created_at: '2026-01-20T10:00:00.000Z',
    updated_at: '2026-01-20T10:00:00.000Z',
    platform: 'javascript',
  },
  {
    id: 2,
    name: 'Another Project',
    slug: 'another-project',
    sentry_key: '223e4567-e89b-12d3-a456-426614174000',
    dsn: 'http://223e4567-e89b-12d3-a456-426614174000@localhost:8080/2',
    stored_event_count: 50,
    digested_event_count: 48,
    rate_limited_event_count: 0,
    rate_limit_per_minute: null,
    rate_limit_per_hour: null,
    created_at: '2026-01-19T10:00:00.000Z',
    updated_at: '2026-01-19T10:00:00.000Z',
    platform: null,
  },
];

export const mockTeamMembers = [
  {
    id: 1,
    email: 'test@example.com',
    role: 'member',
    is_active: true,
    is_primary: false,
    created_at: '2026-01-20T10:00:00.000Z',
    last_login: '2026-01-20T11:00:00.000Z',
  },
  {
    id: 2,
    email: 'admin@example.com',
    role: 'admin',
    // Deactivated on purpose, and it is what makes the last-admin 409
    // reachable at all. `UsersService::admin_count` counts
    // `role = 'admin' AND is_active = true` (`services/users.rs:167`), so with
    // an *active* primary admin in the roster there are always two active
    // admins and the server would answer 204, never the 409 this suite
    // asserts. An admin account that was switched off, leaving one active
    // admin behind, is exactly the state the guard exists to protect.
    is_active: false,
    is_primary: true,
    created_at: '2026-01-19T10:00:00.000Z',
    last_login: null,
  },
  // A second admin who is NOT the primary account. Without this, the only admin
  // in the roster was the primary one, and `routes/team.rs:118-137` checks the
  // primary guard before the last-admin guard, so demoting them can only ever
  // produce the 403, so the 409 fixture was unreachable on the real server.
  {
    id: 3,
    email: 'second-admin@example.com',
    role: 'admin',
    is_active: true,
    is_primary: false,
    created_at: '2026-01-18T10:00:00.000Z',
    last_login: null,
  },
];

export const handlers = [
  // ---------------------------------------------------------------------
  // Status-transform fixtures.
  //
  // These paths do NOT exist on the server. They exist so the status ->
  // error-class mapping in `src/utils/http.ts::transformHttpError` can be
  // exercised for statuses whose only real sources are endpoints this client
  // never calls:
  //
  //   - `AppError::PayloadTooLarge` is produced solely by envelope ingestion
  //     (`ingest/decompression.rs:17,38`, `ingest/parser.rs:81,107`).
  //   - The flat 429 body is produced solely by the ingest rate limiter
  //     (`routes/ingest.rs:38-46`).
  //   - `AppError::Database` / `AppError::Internal` can surface from any route,
  //     so they are parked here too rather than pinned to one arbitrary GET.
  //
  // They used to hang off `GET /api/projects/:id` under reserved ids, which
  // taught a contract the server does not honour: a bodyless GET can never
  // answer "payload too large". Drive them through the client's transport
  // directly, not with a method.
  // ---------------------------------------------------------------------
  http.get(`${BASE_URL}/__status-transform/payload-too-large`, () =>
    appErrorResponse(
      'PayloadTooLarge',
      'Payload too large: Compressed payload exceeds 104857600 bytes',
    ),
  ),
  http.get(`${BASE_URL}/__status-transform/rate-limited`, () =>
    rateLimitResponse(59),
  ),
  http.get(`${BASE_URL}/__status-transform/database-error`, () =>
    appErrorResponse('DatabaseError'),
  ),
  http.get(`${BASE_URL}/__status-transform/internal-error`, () =>
    appErrorResponse('InternalError'),
  ),
  // 410 and the catch-all have no `AppError` producer at all: `status_code`
  // cannot return either. They exist for a retired endpoint and for whatever a
  // proxy invents, so both bodies are proxy-shaped rather than `appErrorResponse`.
  http.get(`${BASE_URL}/__status-transform/gone`, () =>
    HttpResponse.json(
      { error: 'This endpoint has been retired' },
      { status: 410 },
    ),
  ),
  // 418 is deliberate: it is a real status, no `AppError` maps to it, and
  // nothing in `transformHttpError`'s switch enumerates it, so it can only
  // reach the `default` arm.
  http.get(`${BASE_URL}/__status-transform/unenumerated`, () =>
    HttpResponse.json({ error: "I'm a teapot" }, { status: 418 }),
  ),

  // Projects
  http.get(`${BASE_URL}/api/projects`, () => {
    return HttpResponse.json({
      items: mockProjects,
      total_count: mockProjects.length,
      page: 1,
      per_page: 20,
      total_pages: 1,
    });
  }),

  http.get(`${BASE_URL}/api/projects/:id`, ({ params }) => {
    const { id } = params;
    const project = mockProjects.find((p) => p.id === Number(id));

    if (!project) {
      return appErrorResponse('NotFound', projectNotFound(id));
    }

    return HttpResponse.json(project);
  }),

  http.post(`${BASE_URL}/api/projects`, async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      slug?: string;
      platform?: string;
    };

    const newProject = {
      id: 3,
      name: body.name,
      slug: body.slug ?? body.name.toLowerCase().replace(/\s+/g, '-'),
      sentry_key: '923e4567-e89b-12d3-a456-426614174000',
      dsn: 'http://923e4567-e89b-12d3-a456-426614174000@localhost:8080/3',
      stored_event_count: 0,
      digested_event_count: 0,
      rate_limited_event_count: 0,
      rate_limit_per_minute: null,
      rate_limit_per_hour: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Mirrors the server: an omitted platform stays NULL, a supplied one is
      // persisted and echoed back.
      platform: body.platform ?? null,
    };

    return HttpResponse.json(newProject, { status: 201 });
  }),
  // `routes/auth.rs:106-115` ignores its body entirely and always returns
  // `AppError::Forbidden("Registration is invite-only")`. There is no success
  // path and no validation branch: signing up goes through
  // `/auth/accept-invitation`. This fixture used to invent a 201 and three 400s
  // that the endpoint cannot produce.
  http.post(`${BASE_URL}/auth/register`, () =>
    appErrorResponse('Forbidden', 'Forbidden: Registration is invite-only'),
  ),

  // Only the failure: no test logs in successfully.
  http.post(`${BASE_URL}/auth/login`, () =>
    appErrorResponse('Unauthorized', 'Unauthorized: Invalid credentials'),
  ),

  // Public invitation lookup (accept page)
  http.get(`${BASE_URL}/auth/invitation/:token`, ({ params }) =>
    params.token === 'expired-token'
      ? appErrorResponse(
          'ValidationError',
          'Validation error: Invitation is expired or already used',
        )
      : appErrorResponse(
          'NotFound',
          'Resource not found: Invitation not found',
        ),
  ),

  // Team (users)
  http.get(`${BASE_URL}/api/team`, () => {
    return HttpResponse.json(mockTeamMembers);
  }),

  http.patch(
    `${BASE_URL}/api/team/:userId/role`,
    async ({ params, request }) => {
      const { userId } = params;
      const body = (await request.json()) as { role: string };

      // Guard order mirrors `routes/team.rs:113-137` exactly, because the order
      // is observable: demoting the primary admin yields 403, never the 409.
      if (body.role !== 'admin' && body.role !== 'member') {
        return appErrorResponse(
          'ValidationError',
          `Validation error: Invalid role: ${body.role}`,
        );
      }

      const member = mockTeamMembers.find((m) => m.id === Number(userId));

      // 1. The primary account's role can never change (routes/team.rs:118-125).
      //    This is checked before the user lookup on the server, so an unknown
      //    id that happened to be primary could not exist anyway.
      if (member?.is_primary && body.role !== 'admin') {
        return appErrorResponse(
          'Forbidden',
          "Forbidden: The primary admin's role cannot be changed",
        );
      }

      // 2. Then the user must exist (routes/team.rs:129-131).
      if (!member) {
        return appErrorResponse(
          'NotFound',
          `Resource not found: User ${userId} not found`,
        );
      }

      // 3. Then the last-admin guard (routes/team.rs:134-147). The count is
      //    computed rather than assumed: the server asks
      //    `COUNT(*) WHERE role = 'admin' AND is_active = true` and only
      //    refuses at `<= 1`. Hard-coding the 409 for any non-primary admin
      //    made this fixture answer 409 where the real server answers 204,
      //    which is the fixture-vs-server divergence this phase exists to
      //    remove.
      const activeAdmins = mockTeamMembers.filter(
        (m) => m.role === 'admin' && m.is_active,
      ).length;

      if (
        member.role === 'admin' &&
        body.role === 'member' &&
        activeAdmins <= 1
      ) {
        return appErrorResponse(
          'Conflict',
          'Conflict: Cannot demote the last admin',
        );
      }

      return new HttpResponse(null, { status: 204 });
    },
  ),

  http.delete(`${BASE_URL}/api/team/:userId`, ({ params }) => {
    const { userId } = params;
    const member = mockTeamMembers.find((m) => m.id === Number(userId));
    if (!member) {
      return appErrorResponse(
        'NotFound',
        `Resource not found: User ${userId} not found`,
      );
    }
    // Simulate "the primary user cannot be deleted".
    if (member.is_primary) {
      return appErrorResponse(
        'Forbidden',
        'Forbidden: The primary admin cannot be deleted',
      );
    }
    return new HttpResponse(null, { status: 204 });
  }),
];
