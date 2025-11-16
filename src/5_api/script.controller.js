// /src/5_api/script.controller.js
import { TranscribeAudio, createTimestampedDir, downloadAudio } from '../3_services/stt.service.js';
import { fetchGeneratedScript } from '../3_services/gemini.service.js';
import { saveGeneratedScript } from '../6_repository/file.repository.js';
import path from 'path';



/**
 * [Spec 5.4] POST /api/generate-script
 * 요구사항 2, 3, 4 (선택, 다운로드, 전사, 폴더 저장)를 반영합니다.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handlePostScript(req, res) {
  try {
    // 요구사항 2: 프론트에서 선택된 videoId 배열과 원본 쿼리 수신
    const { videoIds, query } = req.body;
    // console.log("[HandelPostScript 디버깅]")
    // console.log(req.body)
    if (!Array.isArray(videoIds) || videoIds.length === 0 || !query) {
      return res.status(400).json({ error: 'videoIds 배열(선택된)과 query가 필요합니다.' });
    }

    // 요구사항 4: 고유 폴더 생성
    const saveDir = await createTimestampedDir(query[0]);
    console.log(`[Script Controller] 고유 폴더 생성: ${saveDir}`);
    
    const sttTexts = [];

    // 2. videoIds 배열을 순회 (loop)
    for (const videoId of videoIds) {
      console.log(`[Script Controller] 처리 시작: ${videoId}`);

      // 3. (1단계) 오디오 다운로드 (yt-dlp-exec)
      //    파일 이름을 videoId.m4a 등으로 고정하는 것이 좋습니다.
      const fileName = `${videoId}.m4a`;
      const filePath = await downloadAudio(videoId, saveDir, fileName);

      // 4. (2단계) 다운로드된 '파일 경로'로 전사 (transformers.js)
      const transcriptionResult = await TranscribeAudio(filePath);

      // 5. 결과 배열에 전사된 텍스트(.text) 추가
      //    (Gemini가 원문 텍스트를 원하므로 .text를 푸시)
      sttTexts.push(transcriptionResult.text);
    }
    console.log("[Script Controller] 모든 전사 완료.");

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