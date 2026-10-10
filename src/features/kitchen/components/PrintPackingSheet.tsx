import type { PrintPackingRow } from "@/shared/services/business/productionService";

interface Props {
  date: string;
  rows: PrintPackingRow[];
}

function normalizeMealSection(
  mealType?: string,
): "Breakfast" | "Lunch" | "Dinner" | null {
  if (!mealType) return null;
  const lower = mealType.trim().toLowerCase();
  if (lower === "breakfast") return "Breakfast";
  if (lower === "lunch") return "Lunch";
  if (lower === "dinner") return "Dinner";
  return null;
}

export function PrintPackingSheet({ date, rows }: Props) {
  // Group by Canonical Meal ("Breakfast" | "Lunch" | "Dinner"), then by Area
  const grouped = rows.reduce(
    (acc, row) => {
      const section = normalizeMealSection(row.mealType || row.meal);
      if (!section) return acc;
      if (!acc[section]) acc[section] = {};
      if (!acc[section][row.area]) acc[section][row.area] = [];
      acc[section][row.area].push(row);
      return acc;
    },
    {} as Record<
      "Breakfast" | "Lunch" | "Dinner",
      Record<string, PrintPackingRow[]>
    >,
  );

  const meals = (["Breakfast", "Lunch", "Dinner"] as const).filter(
    (m) => grouped[m] && Object.keys(grouped[m]).length > 0,
  );

  return (
    <div className="hidden print:block text-black bg-white p-8 absolute inset-0 z-50 min-h-screen font-sans">
      {meals.length === 0 ? (
        <div className="text-center italic mt-10">
          <h1 className="text-2xl font-bold uppercase tracking-wider mb-4 border-b-2 border-black pb-4">
            Kitchen Packing Sheet
          </h1>
          <p>No orders for today.</p>
        </div>
      ) : (
        meals.map((meal, _mealIdx) => (
          <div key={meal} className="break-before-page first:break-before-auto">
            {/* Header for each meal page */}
            <div className="flex justify-between items-end border-b-2 border-black pb-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold uppercase tracking-wider">
                  {meal} Packing Sheet
                </h1>
                <p className="text-sm mt-1 text-gray-600">
                  Production Date: {date}
                </p>
              </div>
              <div className="text-sm font-bold text-gray-500">
                Page <span className="pageNumber"></span>{" "}
                {/* Use CSS counter if possible, else it relies on browser header */}
                Mysuru Paakashale
              </div>
            </div>

            {/* Special Instructions & Handling Checklist (Monochrome Print-Safe) */}
            {(() => {
              const mealAllRows = Object.values(grouped[meal]).flat();
              const specialRows = mealAllRows.filter((r) =>
                Boolean(
                  r.specialInstructions?.trim() || r.packingNotes?.trim(),
                ),
              );

              if (specialRows.length === 0) return null;

              return (
                <div className="mb-6 p-3 border-2 border-black rounded avoid-page-break bg-gray-50">
                  <div className="flex justify-between items-center border-b border-black pb-1.5 mb-2">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-black">
                      ⚠️ Special Instructions Checklist — {meal} (
                      {specialRows.length})
                    </h3>
                    <span className="text-[11px] text-gray-700 italic">
                      Verify handling &amp; check off before packing
                    </span>
                  </div>

                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-400 bg-gray-200/80 text-gray-800">
                        <th className="py-1 px-2 w-10 text-center font-bold">
                          Done
                        </th>
                        <th className="py-1 px-2 w-20 font-bold font-mono">
                          ID
                        </th>
                        <th className="py-1 px-2 w-28 font-bold">Area</th>
                        <th className="py-1 px-2 w-36 font-bold">
                          Dish / Item
                        </th>
                        <th className="py-1 px-2 w-12 text-center font-bold">
                          Qty
                        </th>
                        <th className="py-1 px-2 font-bold">
                          Custom Handling &amp; Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {specialRows.map((row, sIdx) => (
                        <tr
                          key={`special-${row.orderId}-${sIdx}`}
                          className="border-b border-gray-300"
                        >
                          <td className="py-1.5 px-2 text-center">
                            <div className="w-4 h-4 border-2 border-black mx-auto rounded-sm" />
                          </td>
                          <td className="py-1.5 px-2 font-mono font-bold text-gray-900">
                            {row.displayId}
                          </td>
                          <td className="py-1.5 px-2 text-gray-700 font-medium">
                            {row.area}
                          </td>
                          <td className="py-1.5 px-2 font-semibold text-gray-900">
                            {row.meal}
                          </td>
                          <td className="py-1.5 px-2 text-center font-bold text-sm">
                            {row.quantity}
                          </td>
                          <td className="py-1.5 px-2 space-y-0.5">
                            {row.specialInstructions && (
                              <div className="font-bold text-black">
                                <span className="uppercase text-[10px] bg-gray-200 px-1 py-0.5 rounded mr-1">
                                  Customer:
                                </span>
                                {row.specialInstructions}
                              </div>
                            )}
                            {row.packingNotes && (
                              <div className="font-medium text-gray-800">
                                <span className="uppercase text-[10px] bg-gray-200 px-1 py-0.5 rounded mr-1">
                                  Packing:
                                </span>
                                {row.packingNotes}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* Render Areas within this meal */}
            {Object.entries(grouped[meal])
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([area, areaRows]) => (
                <div key={area} className="mb-8 avoid-page-break">
                  <h2 className="text-lg font-bold border-b border-gray-300 pb-1 mb-3">
                    {area}
                  </h2>

                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-100 border-b-2 border-gray-400 text-gray-700">
                        <th className="py-2 px-3 font-bold w-20">Order ID</th>
                        <th className="py-2 px-3 font-bold w-1/4">Customer</th>
                        <th className="py-2 px-3 font-bold w-16 text-center">
                          Qty
                        </th>
                        <th className="py-2 px-3 font-bold w-1/4">
                          Plan & Notes
                        </th>
                        <th className="py-2 px-3 font-bold">
                          Delivery Partner
                        </th>
                        <th className="py-2 px-3 font-bold w-16 text-center">
                          Packed
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {areaRows.map((row, idx) => (
                        <tr
                          key={`${row.orderId}-${idx}`}
                          className="border-b border-gray-300"
                        >
                          <td className="py-2 px-3 font-mono text-xs font-bold text-gray-600">
                            {row.displayId}
                          </td>
                          <td className="py-2 px-3 font-semibold">
                            {row.customerName}
                          </td>
                          <td className="py-2 px-3 text-center font-black text-lg">
                            {row.quantity}
                          </td>
                          <td className="py-2 px-3 text-xs space-y-1">
                            <div className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">
                              {row.plan}
                            </div>
                            {row.meal && (
                              <div className="font-medium text-gray-800 text-xs">
                                {row.meal}
                              </div>
                            )}
                            {row.specialInstructions && (
                              <div className="font-bold text-red-600">
                                ⚠️ {row.specialInstructions}
                              </div>
                            )}
                            {row.packingNotes && (
                              <div className="font-semibold text-blue-700">
                                📝 {row.packingNotes}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-sm">
                            {row.deliveryPartner}
                          </td>
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
