'use client';

import { useState } from 'react';

export type ZKBackend = 'noir' | 'risc0';

interface ZKSetupWizardProps {
  isOpen: boolean;
  onSelect: (backend: ZKBackend) => void;
}

const BACKENDS = {
  noir: {
    id: 'noir' as ZKBackend,
    icon: '🎨',
    name: 'Noir Lang',
    tag: 'Active',
    tagColor: 'bg-green-600 text-white',
    color: 'border-purple-500 bg-purple-900/20',
    hoverColor: 'hover:border-purple-400',
    selectedColor: 'border-purple-500 bg-purple-900/30',
    titleColor: 'text-purple-300',
    disabled: false,
    specs: [
      { label: 'Proof Time', value: '~50ms', ok: true },
      { label: 'Proof Size', value: '~128 bytes', ok: true },
      { label: 'Backend', value: 'Barretenberg WASM', ok: true },
      { label: 'Stellar Verify', value: 'Frontend (ready)', ok: true },
    ],
    pros: ['Hafif ve hızlı', 'Barretenberg zaten entegre', 'Hackathon\'da tam çalışıyor'],
    desc: 'ZK için özel tasarlanmış DSL. Barretenberg WASM backend ile off-chain proof generation yapılır.',
  },
  risc0: {
    id: 'risc0' as ZKBackend,
    icon: '⚙️',
    name: 'RISC Zero',
    tag: 'Beta',
    tagColor: 'bg-yellow-600 text-black',
    color: 'border-blue-600 bg-blue-900/10',
    hoverColor: 'hover:border-blue-500',
    selectedColor: 'border-blue-500 bg-blue-900/20',
    titleColor: 'text-blue-300',
    disabled: false,
    specs: [
      { label: 'Proof Time', value: '~200ms', ok: false },
      { label: 'Proof Size', value: '~344 bytes', ok: false },
      { label: 'Backend', value: 'RISC-V execution', ok: true },
      { label: 'Stellar Verify', value: 'NethermindEth verifier', ok: true },
    ],
    pros: ['On-chain verification mümkün', 'NethermindEth stellar-risc0-verifier', 'Production-grade'],
    desc: 'x86 execution env. Off-chain compute + on-chain verify. stellar-risc0-verifier (NethermindEth) ile doğrulama.',
  },
};

export function ZKSetupWizard({ isOpen, onSelect }: ZKSetupWizardProps) {
  const [selected, setSelected] = useState<ZKBackend>('noir');
  const [showDetails, setShowDetails] = useState(false);

  if (!isOpen) return null;

  const backend = BACKENDS[selected];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-gray-700 rounded-2xl w-full max-w-xl shadow-2xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-800">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🔐</span>
            <h2 className="text-xl font-bold text-white">ZK Proof Backend</h2>
          </div>
          <p className="text-sm text-gray-400">
            Poker el kanıtlama sistemi seçin. Her el sonunda proof üretilir ve Stellar'a gönderilir.
          </p>
        </div>

        {/* Backend Cards */}
        <div className="p-6 space-y-3">
          {Object.values(BACKENDS).map((b) => (
            <button
              key={b.id}
              onClick={() => setSelected(b.id)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                selected === b.id ? b.selectedColor : `border-gray-700 ${b.hoverColor}`
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{b.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${b.titleColor}`}>{b.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${b.tagColor}`}>
                        {b.tag}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{b.desc}</p>
                  </div>
                </div>
                {/* Radio */}
                <div className={`mt-1 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                  selected === b.id ? 'border-purple-400' : 'border-gray-500'
                }`}>
                  {selected === b.id && (
                    <div className="w-2.5 h-2.5 rounded-full bg-purple-400" />
                  )}
                </div>
              </div>

              {/* Specs — show when selected */}
              {selected === b.id && (
                <div className="mt-3 pt-3 border-t border-gray-700 grid grid-cols-2 gap-2">
                  {b.specs.map((s) => (
                    <div key={s.label} className="flex items-center gap-1.5">
                      <span className={s.ok ? 'text-green-400' : 'text-yellow-400'}>
                        {s.ok ? '✅' : '⚠️'}
                      </span>
                      <span className="text-xs text-gray-400">{s.label}:</span>
                      <span className="text-xs text-gray-200">{s.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Comparison toggle */}
        <div className="px-6 pb-4">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-yellow-400 hover:underline"
          >
            {showDetails ? '▲ Karşılaştırmayı gizle' : '▼ Detaylı karşılaştır'}
          </button>

          {showDetails && (
            <div className="mt-3 rounded-lg border border-gray-700 overflow-hidden text-xs">
              <table className="w-full">
                <thead className="bg-slate-800">
                  <tr>
                    <th className="text-left px-3 py-2 text-gray-400">Özellik</th>
                    <th className="text-left px-3 py-2 text-purple-400">Noir</th>
                    <th className="text-left px-3 py-2 text-blue-400">RISC Zero</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {[
                    ['Proof Süresi', '~50ms', '~200ms'],
                    ['Proof Boyutu', '~128 byte', '~344 byte'],
                    ['Backend', 'Barretenberg', 'RISC-V VM'],
                    ['On-chain verify', '⚠️ WIP', '✅ NethermindEth'],
                    ['Hackathon durumu', '✅ Hazır', '⏳ Beta'],
                    ['Öğrenme eğrisi', 'Düşük', 'Orta'],
                  ].map(([feat, n, r]) => (
                    <tr key={feat} className="bg-slate-900/50">
                      <td className="px-3 py-2 text-gray-400">{feat}</td>
                      <td className="px-3 py-2 text-gray-200">{n}</td>
                      <td className="px-3 py-2 text-gray-200">{r}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Notice */}
        <div className="mx-6 mb-4 p-3 bg-yellow-950/40 border border-yellow-800 rounded-lg">
          <p className="text-xs text-yellow-300">
            <strong>💡 Hackathon için:</strong>{' '}
            {selected === 'noir'
              ? 'Noir seçildi. Tamamen hazır, Barretenberg entegre, proof üretimi çalışıyor.'
              : 'RISC Zero seçildi. Proof generation hazır, on-chain verify Beta aşamasında. NethermindEth stellar-risc0-verifier entegrasyonu devam ediyor.'}
          </p>
          {selected === 'risc0' && (
            <a
              href="https://github.com/NethermindEth/stellar-risc0-verifier"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:underline mt-1 block"
            >
              → NethermindEth/stellar-risc0-verifier repo
            </a>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6">
          <button
            onClick={() => onSelect(selected)}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-all"
          >
            {BACKENDS[selected].icon} {BACKENDS[selected].name} ile Devam Et
          </button>
        </div>
      </div>
    </div>
  );
}
