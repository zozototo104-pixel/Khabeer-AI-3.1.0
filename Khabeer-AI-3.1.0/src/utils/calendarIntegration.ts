export interface CalendarEventDetails {
  title: string;
  description?: string;
  location?: string;
  startDate: Date | string;
  endDate?: Date | string;
  durationMinutes?: number;
  attendees?: string[];
  meetingLink?: string;
}

export function generateGoogleCalendarUrl(event: CalendarEventDetails): string {
  const start = new Date(event.startDate);
  let end: Date;

  if (event.endDate) {
    end = new Date(event.endDate);
  } else {
    end = new Date(start.getTime() + (event.durationMinutes || 60) * 60 * 1000);
  }

  const formatGoogleDate = (d: Date) => {
    return d.toISOString().replace(/-|:|\.\d\d\d/g, '');
  };

  const datesParam = `${formatGoogleDate(start)}/${formatGoogleDate(end)}`;
  
  let detailsText = event.description || '';
  if (event.meetingLink) {
    detailsText += `\n\nرابط الاجتماع المباشر: ${event.meetingLink}`;
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: datesParam,
    details: detailsText,
    location: event.location || 'غرفة اجتماعات مجلس الإدارة',
  });

  if (event.attendees && event.attendees.length > 0) {
    params.set('add', event.attendees.join(','));
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadICSFile(event: CalendarEventDetails, fileName?: string) {
  const start = new Date(event.startDate);
  let end: Date;

  if (event.endDate) {
    end = new Date(event.endDate);
  } else {
    end = new Date(start.getTime() + (event.durationMinutes || 60) * 60 * 1000);
  }

  const formatICSDate = (d: Date) => {
    return d.toISOString().replace(/-|:|\.\d\d\d/g, '');
  };

  const uid = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}@smartadvisor.ai`;
  const now = formatICSDate(new Date());

  let desc = (event.description || '').replace(/\n/g, '\\n');
  if (event.meetingLink) {
    desc += `\\n\\nرابط الانضمام: ${event.meetingLink}`;
  }

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Smart Advisor AI//Meeting Management//AR',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${event.title.replace(/\n/g, ' ')}`,
    `DESCRIPTION:${desc}`,
    `LOCATION:${(event.location || 'مقر المؤسسة').replace(/\n/g, ' ')}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
  ];

  if (event.attendees && event.attendees.length > 0) {
    event.attendees.forEach(email => {
      icsLines.push(`ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=${email}:mailto:${email}`);
    });
  }

  icsLines.push('END:VEVENT', 'END:VCALENDAR');

  const icsContent = icsLines.join('\r\n');
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || `${event.title.replace(/\s+/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateMeetingInviteText(event: CalendarEventDetails & { orgName?: string; agenda?: string }): string {
  const start = new Date(event.startDate);
  const formattedDate = start.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const formattedTime = start.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  const googleCalUrl = generateGoogleCalendarUrl(event);

  return `
📢 *دعوة لحضور اجتماع رسمي*
المؤسسة: ${event.orgName || 'مجلس الإدارة'}
الموضوع: *${event.title}*

📅 *الموعد:* ${formattedDate}
⏰ *الوقت:* ${formattedTime}
📍 *المقر / الرابط:* ${event.location || 'المقر الرئيسي للمؤسسة'}
${event.meetingLink ? `🔗 *رابط الانضمام الافتراضي:* ${event.meetingLink}\n` : ''}
📝 *جدول الأعمال والأجندة:*
${event.agenda || event.description || 'مناقشة الموضوعات والقرارات الاستراتيجية المطروحة.'}

📅 *إضافة سريعة إلى تقويم Google Calendar:*
${googleCalUrl}

نرجو التكرم بتأكيد الحضور. مع أطيب التحيات.
  `.trim();
}
