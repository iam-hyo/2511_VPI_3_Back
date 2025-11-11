# 📖 유튜브 트렌드 분석기 및 스크립트 생성기

본 프로젝트는 YouTube 인기 동영상 데이터를 수집/분석하여 트렌드 키워드를 도출하고, 관련 영상 기반으로 60초 요약 스크립트를 생성하는 백엔드 API 서버입니다.

## 📌 기능 명세

* **데이터 수집:** 5개 국가(KR, US, JP, IN, VN) 인기 동영상 50개 일 2회 수집
* **데이터 처리:** VPI 예측, Gemini 키워드 추출, 트렌드 점수 계산
* **API 제공:**
    * `GET /api/trends`: 시간/국가별 트렌드 순위 조회
    * `POST /api/related-videos`: 키워드 기반 관련 영상(VPI 상위 4개) 조회
    * `POST /api/generate-script`: 4개 영상 기반 60초 요약 스크립트 생성

## 🏗️ 폴더 구조

```
/YoutubeTrendAnalyzer
├── .env                  <-- API 키 저장 (중요!)
├── .env.example          <-- .env 가이드
├── package.json          <-- 프로젝트 설정
├── index.js              <-- Express 메인 서버
├── /data/                <-- 수집/분석 JSON, TXT 저장소
└── /src                  <-- 전체 로직
    ├── 1_batch/          <-- (실행) 배치 스크립트
    ├── 2_pipeline/       <-- (내부) 데이터 처리 파이프라인
    ├── 3_services/       <-- (내부) 외부 API 연동 (YouTube, Gemini, VPI)
    ├── 4_analysis/       <-- (내부) 트렌드 점수 계산 로직
    ├── 5_api/            <-- (실행) API 엔드포인트 컨트롤러
    ├── 6_repository/     <-- (내부) 파일 시스템(DB) 읽기/쓰기
    └── utils/            <-- (내부) 유틸리티 함수
```

## 🛠️ 1. 설치 및 설정

**요구사항:**
* Node.js (v18.x 이상 권장 - `node-fetch` 및 ES Module 사용)
* npm

**1. 파일 생성**
이 문서에 포함된 모든 파일과 폴더 구조를 로컬 컴퓨터에 생성합니다.

**2. 환경 변수 설정 (매우 중요)**
`package.json`이 있는 루트 폴더에 `.env` 파일을 생성합니다. `.env.example` 파일의 내용을 복사한 뒤, 본인의 실제 API 키로 값을 채워넣습니다.

```.env
# .env.example을 복사해서 .env 파일을 만드세요
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE
YOUTUBE_API_KEY=YOUR_YOUTUBE_API_KEY_HERE
VPI_API_URL=[https://marco-proreduction-darell.ngrok-free.dev/predict/vpi](https://marco-proreduction-darell.ngrok-free.dev/predict/vpi)
```

**3. 의존성 설치**
루트 폴더에서 터미널을 열고 다음 명령어를 실행합니다.

```bash
npm install
```

## 🚀 2. 실행 방법

### A. API 서버 실행 (개발 모드)

`GET /api/trends` 등 API 엔드포인트를 활성화합니다. (파일 변경 시 자동 재시작)

```bash
npm run dev
```

서버가 `http://localhost:3000` 에서 실행됩니다.

### B. 데이터 수집 배치 실행 (수동)

`[Spec 3.0]`의 데이터 수집 및 처리 파이프라인을 수동으로 1회 실행합니다.

```bash
npm run batch
```

이 스크립트를 Crontab 등에 등록하여 "매일 00시, 12시"에 실행되도록 설정할 수 있습니다.

## 📋 3. API 엔드포인트

### 1. 트렌드 조회
* **GET** `/api/trends`
* **Query Params:**
    * `time` (필수): 수집 시간 (예: `20251110_1300` - `data` 폴더의 파일명 기준)
    * `region` (필수): 국가 코드 (예: `KR`)
    * `sortBy` (옵션): `vpi` (기본), `view`, `date`
    * `order` (옵션): `desc` (기본), `asc`
* **응답:** `AnalyzedVideo` 객체 배열

### 2. 관련 비디오 생성
* **POST** `/api/related-videos`
* **Body (JSON):**
    ```json
    {
      "keyword": "검색할 키워드"
    }
    ```
* **응답:** VPI 점수 상위 4개의 YouTube 검색 결과 객체 배열

### 3. 스크립트 생성
* **POST** `/api/generate-script`
* **Body (JSON):**
    ```json
    {
      "videoIds": ["id1", "id2", "id3", "id4"],
      "query": "원본 키워드"
    }
    ```
* **응답:**
    ```json
    {
      "script": "생성된 60초 요약 스크립트 텍스트..."
    }
    ```