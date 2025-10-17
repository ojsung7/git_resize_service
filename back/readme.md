# 1. 먼저 프로젝트 디렉토리로 이동합니다.
cd C:\Users\ojsun\Desktop\gif_resize_service\back

# 2. 이미지를 빌드합니다. (태그: gif-optimizer-image)
docker build -t gif-optimizer-image .

docker run -d -p 5000:5000 -v C:/Users/ojsun/Desktop/gif_resize_service/back:/usr/src/app --name gif-optimizer-server gif-optimizer-image