'use client'

import React, { useEffect, useMemo, useState } from 'react'

const DEFAULT_PAGE_SIZES = [15, 25, 50]

type Cell = string | number | React.ReactNode

type DataTableProps = {
  columns: string[]
  rows: Cell[][]
  empty?: string
  pageSize?: number
  pageSizeOptions?: number[]
  paginationLabel?: string
}

function pageWindow(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1)

  const pages = new Set([1, total, current - 1, current, current + 1])
  const ordered = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b)
  const result: Array<number | 'ellipsis'> = []

  ordered.forEach((page, index) => {
    const previous = ordered[index - 1]
    if (previous && page - previous > 1) result.push('ellipsis')
    result.push(page)
  })

  return result
}

export default function DataTable({
  columns,
  rows,
  empty = 'No data',
  pageSize = 15,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  paginationLabel = 'records',
}: DataTableProps) {
  const options = useMemo(
    () => Array.from(new Set([...pageSizeOptions, pageSize])).filter((value) => value > 0).sort((a, b) => a - b),
    [pageSize, pageSizeOptions],
  )
  const [rowsPerPage, setRowsPerPage] = useState(pageSize)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setRowsPerPage(pageSize)
    setPage(1)
  }, [pageSize])

  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage))
  const safePage = Math.min(page, totalPages)

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  const start = rows.length === 0 ? 0 : (safePage - 1) * rowsPerPage
  const end = Math.min(start + rowsPerPage, rows.length)
  const visibleRows = rows.slice(start, end)
  const smallestPageSize = options[0] ?? pageSize
  const showPagination = rows.length > smallestPageSize

  return (
    <div className="overflow-hidden rounded-xl border border-[#1e2135] bg-[#12141f]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e2135] bg-[#0d0e16]">
              {columns.map((col) => (
                <th key={col} scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1a1c2a]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-gray-600">
                  {empty}
                </td>
              </tr>
            ) : (
              visibleRows.map((row, rowIndex) => (
                <tr key={start + rowIndex} className="bg-[#12141f] transition-colors hover:bg-[#161828]">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-3 text-xs text-gray-300 mono">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPagination ? (
        <div className="flex flex-col gap-3 border-t border-[#1e2135] bg-[#0d0e16]/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500">
            Showing <span className="font-medium tabular-nums text-gray-300">{start + 1}</span>
            {'–'}
            <span className="font-medium tabular-nums text-gray-300">{end}</span>
            {' of '}
            <span className="font-medium tabular-nums text-gray-300">{rows.length}</span> {paginationLabel}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-gray-500">
              Rows
              <select
                aria-label="Rows per page"
                value={rowsPerPage}
                onChange={(event) => {
                  setRowsPerPage(Number(event.target.value))
                  setPage(1)
                }}
                className="h-9 rounded-lg border border-[#2b3048] bg-[#12141f] px-2 text-xs text-gray-200 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
              >
                {options.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-1" role="navigation" aria-label="Table pagination">
              <button
                type="button"
                aria-label="Previous page"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage === 1}
                className="min-h-[36px] rounded-lg border border-[#2b3048] px-3 text-xs text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              >
                Previous
              </button>

              <div className="hidden items-center gap-1 md:flex">
                {pageWindow(safePage, totalPages).map((item, index) => (
                  item === 'ellipsis' ? (
                    <span key={'ellipsis-' + index} className="px-1.5 text-xs text-gray-600">…</span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      aria-label={'Page ' + item}
                      aria-current={safePage === item ? 'page' : undefined}
                      onClick={() => setPage(item)}
                      className={
                        'h-9 min-w-9 rounded-lg border px-2 text-xs tabular-nums transition-colors ' +
                        (safePage === item
                          ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                          : 'border-[#2b3048] text-gray-400 hover:border-gray-500 hover:text-white')
                      }
                    >
                      {item}
                    </button>
                  )
                ))}
              </div>

              <span className="px-1 text-xs tabular-nums text-gray-500 md:hidden">
                {safePage} / {totalPages}
              </span>

              <button
                type="button"
                aria-label="Next page"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={safePage === totalPages}
                className="min-h-[36px] rounded-lg border border-[#2b3048] px-3 text-xs text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
