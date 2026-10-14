/**
 * 主题引导（供服务端 layout 与客户端 ThemeProvider 共用）。
 * 注意：不能放在 'use client' 模块中——服务端组件无法调用 client 模块的函数导出。
 */

export const THEME_STORAGE_KEY = 'theme';

/** 首帧内联脚本：在绘制前给 html 加 dark class，避免暗色模式闪白 */
export function getThemeBootstrapScript(): string {
  return `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
}
