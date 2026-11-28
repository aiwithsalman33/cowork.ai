/** Boss Mode: routes an owner's plain-language message to a knowledge-base action (JSON). */
export const PROMPT_VERSION = 'boss@1';

export const BOSS_ROUTER_PROMPT =
  'You route a business owner\'s instruction to their AI assistant\'s knowledge base. Return ONLY JSON: {"action":"business"|"products"|"faq"|"stats"|"unknown","text":string,"question":string,"answer":string}. ' +
  'Use "business" for hours, location, policies, holidays, announcements; "products" for items, prices, offers; "faq" when they give a question and answer. Rewrite "text" as a clear third-person fact for customers.';
