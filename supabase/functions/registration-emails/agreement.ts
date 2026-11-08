// @ts-nocheck
// GENERATED from src/lib/agreement.js by scripts/sync-agreement.mjs — edit that file, not this one.
// Champion Hankook Taekwondo — Student Registration & Membership Agreement.
// Shown on the public /join form and printed with each online registration.
// Change AGREEMENT_VERSION whenever the wording changes, so each signed
// registration records which version the family agreed to.
export const AGREEMENT_VERSION = '2026-11-e';

export const SCHOOL = {
  name: 'Champion Hankook Taekwondo',
  address: 'Unit 101B, Millbourne Market Mall, Edmonton, AB T6K 3L6, Canada',
  email: 'hankooktkd@gmail.com',
};

export const INTRO = [
  'This agreement outlines the registration requirements, membership terms, payment policies, attendance rules, safety requirements, and responsibilities of students and parents/guardians at Champion Hankook Taekwondo (hereinafter referred to as “the Dojang”).',
  'All terms are subject to applicable laws of Alberta and Canada.',
];

export const HEARD_FROM = ['Word of Mouth', 'Social Media', 'Search Engine', 'Flyer', 'Other'];

export const FREQUENCIES = [
  { value: '2', label: '2 classes per week', note: '8 guaranteed classes per monthly service period' },
  { value: '3', label: '3 classes per week', note: '12 guaranteed classes per monthly service period' },
  { value: '4', label: '4 classes per week', note: '16 guaranteed classes per monthly service period' },
  { value: 'other', label: 'Other program', note: '' },
];

// Tuition (before 5% GST). three: null = not offered / ask the Dojang.
export const TUITION = {
  2: { month: 150, three: 435 },
  3: { month: 200, three: null },
  4: { month: 200, three: null },
};
export const GST_NOTE = 'All tuition is subject to 5% GST.';

export const PLAN_CHOICES = [
  { value: 'Monthly Credit Card', label: 'Monthly — Pre-Authorized Credit Card', note: 'Your credit card is charged automatically every month' },
  { value: 'Three-Month Credit Card', label: 'Three-Month — Pre-Authorized Credit Card', note: 'Your credit card is charged automatically every three months' },
  { value: 'Three-Month Advance Payment', label: 'Three-Month Advance Payment', note: 'Cash, debit card or e-transfer, three months in advance' },
];

export const EMERGENCY_AUTH = [
  'In the event of an injury or medical emergency, I authorize the Dojang’s staff to provide reasonable first aid within their training, contact emergency services when appropriate, and share necessary information with emergency responders.',
  'The Dojang will make reasonable efforts to contact the parent/guardian or emergency contact as soon as practicable.',
  'This authorization does not replace consent required by law for medical treatment.',
  'Parents/guardians are responsible for informing the Dojang of significant changes affecting the student’s safe participation.',
];

