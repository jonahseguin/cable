'use client';

import { Button } from '@sock8/ui/components/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@sock8/ui/components/tabs';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

export function CodeBlock() {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('server');

  const serverCode = `// server.ts
import { createServer } from '@sock8/server';
import { z } from 'zod';

const messageSchema = z.object({
  text: z.string(),
  userId: z.string()
});

const server = createServer({
  events: {
    'message': {
      schema: messageSchema,
      handler: async (data) => {
        console.log(\`Message from \${data.userId}: \${data.text}\`);
        return { status: 'delivered', timestamp: new Date() };
      }
    }
  }
});

export type ServerType = typeof server;`;

  const clientCode = `// client.ts
import { createClient } from '@sock8/client';
import type { ServerType } from './server';

const client = createClient<ServerType>({
  projectId: 'your-project-id',
  token: await getAuthToken() // Get from your auth system
});

// Type-safe real-time communication
const response = await client.emit('message', { 
  text: 'Hello, sock8!',
  userId: 'user-123'
});

// TypeScript knows the response type!
console.log(response.status); // 'delivered'
console.log(response.timestamp); // Date object`;

  const hookCode = `// In your React component
import { useSocket } from '@sock8/react';
import type { ServerType } from './server';

function ChatComponent() {
  const socket = useSocket<ServerType>();
  const [messages, setMessages] = useState([]);
  
  // Listen for messages (fully typed!)
  useEffect(() => {
    const unsubscribe = socket.on('message', (data) => {
      setMessages(prev => [...prev, data]);
    });
    
    return unsubscribe;
  }, [socket]);
  
  // Send a message (with type validation)
  const sendMessage = async (text) => {
    const response = await socket.emit('message', {
      text,
      userId: currentUser.id
    });
    
    // response is fully typed!
  };
  
  return (/* your component JSX */);
}`;

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-phthalo-green/30 w-full overflow-hidden rounded-xl border bg-black/80 backdrop-blur-sm">
      <div className="bg-phthalo-green/10 border-phthalo-green/30 flex items-center justify-between border-b px-4 py-2">
        <div className="flex space-x-2">
          <div className="h-3 w-3 rounded-full bg-red-500/70"></div>
          <div className="h-3 w-3 rounded-full bg-yellow-500/70"></div>
          <div className="h-3 w-3 rounded-full bg-green-500/70"></div>
        </div>
        <div className="text-phthalo-green/80 font-mono text-xs">sock8-example.ts</div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-gray-400 hover:text-white"
          onClick={() =>
            handleCopy(
              activeTab === 'server' ? serverCode : activeTab === 'client' ? clientCode : hookCode,
            )
          }
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </Button>
      </div>

      <Tabs defaultValue="server" className="w-full" onValueChange={setActiveTab}>
        <div className="bg-black/50 px-4 pt-2">
          <TabsList className="bg-black/50">
            <TabsTrigger value="server" className="font-mono text-xs">
              server.ts
            </TabsTrigger>
            <TabsTrigger value="client" className="font-mono text-xs">
              client.ts
            </TabsTrigger>
            <TabsTrigger value="hook" className="font-mono text-xs">
              react-hook.tsx
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="server" className="mt-0">
          <pre className="text-phthalo-green overflow-auto p-4 font-mono text-sm">
            <code>{serverCode}</code>
          </pre>
        </TabsContent>

        <TabsContent value="client" className="mt-0">
          <pre className="text-phthalo-green overflow-auto p-4 font-mono text-sm">
            <code>{clientCode}</code>
          </pre>
        </TabsContent>

        <TabsContent value="hook" className="mt-0">
          <pre className="text-phthalo-green overflow-auto p-4 font-mono text-sm">
            <code>{hookCode}</code>
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}
