// /src/5_api/history.controller.js
import { listAnalyzedFiles } from '../6_repository/file.repository.js';

/**
 * [신규] GET /api/available-data
 * UI 필터 생성을 위해 /data 폴더의 분석 완료 파일 목록을 반환합니다.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handleGetAvailableData(req, res) {
  try {
    const files = await listAnalyzedFiles();
    res.status(200).json(files);
  } catch (err) {
    console.error(`[handleGetAvailableData Error] ${err.message}`);
    res.status(500).json({ error: '사용 가능한 데이터 목록 조회 실패' });
  }
}