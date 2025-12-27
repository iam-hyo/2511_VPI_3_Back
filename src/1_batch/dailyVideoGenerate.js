// /src/1_batch/dailyVideoGenerate.js

/*
[dailyVideoGenerate() 배치 파이프라인 시작]
- 국가 목록 배열 정의
<국가별 루프>
  step0_collectAndInitRunByRegion(region)
    1) 영상 50개 수집 + json 저장
    2) VPI Score 계산
    3) VPI Trend Score 계산
  step1_selectTopKVideos(parentRun, topK)
    1) processed 파일을 읽어 트렌드 TopK 비디오 선정
    2) childRunId 생성/갱신

  <childRunId별 루프>
    stepA_fetchRelated(childRunId)
    stepB_downloadAndMakeHighlights(childRunId)
    stepC_mergeHighlights(childRunId)
    stepD_generateMetaTxt(childRunId)
    stepE_upload2Youtube() => 추가 예정
*/

import { step0_collectAndInitRunByRegion } from './regionLoop.steps.js';
import {
  step1_selectTopKVideos,
  stepA_fetchRelated,
  stepB_downloadAndMakeHighlights,
  stepC_mergeHighlights,
  stepD_generateMetaTxt,
} from './topKLoop.steps.js';

/**
 * daily 배치 실행.
 *
 * @param {object} options
 * @param {string[]} options.regions - 국가 코드 배열
 * @param {number} options.topK - 국가별 TopK 개수
 * @returns {Promise<void>} 반환값 없음
 */
export async function dailyVideoGenerate({ regions = ['KR', 'US', 'JP'], topK = 3 } = {}) {
  for (const region of regions) {
    const parentRun = await step0_collectAndInitRunByRegion(region);
    if (!parentRun) continue;

    const childRunIds = await step1_selectTopKVideos(parentRun, topK);
    if (!childRunIds.length) continue;

    for (const childRunId of childRunIds) {
      await stepA_fetchRelated(childRunId);
      await stepB_downloadAndMakeHighlights(childRunId);
      await stepC_mergeHighlights(childRunId);
      await stepD_generateMetaTxt(childRunId);
    }
  }
}


// 실행부
dailyVideoGenerate({ regions: ['KR', 'US', 'JP'], topK: 3 })
  .then(() => {
    console.log("✅ 배치 작업이 성공적으로 끝났습니다.");
    process.exit(0);
  })
  .catch((e) => {
    console.error("❌ 배치 작업 중 에러 발생:", e);
    process.exit(1);
  });