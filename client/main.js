// 부팅: 호스트 로드 → 이벤트 등록 → 첫 새로고침. 탭 전환·새로고침 버튼.
(async () => {
  document.getElementById('tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    LMState.tab = b.dataset.tab;
    LMApp.render();
  });
  document.getElementById('btn-refresh').addEventListener('click', () => LMApp.refresh());

  try {
    await LMHost.load();

    let timer = null;
    await LMHost.onEvents(() => {
      if (LMState.exporting) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        // 패널이 스스로 일으킨 선택 변경의 메아리는 무시한다 (레이어 탭이 표시).
        if (Date.now() < LMState.echoUntil) return;
        LMApp.refresh().catch(err => LMApp.status(err.message));
      }, 200);
    });

    await LMApp.refresh();
    window.LMReady = true;
  } catch (e) {
    LMApp.status(e.message);
  }
})();
