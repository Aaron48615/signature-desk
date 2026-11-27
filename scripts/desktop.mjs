import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env };
const local = join(root, '.build/tools');
if (!env.RUSTUP_HOME && existsSync(join(local, 'cargo/bin/cargo'))) {
  env.RUSTUP_HOME = join(local, 'rustup');
  env.CARGO_HOME = join(local, 'cargo');
  env.PATH = join(env.CARGO_HOME, 'bin') + delimiter + env.PATH;
}
function run(command, args) {
  const p = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (p.error) console.error(p.error.message);
  if (p.status !== 0) process.exit(p.status ?? 1);
}
const action = process.argv[2];
if (action === 'test') {
  if (process.platform === 'darwin') {
    const testDir = join(root, '.build/tests');
    const executable = join(testDir, 'macos-input');
    await mkdir(testDir, { recursive: true });
    run('xcrun', [
      'clang',
      '-fobjc-arc',
      'tests/macos-input.m',
      'src-tauri/native/macos.m',
      '-framework',
      'AppKit',
      '-framework',
      'CoreGraphics',
      '-framework',
      'IOKit',
      '-o',
      executable,
    ]);
    run(executable, []);
  }
  run('cargo', ['test', '--locked', '--manifest-path', 'src-tauri/Cargo.toml']);
} else {
  const bundle = { darwin: 'app', win32: 'nsis', linux: 'deb' }[process.platform];
  if (!bundle) throw new Error('当前平台暂未支持');
  const cli = join(root, 'node_modules/@tauri-apps/cli/tauri.js');
  run(process.execPath, [cli, ...(action === 'dev' ? ['dev'] : ['build', '--bundles', bundle])]);
  if (action !== 'dev') {
    const location = resolve(
      root,
      env.CARGO_TARGET_DIR || 'src-tauri/target',
      'release/bundle',
      bundle === 'app' ? 'macos' : bundle,
    );
    const suffix = { app: '.app', nsis: '-setup.exe', deb: '.deb' }[bundle];
    const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const names = (await readdir(location)).filter((name) =>
      bundle === 'app'
        ? name === 'Signature Desk.app'
        : name.startsWith('Signature Desk_' + version + '_') && name.endsWith(suffix),
    );
    if (names.length !== 1) throw new Error('无法唯一识别本次生成的应用包：' + location);
    const debArch = process.arch === 'x64' ? 'amd64' : process.arch;
    const filename = {
      app: 'Signature Desk.app',
      nsis: 'Signature-Desk-Windows-' + process.arch + '-Setup.exe',
      deb: 'Signature-Desk-Ubuntu-' + debArch + '.deb',
    }[bundle];
    const destination = join(root, 'release', filename);
    await mkdir(join(root, 'release'), { recursive: true });
    await cp(join(location, names[0]), destination, { recursive: true, verbatimSymlinks: true });
    if (bundle === 'app') {
      const verified =
        spawnSync('codesign', ['--verify', '--strict', destination], { stdio: 'ignore' }).status ===
        0;
      if (!verified) run('codesign', ['--force', '--sign', '-', destination]);
      run('codesign', ['--verify', '--strict', destination]);
    }
    console.log('应用包已复制到 release/');
  }
}
