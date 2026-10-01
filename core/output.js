// export spec §3, §4 내보내기 설정. UMD: 브라우저는 LMCore.output, Node는 module.exports.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.LMCore = root.LMCore || {}; root.LMCore.output = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    format: 'png24',
    trim: 'none',
    scale: 100,
    padding: 0,
    letterCase: 'keep',
    suffix: '',
    overwrite: true,
    folderName: 'cumulative',
    png24: { transparency: true, interlaced: false, matte: 'white' },
    png8: {
      reduction: 'selective', colors: 256, dither: 'diffusion', ditherAmount: 100,
      transparency: true, transparencyDither: 'none', transparencyDitherAmount: 100,
      interlaced: false, matte: 'white',
    },
    jpg: { quality: 100, matte: 'white', icc: false, optimized: true, progressive: false },
    tif: { compression: 'lzw', quality: 100, alpha: true, icc: false, transparency: true },
    tga: { depth: 32, alpha: true, rle: true },
    bmp: { depth: 32, alpha: true, rle: false, flipRowOrder: false },
    psd: {},
  };

  const MATTES = ['none', 'white', 'black', 'gray', 'background', 'foreground'];
  const DITHERS = ['none', 'diffusion', 'pattern', 'noise'];
  const DEPTHS = [16, 24, 32];

  // 키마다 규칙: ['enum', 값들] | ['int', 최소, 최대] | ['bool'] | ['text']. 객체는 하위 키.
  const RULES = {
    format: ['enum', ['png24', 'png8', 'jpg', 'tif', 'tga', 'bmp', 'psd']],
    trim: ['enum', ['none', 'each', 'combined']],
    scale: ['int', 1, 1000],
    padding: ['int', 0, 2000],
    letterCase: ['enum', ['keep', 'lower', 'upper']],
    suffix: ['text'],
    overwrite: ['bool'],
    folderName: ['enum', ['cumulative', 'value']],
    png24: { transparency: ['bool'], interlaced: ['bool'], matte: ['enum', MATTES] },
    png8: {
      reduction: ['enum', ['perceptual', 'selective', 'adaptive', 'restrictive', 'blackWhite', 'grayscale', 'mac', 'windows']],
      colors: ['int', 2, 256],
      dither: ['enum', DITHERS],
      ditherAmount: ['int', 0, 100],
      transparency: ['bool'],
      transparencyDither: ['enum', DITHERS],
      transparencyDitherAmount: ['int', 0, 100],
      interlaced: ['bool'],
      matte: ['enum', MATTES],
    },
    jpg: { quality: ['int', 0, 100], matte: ['enum', MATTES], icc: ['bool'], optimized: ['bool'], progressive: ['bool'] },
    tif: { compression: ['enum', ['none', 'lzw', 'zip', 'jpg']], quality: ['int', 0, 100], alpha: ['bool'], icc: ['bool'], transparency: ['bool'] },
    tga: { depth: ['enum', DEPTHS], alpha: ['bool'], rle: ['bool'] },
    bmp: { depth: ['enum', DEPTHS], alpha: ['bool'], rle: ['bool'], flipRowOrder: ['bool'] },
    psd: {},
  };

  function clean(rule, value, fallback) {
    switch (rule[0]) {
      case 'enum': {
        // select 값은 문자열로 온다. 숫자 enum(비트 깊이)도 문자열로 받아 준다.
        const hit = rule[1].find(v => v === value || String(v) === String(value));
        return hit === undefined ? fallback : hit;
      }
      case 'int': {
        if (value === '' || value == null || typeof value === 'boolean') return fallback;
        const n = Number(value);
        if (!isFinite(n)) return fallback;
        return Math.min(rule[2], Math.max(rule[1], Math.round(n)));
      }
      case 'bool':
        return typeof value === 'boolean' ? value : fallback;
      case 'text':
        return typeof value === 'string' ? value.replace(/[\\/:*?"<>|]/g, '-') : fallback;
    }
    return fallback;
  }

  function normalizeWith(rules, defaults, input) {
    const src = input && typeof input === 'object' ? input : {};
    const out = {};
    for (const key of Object.keys(rules)) {
      const rule = rules[key];
      out[key] = Array.isArray(rule) ? clean(rule, src[key], defaults[key]) : normalizeWith(rule, defaults[key], src[key]);
    }
    return out;
  }

  function normalize(o) {
    return normalizeWith(RULES, DEFAULTS, o);
  }

  const EXT = { png24: 'png', png8: 'png', jpg: 'jpg', tif: 'tif', tga: 'tga', bmp: 'bmp', psd: 'psd' };

  function extension(format) {
    return EXT[format] || 'png';
  }

  // 원본에서 바로 웹용 저장을 할 수 있는가 (export spec §5.1).
  function isFastPath(o) {
    return (o.format === 'png24' || o.format === 'png8' || o.format === 'jpg') && o.trim === 'none' && o.scale === 100 && o.padding === 0;
  }

  function unionBounds(list) {
    let u = null;
    for (const b of list) {
      if (!b) continue;
      if (!u) u = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      else {
        u.left = Math.min(u.left, b.left);
        u.top = Math.min(u.top, b.top);
        u.right = Math.max(u.right, b.right);
        u.bottom = Math.max(u.bottom, b.bottom);
      }
    }
    return u;
  }

  return { DEFAULTS, normalize, extension, isFastPath, unionBounds };
});
