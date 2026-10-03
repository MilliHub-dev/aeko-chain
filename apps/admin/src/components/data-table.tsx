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
  alwaysShowPagination?: boolean
}

function pageWindow(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1)

  const pages = new Set([1, total, current - 1, current, current + 1])
  const ordered = Array.from(pages)
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b)
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
  alwaysShowPagination = false,
}: DataTableProps) {
  const options = useMemo(
    () =>
      Array.from(new Set([...pageSizeOptions, pageSize]))
        .filter((value) => value > 0)
        .sort((a, b) => a - b),
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
  const showPagination = alwaysShowPagination || rows.length > smallestPageSize
  const displayStart = rows.length === 0 ? 0 : start + 1

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-[#1e2135] bg-[#12141f]">
      <div className="grid gap-3 p-3 xl:hidden">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#2b3048] bg-[#0d0e16]/70 px-4 py-10 text-center text-sm text-gray-600">
            {empty}
          </div>
        ) : (
          visibleRows.map((row, rowIndex) => (
            <article
              key={start + rowIndex}
              className="min-w-0 rounded-xl border border-[#24283b] bg-[#0d0e16]/70 p-4"
            >
              <dl className="grid min-w-0 gap-x-5 gap-y-3 sm:grid-cols-2">
                {row.map((cell, cellIndex) => (
                  <div key={cellIndex} className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.13em] text-gray-600">
                      {columns[cellIndex] ?? 'Value'}
                    </dt>
                    <dd className="mt-1 min-w-0 break-all text-sm leading-5 text-gray-200">
                      {cell}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))
        )}
      </div>

      <div className="hidden min-w-0 overflow-x-auto overscroll-x-contain xl:block">
        <table className="w-full min-w-[820px] table-auto text-sm">
          <thead>
            <tr className="border-b border-[#1e2135] bg-[#0d0e16]">
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1a1c2a]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-gray-600">
                  {empty}
                </td>
              </tr>
            ) : (
              visibleRows.map((row, rowIndex) => (
                <tr key={start + rowIndex} className="bg-[#12141f] transition-colors hover:bg-[#161828]">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="max-w-[24rem] px-4 py-3 text-xs leading-5 text-gray-300">
                      <div className="min-w-0 break-all">{cell}</div>
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPagination ? (
        <div className="flex flex-col gap-3 border-t border-[#1e2135] bg-[#0d0e16]/70 px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-xs text-gray-500" aria-live="polite">
            Showing <span className="font-medium tabular-nums text-gray-300">{displayStart}</span>
            {'–'}
            <span className="font-medium tabular-nums text-gray-300">{end}</span>
            {' of '}
            <span className="font-medium tabular-nums text-gray-300">{rows.length}</span> {paginationLabel}
          </div>

          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <label className="flex min-h-11 items-center gap-2 text-xs text-gray-500">
              Rows
              <select
                aria-label="Rows per page"
                value={rowsPerPage}
                onChange={(event) => {
                  setRowsPerPage(Number(event.target.value))
                  setPage(1)
                }}
                className="h-11 rounded-lg border border-[#2b3048] bg-[#12141f] px-2 text-xs text-gray-200 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              >
                {options.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <div className="flex min-w-0 items-center gap-1" role="navigation" aria-label="Table pagination">
              <button
                type="button"
                aria-label="Previous page"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage === 1}
                className="min-h-11 rounded-lg border border-[#2b3048] px-3 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              >
                Previous
              </button>

              <div className="hidden items-center gap-1 2xl:flex">
                {pageWindow(safePage, totalPages).map((item, index) =>
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
                        'h-11 min-w-11 rounded-lg border px-2 text-xs tabular-nums transition-colors ' +
                        (safePage === item
                          ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                          : 'border-[#2b3048] text-gray-400 hover:border-gray-500 hover:text-white')
                      }
                    >
                      {item}
                    </button>
                  ),
                )}
              </div>

              <span className="min-w-14 px-1 text-center text-xs tabular-nums text-gray-500 2xl:hidden">
                {safePage} / {totalPages}
              </span>

              <button
                type="button"
                aria-label="Next page"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={safePage === totalPages}
                className="min-h-11 rounded-lg border border-[#2b3048] px-3 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
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
