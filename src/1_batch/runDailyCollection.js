// /src/1_batch/runDailyCollection.js
import { fetchPopularVideos } from '../3_services/youtube.service.js';
import { saveRawVideos } from '../6_repository/file.repository.js';
import { processCollectedFile } from '../2_pipeline/processCollectedFile.js';

/**
 * [Spec 3.0] 일일 트렌드 영상 수집 및 처리 배치 스크립트
 */
async function runDailyCollection() {
  console.log('🚀 일일 배치 작업을 시작합니다...');
  // const regions = ['KR', 'US', 'JP', 'IN', 'VN'];
    const regions = ['KR', 'US'];

  
  // KST (UTC+9) 기준 시각
  const collectedAt = new Date();
  
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
      await processCollectedFile(rawFileName, region, collectedAt, videos);
      console.log(`[${region}] 데이터 처리 완료.`);

    } catch (err) {
      console.error(`[${region}] 처리 중 오류 발생:`, err.message);
    }
  }
  console.log('✅ 모든 배치 작업이 완료되었습니다.');
}

// 스크립트 직접 실행 시
runDailyCollection();