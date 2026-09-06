'use client';
import { authClient } from '@sock8/auth/client';
import { Button, Skeleton } from '@sock8/ui/components';
import { Avatar, AvatarFallback, AvatarImage } from '@sock8/ui/components/avatar';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@sock8/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sock8/ui/components/dialog';
import { Input } from '@sock8/ui/components/input';
import { Label } from '@sock8/ui/components/label';
import { ChangeEvent, useEffect, useState } from 'react';

export default function SettingsGeneralPage() {
  return (
    <div className="flex flex-col gap-6">
      <TeamSettingsHeader />
      <TeamName />
      <TeamAvatar />
      <DeleteTeam />
    </div>
  );
}

function TeamSettingsHeader() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Settings</CardTitle>
        <CardDescription className="inline-flex items-center">
          General settings for{' '}
          {activeOrg?.name ? (
            <span className="text-primary ml-1 font-medium">{activeOrg.name}</span>
          ) : (
            <Skeleton className="mx-2 h-4 w-32" />
          )}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function TeamName() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const [teamName, setTeamName] = useState('');
  const [isChanged, setIsChanged] = useState(false);

  useEffect(() => {
    if (activeOrg?.name) {
      setTeamName(activeOrg.name);
    }
  }, [activeOrg?.name]);

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setTeamName(newValue);
    setIsChanged(newValue !== activeOrg?.name);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Name</CardTitle>
        <CardDescription>
          Change your team&apos;s name. This will be displayed throughout the application.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="teamName">Name</Label>
            {activeOrg ? (
              <Input
                id="teamName"
                placeholder="Enter team name"
                value={teamName}
                onChange={handleNameChange}
              />
            ) : (
              <Skeleton className="h-9 w-full" />
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex w-full justify-end">
        <Button variant="default" disabled={!activeOrg || !isChanged}>
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}

function TeamAvatar() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file) {
        setSelectedFile(file);
      }
    } else {
      setSelectedFile(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Avatar</CardTitle>
        <CardDescription>
          Upload a new avatar for your team. This will be displayed throughout the application.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <div className="flex-shrink-0">
            {activeOrg ? (
              <Avatar className="h-24 w-24">
                <AvatarImage src={activeOrg.logo || undefined} alt={activeOrg.name || ''} />
                <AvatarFallback className="text-lg">
                  {activeOrg.name?.substring(0, 2).toUpperCase() || 'T'}
                </AvatarFallback>
              </Avatar>
            ) : (
              <Skeleton className="h-24 w-24 rounded-full" />
            )}
          </div>
          <div className="flex-grow space-y-4">
            <div className="space-y-2">
              <Label htmlFor="avatar">Upload New Avatar</Label>
              <Input
                id="avatar"
                type="file"
                accept="image/*"
                disabled={!activeOrg}
                onChange={handleFileChange}
              />
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex w-full justify-end">
        <Button variant="default" disabled={!activeOrg || !selectedFile}>
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}

function DeleteTeam() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const [confirmText, setConfirmText] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const onOpenChange = (open: boolean) => {
    setIsOpen(open);
    setConfirmText('');
  };

  return (
    <Card className="border-destructive/50 pb-0">
      <CardHeader>
        <CardTitle className="text-destructive">Delete Team</CardTitle>
        <CardDescription>
          Permanently delete your team and all associated data. This action cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          Deleting your team will remove all users, projects, and data associated with this team.
          This action is permanent and cannot be reversed.
        </p>
      </CardContent>
      <CardFooter className="border-destructive/20 bg-destructive/5 flex w-full justify-end border-t p-6">
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
          <DialogTrigger asChild>
            <Button variant="destructive" disabled={!activeOrg}>
              Delete Team
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Team</DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will permanently delete your team and remove all
                associated data from our servers.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  To confirm, type &quot;
                  <span className="text-primary font-semibold">{activeOrg?.name}</span>&quot; below:
                </p>
                <Input
                  value={confirmText}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmText(e.target.value)}
                  placeholder="Enter team name to confirm"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={!activeOrg || confirmText !== activeOrg.name}>
                Confirm Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}
