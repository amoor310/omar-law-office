import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  CreateAppointmentBody,
  CreateAppointmentResponse,
  GetAppointmentAvailabilityQueryParams,
  GetAppointmentAvailabilityResponse,
} from "@workspace/api-zod";
import { appointmentsTable, db } from "@workspace/db";
import { sendNewAppointmentNotice } from "../lib/appointment-emails";

const router: IRouter = Router();

function isValidCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

router.get("/appointments/availability", async (req, res): Promise<void> => {
  const parsedParams = GetAppointmentAvailabilityQueryParams.safeParse(req.query);
  if (!parsedParams.success || !isValidCalendarDate(parsedParams.data.date)) {
    res.status(400).json({ error: "A valid calendar date is required." });
    return;
  }

  const reservations = await db
    .select({ time: appointmentsTable.time })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.date, parsedParams.data.date));

  const response = GetAppointmentAvailabilityResponse.parse({
    date: parsedParams.data.date,
    unavailableSlots: reservations.map(({ time }) => time.slice(0, 5)),
  });
  res.json(response);
});

router.post("/appointments", async (req, res): Promise<void> => {
  const parsedBody = CreateAppointmentBody.safeParse(req.body);
  if (!parsedBody.success || !isValidCalendarDate(parsedBody.data.date)) {
    res.status(400).json({ error: "Please provide valid appointment details." });
    return;
  }

  try {
    const [appointment] = await db
      .insert(appointmentsTable)
      .values({
        ...parsedBody.data,
        phone: parsedBody.data.phone ?? null,
        message: parsedBody.data.message ?? null,
      })
      .returning();

    try {
      const emailSent = await sendNewAppointmentNotice(appointment);
      if (!emailSent) {
        req.log.warn(
          { appointmentId: appointment.id },
          "Appointment was saved, but its office notification email is not configured",
        );
      }
    } catch (error) {
      req.log.error(
        { err: error, appointmentId: appointment.id },
        "Appointment was saved, but its office notification email could not be sent",
      );
    }

    res.status(201).json(
      CreateAppointmentResponse.parse({
        ...appointment,
        time: appointment.time.slice(0, 5),
      }),
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({ error: "The selected time is no longer available." });
      return;
    }

    req.log.error({ err: error }, "Failed to submit appointment request");
    res.status(500).json({ error: "Unable to submit the appointment request." });
  }
});

export default router;