// Parts 4–12: the terms the family reads before signing. Each item is a
// paragraph, or { list: [...] } for bullet points. **text** is shown in bold.
// Parts with initial: true need the parent's initials on the form.
export const TERMS = [
  {
    key: 'p4',
    title: 'Part 4 — Membership & Guaranteed Classes',
    body: [
      'Champion Hankook Taekwondo offers monthly and three-month memberships. **Monthly payment is available only with pre-authorized credit card payments**; members who pay by cash, debit card or e-transfer pay three months in advance.',
      '**Tuition:**',
      { list: ['2 classes per week: **$150 per month**, or **$435 for three months**', '3 or 4 classes per week: **$200 per month**'] },
      'All tuition is subject to 5% GST.',
      'The guaranteed number of classes applies to **each fully paid monthly service period**; for three-month memberships, it applies to each month of the period. Additional regularly scheduled classes may be available depending on the calendar and program schedule.',
      'The Dojang will confirm the membership start date and payment dates by email before the first payment.',
    ],
  },
  {
    key: 'p5',
    initial: true,
    title: 'Part 5 — New Student Cancellation & Refund',
    body: [
      'New students may request cancellation and a refund **before the start of their third scheduled class**.',
      'The cancellation request must be **submitted by email to hankooktkd@gmail.com** and received before the third scheduled class begins.',
      'For an eligible voluntary cancellation, the following deductions will apply:',
      { list: ['**Cancellation Administration Fee: $20**', '**Classes Already Attended: $20 per class**'] },
      'The refund will be calculated by subtracting these amounts from the tuition paid. Deductions will not exceed the amount paid.',
      'After the third scheduled class has begun, **tuition is generally non-refundable for voluntary withdrawal**.',
      'Refunds are issued **within 14 days** to the original payment method.',
      'This initial cancellation policy applies only to new registrations and does not restart with each membership renewal.',
      'These provisions do not limit cancellation or refund rights provided by applicable law. Where the law requires a different refund calculation or prohibits a fee, the legal requirement will prevail.',
    ],
  },
  {
    key: 'p6',
    initial: true,
    title: 'Part 6 — Membership Cancellation & Renewal',
    body: [
      'All membership cancellation requests **must be submitted by email only**. Members wishing to cancel their membership must send a written cancellation request to **hankooktkd@gmail.com**.',
      'The cancellation request must be received **at least 14 calendar days before the next scheduled payment date**. The request must include the student’s full name and requested cancellation date.',
      '**Verbal requests, phone calls, text messages, WhatsApp messages, or in-person notifications will not be accepted** as official membership cancellation requests, except where another cancellation method is required by applicable law.',
      'The Dojang will confirm receipt of the cancellation request by email. **If you do not receive a confirmation within 2 business days, please contact the Dojang**, as your request may not have been received.',
      '**Cancellation Timing:** If the request is received at least 14 calendar days before the next scheduled payment date, the upcoming membership renewal will be cancelled. If the request is received **fewer than 14 calendar days** before the next scheduled payment date, **the upcoming renewal may proceed** according to the agreed membership terms, subject to applicable law and payment authorization rules.',
      '**Refunds After Payment:** Tuition payments already processed are **generally non-refundable** for voluntary cancellation. For three-month memberships, cancellation ordinarily **takes effect at the end of the paid three-month service period**. The 14-day cancellation notice requirement applies to the next scheduled renewal.',
      'Members retain all cancellation, refund, and payment authorization rights provided by applicable law. The 14-day membership cancellation requirement does not restrict a member’s right to cancel a pre-authorized credit card authorization under applicable payment rules.',
    ],
  },
  {
    key: 'p7',
    initial: true,
    title: 'Part 7 — Payment Policy',
    body: [
      '**7.1 Pre-Authorized Credit Card Payments:** Members who select pre-authorized credit card payments may arrange automatic tuition payments monthly or every three months. **A separate Credit Card Authorization must be completed** before automatic charges begin. The authorization will identify the payment amount, frequency, charge date, cancellation process, and applicable rights. **Cancelling the credit card authorization does not automatically cancel the underlying membership agreement** or eliminate valid outstanding charges.',
      '**7.2 Members Not Using Pre-Authorized Credit Card Payments:** Members who do not select pre-authorized credit card payments **must pay tuition for three months in advance**. The following payment methods are accepted:',
      { list: ['Cash', 'Debit Card', 'E-transfer'] },
      'Payment must be completed **before the start of each three-month membership period**. Members are responsible for making their next three-month payment by the applicable renewal date. No automatic credit card charge will occur without a separate Credit Card Authorization.',
      '**7.3 Overdue Payments:** Tuition must be paid by the agreed payment date. If payment is overdue or unsuccessful, the Dojang **may temporarily suspend class participation** after providing reasonable notice and an opportunity to resolve the outstanding balance.',
      '**7.4 Re-Registration Fee:** A **$20 re-registration fee** applies when a student’s membership has ended or been cancelled and the student subsequently registers again. The fee does not apply to an active membership or a temporary payment issue resolved before membership termination.',
      '**7.5 Additional Fees:** Belt testing, tournaments, coaching fees, uniforms, private lessons, and special events are **not included in regular tuition** unless expressly stated. Applicable fees will be disclosed before purchase or registration.',
      '**7.6 Tuition Changes:** The Dojang may change tuition with **at least 30 days’ written notice by email**. The new rate applies from the first payment date after the notice period.',
    ],
  },
  {
    key: 'p8',
    initial: true,
    title: 'Part 8 — Attendance & Make-up Class Policy',
    body: [
      'Students are expected to attend their scheduled classes regularly. If a student cannot attend a class, parents/guardians must **notify the Dojang by email before the missed class**.',
      '**8.1 Personal Absences:**',
      {
        list: [
          '**Make-up classes are available only if the Dojang was notified by email before the missed class.**',
          'Make-up classes must be completed **within 30 calendar days** of the original missed class.',
          'Make-up classes are available only when the student’s membership remains active and tuition for the following monthly service period has been paid.',
          'Make-up classes **require prior approval** and are subject to available space, appropriate age group, and skill level.',
          'Make-up classes cannot be transferred to another student.',
          'Unused make-up classes **expire after 30 calendar days** and are not ordinarily refundable or convertible into tuition credits.',
          'Personal vacations and scheduling conflicts **do not extend the paid membership period**.',
          'Make-up classes are **not available on statutory holidays**.',
        ],
      },
      '**8.2 Dojang Closures & Guaranteed Classes:** The Dojang guarantees the following number of classes per fully paid monthly service period:',
      { list: ['2 classes per week: **8 classes**', '3 classes per week: **12 classes**', '4 classes per week: **16 classes**'] },
      'If a Dojang closure, statutory holiday, or Dojang-initiated cancellation prevents a student from receiving the guaranteed number of classes, the Dojang will schedule appropriate make-up classes. The Dojang will aim to provide these make-up classes **within 60 calendar days** of the affected class date.',
      'Make-up classes arranged due to Dojang closures are separate from personal absence make-ups and do not require payment for an additional membership period. The Dojang will provide reasonable scheduling options appropriate to the student’s age and training level.',
      'If the Dojang cannot reasonably provide the guaranteed classes or suitable make-up opportunities, an appropriate adjustment or remedy will be provided in accordance with applicable law.',
      '**8.3 Injury or Illness:** If a student cannot train because of an injury or illness, the Dojang will, **on receipt of a doctor’s note**, either extend the membership period or give a tuition credit for the classes missed.',
    ],
  },
  {
    key: 'p9',
    title: 'Part 9 — Class Schedule, Program & Agreement Changes',
    body: [
      'The Dojang may make reasonable adjustments to class schedules, instructors, or training groups for operational, educational, or safety reasons.',
      'Reasonable advance notice of material changes will be provided whenever practicable.',
      'If a material change substantially affects the Dojang’s ability to provide the agreed training services, the Dojang will discuss appropriate alternatives or adjustments with the member, subject to applicable law.',
      '**Changes to this agreement:** The Dojang may update these terms with **at least 30 days’ written notice by email**. The updated terms apply to the membership after that date; members who do not agree may cancel under Part 6.',
    ],
  },
  {
    key: 'p10',
    title: 'Part 10 — Student Conduct & Safety',
    body: [
      'Students are expected to:',
      {
        list: [
          'Follow reasonable instructions from coaches and instructors.',
          'Treat instructors, students, and families with respect.',
          'Use protective equipment when required.',
          'Avoid unsafe, aggressive, or inappropriate behaviour.',
          'Report injuries or unsafe conditions promptly.',
          'Follow the Dojang’s safety and training rules.',
        ],
      },
      'The Dojang may take reasonable disciplinary action, including **temporary suspension or termination of membership**, for serious or repeated misconduct. Disciplinary decisions will consider the circumstances, student age, seriousness of the conduct, and safety of others. If the Dojang terminates a membership, **any unused prepaid tuition will be refunded**.',
      '**Drop-off and pick-up:** The Dojang supervises students only during their scheduled class time. Parents/guardians are responsible for students before and after class and must **pick students up on time**.',
    ],
  },
  {
    key: 'p11',
    initial: true,
    title: 'Part 11 — Acknowledgment of Risks',
    body: [
      'Taekwondo is a physical activity involving kicking, striking, sparring, falling, stretching, and other movements that **may result in injury**. Potential risks include bruises, sprains, fractures, concussions, and other injuries, **including serious injuries**.',
      'I understand that participation involves **inherent risks even when reasonable safety precautions are taken**. I agree to follow the Dojang’s safety instructions and inform instructors of relevant limitations or injuries.',
      'For a minor student, I consent to the student’s participation in training activities appropriate to their age, ability, and registered program.',
      'This acknowledgment does not waive rights or legal protections that cannot lawfully be waived, including rights belonging to a minor.',
    ],
  },
  {
    key: 'p12',
    title: 'Part 12 — Privacy & Personal Information',
    body: [
      'Champion Hankook Taekwondo collects and uses personal information reasonably necessary for student registration, communication, billing, attendance management, safety, and administration.',
      'Relevant information may be shared with authorized staff, payment providers, insurers, or emergency responders where reasonably necessary and legally permitted.',
      'Personal information will be protected using reasonable security measures and retained only as long as reasonably required for legitimate business or legal purposes.',
      'Members may contact the Dojang to request access to their personal information, request corrections, or ask questions about privacy practices. Privacy Contact: Champion Hankook Taekwondo — hankooktkd@gmail.com',
      'I agree to receive **emails and text messages from the Dojang** about classes, schedules, events, billing and my account. I can unsubscribe from non-essential messages at any time.',
    ],
  },
];

