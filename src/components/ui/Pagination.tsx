import Button from './Button'

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  totalCount: number
  pageSize: number
  isLoading?: boolean
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalCount,
  pageSize,
  isLoading = false,
}: PaginationProps) {
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalCount)

  const getVisiblePages = () => {
    const pages = []
    const maxVisiblePages = 5

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      const start = Math.max(1, currentPage - 2)
      const end = Math.min(totalPages, start + maxVisiblePages - 1)

      if (start > 1) {
        pages.push(1)
        if (start > 2) pages.push('...')
      }

      for (let i = start; i <= end; i++) {
        pages.push(i)
      }

      if (end < totalPages) {
        if (end < totalPages - 1) pages.push('...')
        pages.push(totalPages)
      }
    }

    return pages
  }

  if (totalPages <= 1) return null

  const visiblePages = getVisiblePages()

  return (
    <div class="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
      <div class="text-sm text-gray-700">
        Showing <span class="font-medium">{startItem}</span> to <span class="font-medium">{endItem}</span> of{' '}
        <span class="font-medium">{totalCount}</span> results
      </div>

      <div class="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1 || isLoading}
          class="flex items-center gap-1"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" role="img" aria-label="Previous">
            <title>Previous page</title>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Previous
        </Button>

        <div class="flex items-center gap-1">
          {visiblePages.map((page, index) =>
            page === '...' ? (
              <span
                key={`ellipsis-${String(visiblePages[index - 1])}-${String(visiblePages[index + 1])}`}
                class="px-2 py-1 text-gray-500"
              >
                ...
              </span>
            ) : (
              <Button
                key={page}
                size="sm"
                variant={currentPage === page ? 'primary' : 'outline'}
                onClick={() => onPageChange(page as number)}
                disabled={isLoading}
                class={`min-w-[2.5rem] ${
                  currentPage === page
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {page}
              </Button>
            ),
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || isLoading}
          class="flex items-center gap-1"
        >
          Next
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" role="img" aria-label="Next">
            <title>Next page</title>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </Button>
      </div>
    </div>
  )
}
