'use client';

import { formatChips } from '@/lib/utils';

interface ChipStackProps {
  amount: number;
}

export function ChipStack({ amount }: ChipStackProps) {
  const getChipColor = (value: number) => {
    if (value >= 1000) return 'bg-purple-500';
    if (value >= 500) return 'bg-yellow-500';
    if (value >= 100) return 'bg-red-500';
    if (value >= 50) return 'bg-blue-500';
    return 'bg-white';
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-1">
        {[1000, 500, 100, 50, 10].map((denomination) => {
          const count = Math.min(Math.floor(amount / denomination), 5);
          if (count === 0) return null;
          
          return (
            <div key={denomination} className="relative">
              {Array.from({ length: count }).map((_, i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-full border-2 border-white ${getChipColor(
                    denomination
                  )} absolute`}
                  style={{
                    bottom: `${i * 3}px`,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>
      <span className="text-sm font-medium text-white mt-8">
        {formatChips(amount)}
      </span>
    </div>
  );
}
