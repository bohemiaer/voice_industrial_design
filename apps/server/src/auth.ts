import { createHmac, timingSafeEqual } from "node:crypto";

import type { FastifyRequest } from "fastify";

import type { AppConfig } from "./config.js";
import { ApiError } from "./errors.js";

export interface AuthenticatedUser {
  userId: string;
  email: string | null;
}

export type AuthVerifier = (
  token: string
) => Promise<AuthenticatedUser | null> | AuthenticatedUser | null;

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: AuthenticatedUser;
  }
}

export function isProtectedApiRequest(request: FastifyRequest): boolean {
  return request.method !== "OPTIONS" && request.url.startsWith("/api/");
}

export async function authenticateRequest(input: {
  request: FastifyRequest;
  verifier: AuthVerifier;
  defaultAuthenticatedUser?: AuthenticatedUser | null;
}): Promise<void> {
  const token = readBearerToken(input.request);

  if (!token) {
    if (input.defaultAuthenticatedUser) {
      input.request.currentUser = input.defaultAuthenticatedUser;
      return;
    }

    throw new ApiError(401, "AUTH_REQUIRED", "Authentication is required");
  }

  const user = await input.verifier(token);

  if (!user) {
    throw new ApiError(401, "AUTH_INVALID", "Authentication token is invalid");
  }

  input.request.currentUser = user;
}

export function requireAuth(request: FastifyRequest): AuthenticatedUser {
  if (!request.currentUser) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication is required");
  }

  return request.currentUser;
}

export function createSupabaseJwtVerifier(config: AppConfig): AuthVerifier {
  return async (token) => verifySupabaseJwt(token, config);
}

function readBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;

  if (!header) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}

function verifySupabaseJwt(
  token: string,
  config: AppConfig
): AuthenticatedUser | null {
  if (!config.supabaseJwtSecret) {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseBase64UrlJson(encodedHeader) as { alg?: string } | null;

  if (header?.alg !== "HS256") {
    return null;
  }

  const expectedSignature = createHmac("sha256", config.supabaseJwtSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const actualSignature = Buffer.from(encodedSignature, "base64url");

  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return null;
  }

  const payload = parseBase64UrlJson(encodedPayload) as {
    aud?: string | string[];
    email?: string;
    exp?: number;
    iss?: string;
    sub?: string;
  } | null;

  if (!payload?.sub || !payload.exp) {
    return null;
  }

  if (payload.exp * 1000 <= Date.now()) {
    return null;
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];

  if (!audiences.includes(config.supabaseJwtAudience)) {
    return null;
  }

  if (
    config.supabaseUrl &&
    payload.iss &&
    payload.iss !== `${config.supabaseUrl.replace(/\/$/, "")}/auth/v1`
  ) {
    return null;
  }

  return {
    userId: payload.sub,
    email: payload.email ?? null
  };
}

function parseBase64UrlJson(value: string): unknown | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
