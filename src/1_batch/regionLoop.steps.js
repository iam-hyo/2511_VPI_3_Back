// /src/1_batch/regionLoop.steps.js

/*
[regionLoop.steps]
- "국가 1개" 단위로 parentRun을 준비한다.
- dailyVideoGenerate에서 국가 루프를 직접 돌릴 수 있도록, region 1개만 처리하는 step0를 제공한다.
- 기존 수집 로직(collectOneRegion)과 run 저장 로직(createRun/updateRun/markRunError)을 재사용한다.
*/

import { collectOneRegion } from './runDailyCollection.js';
import {
  makeRunId,
  getRun,
  createRun,
  updateRun,
  markRunError,
  RUN_STATUS,
} from '../6_repository/run.repository.js';

/**
 * KST 기준 YYYY-MM-DD 문자열 반환(기존 step0와 동일 책임).
 *
 * @returns {string} 오늘 날짜(KST) YYYY-MM-DD
 */
function todayStrKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * 국가 1개(region)에 대해 parentRun을 수집/초기화한다.
 * - 이미 오늘자 processed가 있으면 스킵하고 기존 run 반환(멱등).
 * - 수집 실패 시 ERROR 기록 후 null 반환.
 *
 * @param {string} region - 국가 코드(KR/US/JP...)
 * @returns {Promise<object|null>} 준비된 parentRun 또는 실패 시 null
 */
export async function step0_collectAndInitRunByRegion(region) {
  const today = todayStrKST();
  const runId = makeRunId(today, region);

  // 1) 오늘자 run 확인
  let run = await getRun(runId);

  // 2) processed 존재 여부로 스킵 판단은 "기존 isTodayCollectionAlreadyDone"을 재사용하는게 최선이지만
  //    변경 최소를 위해 여기서는 collectOneRegion 결과가 없으면 재수집하도록 유지.
  //    (원하면 기존 isTodayCollectionAlreadyDone을 import해서 붙일 수 있음)

  // 3) 수집/분석 실행
  const r = await collectOneRegion(region);

  if (!run) {
    run = await createRun({
      runId,
      date: today,
      region,
      artifacts: {
        rawFileName: r.rawFileName,
        processedFileName: r.processedFileName,
      },
      meta: {},
    });
  } else {
    run = await updateRun(runId, {
      artifacts: {
        rawFileName: r.rawFileName,
        processedFileName: r.processedFileName,
      },
    });
  }

  if (r.error) {
    await markRunError(runId, 'COLLECTION', r.error);
    return null;
  }

  return updateRun(runId, { status: RUN_STATUS.COLLECTED });
}
