export default function DataTable({
  columns,
  rows,
  empty = 'No data',
}: {
  columns: string[]
  rows: (string | number | React.ReactNode)[][]
  empty?: string
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#1e2135]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#1e2135] bg-[#0d0e16]">
            {columns.map((col) => (
              <th key={col} className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1a1c2a]">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-600">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="bg-[#12141f] hover:bg-[#161828] transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-3 text-gray-300 mono text-xs">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

// Re-export React for use in component
import React from 'react'
