import {
  Rocket,
  Search,
  FileText,
  Image,
  Send,
  MessageSquare,
  UserCheck,
  BarChart3,
  Plug,
  Settings,
  MessageCircle,
  LayoutDashboard,
  type LucideIcon
} from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  hidden?: boolean;
  /** Optional numeric badge (e.g. pending A-level leads). */
  badge?: number;
};

// /analytics is now surfaced (lead funnel lives there). Keep the other three
// hidden until their UIs are promoted.
export const hiddenSectionPrefixes = [
  '/research',
  '/media',
  '/dashboard'
] as const;

export const navItems: NavItem[] = [
  // Primary hero — the autonomous run cockpit.
  { label: '运营驾驶舱', href: '/cockpit', icon: Rocket },
  // 获客 CRM is the core value loop → promoted to #2.
  { label: '线索管理', href: '/leads', icon: UserCheck },
  { label: '内容运营', href: '/content', icon: FileText },
  { label: '发布运营', href: '/publish', icon: Send },
  { label: '评论私信', href: '/conversations', icon: MessageSquare },
  { label: '获客分析', href: '/analytics/lead', icon: BarChart3 },
  { label: 'AI 助手', href: '/chat', icon: MessageCircle },
  { label: '集成配置', href: '/integrations', icon: Plug },
  { label: '系统设置', href: '/settings', icon: Settings },
  // ── Hidden (cockpit replaces 工作台; daily report covers others) ──
  { label: '工作台', href: '/dashboard', icon: LayoutDashboard, hidden: true },
  { label: '市场调研', href: '/research', icon: Search, hidden: true },
  { label: '素材库', href: '/media', icon: Image, hidden: true }
];
