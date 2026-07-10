'use client';

const CATEGORY_ICONS: Record<number, string> = {
  1000: 'cable',
  2000: 'cable',
  3000: 'tv',
  4000: 'monitor',
  5000: 'fitness_center',
  6000: 'checkroom',
  7000: 'footwear',
  8000: 'checkroom',
  10000: 'devices',
  11000: 'kitchen',
  12000: 'home',
  13000: 'lightbulb',
  14000: 'handyman',
  15000: 'inventory_2',
  16000: 'spa',
  17000: 'description',
};

export function CategoryIcon({ family, size = 16 }: { family: number | null; size?: number }) {
  if (!family) return null;
  const iconName = CATEGORY_ICONS[family];
  if (!iconName) return null;
  return (
    <span
      className="material-symbols-outlined"
      style={{ fontSize: size, lineHeight: 1 }}
    >
      {iconName}
    </span>
  );
}
