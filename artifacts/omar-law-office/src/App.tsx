import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ArrowLeft,
  ArrowUpLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Landmark,
  MapPin,
  MoreVertical,
  Phone,
  Scale,
  ShieldCheck,
  Video,
} from 'lucide-react';
import { SiFacebook, SiInstagram } from 'react-icons/si';
import {
  AppointmentInputTopic,
  useCreateAppointment,
  useGetAppointmentAvailability,
  getGetAppointmentAvailabilityQueryKey,
} from '@workspace/api-client-react';
import type { AppointmentInput } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { LanguageProvider, useLanguage, type Language, type TranslationKey } from '@/i18n';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Route,
  Switch,
  Link,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();
const logo = '/brand-logo.png';
const directionsUrl = 'https://maps.app.goo.gl/vRG3DNPWYtrnFbaz7';
const appointmentTimes = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30',
];
const topicOptions = [
  { value: AppointmentInputTopic.consultation, labelKey: 'topicConsultationOption' },
  { value: AppointmentInputTopic.contracts, labelKey: 'topicContractsOption' },
  { value: AppointmentInputTopic.family, labelKey: 'topicFamilyOption' },
  { value: AppointmentInputTopic.business, labelKey: 'topicBusinessOption' },
  { value: AppointmentInputTopic.real_estate, labelKey: 'topicRealEstateOption' },
  { value: AppointmentInputTopic.labor, labelKey: 'topicLaborOption' },
  { value: AppointmentInputTopic.other, labelKey: 'topicOtherOption' },
] as const;

function createBookingSchema(t: (key: TranslationKey) => string) {
  return z.object({
    name: z.string().min(2, t('nameRequired')).max(120, t('nameMaxLength')),
    email: z.string().email(t('emailInvalid')).max(255, t('emailMaxLength')),
    phone: z.string().max(40, t('phoneMaxLength')).optional(),
    topic: z.enum([
      AppointmentInputTopic.consultation,
      AppointmentInputTopic.contracts,
      AppointmentInputTopic.family,
      AppointmentInputTopic.business,
      AppointmentInputTopic.real_estate,
      AppointmentInputTopic.labor,
      AppointmentInputTopic.other,
    ], { required_error: t('topicRequired') }),
    meetingMode: z.enum(['office', 'phone', 'online'], {
      required_error: t('meetingModeRequired'),
    }),
    date: z.string().min(1, t('dateRequired')),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, t('timeRequired')),
    message: z.string().max(1500, t('messageTooLong')).optional(),
  });
}
type BookingValues = z.infer<ReturnType<typeof createBookingSchema>>;

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const appointmentSubmittedSessionKey = 'omar-law-office-appointment-submitted';

function hasSubmittedAppointmentInCurrentTab(): boolean {
  try {
    return window.sessionStorage.getItem(appointmentSubmittedSessionKey) === 'true';
  } catch {
    return false;
  }
}

function rememberSubmittedAppointmentInCurrentTab(): void {
  try {
    window.sessionStorage.setItem(appointmentSubmittedSessionKey, 'true');
  } catch {
    // Keep the current page locked even if session storage is unavailable.
  }
}

function monthLabel(date: Date, language: Language) {
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function readableDate(value: string, language: Language) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function isPastTimeSlot(dateValue: string, timeValue: string): boolean {
  const now = new Date();
  if (isoDate(now) !== dateValue) return false;

  const [year, month, day] = dateValue.split('-').map(Number);
  const [hour, minute] = timeValue.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute) <= now;
}

function Brand({ footer = false }: { footer?: boolean }) {
  const { language, t } = useLanguage();
  return (
    <Link href="/" onClick={() => window.scrollTo(0, 0)} className="brand-lockup" aria-label={language === 'ar' ? t('officeName') : t('officeNameEnglish')} data-testid="link-brand">
      <img src={logo} alt={language === 'ar' ? `شعار ${t('officeName')}` : `${t('officeNameEnglish')} logo`} data-testid="img-brand-logo" />
      <span>
        <span className="brand-title">{language === 'ar' ? t('officeName') : t('officeNameEnglish')}</span>
        <span className="brand-subtitle">{footer ? t('lawOffice') : 'LAW OFFICE'}</span>
      </span>
    </Link>
  );
}

