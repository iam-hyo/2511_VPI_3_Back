# util.py
import os
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import csv

def get_popular_videos(api_key, region_code, max_results):
    """
    YouTube Data API를 호출하여 'mostPopular' 동영상 리스트를 가져옵니다.

    API 요청 비용:
    - 이 함수는 'videos.list' 엔드포인트를 사용합니다.
    - 'part' 매개변수에 'snippet'과 'statistics'를 요청했습니다.
    - 'videos.list' 호출 자체는 1 쿼터 유닛(Quota Unit)입니다.
    - 'part'에 따라 요청하는 정보량(snippet=2, statistics=2)이 달라지지만,
      'chart=mostPopular'를 사용하는 경우 비용은 1회 호출당 1 유닛으로 고정됩니다.

    포함 가능한 정보 (part 매개변수 기준):
    - snippet (2유닛): title, description, publishedAt, channelId, channelTitle, tags, categoryId 등
    - statistics (2유닛): viewCount, likeCount, commentCount 등
    - contentDetails (2유닛): duration, definition, caption 등
    - topicDetails (2유닛): relevantTopicIds (주제)
    - (이 코드에서는 'snippet'과 'statistics'만 사용합니다.)
    """
    try:
        # YouTube API 서비스 빌드
        youtube = build('youtube', 'v3', developerKey=api_key)

        # API 요청
        request = youtube.videos().list(
            part="snippet,statistics",  # 가져올 정보 파트
            chart="mostPopular",        # '가장 인기있는' 차트 사용
            regionCode=region_code,     # 국가 코드 (예: KR, US)
            maxResults=max_results      # 가져올 비디오 수
        )
        
        # 요청 실행
        response = request.execute()
        
        return response.get('items', [])

    except HttpError as e:
        print(f"API 호출 중 오류 발생: {e}")
        return None

def save_videos_to_csv(videos, filename="popular_videos.csv"):
    """
    동영상 리스트를 CSV 파일로 저장합니다. 한글 깨짐 방지를 위해 'utf-8-sig'를 사용합니다.
    """
    if not videos:
        print("저장할 비디오 데이터가 없습니다.")
        return

    # CSV 헤더 정의 (snippet과 statistics 기반)
    headers = [
        'video_id', 'published_at', 'title', 'channel_title', 
        'category_id', 'tags', 'view_count', 'like_count', 'comment_count'
    ]

    try:
        with open(filename, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.writer(f)
            # 1. 헤더 작성
            writer.writerow(headers)

            # 2. 데이터 행 작성
            for video in videos:
                snippet = video.get('snippet', {})
                stats = video.get('statistics', {})
                
                # 태그는 list 형식이므로 쉼표로 구분된 문자열로 변환
                tags = "|".join(snippet.get('tags', []))

                row = [
                    video.get('id'),
                    snippet.get('publishedAt'),
                    snippet.get('title'),
                    snippet.get('channelTitle'),
                    snippet.get('categoryId'),
                    tags,
                    stats.get('viewCount'),
                    stats.get('likeCount'),
                    stats.get('commentCount')
                ]
                writer.writerow(row)
        
        print(f"성공적으로 '{filename}' 파일에 데이터를 저장했습니다.")

    except IOError as e:
        print(f"파일 쓰기 중 오류 발생: {e}")
    except Exception as e:
        print(f"알 수 없는 오류 발생: {e}")