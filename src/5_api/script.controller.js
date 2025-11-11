// /src/5_api/script.controller.js
import { downloadAndTranscribe } from '../3_services/stt.service.js';
import { fetchGeneratedScript } from '../3_services/gemini.service.js';
import { saveGeneratedScript } from '../6_repository/file.repository.js';
import fs from 'fs/promises';
import path from 'path';

// __dirname 설정
const __dirname = path.dirname(new URL(import.meta.url).pathname);
// /data/scripts/ 폴더에 저장
const SCRIPT_DATA_DIR = path.join(__dirname, '../../data/scripts'); 

/**
 * [Spec 5.4 - 신규] 요구사항 4: 고유한 타임스탬프 폴더 생성
 * @param {string} query - 검색어 (폴더명에 사용)
 * @returns {Promise<string>} 생성된 폴더의 전체 경로
 */
async function createTimestampedDir(query) {
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
 * [Spec 5.4] (로직 변경) POST /api/generate-script
 * 요구사항 2, 3, 4 (선택, 다운로드, 전사, 폴더 저장)를 반영합니다.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handlePostScript(req, res) {
  try {
    // 요구사항 2: 프론트에서 선택된 videoId 배열과 원본 쿼리 수신
    const { videoIds, query } = req.body;
    if (!Array.isArray(videoIds) || videoIds.length === 0 || !query) {
      return res.status(400).json({ error: 'videoIds 배열(선택된)과 query가 필요합니다.' });
    }

    // 요구사항 4: 고유 폴더 생성
    const saveDir = await createTimestampedDir(query);
    console.log(`[Script Controller] 고유 폴더 생성: ${saveDir}`);

    // 요구사항 3 (1단계): 오디오 다운로드 및 Python Whisper 전사 실행
    const sttTexts = await downloadAndTranscribe(videoIds, saveDir);

    // 요구사항 3 (2단계): 4개의 TXT로 Gemini 스크립트 생성
    const script = await fetchGeneratedScript(sttTexts, query);

    // 요구사항 4: 최종 스크립트 및 전사본을 TXT 파일로 해당 폴더에 저장
    // (기존 saveGeneratedScript 함수 재사용, 단 저장 위치를 saveDir로 지정)
    await saveGeneratedScript(query, sttTexts, script, saveDir); 

    // 4. 생성된 스크립트 응답
    res.status(200).json({ 
      script: script,
      message: `스크립트 생성 완료. 결과 저장 폴더: ${path.basename(saveDir)}`
    });

  } catch (err) {
    console.error(`[handlePostScript Error] ${err.message}`);
    res.status(500).json({ error: '스크립트 생성 중 오류 발생' });
  }
}