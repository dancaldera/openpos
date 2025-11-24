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

  return (
    <div class="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg">
      <div class="text-sm text-gray-700">
        Showing <span class="font-medium">{startItem}</span> to <span class="font-medium">{endItem}</span> of{' '}
        <span class="font-medium">{totalCount}</span> results
      </div>

      <div class="flex items-center space-x-2">
        <Button
          variant="secondary"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || isLoading}
          class="px-3 py-1"
        >
          Previous
        </Button>

        <div class="flex items-center space-x-1">
          {getVisiblePages().map((page, index) => {
            const key = typeof page === 'number' ? `page-${page}` : `ellipsis-${index}`
            return (
              <div key={key}>
                {page === '...' ? (
                  <span class="px-3 py-1 text-gray-500">...</span>
                ) : (
                  <Button
                    variant={currentPage === page ? 'primary' : 'ghost'}
                    onClick={() => onPageChange(page as number)}
                    disabled={isLoading}
                    class="px-3 py-1 min-w-[40px]"
                  >
                    {page}
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        <Button
          variant="secondary"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || isLoading}
          class="px-3 py-1"
        >
          Next
        </Button>
      </div>
    </div>
  )
}
