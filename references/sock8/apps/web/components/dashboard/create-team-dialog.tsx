'use client';

import * as React from 'react';
import { useState, useRef } from 'react';
import {
  PlusIcon,
  UsersIcon,
  UploadIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  XIcon,
  ShieldIcon,
  ImageIcon,
} from 'lucide-react';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@sock8/ui/components/dialog';
import { Button } from '@sock8/ui/components/button';
import { Input } from '@sock8/ui/components/input';
import { Avatar, AvatarFallback, AvatarImage } from '@sock8/ui/components/avatar';
import { useDialog } from '@/lib/contexts/dialog-context';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sock8/ui/components';
import { Badge } from '@sock8/ui/components/badge';
import { z } from 'zod';

// Types
type TeamRole = 'admin' | 'member';
type FormStage = 'team-details' | 'team-members' | 'confirmation';

interface TeamMember {
  id: string;
  email: string;
  role: TeamRole;
}

interface TeamData {
  name: string;
  picture: string | null;
  members: TeamMember[];
}

// Props interfaces
interface CreateTeamDialogContentProps {
  onSuccess?: (teamData: TeamData) => void;
}

interface ProgressIndicatorProps {
  currentStage: FormStage;
}

interface TeamMemberItemProps {
  member: TeamMember;
  onRemove: (id: string) => void;
}

interface TeamMemberListProps {
  members: TeamMember[];
  onRemove: (id: string) => void;
}

