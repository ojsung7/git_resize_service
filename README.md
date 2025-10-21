# GIF Resize Service

간단한 GIF 최적화 서비스 리포지토리입니다. 이 저장소는 프론트엔드와 백엔드로 나뉘어 있습니다:

- `front/` — React + Vite(타입스크립트) 프론트엔드
- `back/`  — Flask 백엔드(Pillow + gifsicle). `back/Dockerfile` 포함

아래 문서는 로컬에서 프로젝트를 실행하는 방법(도커 권장), 백엔드를 Docker 기반 호스트에 배포하는 방법, 그리고 환경 변수 및 문제 해결 팁을 한국어로 정리한 것입니다.

---

## 목차
- 개요
- 필요 조건
- 빠른 시작(권장: Docker)
- 로컬 개발(도커 없이)
- 환경 변수

---

## 개요
- 프론트엔드는 Vite로 번들되며 빌드 시 `VITE_API_URL` 환경 변수를 사용해 백엔드 API의 기본 URL을 설정합니다.
- 백엔드는 `/api/optimize-gif` 엔드포인트로 multipart 업로드를 받아 처리합니다. GIF 최적화를 위해 내부적으로 `gifsicle` 바이너리를 사용하며, `back/Dockerfile`에서 설치됩니다.

---

## 필요 조건
- Docker (로컬에서 Docker로 실행하는 것을 권장합니다)
- (도커 없이 실행하려면) Python 3.8+ 및 Node.js/npm

---

## 빠른 시작 (권장: Docker)
현재 리포지토리에는 백엔드를 도커 이미지로 빌드하고 실행하는 방법과 프론트엔드 미리보기(`vite preview`)로 확인하는 방법이 포함되어 있습니다.

1. 저장소 루트에서 백엔드 도커 이미지를 빌드합니다:

```powershell
cd C:\Users\ojsun\Desktop\gif_resize_service\back
docker build -t gif-optimizer-image .
```

2. 컨테이너를 실행합니다:

```powershell
docker run -d -p 5000:5000 -v ~/back:/usr/src/app --name gif-optimizer-server gif-optimizer-image
```

3. 프론트엔드 미리보기를 실행하려면 `front` 폴더로 이동해 `npm` 명령을 사용합니다:

```powershell
cd ..\front
npm install
npm run preview
```

기본적으로 백엔드는 `http://localhost:5000`에서 동작합니다. 프론트엔드 미리보기 포트는 실행 로그에 출력됩니다.

컨테이너 중지/삭제는 다음과 같이 합니다:

```powershell
docker rm -f gif-optimizer-server
```

---

## 로컬 개발(도커 없이)
도커를 사용하지 않고 개발하려면 로컬에 `gifsicle`을 설치해야 하거나, 도커를 사용해 백엔드를 실행하는 것을 권장합니다. 로컬에서 실행하려면:

1. 백엔드(파이썬) 실행:

```powershell
cd back
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

2. 프론트엔드 실행:

```powershell
cd ../front
npm install
npm run dev
```

주의: Windows에서 도커를 사용하지 않고 백엔드를 직접 실행할 경우 `gifsicle`을 별도로 설치해 주세요. (도커 이미지는 이미 gifsicle을 포함합니다.)

---

## 환경 변수
- `VITE_API_URL`: 프론트엔드가 빌드 시 사용할 백엔드 기본 URL (예: `https://api.example.com`). Cloudflare Pages 환경 변수로 설정하세요.
- `PORT`: 백엔드는 `PORT` 환경 변수를 사용합니다(기본값 5000).

프로젝트 내 `front/.env.example` 파일을 참고하세요.

---