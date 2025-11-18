// /src/3_services/stt.service.js
import path from 'path';
import ytDlpExec from 'yt-dlp-exec';
import wavefile from 'wavefile';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { pipeline } from '@xenova/transformers';

// __dirname 설정
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// /data/scripts/ 폴더에 저장
const SCRIPT_DATA_DIR = path.join(__dirname, '../../data/scripts');

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


// Node.js 환경에서 .wav 파일을 읽어서
// Whisper가 기대하는 형식(Float32Array, 16kHz, mono)으로 변환하는 함수
async function loadWavAsFloat32(filePath) {
  // fs/promises 로 파일 읽기 (Buffer 반환)
  const buffer = await fs.readFile(filePath);

  // wavefile로 WAV 파싱
  const wav = new wavefile.WaveFile(buffer);

  // 1) 파이프라인이 기대하는 형식: float32
  wav.toBitDepth('32f');

  // 2) Whisper 모델이 기대하는 샘플링 레이트: 16000 Hz
  wav.toSampleRate(16000);

  // 3) 실제 오디오 샘플 가져오기
  let audioData = wav.getSamples(); // 채널이 여러 개일 수도 있음

  // 다채널인 경우, 여기서는 단순히 첫 번째 채널만 사용 (mono)
  if (Array.isArray(audioData)) {
    audioData = audioData[0]; // Float32Array
  }

  return audioData; // Float32Array
}


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
      x: true,
      audioFormat: 'wav',
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
 * [함수 2] 로컬 오디오 파일 전사 (transformers.js + wavefile 사용)
 * @param {string} filePath 디코딩 및 전사할 오디오 파일의 경로
 * @returns {Promise<object>} 전사 결과 객체 (예: { text: "..." })
 */
export async function TranscribeAudio(filePath) { 
  try {
    console.log(`[STT Service] 전사 시작 (read_audio + ffmpeg): ${filePath}`);

     // 1. WAV 파일을 읽어서 Float32Array(16kHz, mono)로 변환
    const audio = await loadWavAsFloat32(filePath);

    console.log(`[STT Service] 오디오 디코딩 완료. 파이프라인 실행...`);

    // 2. 디코딩된 'audio' 데이터를 파이프라인(transcriber)에 전달
    const output = await transcriber(audio, {
      chunk_length_s: 30, // 30초 단위로 잘라서 처리
      stride_length_s: 5,  // 5초씩 겹쳐서 처리 (긴 오디오 안정성)
      language: 'korean', // 언어 지정
      task: 'transcribe', // '번역'이 아닌 '전사'
    });

    console.log(`[STT Service] 전사 완료: ${filePath}`);
    return output; // 컨트롤러에게 전사 결과 객체 반환

  } catch (err) {
    // 이 함수는 wavefile을 사용하므로 ffmpeg가 필요하지 않습니다
    console.error(`[STT Service] 전사 실패: ${filePath}`, err);
    throw err; // 오류를 컨트롤러로 전달
  }
}