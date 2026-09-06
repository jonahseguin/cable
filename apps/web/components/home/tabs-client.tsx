'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@sock8/ui/components/tabs';
import { motion } from 'framer-motion';
import { useState } from 'react';

interface TabsClientProps {
  schemaContent: React.ReactNode;
  clientContent: React.ReactNode;
  typeErrorContent: React.ReactNode;
}

export function TabsClient({ schemaContent, clientContent, typeErrorContent }: TabsClientProps) {
  const [activeTab, setActiveTab] = useState('schema');

  return (
    <div className="mt-8 lg:mt-0">
      <motion.div
        className="bg-card/80 relative overflow-hidden rounded-lg border shadow-xl backdrop-blur-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.8 }}
      >
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <div className="bg-destructive h-3 w-3 rounded-full"></div>
          <div className="bg-warning h-3 w-3 rounded-full"></div>
          <div className="bg-success h-3 w-3 rounded-full"></div>
          <span className="text-foreground/50 ml-2 font-mono text-sm">
            {activeTab === 'schema' ? 'schema' : 'client'}.ts
          </span>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-card/50 h-10 w-full rounded-none border-b p-1">
            <TabsTrigger
              value="schema"
              className="dark:data-[state=active]:bg-primary/10 dark:data-[state=active]:text-primary flex-1 rounded-md font-mono data-[state=active]:shadow-none"
            >
              Schema
            </TabsTrigger>
            <TabsTrigger
              value="client"
              className="flex-1 rounded-md font-mono data-[state=active]:shadow-none dark:data-[state=active]:bg-blue-500/10 dark:data-[state=active]:text-blue-500"
            >
              Client
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="schema"
            className="data-[state=active]:animate-in data-[state=active]:fade-in p-5"
          >
            {schemaContent}
          </TabsContent>
          <TabsContent
            value="client"
            className="data-[state=active]:animate-in data-[state=active]:fade-in p-5"
          >
            {clientContent}
          </TabsContent>
        </Tabs>
      </motion.div>

      <motion.div
        className="bg-card/80 border-primary/20 mt-4 overflow-hidden rounded-lg border shadow-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.8 }}
      >
        <div className="bg-primary/5 border-primary/10 border-b px-4 py-2">
          <p className="text-sm font-medium">TypeScript catches errors at compile time</p>
        </div>
        <div className="bg-secondary/30 p-4 font-mono text-sm">{typeErrorContent}</div>
      </motion.div>
    </div>
  );
}
