// index.js (메인 서버 파일)
import express from 'express';
import dotenv from 'dotenv';

// 컨트롤러 임포트
import { handleGetTrends } from './src/5_api/trends.controller.js';
import { handleGetRelated } from './src/5_api/related.controller.js';
import { handlePostScript } from './src/5_api/script.controller.js';
import { handleGetAvailableData } from './src/5_api/history.controller.js';

// .env 파일 로드
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json()); // JSON 바디 파싱

// [Spec 5.0] API 라우트 연결
app.get('/api/trends', handleGetTrends);
app.post('/api/related-videos', handleGetRelated); // (GET이 더 적절할 수 있으나 명세대로 POST)
app.post('/api/generate-script', handlePostScript);
app.get('/api/available-data', handleGetAvailableData);

// 서버 시작
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 서버가 '0.0.0.0:${PORT}' 에서 모든 접속을 대기 중입니다.`);
  console.log(`  (외부 접속: http://<서버_공용_IP>:${PORT})`);
  console.log('API 엔드포인트:');
  console.log(`  GET /api/trends?time=...&region=...`);
  console.log(`  POST /api/related-videos`);
  console.log(`  POST /api/generate-script`);
});