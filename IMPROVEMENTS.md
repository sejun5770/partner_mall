# Improvements

partner_mall B2B 정산 시스템의 개선 내역입니다.

## 프로젝트 개요

- **스택**: Next.js 16.2.4 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4
- **데이터 소스**: bar_shop1 (MSSQL / Azure) · DD wedding (MySQL)
- **인증**: JWT (httpOnly cookie) + bar_shop1.COMPANY 테이블 기반 로그인
- **주요 페이지**: `/settlement` (정산), `/order`, `/product`, `/partner`, `/dashboard`

## 최근 개선 내역

### 1. 정산 페이지 리팩토링 (UI / 보안 / 역할)
- 레거시 깨진 CSS(`form_wrap`, `btn purple2`, `type12` 등) 전면 제거, 시멘틱 HTML + Tailwind로 재작성
- `GET /api/settlement`의 쿼리 파라미터 기반 `partnerShopId` 조작 취약점 차단 — 서버에서 auth 토큰으로 강제 도출
- 관리자/제휴사 역할 분리: `PartnerUser.isAdmin` 추가, 관리자는 전체/특정 제휴사 필터, 제휴사는 본인 건만

### 2. 데이터 소스 bar_shop1 전환
- 정산 쿼리를 MySQL DD → MSSQL bar_shop1로 이관 (`custom_order` JOIN `COMPANY` JOIN `custom_order_item` JOIN `S2_Card`)
- 신규 유틸: `src/lib/brand.ts` (S2_Card CardBrand 18종 → 한글명), `src/lib/commission.ts` (수수료율 추상화)
- 월/기간 필터, 전월/당월 바로가기, 제휴사 드롭다운 + 이름 부분일치 검색

### 3. 정산 대상 주문 필터링
- `src_send_date IS NOT NULL` (발송완료) 만 집계
- 내부 자체 주문(`LOGIN_ID = 's2_barunsoncard'`) 제외
- 월 필터 기준을 `order_date` → `src_send_date`로 전환 (월 정산은 발송월 기준)

### 4. 컬럼 확장 (운영 화면 동등화)
- 주문자(`custom_order.order_name`), 신랑·신부(`custom_order_WeddInfo.groom_fname`, `bride_fname` — 성 제외 이름), 예식장(`wedd_name`)
- 결제일·배송일 모두 `src_send_date`로 표시 (발송완료 시점 일자)
- **결제금액** = `custom_order.last_total_price` — 오늘출발료 · 제본료 · 쿠폰할인 등 부가비용/할인이 모두 반영된 최종 총액

### 5. 환경/설정 안정화
- `.env.local`의 MSSQL/MySQL 비밀번호에 포함된 `#`가 dotenv 주석 파싱으로 잘리는 버그 수정 (따옴표 감싸기)
- `globals.css`의 공격적 레거시 리셋이 Tailwind 4 유틸을 덮어쓰던 문제 해결 — 필요한 로그인/헤더/푸터 스타일만 `.app-header` / `.app-footer`로 스코프 보존

## 남은 TODO

- 플래너명 컬럼 확정 (`custom_order` 또는 `custom_order_WeddInfo`의 어느 필드인지 실DB 확인 필요)
- bar_shop1.COMPANY의 수수료율 컬럼 확정 → `getCommissionRate()` 내부 DB 조회로 교체 (현재는 `DEFAULT_COMMISSION_RATE` env fallback)
- `COMPANY_SEQ` ↔ DD `partner_shop.id` 매핑 확정 후 DD wedding 데이터 UNION
- 관리자 플래그 컬럼명 확정 → `isAdminLoginId()`를 COMPANY 컬럼 조회로 교체 (현재는 `ADMIN_LOGIN_IDS` CSV env fallback)
- `order` / `product` / `partner` / `dashboard` 페이지도 정산과 동일한 Tailwind 기반으로 UI 정리
- Next.js 16에서 deprecated된 `middleware` → `proxy` 파일 규칙 마이그레이션
- 엑셀 다운로드, 월 정산 확정/이력(closing) 테이블 설계

## 배포 참고

- Node.js 20 이상 권장
- 필수 환경변수: `MSSQL_SERVER`, `MSSQL_PORT`, `MSSQL_USER`, `MSSQL_PASSWORD`, `MSSQL_DATABASE`, `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `JWT_SECRET`
- 선택 환경변수: `ADMIN_LOGIN_IDS` (CSV), `DEFAULT_COMMISSION_RATE` (기본 10), `DEV_AUTH_BYPASS`, `DEV_ADMIN`
- 비밀번호에 `#` 등 특수문자가 있으면 반드시 따옴표로 감싸기 (`PASSWORD="..."`)
- 빌드: `npm run build` / 실행: `npm start` (기본 포트 3000)
