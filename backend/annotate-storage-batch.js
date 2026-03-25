#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

async function annotateDir(dir, batchName) {
  const booksDir = path.join(dir, 'books');
  const files = (await fs.readdir(booksDir)).filter((file) => file.endsWith('.json'));
  for (const file of files) {
    const fullPath = path.join(booksDir, file);
    const payload = JSON.parse(await fs.readFile(fullPath, 'utf8'));
    payload.storage_batch = batchName;
    await fs.writeFile(fullPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
  return files.length;
}

async function main() {
  const count = await annotateDir(path.resolve(process.argv[2] || 'storage/json/biquge'), process.argv[3] || 'biquge');
  console.log(`标记完成: ${count}`);
}

module.exports = {
  annotateDir,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
