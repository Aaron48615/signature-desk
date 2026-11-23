import * as host from './desktop';

const english: Record<string, string> = {
  '处理后的图片超过尺寸上限，请减小导出尺寸或先裁剪。':
    'The edited image would exceed the size limit. Choose a smaller export size or crop first.',
  签字板: 'Signature Desk',
  书写模式: 'Writing mode',
  常规签名: 'Standard',
  触板直写: 'Trackpad ink',
  笔色: 'Ink',
  自定义笔色: 'Custom ink colour',
  粗细: 'Width',
  自然笔锋: 'Natural nib',
  '快速书写保留线宽，轻快提笔时短距离收锋。':
    'Fast strokes keep their weight. A quick lift gently tapers the tip.',
  签名画板: 'Signature canvas',
  在此签名: 'Sign here',
  '撤销（⌘/Ctrl Z）': 'Undo (⌘/Ctrl Z)',
  撤销: 'Undo',
  重做: 'Redo',
  清空画板: 'Clear canvas',
  画板尺寸: 'Canvas size',
  应用尺寸: 'Apply size',
  重置尺寸: 'Reset size',
  宽度: 'Width',
  高度: 'Height',
  宽: 'W',
  高: 'H',
  导出设置: 'Export settings',
  '最终 PNG 预览': 'PNG preview',
  'PNG 预览': 'PNG preview',
  背景: 'Background',
  透明: 'Transparent',
  白色: 'White',
  自定义: 'Custom',
  自定义背景色: 'Custom background colour',
  导出尺寸: 'Export size',
  锁定宽高比: 'Lock aspect ratio',
  '自由设置尺寸，笔迹等比居中': 'Set width and height independently with centred ink',
  导出宽度: 'Export width',
  导出高度: 'Export height',
  '直接导出 PNG': 'Export PNG',
  处理后导出: 'Edit & export',
  '保存 PNG': 'Save PNG',
  关闭: 'Close',
  'PNG 编辑预览': 'PNG editing preview',
  裁剪: 'Crop',
  框选裁剪: 'Select crop',
  留白: 'Padding',
  裁去空白: 'Trim margins',
  旋转与翻转: 'Rotate & flip',
  角度: 'Angle',
  旋转: 'Rotate',
  水平翻转: 'Flip horizontal',
  垂直翻转: 'Flip vertical',
  取消框选: 'Cancel crop',
  触板直写中: 'Trackpad ink active',
  结束直写: 'to finish',
  触控板: 'Trackpad',
  'Mac 触控板': 'Mac trackpad',
  '请输入触控板的实际尺寸（毫米）。': 'Enter the physical trackpad size in millimetres.',
  显示触点位置: 'Show touch position',
  边缘校准: 'Edge calibration',
  '填入手指抵达各边时的原始读数（%）。仅在本次窗口生效。':
    'Enter the raw reading (%) at each physical edge. Applies to this window.',
  左: 'Left',
  右: 'Right',
  上: 'Top',
  下: 'Bottom',
  恢复默认范围: 'Reset edges',
  取消: 'Cancel',
  确定: 'OK',
  等待接触: 'Waiting for touch',
  '原始 X': 'Raw X',
  尺寸无效: 'Invalid size',
  墨黑: 'Ink black',
  藏蓝: 'Midnight blue',
  赭红: 'Burnt sienna',
  松绿: 'Pine green',
  '按住鼠标或触控板拖动即可签名。': 'Hold and drag your mouse or trackpad to sign.',
  '画板尺寸已重置为 1200 × 640。': 'Canvas reset to 1200 × 640.',
  '画板最大边长 8192 px，总面积最多 1677 万像素。':
    'Choose up to 8,192 px per side and 16.7 megapixels total.',
  '请输入有效尺寸，单边最多 8192 px，总面积最多 1677 万像素。':
    'Enter a valid size, up to 8,192 px per side and 16.7 megapixels total.',
  '画板已清空，可撤销。': 'Canvas cleared. Undo to restore your ink.',
  '关闭提醒未就绪，请先导出签名': 'Export your signature before closing.',
  '请在关闭前导出签名。': 'Export your signature before closing.',
  '正在生成 PNG…': 'Preparing PNG…',
  '在预览上拖动以选择裁剪范围。': 'Drag on the preview to select a crop.',
  '已取消框选。': 'Crop cancelled.',
  '没有可裁剪的笔迹。': 'No ink to trim.',
  '仅保存处理后的 PNG。': 'Only the finished PNG will be saved.',
  '留白可设为 0 至 512 px。': 'Choose a margin from 0 to 512 px.',
  '角度范围为 −360° 到 360°。': 'Choose an angle from −360° to 360°.',
  '无法生成 PNG，请减小导出尺寸后重试。': 'Could not create the PNG. Try a smaller export size.',
  'PNG 已保存。': 'PNG saved.',
  '已取消保存。': 'Save cancelled.',
  'PNG 已交给浏览器下载，请在下载记录中确认。': 'Download started. Check your browser’s downloads.',
  '保存失败，签名仍在画板中。请检查保存位置后重试。':
    'Save failed. Your signature is still here. Check the destination and try again.',
  '输入已中断，已保留笔迹。': 'Input interrupted. Your ink is safe.',
  '已结束直写。': 'Trackpad ink ended.',
  '触控板已断开。': 'Trackpad disconnected.',
  '单指轻写，抬手断笔。': 'Write with one finger. Lift to start a new stroke.',
  '没有发现可读取绝对位置的触控板。': 'No trackpad with absolute touch positions was found.',
  '缺少这块触控板的读取权限。按 README 中的设备授权说明配置后重试。':
    'Trackpad access is missing. Follow the device permission steps in the README.',
  '驱动未提供绝对位置，可使用常规签名。':
    'This driver has no absolute touch data. Use standard mode.',
  '手指离开触控板，按空格开始。按 Esc 可随时结束。':
    'Lift your finger, then press Space to start. Press Esc to finish.',
  '左、上边界可填 −10 到 10，右、下边界可填 90 到 110。':
    'Left and top must be −10 to 10, right and bottom 90 to 110.',
  '请填入两个有效尺寸。': 'Enter two valid dimensions.',
  在本地应用中使用触板直写: 'Open Signature Desk to use trackpad ink',
  '浏览器可以按住拖动签名。打开签字板桌面应用，即可在支持的触控板上单指轻写。':
    'Hold and drag to sign in your browser. For single-finger writing without pressing, open the Signature Desk desktop app with a supported trackpad.',
  '设备检测失败，请重新打开应用后重试。': 'Could not detect devices. Reopen the app and try again.',
  '画板将按触控板的比例显示，已有笔迹会等比保留。':
    'The canvas will match your trackpad’s proportions. Existing ink stays in proportion.',
  开始直写: 'Start writing',
  '请抬起手指，按空格开始直写。': 'Lift your finger and press Space to start writing.',
  '窗口失焦，已结束直写。': 'Trackpad ink ended when the window lost focus.',
  '关闭签字板？': 'Close Signature Desk?',
  '尚有未导出的修改。关闭后，本次签名会从内存中清除。':
    'You have unexported changes. Closing will discard this signature.',
  放弃并关闭: 'Discard and close',
  知道了: 'Got it',
  '桌面事件连接失败，请重新打开应用。': 'Could not connect to the app. Reopen Signature Desk.',
  请先激活签名窗口: 'Activate the Signature Desk window first.',
  设备标识无效: 'Invalid device.',
  窗口不可用: 'Window unavailable.',
  '无法读取或独占这块触控板，请检查设备权限和占用情况':
    'Check trackpad access and whether another app is using it.',
  设备未提供绝对位置: 'The device does not provide absolute coordinates.',
  请输入触控板的实际宽高: 'Enter the physical trackpad dimensions.',
  '无法开启直写，请确认触控板已连接且窗口处于前台':
    'Could not start. Check that the trackpad is connected and Signature Desk is in front.',
  '语言仅在本次打开时生效。': 'This language applies to this session only.',
};
export type Language = 'en' | 'zh';
export let language: Language = 'en';
export const t = (source: string) => (language === 'en' ? (english[source] ?? source) : source);
const storageKey = 'inkpad.language';
export function initLanguage(refresh: () => void, onFailure: () => void) {
  const bindings: Array<() => void> = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    const text = node.textContent ?? '';
    const key = text.trim();
    if (!Object.hasOwn(english, key)) continue;
    const target = node;
    bindings.push(() => {
      target.textContent = text.replace(key, t(key));
    });
  }
  for (const target of document.querySelectorAll('[title],[aria-label]')) {
    for (const attr of ['title', 'aria-label']) {
      const key = target.getAttribute(attr);
      if (key && Object.hasOwn(english, key))
        bindings.push(() => target.setAttribute(attr, t(key)));
    }
  }
  const toggle = document.querySelector<HTMLButtonElement>('#language')!;
  function apply(lang: Language) {
    language = lang;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = t('签字板');
    for (const bind of bindings) bind();
    toggle.setAttribute(
      'aria-label',
      lang === 'en' ? 'Switch to Chinese · 切换中文' : '切换英文 · Switch to English',
    );
    toggle.title = toggle.getAttribute('aria-label')!;
    refresh();
    document.documentElement.dataset.ready = 'true';
  }
  let changed = false;
  let writes = Promise.resolve();
  if (host.desktop) {
    void host
      .loadLanguage()
      .then((v) => {
        if (!changed) apply(v === 'zh' ? 'zh' : 'en');
      })
      .catch(() => {
        if (!changed) apply('en');
      });
  } else {
    try {
      apply(localStorage.getItem(storageKey) === 'zh' ? 'zh' : 'en');
    } catch {
      apply('en');
    }
  }
  toggle.onclick = () => {
    changed = true;
    const next = language === 'en' ? 'zh' : 'en';
    apply(next);
    if (host.desktop) writes = writes.then(() => host.storeLanguage(next)).catch(onFailure);
    else
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        onFailure();
      }
  };
}
