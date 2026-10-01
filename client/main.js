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
    let docChanged = false;
    let ids = {};
    ids = await LMHost.onEvents(ev => {
      if (LMState.exporting) return;
      // 문서 전환·닫기·새 문서는 패널이 일으킬 수 없으므로 메아리로 보고 건너뛰지 않는다.
      // 스크립트로 새 문서를 만들면 documentAfterActivate 없이 make(new: document)만 온다.
      const { id, data } = LMHost.eventInfo(ev);
      const newDoc = id === ids.make && data.new && data.new._obj === 'document';
      // setd 는 레이어 색이 바뀐 경우만 본다 (그 밖의 속성 변경은 무시). 패널은 색을 바꾸지 않으므로 메아리가 아니다.
      const colorChange = id === ids.set && data.to && data.to._obj === 'layer' && data.to.color;
      if (id === ids.set && !colorChange) return;
      if (id === ids.docActivate || id === ids.close || newDoc || colorChange) docChanged = true;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const force = docChanged;
        docChanged = false;
        // 패널이 스스로 일으킨 선택·가시성 변경의 메아리는 무시한다 (LMApp.muteEcho).
        if (!force && Date.now() < LMState.echoUntil) return;
        LMApp.refresh().catch(err => LMApp.status(err.message));
      }, 200);
    });

    await LMApp.refresh();
    window.LMReady = true;
  } catch (e) {
    LMApp.status(e.message);
  }
})();
