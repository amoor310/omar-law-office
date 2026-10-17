import { ReplitConnectors } from "@replit/connectors-sdk";
import type { Appointment } from "@workspace/db";
import { createAppointmentActionToken } from "./appointment-action-token";

const connectors = new ReplitConnectors();

function getSetting(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function getPublicBaseUrl(): string | undefined {
  const domain = getSetting("REPLIT_DOMAINS")?.split(",")[0]?.trim();
  if (!domain) return undefined;
  return domain.startsWith("https://") ? domain.replace(/\/+$/, "") : `https://${domain}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getAppointmentTopicLabel(topic: string): string {
  const labels: Record<string, string> = {
    consultation: "استشارة قانونية",
    contracts: "استشارة في العقود",
    family: "الأحوال الشخصية",
    business: "الأعمال والمنشآت",
    real_estate: "العقارات",
    labor: "القضايا العمالية",
    other: "موضوع آخر",
  };
  return labels[topic] ?? "استشارة قانونية";
}

export function getMeetingModeLabel(mode: string): string {
  const labels: Record<string, string> = {
    phone: "مكالمة هاتفية",
    office: "مقابلة في المكتب",
    online: "لقاء عبر الإنترنت",
  };
  return labels[mode] ?? "طلب موعد";
}

export function formatAppointmentDate(value: string): string {
  const date = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    timeZone: "Asia/Riyadh",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string): string {
  return value.slice(0, 5);
}

function detailsTable(appointment: Appointment): string {
  const rows = [
    ["نوع الطلب", getMeetingModeLabel(appointment.meetingMode)],
    ["موضوع الاستشارة", getAppointmentTopicLabel(appointment.topic)],
    ["التاريخ المطلوب", formatAppointmentDate(appointment.date)],
    ["الوقت", formatTime(appointment.time)],
  ];
  return `<table dir="rtl" style="width:100%;border-collapse:collapse;margin:18px 0">${rows
    .map(
      ([label, value]) =>
        `<tr><th align="right" style="padding:9px;border-bottom:1px solid #e9e2d5;color:#6e675d;font-weight:500">${escapeHtml(label)}</th><td align="right" style="padding:9px;border-bottom:1px solid #e9e2d5;color:#20241f">${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>`;
}

function emailShell(title: string, content: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body style="margin:0;background:#f6f4ef;font-family:Arial,Tahoma,sans-serif;color:#20241f"><main style="max-width:620px;margin:28px auto;padding:28px;background:#fff;border:1px solid #e9e2d5;border-radius:12px"><p style="margin:0 0 10px;color:#a48245;font-size:13px">مكتب عمر محمد مطالقة للمحاماة</p><h1 style="margin:0 0 18px;font-size:22px">${escapeHtml(title)}</h1>${content}</main></body></html>`;
}

async function sendResendEmail(message: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<boolean> {
  const sender = getSetting("RESEND_FROM_EMAIL");
  if (!sender) return false;

  const body: Record<string, unknown> = {
    from: sender,
    to: [message.to],
    subject: message.subject,
    html: message.html,
  };
  if (message.replyTo) body.reply_to = message.replyTo;

  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Resend rejected the email request with status ${response.status}.`);
  }

  return true;
}

export async function sendNewAppointmentNotice(
  appointment: Appointment,
): Promise<boolean> {
  const recipient = getSetting("APPOINTMENT_NOTIFICATION_EMAIL");
  const baseUrl = getPublicBaseUrl();
  if (!recipient || !baseUrl) return false;

  const acceptToken = createAppointmentActionToken(appointment.id, "accept");
  const postponeToken = createAppointmentActionToken(appointment.id, "postpone");
  const actionUrl = (token: string, action: string) =>
    `${baseUrl}/api/appointments/manage?token=${encodeURIComponent(token)}&action=${action}`;
  const safeName = escapeHtml(appointment.name);
  const content = `
    <p>وصل طلب موعد جديد من <strong>${safeName}</strong>. يمكنك مراجعة التفاصيل واتخاذ الإجراء المناسب.</p>
    ${detailsTable(appointment)}
    <p><strong>البريد:</strong> <a href="mailto:${escapeHtml(appointment.email)}">${escapeHtml(appointment.email)}</a></p>
    ${appointment.phone ? `<p><strong>الهاتف:</strong> ${escapeHtml(appointment.phone)}</p>` : ""}
    ${appointment.message ? `<p><strong>تفاصيل إضافية:</strong><br>${escapeHtml(appointment.message).replace(/\n/g, "<br>")}</p>` : ""}
    <p style="margin:24px 0 8px">
      <a href="${escapeHtml(actionUrl(acceptToken, "accept"))}" style="display:inline-block;margin:0 0 8px 6px;padding:12px 18px;background:#536344;color:#fff;text-decoration:none;border-radius:6px">قبول الموعد</a>
      <a href="${escapeHtml(actionUrl(postponeToken, "postpone"))}" style="display:inline-block;margin:0 0 8px 6px;padding:12px 18px;background:#a48245;color:#fff;text-decoration:none;border-radius:6px">اقتراح موعد بديل</a>
    </p>
    <p style="font-size:12px;color:#777">روابط الإجراء صالحة لمدة 7 أيام، وتطلب تأكيدًا قبل تحديث الطلب.</p>`;

  return sendResendEmail({
    to: recipient,
    replyTo: recipient,
    subject: `طلب ${getMeetingModeLabel(appointment.meetingMode)} جديد — ${getAppointmentTopicLabel(appointment.topic)}`,
    html: emailShell("طلب موعد جديد", content),
  });
}

export async function sendAppointmentAcceptedEmail(
  appointment: Appointment,
): Promise<boolean> {
  const content = `
    <p>مرحبًا ${escapeHtml(appointment.name)}،</p>
    <p>تم قبول طلب ${escapeHtml(getMeetingModeLabel(appointment.meetingMode))} الخاص بك، وأصبح الموعد مؤكدًا.</p>
    ${detailsTable(appointment)}
    <p>إذا احتجت إلى أي تعديل، يُرجى الرد على هذه الرسالة.</p>`;

  return sendResendEmail({
    to: appointment.email,
    replyTo: getSetting("APPOINTMENT_NOTIFICATION_EMAIL"),
    subject: "تم تأكيد موعدك — مكتب عمر محمد مطالقة للمحاماة",
    html: emailShell("تم تأكيد موعدك", content),
  });
}

export async function sendAppointmentPostponedEmail(
  appointment: Appointment,
): Promise<boolean> {
  const content = `
    <p>مرحبًا ${escapeHtml(appointment.name)}،</p>
    <p>نقترح تأجيل طلب ${escapeHtml(getMeetingModeLabel(appointment.meetingMode))} إلى يوم <strong>${escapeHtml(formatAppointmentDate(appointment.date))}</strong> الساعة <strong>${escapeHtml(formatTime(appointment.time))}</strong>.</p>
    <p>هل هذا الموعد مناسب لك؟ يُرجى الرد على هذه الرسالة لإبلاغنا، وسيتابع المكتب طلبك.</p>
    ${detailsTable(appointment)}`;

  return sendResendEmail({
    to: appointment.email,
    replyTo: getSetting("APPOINTMENT_NOTIFICATION_EMAIL"),
    subject: "اقتراح موعد بديل لطلبك — مكتب عمر محمد مطالقة للمحاماة",
    html: emailShell("اقتراح موعد بديل", content),
  });
}