// Components
const ProgressIndicator = ({ currentStage }: ProgressIndicatorProps) => (
  <div className="mb-6 mt-2 flex w-full items-center gap-2">
    <div
      className={`flex size-7 items-center justify-center rounded-full text-xs font-medium ${
        currentStage === 'team-details'
          ? 'bg-primary text-primary-foreground'
          : 'bg-primary/10 text-primary'
      }`}
    >
      1
    </div>
    <div
      className={`h-0.5 flex-1 ${currentStage !== 'team-details' ? 'bg-primary' : 'bg-border'}`}
    ></div>
    <div
      className={`flex size-7 items-center justify-center rounded-full text-xs font-medium ${
        currentStage === 'team-members'
          ? 'bg-primary text-primary-foreground'
          : currentStage === 'confirmation'
            ? 'bg-primary/10 text-primary'
            : 'bg-muted text-muted-foreground'
      }`}
    >
      2
    </div>
    <div
      className={`h-0.5 flex-1 ${currentStage === 'confirmation' ? 'bg-primary' : 'bg-border'}`}
    ></div>
    <div
      className={`flex size-7 items-center justify-center rounded-full text-xs font-medium ${
        currentStage === 'confirmation'
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      3
    </div>
  </div>
);

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

const TeamMemberItem = ({ member, onRemove }: TeamMemberItemProps) => {
  const initials = getInitialsFromEmail(member.email);

  return (
    <div className="bg-background hover:bg-accent/5 flex items-center justify-between px-3 py-2.5 transition-colors">
      <div className="flex items-center gap-2.5">
        <Avatar className="border-border/50 size-7 border">
          <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium">{member.email}</span>
        <Badge
          variant={member.role === 'admin' ? 'default' : 'outline'}
          className="ml-0.5 h-5 px-1.5 text-xs"
        >
          {member.role === 'admin' && <ShieldIcon className="mr-1 size-2.5" />}
          {member.role}
        </Badge>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(member.id)}
        className="text-muted-foreground hover:text-foreground h-7 w-7 rounded-full p-0"
      >
        <span className="sr-only">Remove</span>
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
};

const TeamMemberList = ({ members, onRemove }: TeamMemberListProps) => (
  <div className="mt-4">
    <p className="mb-2.5 text-sm font-medium">Added members ({members.length})</p>
    <div className="divide-y overflow-hidden rounded-lg border">
      {members.map((member) => (
        <TeamMemberItem key={member.id} member={member} onRemove={onRemove} />
      ))}
    </div>
  </div>
);

// Main dialog content component
export function CreateTeamDialogContent({ onSuccess }: CreateTeamDialogContentProps) {
  const { closeDialog } = useDialog();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [stage, setStage] = useState<FormStage>('team-details');
  const [teamName, setTeamName] = useState('');
  const [teamPicture, setTeamPicture] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<TeamRole>('member');
  const [emailError, setEmailError] = useState<string | null>(null);

  // Handlers
  const handleTeamPictureUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const fileUrl = URL.createObjectURL(file);
      setTeamPicture(fileUrl);
    }
  };

  const validateEmail = (email: string): boolean => {
    // Use Zod for more strict email validation that requires a proper domain with TLD
    const emailSchema = z.string().email();
    try {
      emailSchema.parse(email);
      return true;
    } catch (error) {
      return false;
    }
  };

  const addTeamMember = () => {
    if (!newMemberEmail) {
      return;
    }

    // Validate email format
    if (!validateEmail(newMemberEmail)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    // Check for duplicate email
    if (teamMembers.some((member) => member.email === newMemberEmail)) {
      setEmailError('This email is already added to the team');
      return;
    }

    // Clear any previous errors
    setEmailError(null);

    setTeamMembers((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        email: newMemberEmail,
        role: newMemberRole,
      },
    ]);
    setNewMemberEmail('');
    setNewMemberRole('member');
  };

  const removeTeamMember = (id: string) => {
    setTeamMembers((prev) => prev.filter((member) => member.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newMemberEmail) {
      e.preventDefault();
      addTeamMember();
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMemberEmail(e.target.value);
    // Clear error when user starts typing
    if (emailError) {
      setEmailError(null);
    }
  };

  const handleNextStage = () => {
    if (stage === 'team-details' && teamName) {
      setStage('team-members');
    } else if (stage === 'team-members') {
      setStage('confirmation');
    }
  };

  const handlePreviousStage = () => {
    if (stage === 'team-members') {
      setStage('team-details');
    } else if (stage === 'confirmation') {
      setStage('team-members');
    }
  };

  const handleCreateTeam = () => {
    const teamData: TeamData = {
      name: teamName,
      picture: teamPicture,
      members: teamMembers,
    };

    if (onSuccess) {
      onSuccess(teamData);
    }
    closeDialog();
  };

  // Render stage-specific content
  const renderTeamDetailsStage = () => (
    <div className="space-y-6 px-1 py-2">
      <div className="space-y-4">
        <div>
          <label htmlFor="team-name" className="mb-1.5 block text-sm font-medium">
            Team Name <span className="text-destructive">*</span>
          </label>
          <Input
            id="team-name"
            placeholder="Enter team name"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            required
            className="h-10 shadow-sm"
          />
        </div>

        <div className="bg-muted/30 border-border/60 mt-2 flex items-center gap-4 rounded-lg border p-4">
          <Avatar
            className={`size-14 border-2 ${teamPicture ? 'border-primary/20' : 'border-border border-dashed'}`}
            onClick={() => fileInputRef.current?.click()}
          >
            {teamPicture ? (
              <AvatarImage src={teamPicture} alt="Team picture" />
            ) : (
              <AvatarFallback className="bg-primary/10 text-primary">
                <ImageIcon className="size-6" />
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1">
            <p className="mb-1 text-sm font-medium">Team Logo</p>
            <p className="text-muted-foreground mb-2 text-xs">
              Upload a logo to represent your team
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 text-xs"
            >
              <UploadIcon className="mr-1 size-3" />
              Choose image
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleTeamPictureUpload}
              accept="image/*"
              className="hidden"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderTeamMembersStage = () => (
    <div className="space-y-5 px-1 py-2">
      <div className="space-y-1">
        <label className="block text-sm font-medium">Invite team members</label>
        <p className="text-muted-foreground mb-2 text-xs">
          Add people to your team by email address
        </p>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            placeholder="colleague@example.com"
            value={newMemberEmail}
            onChange={handleEmailChange}
            onKeyDown={handleKeyDown}
            type="email"
            className={`h-10 shadow-sm ${emailError ? 'border-destructive' : ''}`}
            aria-invalid={!!emailError}
          />
          {emailError && <p className="text-destructive mt-1 text-xs">{emailError}</p>}
        </div>
        <Select
          value={newMemberRole}
          onValueChange={(value: string) => setNewMemberRole(value as TeamRole)}
        >
          <SelectTrigger className="h-10 w-28 shadow-sm">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="member">Member</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          onClick={addTeamMember}
          disabled={!newMemberEmail}
          className="h-10 px-3 shadow-sm"
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>

      {teamMembers.length > 0 ? (
        <TeamMemberList members={teamMembers} onRemove={removeTeamMember} />
      ) : (
        <div className="bg-muted/20 my-2 flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
          <UsersIcon className="text-primary/30 mb-2 size-8" strokeWidth={1.5} />
          <p className="text-muted-foreground text-sm font-medium">No team members yet</p>
          <p className="text-muted-foreground/70 mt-1 max-w-52 text-xs">
            Add team members by entering their email addresses
          </p>
        </div>
      )}
    </div>
  );

  const renderConfirmationStage = () => (
    <div className="space-y-6 px-1 py-2">
      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="p-5">
          <div className="flex items-center gap-4">
            <Avatar className="border-primary/20 size-16 border-2 shadow-sm">
              {teamPicture ? (
                <AvatarImage src={teamPicture} alt="Team picture" />
              ) : (
                <AvatarFallback className="bg-primary/10 text-primary">
                  {teamName ? teamName.substring(0, 2).toUpperCase() : 'TM'}
                </AvatarFallback>
              )}
            </Avatar>
            <div>
              <h3 className="text-lg font-semibold tracking-tight">{teamName}</h3>
              <p className="text-muted-foreground mt-0.5 text-sm">
                {teamMembers.length} {teamMembers.length === 1 ? 'member' : 'members'}
              </p>
            </div>
          </div>
        </div>

        {teamMembers.length > 0 && (
          <div className="border-t">
            <div className="bg-muted/30 px-5 py-3">
              <h4 className="text-sm font-medium">Team Members</h4>
            </div>
            <div className="divide-y">
              {teamMembers.map((member) => (
                <div key={member.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar className="border-border/50 size-6 border">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {getInitialsFromEmail(member.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate text-sm">{member.email}</span>
                  <Badge
                    variant={member.role === 'admin' ? 'default' : 'outline'}
                    className="h-5 px-1.5 text-xs"
                  >
                    {member.role === 'admin' && <ShieldIcon className="mr-1 size-2.5" />}
                    {member.role}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-primary/5 border-primary/20 flex items-center rounded-lg border p-4">
        <CheckCircleIcon className="text-primary mr-3 size-5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium">Ready to create your team</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            You're about to create <span className="font-medium">{teamName}</span> with{' '}
            {teamMembers.length} {teamMembers.length === 1 ? 'member' : 'members'}
          </p>
        </div>
      </div>
    </div>
  );

  // Render functions to improve readability
  const getStageTitle = () => {
    switch (stage) {
      case 'team-details':
        return 'Create a new team';
      case 'team-members':
        return 'Add team members';
      case 'confirmation':
        return 'Confirm team details';
    }
  };

  const getStageDescription = () => {
    switch (stage) {
      case 'team-details':
        return 'Add basic details for your new team';
      case 'team-members':
        return 'Invite people to collaborate with you';
      case 'confirmation':
        return 'Review your team before creating it';
    }
  };

  // Stage content selector
  const renderStageContent = () => {
    switch (stage) {
      case 'team-details':
        return renderTeamDetailsStage();
      case 'team-members':
        return renderTeamMembersStage();
      case 'confirmation':
        return renderConfirmationStage();
    }
  };

  return (
    <>
      <DialogHeader className="space-y-2 px-1">
        <DialogTitle className="text-xl font-semibold tracking-tight">
          {getStageTitle()}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground/80 text-sm">
          {getStageDescription()}
        </DialogDescription>
      </DialogHeader>

      <div className="px-1">
        <ProgressIndicator currentStage={stage} />
      </div>

      {renderStageContent()}

      <DialogFooter className="flex items-center pt-4 sm:justify-between">
        {stage !== 'team-details' ? (
          <Button
            variant="outline"
            type="button"
            onClick={handlePreviousStage}
            size="sm"
            className="h-9 px-3"
          >
            <ChevronLeftIcon className="mr-1.5 size-3.5" />
            Back
          </Button>
        ) : (
          <div></div>
        )}

        <div className="flex gap-2">
          {stage !== 'confirmation' ? (
            <Button
              type="button"
              onClick={handleNextStage}
              disabled={stage === 'team-details' && !teamName}
              size="sm"
              className="h-9 px-4"
            >
              Next
              <ChevronRightIcon className="ml-1.5 size-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleCreateTeam}
              size="sm"
              className="bg-primary h-9 px-4"
            >
              Create Team
            </Button>
          )}
        </div>
      </DialogFooter>
    </>
  );
}

// Trigger component that uses useDialog to open the dialog
export function CreateTeamDialogTrigger() {
  const { openDialog } = useDialog();

  const handleOpenDialog = () => {
    openDialog(CreateTeamDialogContent, {}, { maxWidth: '520px' });
  };

  return (
    <Button variant="default" onClick={handleOpenDialog}>
      <PlusIcon className="mr-1.5 size-4" />
      Create Team
    </Button>
  );
}

// For backwards compatibility
export function CreateTeamDialog() {
  const { openDialog } = useDialog();

  const handleOpenDialog = () => {
    openDialog(CreateTeamDialogContent, {}, { maxWidth: '520px' });
  };

  return (
    <Button variant="default" onClick={handleOpenDialog}>
      <PlusIcon className="mr-1.5 size-4" />
      Create Team
    </Button>
  );
}
