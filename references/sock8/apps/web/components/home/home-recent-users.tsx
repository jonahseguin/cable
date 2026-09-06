'use client';

import { Skeleton } from '@sock8/ui/components';
import Image from 'next/image';
import { useHomeWaitlist } from './home-waitlist-provider';
import { MotionDiv } from './motion-wrapper';

export function HomeRecentUsers({
  displayWaitlistCount,
  displayWaitlistRecentUsers,
}: {
  displayWaitlistCount: boolean;
  displayWaitlistRecentUsers: boolean;
}) {
  const { count, recentUsers, isLoadingData } = useHomeWaitlist();

  const displayUsersCount = 50;
  const itemsToRender: Array<{
    key: string;
    avatarUrl?: string; // Optional for skeletons
    altText?: string; // Optional for skeletons
    isSkeleton: boolean;
    index: number; // Original index for styling
  }> = [];

  if (isLoadingData) {
    // Phase 1: Initial loading, show skeletons
    for (let i = 0; i < displayUsersCount; i++) {
      itemsToRender.push({
        key: `skeleton-${i}`,
        isSkeleton: true,
        index: i,
      });
    }
  } else {
    // Phase 2: Data loaded (or failed but not loading anymore)
    if (recentUsers.length > 0) {
      // Got some actual users
      const actualUserItems = recentUsers.slice(0, displayUsersCount).map((user, index) => ({
        key: user.username || `recent-user-${index}`,
        avatarUrl: user.avatarUrl || `https://avatar.vercel.sh/user-fallback-${index + 200}.png`,
        altText: user.username || `Waitlist user ${index + 1}`,
        isSkeleton: false,
        index,
      }));
      itemsToRender.push(...actualUserItems);

      // If fewer than displayUsersCount actual users, fill with generic animated image placeholders
      const placeholdersNeeded = displayUsersCount - itemsToRender.length;
      for (let i = 0; i < placeholdersNeeded; i++) {
        const overallIndex = itemsToRender.length;
        itemsToRender.push({
          key: `generic-placeholder-${overallIndex}`,
          avatarUrl: `https://avatar.vercel.sh/user${overallIndex + 100}.png`,
          altText: `Waitlist user ${overallIndex + 1}`,
          isSkeleton: false,
          index: overallIndex,
        });
      }
    } else {
      // No recent users, and not loading, show 50 generic animated image placeholders
      for (let i = 0; i < displayUsersCount; i++) {
        itemsToRender.push({
          key: `full-placeholder-set-${i}`,
          avatarUrl: `https://avatar.vercel.sh/user${i + 100}.png`,
          altText: `Waitlist user ${i + 1}`,
          isSkeleton: false,
          index: i,
        });
      }
    }
  }

  return (
    <div className="mt-24">
      <div className="flex flex-col items-center">
        <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          <p
            className="text-muted-foreground mb-4 text-center text-sm"
            style={{ minHeight: '20px' }}
          >
            {!isLoadingData && displayWaitlistCount ? (
              <>
                <span className="text-foreground font-mono font-bold">
                  {count > 0 ? count : '0'}
                </span>{' '}
                developers have already joined the waitlist
              </>
            ) : (
              <span>&nbsp;</span>
            )}
          </p>
        </MotionDiv>
        {/* Avatar container is always rendered */}
        {displayWaitlistRecentUsers && (
          <div className="flex justify-center">
            <div
              className="relative mx-auto flex flex-wrap justify-center"
              style={{ maxWidth: '420px' }} // This div's height is determined by its content
            >
              {itemsToRender.map((item) => {
                const itemStyle = {
                  zIndex: displayUsersCount - item.index,
                  marginTop: item.index % 10 > 4 ? '-4px' : '0px',
                };
                if (item.isSkeleton) {
                  return (
                    <Skeleton
                      key={item.key}
                      className="border-background relative -ml-2 h-8 w-8 rounded-full border-2 bg-neutral-800 first:ml-0"
                      style={itemStyle}
                    />
                  );
                } else {
                  return (
                    <MotionDiv
                      key={item.key}
                      className="relative -ml-2 first:ml-0"
                      style={itemStyle}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, delay: item.index * 0.02, ease: 'easeOut' }}
                      whileHover={{ scale: 1.1, zIndex: 99, transition: { duration: 0.2 } }}
                    >
                      <Image
                        src={item.avatarUrl!}
                        alt={item.altText!}
                        width={32}
                        height={32}
                        className="border-background bg-border h-8 w-8 rounded-full border-2 object-cover"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.onerror = null;
                          target.src = `https://avatar.vercel.sh/fallback-${item.index}.png`;
                        }}
                      />
                    </MotionDiv>
                  );
                }
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
