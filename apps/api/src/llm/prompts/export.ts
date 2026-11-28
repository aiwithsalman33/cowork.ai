/**
 * Writes plain-text copies of every prompt to src/llm/prompts/exported/<feature>.txt for evals and review.
 *   npm run prompts:export -w @cowork/api
 * {{placeholders}} mark what the app fills in at run time; {{input}} is the user turn.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as agent from './agent.js';
import * as boss from './boss.js';
import * as memory from './memory.js';
import * as skill from './skill-creator.js';

const USER = '\n\n--- user ---\n{{input}}\n';

export function exportedPrompts(): Record<string, string> {
  const system = agent
    .composeSystemPrompt({
      agent: {
        name: '{{agent_name}}',
        businessName: '{{business_name}}',
        tone: '{{tone}}',
        language: 'Auto-detect',
        greeting: '{{greeting}}',
        instructions: '{{owner_instructions}}',
        emojis: true,
        replyLength: 'short',
        businessDetails: '{{business_details}}',
        productsServices: '{{products_services}}',
        commonQuestions: '{{common_questions}}',
      },
      skills: [{ name: '{{skill_name}}', promptFragment: '{{skill_instructions}}' }],
      availableTools: ['{{tools}}'],
      channel: '{{channel}}',
    })
    .replace(/^Current date and time: .*$/m, 'Current date and time: {{now}}');
  return {
    agent: `# ${agent.PROMPT_VERSION}\n${system}\n\n--- user (optional, untrusted) ---\n${agent.untrusted('customer_memory', '{{customer_memory}}')}${USER}`,
    memory: `# ${memory.PROMPT_VERSION}\n${memory.MEMORY_SYSTEM}\n\n--- user ---\n${memory.memoryInput({ summary: '{{previous_summary}}', customer: '{{previous_customer}}', facts: '{{known_facts}}', transcript: '{{input}}' })}\n`,
    'skill-creator': `# ${skill.PROMPT_VERSION}\n${skill.SKILL_GENERATOR_PROMPT}${USER}`,
    boss: `# ${boss.PROMPT_VERSION}\n${boss.BOSS_ROUTER_PROMPT}${USER}`,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'exported');
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(exportedPrompts())) writeFileSync(join(dir, `${name}.txt`), text);
  process.stdout.write(`exported ${Object.keys(exportedPrompts()).length} prompts to ${dir}\n`);
}
