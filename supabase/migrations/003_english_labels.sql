-- Switches stored default/seed values from Korean to English to match the
-- now-English app UI. Safe to run even if some rows already exist.

-- ── Fee items: translate the seeded names ──────────────────────────────
update fee_items set name = 'Uniform Fee' where name = '도복비';
update fee_items set name = 'Belt Test Fee' where name = '승급심사비';
update fee_items set name = 'Competition Fee' where name = '대회참가비';
update fee_items set name = 'Other' where name = '기타';

-- ── Students: English belt names and status default ────────────────────
alter table students alter column belt set default 'White Belt';
update students set belt = 'White Belt' where belt = '흰띠';
update students set belt = 'Yellow Belt' where belt = '노란띠';
update students set belt = 'Green Belt' where belt = '초록띠';
update students set belt = 'Blue Belt' where belt = '파란띠';
update students set belt = 'Red Belt' where belt = '빨간띠';
update students set belt = 'Black Belt' where belt = '검은띠';

-- ── Leads: English status default + any existing rows ──────────────────
alter table leads alter column status set default 'New Inquiry';
update leads set status = 'New Inquiry' where status = '신규문의';
update leads set status = 'Consultation Scheduled' where status = '상담예정';
update leads set status = 'Consultation Done' where status = '상담완료';
update leads set status = 'Enrolled' where status = '등록완료';
update leads set status = 'Not Enrolled' where status = '미등록';

-- ── Tryouts: English status default + any existing rows ────────────────
alter table tryouts alter column status set default 'Scheduled';
update tryouts set status = 'Scheduled' where status = '예정';
update tryouts set status = 'Attended' where status = '참석완료';
update tryouts set status = 'No-show' where status = '노쇼';
update tryouts set status = 'Converted' where status = '등록전환';

-- ── Charges: English status default, constraint, and any existing rows ─
alter table charges drop constraint if exists charges_status_check;
update charges set status = 'Paid' where status = '완납';
update charges set status = 'Unpaid' where status = '미납';
alter table charges alter column status set default 'Unpaid';
alter table charges add constraint charges_status_check check (status in ('Unpaid', 'Paid'));
