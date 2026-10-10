import { createInsertSchema } from "drizzle-zod";
import { date, pgTable, text, time, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const appointmentsTable = pgTable(
  "law_office_appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    topic: text("topic").notNull(),
    meetingMode: text("meeting_mode").notNull(),
    date: date("date", { mode: "string" }).notNull(),
   time: text("time").notNull(),
    message: text("message"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("law_office_appointments_date_time_idx").on(table.date, table.time)],
);

export const insertAppointmentSchema = createInsertSchema(appointmentsTable).omit({
  id: true,
  status: true,
  createdAt: true,
});

export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointmentsTable.$inferSelect;