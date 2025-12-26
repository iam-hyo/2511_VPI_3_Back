/**
 * ============================================================
 * File: videoCaption.service.js
 * ------------------------------------------------------------
 * 역할(Role):
 *  - related 영상 4개의 제목/설명을 보고,
 *    각 클립 시작 전에 붙일 "짧은 특징 캡션"을 LLM으로 생성한다.
 *
 * 사용처:
 *  - dailyVideoGenerate Step3/4에서 top4Videos가 정해진 뒤,
 *    타이틀 카드(번호+캡션) 영상 생성에 사용한다.
 * ============================================================
 */

import { generateContent } from './gemini.service.js';

const MODEL = process.env.GEMINI_MODEL;

/**
 * 각 클립 시작 전 표시할 "짧은 특징 캡션" 4개를 생성한다.
 *
 * @param {Object} params 
 * @param {string} params.query - 검색어(대표 트렌드 영상 제목)
 * @param {Array<{snippet:{title:string, description?:string}}>} params.top4Videos - 관련 상위 4개 영상(원본)
 * @returns {Promise<string[]>} captions - 길이 4 배열 (각 요소는 3~6 단어 정도)
 */
export async function generateClipCaptions({ query, top4Videos }) {
  const safe = Array.isArray(top4Videos) ? top4Videos : [];
  const items = safe.slice(0, 4).map((v, idx) => {
    const title = v?.snippet?.title || '';
    const desc = (v?.snippet?.description || '').replace(/\s+/g, ' ').slice(0, 160);
    return `#${idx + 1}\nTitle: ${title}\nDescription: ${desc}`;
  }).join('\n\n');
  
// ✅ “짧고 영상용으로” 만들기 위한 프롬프트
  const prompt = `
  4개의 동영상이 주어지면 각 클립 비디오를 시청자들에게 소개하는 자극적이고 키치한 영문 후킹용 제목을 반환하라.
  소위말하는 어그로가 끌려 주목받기 쉬운 제목이어야 한다. 
  문장이 아니라 명사구 형식을 권장하며 짧고 임팩트가 중요하므로 4단어 이하를 권장한다. 
  기타 잡담 없이 Output format에 정의된 형식으로만 영문으로 뽑아라.
  
  대주제: ${query} 
  주의사항: 
   - 대주제를 벗어난 이 비디오만의 특색을 담아야한다.

  Videos: ${items}

  Output format: 영문으로 아래와 같이 반환하라.
  {"captions":["...","...","...","..."]}
  `.trim();

  // ⚠️ gemini.service.js가 (model,prompt,isJson) 시그니처니까 그대로 사용
  const raw = await generateContent(MODEL, prompt, true);

  try {
    const parsed = JSON.parse(raw);
    const captions = Array.isArray(parsed?.captions) ? parsed.captions : [];
    return captions
  } catch (e) {
    // 실패 시 fallback: 원제목 축약
    return safe.map(v, n=> v?.snippet?.title ?? `${query}${n+1}`);
  }
}
