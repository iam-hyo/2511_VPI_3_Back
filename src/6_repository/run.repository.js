// /src/6_repository/run.repository.js
// run 상태 저장/조회(JSON) — 재시작 핵심

/**
 * [Run Repository]
 * 실행(Run) 단위의 상태와 데이터를 JSON 파일로 관리하는 저장소 계층입니다.
 * * - 역할: 프로세스 실행 기록을 'runId.json' 파일로 생성, 조회, 수정
 * - 저장 위치: /data/runs/
 * - 주요 기능: 
 * 1. 실행 상태(Status) 추적 (INIT -> DONE/ERROR)
 * 2. 단계별 산출물(Artifacts) 및 메타데이터 병합 저장
 * 3. 에러 발생 시 상태 및 로그 기록
 */

import fs from 'fs/promises';
import path from 'path';

// 데이터가 저장될 기본 디렉토리 설정
const RUN_DIR = path.resolve(process.cwd(), 'data', 'runs');

// [내부 유틸] 디렉토리가 없으면 생성 (재귀적)
async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true});
}

// [내부 유틸] runId를 기반으로 전체 JSON 파일 경로 반환
function runPath(runId) {
  return path.join(RUN_DIR, `${runId}.json`);
}

// [상수] 프로세스 진행 단계별 상태 정의
export const RUN_STATUS = {
  INIT: 'INIT',               // 초기화
  COLLECTED: 'COLLECTED',     // 데이터 수집 완료
  BEST_SELECTED: 'BEST_SELECTED', // 베스트 영상 선정 완료
  RELATED_FETCHED: 'RELATED_FETCHED', // 관련 데이터 조회 완료
  DOWNLOADED: 'DOWNLOADED',   // 영상 다운로드 완료
  HIGHLIGHTS_MADE: 'HIGHLIGHTS_MADE', // 하이라이트 생성 완료
  MERGED: 'MERGED',           // 영상 병합 완료
  META_DONE: 'META_DONE',     // 메타데이터 처리 완료
  DONE: 'DONE',               // 전체 완료
  ERROR: 'ERROR',             // 에러 발생
};


// runId 생성 규칙 정의 | YYYY-MM-DD_REGION (예: 2025-12-15_KR)
export function makeRunId(dateStr, region) {
  return `${dateStr}_${region}`;
}

/**
 * [조회] 특정 runId에 해당하는 JSON 파일을 읽어 객체로 반환
 * - 파일이 없으면 null 반환 (에러 아님)
 * - 그 외 파일 읽기 에러는 throw
 */
export async function getRun(runId) {
  try {
    const raw = await fs.readFile(runPath(runId), 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/**
 * [생성] 새로운 실행(Run) 정보를 생성하고 파일로 저장
 * - 초기 상태는 INIT으로 설정
 * - artifacts(산출물), meta(메타정보) 초기화
 */
export async function createRun({ runId, date, region, artifacts = {}, meta = {} }) {
  await ensureDir(RUN_DIR);

  const now = new Date().toISOString();
  const obj = {
    runId,
    date,
    region,
    status: RUN_STATUS.INIT,
    createdAt: now,
    updatedAt: now,
    artifacts,
    meta,
    error: null,
  };

  await fs.writeFile(runPath(runId), JSON.stringify(obj, null, 2), 'utf-8');
  console.log(`[run.repository] createRun: ${runId}`);
  return obj;
}

/**
 * 부모 runId로부터 자식 runId를 만든다.
 * - 예: 2025-12-27_US + 1 => 2025-12-27_US__01
 *
 * @param {string} parentRunId - 부모 runId
 * @param {number} index1Based - 1부터 시작하는 rank
 * @returns {string} 자식 runId
 */
export function makeChildRunId(parentRunId, index1Based) {
  const suffix = String(index1Based).padStart(2, 'T');
  return `${parentRunId}__${suffix}`;
}

/**
 * [수정] 기존 Run 데이터에 변경 사항(patch)을 병합하여 업데이트
 * - artifacts(산출물)와 meta 객체는 덮어쓰지 않고 기존 값과 병합(Merge)함
 * - updatedAt 시간을 자동으로 갱신
 */
export async function updateRun(runId, patch) {
  console.log(`[run.repository] updateRun: ${runId} -> ${next.status} (patch keys: ${Object.keys(patch).join(',')})`);
  const prev = await getRun(runId);
  if (!prev) throw new Error(`[run.repository] updateRun failed: run not found: ${runId}`);

  const next = {
    ...prev,
    ...patch,
    // 깊은 병합(Deep Merge)이 아닌 1단계 병합: 기존 키를 유지하며 새로운 키 추가/덮어쓰기
    artifacts: { ...prev.artifacts, ...(patch.artifacts || {}) }, //...: 전개 연산자
    meta: { ...prev.meta, ...(patch.meta || {}) },
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(runPath(runId), JSON.stringify(next, null, 2), 'utf-8');
  console.log(`[run.repository] updateRun: ${runId} -> ${next.status}`);
  return next;
}

/**
 * [에러 처리] 특정 단계에서 에러 발생 시 상태를 ERROR로 변경하고 로그 저장
 */
export async function markRunError(runId, step, message) {
  return updateRun(runId, {
    status: RUN_STATUS.ERROR,
    error: { step, message, at: new Date().toISOString() },
  });
}