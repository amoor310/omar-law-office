import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  AcceptAppointmentRequestQueryParams,
  GetAppointmentManagementActionQueryParams,
  PostponeAppointmentRequestQueryParams,
  PostponeAppointmentRequestBody,
  type AppointmentRescheduleInput,
} from "@workspace/api-zod";
import { appointmentsTable, db } from "@workspace/db";
import {
  escapeHtml,
  formatAppointmentDate,
  getAppointmentTopicLabel,
  getMeetingModeLabel,
  sendAppointmentAcceptedEmail,
  sendAppointmentPostponedEmail,
} from "../lib/appointment-emails";
import {
  type AppointmentAction,
  verifyAppointmentActionToken,
} from "../lib/appointment-action-token";

const router: IRouter = Router();

function setPrivateHtmlHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.type("html");
}

function renderPage(title: string, content: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><style>body{margin:0;background:#f6f4ef;color:#20241f;font-family:Arial,Tahoma,sans-serif}.card{max-width:560px;margin:8vh auto;padding:28px;background:#fff;border:1px solid #e9e2d5;border-radius:12px;box-shadow:0 12px 36px #24301a12}h1{font-size:22px;margin:0 0 14px}p{line-height:1.8;color:#625e56}.brand{color:#a48245;font-size:13px;margin-bottom:8px}.details{padding:14px;background:#f8f7f3;border-radius:8px;margin:18px 0}.details p{margin:5px 0}.field{display:grid;gap:7px;margin:16px 0}label{font-size:14px;font-weight:600}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #d9d4ca;border-radius:6px;font:inherit}button{border:0;border-radius:6px;background:#536344;color:white;padding:13px 20px;font:inherit;font-weight:700;cursor:pointer}button:hover{background:#425038}@media(max-width:640px){.card{margin:18px 12px;padding:22px}}</style></head><body><main class="card"><div class="brand">مكتب عمر محمد مطالقة للمحاماة</div><h1>${escapeHtml(title)}</h1>${content}</main></body></html>`;
}

function renderExpiredPage(): string {
  return renderPage(
    "تعذر تنفيذ الإجراء",
    "<p>رابط الإجراء غير صالح أو انتهت صلاحيته أو تمت مراجعة الطلب بالفعل.</p>",
  );
}

function getTokenAndAction(tokenValue: unknown, expectedAction: AppointmentAction) {
  if (typeof tokenValue !== "string" || tokenValue.length > 2048) return null;
  const payload = verifyAppointmentActionToken(tokenValue);
  if (!payload || payload.action !== expectedAction) return null;
  return { token: tokenValue, payload };
}

function formatDetails(appointment: {
  name: string;
  topic: string;
  meetingMode: string;
  date: string;
  time: string;
}): string {
  return `<div class="details"><p><strong>مقدم الطلب:</strong> ${escapeHtml(appointment.name)}</p><p><strong>نوع الطلب:</strong> ${escapeHtml(getMeetingModeLabel(appointment.meetingMode))}</p><p><strong>الموضوع:</strong> ${escapeHtml(getAppointmentTopicLabel(appointment.topic))}</p><p><strong>التاريخ:</strong> ${escapeHtml(formatAppointmentDate(appointment.date))}</p><p><strong>الوقت:</strong> ${escapeHtml(appointment.time.slice(0, 5))}</p></div>`;
}

function riyadhToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function isFutureRiyadhDateTime(date: string, time: string): boolean {
  return new Date(`${date}T${time}:00+03:00`).getTime() > Date.now();
}

function renderActionForm(
  action: AppointmentAction,
  token: string,
  appointment: {
    name: string;
    topic: string;
    meetingMode: string;
    date: string;
    time: string;
  },
): string {
  const safeToken = encodeURIComponent(token);
  if (action === "accept") {
    return renderPage(
      "مراجعة طلب الموعد",
      `${formatDetails(appointment)}<p>اضغط للتأكيد على قبول الطلب وإرسال رسالة تأكيد إلى العميل.</p><form method="post" action="/api/appointments/manage/accept?token=${safeToken}"><button type="submit">تأكيد قبول الموعد</button></form>`,
    );
  }

  return renderPage(
    "اقتراح موعد بديل",
    `${formatDetails(appointment)}<p>اختر التاريخ والوقت البديلين. سنرسل للعميل اقتراح الموعد ونسأله إن كان مناسبًا.</p><form method="post" action="/api/appointments/manage/postpone?token=${safeToken}"><div class="field"><label for="date">اليوم المقترح</label><input id="date" name="date" type="date" min="${riyadhToday()}" required></div><div class="field"><label for="time">الساعة المقترحة</label><input id="time" name="time" type="time" step="1800" required></div><button type="submit">إرسال اقتراح الموعد</button></form>`,
  );
}

router.get("/appointments/manage", async (req, res): Promise<void> => {
  setPrivateHtmlHeaders(res);
  const parsedQuery = GetAppointmentManagementActionQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(404).send(renderExpiredPage());
    return;
  }
  const { action } = parsedQuery.data;
  const token = getTokenAndAction(parsedQuery.data.token, action);
  if (!token) {
    res.status(404).send(renderExpiredPage());
    return;
  }

  const [appointment] = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, token.payload.appointmentId));
  if (!appointment || appointment.status !== "pending") {
    res.status(410).send(renderExpiredPage());
    return;
  }

  res.send(renderActionForm(action, token.token, appointment));
});