// "**bold**" → [{ text, bold }] pieces.
export function boldParts(text) {
  return String(text).split(/\*\*(.+?)\*\*/g).map((t, i) => ({ text: t, bold: i % 2 === 1 })).filter((p) => p.text);
}
export const plainText = (text) => String(text).replace(/\*\*(.+?)\*\*/g, '$1');

export const PHOTO_NOTE = [
  'The Dojang may photograph or record classes, events, and student activities.',
  'Choosing NO will not affect the student’s eligibility to register or participate in regular classes.',
  'Consent may be withdrawn for future promotional use by contacting the Dojang in writing. The Dojang will take reasonable steps to stop future use and remove material under its control where reasonably practicable. Previously distributed materials or third-party copies may not be fully retrievable.',
];
export const PHOTO_YES = 'YES, I consent to the use of the student’s identifiable photographs and videos for the Dojang’s website, social media, printed promotional materials, and related promotional publications.';
export const PHOTO_NO = 'NO, I do not consent to the use of the student’s identifiable photographs or videos for promotional purposes.';

export const ACKNOWLEDGMENTS = [
  'The registration information provided is accurate to the best of my knowledge.',
  'I have reviewed the membership terms, payment policies, cancellation provisions, and safety information.',
  'I understand the membership type, tuition amount (Part 4), payment dates, and applicable term.',
  'I understand the guaranteed class frequency and make-up class conditions.',
  'I understand that membership cancellation requests must be submitted by email at least 14 calendar days before the next scheduled payment date.',
  'I understand that membership cancellation and cancelling the credit card authorization are separate processes.',
  'I agree to the terms of this agreement, subject to my rights under applicable law.',
  'I have received or will receive a copy of the completed agreement.',
  'I agree that my typed name and drawn signature are my electronic signature and have the same effect as a handwritten signature.',
];
