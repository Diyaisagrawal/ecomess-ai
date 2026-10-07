'use client';

import { useEffect } from 'react';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function DashboardPage() {
  const { dashboardMetrics, trendData, kpiData, fetchDashboard, fetchTrends, fetchKPI } =
    useAnalyticsStore();
  const { summary, fetchSummary } = useInventoryStore();

  useEffect(() => {
    fetchDashboard(30);
    fetchTrends('attendance', 30);
    fetchKPI();
    fetchSummary();
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Welcome to EcoMess AI Analytics</p>
      </div>

      {/* KPI Cards */}
      {kpiData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Today's Attendance</h3>
            <p className="text-3xl font-bold text-blue-600 mt-2">{kpiData.todayAttendance}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Today's Waste</h3>
            <p className="text-3xl font-bold text-orange-600 mt-2">
              {kpiData.todayWaste?.toFixed(2) || '0'} kg
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Monthly Attendance</h3>
            <p className="text-3xl font-bold text-green-600 mt-2">{kpiData.monthlyAttendance}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Monthly Waste</h3>
            <p className="text-3xl font-bold text-red-600 mt-2">
              {kpiData.monthlyWaste?.toFixed(2) || '0'} kg
            </p>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      {dashboardMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Attendance Stats */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Attendance Overview</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">Total Attendance (30 days)</span>
                  <span className="font-bold text-gray-900">
                    {dashboardMetrics.attendance.totalAttendance}
                  </span>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">Average Daily</span>
                  <span className="font-bold text-gray-900">
                    {dashboardMetrics.attendance.averageDaily.toFixed(0)}
                  </span>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">Trend</span>
                  <span
                    className={`font-bold ${
                      dashboardMetrics.attendance.trend === 'UP'
                        ? 'text-green-600'
                        : dashboardMetrics.attendance.trend === 'DOWN'
                          ? 'text-red-600'
                          : 'text-gray-600'
                    }`}
                  >
                    {dashboardMetrics.attendance.trend} (
                    {dashboardMetrics.attendance.changePercent.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Waste Stats */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Waste Overview</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">Total Waste (30 days)</span>
                  <span className="font-bold text-gray-900">
                    {dashboardMetrics.waste.total.toFixed(2)} kg
                  </span>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">Waste Percentage</span>
                  <span className="font-bold text-gray-900">
                    {dashboardMetrics.waste.percentage.toFixed(2)}%
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-red-600 h-2 rounded-full"
                  style={{ width: `${Math.min(dashboardMetrics.waste.percentage, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Status */}
      {summary && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Inventory Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-gray-600 mb-2">Total Items</p>
              <p className="text-2xl font-bold text-gray-900">{summary.totalItems}</p>
            </div>
            <div>
              <p className="text-gray-600 mb-2">Low Stock Items</p>
              <p className="text-2xl font-bold text-orange-600">{summary.lowStockCount}</p>
            </div>
            <div>
              <p className="text-gray-600 mb-2">Expiring Soon</p>
              <p className="text-2xl font-bold text-red-600">{summary.expiringCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Trend Chart */}
      {trendData.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Attendance Trend (30 days)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}