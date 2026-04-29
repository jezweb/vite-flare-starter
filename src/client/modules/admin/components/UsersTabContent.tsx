/**
 * Users Tab Content
 *
 * Users management interface with search, sort, and pagination.
 */

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useUsers } from '../hooks/useAdmin'
import { UserList } from './UserList'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { useDebounce } from '@/client/hooks/useDebounce'
import { EmptyState } from '@/client/components/EmptyState'

const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'name:asc', label: 'Name A-Z' },
  { value: 'name:desc', label: 'Name Z-A' },
  { value: 'email:asc', label: 'Email A-Z' },
  { value: 'email:desc', label: 'Email Z-A' },
]

export function UsersTabContent() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')

  // Debounce search to avoid too many API calls
  const debouncedSearch = useDebounce(searchInput, 300)

  // Parse pagination and sort from URL
  const page = parseInt(searchParams.get('page') || '1', 10)
  const sortParam = searchParams.get('sort') || 'createdAt:desc'
  const [sortBy, sortOrder] = sortParam.split(':') as [string, 'asc' | 'desc']

  // Fetch users
  const { data, isLoading, error } = useUsers({
    page,
    limit: 10,
    search: debouncedSearch || undefined,
    sortBy: sortBy as 'name' | 'email' | 'createdAt',
    sortOrder,
  })

  // Update URL params
  const updateParams = (updates: Record<string, string | undefined>) => {
    const newParams = new URLSearchParams(searchParams)
    newParams.set('tab', 'users') // Keep on users tab

    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        newParams.set(key, value)
      } else {
        newParams.delete(key)
      }
    }

    setSearchParams(newParams)
  }

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    // Reset to page 1 when searching
    updateParams({ search: value || undefined, page: '1' })
  }

  const handleSortChange = (value: string) => {
    updateParams({ sort: value, page: '1' })
  }

  const handlePageChange = (newPage: number) => {
    updateParams({ page: String(newPage) })
  }

  // Calculate pagination info
  const totalPages = data?.totalPages || 1
  const hasNextPage = page < totalPages
  const hasPrevPage = page > 1

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Management
            </CardTitle>
            <CardDescription>
              {data ? `${data.total} total users` : 'Loading users...'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search and Sort Controls */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <SearchInput
            value={searchInput}
            onChange={handleSearchChange}
            placeholder="Search by name or email…"
            showClearButton
            className="flex-1"
          />
          <Select value={sortParam} onValueChange={handleSortChange}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* User List */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="py-8 text-center text-muted-foreground">
            Failed to load users. Please try again.
          </div>
        ) : data?.users.length === 0 ? (
          <EmptyState
            icon={Users}
            title={debouncedSearch ? 'No matching users' : 'No users yet'}
            description={
              debouncedSearch
                ? `Nothing matches "${debouncedSearch}". Try a different name or email.`
                : 'Once people sign in, you’ll be able to manage their roles and access here.'
            }
          />
        ) : (
          <UserList users={data?.users || []} />
        )}

        {/* Pagination */}
        {data && totalPages > 1 && (
          <div className="flex items-center justify-between border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page - 1)}
                disabled={!hasPrevPage}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page + 1)}
                disabled={!hasNextPage}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
