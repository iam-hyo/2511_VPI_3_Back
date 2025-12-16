// /src/3_services/videoEdit.service.js

/**
 * [Video Edit Service]
 * yt-dlp와 ffmpeg를 사용하여 실제 영상 파일을 다운로드, 자르기(Cut), 병합(Merge)하는 물리적 편집 계층입니다.
 * * - 역할: 외부 CLI 도구(yt-dlp, ffmpeg)를 실행(exec)하여 미디어 파일 조작
 * - 의존성: 시스템에 'yt-dlp'와 'ffmpeg'가 설치되어 있어야 함
 * - 특징: 멱등성(Idempotency) 유지 -> 이미 파일이 존재하면 작업을 건너뜀(Skip)하여 중복 작업 방지
 * ⚠️ 주의사항1: -c copy옵선은 모든 영상이 같은 코덱, 해상도를 가져야만 오류가 나지 않는다.
 * ⚠️ 주의사항2: 간혹 yt-dlp로 저장되는 유튜브 영상의 코덱이 다를 수 있다. 이떄는 재인코딩 필요.
 */

import fs from 'fs/promises';
import path from 'path';
import { exec as _exec } from 'child_process';
import { promisify } from 'util';

// exec를 Promise 패턴으로 변환 (await 사용 가능하게)
const exec = promisify(_exec);

// [유틸] 파일 존재 여부 확인 (try-catch로 에러 방지)
async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

// [유틸] 디렉토리 생성 (없으면 생성)
export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * [다운로드] 유튜브 영상을 로컬 MP4 파일로 저장
 * - 도구: yt-dlp
 * - 이미 다운로드된 파일이 있다면 실행하지 않고 경로만 반환
 * * @param {string} videoId - 유튜브 영상 ID
 * @param {string} outDir - 저장할 폴더 경로
 * @returns {Promise<string>} 저장된 파일의 절대/상대 경로
 */
export async function downloadVideoIfNeeded({ videoId, outDir }) {
  await ensureDir(outDir);
  const outPath = path.join(outDir, `${videoId}.mp4`);

  // 1. 이미 파일이 있으면 스킵 (시간/대역폭 절약)
  if (await exists(outPath)) {
    console.log(`[videoEdit] download skip (exists): ${outPath}`);
    return outPath;
  }

  // 2. 다운로드 명령어 구성
  // -f mp4: MP4 포맷 강제 (편집 호환성 위해)
  // -o: 출력 경로 지정
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const cmd = `yt-dlp -f mp4 -o "${outPath}" "${url}"`;

  console.log(`[videoEdit] 다운로드중..: ${videoId} 시간이 소요될 수 있습니다.`);
  await exec(cmd); // 실행 (오래 걸림)
  return outPath;
}

/**
 * [자르기] 영상의 마지막 N초를 잘라내어 하이라이트 생성
 * - 도구: ffmpeg
 * - 용도: 엔딩 크레딧이나 하이라이트 모음용 영상 추출
 * - 방식: 재인코딩 없이 스트림 복사(-c copy)하여 속도가 매우 빠름
 * * @param {string} inputPath - 원본 영상 경로
 * @param {string} outputPath - 저장할 조각 영상 경로
 * @param {number} seconds - 뒤에서부터 몇 초를 자를지 (기본 6초)
 * @returns {Promise<string>} 생성된 파일 경로
 */
export async function cutLastSecondsIfNeeded({ inputPath, outputPath, seconds = 6 }) {
  if (await exists(outputPath)) {
    console.log(`[videoEdit] highlight skip (exists): ${outputPath}`);
    return outputPath;
  }

  // ffmpeg 명령어 구성
  // -sseof -N: 파일의 끝(End Of File)에서 N초 전부터 시작(Seek)
  // -t N: N초 동안만 지속
  // -c copy: 인코딩(화질열화/시간소요) 없이 데이터만 복사
  const cmd = `ffmpeg -y -sseof -${seconds} -i "${inputPath}" -t ${seconds} -c copy "${outputPath}"`;
  
  console.log(`[videoEdit] cut highlight: ${path.basename(outputPath)}`);
  await exec(cmd);
  return outputPath;
}

/**
 * [병합] 여러 개의 영상 조각을 하나로 합치기 (Concat)
 * - 도구: ffmpeg (Concat Demuxer 방식)
 * - 방식: 파일 목록 텍스트(_concat_list.txt)를 만들고 이를 ffmpeg에 입력으로 줌
 * * @param {Array<string>} inputPaths - 합칠 영상 파일 경로들의 배열
 * @param {string} outputPath - 최종 저장될 파일 경로
 * @returns {Promise<string>} 병합된 파일 경로
 */
export async function concatVideosIfNeeded({ inputPaths, outputPath }) {
  if (await exists(outputPath)) {
    console.log(`[videoEdit] merge skip (exists): ${outputPath}`);
    return outputPath;
  }

  // 1. ffmpeg용 리스트 파일 생성 (.txt)
  // 형식: file '/path/to/video1.mp4'
  //       file '/path/to/video2.mp4'
  const listPath = outputPath.replace(/\.mp4$/, '_concat_list.txt');
  
  // 경로 내 작은따옴표(') 이스케이프 처리 주의
  const list = inputPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  await fs.writeFile(listPath, list, 'utf-8');

  // 2. 병합 명령어 실행
  // -f concat: concat 포맷 사용
  // -safe 0: 절대 경로 등 안전하지 않은 경로도 허용
  // -c copy: 역시 재인코딩 없이 복사 (매우 빠름)
  const cmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}"`;
  
  console.log(`[videoEdit] merging -> ${path.basename(outputPath)}`);
  await exec(cmd);
  return outputPath;
}