router.post("/appointments/manage/accept", async (req, res): Promise<void> => {
  setPrivateHtmlHeaders(res);
  const parsedQuery = AcceptAppointmentRequestQueryParams.safeParse(req.query);
  const token = parsedQuery.success
    ? getTokenAndAction(parsedQuery.data.token, "accept")
    : null;
  if (!token) {
    res.status(404).send(renderExpiredPage());
    return;
  }

  const [appointment] = await db
    .update(appointmentsTable)
    .set({ status: "accepted" })
    .where(
      and(
        eq(appointmentsTable.id, token.payload.appointmentId),
        eq(appointmentsTable.status, "pending"),
      ),
    )
    .returning();
  if (!appointment) {
    res.status(410).send(renderExpiredPage());
    return;
  }

  let customerNotified = false;
  try {
    customerNotified = await sendAppointmentAcceptedEmail(appointment);
  } catch (error) {
    req.log.error(
      { err: error, appointmentId: appointment.id },
      "Appointment was accepted but the customer email could not be sent",
    );
  }

  const message = customerNotified
    ? "تم قبول الموعد وإرسال رسالة تأكيد إلى العميل."
    : "تم قبول الموعد. لم تُرسل رسالة للعميل لأن إعداد البريد غير مكتمل أو تعذر الإرسال.";
  res.send(renderPage("تم تحديث الطلب", `<p>${message}</p>`));
});

router.post("/appointments/manage/postpone", async (req, res): Promise<void> => {
  setPrivateHtmlHeaders(res);
  const parsedQuery = PostponeAppointmentRequestQueryParams.safeParse(req.query);
  const token = parsedQuery.success
    ? getTokenAndAction(parsedQuery.data.token, "postpone")
    : null;
  if (!token) {
    res.status(404).send(renderExpiredPage());
    return;
  }

  const parsedBody = PostponeAppointmentRequestBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).send(
      renderPage("بيانات الموعد غير صحيحة", "<p>اختر يومًا ووقتًا صالحين ثم حاول مرة أخرى.</p>"),
    );
    return;
  }
  const reschedule: AppointmentRescheduleInput = parsedBody.data;
  const date = new Date(`${reschedule.date}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== reschedule.date ||
    !isFutureRiyadhDateTime(reschedule.date, reschedule.time)
  ) {
    res.status(400).send(
      renderPage("الموعد المقترح غير صالح", "<p>اختر تاريخًا ووقتًا مستقبليين.</p>"),
    );
    return;
  }

  try {
    const [appointment] = await db
      .update(appointmentsTable)
      .set({
        date: reschedule.date,
        time: reschedule.time,
        status: "reschedule_proposed",
      })
      .where(
        and(
          eq(appointmentsTable.id, token.payload.appointmentId),
          eq(appointmentsTable.status, "pending"),
        ),
      )
      .returning();
    if (!appointment) {
      res.status(410).send(renderExpiredPage());
      return;
    }

    let customerNotified = false;
    try {
      customerNotified = await sendAppointmentPostponedEmail(appointment);
    } catch (error) {
      req.log.error(
        { err: error, appointmentId: appointment.id },
        "Appointment was postponed but the customer email could not be sent",
      );
    }

    const message = customerNotified
      ? "تم حفظ الموعد البديل وإرسال الاقتراح إلى العميل."
      : "تم حفظ الموعد البديل. لم تُرسل رسالة للعميل لأن إعداد البريد غير مكتمل أو تعذر الإرسال.";
    res.send(renderPage("تم تحديث الطلب", `<p>${message}</p>`));
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).send(
        renderPage("الوقت غير متاح", "<p>هذا الوقت مرتبط بطلب آخر. اختر وقتًا مختلفًا.</p>"),
      );
      return;
    }

    req.log.error({ err: error }, "Failed to postpone appointment request");
    res.status(500).send(
      renderPage("تعذر تحديث الطلب", "<p>حدث خطأ أثناء تحديث الموعد. حاول مرة أخرى.</p>"),
    );
  }
});

export default router;