# 도장 포털

React(Vite) + Supabase + Netlify로 만든 태권도 도장 관리 포털입니다.

## 1. Supabase 설정

1. [supabase.com](https://supabase.com)에서 새 프로젝트 생성
2. 왼쪽 메뉴 SQL Editor → `supabase/schema.sql` 내용을 붙여넣고 실행
   (테이블, 권한(RLS), 기본 기타비용 항목까지 한 번에 생성됩니다)
3. 이어서 `supabase/migrations/002_leads_tryouts_attendance.sql` 내용도 SQL Editor에서 실행
   (재원/퇴원 상태, 문의-학생 연결, 보강 크로스클래스, 이메일 큐, 트라이아웃 확인메일 관련 컬럼/테이블 추가)
4. Authentication → Users에서 원장님 계정을 이메일/비밀번호로 하나 생성
5. SQL Editor에서 아래를 실행해 그 계정을 관리자로 지정
   ```sql
   update profiles set role = 'admin' where id = '<위에서 만든 유저의 UUID>';
   ```
6. 직원 계정은 같은 방식으로 Authentication → Users에서 추가 생성 (역할은 자동으로 staff)
7. Project Settings → API에서 `Project URL`과 `anon public key` 복사

## 2. 로컬 실행

```bash
npm install
cp .env.example .env   # 위에서 복사한 값 채워넣기
npm run dev
```

## 3. GitHub에 올리기

```bash
git init
git add .
git commit -m "Initial commit: dojang portal"
git remote add origin <내 GitHub 저장소 주소>
git push -u origin main
```

## 4. Netlify 배포

1. Netlify에서 "Add new site" → "Import an existing project" → GitHub 저장소 선택
2. Build command: `npm run build`, Publish directory: `dist` (이미 `netlify.toml`에 설정되어 있어 자동 인식됩니다)
3. Site settings → Environment variables에 `.env`와 동일하게 추가:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

## 5. 자동 이메일 발송 (트라이아웃 확인 메일, 환영 메일)

1. [resend.com](https://resend.com)에서 계정 생성 (무료 티어로 충분), API 키 발급
2. Supabase 프로젝트 → Edge Functions → `send-emails` 배포 (`supabase/functions/send-emails`)
   ```bash
   supabase functions deploy send-emails
   ```
3. Edge Functions → Secrets에 추가:
   - `RESEND_API_KEY`
   - `RESEND_FROM_ADDRESS` (예: `도장 이름 <noreply@내도메인.com>`, 도메인 인증 전이면 `onboarding@resend.dev`로 테스트 가능)
4. Database → Webhooks에서 두 개 생성, 둘 다 위에서 배포한 함수 URL로:
   - `email_queue` 테이블 INSERT 시 호출
   - `welcome_queue` 테이블 INSERT 시 호출

이 설정 전까지는 트라이아웃/신규등록에서 이메일이 "대기중"으로만 쌓이고 실제 발송은 되지 않습니다.

## 권한 구조

- **관리자(admin)**: 모든 메뉴 접근 가능
- **직원(staff)**: 출석·보강수업만 접근 가능 (상담문의/트라이아웃/신규등록/회계는 화면에서도 숨겨지고, 데이터베이스 권한(RLS)에서도 차단됨)

## 6. 인보이스 모듈 (Express Invoice 대체)

메뉴: **Invoices · Payments · Customers · Sales & GST · Invoice Settings** (관리자 전용)

설치 순서:
1. Supabase SQL Editor에서 `supabase/migrations/005_invoicing.sql` 실행 (여러 번 실행해도 안전)
2. 포털 → **Invoice Settings**: 회사 정보·로고 확인, **Next invoice # / Next receipt #** 를 Express Invoice 마지막 번호 +1로 맞추기
3. **Invoice Settings → Items → Import**: Express Invoice 품목 목록(Item, Description, Tax, Value 열) CSV/엑셀 가져오기 → Save Items
4. **Customers → Import**: Express Invoice 고객 목록 CSV/엑셀 가져오기. Balance 열을 연결하면 남은 미수금이 번호 없는 "Opening balance"로 옮겨짐 (매출·GST 보고서에는 포함 안 됨)
5. **Customers → From Students**: 학생의 보호자 정보로 고객을 만들고 연결 (형제는 같은 이메일이면 한 고객으로)
6. 이메일 발송: `send-emails` 함수 배포 (`invoiceDocs.ts` 포함) + `006_email_triggers.sql` 실행 + Secrets에 `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`. 웹훅은 따로 만들 필요 없음 (006이 대신함). 인보이스는 PDF 첨부, 영수증은 본문 메일

기능:
- 인보이스 작성 (품목 선택, 수량, GST 자동 5%, GST 없는 품목 지원, 연결된 학생 수업료 한 번에 추가, "Paid now"로 바로 결제 기록)
- 인보이스 미리보기 / 인쇄 / PDF 저장 / 이메일 / 무효(Void) / 결제 적용
- 결제 기록 (영수증 번호 자동, 결제 방법별 합계, 영수증 이메일)
- 고객 목록 (잔액, 미납 기한, 마지막 인보이스, 거래 명세서)
- 월별 매출, GST, 분기별 GST, 입금액, 미수금 보고서 + CSV 내보내기

## 아직 만들어지지 않은 부분

- 반복 인보이스(매달 자동 생성), 견적서, 크레딧 노트/환불
- 자동 이메일 발송은 위 5번 설정을 마쳐야 실제로 나갑니다 (설정 전엔 대기열에만 쌓임)

## 이번에 추가된 것

- 상담문의에서 과거(퇴원 포함) 학생을 이름/연락처로 검색해 연결 가능, 등록 전환 시 새 레코드 대신 기존 기록을 재활성화
- 트라이아웃 예약 생성 시 `email_queue`에 확인메일이 큐잉됨 (발송은 5번 설정 필요)
- 출석 체크인 화면에 보강생(다른 반 소속) 표시 — 보강수업에서 예약일+반을 지정하면 그 반 체크인 화면에 "보강" 배지로 함께 표시
