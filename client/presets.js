// %APPDATA%\LayerMemorier\presets.json (spec §4.2, §9 프리셋 파일 깨짐)
const LMPresets = (() => {
  const fs = window.cep.fs;
  const dir = LMHost.cs.getSystemPath(SystemPath.USER_DATA) + '/LayerMemorier';
  const file = dir + '/presets.json';

  function load() {
    const r = fs.readFile(file, cep.encoding.UTF8);
    if (r.err !== fs.NO_ERROR) return { version: 1, presets: [] };
    try {
      const data = JSON.parse(r.data);
      if (!Array.isArray(data.presets)) throw new Error('presets missing');
      return data;
    } catch (e) {
      fs.writeFile(file + '.bak', r.data, cep.encoding.UTF8);
      return { version: 1, presets: [], corrupt: true };
    }
  }

  function save(data) {
    fs.makedir(dir);
    const r = fs.writeFile(file, JSON.stringify(data, null, 2), cep.encoding.UTF8);
    if (r.err !== fs.NO_ERROR) throw new Error('presets.json 쓰기 실패 (' + r.err + ')');
  }

  return { load, save, file };
})();
