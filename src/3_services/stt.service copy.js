// /src/3_services/stt.service.js
import path from 'path';
import ytDlpExec from 'yt-dlp-exec';
import { pipeline, read_audio } from '@xenova/transformers';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

// __dirname 설정
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// /data/scripts/ 폴더에 저장
const SCRIPT_DATA_DIR = path.join(__dirname, '../../data/scripts');

/**
 * [Spec 5.4 - 신규] 요구사항 4: 고유한 타임스탬프 폴더 생성
 * @param {string} query - 검색어 (폴더명에 사용)
 * @returns {Promise<string>} 생성된 폴더의 전체 경로
 */
export async function createTimestampedDir(query) {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const hhmmss = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const safeQuery = query.replace(/[^a-zA-Z0-9ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').slice(0, 15);

  // 예: /data/scripts/20251110_153000_AI반도체
  const dirName = `${yyyymmdd}_${hhmmss}_${safeQuery}`;
  const fullPath = path.join(SCRIPT_DATA_DIR, dirName);


  await fs.mkdir(fullPath, { recursive: true });
  return fullPath;
}

// --- (Singleton 패턴) ---
// STT 파이프라인(모델)은 무겁기 때문에, 서버가 시작될 때 한 번만 로드합니다.
// 'Xenova/whisper-base'는 기본 모델입니다. 'small' 등으로 교체 가능.
// 'multilingual' 모델을 사용하여 'language: 'ko'' 힌트를 줍니다.
console.log('[STT Service] Whisper (JS) 모델 로드를 시작합니다...');
const transcriber = await pipeline(
  'automatic-speech-recognition',
  'Xenova/whisper-base',
  {
    progress_callback: (progress) => {
      // 모델 다운로드 진행 상황 (최초 1회만 실행됨)
      if (progress.status === 'download' && progress.name.includes('config.json')) {
        console.log(`[STT Service] 모델 다운로드 중... ${Math.round(progress.progress)}%`);
      }
    }
  }
);
console.log('[STT Service] Whisper (JS) 모델 로드 완료.');
// -------------------------


/**
 * [Spec 5.4] 비디오 1개를 오디오 파일(m4a)로 다운로드합니다.
 * (이전 코드와 거의 동일)
 * @param {string} videoId - 다운로드할 YouTube 비디오 ID
 * @param {string} saveDir - 저장할 폴더
 * @param {string} fileName - 저장할 파일명 (예: video1.m4a)
 * @returns {Promise<string>} 저장된 오디오 파일의 전체 경로
 */
export async function downloadAudio(videoId, saveDir, fileName) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const filePath = path.join(saveDir, fileName);

  console.log(`[STT Service] 오디오 다운로드 시작: ${videoId}`);
  try {
    await ytDlpExec(url, {
      f: 'bestaudio',
      o: filePath,
    });

    // 다운로드가 성공적으로 완료됨
    console.log(`[STT Service] 다운로드 완료: ${filePath}`);
    return filePath;

  } catch (err) {
    // 다운로드 중 오류 발생
    console.error(`[STT Service] 다운로드 실패 (yt-dlp): ${videoId}`, err);

    // 오류를 다시 던져서 이 함수를 호출한 곳에서 catch할 수 있도록 함
    throw err;
  }
}


/**
 * [Spec 5.4] (Python -> JS 교체)
 * 비디오 ID 배열을 받아, 오디오 다운로드 및 전사를 수행하고 텍스트를 반환합니다.
 * 오디오 파일을 읽어 STT(전사)를 수행합니다.
 * @param {string} filePath - 다운로드된 오디오 파일의 경로 (예: .../j1-Ua9Zv6qs.m4a)
 */
export async function TranscribeAudio(filePath) {
  try {
    console.log(`[STT Service] 전사 시작 (ffmpeg 사용): ${filePath}`);

    //    '파일 경로(string)'를 그대로 전달합니다.
    //    라이브러리가 설치된 ffmpeg를 감지하고 파일을 알아서 디코딩합니다.
    const audio = await read_audio(filePath, 16000);

    console.log(`[STT Service] 오디오 디코딩 완료 (Float32Array). 전사 시작...`);

    // 2. (수정) 파이프라인에 파일 경로가 아닌,
    //    디코딩된 오디오 파형(audio)을 전달합니다.
    const output = await transcriber(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: 'korean',
      task: 'transcribe',
    });

    console.log(`[STT Service] 전사 완료: ${filePath}`);
    return output; // ⭐️ 전사 결과 객체({ text: "..." }) 반환

  } catch (err) {
    console.error(`[STT Service] 전사 실패: ${filePath}`, err);
    throw err;
  }
}