'use client';

import { useUserRole } from '@/hooks/use-user-role';
import { authClient } from '@[removed]/auth/client';
import { Skeleton } from '@[removed]/ui/components';
import { Avatar, AvatarFallback, AvatarImage } from '@[removed]/ui/components/avatar';
import { Badge } from '@[removed]/ui/components/badge';
import { Button } from '@[removed]/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@[removed]/ui/components/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@[removed]/ui/components/dropdown-menu';
import { Input } from '@[removed]/ui/components/input';
import { Label } from '@[removed]/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@[removed]/ui/components/select';
import { cn } from '@[removed]/ui/lib/utils';
import { AlertCircle, Mail, MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface TeamMemberProps {
  id: string;
  role: string;
  avatar?: string;
  isPending?: boolean;
  name?: string;
  email: string;
}

function TeamMemberItem({ id, email, name, role, avatar, isPending }: TeamMemberProps) {
  return (
    <div className="bg-accent flex items-center justify-between rounded-md border p-4">
      <div className="flex items-center gap-4">
        <Avatar>
          <AvatarImage src={avatar} />
          <AvatarFallback>
            {name ? name.substring(0, 2).toUpperCase() : email.substring(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          {isPending ? (
            <div className="flex items-center gap-2">
              <p className="font-medium">Pending Invitation</p>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-500">
                <Mail className="mr-1 h-3 w-3" />
                Pending
              </Badge>
            </div>
          ) : (
            <p className="font-medium">{name}</p>
          )}
          <p className="text-muted-foreground text-sm">{email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn('text-sm font-semibold', role === 'owner' && 'text-primary')}>
          {role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : 'Member'}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isPending ? (
              <>
                <DropdownMenuItem>Resend Invitation</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive">Cancel Invitation</DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem>Manage Access</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive">Remove</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default function SettingsMembersPage() {
  const [emailInputs, setEmailInputs] = useState<
    { email: string; role: 'admin' | 'member'; error?: string }[]
  >([{ email: '', role: 'member' }]);
  const { data: activeOrg, isPending: isActiveOrgLoading } = authClient.useActiveOrganization();
  const { isAdmin, loading: isRoleLoading } = useUserRole();

  const addEmailInput = () => {
    setEmailInputs([...emailInputs, { email: '', role: 'member' }]);
  };

  const handleEmailChange = (index: number, value: string) => {
    if (index >= 0 && index < emailInputs.length) {
      const updated = [...emailInputs];
      (updated[index] as { email: string; role: string }).email = value;
      setEmailInputs(updated);
    }
  };

  const handleRoleChange = (index: number, value: string) => {
    if (index >= 0 && index < emailInputs.length) {
      const updated = [...emailInputs];
      (updated[index] as { email: string; role: string }).role = value;
      setEmailInputs(updated);
    }
  };

  const sendInvites = async () => {
    const invites = await Promise.all(
      emailInputs.map((input) =>
        authClient.organization.inviteMember({
          email: input.email,
          role: input.role,
        }),
      ),
    );
    invites.forEach((invite) => {
      if (invite.error) {
        setEmailInputs((prev) =>
          prev.map((input, index) =>
            index === emailInputs.indexOf(input)
              ? { ...input, error: invite.error.message }
              : input,
          ),
        );
        toast.error(invite.error.message);
      } else {
        toast.success('Invitation sent successfully');
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {(isRoleLoading || isActiveOrgLoading || !activeOrg) && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Skeleton className="h-6 w-36" />
            </CardTitle>
            <CardDescription>
              <Skeleton className="h-4 w-48" />
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <div className="flex w-full flex-row items-center gap-4">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-32" />
              </div>
            </div>
            <Skeleton className="h-8 w-28" />
          </CardContent>
          <CardFooter className="flex w-full justify-end">
            <Skeleton className="h-9 w-16" />
          </CardFooter>
        </Card>
      )}
      {!isRoleLoading && !isActiveOrgLoading && activeOrg && isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Add Members</CardTitle>
            <CardDescription>Invite members to your team by email address.</CardDescription>
          </CardHeader>

          <CardContent>
            <div className="w-full space-y-4">
              <div className="w-full space-y-4">
                {emailInputs.map((input, index) => (
                  <div key={index} className="flex w-full gap-4">
                    <div className="w-full">
                      <Label
                        className="mb-1.5 block text-sm font-medium"
                        htmlFor={`email-${index}`}
                      >
                        Email Address
                      </Label>
                      <Input
                        type="text"
                        id={`email-${index}`}
                        placeholder="john@[removed].com"
                        value={input.email}
                        onChange={(e) => handleEmailChange(index, e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">Role</label>
                      <Select
                        value={input.role}
                        onValueChange={(value) => handleRoleChange(index, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>

              <Button variant="outline" size="sm" onClick={addEmailInput}>
                <Plus className="mr-2 h-4 w-4" />
                Add more
              </Button>
            </div>
          </CardContent>

          <CardFooter className="flex w-full justify-end">
            <Button onClick={sendInvites}>Invite</Button>
          </CardFooter>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>Manage members and pending invitations for your team</CardDescription>
        </CardHeader>

        <CardContent>
          {!isActiveOrgLoading && activeOrg && activeOrg.members.length > 0 ? (
            <div className="flex flex-col gap-4">
              {activeOrg.members.map((member) => (
                <TeamMemberItem
                  key={member.id}
                  id={member.id}
                  name={member.user.name}
                  email={member.user.email}
                  role={member.role}
                  avatar={member.user.image}
                  isPending={false}
                />
              ))}
            </div>
          ) : isActiveOrgLoading || !activeOrg ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="bg-muted mx-auto flex h-12 w-12 items-center justify-center rounded-full">
                <AlertCircle className="text-muted-foreground h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">No results found</h3>
              <p className="text-muted-foreground mt-2 text-sm">
                No team members match your search criteria. Try adjusting your filters.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
