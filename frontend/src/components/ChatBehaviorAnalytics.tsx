import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import type { ChartOptions } from 'chart.js';
import { getChatBehaviorAnalytics, type ChatAnalyticsGranularity, type ChatAnalyticsResponse } from '../services/chatAnalyticsAPI';

const palette = ['#D4AF37', '#B86A6A', '#6E8B78', '#7A8FB3', '#A27F5D', '#8E7A9B', '#C47F5D', '#6D8C8C', '#B59A63', '#8B6B61'];
const today = new Date();
const toDateInput = (date: Date) => date.toISOString().slice(0, 10);
const defaultStart = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);

function chartData(entries: Array<{ label: string; count: number }>) {
  return {
    labels: entries.map((entry) => entry.label),
    datasets: [{ label: 'Messages', data: entries.map((entry) => entry.count), backgroundColor: entries.map((_, index) => palette[index % palette.length]), borderRadius: 8, borderSkipped: false as const }],
  };
}

const horizontalOptions: ChartOptions<'bar'> = {
  indexAxis: 'y', responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#E8DCC8' } }, y: { grid: { display: false } } },
};
const verticalOptions: ChartOptions<'bar'> = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#E8DCC8' } } },
};

interface Props { token: string; }

export function ChatBehaviorAnalytics({ token }: Props) {
  const [data, setData] = useState<ChatAnalyticsResponse | null>(null);
  const [startDate, setStartDate] = useState(toDateInput(defaultStart));
  const [endDate, setEndDate] = useState(toDateInput(today));
  const [granularity, setGranularity] = useState<ChatAnalyticsGranularity>('daily');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getChatBehaviorAnalytics(token, { startDate, endDate, granularity })
      .then((result) => { if (!cancelled) setData(result); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load chat analytics.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, startDate, endDate, granularity]);

  const empty = <p className="text-sm text-[#6B5D4F]">No chat data available for the selected period.</p>;
  const card = (title: string, content: ReactNode) => <div className="rounded-2xl border border-[#E8DCC8] bg-white p-6"><h3 className="mb-4 text-lg font-medium text-[#1A1A1A]">{title}</h3>{content}</div>;
  const applyPreset = (days: number | null) => {
    const end = new Date();
    const start = days === null ? new Date(0) : new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    setStartDate(days === null ? '' : toDateInput(start));
    setEndDate(days === null ? '' : toDateInput(end));
  };

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-[#E8DCC8] bg-white p-6 lg:flex-row lg:items-end lg:justify-between">
        <div><h2 className="text-2xl font-light">Customer Behavior Analytics</h2><p className="mt-1 text-sm text-[#6B5D4F]">Real customer chat activity from the selected period.</p></div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            {[['Today', 1], ['Last 7 Days', 7], ['Last 30 Days', 30], ['Last 90 Days', 90], ['All Time', null] as const].map(([label, days]) => (
              <button key={label} type="button" onClick={() => applyPreset(days)} className="rounded-lg border border-[#E8DCC8] px-3 py-2 text-xs text-[#6B5D4F] transition-colors hover:border-[#D4AF37] hover:text-black">{label}</button>
            ))}
          </div>
          <label className="text-xs text-[#6B5D4F]">From<input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 block rounded-lg border border-[#E8DCC8] px-3 py-2 text-sm" /></label>
          <label className="text-xs text-[#6B5D4F]">To<input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 block rounded-lg border border-[#E8DCC8] px-3 py-2 text-sm" /></label>
          <label className="text-xs text-[#6B5D4F]">Sentiment interval<select value={granularity} onChange={(event) => setGranularity(event.target.value as ChatAnalyticsGranularity)} className="mt-1 block rounded-lg border border-[#E8DCC8] px-3 py-2 text-sm"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        </div>
      </div>
      {loading && <div className="rounded-2xl border border-[#E8DCC8] bg-white p-8 text-sm text-[#6B5D4F]">Loading chat analytics...</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">{[
            ['Total Conversations', data.summary.totalConversations.toLocaleString()], ['Customer Messages', data.summary.totalCustomerMessages.toLocaleString()], ['Common Intent', data.summary.mostCommonIntent], ['Discussed Product', data.summary.mostDiscussedProduct], ['Positive Sentiment', `${data.summary.positiveSentimentPercentage}%`], ['Peak Chat Hour', data.summary.peakChatHour],
          ].map(([label, value]) => <div key={label} className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-4"><p className="text-xs text-[#6B5D4F]">{label}</p><p className="mt-2 break-words text-lg font-medium text-[#1A1A1A]">{value}</p></div>)}</div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {card('Top Customer Questions', data.topics.length ? <div className="h-[320px]"><Bar data={chartData(data.topics)} options={horizontalOptions} /></div> : empty)}
            {card('Customer Intent Distribution', data.intents.length ? <div className="h-[320px]"><Doughnut data={{ labels: data.intents.map((entry) => `${entry.label} (${entry.percentage}%)`), datasets: [{ data: data.intents.map((entry) => entry.count), backgroundColor: palette, borderColor: '#FFFFFF', borderWidth: 3 }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }} /></div> : empty)}
            {card('Customer Sentiment Over Time', data.sentimentOverTime.length ? <div className="h-[320px]"><Line data={{ labels: data.sentimentOverTime.map((entry) => entry.date), datasets: [{ label: 'Positive', data: data.sentimentOverTime.map((entry) => entry.positive), borderColor: '#6E8B78', backgroundColor: '#6E8B78', tension: 0.3 }, { label: 'Neutral', data: data.sentimentOverTime.map((entry) => entry.neutral), borderColor: '#D4AF37', backgroundColor: '#D4AF37', tension: 0.3 }, { label: 'Negative', data: data.sentimentOverTime.map((entry) => entry.negative), borderColor: '#B86A6A', backgroundColor: '#B86A6A', tension: 0.3 }] }} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }} /></div> : empty)}
            {card('Most Discussed Products', data.discussedProducts.length ? <div className="h-[320px]"><Bar data={chartData(data.discussedProducts.map((entry) => ({ label: entry.productName, count: entry.mentions })))} options={horizontalOptions} /></div> : empty)}
            {card('Conversation Length', data.conversationLength.length ? <div className="h-[320px]"><Bar data={chartData(data.conversationLength)} options={verticalOptions} /></div> : empty)}
            {card('Peak Chat Hours', data.peakChatHours.some((entry) => entry.count > 0) ? <div className="h-[320px]"><Bar data={chartData(data.peakChatHours)} options={verticalOptions} /></div> : empty)}
          </div>
        </>
      )}
    </div>
  );
}