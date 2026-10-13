'use client';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { THEME_STORAGE_KEY } from '@/lib/theme-bootstrap';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  /** 用户选择的偏好；system 表示跟随系统 */
  theme: Theme;
  /** 实际生效的主题（system 已解析） */
  resolvedTheme: 'light' | 'dark';
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  resolvedTheme: 'light',
  toggleTheme: () => {}
});

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = (localStorage.getItem(THEME_STORAGE_KEY) as Theme | null) ?? 'system';
    setTheme(stored);
    const resolved = resolveTheme(stored);
    setResolvedTheme(resolved);
    document.documentElement.classList.toggle('dark', resolved === 'dark');

    // 跟随系统时监听系统主题变化
    if (stored === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = (e: MediaQueryListEvent) => {
        setResolvedTheme(e.matches ? 'dark' : 'light');
        document.documentElement.classList.toggle('dark', e.matches);
      };
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      toggleTheme: () => {
        // 从「实际生效」的主题出发切换，符合直觉
        const next = resolvedTheme === 'light' ? 'dark' : 'light';
        setTheme(next);
        setResolvedTheme(next);
        localStorage.setItem(THEME_STORAGE_KEY, next);
        document.documentElement.classList.toggle('dark', next === 'dark');
      }
    }),
    [theme, resolvedTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
