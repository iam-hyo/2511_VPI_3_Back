// /src/2_pipeline/processCollectedFile.js
import { fetchVPIs } from '../3_services/vpi.service.js';
import { fetchChannelSubscriberCounts } from '../3_services/youtube.service.js';
import { fetchKeywordsBatch } from '../3_services/gemini.service.js';
import { fetchKeywordEmbedding } from '../3_services/gemini.service.js';
import { calculateTrendScores } from '../4_analysis/trendCalculator.js';
import { saveAnalyzedVideos } from '../6_repository/file.repository.js';


/**
 * [신규] 임베딩 벡터 배열을 Max pooling 합니다.
 * @param {Array<Array<number>>} embeddings - [ [0.1, 0.2], [0.3, 0.4] ]와 같은 벡터 배열
 * @returns {Array<number>} 최대가 계산된 단일 벡터 (예: [0.2, 0.3])
 */
function maxPoolEmbeddings(embeddings) {
  // 유효한 임베딩(빈 배열이 아닌)만 필터링
  const validEmbeddings = embeddings.filter(e => e && e.length > 0);
  if (validEmbeddings.length === 0) return [];

  const dimension = validEmbeddings[0].length;

  const out = new Array(dimension).fill(-Infinity);
  for (const vec of validEmbeddings) {
    for (let i = 0; i < dimension; i++) out[i] = Math.max(out[i], vec[i] ?? -Infinity);
  }
  return out.map(v => (v === -Infinity ? 0 : v));
}

/**
 * [Spec 4.0] 수집된 원본 데이터를 분석 데이터로 변환하는 파이프라인
 * @param {string} rawFileName - 처리할 원본 JSON 파일명 (예: 20251110_1300_KR_raw.json)
 * @param {string} region - 국가 코드
 * @param {Date} collectedAt - 수집 시각
 * @param {Array<Object>} videos - 원본 비디오 객체 배열
 */
export async function processCollectedFile(rawFileName, region, collectedAt, videos) {
  // AnalyzedVideo 스키마 [Spec 2.2] 형태로 기본 변환
  let analyzedVideos = videos.map(v => ({
    videoId: v.id,
    collectedAt: collectedAt.toISOString(),
    regionCode: region,
    title: v.snippet.title,
    publishedAt: v.snippet.publishedAt,
    viewCount: Number(v.statistics.viewCount || 0),
    likeCount: Number(v.statistics.likeCount || 0),
    categoryId: v.snippet.categoryId, // snippet에서 categoryId
    duration: v.contentDetails.duration, // contentDetails에서 duration (ISO 8601 형식)
    channelId: v.snippet.channelId ?? null,
    thumbnails: v.snippet.thumbnails,
    // (분석 데이터는 나중에 채워짐)
    vpiScore: 0,
    keyword: '',
    keywordEmbedding: [],
    trendScore_View: 0,
    trendScore_VPI: 0,
  }));

  try {
    // 2. VPI 호출 전, 구독자 수 조회 및 병합
    const uniqueChannelIds = [...new Set(analyzedVideos.map(v => v.channelId))];
    const subscriberMap = await fetchChannelSubscriberCounts(uniqueChannelIds);
    
    analyzedVideos.forEach(v => {
      // (vpi.service.js가 subscriberCount를 찾을 수 있도록 추가)
      v.subscriberCount = subscriberMap.get(v.channelId) || 1;  //1로 나눠서 
    });

    // 3. [Spec 4.1] VPI 예측
    const vpiResultsMap = await fetchVPIs(analyzedVideos); 
    
    analyzedVideos.forEach(v => {
      // [수정] Map에서 videoId로 VPI 점수를 찾습니다.
      const result = vpiResultsMap.get(v.videoId);
      v.vpiScore = result?.vpiScore || 0;
    });

    // 4. [Spec 4.2] 키워드 추출
    const keywordsObject = await fetchKeywordsBatch(analyzedVideos, {
      count: 1
    });

    console.log(`[Keyword Debug] Gemini 키워드 생성 API가 반환한 원본 객체:`);
    console.log(JSON.stringify(keywordsObject, null, 2)); // JSON을 예쁘게 출력

    analyzedVideos.forEach(v => {
      v.keyword = keywordsObject[v.videoId] || '키워드 없음';
    });


    // [Spec 4.3] 키워드 임베딩
    for (const v of analyzedVideos) {
      const keywordData = keywordsObject[v.videoId]; // (예: [ "kw1", "kw2" ])

      // 1. 유효한 키워드 목록(배열) 추출 (빈 문자열 제외)
      let validKeywords = [];
      if (Array.isArray(keywordData) && keywordData.length > 0) {
        validKeywords = keywordData.map(kw => kw.trim()).filter(kw => kw !== '');
      }

      // 2. 유효한 키워드가 없으면 임베딩 중지 (v.keywordEmbedding = [])
      if (validKeywords.length === 0) {
        if (v.keyword !== '키워드 없음') { // (디버깅)
          console.warn(`[Embedding] Video ${v.videoId}의 키워드 데이터는 있으나, 모두 빈 문자열입니다.`);
        }
        continue; // 다음 비디오로
      }

      // 3. (동적) 1개든 4개든 모든 키워드를 병렬로 임베딩 API 호출
      try {
        const embeddingPromises = validKeywords.map(kw => fetchKeywordEmbedding(kw));
        const embeddingVectors = await Promise.all(embeddingPromises); // (결과: [ [0.1...], [0.5...] ])

        // 4. (동적) 결과 벡터들의 평균을 계산하여 v.keywordEmbedding에 저장
        v.keywordEmbedding = maxPoolEmbeddings(embeddingVectors);
        
        // console.log(`[Embedding] Video ${v.videoId}: 키워드 ${validKeywords.length}개 임베딩 및 최대 계산 완료.`);

      } catch (embedError) {
        console.error(`[Embedding] Video ${v.videoId} 처리 중 오류:`, embedError.message);
        v.keywordEmbedding = []; // 오류 시 빈 배열
      }
    }

    console.log(`[${region}] 트렌드 점수 계산 중...`);
    calculateTrendScores(analyzedVideos);
    // [Spec] 최종 분석 파일 저장
    await saveAnalyzedVideos(region, collectedAt, analyzedVideos);

  } catch (err) {
    console.error(`[${region}] 파이프라인 처리 중 오류:`, err.message);
    throw err;
  }
}