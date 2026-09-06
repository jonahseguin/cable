'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@[removed]/ui/components/avatar';
import { Badge } from '@[removed]/ui/components/badge';
import { Button } from '@[removed]/ui/components/button';
import { ShieldIcon, XIcon } from 'lucide-react';
import { TeamMember } from './types';

export interface TeamMemberListProps {
  /**
   * List of team members
   */
  members: TeamMember[];

  /**
   * Current user's email (to mark as "you")
   */
  currentUserEmail?: string;

  /**
   * Current user's profile picture
   */
  currentUserProfilePicture?: string | null;

  /**
   * Callback to remove a member
   */
  onRemove?: (id: string) => void;

  /**
   * Whether this is a read-only view
   */
  readOnly?: boolean;

  /**
   * Optional className to pass
   */
  className?: string;

  /**
   * Variant: determines styling
   */
  variant?: 'default' | 'compact';
}

export function TeamMemberList({
  members,
  currentUserEmail,
  currentUserProfilePicture,
  onRemove,
  readOnly = false,
  className = '',
  variant = 'default',
}: TeamMemberListProps) {
  if (members.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <p className="mb-2.5 text-sm font-medium">
        {variant === 'default' ? `Team members (${members.length})` : 'Team Members'}
      </p>
      <div
        className={`${variant === 'default' ? 'divide-y' : 'border'} overflow-hidden rounded-lg ${variant === 'default' ? 'border' : ''}`}
      >
        {members.map((member) => (
          <TeamMemberItem
            key={member.id}
            member={member}
            currentUserEmail={currentUserEmail}
            currentUserProfilePicture={currentUserProfilePicture}
            onRemove={readOnly ? undefined : onRemove}
            variant={variant}
          />
        ))}
      </div>
    </div>
  );
}

interface TeamMemberItemProps {
  /**
   * The team member to display
   */
  member: TeamMember;

  /**
   * Current user's email
   */
  currentUserEmail?: string;

  /**
   * Current user's profile picture
   */
  currentUserProfilePicture?: string | null;

  /**
   * Callback to remove member
   */
  onRemove?: (id: string) => void;

  /**
   * Variant: determines styling
   */
  variant?: 'default' | 'compact';
}

// Helper function to get initials from an email
function getInitialsFromEmail(email: string): string {
  if (!email) return 'TM';

  // Extract the part before @ symbol
  const parts = email.split('@');
  const namepart = parts.length > 0 ? parts[0] : '';

  // If it contains dots (like first.last@example.com), use first letters of each part
  if (namepart && namepart.includes('.')) {
    return namepart
      .split('.')
      .map((part) => part.charAt(0).toUpperCase())
      .join('')
      .substring(0, 2);
  }

  // Otherwise, use the first 1-2 characters
  return namepart ? namepart.substring(0, 2).toUpperCase() : 'TM';
}

export function TeamMemberItem({
  member,
  currentUserEmail,
  currentUserProfilePicture,
  onRemove,
  variant = 'default',
}: TeamMemberItemProps) {
  const isCurrentUser = currentUserEmail && member.email === currentUserEmail;
  const isOwner = member.role === 'owner';
  const initials = getInitialsFromEmail(member.email);

  return (
    <div
      className={
        variant === 'default'
          ? 'bg-background hover:bg-accent/5 flex items-center justify-between px-3 py-2.5 transition-colors'
          : 'flex items-center gap-3 border-b px-4 py-2 last:border-b-0'
      }
    >
      <div className="flex flex-1 items-center gap-2.5">
        <Avatar className={variant === 'default' ? 'border-border/50 size-7 border' : 'size-6'}>
          {isCurrentUser && currentUserProfilePicture ? (
            <AvatarImage src={currentUserProfilePicture} alt="Your profile picture" />
          ) : (
            <AvatarFallback
              className={
                variant === 'default'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-primary/10 text-primary text-xs'
              }
            >
              {initials}
            </AvatarFallback>
          )}
        </Avatar>
        <span className={variant === 'default' ? 'text-sm font-medium' : 'text-sm'}>
          {member.email}
        </span>
        <Badge
          variant={member.role === 'member' ? 'outline' : 'default'}
          className={`${
            variant === 'default' ? 'ml-0.5' : 'ml-auto'
          } h-5 px-1.5 text-xs ${member.role === 'owner' ? 'bg-primary' : ''}`}
        >
          {member.role !== 'member' && <ShieldIcon className="mr-1 size-2.5" />}
          {member.role}
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        {isCurrentUser && <span className="text-muted-foreground text-xs">(you)</span>}

        {onRemove && variant === 'default' && !isOwner && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(member.id)}
            className="text-muted-foreground hover:text-foreground h-7 w-7 rounded-full p-0"
          >
            <span className="sr-only">Remove</span>
            <XIcon className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
