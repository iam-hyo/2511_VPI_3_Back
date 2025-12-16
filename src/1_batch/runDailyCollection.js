// /src/1_batch/runDailyCollection.js
import { fetchPopularVideos } from '../3_services/youtube.service.js';
import { saveRawVideos } from '../6_repository/file.repository.js';
import { processCollectedFile } from '../2_pipeline/processCollectedFile.js';

/**
 * [Spec 3.0] 일일 트렌드 영상 수집 및 처리 배치 스크립트
 */
export async function runDailyCollection() {
  console.log('🚀 일일 배치 작업을 시작합니다...');
  // const regions = ['KR', 'US', 'JP', 'IN', 'VN'];
  const regions = ['KR'];


  // KST (UTC+9) 기준 시각
  const collectedAt = new Date();

  const results = [];

  for (const region of regions) {
    try {
      console.log(`[${region}] 인기 동영상 수집 중...`);
      // 1. YouTube API로부터 영상 50개 수집
      const videos = await fetchPopularVideos(region, 30);

      // 2. 원본 JSON 파일로 저장
      const rawFileName = await saveRawVideos(region, collectedAt, videos);
      console.log(`[${region}] 원본 파일 저장 완료: ${rawFileName}`);

      // 3. (동기식) 수집 직후 파이프라인 실행
      console.log(`[${region}] 데이터 처리 파이프라인 시작...`);

      const processedFileName = await processCollectedFile(rawFileName, region, collectedAt, videos); console.log(`[${region}] 데이터 처리 완료.`);
      console.log(`[${region}] 데이터 처리 완료.`);

      results.push({ region, collectedAt: collectedAt.toISOString(), rawFileName, processedFileName, });

    } catch (err) {
      console.error(`[${region}] 처리 중 오류 발생:`, err.message);
      results.push({ region, collectedAt: collectedAt.toISOString(), rawFileName: null, processedFileName: null, error: err.message, });
    }
  }
  console.log('✅ 모든 배치 작업이 완료되었습니다.');
  return results;
}


/**
 * [Spec 1.2] step0용 단일국가 트렌드 영상 수집 및 처리 배치 스크립트
 * 유튜브 인기영상(트렌드) 데이터를 수집하고
 * raw 저장 + analyzed(processed) 저장까지 수행한다.
 */
export async function collectOneRegion(region) {
  const collectedAt = new Date();

  try {
    console.log(`[collectOneRegion] [${region}] 인기 동영상 수집 시작`);

    const videos = await fetchPopularVideos(region, 50);
    const rawFileName = await saveRawVideos(region, collectedAt, videos);

    console.log(`[collectOneRegion] [${region}] raw 저장 완료: ${rawFileName}`);

    // ⚠️ processCollectedFile이 반드시 processedFileName을 return해야 함
    const processedFileName = await processCollectedFile(rawFileName, region, collectedAt, videos);

    console.log(`[collectOneRegion] [${region}] processed 저장 완료: ${processedFileName}`);

    return { region, rawFileName, processedFileName, error: null };

  } catch (e) {
    console.error(`[collectOneRegion] [${region}] 오류: ${e.message}`);
    return { region, rawFileName: null, processedFileName: null, error: e.message };
  }
}