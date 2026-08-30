import type { PrintPackingRow } from '@/shared/services/business/productionService';

interface Props {
  date: string;
  rows: PrintPackingRow[];
}

export function PrintPackingSheet({ date, rows }: Props) {
  // Group by Meal, then by Area
  const grouped = rows.reduce((acc, row) => {
    if (!acc[row.meal]) acc[row.meal] = {};
    if (!acc[row.meal][row.area]) acc[row.meal][row.area] = [];
    acc[row.meal][row.area].push(row);
    return acc;
  }, {} as Record<string, Record<string, PrintPackingRow[]>>);

  const meals = ['Breakfast', 'Lunch', 'Dinner'].filter(m => grouped[m]);

  return (
    <div className="hidden print:block text-black bg-white p-8 absolute inset-0 z-50 min-h-screen font-sans">
      
      {meals.length === 0 ? (
        <div className="text-center italic mt-10">
          <h1 className="text-2xl font-bold uppercase tracking-wider mb-4 border-b-2 border-black pb-4">Kitchen Packing Sheet</h1>
          <p>No orders for today.</p>
        </div>
      ) : (
        meals.map((meal, _mealIdx) => (
          <div key={meal} className="break-before-page first:break-before-auto">
            {/* Header for each meal page */}
            <div className="flex justify-between items-end border-b-2 border-black pb-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold uppercase tracking-wider">{meal} Packing Sheet</h1>
                <p className="text-sm mt-1 text-gray-600">Production Date: {date}</p>
              </div>
              <div className="text-sm font-bold text-gray-500">
                Page <span className="pageNumber"></span> {/* Use CSS counter if possible, else it relies on browser header */}
                Mysuru Paakashale
              </div>
            </div>

            {/* Render Areas within this meal */}
            {Object.entries(grouped[meal]).sort(([a], [b]) => a.localeCompare(b)).map(([area, areaRows]) => (
              <div key={area} className="mb-8 avoid-page-break">
                <h2 className="text-lg font-bold border-b border-gray-300 pb-1 mb-3">{area}</h2>
                
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-b-2 border-gray-400 text-gray-700">
                      <th className="py-2 px-3 font-bold w-20">Order ID</th>
                      <th className="py-2 px-3 font-bold w-1/4">Customer</th>
                      <th className="py-2 px-3 font-bold w-16 text-center">Qty</th>
                      <th className="py-2 px-3 font-bold w-1/4">Plan & Notes</th>
                      <th className="py-2 px-3 font-bold">Delivery Partner</th>
                      <th className="py-2 px-3 font-bold w-16 text-center">Packed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {areaRows.map((row, idx) => (
                      <tr key={`${row.orderId}-${idx}`} className="border-b border-gray-300">
                        <td className="py-2 px-3 font-mono text-xs font-bold text-gray-600">{row.displayId}</td>
                        <td className="py-2 px-3 font-semibold">{row.customerName}</td>
                        <td className="py-2 px-3 text-center font-black text-lg">{row.quantity}</td>
                        <td className="py-2 px-3 text-xs space-y-1">
                          <div className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">{row.plan}</div>
                          {row.specialInstructions && <div className="font-bold text-red-600">⚠️ {row.specialInstructions}</div>}
                          {row.packingNotes && <div className="font-semibold text-blue-700">📝 {row.packingNotes}</div>}
                        </td>
                        <td className="py-2 px-3 text-sm">{row.deliveryPartner}</td>
                        <td className="py-2 px-3">
                          <div className="w-6 h-6 border-2 border-gray-400 mx-auto rounded-sm"></div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ))
      )}

      {/* Global styles to ensure print works smoothly */}
      <style>{`
        @media print {
          body > #root > div:not(.print\\:block) {
            display: none !important;
          }
          .avoid-page-break {
            page-break-inside: avoid;
          }
          /* Counter for pages across the document */
          body {
            counter-reset: page;
          }
          .break-before-page {
            counter-increment: page;
          }
          .pageNumber::after {
            content: counter(page);
          }
        }
      `}</style>
    </div>
  );
}
