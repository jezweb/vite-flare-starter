/**
 * User Edit Dialog
 *
 * Dialog for editing user details (name, email, role).
 */

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpdateUser } from '../hooks/useAdmin'
import type { UserResponse } from '@/shared/schemas/admin.schema'
import { ROLES } from '@/shared/schemas/admin.schema'
import { toast } from 'sonner'
import { Shield, UserCog, User } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'

const ROLE_OPTIONS = [
  { value: 'user', label: 'User', icon: User, description: 'Standard user access' },
  { value: 'manager', label: 'Manager', icon: UserCog, description: 'Can manage team resources' },
  { value: 'admin', label: 'Admin', icon: Shield, description: 'Full administrative access' },
]

const editUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  email: z.string().email('Invalid email address'),
  role: z.enum(ROLES),
})

type EditUserFormData = z.infer<typeof editUserSchema>

interface UserEditDialogProps {
  user: UserResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserEditDialog({ user, open, onOpenChange }: UserEditDialogProps) {
  const updateUser = useUpdateUser()

  const form = useForm<EditUserFormData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: '',
      email: '',
      role: 'user',
    },
  })

  // Reset form when user changes
  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name,
        email: user.email,
        role: user.role,
      })
    }
  }, [user, form])

  const onSubmit = async (data: EditUserFormData) => {
    if (!user) return

    try {
      await updateUser.mutateAsync({
        id: user.id,
        data: {
          name: data.name !== user.name ? data.name : undefined,
          email: data.email !== user.email ? data.email : undefined,
          role: data.role !== user.role ? data.role : undefined,
        },
      })
      toast.success('User updated successfully')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update user')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Edit User</SheetTitle>
          <SheetDescription>
            Update user information and role.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="John Doe" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="john@example.com" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ROLE_OPTIONS.map((option) => {
                        const Icon = option.icon
                        return (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              <span>{option.label}</span>
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SheetFooter className="mt-auto flex-row gap-2 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateUser.isPending}>
                {updateUser.isPending && <Spinner size="md" className="mr-2" />}
                Save Changes
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
