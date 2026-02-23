'use client';

interface GameLogEntry {
  timestamp: number;
  action: string;
  player?: string;
  amount?: number;
}

interface GameLogProps {
  entries: GameLogEntry[];
}

export function GameLog({ entries }: GameLogProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 max-h-96 overflow-y-auto">
      <h3 className="text-lg font-semibold mb-3 text-white">Game Log</h3>
      <div className="space-y-2">
        {entries.length === 0 ? (
          <p className="text-gray-400 text-sm">No actions yet</p>
        ) : (
          entries.map((entry, index) => (
            <div
              key={index}
              className="text-sm text-gray-300 border-l-2 border-stellar-purple pl-3 py-1"
            >
              <span className="text-gray-500">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              {' - '}
              {entry.player && (
                <span className="font-medium text-stellar-purple">
                  {entry.player}
                </span>
              )}{' '}
              {entry.action}
              {entry.amount !== undefined && (
                <span className="font-medium text-green-400">
                  {' '}
                  {entry.amount} chips
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
