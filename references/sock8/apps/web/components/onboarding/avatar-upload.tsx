'use client';

import { useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@sock8/ui/components/avatar';
import { Button } from '@sock8/ui/components/button';
import { UploadIcon, UserIcon, ImageIcon } from 'lucide-react';

interface AvatarUploadProps {
  /**
   * Current image URL
   */
  imageUrl: string | null;

  /**
   * Callback when image is selected
   */
  onImageChange: (imageUrl: string) => void;

  /**
   * Size of the avatar (default: 'md')
   */
  size?: 'sm' | 'md' | 'lg';

  /**
   * Type of avatar ('profile' or 'team')
   */
  type?: 'profile' | 'team';

  /**
   * Optional label for the button
   */
  buttonLabel?: string;
}

/**
 * Reusable avatar upload component
 */
export function AvatarUpload({
  imageUrl,
  onImageChange,
  size = 'md',
  type = 'profile',
  buttonLabel,
}: AvatarUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Map size to pixel values
  const sizeMap = {
    sm: 'size-14',
    md: 'size-16',
    lg: 'size-32',
  };

  // Map size to icon sizes
  const iconSizeMap = {
    sm: 'size-5',
    md: 'size-8',
    lg: 'size-14',
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const fileUrl = URL.createObjectURL(file);
      onImageChange(fileUrl);
    }
  };

  return (
    <div className={`flex ${size === 'lg' ? 'flex-col' : 'items-center gap-4'}`}>
      <Avatar
        className={`${sizeMap[size]} cursor-pointer border-2 ${
          imageUrl ? 'border-primary/20' : 'border-border'
        } ${type === 'team' && !imageUrl ? 'border-dashed' : ''}`}
        onClick={() => fileInputRef.current?.click()}
      >
        {imageUrl ? (
          <AvatarImage src={imageUrl} alt={`${type === 'profile' ? 'Profile' : 'Team'} picture`} />
        ) : (
          <AvatarFallback className={'bg-primary/10 text-primary'}>
            {type === 'profile' ? (
              <UserIcon className={iconSizeMap[size]} />
            ) : (
              <ImageIcon className={iconSizeMap[size]} />
            )}
          </AvatarFallback>
        )}
      </Avatar>

      {size !== 'sm' && (
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">
            {type === 'profile' ? 'Profile Photo' : 'Team Logo'}
          </p>
          <p className="text-muted-foreground mb-2 text-xs">
            {type === 'profile'
              ? 'Upload a profile picture to personalize your account'
              : 'Upload a logo to represent your team'}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 text-xs"
          >
            <UploadIcon className="mr-1 size-3" />
            {buttonLabel || (type === 'profile' ? 'Upload image' : 'Choose image')}
          </Button>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        className="hidden"
        aria-label={`Upload ${type === 'profile' ? 'profile picture' : 'team logo'}`}
      />
    </div>
  );
}
