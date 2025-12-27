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
export async function cutLastSecondsIfNeeded({ inputPath, outputPath, seconds = 10 }) {
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
 * 타이틀 카드 영상 생성, 저장하는 함수
 *  - "각 영상 시작하기 전에 번호+특징 제목"을 보여주기
 *  - 하이라이트 위에 자막을 얹는 방식보다 안정적(해상도/인코딩 차이 덜함)
 *
 * 구현 방식:
 *  - ffmpeg로 단색 배경(black) + drawtext로 텍스트를 넣어 1.2초짜리 mp4 생성
 *
 * 주의:
 *  - Windows 환경에서는 폰트 경로 문제가 있을 수 있음.
 *  - 가장 안전하게는 .env로 FONT_PATH를 받도록 설계하는 것을 추천.
 */
export async function createTitleCardIfNeeded({
  outDir,
  index,
  caption,
  durationSec = 1.2,
  width = 1080,
  height = 1920,
  fps = 30,
  fontPath = process.env.FFMPEG_FONT_PATH || '',
}) {
  await ensureDir(outDir);

  const outPath = path.join(outDir, `title_${index}.mp4`);
  if (await exists(outPath)) {
    console.log(`[videoEdit] title card skip (exists): ${outPath}`);
    return outPath;
  }

  // 1. FFmpeg drawtext 필터용 특수문자 탈출 (순서가 중요합니다)
  let processedText = `${index}. ${caption || ''}`;
  
  processedText = processedText
    .replace(/\\/g, "\\\\")   // 1) 백슬래시 탈출
    .replace(/'/g, "'\\''")   // 2) 싱글 쿼트 탈출 (가장 중요: ' -> '\'' )
    .replace(/:/g, "\\:");     // 3) 콜론 탈출

  // 2. 폰트 경로 처리 (Windows 경로 호환성)
  const fontOpt = fontPath 
    ? `:fontfile='${fontPath.replace(/\\/g, '/')}'` // 백슬래시를 슬래시로 바꾸는게 가장 안전합니다
    : '';

  const cmd = `
ffmpeg -y \
-f lavfi -i "color=c=black:s=${width}x${height}:r=${fps}" \
-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100" \
-t ${durationSec} \
-vf "drawtext=text='${processedText}'${fontOpt}:fontcolor=white:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2" \
-shortest \
-c:v libx264 -pix_fmt yuv420p \
-c:a aac -ar 44100 -ac 2 \
"${outPath}"
`.trim().replace(/\s+/g, ' ');

  console.log(`[videoEdit] create title card: ${path.basename(outPath)}`);
  
  try {
    await exec(cmd);
    return outPath;
  } catch (err) {
    console.error(`\n❌ 타이틀 카드 생성 실패!`);
    console.error(`텍스트: ${caption}`);
    if (err.stderr) console.error(err.stderr);
    throw err;
  }
}

/**
 *  - "타이틀카드 + 하이라이트"를 자연스럽게(fade) 이어붙여서
 *    최종 mp4 하나로 만든다.
 *
 * 해결 과제:
 *  1) concat demuxer(-c copy)는 입력 파일의 fps/timebase/오디오 구성이 조금만 달라도
 *     재생 속도 이상, 길이 늘어남, 싱크 깨짐이 자주 발생한다.
 *  2) fade 트랜지션은 filter_complex 기반으로만 안정적으로 구현 가능하다.
 *
 * 전제(가정):
 *  - highlights는 오디오가 항상 존재한다. (사용자 확인 완료)
 *  - title card는 무음 오디오를 포함하도록 생성하는 것이 안정적이다.
 *    (만약 현재 title card에 오디오가 없다면 createTitleCardIfNeeded를 수정 권장)
 * ============================================================
 */
export async function mergeTitleAndHighlightsWithFade({
  titleCardPaths,
  highlightPaths,
  outputPath,
  width = 1080,
  height = 1920,
  fps = 30,
  durationSec = 1.2,
  highlightSec = 10,
  fadeSec = 0.15,
  sampleRate = 44100,
}) {
  if (await exists(outputPath)) {
    console.log(`[videoEdit] merge skip (exists): ${outputPath}`);
    return outputPath;
  }

  const n = Math.min(titleCardPaths?.length || 0, highlightPaths?.length || 0);
  if (n === 0) throw new Error('mergeTitleAndHighlightsWithFade: no segments');

  const ordered = [];
  for (let i = 0; i < n; i++) {
    ordered.push(titleCardPaths[i]);
    ordered.push(highlightPaths[i]);
  }

  // 경로를 절대 경로로 바꾸고 따옴표 처리를 확실히 합니다.
  const inputArgs = ordered.map(p => `-i "${path.resolve(p)}"`).join(' ');

  let filters = [];
  for (let i = 0; i < ordered.length; i++) {
    const isTitle = (i % 2 === 0);
    const dur = isTitle ? durationSec : highlightSec;
    const fadeOutStart = Math.max(0, dur - fadeSec);

    // 비디오: 스케일링 + 패딩 + 페이드
    filters.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,` +
      `setsar=1,` + // 👈 이 줄이 핵심입니다! 픽셀 비율을 1:1로 고정
      `fps=${fps},format=yuv420p,` +
      `fade=t=in:st=0:d=${fadeSec},` +
      `fade=t=out:st=${fadeOutStart}:d=${fadeSec}[v${i}]`
    );

    // 오디오: 포맷 통일 + 페이드
    // 중요: 하이라이트 영상 중 하나라도 소리가 없으면 여기서 터집니다.
    filters.push(
      `[${i}:a]aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=stereo,` +
      `afade=t=in:st=0:d=${fadeSec},` +
      `afade=t=out:st=${fadeOutStart}:d=${fadeSec}[a${i}]`
    );
  }

  const concatInputs = ordered.map((_, i) => `[v${i}][a${i}]`).join('');
  filters.push(`${concatInputs}concat=n=${ordered.length}:v=1:a=1[vout][aout]`);

  const filterComplex = filters.join(';');

  const cmd = `
ffmpeg -y ${inputArgs} \
-filter_complex "${filterComplex}" \
-map "[vout]" -map "[aout]" \
-c:v libx264 -preset superfast -crf 23 -pix_fmt yuv420p -r ${fps} \
-c:a aac -ar ${sampleRate} -ac 2 -b:a 192k \
"${path.resolve(outputPath)}"
  `.trim().replace(/\s+/g, ' ');

  console.log(`[videoEdit] merge start: ${path.basename(outputPath)}`);

  try {
    const { stdout, stderr } = await exec(cmd);
    // 성공 시에도 로그가 필요하면 주석 해제
    // console.log(stdout); 
    return outputPath;
  } catch (err) {
    console.error(`\n❌ FFmpeg 작업 실패!`);
    console.error(`명령어: ${cmd.substring(0, 200)}...`); // 너무 길면 자름
    
    // 💥 이 부분이 핵심입니다. FFmpeg이 왜 죽었는지 알려줍니다.
    if (err.stderr) {
      console.error(`--- FFmpeg Error Details ---`);
      console.error(err.stderr);
      console.error(`-----------------------------`);
    }
    throw err;
  }
}