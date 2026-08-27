import { generateAnalyticsNarrative, generateStoreOverviewNarrative } from '../services/geminiNarrativeService.js';
import { isElevatedRole } from '../utils/roles.js';
import SkinAnalysis from '../models/SkinAnalysis.js';
import ProductDetail from '../models/ProductDetail.js';
import ChatMessage from '../models/ChatMessage.js';
import RentalDetail from '../models/RentalDetail.js';
import AppointmentDetail from '../models/AppointmentDetail.js';
import CustomOrder from '../models/CustomOrder.js';

function ensureElevatedAccess(req, res) {
  if (!isElevatedRole(req.user?.role)) {
    res.status(403).json({ message: 'Access denied' });
    return false;
  }

  return true;
}

export async function createAnalyticsNarrative(req, res) {
  try {
    if (!ensureElevatedAccess(req, res)) {
      return;
    }

    const narrative = await generateAnalyticsNarrative(req.body || {});
    return res.json({ narrative });
  } catch (error) {
    console.error('createAnalyticsNarrative error:', error);
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to generate analytics narrative.' });
  }
}

export async function createStoreOverviewNarrative(req, res) {
  try {
    if (!ensureElevatedAccess(req, res)) {
      return;
    }

    const narrative = await generateStoreOverviewNarrative(req.body || {});
    return res.json({ narrative });
  } catch (error) {
    console.error('createStoreOverviewNarrative error:', error);
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to generate store overview narrative.' });
  }
}

export async function getColorAnalysisSummary(req, res) {
  try {
    if (!ensureElevatedAccess(req, res)) {
      return;
    }

    const analyses = await SkinAnalysis.find({}).select('skinTone recommendedColors recommendedGownIds').lean();
    const gownIds = [...new Set(
      analyses.flatMap((analysis) => (Array.isArray(analysis.recommendedGownIds) ? analysis.recommendedGownIds : []).map(String))
    )];
    const gowns = await ProductDetail.find({ _id: { $in: gownIds } }).select('name').lean();
    const gownNames = new Map(gowns.map((gown) => [String(gown._id), gown.name]));

    const countValues = (values) => Object.entries(values.reduce((counts, value) => {
      const label = String(value || '').trim();
      if (label) counts[label] = (counts[label] || 0) + 1;
      return counts;
    }, {}))
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 10);

    return res.json({
      skinTones: countValues(analyses.map((analysis) => analysis.skinTone)),
      suggestedColors: countValues(analyses.flatMap((analysis) => analysis.recommendedColors || [])),
      suggestedGowns: countValues(analyses.flatMap((analysis) => (
        analysis.recommendedGownIds || []
      ).map((id) => gownNames.get(String(id)) || 'Unavailable gown'))),
    });
  } catch (error) {
    console.error('getColorAnalysisSummary error:', error);
    return res.status(500).json({ message: 'Failed to load color analysis summary.' });
  }
}

const CHAT_TOPIC_RULES = [
  ['Pricing', /\b(price|pricing|cost|budget|how much|payment|pay)\b/i],
  ['Product Recommendation', /\b(recommend|suggest|which gown|what should|best dress|suit me)\b/i],
  ['Size / Measurement', /\b(size|measure|measurement|fit|fitting|bust|waist|height)\b/i],
  ['Availability', /\b(available|availability|in stock|stock|rent|reserve|book)\b/i],
  ['Shipping / Delivery', /\b(ship|shipping|deliver|delivery|pickup|pick up|location)\b/i],
  ['Returns / Refunds', /\b(return|refund|exchange|cancel)\b/i],
  ['Appointment', /\b(appointment|schedule|visit|consultation)\b/i],
  ['Custom Order', /\b(custom|bespoke|tailor|alteration|design)\b/i],
  ['Complaint', /\b(complaint|complain|problem|issue|bad|wrong|disappoint)\b/i],
  ['Product Inquiry', /\b(gown|dress|product|item|color|colour|fabric|material|catalog)\b/i],
];

