import React from 'react';

interface SparklineProps {
  data: number[];
  title: string;
  width?: number;
  height?: number;
  color?: string;
}

function Sparkline({ data, title, width = 120, height = 40, color = '#F97316' }: SparklineProps) {
  if (!data || data.length === 0)
    return (
      <svg width={width} height={height} role="img" aria-label={title}>
        <title>{title}</title>
      </svg>
    );
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
    <svg width={width} height={height} className="block" role="img" aria-label={title}>
      <title>{title}</title>
      <polyline fill="none" stroke={color} strokeWidth={2} points={points} />
    </svg>
  );
}

interface Props {
  volume?: number[]; // last N days
  successRate?: number[];
}

const DashboardCharts = React.memo(function DashboardCharts({
  volume = [],
  successRate = [],
}: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="bg-white rounded p-3 shadow-sm">
        <div className="text-xs text-gray-600 font-semibold mb-2">Send Volume (last days)</div>
        <Sparkline data={volume} color="#3B82F6" title="Send volume over last days line chart" />
        <table className="sr-only" aria-label="Send volume data">
          <caption>Send Volume (last days)</caption>
          <tbody>
            <tr>
              {volume.map((v, i) => (
                <td key={i}>{v}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="bg-white rounded p-3 shadow-sm">
        <div className="text-xs text-gray-600 font-semibold mb-2">Success Rate</div>
        <Sparkline
          data={successRate}
          color="#10B981"
          title="Success rate over last days line chart"
        />
        <table className="sr-only" aria-label="Success rate data">
          <caption>Success Rate</caption>
          <tbody>
            <tr>
              {successRate.map((v, i) => (
                <td key={i}>{v}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default DashboardCharts;
