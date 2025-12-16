// /src/3_services/videoMeta.service.js
import { generateContent, YT_CATEGORY_DECODER } from './gemini.service.js'; // DECODER 추가 import

const SCRIPT_MODEL = process.env.GEMINI_MODEL;

/**
 * New Video 제목/설명/해시태그 생성
 *
 * @param {Object} params
 * @param {string} params.query
 * @param {Array<{title:string, categoryId?:string}>} params.videos
 */
export async function generateVideoDetail({ query, videos }) {
    const listText = (videos || []).map((v, i) => {
        const catId = String(v.categoryId || '');
        // 디코더에 있으면 한글명, 없으면 그냥 숫자 ID 사용
        const catName = YT_CATEGORY_DECODER[catId] || catId;

        return `#${i + 1} title=${v.title || ''} category=${catName}`;
    }).join('\n');

    const prompt = `
당신은 유튜브 쇼츠 콘텐츠 기획자입니다.
아래 "참조 영상 목록"과 "검색 query"를 기반으로 영미권 시청자들을 겨냥하여
새로 생성될 트렌드 쇼츠 영상의 메타데이터를 생성하세요.

요구:
- title: 영문, 40자 이내
- description: 영문 2~3문장 + 마지막 줄에 해시태그 포함
- hashtags: 5~10개 배열

출력은 반드시 JSON만:
{
  "title": "...",
  "description": "...",
  "hashtags": ["#...","#..."]
}

[query]
${query}

[참조 영상 목록]
${listText}
`.trim();

    const raw = await generateContent(SCRIPT_MODEL, prompt, true);

    try {
        const parsed = JSON.parse(raw); //여기서 문자열(raw)을 자바스크립트 객체(parsed)로 변환
        return {
            title: parsed.title || query,
            description: parsed.description || query,
            hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ['#shorts', '#trend'],
        };
    } catch (e) {
        console.error('[videoMeta] JSON parse failed. fallback meta used.');
        return {
            title: query,
            description: query,
            hashtags: ['#shorts', '#trend'],
        };
    }
}
