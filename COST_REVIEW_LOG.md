# Firebase/서버 비용 리스크 검토 로그

> 작성일: 2026-03-25
> 담당: server-cost-manager 에이전트
> 검토 기준: BM_IDEAS.md (2026-03-25 작성본)
> 코드 참조: `src/app/ranking/page.tsx`, `src/components/ProfileView.tsx`

---

## 현재 베이스라인 비용 구조 (검토 전제)

코드 분석에서 파악된 현재 Firestore 접근 패턴:

| 페이지/컴포넌트 | 현재 Read 발생 방식 | 캐시 전략 |
|---|---|---|
| `/ranking` (ranking/page.tsx) | `matches` 컬렉션 전체 + `teams` 컬렉션 전체 getDocs | `revalidate = 3600` (1시간 서버 캐시) |
| `/profile` (ProfileView.tsx) | `matchRatings` where userId 쿼리 + 각 matchId별 개별 getDoc | 캐시 없음, 매 방문마다 Read 발생 |

**ProfileView.tsx의 N+1 패턴 주의**: 유저가 N경기 평점을 남겼으면, 1번의 collection 쿼리 + N번의 개별 `getDoc` 호출이 발생함. 유저당 평점 경기 수가 많아질수록 Read 비용이 선형 증가.

---

## BM별 Firebase 비용 리스크 분석

---

### BM 1. 팀·선수 스폰서 배너 (Contextual Native Ad)

**추가 Firestore Read/Write 발생량 추정**

- **Read**: 거의 없음. 광고 이미지 URL과 링크를 코드에 하드코딩하거나 환경변수로 관리하면 Firestore 접근 불필요.
- **Write**: 없음.
- **유일한 비용 요소**: 광고 소재를 Firestore에 저장하고 동적으로 불러오는 구조로 설계할 경우에만 Read 1~2건/페이지뷰 추가 발생. 그러나 BM 설명대로 "이미지 URL만 바꾸면 운영"하는 정적 방식이면 비용 영향 없음.

**비용 위험도: 낮음**

**비용 최소화 방법**
- 광고 소재(이미지 URL, 링크 URL)를 환경변수(`.env`) 또는 Next.js 설정 파일로 관리. Firestore 호출 0건.
- 광고주 교체 시에도 Vercel 환경변수 수정만으로 처리 → 재배포 없이도 운영 가능하게 하려면 Firestore 1개 문서로 관리하되, `/ranking`과 동일하게 `revalidate = 3600` ISR 캐시 적용.
- 광고 클릭 수 집계가 필요하면 Firestore Write 대신 Google Analytics 이벤트로 대체.

---

### BM 2. 프리미엄 평점 카드 다운로드 (디지털 굿즈)

**추가 Firestore Read/Write 발생량 추정**

- **Read**: 결제 완료 후 카드 생성 시 유저의 구매 상태 확인 1회/요청. 카드 생성 자체는 클라이언트 사이드 `html-to-image`이므로 Firestore 접근 없음.
- **Write**: 결제 완료 시 구매 이력 저장 1건/구매.
- **추정 규모**: 초기 월 10~500건 구매 기준 → 월 추가 Read 10~500건 + Write 10~500건. Firestore 무료 한도(읽기 5만건/일, 쓰기 2만건/일) 내에서 충분히 소화 가능.
- **주의**: 구매 상태 확인을 매 페이지 로드마다 수행하면 MAU 1,000명 기준 Read가 급증할 수 있음. 클라이언트 세션 캐싱 필수.

**비용 위험도: 낮음**

**비용 최소화 방법**
- 구매 상태를 Firebase Auth Custom Claims 또는 로컬 세션(localStorage)에 캐싱 → 재방문 시 Firestore Read 재발생 차단.
- 결제 검증은 Cloud Functions(서버사이드)에서 1회만 수행하고, 검증 결과를 Custom Claims에 기록하는 구조 추천.
- 프리미엄 여부를 유저 문서 1개의 필드로 관리(별도 컬렉션 X) → 읽기 최소화.

---

### BM 3. 예측 왕 시즌 뱃지 & 프리미엄 프로필 (구독)

