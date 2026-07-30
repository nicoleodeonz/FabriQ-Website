import AppointmentDetail from '../models/AppointmentDetail.js';
import CustomOrder from '../models/CustomOrder.js';
import RentalDetail from '../models/RentalDetail.js';

const SENSITIVE_REQUEST_PATTERN = /\b(email|e-mail|phone|contact number|mobile number|address|password|passcode|otp|verification code|payment reference|reference number|receipt|card number|bank account|gcash|maya)\b/i;
const OTHER_CUSTOMER_PATTERN = /\b(other customer|another customer|someone else|other people's|everyone else's|all customers)\b/i;
const INVENTORY_PATTERN = /\b(inventory|stock|availability|available|how many gowns|how many dresses|available tomorrow|available today)\b/i;
const APPOINTMENT_PATTERN = /\b(appointment|appointments|consultation|consultations|fitting|fittings|measurement|measurements|reschedule|schedule)\b/i;
const RENTAL_PATTERN = /\b(rental|rentals|rent|gown|gowns|dress|dresses|pickup|pick up|return|returns|due date|due back)\b/i;
const CUSTOM_ORDER_PATTERN = /\b(custom order|custom orders|bespoke|design approval|design|order status|custom status)\b/i;
const BRANCH_PATTERN = /\b(preferred branch|my branch|branch)\b/i;
const OVERVIEW_PATTERN = /\b(summary|overview|status|statuses|upcoming|next|current|what do i have|do i have)\b/i;
const WHEN_PATTERN = /\b(when|date|time|what time|what day)\b/i;
const WHAT_PATTERN = /\b(what|what is it for|what's it for|type|purpose|for)\b/i;
const WHERE_PATTERN = /\b(where|which branch|what branch|location)\b/i;
const PAYMENT_PATTERN = /\b(paid|payment|pay|downpayment|down payment|balance)\b/i;
const PROCESS_TIMING_PATTERN = /\b(when will|how long|how soon|take a while|be confirmed|confirmed|be approved|approved|be processed|processed|be ready|ready|be available|available|finished|complete|completed)\b/i;
const BUSINESS_CONTACT_PATTERN = /\b(contact information|contact info|contact details|how can i contact|how do i contact|how to contact|reach you|reach your store|store contact|contact your store)\b/i;
const ACKNOWLEDGEMENT_PATTERN = /\b(thank you|thanks|thank u|ty|okay thanks|ok thanks|okay thank you|ok thank you|got it|noted|alright|all right|sure thanks)\b/i;
const CASUAL_CLOSE_PATTERN = /\b(bye|goodbye|see you|that is all|that's all|thats all|no worries)\b/i;
const FOLLOW_UP_CONTEXT_PATTERN = /\b(when|what|where|which|how long|how soon|will it|is it|does it|for it|about it|that one|this one|it)\b/i;

function formatDateOnly(value) {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date?.getTime?.())) return String(value);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAppointmentLabel(appointment) {
  const type = normalizeText(appointment?.type || 'appointment');
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function formatStatusLabel(status) {
  const text = normalizeText(status).replace(/-/g, ' ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Unknown';
}

function formatCustomerLabel(customerId) {
  if (!customerId) return 'Guest customer';
  const idString = String(customerId);
  const shortId = idString.slice(-4);
  return `Customer #${shortId}`;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function analyzeUserQuery(userQuery) {
  const query = normalizeText(userQuery).toLowerCase();
  const isAcknowledgement = ACKNOWLEDGEMENT_PATTERN.test(query);
  const isCasualClose = CASUAL_CLOSE_PATTERN.test(query);
  const explicitAppointments = APPOINTMENT_PATTERN.test(query);
  const explicitRentals = RENTAL_PATTERN.test(query);
  const explicitCustomOrders = CUSTOM_ORDER_PATTERN.test(query);
  const explicitBranch = BRANCH_PATTERN.test(query);
  const asksOverview = OVERVIEW_PATTERN.test(query);
  const asksSensitiveInfo = SENSITIVE_REQUEST_PATTERN.test(query);
  const asksOtherCustomerData = OTHER_CUSTOMER_PATTERN.test(query);
  const asksInventory = INVENTORY_PATTERN.test(query);
  const asksBusinessContact = BUSINESS_CONTACT_PATTERN.test(query);
  const hasExplicitTopic = explicitAppointments || explicitRentals || explicitCustomOrders || explicitBranch;
  const shouldExpandOverview = asksOverview && !hasExplicitTopic;

  return {
    query,
    isAcknowledgement,
    isCasualClose,
    explicitAppointments,
    explicitRentals,
    explicitCustomOrders,
    explicitBranch,
    asksAppointments: explicitAppointments || shouldExpandOverview,
    asksRentals: explicitRentals || shouldExpandOverview,
    asksCustomOrders: explicitCustomOrders || shouldExpandOverview,
    asksBranch: explicitBranch || shouldExpandOverview,
    asksSensitiveInfo,
    asksOtherCustomerData,
    asksInventory,
    asksBusinessContact,
    hasExplicitTopic,
    asksAccountSpecificQuestion: /\b(my|me|mine|i)\b/.test(query) || hasExplicitTopic || asksOverview,
  };
}

function getGuardrailReply(queryProfile, customerId) {
  if (queryProfile.isAcknowledgement) {
    return 'You\'re welcome. Let me know if there\'s anything else I can help you with.';
  }

  if (queryProfile.isCasualClose) {
    return 'You\'re welcome. If you need anything else, I\'m here to help.';
  }

  if (queryProfile.asksBusinessContact) {
    return 'Please contact us through here';
  }

  if (queryProfile.asksOtherCustomerData) {
    return 'I can only help with the signed-in customer\'s own account. I can\'t share another customer\'s details.';
  }

  if (queryProfile.asksSensitiveInfo) {
    return 'I can help with your statuses, schedules, and branch-related updates, but I can\'t reveal private details like email addresses, phone numbers, addresses, passwords, receipts, or payment reference numbers in chat.';
  }

  if (queryProfile.asksInventory) {
    return 'I can help with your own appointments, rentals, and bespoke orders, but I can\'t check live inventory availability in this chat yet.';
  }

  if (!customerId && queryProfile.asksAccountSpecificQuestion) {
    return 'I can answer general questions here, but I can\'t look up account-specific appointments, rentals, or bespoke orders unless you are signed in.';
  }

  return '';
}

async function loadRelevantCustomerData({ customerId, queryProfile }) {
  if (!customerId) {
    return { appointments: [], rentals: [], customOrders: [] };
  }

  const tasks = [];

  tasks.push(
    queryProfile.asksAppointments
      ? AppointmentDetail.find({ customerId })
          .select('type date time branch status selectedGown selectedGownName')
          .sort({ date: 1, createdAt: -1 })
          .limit(8)
          .lean()
      : Promise.resolve([])
  );

  tasks.push(
    queryProfile.asksRentals
      ? RentalDetail.find({ customerId })
          .select('gownName startDate endDate branch eventType status pickupScheduleDate pickupScheduleTime')
          .sort({ createdAt: -1 })
          .limit(8)
          .lean()
      : Promise.resolve([])
  );

  tasks.push(
    queryProfile.asksCustomOrders
      ? CustomOrder.find({ customerId })
          .select('orderType eventDate branch consultationDate consultationTime fittingDate fittingTime status isArchived')
          .sort({ createdAt: -1 })
          .limit(8)
          .lean()
      : Promise.resolve([])
  );

  const [appointments, rentals, customOrders] = await Promise.all(tasks);
  return { appointments, rentals, customOrders };
}

function buildSupportedTopicFacts(queryProfile) {
  const topics = [];
  if (queryProfile.asksAppointments) topics.push('the customer\'s own appointments');
  if (queryProfile.asksRentals) topics.push('the customer\'s own rentals');
  if (queryProfile.asksCustomOrders) topics.push('the customer\'s own bespoke orders');
  if (queryProfile.asksBranch) topics.push('the customer\'s preferred branch');
  if (topics.length === 0) {
    topics.push('general account-safe support using only non-sensitive facts');
  }
  return topics;
}

function buildSanitizedFacts({ customerLabel, preferredBranch, appointments, rentals, customOrders, queryProfile }) {
  const facts = [`Customer label: ${customerLabel}`];
  facts.push('Sensitive fields such as email addresses, phone numbers, street addresses, payment references, payment receipts, and passwords are never available to share.');
  facts.push(`Allowed answer topics: ${buildSupportedTopicFacts(queryProfile).join(', ')}.`);

  if (preferredBranch) {
    facts.push(`Preferred branch: ${preferredBranch}`);
  }

  if (appointments?.length > 0) {
    const upcoming = appointments
      .filter((appointment) => !['completed', 'cancelled'].includes(String(appointment.status || '').toLowerCase()))
      .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime())
      .slice(0, 3);
    facts.push(`Appointments count: ${appointments.length}.`);
    if (upcoming.length > 0) {
      facts.push(
        `Upcoming appointments: ${upcoming
          .map((appointment) => {
            const date = formatDateOnly(appointment.date);
            const gownName = normalizeText(appointment.selectedGownName || appointment.selectedGown);
            return `${appointment.type || 'appointment'} on ${date}${appointment.time ? ` at ${appointment.time}` : ''}${appointment.branch ? `, ${appointment.branch}` : ''}${gownName ? ` for ${gownName}` : ''} (${appointment.status || 'pending'})`;
          })
          .join('; ')}.`
      );
    } else {
      facts.push('There are no upcoming appointments on file.');
    }
  }

  if (rentals?.length > 0) {
    const activeRentals = rentals.filter((rental) => !['completed', 'cancelled', 'item_lost'].includes(String(rental.status || '').toLowerCase()));
    facts.push(`Rental records count: ${rentals.length}, active rentals: ${activeRentals.length}.`);
    if (activeRentals.length > 0) {
      facts.push(
        `Active rentals: ${activeRentals
          .slice(0, 3)
          .map((rental) => {
            const endDate = formatDateOnly(rental.endDate);
            const pickupSchedule = rental.pickupScheduleDate
              ? `, pickup ${formatDateOnly(rental.pickupScheduleDate)}${rental.pickupScheduleTime ? ` at ${rental.pickupScheduleTime}` : ''}`
              : '';
            return `${rental.gownName || 'rental item'} due ${endDate}${rental.branch ? `, ${rental.branch}` : ''}${pickupSchedule}${rental.eventType ? ` for ${rental.eventType}` : ''} (${rental.status})`;
          })
          .join('; ')}.`
      );
    } else {
      facts.push('There are no active rentals on file.');
    }
  }

  if (customOrders?.length > 0) {
    const openOrders = customOrders.filter((order) => !['completed', 'rejected'].includes(String(order.status || '').toLowerCase()));
    facts.push(`Custom order records count: ${customOrders.length}, open orders: ${openOrders.length}.`);
    if (openOrders.length > 0) {
      facts.push(
        `Open custom orders: ${openOrders
          .slice(0, 3)
          .map((order) => {
            const eventDate = formatDateOnly(order.eventDate);
            const state = order.status ? `${order.status}` : 'inquiry';
            const schedule = order.fittingDate || order.consultationDate ? `, schedule ${formatDateOnly(order.fittingDate || order.consultationDate)}` : '';
            return `${order.orderType || 'order'}${eventDate ? ` for ${eventDate}` : ''}${order.branch ? `, ${order.branch}` : ''}${schedule}${state ? ` (${state})` : ''}`;
          })
          .join('; ')}.`
      );
    } else {
      facts.push('There are no open bespoke orders on file.');
    }
  }

  if (facts.length === 3) {
    facts.push('No customer-specific database facts are available.');
  }

  return facts;
}

function getUpcomingAppointments(appointments) {
  return (appointments || [])
    .filter((appointment) => !['completed', 'cancelled'].includes(String(appointment.status || '').toLowerCase()))
    .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
}

function buildDirectAppointmentReply(userQuery, appointments) {
  const upcomingAppointments = getUpcomingAppointments(appointments);
  if (upcomingAppointments.length === 0) {
    return 'You do not have any upcoming appointments right now.';
  }

  const nextAppointment = upcomingAppointments[0];
  const appointmentLabel = formatAppointmentLabel(nextAppointment);
  const appointmentDate = formatDateOnly(nextAppointment.date);
  const appointmentTime = normalizeText(nextAppointment.time);
  const appointmentBranch = normalizeText(nextAppointment.branch);
  const gownName = normalizeText(nextAppointment.selectedGownName || nextAppointment.selectedGown);
  const normalizedQuery = normalizeText(userQuery).toLowerCase();

  if (PROCESS_TIMING_PATTERN.test(normalizedQuery) && !WHAT_PATTERN.test(normalizedQuery) && !WHERE_PATTERN.test(normalizedQuery)) {
    return 'It may take a while. If you want a definite answer, please contact our store directly.';
  }

  if (WHEN_PATTERN.test(normalizedQuery)) {
    return `Your next appointment is a ${appointmentLabel.toLowerCase()} on ${appointmentDate}${appointmentTime ? ` at ${appointmentTime}` : ''}${appointmentBranch ? ` at ${appointmentBranch}` : ''}.`;
  }

  if (WHERE_PATTERN.test(normalizedQuery)) {
    return appointmentBranch
      ? `Your next appointment is at ${appointmentBranch}.`
      : `Your next appointment is a ${appointmentLabel.toLowerCase()} on ${appointmentDate}${appointmentTime ? ` at ${appointmentTime}` : ''}.`;
  }

  if (WHAT_PATTERN.test(normalizedQuery)) {
    if (gownName) {
      return `Your next appointment is a ${appointmentLabel.toLowerCase()} for ${gownName}${appointmentDate ? ` on ${appointmentDate}` : ''}${appointmentTime ? ` at ${appointmentTime}` : ''}.`;
    }
    return `Your next appointment is a ${appointmentLabel.toLowerCase()}${appointmentDate ? ` on ${appointmentDate}` : ''}${appointmentTime ? ` at ${appointmentTime}` : ''}${appointmentBranch ? ` at ${appointmentBranch}` : ''}.`;
  }

  return `Your next appointment is a ${appointmentLabel.toLowerCase()} on ${appointmentDate}${appointmentTime ? ` at ${appointmentTime}` : ''}${appointmentBranch ? ` at ${appointmentBranch}` : ''}${gownName ? ` for ${gownName}` : ''}.`;
}

function getRelevantRentals(rentals) {
  const list = rentals || [];
  const openRentals = list.filter((rental) => !['completed', 'cancelled', 'item_lost'].includes(String(rental.status || '').toLowerCase()));
  return openRentals.length > 0 ? openRentals : list;
}

function buildDirectRentalReply(userQuery, rentals) {
  const relevantRentals = getRelevantRentals(rentals);
  if (relevantRentals.length === 0) {
    return 'You do not have any rental orders on file right now.';
  }

  const primaryRental = relevantRentals[0];
  const gownName = normalizeText(primaryRental.gownName || 'rental gown');
  const status = normalizeText(primaryRental.status);
  const statusLabel = formatStatusLabel(status);
  const endDate = formatDateOnly(primaryRental.endDate);
  const startDate = formatDateOnly(primaryRental.startDate);
  const branch = normalizeText(primaryRental.branch);
  const eventType = normalizeText(primaryRental.eventType);
  const pickupDate = primaryRental.pickupScheduleDate ? formatDateOnly(primaryRental.pickupScheduleDate) : '';
  const pickupTime = normalizeText(primaryRental.pickupScheduleTime);
  const normalizedQuery = normalizeText(userQuery).toLowerCase();
  const rentalCount = relevantRentals.length;
  const countText = rentalCount > 1 ? `You currently have ${rentalCount} rental orders. ` : 'You currently have 1 rental order. ';

  if (PROCESS_TIMING_PATTERN.test(normalizedQuery) && !WHAT_PATTERN.test(normalizedQuery) && !WHERE_PATTERN.test(normalizedQuery)) {
    return 'It may take a while. If you want a definite answer, please contact our store directly.';
  }

  if (PAYMENT_PATTERN.test(normalizedQuery)) {
    if (['paid_for_confirmation', 'for_pickup', 'active', 'completed'].includes(status)) {
      return `Yes, payment for ${gownName} has already been recorded. Its current rental status is ${statusLabel.toLowerCase()}.`;
    }
    if (status === 'for_payment' || status === 'pending') {
      return `Payment for ${gownName} has not been fully confirmed yet. Its current rental status is ${statusLabel.toLowerCase()}.`;
    }
    return `${gownName} is currently in ${statusLabel.toLowerCase()} status.`;
  }

  if (WHEN_PATTERN.test(normalizedQuery)) {
    if (pickupDate) {
      return `Your rental for ${gownName} is currently in ${statusLabel.toLowerCase()} status, with pickup on ${pickupDate}${pickupTime ? ` at ${pickupTime}` : ''}${branch ? ` at ${branch}` : ''}.`;
    }
    if (endDate) {
      return `Your rental for ${gownName} is currently in ${statusLabel.toLowerCase()} status and is due on ${endDate}${branch ? ` at ${branch}` : ''}.`;
    }
    if (startDate) {
      return `Your rental for ${gownName} is currently in ${statusLabel.toLowerCase()} status and starts on ${startDate}${branch ? ` at ${branch}` : ''}.`;
    }
  }

  if (WHERE_PATTERN.test(normalizedQuery)) {
    return branch
      ? `Your rental for ${gownName} is being handled at ${branch}.`
      : `Your rental for ${gownName} is currently in ${statusLabel.toLowerCase()} status, but I do not see a branch listed yet.`;
  }

  if (WHAT_PATTERN.test(normalizedQuery)) {
    return `${countText}Your next rental is for ${gownName}, currently in ${statusLabel.toLowerCase()} status${eventType ? ` for ${eventType}` : ''}${pickupDate ? `, with pickup on ${pickupDate}${pickupTime ? ` at ${pickupTime}` : ''}` : ''}${endDate ? `, due on ${endDate}` : ''}${branch ? ` at ${branch}` : ''}.`;
  }

  return `${countText}Your next rental is for ${gownName}, currently in ${statusLabel.toLowerCase()} status${eventType ? ` for ${eventType}` : ''}${pickupDate ? `, with pickup on ${pickupDate}${pickupTime ? ` at ${pickupTime}` : ''}` : ''}${endDate ? `, due on ${endDate}` : ''}${branch ? ` at ${branch}` : ''}.`;
}

function getRelevantCustomOrders(customOrders) {
  const orders = customOrders || [];
  const openOrders = orders.filter((order) => !['completed', 'rejected'].includes(String(order.status || '').toLowerCase()));
  return openOrders.length > 0 ? openOrders : orders;
}

function buildCustomOrderScheduleLabel(order) {
  const fittingDate = normalizeText(order?.fittingDate);
  const fittingTime = normalizeText(order?.fittingTime);
  if (fittingDate) {
    return `fitting on ${formatDateOnly(fittingDate)}${fittingTime ? ` at ${fittingTime}` : ''}`;
  }

  const consultationDate = normalizeText(order?.consultationDate);
  const consultationTime = normalizeText(order?.consultationTime);
  if (consultationDate) {
    return `consultation on ${formatDateOnly(consultationDate)}${consultationTime ? ` at ${consultationTime}` : ''}`;
  }

  const eventDate = normalizeText(order?.eventDate);
  if (eventDate) {
    return `event date ${formatDateOnly(eventDate)}`;
  }

  return '';
}

function buildDirectCustomOrderReply(userQuery, customOrders) {
  const relevantOrders = getRelevantCustomOrders(customOrders);
  if (relevantOrders.length === 0) {
    return 'You do not have any bespoke orders on file right now.';
  }

  const primaryOrder = relevantOrders[0];
  const orderType = normalizeText(primaryOrder.orderType || 'bespoke order');
  const statusLabel = formatStatusLabel(primaryOrder.status || 'inquiry');
  const branch = normalizeText(primaryOrder.branch);
  const scheduleLabel = buildCustomOrderScheduleLabel(primaryOrder);
  const normalizedQuery = normalizeText(userQuery).toLowerCase();
  const orderCount = relevantOrders.length;
  const countText = orderCount > 1 ? `You currently have ${orderCount} bespoke orders. ` : 'You currently have 1 bespoke order. ';

  if (PROCESS_TIMING_PATTERN.test(normalizedQuery) && !WHAT_PATTERN.test(normalizedQuery) && !WHERE_PATTERN.test(normalizedQuery)) {
    return 'It may take a while. If you want a definite answer, please contact our store directly.';
  }

  if (WHEN_PATTERN.test(normalizedQuery)) {
    if (scheduleLabel) {
      return `Your ${orderType} is currently in ${statusLabel.toLowerCase()} status, with ${scheduleLabel}.`;
    }
    return `Your ${orderType} is currently in ${statusLabel.toLowerCase()} status, and there is no schedule set yet.`;
  }

  if (WHERE_PATTERN.test(normalizedQuery)) {
    return branch
      ? `Your ${orderType} is being handled at ${branch}.`
      : `Your ${orderType} is currently in ${statusLabel.toLowerCase()} status, but I do not see a branch listed yet.`;
  }

  if (WHAT_PATTERN.test(normalizedQuery)) {
    return `${countText}Your next active order is ${orderType}, currently in ${statusLabel.toLowerCase()} status${scheduleLabel ? `, with ${scheduleLabel}` : ''}${branch ? ` at ${branch}` : ''}.`;
  }

  return `${countText}Your next active order is ${orderType}, currently in ${statusLabel.toLowerCase()} status${scheduleLabel ? `, with ${scheduleLabel}` : ''}${branch ? ` at ${branch}` : ''}.`;
}

function buildChatbotPrompt({ customerLabel, facts, userQuery }) {
  const lines = [
    'You are a customer support assistant for Hannah Vanessa, a bridal and rental service.',
    'Answer the customer using only the provided facts.',
    'Do not invent any private customer details like email addresses, phone numbers, addresses, or payment references.',
    'Do not reveal sensitive customer data. If you are not sure, ask a clarifying question.',
    'It is allowed to share the signed-in customer\'s own appointment date, time, branch, appointment type, rental due date, rental pickup schedule, and bespoke order status, branch, consultation date, fitting date, and event date when those facts are provided.',
    'You may answer only about the signed-in customer and only for the allowed topics listed in the facts.',
    'If the customer asks for restricted data or data that is not present in the facts, politely say that you cannot access or share it in chat.',
    'Use plain, friendly customer service language. Keep the answer concise.',
    'Always respond in complete sentences and never end mid-sentence or with a dangling phrase.',
    '',
    `Customer label: ${customerLabel}`,
    '',
    'Facts:',
    ...facts.map((fact) => `- ${fact}`),
    '',
  ];

  lines.push('Customer request:');
  lines.push(userQuery.trim());
  lines.push('');
  lines.push('Respond with a helpful, accurate answer based on the facts above.');
  return lines.join('\n');
}

function normalizeGeminiReply(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (/[.!?]["']?$/.test(normalized)) {
    return normalized;
  }

  const lastSentenceEnd = Math.max(
    normalized.lastIndexOf('.'),
    normalized.lastIndexOf('!'),
    normalized.lastIndexOf('?')
  );

  if (lastSentenceEnd >= 0) {
    const completedPortion = normalized.slice(0, lastSentenceEnd + 1).trim();
    if (completedPortion.length >= Math.max(24, Math.floor(normalized.length * 0.45))) {
      return completedPortion;
    }
  }

  return `${normalized}.`;
}

async function callGemini(prompt) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const model = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 512,
        responseMimeType: 'text/plain',
      },
    }),
  });

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    const message = responseBody?.error?.message || 'Gemini request failed.';
    throw new Error(message);
  }

  const text = responseBody?.candidates?.[0]?.content?.parts?.map((part) => String(part?.text || '')).join('') || '';
  const normalized = normalizeGeminiReply(text);
  if (!normalized) {
    throw new Error('Gemini returned an empty reply.');
  }

  return normalized;
}

