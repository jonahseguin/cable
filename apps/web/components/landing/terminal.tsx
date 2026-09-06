'use client';

import { useEffect, useRef, useState } from 'react';

export function Terminal() {
  const [text, setText] = useState('');
  const [cursorVisible, setCursorVisible] = useState(true);
  const fullText = `
> npm install @[removed]/client @[removed]/server

// server.ts
import { createServer } from '@[removed]/server';

const server = createServer({
  events: {
    'message': (data: { text: string }) => {
      console.log('Received:', data.text);
      return { status: 'delivered' };
    }
  }
});

// client.ts
import { createClient } from '@[removed]/client';

const client = createClient<typeof server>();

// Type-safe real-time communication
const response = await client.emit('message', { 
  text: 'Hello, [removed]!' 
});
// response.status: 'delivered'
`;

  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Animate cursor blinking
    const cursorInterval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 500);

    // Animate typing
    let currentIndex = 0;
    const typingInterval = setInterval(() => {
      if (currentIndex < fullText.length) {
        setText(fullText.substring(0, currentIndex + 1));
        currentIndex++;

        // Auto-scroll to bottom
        if (terminalRef.current) {
          terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
      } else {
        clearInterval(typingInterval);

        // Restart animation after a pause
        setTimeout(() => {
          setText('');
          currentIndex = 0;

          // Start typing again
          const restartTyping = setInterval(() => {
            if (currentIndex < fullText.length) {
              setText(fullText.substring(0, currentIndex + 1));
              currentIndex++;

              if (terminalRef.current) {
                terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
              }
            } else {
              clearInterval(restartTyping);
            }
          }, 30);
        }, 3000);
      }
    }, 30);

    return () => {
      clearInterval(cursorInterval);
      clearInterval(typingInterval);
    };
  }, []);

  return (
    <div className="border-phthalo-green/50 w-full overflow-hidden rounded-md border bg-black/80 backdrop-blur-sm">
      <div className="bg-phthalo-green/20 border-phthalo-green/50 flex items-center border-b px-4 py-2">
        <div className="flex space-x-2">
          <div className="h-3 w-3 rounded-full bg-red-500/70"></div>
          <div className="h-3 w-3 rounded-full bg-yellow-500/70"></div>
          <div className="h-3 w-3 rounded-full bg-green-500/70"></div>
        </div>
        <div className="text-phthalo-green/80 mx-auto font-mono text-xs">[removed]-terminal</div>
      </div>
      <div
        ref={terminalRef}
        className="text-phthalo-green h-64 overflow-auto p-4 font-mono text-sm"
      >
        {text}
        {cursorVisible && (
          <span className="bg-phthalo-green/80 ml-1 inline-block h-4 w-2 animate-pulse"></span>
        )}
      </div>
    </div>
  );
}
