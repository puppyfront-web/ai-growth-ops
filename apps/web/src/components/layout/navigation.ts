import {
  Rocket,
  Search,
  FileText,
  Image,
  Send,
  MessageSquare,
  UserCheck,
  Users,
  BarChart3,
  Plug,
  Settings,
  MessageCircle,
  LayoutDashboard,
  type LucideIcon
} from 'lucide-react';

export type NavGroup = '获客' | '运营' | '配置';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  group?: NavGroup;
  hidden?: boolean;
  /** Optional numeric badge (e.g. pending A-level leads). */
  badge?: number;
};

// /analytics is now surfaced (lead funnel lives there). Keep the other three
// hidden until their UIs are promoted.
export const hiddenSectionPrefixes = [
  '/research',
  '/dashboard'
] as const;

export const navItems: NavItem[] = [
  { label: '智能获客', href: '/prospecting', icon: Search, group: '获客' },
  { label: '客户管理', href: '/customers', icon: UserCheck, group: '获客' },
  { label: '获客分析', href: '/analytics/lead', icon: BarChart3, group: '获客' },
  { label: '线索管理', href: '/leads', icon: Users, hidden: true },
  { label: '内容运营', href: '/content', icon: FileText, group: '运营' },
  { label: '发布运营', href: '/publish', icon: Send, group: '运营' },
  { label: '评论私信', href: '/conversations', icon: MessageSquare, group: '运营' },
  { label: '集成配置', href: '/integrations', icon: Plug, group: '配置' },
  { label: '系统设置', href: '/settings', icon: Settings, group: '配置' },
  // ── Hidden (not part of the current CRM-pipeline product surface) ──
  // 运营驾驶舱:AI 全自动运行,核心评论回复未跑通,暂隐藏
  { label: '运营驾驶舱', href: '/cockpit', icon: Rocket, hidden: true },
  // AI 助手:通用 chat,与获客 CRM 无关
  { label: 'AI 助手', href: '/chat', icon: MessageCircle, hidden: true },
  { label: '工作台', href: '/dashboard', icon: LayoutDashboard, hidden: true },
  { label: '市场调研', href: '/research', icon: Search, hidden: true },
  { label: '素材库', href: '/media', icon: Image, hidden: true }
];