export async function generateGeminiChatReply({ customerId, preferredBranch, conversationHistory, userQuery }) {
  const queryProfile = analyzeUserQuery(userQuery);
  const guardrailReply = getGuardrailReply(queryProfile, customerId);
  if (guardrailReply) {
    return guardrailReply;
  }

  const customerLabel = formatCustomerLabel(customerId);
  const { appointments, rentals, customOrders } = await loadRelevantCustomerData({
    customerId,
    queryProfile,
  });

  const facts = buildSanitizedFacts({
    customerLabel,
    preferredBranch,
    appointments,
    rentals,
    customOrders,
    queryProfile,
  });

  if (queryProfile.explicitCustomOrders) {
    const directCustomOrderReply = buildDirectCustomOrderReply(userQuery, customOrders);
    if (directCustomOrderReply) {
      return directCustomOrderReply;
    }
  }

  if (queryProfile.explicitAppointments) {
    const directAppointmentReply = buildDirectAppointmentReply(userQuery, appointments);
    if (directAppointmentReply) {
      return directAppointmentReply;
    }
  }

  if (queryProfile.explicitRentals) {
    const directRentalReply = buildDirectRentalReply(userQuery, rentals);
    if (directRentalReply) {
      return directRentalReply;
    }
  }

  if (queryProfile.asksCustomOrders) {
    const directCustomOrderReply = buildDirectCustomOrderReply(userQuery, customOrders);
    if (directCustomOrderReply) {
      return directCustomOrderReply;
    }
  }

  const prompt = buildChatbotPrompt({
    customerLabel,
    facts,
    userQuery,
  });

  return await callGemini(prompt);
}

export function buildCustomerLabel(customerId) {
  return formatCustomerLabel(customerId);
}
