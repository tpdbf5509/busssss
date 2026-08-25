import { useState } from "react";
import { X, ChevronRight, MapPin, Check } from "lucide-react";
import { REGIONS } from "@/data/mock";

export function RegionModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (sido: string, sigungu: string) => void;
}) {
  const [selectedSido, setSelectedSido] = useState("전북특별자치도");
  const [selectedSigungu, setSelectedSigungu] = useState("전주시");

  if (!open) return null;

  const sidoList = REGIONS.map((r) => r.sido);
  const currentRegion = REGIONS.find((r) => r.sido === selectedSido);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">지역 선택</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex">
          <div className="w-2/5 overflow-y-auto border-r border-slate-100">
            {sidoList.map((sido) => (
              <button
                key={sido}
                onClick={() => setSelectedSido(sido)}
                className={`w-full text-left px-4 py-3.5 text-sm transition-colors flex items-center justify-between ${
                  selectedSido === sido
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>{sido}</span>
                {selectedSido === sido && (
                  <Check className="w-4 h-4 text-blue-600" />
                )}
              </button>
            ))}
          </div>
          <div className="w-3/5 overflow-y-auto">
            {currentRegion?.sigungus.map((sg) => (
              <button
                key={sg}
                onClick={() => setSelectedSigungu(sg)}
                className={`w-full text-left px-4 py-3.5 text-sm transition-colors flex items-center justify-between ${
                  selectedSigungu === sg
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="truncate">{sg}</span>
                {selectedSigungu === sg && (
                  <Check className="w-4 h-4 text-blue-600 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-3">
            <MapPin className="w-4 h-4 text-blue-500" />
            <span className="font-medium text-slate-700">
              {selectedSido} {selectedSigungu}
            </span>
          </div>
          <button
            onClick={() => onSelect(selectedSido, selectedSigungu)}
            className="w-full py-3.5 bg-blue-600 text-white rounded-2xl font-semibold text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
          >
            이 지역으로 설정
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
