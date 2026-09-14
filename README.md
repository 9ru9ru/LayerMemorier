# LayerMemorier

포토샵 2020(21.0.2) CEP 패널. 레이어에 배리에이션 마크를 붙이고 모든 조합을 PNG로 내보낸다.

## 설치 (Windows)

1. 이 저장소를 clone 한다.
2. PowerShell에서 `install\install.ps1`을 실행한다 (PlayerDebugMode 레지스트리 + 확장 폴더 정션).
3. 포토샵을 재시작하고 `창 ▸ 확장 ▸ LayerMemorier`를 연다.

## 개발

- `npm test` — core 단위 테스트
- `npm run test:e2e` — 포토샵을 COM으로 띄워 호스트·내보내기·패널 검증 (포토샵 2020 필요)
- `npm run panel:shot <label>` — 열려 있는 패널 스크린샷을 `test/out/shots/<label>.png`로 저장

spec: `Plans/20260915_LayerMemorier_spec.md`
