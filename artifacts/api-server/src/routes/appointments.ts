import { Router } from 'express';
import { db, appointmentsTable } from '@workspace/db';
import { Resend } from 'resend';

const router = Router();

// إعداد خدمة Resend لإرسال الإشعارات
const resend = new Resend(process.env.RESEND_API_KEY);

router.post('/appointments', async (req, res) => {
  try {
    const {
      full_name,
      email,
      phone_number,
      subject,
      meeting_method,
      appointment_date,
      appointment_time,
      notes,
    } = req.body;

    if (!full_name || !email || !subject || !meeting_method || !appointment_date || !appointment_time) {
      return res.status(400).json({ error: 'جميع الحقول الأساسية مطلوبة.' });
    }

    // حفظ الطلب في قاعدة البيانات Supabase باستخدام Drizzle
    const [newAppointment] = await db
      .insert(appointmentsTable)
      .values({
        fullName: full_name,
        email: email,
        phoneNumber: phone_number || null,
        subject: subject,
        meetingMethod: meeting_method,
        appointmentDate: appointment_date,
        appointmentTime: appointment_time,
        notes: notes || null,
      })
      .returning();

    // إرسال الإيميل التنبيهي إلى إيميلك الشخصي
    const notificationEmail = process.env.APPOINTMENT_NOTIFICATION_EMAIL || 'omar.legalaffairs@gmail.com';

    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to: notificationEmail,
        subject: `طلب موعد جديد: ${subject} - من ${full_name}`,
        html: `
          <h2>تم تلقي طلب موعد جديد عبر موقع مكتب المحاماة</h2>
          <ul>
            <li><strong>الاسم الكامل:</strong> ${full_name}</li>
            <li><strong>البريد الإلكتروني:</strong> ${email}</li>
            <li><strong>رقم الهاتف:</strong> ${phone_number || 'غير متوفر'}</li>
            <li><strong>موضوع الطلب:</strong> ${subject}</li>
            <li><strong>طريقة اللقاء:</strong> ${meeting_method}</li>
            <li><strong>التاريخ:</strong> ${appointment_date}</li>
            <li><strong>الوقت:</strong> ${appointment_time}</li>
            <li><strong>ملاحظات:</strong> ${notes || 'لا توجد ملاحظات'}</li>
          </ul>
        `,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'تم تسجيل طلب الموعد بنجاح وإرسال الإشعار.',
      appointment: newAppointment,
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return res.status(500).json({ error: 'حدث خطأ في الخادم أثناء حفظ الموعد.' });
  }
});

export default router;
