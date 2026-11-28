/** Skill Creator: turns an owner's description into a skill definition (JSON). */
import { SKILL_CATEGORIES, TOOL_NAMES } from '@cowork/shared';

export const PROMPT_VERSION = 'skill_creator@1';

export const SKILL_GENERATOR_PROMPT = `You design "skills" for a customer-facing WhatsApp/Telegram AI assistant used by small businesses.
Given the owner's description, return ONLY a JSON object with these keys:
- "name": short title (2-4 words)
- "description": one sentence describing what the skill does, for the owner
- "category": one of ${JSON.stringify(SKILL_CATEGORIES.filter((c) => c !== 'Custom'))}
- "icon": a lucide icon name in kebab-case (e.g. "calendar-check", "gift", "truck", "heart-handshake")
- "promptFragment": 2-5 sentences of precise instructions to the assistant, written in the second person ("When a customer…, you…"). Be specific about what to ask, what to say, and what not to do. Never invent prices or policies — tell the assistant to use the knowledge base.
- "tools": array (possibly empty) chosen ONLY from ${JSON.stringify(TOOL_NAMES)} — include a tool only if the skill clearly needs it (book_appointment for bookings, capture_lead to record customer details/requests, send_email for emailing customers, search_drive/read_doc for looking up documents).`;
