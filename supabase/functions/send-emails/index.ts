// Supabase Edge Function: send-emails
//
// Wire this up as a Database Webhook (Supabase dashboard → Database → Webhooks)
// that fires on INSERT into `email_queue` and `welcome_queue`, pointing at this
// function's URL. The webhook payload's shape is:
//   { type: "INSERT", table: "email_queue" | "welcome_queue", record: {...} }
//
// Requires these environment variables (set in Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY       — from resend.com
//   RESEND_FROM_ADDRESS   — e.g. "도장 이름 <noreply@yourdomain.com>"
//   SUPABASE_URL          — auto-provided
//   SUPABASE_SERVICE_ROLE_KEY — auto-provided (bypasses RLS to update rows)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_ADDRESS = Deno.env.get('RESEND_FROM_ADDRESS') || 'onboarding@resend.dev';

function tryoutConfirmationEmail(payload: any) {
  const { student_name, date, time, class_name } = payload || {};
  return {
    subject: `[체험 예약 확인] ${student_name} 님`,
    html: `
      <p>안녕하세요, ${student_name} 님의 트라이아웃(체험) 예약이 확인되었습니다.</p>
      <ul>
        <li>날짜: ${date || '추후 안내'}</li>
        <li>시간: ${time || '추후 안내'}</li>
        <li>반: ${class_name || '추후 안내'}</li>
      </ul>
      <p>당일 뵙겠습니다. 문의 사항이 있으시면 언제든 연락 주세요.</p>
    `,
  };
}

function welcomeEmail(studentName: string) {
  return {
    subject: `${studentName} 님, 등록을 환영합니다`,
    html: `
      <p>${studentName} 님의 등록이 완료되었습니다. 저희 도장 가족이 되신 것을 환영합니다!</p>
      <p>출석/일정 관련 안내는 추후 별도로 전달드리겠습니다.</p>
    `,
  };
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend API error: ${res.status} ${await res.text()}`);
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const table = body.table;
    const record = body.record;

    if (table === 'email_queue') {
      if (record.sent) return new Response('already sent', { status: 200 });
      if (record.type === 'tryout_confirmation') {
        const { subject, html } = tryoutConfirmationEmail(record.payload);
        await sendEmail(record.recipient_email, subject, html);
        await supabase.from('email_queue').update({ sent: true }).eq('id', record.id);
        if (record.payload?.tryout_id) {
          await supabase.from('tryouts').update({ confirmation_sent: true }).eq('id', record.payload.tryout_id);
        }
      }
      // invoice / receipt types are handled once those modules exist.
    }

    if (table === 'welcome_queue') {
      if (record.sent) return new Response('already sent', { status: 200 });
      const { subject, html } = welcomeEmail(record.student_name);
      await sendEmail(record.guardian_email, subject, html);
      await supabase.from('welcome_queue').update({ sent: true }).eq('id', record.id);
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
});