function LanguageMenu() {
  const { language, setLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <div
      className="language-settings"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        className="language-settings-trigger"
        type="button"
        aria-label={t('languageSettings')}
        aria-expanded={open}
        aria-controls="language-options"
        onClick={() => setOpen((value) => !value)}
        data-testid="button-language-settings"
      >
        <MoreVertical size={18} />
      </button>
      {open && (
        <div className="language-menu" id="language-options" aria-label={t('language')}>
          <span className="language-menu-title">{t('language')}</span>
          <button type="button" aria-pressed={language === 'ar'} onClick={() => { setLanguage('ar'); setOpen(false); }}>
            {t('arabic')}
          </button>
          <button type="button" aria-pressed={language === 'en'} onClick={() => { setLanguage('en'); setOpen(false); }}>
            {t('english')}
          </button>
        </div>
      )}
    </div>
  );
}

function Header({ booking = false }: { booking?: boolean }) {
  const { t } = useLanguage();
  return (
    <header className="masthead">
      <div className="container-wide flex items-center">
        <Brand />
        {!booking && (
          <nav className="nav-links" aria-label={t('mainNavigation')}>
            <a href="#about" data-testid="link-about">{t('about')}</a>
            <a href="#services" data-testid="link-services">{t('services')}</a>
            <a href="#approach" data-testid="link-approach">{t('approach')}</a>
            <a href="#location" data-testid="link-location">{t('location')}</a>
          </nav>
        )}
        <Link href={booking ? '/' : '/booking'} className="nav-cta" data-testid="link-header-booking">
          {booking ? t('returnToWebsite') : t('booking')} <ArrowLeft className="directional-icon" size={15} strokeWidth={1.6} />
        </Link>
        <LanguageMenu />
      </div>
    </header>
  );
}

