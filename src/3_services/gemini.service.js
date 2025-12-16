// /src/3_services/gemini.service.js
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
const KEYWORD_MODEL = process.env.GEMINI_MODEL;
const SCRIPT_MODEL = process.env.GEMINI_MODEL; // (또는 "gemini-pro")
const EMBEDDING_MODEL = process.env.GEMINI_EMBED_MODEL;

/**
 * Gemini API 범용 호출 함수
 */
export async function generateContent(model, prompt, isJson = false) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const safePrompt =
    typeof prompt === 'string'
      ? prompt
      : JSON.stringify(prompt, null, 2)

  const body = {
    contents: [{ parts: [{ text: safePrompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      ...(isJson && { responseMimeType: 'application/json' }),
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY, },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorDetail = await res.json().catch(() => ({})); // JSON 파싱 시도
    console.error("❌ Gemini API 상세 에러:", JSON.stringify(errorDetail, null, 2));

    // 에러 메시지에 상세 내용을 포함시킵니다.
    throw new Error(`Gemini API 오류(${res.status}): ${errorDetail.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}


/*
* [키워드 프롬프트 생성] 
*/
export function buildKeywordPrompt({ count, language = 'ko' }) {
  return `
당신은 유튜브 메타데이터 분석가입니다.
각 영상의 제목과 설명을 바탕으로 영상의 핵심 주제를 담은 ${language === 'ko' ? '한글' : language} 키워드 ${count}개를 생성하세요.

규칙:
- 키워드는 간결한 명사/구 형태 (띄어쓰기 O)
- 제목, 채널명, 카테고리, 설명에 등장하는 고유명사와 주제어를 우선 사용
- 음악/노래 카테고리(예: "음악")의 영상인 경우, 가능한 한 "아티스트명 곡명" 형태의 키워드를 우선 포함
 - 예: "폴킴 Beyond the sunset", "뉴진스 Ditto"
 - 너무 일반적인 단어를 단독으로 사용하지 마세요:
  - 금지 예시: "영상", "클립", "사람", "이야기", "노래", "음악", "게임", "방송", "하이라이트" 등
  - 이런 단어는 반드시 구체적인 이름과 사용하거나, 둘 이상을 조합하세요. (예: "LOL 멸망전 하이라이트")
- 서로 의미가 거의 같은 키워드를 중복해서 만들지 마세요.
- 해시태그/문장/이모지/마크다운 금지, 키워드만
- 한국어 영상이라도, 제목이나 채널명이 영어/일본어 등으로 되어 있다면 **원래 표기를 그대로 사용**해도 됩니다.
- 출력은 오직 하나의 JSON 객체만. 다른 설명/마크다운/코드펜스 금지.(중요)

형식: { "<videoId>": ["키워드1", ... (총 ${count}개) ...], ... }
`.trim();
}

// 유튜브 categoryId → 한글 라벨 매핑
export const YT_CATEGORY_DECODER = {
  '1': '영화/애니메이션',
  '2': '자동차/차량',
  '10': '음악',
  '15': '애완동물/동물',
  '17': '스포츠',
  '19': '여행/이벤트',
  '20': '게임',
  '22': '인물/블로그',
  '23': '코미디',
  '24': '엔터테인먼트',
  '25': '뉴스/정치',
  '26': '노하우/스타일',
  '27': '교육',
  '28': '과학기술',
  '29': '비영리/사회운동',
};

function decodeYoutubeCategory(categoryId) {
  const key = String(categoryId);
  return YT_CATEGORY_DECODER[key] ?? `기타(${key})`;
}

/**
 * [Spec 5.1 / 4.2] 여러 비디오의 키워드를 일괄 추출 (JSON)
 * @param {Array<{videoId:string,title:string,description?:string}>} videos  // 입력
 * @param {Array<Object>} videos - { videoId, title, description } 객체 배열
 * @returns {Promise<Object>} { "videoId_1": "키워드1", ... } 객체
 */
export async function fetchKeywordsBatch(videos, opts = {}) {
  // console.log("[fetch Keywoard 자료구조 확인]", videos) //// 디버깅 후 삭제 요망
  const count = Number(opts.count ?? 4);
  const maxDesc = Number(opts.maxDesc ?? 300);
  const language = opts.language || 'ko';

  // [Spec 7.1] 프롬프트
  const promptHeader = buildKeywordPrompt({ count, language });

  const listText = videos
    .map((v, i) => {
      const desc = (v.description || '').slice(0, maxDesc).replace(/\s+/g, ' ').trim();
      return `#${i + 1}
videoId: ${v.videoId}
제목: ${v.title}
설명: ${desc}
채널명: ${v.channelTitle}
카테고리: ${decodeYoutubeCategory(v.categoryId)}`;
    })
    .join('\n\n');

  const fullPrompt = `${promptHeader}\n\n[입력]\n${listText}`;

  // generateContent(model, prompt, wantJson=true) 가 JSON 문자열을 반환한다고 가정
  const jsonString = await generateContent(KEYWORD_MODEL, fullPrompt, true);

  // 파싱 및 방어적 정리
  let parsed;
  try {
    parsed = JSON.parse(jsonString); // 기대형태: { "<videoId>": ["키워드1",...], ... }
  } catch (e) {
    console.error('Gemini JSON 파싱 실패:', jsonString);
    throw new Error('Gemini가 반환한 키워드 JSON 파싱에 실패했습니다.');
  }

  // 스키마 방어: count 개수로 보정
  const out = {};
  for (const v of videos) {
    const arr = Array.isArray(parsed?.[v.videoId]) ? parsed[v.videoId] : [];
    out[v.videoId] = arr
      .map(s => String(s || '').trim())
      .filter(Boolean)
      .slice(0, count);

    // 만약 모델이 개수를 덜 준 경우, 빈 슬롯 채우기(선택)
    while (out[v.videoId].length < count) out[v.videoId].push('');
  }

  return out;
}

/**
 * [Spec 4.3] 키워드 임베딩 벡터 생성 (실제 API 호출)
 * (이전 Mock 함수를 실제 API 호출로 변경)
 * @param {string} keyword - 임베딩할 키워드
 * @returns {Promise<Array<number>>} 임베딩 벡터
 */
export async function fetchKeywordEmbedding(keyword) {
  // :generateContent가 아닌 :embedContent API를 사용합니다.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${API_KEY}`;

  const body = { content: { parts: [{ text: keyword }] } };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn("[Embed][ERR]", keyword, res.status, res.statusText)
      // 오류 발생 시 임시로 빈 벡터 반환 (오류 처리는 정책에 맞게 수정)
      return [];
    }

    const data = await res.json();
    // console.log("[Embed][RES]", keyword, data.embedding.values.slice(0, 5));

    return data?.embedding?.values || [];
  } catch (err) {
    console.error("[Embed][ERR_EXCEPTION]", keyword, err.message);
    return [];
  }
}

/** 
 * LLM에게 보낼 "60초 요약 쇼츠 스크립트 생성"용 프롬프트를 만들어주는 함수
 * @param {string[]} sttTexts - 4개 영상의 전사 텍스트 배열
 * @param {string} query - 검색어/주제 키워드 (예: "엔비디아 실적", "비트코인 폭락" 등)
 * @returns {string} - LLM에게 그대로 전달할 전체 프롬프트 문자열
 **/
async function generatePromptHeader(sttTexts, query) {
  const safeSttTexts = Array.isArray(sttTexts) ? sttTexts : ["텍스트가 비어 있습니다"];

  const sttBlock = safeSttTexts
    .map((text, idx) => `- STT_${idx + 1}:\n${text || ''}`)
    .join('\n\n');

  // 컨셉 설명(고정 값): 채널/아바타의 톤 & 포맷 정의
  const concept = `
컨셉 설명:
- 채널명: "오백만마리 토끼"
- 아바타 컨셉: "냉정하지만 위트 있는 분석가 토끼"
- 형식: 60초 분량 이슈 요약 유튜브 쇼츠, 9:16 세로 영상, HeyGen 아바타용
- 톤: 침착하고 담백한 구어체, 중간중간 가벼운 위트, 과한 유머/비약/선동 금지
- 역할: 시청자에게 복잡한 이슈를 빠르게 정리해서 알려주는 똑똑한 친구 같은 느낌
`.trim();

  // 주의사항(고정 값): LLM의 안전 가이드라인 & 스타일 가이드
  const cautions = `
주의사항:
- 과장, 확인되지 않은 추측, 혐오 표현, 인신공격, 선정적 표현은 사용하지 말 것
- 정치·사회적으로 민감한 주제의 경우 균형 잡힌 어조 유지
- 특정 개인·집단을 공격하거나 조롱하지 말 것
- 숫자·지표는 가능하면 구체적으로 말하되, 근거 없이 만들어내지 말 것
- 오프닝/마무리에 채널명 "오백만마리 토끼"의 존재를 자연스럽게 드러낼 것
- 분석 과정, 단계 설명, 마크다운, 따옴표, 메타 코멘트는 절대 출력하지 말 것
`.trim();

  // 최종 프롬프트 문자열
  const prompt = `
# 역할 (Persona)
당신은 유튜브 쇼츠 채널 "오백만마리 토끼"의 시그니처 아바타입니다.
아바타 컨셉은 “냉정하지만 위트 있는 분석가 토끼”입니다.

특징은 다음과 같습니다:
- 기본적으로 침착하고 담백하게 말합니다.
- 핵심 정보 전달을 최우선으로 합니다.
- 중간중간 가벼운 위트와 센스를 넣어 자연스럽게 분위기를 전환합니다.
- 과장된 유머, 공격적 표현, 과도한 감정 표현은 절대 사용하지 않습니다.
- 시청자에게 ‘빠르게 핵심을 정리해주는 똑똑한 친구’ 같은 느낌을 줍니다.

당신의 직업은 60초 분량의 유튜브 쇼츠 스크립트를 전문적으로 쓰는 베테랑 방송 작가입니다.

# 입력 (Input)

[1] 주제 키워드:
${query || ''}

[2] 4개의 STT 전사 텍스트:
${sttBlock}

[3] ${concept}

[4] ${cautions}

# 작업 목표 (Goal)
위 입력을 바탕으로, 시청자의 관심을 끌고 60초 안에 핵심을 파악할 수 있는
"오백만마리 토끼 스타일"의 HeyGen 아바타용 유튜브 쇼츠 스크립트를 제작하세요.

최종 출력은 “스크립트 문장만” 포함해야 하며,
분석 과정, 단계 설명, 구분선, 마크다운, 따옴표 등은 절대로 출력하지 않습니다.

# 제작 규칙 (Rules)

[1] 핵심 주제 도출
- 4개의 STT와 query를 사용하여, 이들이 공통적으로 다루는 하나의 핵심 주제를 자동으로 도출합니다.
- 어떤 정보가 중요하거나 부수적인지에 대한 단서는 제공되지 않으므로,
  당신이 직접 판단해야 합니다.

[2] 정보 선별 기준
입력 STT에는 중요도/순위 정보가 제공되지 않기 때문에,
다음 기준을 사용해 “당신이 직접” 정보를 자동으로 정리합니다:

- 중요한 사실, 수치, 사건, 고유명사 → 핵심 정보로 간주해 반드시 포함합니다.
- 배경 설명, 부연 설명, 흥미 요소 → 필요할 때만 포함합니다.
- 4개 STT에서 공통되거나 의미가 강화되는 정보는 신뢰도를 높게 평가합니다.
- 단 1개의 STT에서만 등장하고 검증되지 않은 정보는 신중하게 다룹니다.
- 전체 스크립트는 ‘주제 → 핵심 포인트 → 의미/정리’ 흐름이 자연스럽게 이어지도록 재조합합니다.

[3] 스크립트 구성 방식 (구체적인 작법)
① 강한 오프닝(Hook) — 1~2문장
- 시청자의 시선을 1초 만에 잡아야 합니다.
- 다음 중 1개 방식으로 선택해 작성합니다:
  • 궁금증 유발형: 핵심 사실 중 가장 흥미로운 포인트를 질문/단정 형태로 제시
  • 반전형: 일반적으로 알려진 내용과 다른 인사이트를 짧게 던지기
  • 요약형: 오늘 다룰 주제를 한 문장으로 명확하게 선언
- 다소 과장된 톤으로 말합니다.

② 본문(Body) — 4~6문장
- 핵심 주제와 관련된 주요 사실, 배경, 근거를 논리적으로 정리합니다.
- 정보는 중요도 높은 순서대로 자연스러운 흐름으로 배치합니다.
- 디테일, 감정적으로 중요한 부분은 강조하여 소개
- 각 문장은 1가지 메시지만 전달합니다. (1문장 1아이디어 원칙)

③ 마무리(Closing) — 1~2문장
- 핵심 메시지를 짧게 다시 압축합니다.
- 시청자가 이 이슈의 의미 또는 다음 행동을 한 번에 이해할 수 있도록 결론을 제시합니다.
- 아바타 캐릭터 느낌을 살려, 가벼운 위트나 부드러운 마무리 멘트를 넣되 과하지 않게 합니다.
- 가능하다면 마지막 문장에 자연스럽게 채널명 "오백만마리 토끼"를 한 번 언급합니다.

[5] 길이 규칙
- 전체 길이: 250~300자(한국어 기준), 최대 60초 분량.
- 문장은 구어체이되, 품질이 떨어지지 않도록 깔끔하게 작성합니다.

# 최종 출력 형식 (Output Format)
- 완성된 스크립트 문장만 출력합니다.
- 분석, 단계, 논리 과정, 설명, 마크다운, 따옴표, 제목, 해시태그 등은 절대 포함하지 않습니다.

# 이제 위 규칙에 따라 최종 60초 쇼츠 스크립트를 작성하세요.
  `.trim();

  return prompt;

}



/**
 * [Spec 5.4] 4개의 전사 텍스트로 60초 요약 스크립트 생성
 * @param {string[]} sttTexts - 4개 영상의 전사 텍스트 배열
 * @param {string} query - 원본 검색어 (프롬프트 보강용)
 * @returns {Promise<string>} 생성된 60초 요약 스크립트 텍스트
 */
export async function fetchGeneratedScript(sttTexts, query) {
  // [Spec 7.2] 프롬프트
  const fullPrompt = generatePromptHeader(sttTexts, query)
  // const sttInputs = sttTexts.map((text, i) => `[영상 ${i + 1} 전사]\n${text || '(전사 실패)'}`).join('\n\n');
  // const fullPrompt = `${promptHeader}\n${sttInputs}\n\n# ▼ [출력 스크립트] ▼`;
  if (typeof fullPrompt !== 'string') {
    console.error('fullPrompt 타입 이상:', fullPrompt);
    throw new Error('fullPrompt가 문자열이 아닙니다.');
  }

  // 길이 체크 (예: 0이거나, 말도 안 되게 길 때)
  if (!fullPrompt.trim()) {
    throw new Error('fullPrompt가 비어 있습니다.');
  }

  return await generateContent(SCRIPT_MODEL, fullPrompt, false);
}