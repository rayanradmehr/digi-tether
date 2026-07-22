/**
 * Represents the absence of an available SignerJob.
 *
 * This class is a documentation-only marker. When no available job exists,
 * the `GET /signer/jobs/available` endpoint responds with HTTP 204 No Content
 * and an empty body — it does NOT return an instance of this class.
 *
 * The class exists to:
 * 1. Make the 204 path explicitly discoverable in code review.
 * 2. Provide a named type for Swagger `@ApiNoContentResponse` documentation.
 * 3. Serve as an extension point if the protocol is later revised to return
 *    a structured "empty" payload (e.g. `{ available: false, retryAfterMs: 5000 }`).
 *
 * When the Offline Signer receives HTTP 204:
 * - It MUST NOT attempt to parse the body.
 * - It SHOULD wait for the configured polling interval before retrying.
 * - It MUST NOT treat 204 as an error condition.
 */
export class EmptyJobResponse {}