function Hero() {
  const { language, t } = useLanguage();
  return (
    <>
      <section className="hero" id="top">
        <Scale className="hero-watermark" size={240} strokeWidth={0.22} aria-hidden="true" focusable="false" />
        <div className="container-wide hero-grid">
          <div className="hero-copy reveal">
            <div className="eyebrow">{t('heroEyebrow')}</div>
            <h1>{t('heroTitleFirst')}<br /><span>{t('heroTitleSecond')}</span></h1>
            <p className="hero-description">
              {t('heroDescription')}
            </p>
            <div className="hero-actions">
              <Link href="/booking" className="button-primary" data-testid="link-hero-booking">
                {t('askForConsultation')} <ArrowLeft className="directional-icon" size={16} />
              </Link>
              <a href="#about" className="text-link" data-testid="link-learn-more">
                {t('learnAboutOffice')} <ArrowUpLeft className="directional-icon" size={15} />
              </a>
            </div>
          </div>
          <div className="hero-index" aria-hidden="true">01 / 04</div>
        </div>
      </section>
      <section className="trust-strip" aria-label={t('about')}>
        <div className="container-wide trust-row">
          {[['trustListening', 1], ['trustClarity', 2], ['trustPrivacy', 3], ['trustDirect', 4]].map(([key, number]) => (
            <div className="trust-item" key={key}>
              <span className="trust-mark">{new Intl.NumberFormat(language === 'ar' ? 'ar-SA' : 'en-GB').format(Number(number))}</span>
              <span>{t(key as TranslationKey)}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function About() {
  const { t } = useLanguage();
  return (
    <section className="section" id="about">
      <div className="container-wide intro-layout">
        <div>
          <div className="section-kicker">{t('aboutKicker')}</div>
          <h2 className="section-heading">{t('aboutTitle')}</h2>
          <p className="section-intro">{t('aboutDescription')}</p>
        </div>
        <div className="intro-aside">
          <strong>{t('aboutAsideTitle')}</strong>
          {t('aboutAsideDescription')}
        </div>
      </div>
    </section>
  );
}

function PracticeAreas() {
  const { t } = useLanguage();
  const areas = [
    { number: '01', title: t('areaConsultation'), text: t('areaConsultationDescription') },
    { number: '02', title: t('areaContracts'), text: t('areaContractsDescription') },
    { number: '03', title: t('areaBusiness'), text: t('areaBusinessDescription') },
    { number: '04', title: t('areaFamily'), text: t('areaFamilyDescription') },
    { number: '05', title: t('areaRealEstate'), text: t('areaRealEstateDescription') },
    { number: '06', title: t('areaLabor'), text: t('areaLaborDescription') },
  ];
  return (
    <section className="section practice-section" id="services">
      <div className="container-wide">
        <div className="practice-header">
          <div>
            <div className="section-kicker">{t('servicesKicker')}</div>
            <h2 className="section-heading">{t('servicesTitle')}</h2>
          </div>
          <p className="section-intro">{t('servicesDescription')}</p>
        </div>
        <div className="practice-grid">
          {areas.map((area) => (
            <article className="practice-card" key={area.number} data-testid={`card-practice-${area.number}`}>
              <span className="practice-number">{area.number}</span>
              <h3>{area.title}</h3>
              <p>{area.text}</p>
              <span className="practice-arrow" aria-hidden="true">↙</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Approach() {
  const { t } = useLanguage();
  const principles = [
    { title: t('principleListen'), text: t('principleListenDescription') },
    { title: t('principleExplain'), text: t('principleExplainDescription') },
    { title: t('principlePrivacy'), text: t('principlePrivacyDescription') },
  ];
  return (
    <section className="section" id="approach">
      <img className="approach-watermark" src={logo} alt="" aria-hidden="true" />
      <div className="container-wide approach">
        <div>
          <div className="section-kicker">{t('approachKicker')}</div>
          <h2 className="section-heading">{t('approachTitle')}</h2>
          <p className="section-intro">{t('approachDescription')}</p>
        </div>
        <div className="principles">
          {principles.map((item, index) => (
            <article className="principle" key={item.title} data-testid={`text-principle-${index + 1}`}>
              <span className="principle-index">0{index + 1}</span>
              <div><h3>{item.title}</h3><p>{item.text}</p></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CalendarPicker({
  selectedDate,
  onSelect,
}: {
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const { language, t } = useLanguage();
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const [year, month] = selectedDate.split('-').map(Number);
    return new Date(year, month - 1, 1);
  });
  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);
  const days = useMemo(() => {
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const count = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
    return [...Array(first.getDay()).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [visibleMonth]);
  const canGoBack = visibleMonth.getFullYear() > today.getFullYear()
    || visibleMonth.getMonth() > today.getMonth();
  const weekdayNames = language === 'ar'
    ? ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']
    : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="calendar-wrap" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="calendar-head">
        <strong data-testid="text-calendar-month">{monthLabel(visibleMonth, language)}</strong>
        <div className="calendar-nav">
          <button type="button" aria-label={t('calendarMonthNext')} data-testid="button-next-month"
            onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}>
            <ChevronRight size={16} />
          </button>
          <button type="button" aria-label={t('calendarMonthPrevious')} data-testid="button-previous-month" disabled={!canGoBack}
            onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}>
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>
      <div className="calendar-grid" role="grid" aria-label={t('calendarChooseDate')}>
        {weekdayNames.map((day, index) => <span className="calendar-weekday" key={`${day}-${index}`} role="columnheader">{day}</span>)}
        {days.map((day, index) => {
          if (!day) return <span className="calendar-day empty" key={`empty-${index}`} aria-hidden="true" />;
          const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
          const value = isoDate(date);
          const disabled = date < today;
          return (
            <button
              className={`calendar-day${selectedDate === value ? ' selected' : ''}`}
              type="button"
              key={value}
              disabled={disabled}
              aria-pressed={selectedDate === value}
              aria-label={readableDate(value, language)}
              data-testid={`button-date-${value}`}
              onClick={() => onSelect(value)}
            >{new Intl.NumberFormat(language === 'ar' ? 'ar-SA' : 'en-GB').format(day)}</button>
          );
        })}
      </div>
      <p className="calendar-note">{t('calendarNote')}</p>
    </div>
  );
}

function BookingForm() {
  const { language, t } = useLanguage();
  const initialDate = isoDate(new Date());
  const queryClient = useQueryClient();
  const bookingSchema = useMemo(() => createBookingSchema(t), [t]);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedTime, setSelectedTime] = useState('');
  const [submitted, setSubmitted] = useState(hasSubmittedAppointmentInCurrentTab);
  const {
    data: availability,
    isLoading: availabilityLoading,
    isError: availabilityError,
    refetch: retryAvailability,
  } = useGetAppointmentAvailability(
    { date: selectedDate },
    {
      query: {
        enabled: Boolean(selectedDate),
        queryKey: getGetAppointmentAvailabilityQueryKey({ date: selectedDate }),
      },
    },
  );
  const createAppointment = useCreateAppointment();
  const form = useForm<BookingValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      topic: AppointmentInputTopic.consultation,
      meetingMode: undefined,
      date: initialDate,
      time: '',
      message: '',
    },
  });
  const selectedMeetingMode = form.watch('meetingMode');
  const unavailableSlots = availability?.unavailableSlots ?? [];

  function changeDate(date: string) {
    setSelectedDate(date);
    setSelectedTime('');
    setSubmitted(false);
    form.setValue('date', date, { shouldValidate: true });
    form.setValue('time', '', { shouldValidate: true });
  }

  function selectTime(time: string) {
    setSelectedTime(time);
    form.setValue('time', time, { shouldValidate: true });
  }

  function onSubmit(values: BookingValues) {
    setSubmitted(false);
    const appointmentInput: AppointmentInput = {
      name: values.name.trim(),
      email: values.email.trim(),
      ...(values.phone?.trim() ? { phone: values.phone.trim() } : {}),
      topic: values.topic,
      meetingMode: values.meetingMode,
      date: values.date,
      time: values.time,
      ...(values.message?.trim() ? { message: values.message.trim() } : {}),
    };
    createAppointment.mutate({
      data: appointmentInput,
    }, {
      onSuccess: () => {
        rememberSubmittedAppointmentInCurrentTab();
        setSubmitted(true);
        setSelectedTime('');
        form.reset({
          name: '',
          email: '',
          phone: '',
          topic: AppointmentInputTopic.consultation,
          meetingMode: undefined,
          date: selectedDate,
          time: '',
          message: '',
        });
        void queryClient.invalidateQueries({
          queryKey: getGetAppointmentAvailabilityQueryKey({ date: values.date }),
        });
      },
    });
  }

  return (
    <section className="booking-section" id="booking">
      <div className="container-wide booking-layout">
        <div className="booking-aside">
          <div className="section-kicker">{t('bookingKicker')}</div>
          <h2 className="section-heading">{t('bookingFormTitle')}</h2>
          <p className="section-intro">{t('bookingAsideDescription')}</p>
          <div className="booking-points">
            <div className="booking-point"><span className="point-dot" />{t('bookingPointModes')}</div>
            <div className="booking-point"><span className="point-dot" />{t('bookingPointTimes')}</div>
            <div className="booking-point"><span className="point-dot" />{t('bookingPointPrivacy')}</div>
          </div>
        </div>
        <div className="booking-card">
          {!submitted && (
            <div className="form-intro">
              <strong>{t('requestDetails')}</strong>
              <p>{t('formIntro')}</p>
            </div>
          )}
          {submitted ? (
            <div className="success-card success-card-complete" role="status" data-testid="status-appointment-pending">
              <strong><Check size={19} className="inline ml-2" />{t('requestReceived')}</strong>
              <p>{t('requestReceivedDescription')}</p>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} noValidate data-testid="form-appointment">
              <div className="field-grid">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem className="field">
                    <FormLabel>{t('fullName')} <span aria-hidden="true">*</span></FormLabel>
                    <FormControl><input {...field} autoComplete="name" placeholder={t('fullNamePlaceholder')} data-testid="input-name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem className="field">
                    <FormLabel>{t('email')} <span aria-hidden="true">*</span></FormLabel>
                    <FormControl><input {...field} type="email" autoComplete="email" dir="ltr" placeholder={t('emailPlaceholder')} data-testid="input-email" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem className="field">
                    <FormLabel>{t('phone')} <span className="font-normal text-muted-foreground">({t('optional')})</span></FormLabel>
                    <FormControl><input {...field} type="tel" autoComplete="tel" dir="ltr" placeholder={t('phonePlaceholder')} data-testid="input-phone" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="topic" render={({ field }) => (
                  <FormItem className="field">
                    <FormLabel>{t('topic')} <span aria-hidden="true">*</span></FormLabel>
                    <FormControl>
                      <select {...field} data-testid="select-topic">
                        {topicOptions.map((option) => <option value={option.value} key={option.value}>{t(option.labelKey)}</option>)}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="meetingMode" render={({ field }) => (
                  <FormItem className="field full">
                    <FormLabel>{t('meetingMode')} <span aria-hidden="true">*</span></FormLabel>
                    <FormControl>
                      <div className="mode-row" role="radiogroup" aria-label={t('meetingMode')}>
                        {[
                          { value: 'office', label: t('modeOffice'), icon: Landmark },
                          { value: 'phone', label: t('modePhone'), icon: Phone },
                          { value: 'online', label: t('modeOnline'), icon: Video },
                        ].map(({ value, label, icon: Icon }) => (
                          <div className="mode-option" key={value}>
                            <input type="radio" id={`mode-${value}`} name={field.name} value={value}
                              checked={field.value === value} onChange={() => field.onChange(value)}
                              data-testid={`radio-mode-${value}`} />
                            <label htmlFor={`mode-${value}`}><Icon size={14} className="ml-1.5" />{label}</label>
                          </div>
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                    {field.value === 'office' && (
                      <div className="office-directions" data-testid="office-directions">
                        <MapPin size={18} aria-hidden="true" />
                        <div>
                          <strong>{t('officeChosen')}</strong>
                          <p>{t('directionsDescription')}</p>
                        </div>
                        <a href={directionsUrl} target="_blank" rel="noreferrer" data-testid="link-booking-directions">
                          {t('directions')} <ArrowUpLeft className="directional-icon" size={14} />
                        </a>
                      </div>
                    )}
                  </FormItem>
                )} />
                {selectedMeetingMode ? (
                  <>
                    <FormField control={form.control} name="date" render={() => (
                      <FormItem className="field full">
                        <FormLabel>{t('suitableDay')} <span aria-hidden="true">*</span></FormLabel>
                        <FormControl>
                          <CalendarPicker selectedDate={selectedDate} onSelect={changeDate} />
                        </FormControl>
                        <span className="text-[11px] text-muted-foreground" data-testid="text-selected-date">
                          {t('selectedDate')} {readableDate(selectedDate, language)}
                        </span>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="time" render={() => (
                      <FormItem className="field full">
                        <FormLabel>{t('chooseTime')} <span aria-hidden="true">*</span></FormLabel>
                        <FormControl>
                          <div>
                            {availabilityLoading ? (
                              <div className="times-grid" aria-label={t('loadingTimes')} data-testid="loading-availability">
                                {Array.from({ length: 8 }, (_, index) => <span key={index} className="h-[39px] animate-pulse bg-muted" />)}
                              </div>
                            ) : availabilityError ? (
                              <div className="availability-message text-destructive" role="alert" data-testid="error-availability">
                                {t('availabilityError')} <button type="button" className="underline" onClick={() => void retryAvailability()} data-testid="button-retry-availability">{t('retry')}</button>
                              </div>
                            ) : availability && availability.date === selectedDate ? (
                              <div className="times-grid" role="group" aria-label={t('suggestedTimes')}>
                                {appointmentTimes.map((time) => {
                                  const unavailable = unavailableSlots.includes(time)
                                    || isPastTimeSlot(selectedDate, time);
                                  return (
                                    <button
                                      type="button"
                                      className={`time-slot${selectedTime === time ? ' selected' : ''}`}
                                      key={time}
                                      disabled={unavailable}
                                      aria-pressed={selectedTime === time}
                                      aria-label={`${time}${unavailable ? ` ${t('unavailable')}` : ''}`}
                                      data-testid={`button-time-${time.replace(':', '-')}`}
                                      onClick={() => selectTime(time)}
                                    >{time}</button>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="availability-message" data-testid="text-availability-empty">{t('chooseDateForTimes')}</div>
                            )}
                          </div>
                        </FormControl>
                        <p className="availability-message" data-testid="text-availability-status">
                          {availability && !availabilityLoading && !availabilityError
                            ? selectedTime
                              ? t('pendingTimeSelected').replace('{time}', selectedTime)
                              : t('timesAreRequests')
                            : ''}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </>
                ) : (
                  <div className="meeting-hint field full" data-testid="text-select-meeting-mode">
                    {t('chooseModeHint')}
                  </div>
                )}
                <FormField control={form.control} name="message" render={({ field }) => (
                  <FormItem className="field full">
                    <FormLabel>{t('message')} <span className="font-normal text-muted-foreground">({t('optional')})</span></FormLabel>
                    <FormControl><textarea {...field} placeholder={t('messagePlaceholder')} data-testid="textarea-message" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              {createAppointment.isError && (
                <div className="submit-error" role="alert" data-testid="error-appointment">
                  {t('submitError')}
                </div>
              )}
              <div className="submit-row">
                <button className="button-primary" type="submit" disabled={createAppointment.isPending} data-testid="button-submit-appointment">
                  {createAppointment.isPending ? t('submitting') : t('submitAppointment')}
                  {!createAppointment.isPending && <ArrowLeft className="directional-icon" size={16} />}
                </button>
                <p className="privacy-note"><ShieldCheck size={13} className="inline ml-1" />{t('privacyNote')}</p>
              </div>
              </form>
            </Form>
          )}
        </div>
      </div>
    </section>
  );
}

function Contact() {
  const { t } = useLanguage();
  return (
    <section className="contact-section" id="location">
      <div className="container-wide">
        <div className="contact-band">
          <div>
            <div className="section-kicker">{t('contactKicker')}</div>
            <h2 className="section-heading">{t('contactTitle')}</h2>
            <p>{t('contactDescription')}</p>
          </div>
          <a className="button-primary location-link" href={directionsUrl} target="_blank" rel="noreferrer" data-testid="link-directions">
            <MapPin size={16} /> {t('viewLocation')} <ArrowUpLeft className="directional-icon" size={15} />
          </a>
        </div>
      </div>
    </section>
  );
}

function OfficeSectionLink({ id, children }: { id: string; children: ReactNode }) {
  const [location] = useLocation();
  if (location === '/') {
    return <a href={`#${id}`}>{children}</a>;
  }
  return <Link href={`/#${id}`}>{children}</Link>;
}

function RouteScrollManager() {
  const [location] = useLocation();

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const frame = window.requestAnimationFrame(() => {
      if (hash) {
        document.getElementById(decodeURIComponent(hash))?.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location]);

  return null;
}

function RouteMetadata() {
  const [location] = useLocation();
  const { language, t } = useLanguage();

  useEffect(() => {
    const isBookingPage = location.startsWith('/booking');
    const title = t(isBookingPage ? 'bookingMetaTitle' : 'homeMetaTitle');
    const description = t(isBookingPage ? 'bookingMetaDescription' : 'homeMetaDescription');
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', description);
  }, [language, location, t]);

  return null;
}

function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="footer">
      <div className="container-wide">
        <div className="footer-inner">
          <Brand footer />
          <div className="footer-discovery">
            <div className="footer-socials" aria-label={t('socialAccounts')}>
              <a href="https://www.instagram.com/law_omar_matalqah/" target="_blank" rel="noreferrer" data-testid="link-footer-instagram">
                <SiInstagram size={16} aria-hidden="true" /> {t('instagram')}
              </a>
              <a href="https://www.facebook.com/mrmtalqh.443762" target="_blank" rel="noreferrer" data-testid="link-footer-facebook">
                <SiFacebook size={16} aria-hidden="true" /> {t('facebook')}
              </a>
            </div>
            <nav className="footer-nav" aria-label={t('officePages')}>
              <span className="footer-nav-title">{t('officePages')}</span>
              <div className="footer-page-links">
                <OfficeSectionLink id="about">{t('about')}</OfficeSectionLink>
                <OfficeSectionLink id="services">{t('services')}</OfficeSectionLink>
                <OfficeSectionLink id="approach">{t('approach')}</OfficeSectionLink>
                <OfficeSectionLink id="location">{t('locationAndDirections')}</OfficeSectionLink>
              </div>
            </nav>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-copy" data-testid="text-footer-note">{t('footerCopyright').replace('{year}', String(new Date().getFullYear()))}</div>
          <div className="footer-bottom-links">
            <a href="#top" data-testid="link-footer-top">{t('backToTop')}</a>
            <Link href="/booking" data-testid="link-footer-booking">{t('booking')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function LocalizedNotFound() {
  const { language, t } = useLanguage();
  return (
    <main className="site-shell not-found-page-shell" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <Header booking />
      <section className="container-wide not-found-page">
        <div className="section-kicker">404</div>
        <h1 className="section-heading">{t('notFoundTitle')}</h1>
        <p className="section-intro">{t('notFoundDescription')}</p>
        <Link href="/" className="button-primary not-found-home">{t('home')}</Link>
      </section>
      <Footer />
    </main>
  );
}

function Home() {
  const { language } = useLanguage();
  return (
    <main className="site-shell" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <Header />
      <Hero />
      <About />
      <PracticeAreas />
      <Approach />
      <Contact />
      <Footer />
    </main>
  );
}

function BookingPage() {
  const { language, t } = useLanguage();
  return (
    <main className="site-shell booking-page" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <Header booking />
      <section className="booking-page-intro">
        <div className="container-wide">
          <div className="section-kicker">{t('bookingKicker')}</div>
          <h1 className="section-heading">{t('bookingPageTitle')}</h1>
          <p className="section-intro">{t('bookingPageDescription')}</p>
        </div>
      </section>
      <BookingForm />
      <Footer />
    </main>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/booking" component={BookingPage} />
        <Route path="/" component={Home} />
        <Route component={LocalizedNotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <RouteScrollManager />
            <RouteMetadata />
            <Router />
          </WouterRouter>
          <Toaster />
        </LanguageProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;