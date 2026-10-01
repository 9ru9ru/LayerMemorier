// 내보내기 설정 칸 (export spec §6): 파일명 옵션, 폴더 묶기, 형식과 형식별 옵션, 크기.
// 값은 LMState.docData.output(normalize된 것). 바뀌면 PSD와 마지막 설정 파일에 쓴다.
LMUI.outputOptions = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const MATTES = [['none', '없음'], ['white', '흰색'], ['black', '검정'], ['gray', '회색'], ['background', '배경색'], ['foreground', '전경색']];
  const DITHERS = [['none', '없음'], ['diffusion', '확산'], ['pattern', '패턴'], ['noise', '노이즈']];
  const FORMATS = [['png24', 'PNG-24'], ['png8', 'PNG-8'], ['jpg', 'JPG'], ['tif', 'TIFF'], ['tga', 'TGA'], ['bmp', 'BMP'], ['psd', 'PSD']];
  const REDUCTIONS = [['perceptual', '지각적'], ['selective', '선택적'], ['adaptive', '적응적'], ['restrictive', '제한적 (웹)'],
    ['blackWhite', '흑백'], ['grayscale', '회색조'], ['mac', 'Mac OS'], ['windows', 'Windows']];
  const COMPRESSIONS = [['none', '없음'], ['lzw', 'LZW'], ['zip', 'ZIP'], ['jpg', 'JPG']];
  const DEPTHS = [[16, '16비트'], [24, '24비트'], [32, '32비트']];
  const TRIMS = [['none', '안 함'], ['each', '조합마다 각자'], ['combined', '모든 조합 공통 영역']];
  const CASES = [['keep', '그대로'], ['lower', '소문자'], ['upper', '대문자']];
  const TRIM_TIP = '모든 조합 공통 영역: 모든 파일의 크기·위치가 같아집니다. 영역을 먼저 재므로 시간이 약 2배 걸립니다.';

  function get(o, key) {
    return key.split('.').reduce((x, k) => x[k], o);
  }

  function select(o, key, items, disabled, title) {
    const cur = String(get(o, key));
    const opts = items.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === cur ? 'selected' : ''}>${esc(t)}</option>`).join('');
    return `<select data-out="${key}" ${disabled ? 'disabled' : ''} ${title ? `title="${esc(title)}"` : ''}>${opts}</select>`;
  }

  function check(o, key, label, disabled, title) {
    return `<label class="opt" ${title ? `title="${esc(title)}"` : ''}><input type="checkbox" data-out="${key}" ${get(o, key) ? 'checked' : ''} ${disabled ? 'disabled' : ''}>${esc(label)}</label>`;
  }

  function number(o, key, min, max, disabled) {
    return `<input type="number" class="num" data-out="${key}" min="${min}" max="${max}" value="${esc(get(o, key))}" ${disabled ? 'disabled' : ''}>`;
  }

  // label 은 글자, control 은 이미 만든 html.
  function field(label, control, unit) {
    return `<label class="opt">${esc(label)}${control}${unit ? esc(unit) : ''}</label>`;
  }

  // 비활성 규칙은 export spec §6 그대로.
  function formatOptions(o) {
    switch (o.format) {
      case 'png24':
        return check(o, 'png24.transparency', '투명도') + check(o, 'png24.interlaced', '인터레이스') +
          field('매트', select(o, 'png24.matte', MATTES, o.png24.transparency));
      case 'png8': {
        const p = o.png8;
        return field('색상 감소', select(o, 'png8.reduction', REDUCTIONS)) +
          field('색', number(o, 'png8.colors', 2, 256)) +
          field('디더', select(o, 'png8.dither', DITHERS)) +
          field('양', number(o, 'png8.ditherAmount', 0, 100, p.dither !== 'diffusion'), '%') +
          check(o, 'png8.transparency', '투명도') +
          field('투명도 디더', select(o, 'png8.transparencyDither', DITHERS, !p.transparency)) +
          field('양', number(o, 'png8.transparencyDitherAmount', 0, 100, !p.transparency || p.transparencyDither !== 'diffusion'), '%') +
          check(o, 'png8.interlaced', '인터레이스') +
          // PNG-8 은 투명도를 켜도 매트가 반투명 가장자리 색을 정한다 (리뷰 M4). PNG-24 와 달리 막지 않는다.
          field('매트', select(o, 'png8.matte', MATTES));
      }
      case 'jpg':
        return field('품질', number(o, 'jpg.quality', 0, 100)) + field('매트', select(o, 'jpg.matte', MATTES)) +
          check(o, 'jpg.icc', 'ICC 프로파일') + check(o, 'jpg.optimized', '최적화') + check(o, 'jpg.progressive', '프로그레시브');
      case 'tif':
        return field('압축', select(o, 'tif.compression', COMPRESSIONS)) +
          field('품질', number(o, 'tif.quality', 0, 100, o.tif.compression !== 'jpg')) +
          check(o, 'tif.alpha', '알파 채널') + check(o, 'tif.icc', 'ICC 프로파일') + check(o, 'tif.transparency', '투명도');
      case 'tga':
        return field('비트 깊이', select(o, 'tga.depth', DEPTHS)) + check(o, 'tga.alpha', '알파 채널', o.tga.depth !== 32) + check(o, 'tga.rle', 'RLE 압축');
      case 'bmp':
        return field('비트 깊이', select(o, 'bmp.depth', DEPTHS)) + check(o, 'bmp.alpha', '알파 채널', o.bmp.depth !== 32) +
          check(o, 'bmp.rle', 'RLE 압축', true, 'RLE는 4·8비트 BMP에만 있어 16·24·32비트에서는 쓸 수 없습니다') + check(o, 'bmp.flipRowOrder', '행 순서 뒤집기');
      default:
        return '<span class="hint">레이어를 합친 사본으로 저장합니다.</span>';
    }
  }

  // 폴더 이름 예시: 지금 문서의 첫 배리에이션으로 만든 폴더 경로.
  function folderExample(d, mode) {
    const v = LMCore.variation.enumerate(d.categories)[0];
    if (!v) return '폴더 없음';
    const doc = Object.assign({}, d, { output: Object.assign({}, d.output, { folderName: mode, suffix: '', letterCase: 'keep' }) });
    const parts = LMCore.naming.relativePath(doc, v).split('/');
    return parts.length > 1 ? parts.slice(0, -1).join('/') : '폴더 없음';
  }

  function render(d) {
    const o = d.output;
    const folders = d.categories.map(c =>
      `<label class="opt"><input type="checkbox" data-folder-cat="${esc(c.id)}" ${c.folder ? 'checked' : ''}><span class="dot" style="background:${LMColors.hex(c.color)}"></span>${esc(c.name)}</label>`).join('');
    const names = [['cumulative', `누적 (${folderExample(d, 'cumulative')})`], ['value', `값만 (${folderExample(d, 'value')})`]];
    return `
      <div class="out-row"><b class="out-label"></b>${field('접미사', `<input data-out="suffix" class="short" value="${esc(o.suffix)}">`)}${field('대소문자', select(o, 'letterCase', CASES))}${check(o, 'overwrite', '기존 파일 덮어쓰기')}</div>
      <div class="out-row folders"><b class="out-label">폴더</b>${folders || '<span class="hint">카테고리 없음</span>'}${field('이름', select(o, 'folderName', names))}</div>
      <div class="out-row"><b class="out-label">형식</b>${select(o, 'format', FORMATS)}</div>
      <div class="out-row format-options">${formatOptions(o)}</div>
      <div class="out-row"><b class="out-label">크기</b>${field('잘라내기', select(o, 'trim', TRIMS, false, TRIM_TIP))}${field('크기', number(o, 'scale', 1, 1000), '%')}${field('여백', number(o, 'padding', 0, 2000), 'px')}</div>`;
  }

  function setPath(o, key, value) {
    const parts = key.split('.');
    const last = parts.pop();
    parts.reduce((x, k) => x[k], o)[last] = value;
  }

  async function onChange(input) {
    const d = LMState.docData;
    if (input.dataset.folderCat) {
      const c = d.categories.find(c => c.id === input.dataset.folderCat);
      if (c) c.folder = input.checked;
    } else {
      const next = JSON.parse(JSON.stringify(d.output));
      setPath(next, input.dataset.out, input.type === 'checkbox' ? input.checked : input.value);
      d.output = LMCore.output.normalize(next);
      try { LMExportDefaults.save(d.output); } catch (e) { LMApp.status(e.message); }
    }
    await LMApp.saveDocData();
    LMApp.render();
  }

  // 리스너는 동기로 두고 비동기 본문의 거부를 한곳에서 받는다 (컨벤션 #2).
  document.addEventListener('change', e => {
    const input = e.target.closest('#tab-export [data-out], #tab-export [data-folder-cat]');
    if (!input) return;
    onChange(input).catch(err => LMApp.status(err.message));
  });

  return { render };
})();
