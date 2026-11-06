-- Promotion test report scores per student, and the sparring pairings per test.
--   belt_test_entries.scores: { poomsae: [0-3 ×5], basic: [×2], kicking: [×2],
--     sparring: [×5], board: [×3], mental: [×3], comments: { section: text } }
--   belt_tests.bracket: [{ red: student_id, blue: student_id }]
--   belt_tests.examiner: name printed on the report (default Grand Master)
alter table belt_test_entries add column if not exists scores jsonb;
alter table belt_tests add column if not exists bracket jsonb;
alter table belt_tests add column if not exists examiner text;
