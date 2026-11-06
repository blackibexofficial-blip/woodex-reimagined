/** Recharts trend — kept out of the main bundle; mounted only when ChartBlock is on a page. */
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const DATA = [
  { m: "Jun", visits: 182 }, { m: "Jul", visits: 205 }, { m: "Aug", visits: 244 },
  { m: "Sep", visits: 231 }, { m: "Oct", visits: 268 }, { m: "Nov", visits: 290 },
];

export default function ChartBlock({ kind }: { kind: string }) {
  const body = kind === "line" ? (
    <LineChart data={DATA} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e5e7eb)" />
      <XAxis dataKey="m" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} width={36} /><Tooltip />
      <Line type="monotone" dataKey="visits" stroke="#0C5B3F" strokeWidth={2.5} dot={{ r: 3 }} name="Showroom visits" />
    </LineChart>
  ) : (
    <BarChart data={DATA} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e5e7eb)" />
      <XAxis dataKey="m" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} width={36} /><Tooltip />
      <Bar dataKey="visits" fill="#0C5B3F" radius={[6, 6, 0, 0]} name="Showroom visits" />
    </BarChart>
  );
  return <div className="h-56 w-full rounded-xl border border-border bg-card p-4"><ResponsiveContainer width="100%" height="100%">{body}</ResponsiveContainer></div>;
}
