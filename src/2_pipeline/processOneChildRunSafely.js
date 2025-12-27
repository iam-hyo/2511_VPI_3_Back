//2_pipeline/processOneChildRunSafely.js

import { step2_fetchRelated } from '../1_batch/_dailyVideoGenerate.steps.js'; // 실제 위치에 맞게
import { step3_downloadAndMakeHighlights } from '../1_batch/_dailyVideoGenerate.steps.js';
import { step4_mergeHighlights } from '../1_batch/_dailyVideoGenerate.steps.js';
import { step5_generateMetaTxt } from '../1_batch/_dailyVideoGenerate.steps.js';
import { updateRun, markRunError, RUN_STATUS } from '../6_repository/run.repository.js';

/**
 * 자식 run(비디오 1개)에 대해 step2~5 파이프라인을 안전하게 수행한다.
 * - step1은 부모에서 이미 수행되므로 여기서는 호출하지 않는다.
 *
 * @param {object} run - 자식 run 객체
 * @returns {Promise<object|null>} 성공 시 DONE 상태로 업데이트된 run, 실패 시 null
 */
export async function processOneChildRunSafely(run) {
  try {
    let r = run;

    r = await step2_fetchRelated(r);
    r = await step3_downloadAndMakeHighlights(r);
    r = await step4_mergeHighlights(r);
    r = await step5_generateMetaTxt(r);

    return updateRun(r.runId, { status: RUN_STATUS.DONE });
  } catch (e) {
    console.error(`[processOneChildRun] ERROR: ${run.runId} -> ${e.message}`);
    await markRunError(run.runId, 'PIPELINE', e.message);
    return null;
  }
}
