'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { useChannel, useHistory, usePresence } from '@[removed]/next/client';
import { channels } from '@/lib/channels';
import { Button } from '@[removed]/ui/components/button';
import { Input } from '@[removed]/ui/components/input';
import { ScrollArea } from '@[removed]/ui/components/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@[removed]/ui/components/avatar';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@[removed]/ui/components/card';
import { authClient } from '@[removed]/auth/client';
import { ConnectionState } from '@[removed]/sdk/client';
import { cn } from '@[removed]/ui/lib/utils';
import { throttle } from 'lodash-es';
import { motion, AnimatePresence } from 'framer-motion';
import { MousePointer2, Clock } from 'lucide-react';
import { sendMessageServerAction } from './chat-actions';
import { Skeleton } from '@[removed]/ui/components/skeleton';
// Infer PresenceData type from the hook's return value
// Note: We might need to adjust this slightly if the hook return type changes
type PresenceDataBase = Exclude<
  NonNullable<ReturnType<typeof usePresence>['self']>['data'],
  null | undefined
>;
type PresenceData = Partial<PresenceDataBase>;

// Type helper for OtherPresence elements (for mapping)
// Infer it from the hook's return type
type OtherPresenceElement = ReturnType<typeof usePresence>['others'][number];

export function ChatComponent() {
  const { data: session } = authClient.useSession();
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentUser = useMemo(
    () =>
      session?.user
        ? {
            name: session.user.name || 'Anonymous',
            avatar: session.user.image || `https://avatar.vercel.sh/${session.user.id}.png`,
            id: session.user.id,
          }
        : null,
    [session],
  );

  const { history, isLoading: isHistoryLoading } = useHistory(channels.chat.global.msgs);

  // Subscribe to channel messages
  const {
    data: channelMessages,
    optimistic: optimisticMessages,
    isLoading,
  } = useChannel(channels.chat.global.msgs);

  // Get snapshot values and update function directly from the hook
  const {
    self,
    others,
    connectionState,
    update: updatePresence,
  } = usePresence(channels.chat.global.msgs);

  // merge history with channelMessages
  const messages = useMemo(() => {
    return [...history.map((h) => h.data).reverse(), ...channelMessages] as typeof channelMessages;
  }, [history, channelMessages]);

  // --- Presence Handling ---

  // Throttle presence updates
  const throttledUpdatePresence = useMemo(
    () =>
      throttle((data: PresenceData) => {
        if (data && connectionState === ConnectionState.CONNECTED) {
          // PresenceData is already Partial<...>, so it might or might not contain identity/color
          // We still want to ensure client doesn't *set* identity/color
          const { identity, color, ...updateData } = data as any; // Cast to handle potential keys
          if (Object.keys(updateData).length > 0) {
            // Only send if there's something left
            updatePresence(updateData);
          }
        }
      }, 50),
    [updatePresence, connectionState],
  );

  // Effect to set initial presence
  useEffect(() => {
    if (currentUser && connectionState === ConnectionState.CONNECTED) {
      // Type the data we intend to send - must match the input type of updatePresence
      // which expects Partial of the base presence schema.
      const currentPresenceData: PresenceData = {
        online: true,
        name: currentUser.name,
        avatar: currentUser.avatar,
        typing: self?.data?.typing ?? false,
        cursor: self?.data?.cursor ?? undefined,
      };

      // Check against snapshot `self`
      if (
        !self ||
        self.data?.name !== currentPresenceData.name ||
        self.data?.avatar !== currentPresenceData.avatar ||
        self.data?.online !== currentPresenceData.online
      ) {
        // We can directly pass currentPresenceData as it matches PresenceData (Partial<...>)
        updatePresence(currentPresenceData);
      }
    }
    return () => {
      throttledUpdatePresence.cancel();
    };
  }, [currentUser, connectionState, self, updatePresence, throttledUpdatePresence]);

  // Track mouse movement globally
  useEffect(() => {
    // Only track if connected
    if (connectionState !== ConnectionState.CONNECTED) return;

    const handleMouseMove = (event: MouseEvent) => {
      const x = event.clientX;
      const y = event.clientY;
      throttledUpdatePresence({ cursor: { x, y } });
    };

    window.addEventListener('mousemove', handleMouseMove);

    const wasConnected = connectionState === ConnectionState.CONNECTED;

    // Cleanup function
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      throttledUpdatePresence.cancel();

      // If the component is unmounting WHILE it was connected,
      // update presence to indicate offline status and remove cursor.
      if (wasConnected) {
        // Use direct updatePresence for this final update, not throttled
        // Assign `undefined` to cursor to clear it, matching the type.
        updatePresence({ online: false, cursor: undefined });
      }
    };
    // Re-run this effect if the connection state changes
  }, [connectionState, throttledUpdatePresence, updatePresence]);

  // Update typing status and notify presence
  const handleTyping = useCallback(
    (typing: boolean) => {
      if (isTyping !== typing && currentUser && connectionState === ConnectionState.CONNECTED) {
        setIsTyping(typing);
        // Send only the typing update
        updatePresence({ typing });
      }
    },
    [isTyping, updatePresence, currentUser, connectionState],
  );

  // --- Message Handling --- (remains largely the same)

  // Scroll to bottom when new messages arrive using useLayoutEffect
  useLayoutEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      // No timeout needed with useLayoutEffect
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages]); // Depend on the merged messages array

  // Send message handler
  const sendMessage = async () => {
    if (newMessage.trim() && currentUser) {
      // Clear input and reset typing state immediately
      const messageToSend = newMessage; // Store message before clearing
      setNewMessage('');
      handleTyping(false);
      inputRef.current?.focus(); // Focus might be better after send, but can stay for now

      // Optimistic update (if you uncomment later)
      // optimisticMessages.add({ ...messageData, message: messageToSend, timestamp: new Date() });

      // Send the message asynchronously
      try {
        await sendMessageServerAction({
          message: messageToSend,
          timestamp: Date.now(),
          sender: currentUser.name,
          senderId: currentUser.id,
        });
      } catch (error) {
        console.error('Failed to send message:', error);
        // Optionally: Reinstate the message in the input on failure?
        // setNewMessage(messageToSend);
        // Or show an error notification
      }
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(event.target.value);
    handleTyping(event.target.value.length > 0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  // --- Rendering Logic --- (minor adjustments)

  // Memoized map for avatar lookup (optional, but can be kept)
  const allMembers = useMemo(() => {
    const membersMap = new Map<string, { avatar?: string; name?: string }>();
    if (self?.data?.name) {
      membersMap.set(self.data.name, { avatar: self.data.avatar, name: self.data.name });
    }
    others.forEach((member) => {
      if (member.data?.name) {
        membersMap.set(member.data.name, { avatar: member.data.avatar, name: member.data.name });
      }
    });
    return membersMap;
  }, [self, others]); // Depends directly on the snapshots

  // Derive typing users directly from `others` snapshot
  const typingUsers = useMemo(
    () => {
      return others.filter((member: OtherPresenceElement) => member.data?.typing);
    },
    [others], // Depends directly on the `others` snapshot
  );

  // Loading/Connecting State
  if (false) {
    const status = isLoading ? 'Connecting to channel...' : `Connection: ${connectionState}`;
    return (
      <div className="bg-card text-muted-foreground flex h-96 w-full items-center justify-center rounded-lg border p-6">
        {status}
      </div>
    );
  }

  // Session Loading State
  if (!currentUser) {
    return (
      <div className="bg-card text-muted-foreground flex h-96 w-full items-center justify-center rounded-lg border p-6">
        Loading session...
      </div>
    );
  }

  // Use `others.length` directly instead of `onlineUsers.length`
  const onlineCount = others.length + (self ? 1 : 0);

  return (
    <div className="bg-card flex h-[calc(100vh-10rem)] w-full flex-col rounded-lg border shadow-sm">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold leading-none tracking-tight">Chat</h3>
          <div className="flex items-center space-x-3">
            <span className="text-muted-foreground text-sm">{onlineCount} online</span>
            <div className="flex -space-x-2 overflow-hidden">
              {/* Self Avatar */}
              {self?.data?.avatar && (
                <Avatar
                  key="self"
                  className="border-background ring-primary h-6 w-6 rounded-full border-2 ring-1"
                >
                  <AvatarImage src={self.data.avatar} alt={self.data.name} />
                  <AvatarFallback>{self.data.name?.[0]}</AvatarFallback>
                </Avatar>
              )}
              {/* Others Avatars - Use `others` directly */}
              {others.slice(0, 4).map(
                (member: OtherPresenceElement) =>
                  member.data && (
                    <Avatar
                      key={member.identity} // Use identity as key
                      className="border-background h-6 w-6 rounded-full border-2"
                    >
                      <AvatarImage src={member.data.avatar} alt={member.data.name} />
                      <AvatarFallback>{member.data.name?.[0]}</AvatarFallback>
                    </Avatar>
                  ),
              )}
              {/* More users indicator - Use `others.length` */}
              {others.length > 4 && (
                <Avatar className="border-background bg-muted h-6 w-6 rounded-full border-2">
                  <AvatarFallback className="text-xs">+{others.length - 4}</AvatarFallback>
                </Avatar>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="relative h-full flex-1 overflow-hidden">
        <ScrollArea className="absolute inset-0 h-full scroll-smooth" ref={scrollAreaRef}>
          <div className="relative h-full p-4" ref={chatAreaRef}>
            <div className="mb-4">
              {/* Loading state for history */}
              {false ? (
                <div className="space-y-4 p-4">
                  {/* Increase count and refine structure */}
                  {[...Array(10)].map((_, i) => {
                    const isSelf = i % 2 !== 0;
                    return (
                      <div
                        key={i}
                        className={cn(
                          'group flex items-end gap-2', // Use items-end like actual messages
                          isSelf ? 'justify-end' : 'justify-start',
                        )}
                      >
                        {!isSelf && <Skeleton className="h-8 w-8 flex-shrink-0 rounded-full" />}
                        {/* Single skeleton mimicking the message bubble */}
                        <Skeleton
                          className={cn(
                            'h-16 w-48 max-w-[70%] rounded-lg',
                            // Optional: Slightly different widths for variety?
                            // i % 3 === 0 ? 'w-40' : i % 3 === 1 ? 'w-56' : 'w-48'
                          )}
                        />
                        {isSelf && <Skeleton className="h-8 w-8 flex-shrink-0 rounded-full" />}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <motion.div // Wrap message list in motion.div
                  className="space-y-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }} // Add fade-in transition
                >
                  {/* Message rendering logic */}
                  {messages.map((msg, index) => {
                    const memberData = allMembers.get(msg.sender);
                    const avatarSrc = memberData?.avatar;
                    const fallback = msg.sender?.[0] || '?';
                    const isSelf = msg.senderId === currentUser.id;

                    return (
                      <div
                        key={msg.timestamp.getTime() ?? index} // Use timestamp if available (from server or optimistic)
                        className={cn(
                          'group flex items-end gap-2',
                          isSelf ? 'justify-end' : 'justify-start',
                        )}
                      >
                        {!isSelf && (
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={avatarSrc} />
                            <AvatarFallback>{fallback}</AvatarFallback>
                          </Avatar>
                        )}

                        {isSelf && msg.isOptimistic && (
                          <div className="text-muted-foreground flex h-5 items-center self-end pb-1">
                            <Clock className="h-3 w-3" />
                          </div>
                        )}

                        <div
                          className={cn(
                            'max-w-[70%] rounded-lg px-3 py-2 text-sm',
                            isSelf ? 'bg-primary text-primary-foreground' : 'bg-muted',
                            msg.isOptimistic ? 'opacity-60' : '',
                          )}
                        >
                          {!isSelf && <p className="mb-0.5 text-xs font-medium">{msg.sender}</p>}
                          <p className="whitespace-pre-wrap">{msg.message}</p>
                          <p
                            className={cn(
                              'mt-1 flex items-center gap-1 text-xs',
                              isSelf ? 'text-primary-foreground/80' : 'text-muted-foreground',
                            )}
                          >
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>

                        {!isSelf && msg.isOptimistic && (
                          <div className="text-muted-foreground flex h-5 items-center self-end pb-1">
                            <Clock className="h-3 w-3" />
                          </div>
                        )}

                        {isSelf && (
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={avatarSrc} />
                            <AvatarFallback>{fallback}</AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </div>
          </div>
        </ScrollArea>
        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <div className="text-muted-foreground bg-background/80 absolute bottom-1 left-4 right-4 rounded px-2 py-1 text-sm italic backdrop-blur-sm">
            {typingUsers.map((m: OtherPresenceElement) => m.data?.name || 'Someone').join(', ')}{' '}
            {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t p-4">
        <div className="relative">
          <Input
            ref={inputRef}
            type="text"
            placeholder="Type your message..."
            value={newMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="pr-20"
            disabled={false}
          />
          <Button
            type="submit"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 transform"
            onClick={sendMessage}
            disabled={!newMessage.trim()}
          >
            Send
          </Button>
        </div>
      </div>

      {/* Global Cursors Container - Render directly from `others` */}
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        <AnimatePresence>
          {/* Map over `others` snapshot */}
          {others
            .filter(
              (member: OtherPresenceElement) =>
                member.data?.cursor?.x != null && member.data.cursor.y != null,
            )
            .map((member: OtherPresenceElement) => {
              return (
                <motion.div
                  key={member.identity} // Use identity as key
                  className="text-primary pointer-events-none absolute left-0 top-0"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{
                    // Ensure access triggers snapshot subscription
                    x: member.data.cursor.x,
                    y: member.data.cursor.y,
                    opacity: 1,
                    scale: 1,
                  }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.1, ease: 'linear' }} // Faster transition
                  style={{ zIndex: 9999 }}
                >
                  <MousePointer2 className="h-4 w-4" fill="currentColor" />
                  <span className="bg-primary text-primary-foreground ml-1 whitespace-nowrap rounded px-1.5 py-0.5 text-xs shadow-md">
                    {member.data.name || '...'} {/* Display name from presence */}
                  </span>
                </motion.div>
              );
            })}
        </AnimatePresence>
      </div>
    </div>
  );
}