**추가 Firestore Read/Write 발생량 추정**

- **Read**: 프리미엄 통계(예측 정확도, 뱃지 데이터) 조회. 현재 ProfileView.tsx는 이미 `matchRatings` 쿼리 + N건의 개별 getDoc (N+1 패턴) 구조임. 예측 정확도 통계를 추가하면 `predictions` 컬렉션 쿼리 1건 + 각 경기별 getDoc N건이 추가로 발생할 가능성이 높음.
- **Write**: 뱃지 부여 시 유저 문서 업데이트 1건/시즌, 구독 상태 업데이트 1건/결제.
- **위험 시나리오**: 프리미엄 프로필 페이지 방문 시 Read가 현재보다 2~3배 증가 가능. 코어 유저(하루 여러 번 방문)가 주 타겟이므로 방문 빈도 높음 → 비용 리스크 중간.
- **추정 규모**: 구독자 100명이 하루 평균 2회 방문, 유저당 평균 20경기 평점 → 100 × 2 × (1 + 20) × 2(예측 추가) = 8,400 Read/일. 무료 한도(5만 Read/일) 내이나 MAU 성장 시 비율적으로 증가.

**비용 위험도: 중간**

**비용 최소화 방법**
- **ProfileView.tsx의 N+1 패턴 개선이 선행 필수**: 개별 `getDoc` 루프 대신 matchId 배열을 Firestore `in` 쿼리(최대 30건)로 배치 조회하도록 리팩터링. Read 횟수 최대 ~30배 감소.
- 예측 정확도 통계는 실시간 집계 대신 Cloud Functions(Scheduled Function)로 매 경기 종료 후 1회만 집계하여 유저 문서에 저장 → 프로필 조회 시 Read 1건으로 해결.
- 뱃지 데이터를 별도 컬렉션이 아닌 유저 문서 내 배열 필드로 관리.
- 구독 상태는 Firebase Auth Custom Claims에 저장 → 프로필 페이지 진입 시 Firestore Read 불필요.

---

### BM 4. LCK 경기 분석 뉴스레터 (후원형 + 광고)

**추가 Firestore Read/Write 발생량 추정**

- **Read**: 주 1회 뉴스레터 발행 시 데이터 집계 목적으로 Firestore 쿼리 발생. 현재 랭킹 페이지(`/ranking`)와 동일한 `matches` + `teams` 컬렉션 getDocs.
- **Write**: 없음 (뉴스레터 구독자 이메일은 Stibee 등 외부 서비스에서 관리).
- **추정 규모**: 주 1회 집계 스크립트 실행 → matches 전체 getDocs(예: 100문서) + teams 전체 getDocs(예: 10문서) = 약 110 Read/주. 극히 미미한 수준.
- **뉴스레터 구독 폼을 Firestore에 연동할 경우**: 구독 신청 1건당 Write 1건 추가. 구독자 200명 목표 기준 최대 200 Write. 무료 한도 내.

**비용 위험도: 낮음**

**비용 최소화 방법**
- 뉴스레터 집계 스크립트 실행 시 랭킹 페이지의 ISR 캐시(`revalidate = 3600`)된 데이터를 재활용할 수 없으므로, **별도의 Admin SDK 스크립트**로 서버에서 1회 실행. Firestore Read는 실행 횟수(주 1회)에만 비례하므로 비용 무시 가능.
- 구독자 이메일은 Stibee/메일리 등 외부 서비스에서 관리 (BM 설명대로). Firestore에 이메일 저장 불필요.
- 자동화 스크립트는 Cloud Functions Scheduled (Pub/Sub 트리거) 대신 GitHub Actions Cron으로 무료 실행 가능 (월 2,000분 무료).

---

### BM 5. 선수 응원 도네이션 (팬덤 집단 후원)

**추가 Firestore Read/Write 발생량 추정**

- **Read**:
  - 선수 프로필 페이지 진입 시 해당 선수의 누적 응원 금액 + 도네이터 목록 조회: 1~2 Read/방문.
  - 도네이션 완료 후 최신 목록 갱신: 1 Read/도네이션.
