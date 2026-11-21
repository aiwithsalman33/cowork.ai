import type { SkillCategory, ToolName } from '@partner/shared';

export interface CatalogSkill {
  slug: string;
  name: string;
  description: string;
  category: SkillCategory;
  icon: string;
  tools?: ToolName[];
  promptFragment: string;
}

/** Skills turned on for every new account. */
export const DEFAULT_SKILL_SLUGS = ['faq-bot', 'lead-capture', 'appointment-scheduler', 'smart-greeting', 'human-handoff'];

export const SKILL_CATALOG: CatalogSkill[] = [
  // ---------------- Customer Support ----------------
  {
    slug: 'faq-bot',
    name: 'FAQ Bot',
    description: 'Answers common questions using your knowledge base.',
    category: 'Customer Support',
    icon: 'help-circle',
    promptFragment:
      'Answer frequently asked questions using ONLY the facts in the knowledge base. If the answer is not there, say you will check with the team instead of guessing, and offer to take the customer\'s contact details.',
  },
  {
    slug: 'complaint-handler',
    name: 'Complaint Handler',
    description: 'De-escalates complaints with empathy and logs the issue.',
    category: 'Customer Support',
    icon: 'shield-alert',
    tools: ['capture_lead'],
    promptFragment:
      'When a customer complains: acknowledge the feeling first, apologise sincerely without blaming anyone, restate the problem to confirm you understood, then offer a concrete next step. Collect their name, phone and order/reference number and record it with capture_lead using interest "Complaint: <summary>". Never argue.',
  },
  {
    slug: 'order-tracker',
    name: 'Order Tracker',
    description: 'Helps customers check order status and delivery timelines.',
    category: 'Customer Support',
    icon: 'package-search',
    promptFragment:
      'When asked about an order, ask for the order number and the phone/email used. Share delivery timelines from the knowledge base. If you cannot see live order data, say so honestly and promise the team will follow up, then record the request with capture_lead.',
    tools: ['capture_lead'],
  },
  {
    slug: 'returns-refunds',
    name: 'Returns & Refunds',
    description: 'Explains the return policy and starts return requests.',
    category: 'Customer Support',
    icon: 'rotate-ccw',
    tools: ['capture_lead'],
    promptFragment:
      'Explain the return/refund policy exactly as written in the knowledge base (window, condition, refund method and timeline). To start a return, collect order number, item, reason and preferred resolution (refund/exchange), confirm the details back, and record them with capture_lead using interest "Return request".',
  },
  {
    slug: 'human-handoff',
    name: 'Human Handoff',
    description: 'Knows when to pass the conversation to a person.',
    category: 'Customer Support',
    icon: 'hand-helping',
    promptFragment:
      'If the customer asks for a human, is very upset, or the request needs a decision you cannot make (custom pricing, legal, medical, payments disputes), tell them a team member will reply soon and collect the best time and number to reach them.',
  },
  {
    slug: 'troubleshooting',
    name: 'Troubleshooting Guide',
    description: 'Walks customers through step-by-step fixes.',
    category: 'Customer Support',
    icon: 'wrench',
    promptFragment:
      'For product problems, troubleshoot one step at a time: ask one diagnostic question, give one clear instruction, then wait for the result before the next step. Use numbered steps. Escalate after three failed steps.',
  },
  {
    slug: 'warranty-support',
    name: 'Warranty Support',
    description: 'Checks warranty eligibility and registers claims.',
    category: 'Customer Support',
    icon: 'badge-check',
    tools: ['capture_lead'],
    promptFragment:
      'For warranty questions, ask for purchase date, product and invoice number. Explain coverage from the knowledge base. If eligible, register the claim with capture_lead using interest "Warranty claim".',
  },
  {
    slug: 'feedback-collector',
    name: 'Feedback Collector',
    description: 'Asks for ratings and reviews after a service.',
    category: 'Customer Support',
    icon: 'star',
    promptFragment:
      'When a conversation is resolved or a customer mentions a completed purchase/visit, politely ask for a 1–5 rating and one line of feedback. Thank them warmly. If the rating is 4 or 5, invite them to leave a public review if a review link exists in the knowledge base.',
  },
  // ---------------- Sales & Marketing ----------------
  {
    slug: 'lead-capture',
    name: 'Lead Capture',
    description: 'Collects name, phone and interest from potential customers.',
    category: 'Sales & Marketing',
    icon: 'user-plus',
    tools: ['capture_lead'],
    promptFragment:
      'When someone shows buying interest, naturally collect their name, phone (or email) and what they are interested in — one question at a time, never as a form. Once you have at least a name and a way to contact them, call capture_lead.',
  },
  {
    slug: 'product-recommender',
    name: 'Product Recommender',
    description: 'Suggests the right product based on needs and budget.',
    category: 'Sales & Marketing',
    icon: 'sparkles',
    promptFragment:
      'Recommend products/services from the catalogue in the knowledge base. Ask about need, budget and preferences first (max two questions), then suggest at most three options with one-line reasons and prices. Never invent products or prices.',
  },
  {
    slug: 'upsell-crosssell',
    name: 'Upsell & Cross-sell',
    description: 'Suggests relevant add-ons without being pushy.',
    category: 'Sales & Marketing',
    icon: 'trending-up',
    promptFragment:
      'After a customer decides on a product, suggest at most one relevant add-on or upgrade from the catalogue with a short benefit. If they decline, drop it.',
  },
  {
    slug: 'price-quote',
    name: 'Price Quotes',
    description: 'Gives accurate prices and simple quotes.',
    category: 'Sales & Marketing',
    icon: 'indian-rupee',
    promptFragment:
      'Quote prices exactly as listed in the knowledge base, in ₹ unless stated otherwise. For custom or bulk quotes, collect requirements and quantity and tell them the team will send a formal quote; record it with capture_lead.',
    tools: ['capture_lead'],
  },
  {
    slug: 'promotions',
    name: 'Offers & Promotions',
    description: 'Shares current offers and discount codes.',
    category: 'Sales & Marketing',
    icon: 'tag',
    promptFragment:
      'Mention current offers or discount codes from the knowledge base when relevant to what the customer wants. Always state validity and conditions. Never create discounts that are not listed.',
  },
  {
    slug: 'abandoned-interest',
    name: 'Follow-up Nudger',
    description: 'Gently re-engages customers who went quiet.',
    category: 'Sales & Marketing',
    icon: 'bell-ring',
    promptFragment:
      'If a returning customer previously asked about a product but did not buy (see customer memory), briefly reference it and ask if they would like help completing their decision.',
  },
  {
    slug: 'lead-qualifier',
    name: 'Lead Qualifier',
    description: 'Qualifies leads by budget, need and timeline.',
    category: 'Sales & Marketing',
    icon: 'filter',
    tools: ['capture_lead'],
    promptFragment:
      'For sales enquiries, learn Budget, Need and Timeline through natural conversation. Include these in the notes when calling capture_lead (e.g. "Budget ₹50k, needs 3 units, buying this month").',
  },
  {
    slug: 'catalog-browser',
    name: 'Catalogue Browser',
    description: 'Lets customers browse products by category.',
    category: 'Sales & Marketing',
    icon: 'layout-grid',
    promptFragment:
      'If asked what you sell, list product categories from the knowledge base first, then show items in the chosen category with prices. Keep lists short (max 6 items per message).',
  },
  // ---------------- Scheduling ----------------
  {
    slug: 'appointment-scheduler',
    name: 'Appointment Scheduler',
    description: 'Books appointments and adds them to your calendar.',
    category: 'Scheduling',
    icon: 'calendar-check',
    tools: ['book_appointment'],
    promptFragment:
      'To book an appointment, collect: service, preferred date and time, customer name and phone. Respect business hours from the knowledge base. Confirm all details back to the customer, then call book_appointment with an ISO 8601 start time. Share the confirmation.',
  },
  {
    slug: 'reschedule-cancel',
    name: 'Reschedule & Cancel',
    description: 'Handles appointment changes politely.',
    category: 'Scheduling',
    icon: 'calendar-x',
    tools: ['book_appointment', 'capture_lead'],
    promptFragment:
      'If a customer wants to reschedule, book the new slot with book_appointment and note the old one in notes ("Rescheduled from …"). For cancellations, confirm, apologise for any inconvenience and record it with capture_lead using interest "Cancellation".',
  },
  {
    slug: 'business-hours',
    name: 'Business Hours',
    description: 'Answers opening hours and holiday questions.',
    category: 'Scheduling',
    icon: 'clock',
    promptFragment:
      'Answer questions about opening hours, holidays and location using the knowledge base. If the customer messages outside business hours, say when the team will be available.',
  },
  {
    slug: 'reminder-setter',
    name: 'Reminder Helper',
    description: 'Confirms appointments and shares preparation tips.',
    category: 'Scheduling',
    icon: 'alarm-clock',
    promptFragment:
      'After booking, tell the customer what to bring or how to prepare (from the knowledge base) and how to reschedule if needed.',
  },
  {
    slug: 'table-reservation',
    name: 'Table Reservations',
    description: 'Takes restaurant table bookings.',
    category: 'Scheduling',
    icon: 'utensils',
    tools: ['book_appointment'],
    promptFragment:
      'For table reservations collect party size, date, time, name and phone, plus any special requests (birthday, high chair, dietary). Book with book_appointment using title "Table for <n>".',
  },
  // ---------------- Communication ----------------
  {
    slug: 'smart-greeting',
    name: 'Smart Greeting',
    description: 'Greets new and returning customers personally.',
    category: 'Communication',
    icon: 'hand',
    promptFragment:
      'Greet first-time customers warmly and briefly say what you can help with. Greet returning customers by name if known and reference their last topic from memory.',
  },
  {
    slug: 'multilingual',
    name: 'Multilingual Replies',
    description: 'Replies in the customer\'s language, including Hinglish.',
    category: 'Communication',
    icon: 'languages',
    promptFragment:
      'Always reply in the same language and script the customer uses (English, Hindi, Hinglish, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, etc.). Switch if they switch.',
  },
  {
    slug: 'email-followup',
    name: 'Email Follow-up',
    description: 'Sends confirmations and summaries by email.',
    category: 'Communication',
    icon: 'mail',
    tools: ['send_email'],
    promptFragment:
      'When a customer shares an email address and asks for details in writing (quote, booking confirmation, brochure info), send a short, well-formatted email with send_email and tell them it is on its way.',
  },
  {
    slug: 'tone-matcher',
    name: 'Tone Matcher',
    description: 'Adapts formality to how the customer writes.',
    category: 'Communication',
    icon: 'audio-lines',
    promptFragment:
      'Mirror the customer\'s formality: casual and short if they are casual, formal if they are formal. Stay polite at all times.',
  },
  {
    slug: 'concise-replies',
    name: 'Concise Replies',
    description: 'Keeps messages short and chat-friendly.',
    category: 'Communication',
    icon: 'text',
    promptFragment:
      'Keep replies under 60 words unless the customer asks for detail. Use short paragraphs and bullet points for lists. One question per message.',
  },
  {
    slug: 'document-lookup',
    name: 'Document Lookup',
    description: 'Finds answers in your Google Drive and Docs.',
    category: 'Communication',
    icon: 'file-search',
    tools: ['search_drive', 'read_doc'],
    promptFragment:
      'If the knowledge base does not answer a detailed question (specs, policies, menus, price lists), search Google Drive with search_drive, read the most relevant document with read_doc, and answer from it. Cite the document name.',
  },
  // ---------------- Analytics ----------------
  {
    slug: 'intent-tagger',
    name: 'Intent Insights',
    description: 'Notes what customers want so you can spot trends.',
    category: 'Analytics',
    icon: 'chart-pie',
    promptFragment:
      'Pay attention to the customer\'s main intent (enquiry, purchase, booking, complaint, support) and their key preferences so the conversation summary captures them accurately.',
  },
  {
    slug: 'survey-runner',
    name: 'Mini Surveys',
    description: 'Runs quick 2–3 question surveys.',
    category: 'Analytics',
    icon: 'clipboard-list',
    promptFragment:
      'If the customer agrees to a quick survey, ask up to three short questions one at a time (e.g. how they found us, what they value most, what we could improve) and thank them.',
  },
  {
    slug: 'nps-collector',
    name: 'NPS Collector',
    description: 'Asks how likely customers are to recommend you.',
    category: 'Analytics',
    icon: 'gauge',
    promptFragment:
      'At the end of a resolved conversation you may ask: "On a scale of 0–10, how likely are you to recommend us to a friend?" and one follow-up "What is the main reason for your score?"',
  },
  // ---------------- Industry Specific ----------------
  {
    slug: 'restaurant-orders',
    name: 'Restaurant Orders',
    description: 'Takes food orders from the menu.',
    category: 'Industry Specific',
    icon: 'chef-hat',
    tools: ['capture_lead'],
    promptFragment:
      'Take food orders from the menu in the knowledge base: items, quantity, spice level/customisations, delivery or pickup, address and phone. Read the full order back with the total, then record it with capture_lead using interest "Order: <items> — ₹<total>".',
  },
  {
    slug: 'real-estate',
    name: 'Real Estate Assistant',
    description: 'Qualifies property buyers and books site visits.',
    category: 'Industry Specific',
    icon: 'building',
    tools: ['capture_lead', 'book_appointment'],
    promptFragment:
      'For property enquiries ask: buy or rent, location, budget, BHK/size and move-in timeline. Share matching listings from the knowledge base. Offer a site visit and book it with book_appointment.',
  },
  {
    slug: 'clinic-assistant',
    name: 'Clinic Assistant',
    description: 'Books patient appointments; never gives diagnoses.',
    category: 'Industry Specific',
    icon: 'stethoscope',
    tools: ['book_appointment'],
    promptFragment:
      'You assist a clinic. Book consultations with book_appointment (patient name, age, phone, doctor/department, preferred time). NEVER diagnose or recommend medication. For emergencies, tell the person to call 112 or visit the nearest hospital immediately.',
  },
  {
    slug: 'salon-spa',
    name: 'Salon & Spa',
    description: 'Books services and recommends treatments.',
    category: 'Industry Specific',
    icon: 'scissors',
    tools: ['book_appointment'],
    promptFragment:
      'Help clients choose salon/spa services from the menu (duration and price), ask for a preferred stylist if relevant, and book with book_appointment.',
  },
  {
    slug: 'gym-fitness',
    name: 'Gym & Fitness',
    description: 'Shares membership plans and books trial sessions.',
    category: 'Industry Specific',
    icon: 'dumbbell',
    tools: ['book_appointment', 'capture_lead'],
    promptFragment:
      'Share membership plans and timings from the knowledge base. Ask about fitness goals and offer a free trial session, booked with book_appointment.',
  },
  {
    slug: 'ecommerce-helper',
    name: 'E-commerce Helper',
    description: 'Handles shipping, COD, sizes and stock questions.',
    category: 'Industry Specific',
    icon: 'shopping-bag',
    promptFragment:
      'Answer e-commerce questions: shipping charges and times, COD availability, size guides, stock and payment options, using the knowledge base. Share product links if they are listed.',
  },
  {
    slug: 'travel-agent',
    name: 'Travel Desk',
    description: 'Collects trip details and shares packages.',
    category: 'Industry Specific',
    icon: 'plane',
    tools: ['capture_lead'],
    promptFragment:
      'For travel enquiries collect destination, dates, number of travellers, budget and hotel preference. Share matching packages from the knowledge base and record the enquiry with capture_lead.',
  },
  // ---------------- Education ----------------
  {
    slug: 'course-advisor',
    name: 'Course Advisor',
    description: 'Recommends courses and shares fees and schedules.',
    category: 'Education',
    icon: 'graduation-cap',
    tools: ['capture_lead'],
    promptFragment:
      'Help students choose a course: ask about their background, goal and preferred schedule (online/offline, weekday/weekend), then recommend from the course list with fees and duration. Capture interested students with capture_lead.',
  },
  {
    slug: 'admissions-helper',
    name: 'Admissions Helper',
    description: 'Explains eligibility, documents and deadlines.',
    category: 'Education',
    icon: 'school',
    tools: ['book_appointment'],
    promptFragment:
      'Explain admission eligibility, required documents, deadlines and fee payment options from the knowledge base. Offer a counselling session and book it with book_appointment.',
  },
  {
    slug: 'tutor-helper',
    name: 'Study Buddy',
    description: 'Explains concepts simply with examples.',
    category: 'Education',
    icon: 'book-open',
    promptFragment:
      'When students ask study questions, explain the concept simply with one everyday example, then ask a short check-for-understanding question. Encourage them; do not just hand over homework answers.',
  },
];
