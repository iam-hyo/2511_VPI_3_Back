// /src/3_services/stt.service.js
import fs from 'fs';
import path from 'path';
// import ytdl from 'ytdl-core'; // 유튜브 다운로드 라이브러리
import ytDlpExec from 'yt-dlp-exec';

// [신규] Transformers.js 라이브러리 임포트
import { pipeline } from '@xenova/transformers';

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
async function downloadAudio(videoId, saveDir, fileName) {
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

    // 성공 시 파일 경로를 반환 (이 함수를 호출한 곳에서 await로 받음)
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
 * @param {string[]} videoIds - 비디오 ID 배열 (e.g., ['id1', 'id2', 'id3', 'id4'])
 * @param {string} saveDir - 오디오와 TXT를 저장할 고유 폴더 경로
 * @returns {Promise<string[]>} 전사 텍스트 4개가 담긴 배열
 */
export async function downloadAndTranscribe(videoIds, saveDir) {

  // 1. 오디오 다운로드 (병렬 실행)
  const audioFileNames = videoIds.map(id => `${id}.m4a`);
  const downloadPromises = videoIds.map((id, index) =>
    downloadAudio(id, saveDir, audioFileNames[index])
  );
  await Promise.all(downloadPromises);

  // 2. JS Whisper 실행 (직렬 또는 병렬)
  // (참고: 여러 파일을 동시에 처리하면 메모리 사용량이 많을 수 있어, 여기서는 순차(직렬) 처리)
  console.log('[STT Service] JS Whisper 전사 작업 시작...');
  const sttTexts = [];

  for (let i = 0; i < videoIds.length; i++) {
    const videoId = videoIds[i];
    const audioPath = path.join(saveDir, audioFileNames[i]);
    const txtPath = path.join(saveDir, `${videoId}.txt`);

    try {
      console.log(`[STT Service] 오디오 디코딩 시작: ${audioPath}`);

      // 1. ffmpeg를 사용하여 오디오 파일 읽기
      const audioBuffer = fs.readFileSync(filePath);

      console.log(`[STT Service] 오디오 디코딩 완료. 전사 시작...`);
      // [핵심] Transformers.js를 사용하여 전사 실행
      const result = await transcriber(audioBuffer, {
            // Whisper 모델(STT)은 16kHz 모노 오디오에서 가장 잘 작동합니다.
            // 라이브러리가 ffmpeg를 통해 자동으로 처리하도록 옵션을 주는 것이 좋습니다.
            sampling_rate: 16000,
            mono: true,

            // 긴 오디오를 위한 청크 설정
            chunk_length_s: 30,
            stride_length_s: 5,
        });

      const full_text = result.text;
      sttTexts.push(full_text);

      // [신규] 전사 결과를 TXT 파일로 즉시 저장 (요구사항 3)
      await fs.promises.writeFile(txtPath, full_text, 'utf-8');
      console.log(`[STT Service] > 전사 완료 및 저장: ${txtPath}`);

    } catch (err) {
      console.error(`[STT Service] 전사 실패: ${audioPath}`, err);
      sttTexts.push(`(전사 실패: ${videoId})`);
    }
  }

  console.log('[STT Service] 모든 전사 작업 완료.');
  return sttTexts;
}