const CHAT_INTENT_RULES = [
  ['Purchase Intent', /\b(buy|purchase|order|rent|book|reserve|get this|i want)\b/i],
  ['Recommendation', /\b(recommend|suggest|which|best|suit me)\b/i],
  ['Return / Refund', /\b(return|refund|exchange|cancel)\b/i],
  ['Price Inquiry', /\b(price|pricing|cost|how much|payment)\b/i],
  ['Size / Measurement', /\b(size|measure|measurement|fit|fitting|bust|waist|height)\b/i],
  ['Complaint', /\b(complaint|complain|problem|issue|bad|wrong|disappoint)\b/i],
  ['Support', /\b(help|support|assistance|account|login|error|contact)\b/i],
  ['Product Inquiry', /\b(gown|dress|product|item|color|colour|fabric|material)\b/i],
];

function classifyChatMessage(text, rules, fallback) {
  return rules.find(([, pattern]) => pattern.test(text))?.[0] || fallback;
}

function classifySentiment(text) {
  const positive = /\b(thank|thanks|great|good|love|beautiful|perfect|happy|helpful|amazing)\b/i.test(text);
  const negative = /\b(bad|hate|angry|sad|problem|issue|wrong|late|disappoint|complaint|refund)\b/i.test(text);
  if (positive && !negative) return 'positive';
  if (negative && !positive) return 'negative';
  return 'neutral';
}

function getChatDateRange(req) {
  const startDate = String(req.query?.startDate || '').trim();
  const endDate = String(req.query?.endDate || '').trim();
  const start = startDate ? new Date(`${startDate}T00:00:00.000+08:00`) : new Date(0);
  const end = endDate ? new Date(`${endDate}T23:59:59.999+08:00`) : new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return null;
  }

  return { start, end };
}

function getManilaBucket(date, granularity) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  if (granularity === 'monthly') return `${parts.year}-${parts.month}`;
  if (granularity === 'weekly') {
    const weekDate = new Date(`${day}T00:00:00Z`);
    weekDate.setUTCDate(weekDate.getUTCDate() - weekDate.getUTCDay());
    return weekDate.toISOString().slice(0, 10);
  }
  return day;
}

