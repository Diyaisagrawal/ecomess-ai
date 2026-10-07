'use client';

import { useEffect, useState } from 'react';
import { attendanceAPI, getErrorMessage } from '@/services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function AttendancePage() {
  const [stats, setStats] = useState<any>(null);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [reload, setReload] = useState(0);
  const [entry, setEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    mealType: 'LUNCH',
    count: '',
  });
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const saveAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(entry.count, 10);
    if (Number.isNaN(count) || count < 0) {
      setSaveMsg('Enter a valid head count');
      return;
    }
    try {
      await attendanceAPI.create({ date: entry.date, mealType: entry.mealType, count });
      setSaveMsg(`Saved ${count} for ${entry.mealType.toLowerCase()} on ${entry.date}`);
      setEntry((p) => ({ ...p, count: '' }));
      setReload((r) => r + 1);
    } catch (err) {
      setSaveMsg(getErrorMessage(err, 'Failed to save'));
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const endDate = new Date();

        const [statsRes, trendsRes] = await Promise.all([
          attendanceAPI.getStats(
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
          ),
          attendanceAPI.getTrends('attendance', days),
        ]);

        setStats(statsRes.data.data);
        setTrendData(trendsRes.data.data);
        setLoading(false);
      } catch (error) {
        console.error(error);
        setLoading(false);
      }
    };

    fetchData();
  }, [days, reload]);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Attendance Analytics</h1>
          <p className="text-gray-600 mt-2">Track attendance trends and patterns</p>
        </div>

        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="px-4 py-2 border border-gray-300 rounded-lg"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last year</option>
        </select>
      </div>

      {/* Log attendance */}
      <form onSubmit={saveAttendance} className="bg-white p-6 rounded-lg shadow flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input type="date" value={entry.date} onChange={(e) => setEntry({ ...entry, date: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Meal</label>
          <select value={entry.mealType} onChange={(e) => setEntry({ ...entry, mealType: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg">
            <option value="BREAKFAST">Breakfast</option>
            <option value="LUNCH">Lunch</option>
            <option value="DINNER">Dinner</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Head count</label>
          <input type="number" min={0} value={entry.count} onChange={(e) => setEntry({ ...entry, count: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg w-32" placeholder="e.g. 410" required />
        </div>
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
          Log attendance
        </button>
        {saveMsg && <p className="text-sm text-gray-600 w-full">{saveMsg}</p>}
      </form>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Total Attendance</h3>
            <p className="text-3xl font-bold text-blue-600 mt-2">{stats.totalAttendance}</p>
            <p className="text-xs text-gray-500 mt-1">{days} days</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Average Daily</h3>
            <p className="text-3xl font-bold text-blue-600 mt-2">{stats.averageDaily}</p>
            <p className="text-xs text-gray-500 mt-1">per day</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Trend</h3>
            <div className="mt-2">
              <span
                className={`text-3xl font-bold ${
                  stats.trend === 'UP'
                    ? 'text-green-600'
                    : stats.trend === 'DOWN'
                      ? 'text-red-600'
                      : 'text-gray-600'
                }`}
              >
                {stats.trend}
              </span>
              <p className="text-xs text-gray-500 mt-1">{stats.changePercent}% change</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">By Meal Type</h3>
            <div className="mt-2 space-y-1">
              <p className="text-xs">
                <span className="font-medium">Breakfast:</span> {stats.byMealType?.BREAKFAST || 0}
              </p>
              <p className="text-xs">
                <span className="font-medium">Lunch:</span> {stats.byMealType?.LUNCH || 0}
              </p>
              <p className="text-xs">
                <span className="font-medium">Dinner:</span> {stats.byMealType?.DINNER || 0}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Trend Chart */}
      {trendData.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Attendance Trend</h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                name="Attendance Count"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading data...</p>
          </div>
        </div>
      )}
    </div>
  );
}