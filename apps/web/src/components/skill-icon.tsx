'use client';
import { DynamicIcon, iconNames, type IconName } from 'lucide-react/dynamic';

const valid = new Set<string>(iconNames);

export function SkillIcon({ name, className }: { name: string; className?: string }) {
  const icon = (valid.has(name) ? name : 'sparkles') as IconName;
  return <DynamicIcon name={icon} className={className ?? 'h-4 w-4'} />;
}