export async function getChatBehaviorAnalytics(req, res) {
  try {
    if (!ensureElevatedAccess(req, res)) return;

    const dateRange = getChatDateRange(req);
    if (!dateRange) return res.status(400).json({ message: 'Invalid chat analytics date range.' });
    const granularity = ['daily', 'weekly', 'monthly'].includes(req.query?.granularity)
      ? req.query.granularity
      : 'daily';

    const messages = await ChatMessage.aggregate([
      { $match: { createdAt: { $gte: dateRange.start, $lte: dateRange.end } } },
      { $project: { conversationId: 1, sender: 1, text: 1, chat: 1, createdAt: 1 } },
    ]);
    const customerMessages = messages.filter((message) => message.sender === 'customer');
    const countByLabel = (labels) => Object.entries(labels.reduce((counts, label) => {
      counts[label] = (counts[label] || 0) + 1;
      return counts;
    }, {})).map(([label, count]) => ({ label, count })).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
    const textOf = (message) => String(message.text || message.chat || '').trim();

    const topics = countByLabel(customerMessages.map((message) => classifyChatMessage(textOf(message), CHAT_TOPIC_RULES, 'General Inquiry')));
    const intents = countByLabel(customerMessages.map((message) => classifyChatMessage(textOf(message), CHAT_INTENT_RULES, 'General Inquiry')))
      .map((entry) => ({ ...entry, percentage: customerMessages.length ? Math.round((entry.count / customerMessages.length) * 1000) / 10 : 0 }));

    const sentimentBuckets = new Map();
    for (const message of customerMessages) {
      const bucket = getManilaBucket(message.createdAt, granularity);
      const current = sentimentBuckets.get(bucket) || { date: bucket, positive: 0, neutral: 0, negative: 0 };
      current[classifySentiment(textOf(message))] += 1;
      sentimentBuckets.set(bucket, current);
    }
    const sentimentOverTime = [...sentimentBuckets.values()].sort((left, right) => left.date.localeCompare(right.date));
    const sentimentTotal = sentimentOverTime.reduce((sum, entry) => sum + entry.positive + entry.neutral + entry.negative, 0);
    const sentimentSummary = {
      positivePercentage: sentimentTotal ? Math.round((sentimentOverTime.reduce((sum, entry) => sum + entry.positive, 0) / sentimentTotal) * 1000) / 10 : 0,
      neutralPercentage: sentimentTotal ? Math.round((sentimentOverTime.reduce((sum, entry) => sum + entry.neutral, 0) / sentimentTotal) * 1000) / 10 : 0,
      negativePercentage: sentimentTotal ? Math.round((sentimentOverTime.reduce((sum, entry) => sum + entry.negative, 0) / sentimentTotal) * 1000) / 10 : 0,
    };

    const products = await ProductDetail.find({ status: { $ne: 'archived' } }).select('name').lean();
    const productMentions = new Map();
    for (const message of customerMessages) {
      const text = textOf(message).toLowerCase();
      for (const product of products) {
        const name = String(product.name || '').trim();
        if (name && text.includes(name.toLowerCase())) {
          const key = String(product._id);
          const current = productMentions.get(key) || { productId: key, productName: name, mentions: 0 };
          current.mentions += 1;
          productMentions.set(key, current);
        }
      }
    }
    const discussedProducts = [...productMentions.values()].sort((left, right) => right.mentions - left.mentions || left.productName.localeCompare(right.productName)).slice(0, 10);

    const conversationCounts = new Map();
    for (const message of messages) conversationCounts.set(message.conversationId, (conversationCounts.get(message.conversationId) || 0) + 1);
    const lengthCounts = { '1-3 messages': 0, '4-6 messages': 0, '7-10 messages': 0, '11-20 messages': 0, '21+ messages': 0 };
    for (const count of conversationCounts.values()) {
      const range = count <= 3 ? '1-3 messages' : count <= 6 ? '4-6 messages' : count <= 10 ? '7-10 messages' : count <= 20 ? '11-20 messages' : '21+ messages';
      lengthCounts[range] += 1;
    }
    const conversationLength = Object.entries(lengthCounts).map(([label, count]) => ({ label, count }));
    const hourCounts = Array.from({ length: 24 }, (_, hour) => ({ hour: `${hour} AM`, count: 0 }));
    for (const message of customerMessages) {
      const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hourCycle: 'h23' }).format(message.createdAt));
      hourCounts[hour].hour = `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
      hourCounts[hour].count += 1;
    }

    return res.json({
      summary: {
        totalConversations: conversationCounts.size,
        totalCustomerMessages: customerMessages.length,
        mostCommonIntent: intents[0]?.label || 'No data',
        mostDiscussedProduct: discussedProducts[0]?.productName || 'No data',
        positiveSentimentPercentage: sentimentSummary.positivePercentage,
        peakChatHour: hourCounts.slice().sort((left, right) => right.count - left.count)[0]?.hour || 'No data',
      },
      topics,
      intents,
      sentimentOverTime,
      sentimentSummary,
      discussedProducts,
      conversationLength,
      peakChatHours: hourCounts,
    });
  } catch (error) {
    console.error('getChatBehaviorAnalytics error:', error);
    return res.status(500).json({ message: 'Failed to load chat behavior analytics.' });
  }
}

export async function getGeneralAnalytics(req, res) {
  try {
    if (!ensureElevatedAccess(req, res)) return;

    const branchFilter = String(req.query?.branch || 'All Branches').trim();
    const startDateStr = String(req.query?.startDate || '').trim();
    const endDateStr = String(req.query?.endDate || '').trim();

    const dateFilter = {};
    if (startDateStr) {
      dateFilter.$gte = new Date(`${startDateStr}T00:00:00Z`);
    }
    if (endDateStr) {
      dateFilter.$lte = new Date(`${endDateStr}T23:59:59Z`);
    }

    // Inventory Status
    const inventoryProducts = await ProductDetail.find({
      status: { $ne: 'archived' },
      ...(branchFilter !== 'All Branches' ? { branch: branchFilter } : {}),
    }).lean();

    const statusCounts = {};
    for (const product of inventoryProducts) {
      const status = String(product.status || 'available').trim();
      statusCounts[status] = (statusCounts[status] || 0) + (product.stock || 1);
    }

    const totalInventoryItems = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
    const inventoryStatus = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
      percentage: totalInventoryItems ? Math.round((count / totalInventoryItems) * 1000) / 10 : 0,
    })).sort((a, b) => b.count - a.count);

    // Order Status (Rentals)
    const rentalFilter = {
      ...(branchFilter !== 'All Branches' ? { branch: branchFilter } : {}),
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    };
    const rentals = await RentalDetail.find(rentalFilter).select('status').lean();

    const rentalStatusCounts = {};
    for (const rental of rentals) {
      const status = String(rental.status || 'pending').trim();
      rentalStatusCounts[status] = (rentalStatusCounts[status] || 0) + 1;
    }

    const totalRentals = rentals.length;
    const orderStatus = Object.entries(rentalStatusCounts).map(([status, count]) => ({
      status,
      count,
      percentage: totalRentals ? Math.round((count / totalRentals) * 1000) / 10 : 0,
    })).sort((a, b) => b.count - a.count);

    // Appointment Overview
    const appointmentFilter = {
      ...(branchFilter !== 'All Branches' ? { branch: branchFilter } : {}),
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    };
    const appointments = await AppointmentDetail.find(appointmentFilter).select('status').lean();

    const appointmentStatusCounts = {};
    for (const apt of appointments) {
      const status = String(apt.status || 'pending').trim();
      appointmentStatusCounts[status] = (appointmentStatusCounts[status] || 0) + 1;
    }

    const totalAppointments = appointments.length;
    const appointmentOverview = Object.entries(appointmentStatusCounts).map(([status, count]) => ({
      status,
      count,
      percentage: totalAppointments ? Math.round((count / totalAppointments) * 1000) / 10 : 0,
    })).sort((a, b) => b.count - a.count);

    // Bespoke Order Overview
    const bespokeOrders = await CustomOrder.find({
      isArchived: { $ne: true },
      ...(branchFilter !== 'All Branches' ? { branch: branchFilter } : {}),
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    }).select('status').lean();
    const bespokeStatusCounts = {};
    for (const order of bespokeOrders) {
      const status = String(order.status || 'inquiry').trim();
      bespokeStatusCounts[status] = (bespokeStatusCounts[status] || 0) + 1;
    }
    const totalBespokeOrders = bespokeOrders.length;
    const bespokeOverview = Object.entries(bespokeStatusCounts).map(([status, count]) => ({
      status,
      count,
      percentage: totalBespokeOrders ? Math.round((count / totalBespokeOrders) * 1000) / 10 : 0,
    })).sort((a, b) => b.count - a.count);

    return res.json({
      inventoryStatus,
      orderStatus,
      appointmentOverview,
      bespokeOverview,
    });
  } catch (error) {
    console.error('getGeneralAnalytics error:', error);
    return res.status(500).json({ message: 'Failed to load general analytics.' });
  }
}

export async function getBusinessActivityAnalytics(req, res) {
  try {
    if (!ensureElevatedAccess(req, res)) return;

    const branchFilter = String(req.query?.branch || 'All Branches').trim();
    const startDateStr = String(req.query?.startDate || '').trim();
    const endDateStr = String(req.query?.endDate || '').trim();
    const granularity = ['daily', 'weekly', 'monthly'].includes(req.query?.granularity)
      ? req.query.granularity
      : 'daily';

    const startDate = startDateStr ? new Date(`${startDateStr}T00:00:00Z`) : new Date(0);
    const endDate = endDateStr ? new Date(`${endDateStr}T23:59:59Z`) : new Date();

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      return res.status(400).json({ message: 'Invalid date range.' });
    }

    const dateFilter = { createdAt: { $gte: startDate, $lte: endDate } };
    const branchMatchFilter = branchFilter !== 'All Branches' ? { branch: branchFilter } : {};

    const [rentals, appointments, customOrders] = await Promise.all([
      RentalDetail.find({ ...dateFilter, ...branchMatchFilter }).select('createdAt').lean(),
      AppointmentDetail.find({ ...dateFilter, ...branchMatchFilter }).select('createdAt').lean(),
      CustomOrder.find({ ...dateFilter, ...branchMatchFilter }).select('createdAt').lean(),
    ]);

    const getDateBucket = (date, gran) => {
      const d = new Date(date);
      if (gran === 'monthly') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      if (gran === 'weekly') {
        const weekStart = new Date(d);
        weekStart.setUTCDate(d.getUTCDate() - d.getUTCDay());
        return weekStart.toISOString().slice(0, 10);
      }
      return d.toISOString().slice(0, 10);
    };

    const buckets = new Map();

    for (const rental of rentals) {
      const bucket = getDateBucket(rental.createdAt, granularity);
      const current = buckets.get(bucket) || { date: bucket, orders: 0, rentals: 0, appointments: 0, customOrders: 0 };
      current.orders += 1;
      current.rentals += 1;
      buckets.set(bucket, current);
    }

    for (const apt of appointments) {
      const bucket = getDateBucket(apt.createdAt, granularity);
      const current = buckets.get(bucket) || { date: bucket, orders: 0, rentals: 0, appointments: 0, customOrders: 0 };
      current.appointments += 1;
      buckets.set(bucket, current);
    }

    for (const co of customOrders) {
      const bucket = getDateBucket(co.createdAt, granularity);
      const current = buckets.get(bucket) || { date: bucket, orders: 0, rentals: 0, appointments: 0, customOrders: 0 };
      current.orders += 1;
      current.customOrders += 1;
      buckets.set(bucket, current);
    }

    // Keep empty days in the selected range so the daily chart represents the full period.
    if (granularity === 'daily' && startDateStr && endDateStr) {
      const day = new Date(startDate);
      day.setUTCHours(0, 0, 0, 0);
      const lastDay = new Date(endDate);
      lastDay.setUTCHours(0, 0, 0, 0);
      while (day <= lastDay) {
        const date = day.toISOString().slice(0, 10);
        if (!buckets.has(date)) {
          buckets.set(date, { date, orders: 0, rentals: 0, appointments: 0, customOrders: 0 });
        }
        day.setUTCDate(day.getUTCDate() + 1);
      }
    }

    const businessActivity = [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));

    return res.json({ businessActivity });
  } catch (error) {
    console.error('getBusinessActivityAnalytics error:', error);
    return res.status(500).json({ message: 'Failed to load business activity analytics.' });
  }
}

export async function getRecentActivityAnalytics(req, res) {
  try {
    if (!ensureElevatedAccess(req, res)) return;

    const branchFilter = String(req.query?.branch || 'All Branches').trim();
    const limit = Math.min(Math.max(1, Number(req.query?.limit) || 10), 100);

    const branchMatch = branchFilter !== 'All Branches' ? { branch: branchFilter } : {};

    const [rentals, appointments, customOrders] = await Promise.all([
      RentalDetail.find(branchMatch)
        .select('createdAt gownName customerName status branch referenceId')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      AppointmentDetail.find(branchMatch)
        .select('createdAt type customerName status branch referenceId')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      CustomOrder.find(branchMatch)
        .select('createdAt orderType customerName status branch referenceId')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
    ]);

    const activities = [
      ...rentals.map((r) => ({
        date: r.createdAt,
        type: 'Rental',
        title: `New Rental: ${r.gownName}`,
        customer: r.customerName,
        status: r.status,
        branch: r.branch,
        referenceId: r.referenceId,
      })),
      ...appointments.map((a) => ({
        date: a.createdAt,
        type: 'Appointment',
        title: `New ${a.type} Appointment`,
        customer: a.customerName,
        status: a.status,
        branch: a.branch,
        referenceId: a.referenceId,
      })),
      ...customOrders.map((c) => ({
        date: c.createdAt,
        type: 'Custom Order',
        title: `New ${c.orderType}`,
        customer: c.customerName,
        status: c.status,
        branch: c.branch,
        referenceId: c.referenceId,
      })),
    ];

    const recentActivity = activities
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, limit);

    return res.json({ recentActivity });
  } catch (error) {
    console.error('getRecentActivityAnalytics error:', error);
    return res.status(500).json({ message: 'Failed to load recent activity analytics.' });
  }
}
