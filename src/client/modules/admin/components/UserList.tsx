/**
 * User List Component
 *
 * Displays users in a table with actions for editing and managing.
 */

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDeleteUser, useRevokeUserSessions } from '../hooks/useAdmin'
import { UserEditDialog } from './UserEditDialog'
import type { UserResponse } from '@/shared/schemas/admin.schema'
import { MoreHorizontal, Pencil, Key, Trash2, Shield, UserCog, User } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

const ROLE_INFO = {
  admin: { label: 'Admin', icon: Shield, variant: 'default' as const },
  manager: { label: 'Manager', icon: UserCog, variant: 'secondary' as const },
  user: { label: 'User', icon: User, variant: 'outline' as const },
}

interface UserListProps {
  users: UserResponse[]
}

export function UserList({ users }: UserListProps) {
  const [editUser, setEditUser] = useState<UserResponse | null>(null)
  const [deleteUser, setDeleteUser] = useState<UserResponse | null>(null)
  const [revokeUser, setRevokeUser] = useState<UserResponse | null>(null)

  const deleteUserMutation = useDeleteUser()
  const revokeSessionsMutation = useRevokeUserSessions()

  const handleDelete = async () => {
    if (!deleteUser) return

    try {
      await deleteUserMutation.mutateAsync(deleteUser.id)
      toast.success(`User "${deleteUser.name}" has been deleted`)
      setDeleteUser(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete user')
    }
  }

  const handleRevokeSessions = async () => {
    if (!revokeUser) return

    try {
      await revokeSessionsMutation.mutateAsync(revokeUser.id)
      toast.success(`All sessions for "${revokeUser.name}" have been revoked`)
      setRevokeUser(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke sessions')
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Sessions</TableHead>
              <TableHead className="hidden lg:table-cell">Joined</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const roleInfo = ROLE_INFO[user.role as keyof typeof ROLE_INFO] ?? ROLE_INFO['user']
              const RoleIcon = roleInfo.icon

              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.image || undefined} alt={user.name} />
                        <AvatarFallback className="text-xs">{getInitials(user.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{user.name}</p>
                        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={roleInfo.variant} className="gap-1">
                      <RoleIcon className="h-3 w-3" />
                      {roleInfo.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {user.sessionCount} active
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditUser(user)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit User
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setRevokeUser(user)}
                          disabled={user.sessionCount === 0}
                        >
                          <Key className="mr-2 h-4 w-4" />
                          Revoke Sessions
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteUser(user)}
                          className="text-destructive focus:text-destructive"
                          disabled={user.isAdmin}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete User
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <UserEditDialog
        user={editUser}
        open={!!editUser}
        onOpenChange={(open) => !open && setEditUser(null)}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteUser?.name}</strong>?
              This will permanently remove their account and all associated data.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke Sessions Confirmation */}
      <AlertDialog open={!!revokeUser} onOpenChange={(open) => !open && setRevokeUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke All Sessions</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke all sessions for <strong>{revokeUser?.name}</strong>?
              They will be logged out of all devices and will need to sign in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevokeSessions}>
              Revoke Sessions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
