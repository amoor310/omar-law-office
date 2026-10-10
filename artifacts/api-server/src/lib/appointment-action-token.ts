import { createHmac, timingSafeEqual } from "node:crypto";

export type AppointmentAction = "accept" | "postpone";

interface AppointmentActionPayload {
  appointmentId: string;
  action: AppointmentAction;
  expiresAt: number;
}

const tokenLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function signingKey(): Buffer {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required for appointment action links.");
  }

  return createHmac("sha256", sessionSecret)
    .update("omar-law-office:appointment-actions:v1")
    .digest();
}

export function createAppointmentActionToken(
  appointmentId: string,
  action: AppointmentAction,
): string {
  const payload: AppointmentActionPayload = {
    appointmentId,
    action,
    expiresAt: Date.now() + tokenLifetimeMs,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", signingKey())
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

export function verifyAppointmentActionToken(
  token: string,
): AppointmentActionPayload | null {
  if (token.length > 2048) return null;

  const [encodedPayload, encodedSignature, extraPart] = token.split(".");
  if (!encodedPayload || !encodedSignature || extraPart !== undefined) return null;

  let expectedSignature: Buffer;
  try {
    expectedSignature = Buffer.from(
      createHmac("sha256", signingKey()).update(encodedPayload).digest("base64url"),
      "base64url",
    );
  } catch {
    return null;
  }

  const suppliedSignature = Buffer.from(encodedSignature, "base64url");
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<AppointmentActionPayload>;

    if (
      typeof payload.appointmentId !== "string" ||
      !uuidPattern.test(payload.appointmentId) ||
      (payload.action !== "accept" && payload.action !== "postpone") ||
      typeof payload.expiresAt !== "number" ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }

    return payload as AppointmentActionPayload;
  } catch {
    return null;
  }
}