- **Write**:
  - 도네이션 1건당: 도네이션 문서 생성 1 Write + 선수 문서의 누적 금액 업데이트 1 Write = 2 Write/건.
  - 인기 선수 경기 직후 100건 도네이션 시 200 Write 동시 발생.
- **위험 시나리오**: Faker, Chovy 등 인기 선수 경기 직후 수백 건의 도네이션이 단시간에 집중되면 Firestore Write 급등. 선수 문서의 누적 금액 필드를 여러 클라이언트가 동시에 업데이트하면 **트랜잭션 충돌 또는 데이터 정합성 문제** 발생 가능.
- **도네이터 닉네임 목록 표시**: 도네이션이 많을수록 목록 Read 비용 증가. 선수당 도네이터 1,000명이면 목록 조회 시 Read 수백 건 가능.

**비용 위험도: 높음**

**비용 최소화 방법**
- 선수별 누적 응원 금액은 개별 도네이션 문서를 실시간 집계하지 말고, **Firestore 분산 카운터(Distributed Counter)** 패턴 또는 Cloud Functions 트리거로 원자적 집계. 클라이언트 직접 Write 금지.
- 도네이터 목록은 전체 표시 대신 최근 N명(예: 최신 20명)만 쿼리 (`orderBy('createdAt', 'desc').limit(20)`).
- 결제 검증은 반드시 Cloud Functions(서버사이드)에서 수행. 클라이언트가 직접 Firestore에 도네이션 Write하는 구조는 위변조 리스크 + 비용 리스크 모두 존재.
- 초기 실험(BM 설명대로 "Buy Me a Coffee / toss.me 링크" 방식)은 Firestore Write 0건. 이 단계에서는 비용 리스크 없음. 자체 결제 모듈 전환 시에만 위 아키텍처를 적용.
- 실시간 도네이션 피드(선수 프로필에 도네이터 실시간 표시)가 필요하면 Firestore Realtime Listener 대신 단순 주기적 폴링(30초 간격) 또는 페이지 진입 시 1회 조회로 제한.

---

## 종합 비용 위험도 요약

| BM | 비용 위험도 | 핵심 위험 요인 | 우선 조치 |
|---|---|---|---|
| BM 1. 네이티브 배너 | 낮음 | 없음 (정적 방식 유지 시) | 광고 소재 환경변수 관리 |
| BM 2. 프리미엄 카드 | 낮음 | 구매 상태 확인 중복 Read | Custom Claims 캐싱 |
| BM 3. 프리미엄 프로필 | 중간 | ProfileView N+1 패턴 + 예측 통계 추가 Read | N+1 리팩터링 선행 + 통계 사전 집계 |
| BM 4. 뉴스레터 | 낮음 | 없음 (외부 서비스 활용 시) | 집계 스크립트 GitHub Actions화 |
| BM 5. 응원 도네이션 | 높음 | 인기 선수 경기 후 Write 급등 + 목록 Read 비용 | 분산 카운터 + Cloud Functions 서버사이드 처리 |

---

## 현재 코드에서 발견된 기존 비용 리스크 (BM 무관)

BM 도입 전에 해결이 필요한 기존 패턴:

1. **ProfileView.tsx N+1 문제** (`src/components/ProfileView.tsx`, 63~81행)
   - `rawRatings.map(async (r) => getDoc(...))` 구조로 유저가 평점 남긴 경기 수만큼 개별 Read 발생.
   - BM 3(프리미엄 프로필) 도입 전 반드시 `in` 쿼리 배치 처리로 전환 필요.

2. **랭킹 페이지 전체 컬렉션 스캔** (`src/app/ranking/page.tsx`, 14~16행)
   - `getDocs(collection(db, 'matches'))` 전체 스캔. 경기 수가 수백 건을 넘어가면 Read 비용이 선형 증가.
   - `revalidate = 3600`으로 현재는 방어되고 있으나, 시즌이 쌓일수록 재검토 필요.
   - 장기적으로는 시즌 ID 필터 또는 집계 문서(Aggregation Document) 패턴으로 전환 권장.

---

*다음 검토 시점: BM 실험 시작 후 첫 번째 Firebase 청구서 수신 시 또는 MAU 1,000명 도달 시*
