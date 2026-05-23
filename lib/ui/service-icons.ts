import {
  Globe, Database, Zap, Layers, Leaf, BarChart3, Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Globe, Database, Zap, Layers, Leaf, BarChart3, Settings,
};

export function resolveServiceIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Globe;
}
