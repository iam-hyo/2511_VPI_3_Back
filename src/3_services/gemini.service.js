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
async function generateContent(model, prompt, isJson = false) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      ...(isJson && { responseMimeType: 'application/json' }),
    },
  };
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Gemini API 오류: ${res.statusText}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/*
* [프롬프트 생성] 
*/
export function buildKeywordPrompt({ count, language = 'ko' }) {
  return `
당신은 유튜브 메타데이터 분석가입니다.
각 영상의 제목과 설명을 바탕으로 영상의 핵심 주제를 담은 ${language === 'ko' ? '한글' : language} 키워드 ${count}개를 생성하세요.

규칙:
- 키워드는 간결한 명사/구 형태 (띄어쓰기 O)
- 고유명사/주제어 위주, 중복/동의어 회피
- 해시태그/문장/이모지/마크다운 금지, 키워드만
- 출력은 오직 하나의 JSON 객체만. 다른 설명/마크다운/코드펜스 금지.

형식: { "<videoId>": ["키워드1", ... (총 ${count}개) ...], ... }
`.trim();
}

/**
 * [Spec 5.1 / 4.2] 여러 비디오의 키워드를 일괄 추출 (JSON)
 * @param {Array<{videoId:string,title:string,description?:string}>} videos  // 입력
 * @param {Array<Object>} videos - { videoId, title, description } 객체 배열
 * @returns {Promise<Object>} { "videoId_1": "키워드1", ... } 객체
 */
export async function fetchKeywordsBatch(videos, opts = {}) {
  const count    = Number(opts.count ?? 4);
  const maxDesc  = Number(opts.maxDesc ?? 300);
  const language = opts.language || 'ko';

  // [Spec 7.1] 프롬프트
  const promptHeader = buildKeywordPrompt({ count, language });

  const listText = videos
    .map((v, i) => {
      const desc = (v.description || '').slice(0, maxDesc).replace(/\s+/g, ' ').trim();
      return `#${i + 1}
videoId: ${v.videoId}
제목: ${v.title}
설명: ${desc}`;
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
  
  const body = {
    content: {
      parts: [{ text: keyword }]
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`Gemini Embedding API 오류: ${res.statusText}`);
    // 오류 발생 시 임시로 빈 벡터 반환 (오류 처리는 정책에 맞게 수정)
    return []; 
  }

  const data = await res.json();
  return data?.embedding?.values || [];
}

/**
 * [Spec 5.4] 4개의 전사 텍스트로 60초 요약 스크립트 생성
 * @param {string[]} sttTexts - 4개 영상의 전사 텍스트 배열
 * @param {string} query - 원본 검색어 (프롬프트 보강용)
 * @returns {Promise<string>} 생성된 60초 요약 스크립트 텍스트
 */
export async function fetchGeneratedScript(sttTexts, query) {
  // [Spec 7.2] 프롬프트
  const promptHeader = `# 페르소나 (Persona)... # ▼ [입력 텍스트] ▼ (주제: ${query})`;
  const sttInputs = sttTexts.map((text, i) => `[영상 ${i + 1} 전사]\n${text || '(전사 실패)'}`).join('\n\n');
  const fullPrompt = `${promptHeader}\n${sttInputs}\n\n# ▼ [출력 스크립트] ▼`;

  return await generateContent(SCRIPT_MODEL, fullPrompt, false);
}