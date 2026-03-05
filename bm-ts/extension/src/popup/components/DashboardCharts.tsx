import React from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

function Sparkline({ data, width = 120, height = 40, color = '#F97316' }: SparklineProps) {
  if (!data || data.length === 0) return <svg width={width} height={height} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1 || 1);
  const points = data
    .map((d, i) => {
      const x = i * step;
      const y = height - ((d - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="block">
      <polyline fill="none" stroke={color} strokeWidth={2} points={points} />
    </svg>
  );
}

interface Props {
  volume?: number[]; // last N days
  successRate?: number[];
}

export default function DashboardCharts({ volume = [], successRate = [] }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="bg-white rounded p-3 shadow-sm">
        <div className="text-xs text-gray-600 font-semibold mb-2">Send Volume (last days)</div>
        <Sparkline data={volume} color="#3B82F6" />
      </div>
      <div className="bg-white rounded p-3 shadow-sm">
        <div className="text-xs text-gray-600 font-semibold mb-2">Success Rate</div>
        <Sparkline data={successRate} color="#10B981" />
      </div>
    </div>
  );
}
