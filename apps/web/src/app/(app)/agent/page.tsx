'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, Sheet, Sparkles, Store, UserRound } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/misc';
import { SkillsTab } from '@/components/agent/skills-tab';
import { SkillStoreTab } from '@/components/agent/skill-store-tab';
import { ApiKeysTab } from '@/components/agent/api-keys-tab';
import { PersonalityTab } from '@/components/agent/personality-tab';
import { SheetsTab } from '@/components/agent/sheets-tab';
import { DocsSection } from '@/components/agent/docs-section';

const TABS = ['skills', 'store', 'sheets', 'keys', 'personality'] as const;

function AgentConfig() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? params.get('tab')! : 'skills';

  return (
    <Tabs value={tab} onValueChange={(v) => router.replace(`/agent?tab=${v}`, { scroll: false })}>
      <TabsList>
        <TabsTrigger value="skills">
          <Sparkles /> Skills
        </TabsTrigger>
        <TabsTrigger value="store">
          <Store /> Skill Store
        </TabsTrigger>
        <TabsTrigger value="sheets">
          <Sheet /> Sheets & Docs
        </TabsTrigger>
        <TabsTrigger value="keys">
          <KeyRound /> API Keys
        </TabsTrigger>
        <TabsTrigger value="personality">
          <UserRound /> Personality
        </TabsTrigger>
      </TabsList>
      <TabsContent value="skills">
        <SkillsTab />
      </TabsContent>
      <TabsContent value="store">
        <SkillStoreTab />
      </TabsContent>
      <TabsContent value="sheets">
        <SheetsTab />
        <DocsSection />
      </TabsContent>
      <TabsContent value="keys">
        <ApiKeysTab />
      </TabsContent>
      <TabsContent value="personality">
        <PersonalityTab />
      </TabsContent>
    </Tabs>
  );
}

export default function AgentPage() {
  return (
    <div>
      <PageHeader title="Agent Config" description="Skills, AI model and personality for your agent." />
      <Suspense>
        <AgentConfig />
      </Suspense>
    </div>
  );
}
