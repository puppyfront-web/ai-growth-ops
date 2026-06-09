import {
  LayoutDashboard,
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
  type LucideIcon
} from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  hidden?: boolean;
};

export const hiddenSectionPrefixes = ['/research', '/media'] as const;

export const navItems: NavItem[] = [
  { label: 'AI 助手', href: '/chat', icon: MessageCircle },
  { label: '工作台', href: '/dashboard', icon: LayoutDashboard },
  { label: '市场调研', href: '/research', icon: Search, hidden: true },
  { label: '内容运营', href: '/content', icon: FileText },
  { label: '素材库', href: '/media', icon: Image, hidden: true },
  { label: '发布运营', href: '/publish', icon: Send },
  { label: '评论私信', href: '/conversations', icon: MessageSquare },
  { label: '线索管理', href: '/leads', icon: UserCheck },
  { label: '数据复盘', href: '/analytics', icon: BarChart3 },
  { label: '集成配置', href: '/integrations', icon: Plug },
  { label: '系统设置', href: '/settings', icon: Settings }
];
