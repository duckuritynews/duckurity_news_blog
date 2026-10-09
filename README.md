# Duckurity News Blog

Astro 기반의 정적 한국어 보안 뉴스 블로그입니다. 기사 원고는 기사별 폴더의 Markdown 파일로 관리하며 GitHub Pages용 정적 사이트를 빌드합니다.

## 시작하기

Node.js 22.12 이상과 npm이 필요합니다. VS Code 터미널을 새로 연 뒤 `node -v`와 `npm -v`로 설치 여부를 확인하세요.

```powershell
npm install
npm run dev
```

개발 서버가 출력한 주소에서 GitHub Pages 기본 경로를 포함해 접속합니다: `http://localhost:4321/duckurity_news_blog/`.

## 기사 추가

저장소 루트의 `articles/` 아래에 기사 폴더를 만들고 `index.md`와 해당 기사의 이미지를 넣습니다. Content Collection이 `articles/**/index.md`를 읽으므로 목록·상세 페이지와 Pagefind 검색 색인에 자동 반영됩니다. 실제 폴더 이름은 `article`이나 `acrticle`이 아닌 **`articles`**입니다.

```text
articles/
  my-security-article/
    index.md
    images/
      cover.svg
      detail.webp
```

frontmatter 예시 (`keyPoints`는 선택 항목):

```yaml
---
slug: my-security-article
title: "기사 제목"
summary: "목록과 검색 결과에 표시할 짧은 요약"
publishedAt: "2026-10-01T09:00:00+09:00"
draft: false
authors: ["작성자"]
tags: ["취약점", "패치"]
keyPoints:
  - "핵심 요약 첫째"
  - "핵심 요약 둘째"
  - "핵심 요약 셋째"
---
```

`slug`는 기사 폴더 이름과 별개인 고유 영문 소문자 URL 식별자입니다. `publishedAt`에는 시간대가 포함된 ISO 8601 날짜를 적습니다. `keyPoints`는 선택 항목이며, 작성할 때는 내용이 있는 세 항목을 적습니다. 생략하거나 빈 배열(`[]`), 공백만 있는 항목을 넣으면 상세 페이지의 ‘핵심 3줄’ 영역을 표시하지 않습니다. 같은 폴더 안의 이미지는 Markdown에서 `![대체 텍스트](./images/detail.webp)`로 연결할 수 있습니다. 표지 이미지는 `cover: ./images/cover.svg`와 설명용 `coverAlt`를 함께 지정합니다.

`draft: false`이고 게시 시각이 빌드 시각 이전인 기사만 공개됩니다. 미래 날짜를 지정해도 시간이 지났을 때 저절로 게시되지는 않으므로, 해당 시각 이후 다시 빌드·배포해야 합니다. 날짜 표시는 현재 UTC 기준입니다.

현재 `articles/sample-*/`에는 **실제 보안 사건이 아닌 UI 확인용 가상 기사 3개**가 들어 있습니다. 게시 전에 샘플 폴더를 삭제하거나 각 문서의 `draft: true`로 바꾸세요. draft는 사이트에서 숨기는 기능일 뿐 공개 저장소에 커밋된 Markdown·이미지를 숨기지 않습니다. 공개하지 않을 원고는 공개 저장소에 두지 마세요.

## 검색과 정렬

제목·요약·본문·태그·별칭을 통합 검색합니다. CVE ID 검색은 본문과 메타데이터의 완전한 식별자 일치만 허용합니다. 최신순, 오래된순, 가나다순 정렬과 URL로 복원되는 검색·페이지 상태를 제공합니다.

날짜가 같으면 `slug` 순서로, 가나다순은 한국어·숫자 비교 후 `slug` 순서로 정렬합니다. 검색 결과를 정렬한 다음 페이지당 10개씩 표시합니다. 검색·정렬·페이지 이동에는 JavaScript가 필요하며, 비활성화하면 전체 기사 링크가 최신순으로 표시됩니다. 본문 검색 색인은 빌드할 때 생성되므로 `npm run dev` 대신 `npm run build` 후 `npm run preview`에서 검색을 확인하세요.

실제 기사 폴더를 건드리지 않고 합성 콘텐츠 12개로 긴 제목, 표, 코드, 이미지, 검색과 페이지네이션을 점검하려면:

```powershell
npm run build:fixtures
```

임시 사이트를 남겨 UI를 더 확인하려면 `KEEP_FIXTURES=1`을 환경 변수로 지정한 뒤 실행하세요. 명령 출력에서 임시 `dist` 경로를 확인해 미리보기에 사용하고 검증이 끝나면 임시 폴더를 삭제하면 됩니다.

## 검사와 빌드

```powershell
npm run check
npm run build
npm run verify:build
npm run build:fixtures
npm run preview
```

`verify:build`는 실제 `dist`의 내부 링크·이미지·검색 색인과 생성된 JavaScript의 정렬·페이지 이동·URL 복원·한글 조합 입력을 검사합니다. `build:fixtures`는 별도의 임시 원고로 SVG·PNG·JPEG·WebP 이미지, 12개 기사 페이지 이동, 초안·미래 기사 제외를 검사합니다. Node의 DOM 모형을 사용하므로 실제 브라우저의 시각적 배치 검사는 별도입니다.

PowerShell에서 `npm.ps1` 실행 정책 오류가 나면 `npm` 대신 `npm.cmd`를 사용하세요.

GitHub Actions의 PR workflow는 검사와 빌드를 수행합니다. Pages 배포 workflow는 `main` 브랜치 변경 또는 수동 실행에서 동작합니다. 저장소 Settings → Pages에서 Source를 GitHub Actions로 설정해야 합니다. 기본 base 경로는 `/duckurity_news_blog/`입니다. 다른 프로젝트 경로는 `SITE_BASE`, 배포 도메인은 `SITE_URL`로 설정합니다.

배포 주소는 `https://duckuritynews.github.io/duckurity_news_blog/`입니다. Pages workflow는 잠금 파일 기준 설치(`npm ci`), 검사, 빌드, 산출물 검증 후 `dist`를 배포합니다. 저장소 이름이나 도메인을 바꾸면 `astro.config.mjs`와 workflow의 환경 변수도 맞춰 변경하세요. 도메인 루트에 배포할 때는 `SITE_BASE=/`를 사용합니다. 설정 기준은 [Astro의 GitHub Pages 배포 안내](https://docs.astro.build/en/guides/deploy/github/)를 참고하세요.
