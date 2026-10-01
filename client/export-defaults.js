// %APPDATA%\LayerMemorier\export-defaults.json (export spec §3.4): 마지막에 쓴 내보내기 설정.
const LMExportDefaults = (() => {
  const fs = window.cep.fs;
  const dir = LMHost.cs.getSystemPath(SystemPath.USER_DATA) + '/LayerMemorier';
  const file = dir + '/export-defaults.json';

  // 없거나 깨졌으면 null. 깨진 파일은 그대로 두고 다음 저장 때 새로 쓴다.
  function load() {
    const r = fs.readFile(file, cep.encoding.UTF8);
    if (r.err !== fs.NO_ERROR) return null;
    try {
      return JSON.parse(r.data);
    } catch (e) {
      return null;
    }
  }

  function save(output) {
    fs.makedir(dir);
    const r = fs.writeFile(file, JSON.stringify(output, null, 2), cep.encoding.UTF8);
    if (r.err !== fs.NO_ERROR) throw new Error('export-defaults.json 쓰기 실패 (' + r.err + ')');
  }

  return { load, save, file };
})();
