# 파란 청취 실험 도구 — 설계자용

GitHub Pages에 올리는 **설계자 전용** 저장소입니다.
참가자용 페이지와 참가자 실행 파일은 포함하지 않습니다.

## 포함 기능

- 프로젝트 폴더 열기
- 음성파일 목록 읽기
- 문항별 선택지 및 정답 설정
- 프로젝트 원본 저장 (`프로젝트ID_master.json`)
- 참가자용 JSON 생성 (`프로젝트ID_experiment.json`)
- 참가자 화면과 동일한 Runner로 실험 테스트
- 여러 참가자 결과 JSON 집계
- 참가자별 통계
- 문제별 통계
- 같은 정답 발음끼리 묶은 발음별 통계
- 전체 원자료 확인
- Excel / CSV 저장

실제 음성, 정답, 참가자 결과는 GitHub 저장소로 전송하지 않고 브라우저에서 로컬 파일만 읽습니다.

## GitHub Pages 배포

1. 새 GitHub 저장소를 만듭니다. 예: `paran-listening-experiment-designer`
2. 이 패키지의 압축을 풀어 **내용물 전체**를 저장소 루트에 올립니다.
3. GitHub의 `Settings → Pages`로 이동합니다.
4. `Build and deployment`에서 `Deploy from a branch`를 선택합니다.
5. `main` 브랜치와 `/(root)`를 선택하고 저장합니다.

배포 주소 예:

`https://사용자명.github.io/paran-listening-experiment-designer/`

## 파일 구조

```text
/
├─ index.html
├─ designer.js
├─ .nojekyll
├─ README.md
└─ common/
   ├─ runner-core.js
   ├─ analysis-core.js
   └─ styles.css
```

## 참고

Excel 저장 기능은 브라우저에서 SheetJS CDN을 사용하므로 Excel 저장 시 인터넷 연결이 필요합니다. CSV 저장은 별도 라이브러리 없이 동작합니다.
