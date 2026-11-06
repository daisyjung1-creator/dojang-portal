-- Paper sheets for belt testing:
--   belt_curriculum: what each belt tests (by the belt the student holds now)
--     — poomsae, basic movements (Korean / English), kicking, board break,
--       board-break spot (#1 / #2) and material.
--   belt_test_entries.plan: per-student overrides { poomsae, break_ko, break_en, note }
--     (black stripes choose their own break).
--   belt_tests.leaders: Leaders Club roles { rows: [{ name, poomsae, sparring, board }], notes }
create table if not exists belt_curriculum (
  belt text primary key,
  sort int not null default 0,
  poomsae text,
  basic_ko text,
  basic_en text,
  kicking text,
  break_ko text,
  break_en text,
  spot text,
  material text,
  updated_at timestamptz not null default now()
);
alter table belt_curriculum enable row level security;
drop policy if exists "belt_curriculum admin" on belt_curriculum;
create policy "belt_curriculum admin" on belt_curriculum for all using (is_admin()) with check (is_admin());

alter table belt_test_entries add column if not exists plan jsonb;
alter table belt_tests add column if not exists leaders jsonb;

insert into belt_curriculum (belt, sort, poomsae, basic_ko, basic_en, kicking, break_ko, break_en, spot, material) values
('White', 1, '', '기본동작', 'Basic movements', '앞올리기, 앞차기, 돌려차기' || chr(10) || 'Front stretch kick, Front kick, Roundhouse kick', '메주먹', 'Hammer fist', '#1', ''),
('Yellow Stripe', 2, '1', '아래막고 주먹지르기' || chr(10) || '몸통막고 주먹지르기' || chr(10) || '얼굴막고 주먹지르기', 'Low blk + pnch' || chr(10) || 'Med blk + pnch' || chr(10) || 'High blk + pnch', '호핑 돌려차기' || chr(10) || 'Hopping roundhouse kick', '앞차기', 'Front Kick', '#2', ''),
('Yellow', 3, '2', '아래막고 주먹지르기' || chr(10) || '몸통막고 주먹지르기' || chr(10) || '얼굴막고 주먹지르기' || chr(10) || '얼굴 지르기', '(With set up)' || chr(10) || 'Low blk + pnch' || chr(10) || 'Med blk + pnch' || chr(10) || 'High blk + pnch' || chr(10) || 'High pnch', 'Kick Down Back – 25', '손날 격파' || chr(10) || '돌려차기', 'Hand Knife' || chr(10) || 'Round House Kick', '#1', ''),
('Green Stripe', 4, '3', '두번 주먹 지르기' || chr(10) || '한손날막기' || chr(10) || '손날 목치기', 'Double pnch' || chr(10) || 'Single hand knf' || chr(10) || 'Hand blade strk', 'RHK ×3 + Backing up RHK ×3 – 7', '팔굽 치기' || chr(10) || '뛰어 앞차기', 'Elbow strike' || chr(10) || 'Jump Front Kick', '#2', ''),
('Green', 5, '4', '양손날 막기' || chr(10) || '편손끝 세워찌르기' || chr(10) || '제비품 손날목치기' || chr(10) || '등주먹 앞치기' || chr(10) || '몸통 바깥막기', 'D hand knf' || chr(10) || 'Spear hand' || chr(10) || 'Open hand high blk + hand blade strk' || chr(10) || 'Back fist' || chr(10) || 'Side block', 'V-step RHK – 25', '주먹지르기' || chr(10) || '옆차기', 'Step in Punch' || chr(10) || 'Cross Step Side Kick', '#1', ''),
('Blue Stripe', 6, '5', '메주먹 치기' || chr(10) || '팔굽 돌려치기' || chr(10) || '메주먹 바깥치기' || chr(10) || '팔굽 표적치기', 'Hammer fist' || chr(10) || 'Elbow strk' || chr(10) || 'Side hammer fist' || chr(10) || 'Target elbow strk', 'Step in Back Kick – 15' || chr(10) || 'Jumping Back Kick – 17', '뛰어 돌려차기' || chr(10) || '뛰어 옆차기', 'Running Jumping Round House' || chr(10) || 'Running Jumping Side Kick', '#2', 'Blue Mat'),
('Blue', 7, '6', '한손날 얼굴 비틀어 막기' || chr(10) || '얼굴 바깥막기' || chr(10) || '바탕손 몸통막기', 'Twist hand knf' || chr(10) || 'Out blk' || chr(10) || 'Palm blk', 'RHK + Double RHK – 15', '뛰어 내려찍기' || chr(10) || '뛰어 뒷차기', 'Jumping Axe Kick' || chr(10) || 'Jumping Back Kick', '#1', ''),
('Red Stripe', 8, '7', '손날 아래막기' || chr(10) || '바탕손 몸통거들어 막기' || chr(10) || '가위막기' || chr(10) || '몸통 헤쳐막기' || chr(10) || '두주먹 젖혀지르기' || chr(10) || '엇걸어 아래막기' || chr(10) || '등주먹 바깥치기', 'Assist open hand low blk' || chr(10) || 'Assist palm blk' || chr(10) || 'Scissor blk' || chr(10) || 'Shoulder blk' || chr(10) || 'Two fist pnch' || chr(10) || 'Cross hand blk' || chr(10) || 'Side back fist strk', 'RHK (Rebound) – 25' || chr(10) || 'Tornado Kick – 15', '손날격파' || chr(10) || '돌개차기', 'Hand Chop' || chr(10) || 'Tornado Kick', '#2', ''),
('Red', 9, '8', '외산틀 막기' || chr(10) || '당겨 턱지르기' || chr(10) || '양손날 막기' || chr(10) || '바탕손 몸통막기' || chr(10) || '거들어 아래막기', 'Single mountain blk' || chr(10) || 'Jaw break' || chr(10) || 'D hand knf' || chr(10) || 'Palm blk' || chr(10) || 'Assist hand low blk', 'Skipping RHK (rebound) – 25' || chr(10) || 'Reverse Kick – 15', '뒤후리기' || chr(10) || '장애물 뛰어 옆차기 (2명)', 'Reverse Kick' || chr(10) || 'Jumping Side Kick (over 2 people)', '#1', 'Blue mat, 2 blocks'),
('Black Stripe', 10, '', '', '', '', '', '', '', '')
on conflict (belt) do nothing;
