import React from 'react';

interface Props {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  variant?: 'blue' | 'green' | 'purple' | 'pink' | 'amber' | 'orange' | 'red';
}

const bgMap: Record<string, string> = {
  blue: 'bg-gradient-to-br from-blue-50 to-blue-100 text-blue-900',
  green: 'bg-gradient-to-br from-green-50 to-green-100 text-green-900',
  purple: 'bg-gradient-to-br from-purple-50 to-purple-100 text-purple-900',
  pink: 'bg-gradient-to-br from-pink-50 to-pink-100 text-pink-900',
  amber: 'bg-white border border-gray-200 text-gray-900',
  orange: 'bg-white border border-gray-200 text-gray-900',
  red: 'bg-gradient-to-br from-red-50 to-red-100 text-red-900',
};

export default function DashboardStatsCard({ title, value, subtitle, variant = 'blue' }: Props) {
  const cls = bgMap[variant] || bgMap.blue;
  return (
    <div
      className={`${cls} rounded-lg p-4 text-center shadow-sm hover:shadow-md transition-shadow`}
    >
      <div className="text-xs font-semibold mb-1 uppercase tracking-wide text-opacity-90">
        {title}
      </div>
      <div className="text-3xl font-bold mt-1">{value}</div>
      {subtitle && <div className="text-xs text-opacity-80 mt-1">{subtitle}</div>}
    </div>
  );
}
