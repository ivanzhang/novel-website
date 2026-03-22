const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_ALL_CATEGORIES = [
  'index',
  'xuanhuan',
  'wuxia',
  'dushi',
  'lishi',
  'wangyou',
  'kehuan',
  'mm',
  'finish',
  'top',
];

// 集中管理抓取目标配置，避免导出脚本和补抓脚本各自维护一份常量。
const TARGETS = {
  biquge: {
    name: 'biquge',
    site: 'https://0732.bqg291.cc',
    sourceApiHost: 'https://0732.bqg291.cc',
    imageHost: 'https://www.bqg291.cc',
    chapterApiHost: 'https://apibi.cc',
    outputDir: path.join(PROJECT_ROOT, 'storage/json/biquge'),
    categories: [...DEFAULT_ALL_CATEGORIES],
    insecureHosts: new Set(['0732.bqg291.cc', 'www.bqg291.cc']),
  },
  bige7: {
    name: 'bige7',
    site: 'https://www.bqg291.cc',
    sourceApiHost: 'https://apibi.cc',
    imageHost: 'https://www.bqg291.cc',
    chapterApiHost: 'https://apibi.cc',
    outputDir: path.join(PROJECT_ROOT, 'storage/json/bige7'),
    categories: [...DEFAULT_ALL_CATEGORIES],
    insecureHosts: new Set(['www.bqg291.cc']),
  },
};

function getTargetConfig(name = 'biquge') {
  const key = String(name || 'biquge').toLowerCase();
  const target = TARGETS[key];

  if (!target) {
    throw new Error(`不支持的目标站点: ${name}`);
  }

  return {
    ...target,
    categories: [...target.categories],
    insecureHosts: new Set(target.insecureHosts),
  };
}

module.exports = {
  PROJECT_ROOT,
  DEFAULT_ALL_CATEGORIES,
  TARGETS,
  getTargetConfig,
};
